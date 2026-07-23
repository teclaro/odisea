#!/usr/bin/env python3
"""Genera data/taco.json con el indice TACO.

Replica no oficial del "TACO index" de Signum Global Advisors descrito por
MarketWatch (jul 2026): mide, en desviaciones estandar, la presion de mercado
que historicamente precede un giro de politica de Trump (umbral 2.3-3.4 sigma,
promedio 2.9).

Variables:
  - Brent (alza = presion)
  - Rendimiento del Tesoro USA a 10 anos (alza = presion)
  - S&P 500 (caida = presion)
  - Cruces por el Estrecho de Ormuz, IMF PortWatch (caida = presion).
    PortWatch publica datos diarios con actualizacion semanal (martes), asi
    que este componente llega con algunos dias de rezago: se suaviza con un
    promedio movil de 7 dias y se arrastra el ultimo valor conocido. Si la
    fuente falla, el indice se calcula con los otros tres componentes.

Para cada serie se calcula el z-score del nivel actual contra la media y
desviacion estandar moviles de los WINDOW dias habiles previos, orientado para
que positivo = presion. El indice es el promedio de los tres z-scores.

Solo usa la libreria estandar; fuentes: Stooq (CSV) con respaldo en Yahoo
Finance (JSON). Pensado para correr en GitHub Actions.
"""

import csv
import io
import json
import statistics
import sys
import urllib.request
from datetime import date, timedelta
from pathlib import Path

WINDOW = 60          # dias habiles para media/desviacion movil
HISTORY_DAYS = 900   # calendario: suficiente para ventana + ~2 anos de indice
OUTPUT = Path(__file__).resolve().parent.parent / "data" / "taco.json"

SERIES = {
    # nombre: (simbolos stooq, simbolo yahoo, orientacion: +1 alza=presion)
    "brent": (["cb.f"], "BZ=F", +1),
    "y10":   (["10usy.b", "10yusy.b"], "^TNX", +1),
    "spx":   (["^spx"], "^GSPC", -1),
}

PORTWATCH_URL = ("https://services9.arcgis.com/weJ1QsnbMYJlCHdG/arcgis/rest/"
                 "services/Daily_Chokepoints_Data/FeatureServer/0/query")
HORMUZ_ID = "chokepoint6"

PIVOTS = [
    {"date": "2026-03-22", "label": "Giro hacia negociaciones de cese al fuego"},
    {"date": "2026-04-07", "label": "Aceptacion del cese al fuego"},
    {"date": "2026-05-18", "label": "Memorando de entendimiento"},
]


def http_get(url, timeout=30):
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (taco-index)"})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.read().decode("utf-8", errors="replace")


def fetch_stooq(symbol, d1, d2):
    url = f"https://stooq.com/q/d/l/?s={symbol}&i=d&d1={d1:%Y%m%d}&d2={d2:%Y%m%d}"
    text = http_get(url)
    out = {}
    for row in csv.DictReader(io.StringIO(text)):
        try:
            out[row["Date"]] = float(row["Close"])
        except (KeyError, TypeError, ValueError):
            continue
    return out


def fetch_yahoo(symbol, d1, d2):
    from urllib.parse import quote
    url = (f"https://query1.finance.yahoo.com/v8/finance/chart/{quote(symbol)}"
           f"?interval=1d&period1={int(__import__('time').mktime(d1.timetuple()))}"
           f"&period2={int(__import__('time').mktime(d2.timetuple()))}")
    data = json.loads(http_get(url))
    result = data["chart"]["result"][0]
    stamps = result.get("timestamp") or []
    closes = result["indicators"]["quote"][0].get("close") or []
    out = {}
    for ts, close in zip(stamps, closes):
        if close is not None:
            out[date.fromtimestamp(ts).isoformat()] = float(close)
    return out


def fetch_series(name, stooq_symbols, yahoo_symbol, d1, d2):
    for sym in stooq_symbols:
        try:
            data = fetch_stooq(sym, d1, d2)
            if len(data) >= 200:
                print(f"{name}: stooq {sym} -> {len(data)} puntos")
                return data
            print(f"{name}: stooq {sym} devolvio solo {len(data)} puntos")
        except Exception as exc:
            print(f"{name}: stooq {sym} fallo: {exc}")
    data = fetch_yahoo(yahoo_symbol, d1, d2)
    print(f"{name}: yahoo {yahoo_symbol} -> {len(data)} puntos")
    if len(data) < 200:
        raise RuntimeError(f"{name}: datos insuficientes ({len(data)} puntos)")
    return data


def fetch_hormuz(d1):
    """Cruces diarios por Ormuz desde IMF PortWatch (ArcGIS FeatureServer)."""
    from urllib.parse import urlencode
    out, offset = {}, 0
    count_field = None
    while True:
        params = urlencode({
            "where": f"portid = '{HORMUZ_ID}' AND date >= DATE '{d1:%Y-%m-%d}'",
            "outFields": "*", "orderByFields": "date",
            "resultOffset": offset, "resultRecordCount": 1000,
            "returnGeometry": "false", "f": "json",
        })
        data = json.loads(http_get(f"{PORTWATCH_URL}?{params}", timeout=60))
        if "error" in data:
            raise RuntimeError(f"PortWatch: {data['error']}")
        feats = data.get("features", [])
        if not feats:
            break
        if count_field is None:
            attrs = feats[0]["attributes"]
            for cand in ("n_total", "transit_calls", "n_transit"):
                if cand in attrs:
                    count_field = cand
                    break
            if count_field is None:
                raise RuntimeError(f"PortWatch: campo de conteo no hallado en {sorted(attrs)}")
        for f in feats:
            a = f["attributes"]
            ts, n = a.get("date"), a.get(count_field)
            if ts is None or n is None:
                continue
            out[date.fromtimestamp(ts / 1000).isoformat()] = float(n)
        if not data.get("exceededTransferLimit") and len(feats) < 1000:
            break
        offset += len(feats)
    print(f"hormuz: portwatch ({count_field}) -> {len(out)} puntos"
          + (f", ultimo {max(out)}" if out else ""))
    if len(out) < 200:
        raise RuntimeError(f"hormuz: datos insuficientes ({len(out)} puntos)")
    return out


