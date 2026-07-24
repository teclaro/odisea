#!/usr/bin/env python3
"""Genera data/taco.json con el indice TACO.

Replica del "Hormuz TACO Index" de Signum Global Advisors (grafico publico,
jul 2026): mide, en desviaciones estandar, la presion de mercado que
historicamente precede un giro de politica de Trump (umbral 2.3-3.4 sigma,
promedio 2.9). Signum lo define como "weighted z-score from 7-Mar baseline":
z-score de cada variable contra una linea base FIJA (7-mar-2026, inicio de la
guerra), con sigma de los 60 dias habiles previos, y promedio ponderado. Los
pesos no son publicos: se calibraron por minimos cuadrados contra los 7 puntos
anotados en el grafico publicado (ECM ~0.35 sigma).

Variables:
  - Brent (alza = presion)
  - Rendimiento del Tesoro USA a 10 anos (alza = presion)
  - S&P 500 (caida = presion)
  - Cruces por el Estrecho de Ormuz (caida = presion), combinando dos
    fuentes y priorizando siempre el dato mas reciente: el monitor publico
    de Lloyd's List Intelligence (diario, al dia, unidades canonicas) e IMF
    PortWatch (historia larga y respaldo; publica semanalmente con rezago).
    Donde ambas se superponen manda Lloyd's; la serie de PortWatch se
    reescala a unidades Lloyd's con la mediana del ratio del periodo comun.
    Se suaviza con promedio movil de 7 dias y se arrastra el ultimo valor
    conocido. Si ambas fuentes fallan, el indice usa los otros tres
    componentes.

Para cada serie: z_t = orientacion * (x_t - x_base) / sigma, con x_base el
nivel del ultimo dia habil <= BASELINE_DATE y sigma la desviacion estandar de
los WINDOW dias habiles previos a la base. Positivo = presion sobre Trump.
Indice = suma ponderada (WEIGHTS) de los z disponibles.

Solo usa la libreria estandar; fuentes: Stooq (CSV) con respaldo en Yahoo
Finance (JSON). Pensado para correr en GitHub Actions.
"""

import csv
import gzip
import io
import json
import re
import statistics
import sys
import urllib.request
from datetime import date, timedelta
from pathlib import Path

WINDOW = 60          # dias habiles para la sigma de la linea base
BASELINE_DATE = "2026-03-07"   # linea base fija de Signum (7-mar)
ROWS_FROM = "2026-03-02"       # el grafico de Signum cubre el episodio (guerra) desde marzo
WEIGHTS = {"brent": 0.52, "y10": 0.22, "spx": 0.05, "hormuz": 1.13}
HISTORY_DAYS = 900   # calendario: suficiente para la ventana previa a la base
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
LLOYDS_URL = "https://lmiu.lloydslist.com/strait-of-hormuz-transit-monitor.html"

PIVOTS = [
    {"date": "2026-03-22", "type": "dovish", "label": "Trump acepta dialogar",
     "label_en": "Trump agrees to talks"},
    {"date": "2026-04-07", "type": "dovish", "label": "Aceptacion del cese al fuego",
     "label_en": "Ceasefire accepted"},
    {"date": "2026-05-18", "type": "dovish", "label": "Trump frena ataque para negociar",
     "label_en": "Trump holds off attack to negotiate"},
    {"date": "2026-05-29", "type": "hawkish", "label": "Trump exige cambios al borrador del MoU",
     "label_en": "Trump demands edits to draft MoU"},
    {"date": "2026-06-11", "type": "dovish", "label": "Trump apura la firma del MoU",
     "label_en": "Trump rushes MoU finalization"},
    {"date": "2026-07-07", "type": "hawkish", "label": "EE.UU. retira el waiver petrolero",
     "label_en": "US pulls oil waiver"},
]


def http_get(url, timeout=30):
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (taco-index)"})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        payload = resp.read()
        if resp.headers.get("Content-Encoding", "").lower() == "gzip":
            payload = gzip.decompress(payload)
        return payload.decode("utf-8", errors="replace")


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


def fetch_lloyds_hormuz():
    """Cruces diarios por Ormuz desde el monitor publico de Lloyd's List.

    La pagina embebe un JSON (INJECTED_DATA) con hechos por fecha; se agrega
    el total diario y el detalle del ultimo dia (dark / flota fantasma /
    vinculo con Iran).
    """
    html = http_get(LLOYDS_URL, timeout=60)
    m = re.search(r"INJECTED_DATA\s*=\s*(\{.*?\});\s*(?:const|let|var|window|</)",
                  html, flags=re.DOTALL)
    if not m:
        raise RuntimeError("Lloyd's: INJECTED_DATA no encontrado en la pagina")
    facts = json.loads(m.group(1)).get("facts", [])
    daily, detail = {}, {}
    for f in facts:
        d, n = f.get("d"), int(f.get("n") or 0)
        if not d or len(str(d)) != 10:
            continue
        d = str(d)
        daily[d] = daily.get(d, 0.0) + n
        det = detail.setdefault(d, {"dark": 0, "shadow": 0, "iran": 0})
        if f.get("tt") == "Dark Transit":
            det["dark"] += n
        if f.get("sf") == "Y":
            det["shadow"] += n
        if f.get("irntso") == "Y":
            det["iran"] += n
    if len(daily) < 30:
        raise RuntimeError(f"Lloyd's: pocos dias ({len(daily)})")
    last = max(daily)
    print(f"hormuz: lloydslist -> {len(daily)} dias, ultimo {last} "
          f"({daily[last]:.0f} transitos)")
    today = {"date": last, "total": round(daily[last]), **detail[last]}
    return daily, today


