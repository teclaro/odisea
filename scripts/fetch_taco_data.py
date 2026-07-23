#!/usr/bin/env python3
"""Genera data/taco.json con el indice TACO.

Replica no oficial del "TACO index" de Signum Global Advisors descrito por
MarketWatch (jul 2026): mide, en desviaciones estandar, la presion de mercado
que historicamente precede un giro de politica de Trump (umbral 2.3-3.4 sigma,
promedio 2.9).

Variables (la original usa ademas cruces de tanqueros por Ormuz, sin fuente
publica gratuita, por lo que aqui se excluye):
  - Brent (alza = presion)
  - Rendimiento del Tesoro USA a 10 anos (alza = presion)
  - S&P 500 (caida = presion)

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
    if yahoo_symbol == "^TNX":  # ^TNX viene multiplicado por 10
        data = {k: v / 10.0 for k, v in data.items()}
    print(f"{name}: yahoo {yahoo_symbol} -> {len(data)} puntos")
    if len(data) < 200:
        raise RuntimeError(f"{name}: datos insuficientes ({len(data)} puntos)")
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

    dates = sorted(set.intersection(*(set(s) for s in raw.values())))
    if len(dates) < WINDOW + 30:
        raise RuntimeError(f"Solo {len(dates)} fechas comunes entre las series")

    levels = {name: [raw[name][d] for d in dates] for name in SERIES}
    zs = {}
    for name, (_, _, direction) in SERIES.items():
        zs[name] = [None if z is None else direction * z
                    for z in rolling_z(levels[name], WINDOW)]

    rows = []
    for i, d in enumerate(dates):
        comps = [zs[name][i] for name in SERIES]
        if any(z is None for z in comps):
            continue
        rows.append({
            "date": d,
            "taco": round(statistics.fmean(comps), 3),
            **{f"z_{name}": round(zs[name][i], 3) for name in SERIES},
            **{name: round(levels[name][i], 3) for name in SERIES},
        })

    payload = {
        "updated": d2.isoformat(),
        "window": WINDOW,
        "thresholds": {"low": 2.3, "avg": 2.9, "high": 3.4},
        "pivots": PIVOTS,
        "note": ("Replica no oficial del indice TACO de Signum Global Advisors. "
                 "Excluye los cruces por el Estrecho de Ormuz (sin fuente publica). "
                 "Solo con fines educativos; no es asesoria de inversion."),
        "rows": rows,
    }
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(payload, separators=(",", ":")) + "\n")
    print(f"OK: {len(rows)} filas -> {OUTPUT} (ultimo: {rows[-1]['date']}, "
          f"TACO={rows[-1]['taco']})")


if __name__ == "__main__":
    sys.exit(main())