def smooth7(data):
    """Promedio movil de 7 dias calendario sobre un dict fecha->valor."""
    days = sorted(data)
    vals = [data[d] for d in days]
    out = {}
    for i, d in enumerate(days):
        window = vals[max(0, i - 6):i + 1]
        out[d] = statistics.fmean(window)
    return out


def normalize_yield(data):
    """Lleva el rendimiento a escala porcentual (~1-20).

    Las fuentes difieren en escala: ^TNX de Yahoo viene multiplicado por 10 y
    algunos simbolos vienen divididos por 10. El z-score es invariante a la
    escala, pero el nivel mostrado en la pagina debe ser el porcentaje real.
    """
    recent = [data[k] for k in sorted(data)[-20:]]
    m = statistics.median(recent)
    scale = 1.0
    while m * scale < 1.0:
        scale *= 10.0
    while m * scale > 20.0:
        scale /= 10.0
    if scale != 1.0:
        print(f"y10: escala corregida x{scale:g} (mediana {m:g} -> {m*scale:g}%)")
        return {k: v * scale for k, v in data.items()}
    return data


def rolling_z(values, window):
    """z-score de values[i] contra los `window` valores previos (sin incluirlo)."""
    zs = [None] * len(values)
    for i in range(window, len(values)):
        prev = values[i - window:i]
        mean = statistics.fmean(prev)
        sd = statistics.pstdev(prev)
        if sd > 1e-12:
            zs[i] = (values[i] - mean) / sd
    return zs


def main():
    d2 = date.today()
    d1 = d2 - timedelta(days=HISTORY_DAYS)

    raw = {name: fetch_series(name, st, ya, d1, d2)
           for name, (st, ya, _) in SERIES.items()}
    raw["y10"] = normalize_yield(raw["y10"])

    dates = sorted(set.intersection(*(set(s) for s in raw.values())))
    if len(dates) < WINDOW + 30:
        raise RuntimeError(f"Solo {len(dates)} fechas comunes entre las series")

    levels = {name: [raw[name][d] for d in dates] for name in SERIES}
    zs = {}
    for name, (_, _, direction) in SERIES.items():
        zs[name] = [None if z is None else direction * z
                    for z in rolling_z(levels[name], WINDOW)]

    # Cuarto componente: cruces por Ormuz (IMF PortWatch), opcional
    components = list(SERIES)
    hormuz_last = None
    try:
        hz = smooth7(fetch_hormuz(d1))
        hormuz_last = max(hz)
        hz_days = sorted(hz)
        ff, j, lastv = [], 0, None      # forward-fill a las fechas de mercado
        for d in dates:
            while j < len(hz_days) and hz_days[j] <= d:
                lastv = hz[hz_days[j]]
                j += 1
            ff.append(lastv)
        first = next((i for i, v in enumerate(ff) if v is not None), len(ff))
        z_h = [None] * len(dates)
        for k, z in enumerate(rolling_z(ff[first:], WINDOW)):
            z_h[first + k] = None if z is None else -1 * z
        levels["hormuz"] = ff
        zs["hormuz"] = z_h
        components.append("hormuz")
    except Exception as exc:
        print(f"hormuz: excluido de esta corrida ({exc})")

    rows = []
    for i, d in enumerate(dates):
        market = [zs[name][i] for name in SERIES]
        if any(z is None for z in market):
            continue
        comps = list(market)
        row = {
            "date": d,
            **{f"z_{name}": round(zs[name][i], 3) for name in SERIES},
            **{name: round(levels[name][i], 3) for name in SERIES},
        }
        if "hormuz" in components and zs["hormuz"][i] is not None:
            comps.append(zs["hormuz"][i])
            row["z_hormuz"] = round(zs["hormuz"][i], 3)
            row["hormuz"] = round(levels["hormuz"][i], 1)
        row["taco"] = round(statistics.fmean(comps), 3)
        rows.append(row)

    payload = {
        "updated": d2.isoformat(),
        "window": WINDOW,
        "thresholds": {"low": 2.3, "avg": 2.9, "high": 3.4},
        "pivots": PIVOTS,
        "components": components,
        "hormuz_last": hormuz_last,
        "note": ("Replica no oficial del indice TACO de Signum Global Advisors. "
                 "Cruces por Ormuz: IMF PortWatch (promedio movil 7d, rezago "
                 "semanal). Solo con fines educativos; no es asesoria de inversion."),
        "rows": rows,
    }
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(payload, separators=(",", ":")) + "\n")
    print(f"OK: {len(rows)} filas -> {OUTPUT} (ultimo: {rows[-1]['date']}, "
          f"TACO={rows[-1]['taco']})")


if __name__ == "__main__":
    sys.exit(main())