def combine_hormuz(lloyds, portwatch):
    """Empalma ambas series priorizando el dato mas reciente (Lloyd's).

    Unidades canonicas: Lloyd's. PortWatch aporta la historia previa,
    reescalada con la mediana del ratio de los dias comunes; en los dias
    donde ambas existen manda Lloyd's, que es diaria y esta al dia.
    """
    if not lloyds:
        return portwatch, ["portwatch"]
    if not portwatch:
        return lloyds, ["lloydslist"]
    common = [d for d in lloyds if d in portwatch
              and lloyds[d] > 0 and portwatch[d] > 0]
    k = (statistics.median(lloyds[d] / portwatch[d] for d in common)
         if len(common) >= 10 else 1.0)
    out = {d: v * k for d, v in portwatch.items()}
    out.update(lloyds)
    print(f"hormuz: empalme lloydslist+portwatch (ratio x{k:.3f}, "
          f"{len(common)} dias comunes)")
    return out, ["lloydslist", "portwatch"]


def fetch_portwatch_hormuz(d1):
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
            # ArcGIS entrega la fecha como epoch (ms o s) o como texto ISO
            if isinstance(ts, (int, float)):
                key = date.fromtimestamp(ts / 1000 if ts > 1e11 else ts).isoformat()
            else:
                key = str(ts)[:10]
                if len(key) != 10 or key[4] != "-":
                    continue
            out[key] = float(n)
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


def fixed_z(values, bi, direction):
    """z-score contra la linea base fija: (x - x[bi]) / sigma(ventana previa)."""
    ref = values[bi]
    win = [v for v in values[max(0, bi - WINDOW):bi] if v is not None]
    if ref is None or len(win) < 20:
        raise RuntimeError("historia insuficiente antes de la linea base")
    sd = statistics.pstdev(win)
    if sd <= 1e-12:
        raise RuntimeError("desviacion estandar nula en la ventana base")
    return [None if v is None else direction * (v - ref) / sd for v in values]


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

    base_dates = [d for d in dates if d <= BASELINE_DATE]
    if not base_dates:
        raise RuntimeError("sin datos hasta la fecha de la linea base")
    bi = dates.index(base_dates[-1])
    print(f"linea base: {dates[bi]} (sigma de {WINDOW} dias previos)")

    zs = {}
    for name, (_, _, direction) in SERIES.items():
        zs[name] = fixed_z(levels[name], bi, direction)

    # Cuarto componente: cruces por Ormuz (Lloyd's List + PortWatch), opcional
    components = list(SERIES)
    hormuz_last = None
    hormuz_sources = []
    hormuz_today = None
    lloyds = portwatch = None
    try:
        lloyds, hormuz_today = fetch_lloyds_hormuz()
    except Exception as exc:
        print(f"hormuz: lloydslist fallo ({exc})")
    try:
        portwatch = fetch_portwatch_hormuz(d1)
    except Exception as exc:
        print(f"hormuz: portwatch fallo ({exc})")
    try:
        combined, hormuz_sources = combine_hormuz(lloyds, portwatch)
        if not combined:
            raise RuntimeError("sin datos de ninguna fuente")
        combined = {d: v for d, v in combined.items() if d >= d1.isoformat()}
        hz = smooth7(combined)
        hormuz_last = max(hz)
        hz_days = sorted(hz)
        ff, j, lastv = [], 0, None      # forward-fill a las fechas de mercado
        for d in dates:
            while j < len(hz_days) and hz_days[j] <= d:
                lastv = hz[hz_days[j]]
                j += 1
            ff.append(lastv)
        levels["hormuz"] = ff
        zs["hormuz"] = fixed_z(ff, bi, -1)
        components.append("hormuz")
    except Exception as exc:
        print(f"hormuz: excluido de esta corrida ({exc})")
        hormuz_sources = []
        hormuz_today = None

    rows = []
    for i, d in enumerate(dates):
        if d < ROWS_FROM:
            continue
        row = {
            "date": d,
            **{f"z_{name}": round(zs[name][i], 3) for name in SERIES},
            **{name: round(levels[name][i], 3) for name in SERIES},
        }
        if "hormuz" in components and zs["hormuz"][i] is not None:
            row["z_hormuz"] = round(zs["hormuz"][i], 3)
            row["hormuz"] = round(levels["hormuz"][i], 1)
        taco = sum(WEIGHTS[n] * zs[n][i]
                   for n in components if zs[n][i] is not None)
        row["taco"] = round(taco, 3)
        rows.append(row)

    payload = {
        "updated": d2.isoformat(),
        "window": WINDOW,
        "baseline": dates[bi],
        "weights": WEIGHTS,
        "thresholds": {"low": 2.3, "avg": 2.9, "high": 3.4},
        "pivots": PIVOTS,
        "components": components,
        "hormuz_last": hormuz_last,
        "hormuz_sources": hormuz_sources,
        "hormuz_today": hormuz_today,
        "note": ("Basado en el Hormuz TACO Index de Signum Global "
                 "Advisors: z ponderado contra linea base fija del 7-mar-2026, "
                 "pesos calibrados contra su grafico publicado. Ormuz: Lloyd's "
                 "List (diario) + IMF PortWatch (respaldo), promedio movil 7d. "
                 "Solo con fines educativos; no es asesoria de inversion."),
        "rows": rows,
    }
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(payload, separators=(",", ":")) + "\n")
    print(f"OK: {len(rows)} filas -> {OUTPUT} (ultimo: {rows[-1]['date']}, "
          f"TACO={rows[-1]['taco']})")


if __name__ == "__main__":
    sys.exit(main())
