# El mapa RRG en el HUB — cómo lo armamos

Especificación de construcción del gráfico de rotación relativa (RRG) para el
HUB: fórmula, pipeline de datos, render y medidas. Está escrita con las mismas
secciones que `RRG_calibrado_para_HUB.md` para poder compararlas una a una. La
diferencia de alcance es deliberada:

- **El calibrado** responde *qué números son los correctos* (fórmula contra el
  oficial de Julius de Kempenaer, con su validación).
- **Este** responde *cómo se arma el mapa* (parametrización, datos, dibujo, UI)
  y toma los números del calibrado como su configuración por defecto.

No reemplaza al calibrado: lo envuelve.

## La fórmula (familia parametrizada)

En vez de fijar una fórmula, el HUB implementa la familia que las contiene a
todas y expone los parámetros. Con cierres diarios del activo `c` y de la
referencia `b`:

```
ratio = c / b                              (diario)
[marco]  diario, o cierre semanal del viernes
RS    = EMA_a(ratio)                       a = suavizado del ratio
X     = EMA_c( 100 · RS / MA_b(RS) )       b = ventana de normalización
Y     = 100 · X / MA_d(X)                  d = ventana del momentum
```

Parámetros: `a`, `b`, `c`, `d`, el tipo de media de normalización
(`SMA` | `EMA`) y el marco (`W-FRI` | diario).

| Preset | a | MA | b | c | d | Nota |
|---|---|---|---|---|---|---|
| **`calibrado` (por defecto)** | EMA 8 | SMA | 22 | EMA 6 | SMA 10 | El del MD calibrado. No necesita reescalar. |
| `publica` | — (1) | EMA | 10 | — (1) | EMA 5 | La que circula. Medida: 0/6 cuadrantes, error medio 5,3. |
| `zscore` | — (1) | SMA | 20 | — (1) | 10 | `X = 101 + z(RS − SMA_b)`, `Y = 101 + z(X − SMA_d)`. Requiere reescalar; ~4× más lejos del oficial. |

Los presets no calibrados quedan en el código **solo como banco de pruebas**
(para reproducir el diff contra el oficial), nunca como opción de pantalla. La
UI no ofrece elegir fórmula: muestra una sola, la calibrada.

Convenciones que hay que respetar o los números no reproducen:

- EMA con `span=n`, `adjust=False` → α = 2/(n+1), **sembrada en el primer valor
  válido** (después de descartar el calentamiento de la media, igual que el
  `.dropna()` del pandas de referencia).
- Semana cerrada el viernes: el bin es `(viernes anterior, este viernes]` y se
  toma la **última** observación del bin (si el viernes es feriado, queda el
  jueves). Equivale a `resample("W-FRI").last()`.
- La referencia se reindexa al calendario del activo con `ffill` antes de
  dividir.
- Historia mínima 40 semanas (8 + 22 + 10) para que las medias se calienten;
  el script pide ~5 años y recorta al final.

### Implementación de referencia (JS, vanilla — la que corre en el HUB)

El HUB no tiene build ni dependencias, así que el cálculo vive en JS junto al
render. El Python del MD calibrado queda como **oráculo**: el test compara
ambos y tienen que coincidir a 1e-9.

```js
// rrg-core.js — mismas convenciones que el pandas de referencia.
const ema = (xs, span) => {                 // adjust=False, sembrada en xs[0]
  if (span <= 1) return xs.slice();
  const a = 2 / (span + 1);
  const out = [xs[0]];
  for (let i = 1; i < xs.length; i++) out.push(a * xs[i] + (1 - a) * out[i - 1]);
  return out;
};

const sma = (xs, n) => {                    // NaN durante el calentamiento
  const out = []; let acc = 0;
  for (let i = 0; i < xs.length; i++) {
    acc += xs[i];
    if (i >= n) acc -= xs[i - n];
    out.push(i >= n - 1 ? acc / n : NaN);
  }
  return out;
};

// bin (viernes anterior, este viernes] -> ultima observacion. Requiere fechas asc.
const weeklyFri = (dates, vals) => {
  const m = new Map();
  for (let i = 0; i < dates.length; i++) {
    if (!Number.isFinite(vals[i])) continue;
    const d = new Date(dates[i] + "T12:00:00Z");
    d.setUTCDate(d.getUTCDate() + ((5 - d.getUTCDay() + 7) % 7));  // 5 = viernes
    m.set(d.toISOString().slice(0, 10), vals[i]);                  // el ultimo gana
  }
  const labels = [...m.keys()].sort();
  return { labels, vals: labels.map((k) => m.get(k)) };
};

const dropHead = (xs, labels) => {          // descarta el calentamiento (el .dropna())
  let i = 0;
  while (i < xs.length && !Number.isFinite(xs[i])) i++;
  return { xs: xs.slice(i), labels: labels.slice(i) };
};

// c, b: cierres diarios alineados a `dates`. Devuelve {labels, x, y}.
function rrg(dates, c, b, P = { a: 8, b: 22, c: 6, d: 10, ma: "SMA", weekly: true }) {
  const ratio = c.map((v, i) => (Number.isFinite(v) && b[i] > 0 ? v / b[i] : NaN));
  const w = P.weekly ? weeklyFri(dates, ratio)
                     : { labels: dates.filter((_, i) => Number.isFinite(ratio[i])),
                         vals: ratio.filter(Number.isFinite) };

  const rs = ema(w.vals, P.a);
  const norm = P.ma === "EMA" ? ema(rs, P.b) : sma(rs, P.b);

  let step = dropHead(rs.map((v, i) => 100 * v / norm[i]), w.labels);
  const x = ema(step.xs, P.c);

  const mom = sma(x, P.d);
  step = dropHead(x.map((v, i) => 100 * v / mom[i]), step.labels);
  const y = step.xs;

  // X alineado al indice de Y (el .loc[y.index] del pandas)
  const off = x.length - y.length;
  return { labels: step.labels, x: x.slice(off), y };
}
```

Guardamos **27 puntos** por activo (26 semanas + la actual) y en pantalla se
elige la cola: 4 / 6 / 8 / 10 / 13 / 26.

## Cuadrantes

| X (RS-Ratio) | Y (RS-Momentum) | Cuadrante | Color |
|---|---|---|---|
| ≥ 100 | ≥ 100 | Liderando | `--rrg-lead` (verde) |
| ≥ 100 | < 100 | Debilitando | `--rrg-weak` (amarillo) |
| < 100 | ≥ 100 | Mejorando | `--rrg-improve` (azul) |
| < 100 | < 100 | Rezagado | `--rrg-lag` (rojo) |

Rotación normal en sentido del reloj: Mejorando → Liderando → Debilitando →
Rezagado. El corte es exactamente 100 en los dos ejes, sin zona muerta: lo que
cae pegado a la cruz se marca en la UI (ver más abajo), no se reclasifica.

## Medidas sobre la cola

Se adoptan **tal cual** las del MD calibrado, para que las dos
implementaciones sean comparables sin traducir nada:

- **Rumbo**: `(atan2(dx, dy) · 180/π + 360) mod 360`, grados de brújula
  (0° = arriba, 90° = derecha). Ojo con el orden: `atan2(dx, dy)`.
- **Distancia al centro**: `hypot(X − 100, Y − 100)`.
- **Velocidad**: `hypot(ΔX, ΔY)` del último tramo.
- **Ángulo de posición**: brújula sobre `(X − 100, Y − 100)`.

Se calculan **en el cliente**, no en el JSON, porque dependen del largo de cola
que el usuario elige con el slider.

## Señales

Las mismas cinco del MD calibrado (espiral alcista, espiral bajista,
Debilitando con rumbo 0–90°, Mejorando con rumbo 180–270°, giro a 0–90° o a
180–270° esta semana), con dos reglas de presentación propias del HUB:

- Se muestran como **lectura**, con la etiqueta "no medido fuera de muestra"
  visible en el panel, no escondida en un tooltip.
- La espiral se evalúa sobre la **cola completa guardada (27)**, no sobre la
  cola visible: cambiar el slider no debe inventar ni borrar señales.

## Pipeline de datos

Esto no está en el MD calibrado y es la mitad del trabajo.

`scripts/fetch_rrg_data.py` → `data/rrg.json`, mismo molde que
`fetch_taco_data.py`: stdlib pura, FMP si hay `FMP_API_KEY` con respaldo en
Stooq y Yahoo, corre en GitHub Actions.

```json
{
  "updated": "2026-10-28",
  "frame": "W-FRI",
  "params": { "rs_ema": 8, "norm_sma": 22, "x_ema": 6, "mom_sma": 10 },
  "universes": [
    { "id": "sectores", "bench": "SPY", "label": "Sectores SPDR vs SPY" },
    { "id": "cripto",   "bench": "BTC-USD", "label": "Cripto vs BTC" }
  ],
  "weeks": ["2026-04-24", "2026-05-01", "..."],
  "assets": [
    { "universe": "sectores", "sym": "XLK", "name": "Tecnología",
      "x": [99.8, 100.2, "..."], "y": [100.4, 100.1, "..."],
      "bench_proxy": null }
  ]
}
```

Decisiones del pipeline:

- **X e Y se precalculan en Python** (el oráculo) y el JS solo los dibuja; el
  JS de `rrg()` existe para el modo diario y para el test de paridad. Una sola
  fórmula, dos implementaciones, un test que las amarra.
- `weeks` es global y todos los activos se alinean a él; el que no tenga dato
  en una semana lleva `null` y la cola se corta ahí (no se interpola).
- `bench_proxy` documenta el empalme cuando se usa índice `^SP500-xx` y hubo
  que calentar las medias con el ETF (ver *Ojo con esto*).
- Un activo con menos de 40 semanas no se publica: queda fuera del JSON con su
  razón en `skipped`, para que la pantalla no muestre un punto sin calentar.

## Render en el HUB

Reutiliza la infraestructura de `taco-core.js` y respeta su contrato: el motor
lee los colores de chrome por variables CSS alias que cada página declara sobre
su propio tema. Se agregan cuatro al set existente:

```
--rrg-lead  --rrg-weak  --rrg-improve  --rrg-lag
```

El gráfico es un `<svg>` dibujado con el mismo helper `el()` y el `tagText()`
de placa de fondo. Lo específico del RRG:

- **Escala simétrica**: `pad = max(|v − 100|) · 1,12` sobre todos los puntos
  visibles, con piso de 1,5 para que un mapa comprimido no se vea como ruido
  amplificado. Misma escala en los dos ejes: el RRG es un plano, no dos series,
  y estirar un eje deforma el rumbo.
- **Eje Y invertido** respecto del SVG (en SVG `y` crece hacia abajo); el 100
  va al centro.
- **Cola**: polilínea con grosor y opacidad creciendo hacia el presente, punto
  final relleno con la etiqueta del símbolo. Flecha en el último tramo.
- **Pegado a la cruz**: si `|X − 100| < 0,25` o `|Y − 100| < 0,25`, el punto va
  con anillo hueco en vez de relleno, y el tooltip dice que el oficial puede
  clasificarlo en otro cuadrante.
- **Interacción**: `attachSeriesHighlight` de `taco-core.js` para el cruce
  tile/leyenda → gráfico, ya resuelto ahí. Hover sobre la cola muestra semana,
  X, Y, cuadrante, rumbo y velocidad.
- Controles: selector de universo, slider de cola (4/6/8/10/13/26) y toggle
  semanal/diario. Nada más: la fórmula no se toca desde la UI.
- Accesibilidad: el cuadrante nunca se comunica solo por color — va el nombre
  en la tabla y en el tooltip. La tabla de abajo (símbolo, X, Y, cuadrante,
  rumbo, distancia, velocidad, señales) es la versión navegable del mapa.

## Ojo con esto

Los cuatro primeros son los del MD calibrado y siguen valiendo igual:

- **ETF vs índice**: el oficial usa los índices sectoriales del S&P
  (`^SP500-xx`); con los ETF (XLK, XLE, …) queda más lejos por los topes de
  peso, sobre todo XLK y XLC.
- Yahoo no tiene historia larga de `^SP500-xx` (salvo inmobiliario; energía es
  `^GSPE`): hay que calentar las medias con el ETF y registrarlo en
  `bench_proxy`.
- Lo pegado a la cruz puede caer en otro cuadrante que el oficial: es ruido.
- El marco **semanal manda** para decidir; el diario afina el momento.

Y los que agrega el armado:

- **Splits y dividendos**: el ratio tiene que calcularse sobre cierres
  ajustados en las dos patas, o un split del activo mete un salto que la
  fórmula lee como rotación. Si una fuente da ajustado y la otra no, se
  descarta la mezcla.
- **Calendarios distintos**: cripto cotiza 7 días y SPY no. Con referencia BTC
  no hay problema (ambos 7 días), pero cripto vs SPY exige recortar al
  calendario de SPY antes de dividir, no `ffill` del activo.
- **Reproducibilidad de la semana en curso**: el punto de la semana sin cerrar
  se mueve todos los días. Se dibuja distinto (anillo hueco + "en curso") y no
  dispara señales.
- **Paridad JS/Python**: el test es `pytest` + Node comparando ambas salidas a
  1e-9 sobre un fixture congelado de precios. El sembrado de la EMA y el bin
  del viernes son los dos lugares donde esto se rompe.
  *Estado: corrido sobre un fixture sintético de 974 días (169 semanas) → 0
  diferencia en X e Y y etiquetas de semana idénticas. El JS se extrajo del
  bloque de código de este MD, así que lo testeado es el texto. Salvedad: en
  este entorno no había pandas, así que el lado Python fue una réplica en
  stdlib de su semántica (`ewm adjust=False` sembrada en el primer válido,
  `resample("W-FRI").last()`, `dropna`); falta correrlo contra pandas de
  verdad y contra precios reales.*
- **NaN en el medio**: el `.ewm()` del pandas de referencia corre **antes** del
  `.dropna()`. Con NaN solo al principio da lo mismo que descartarlos primero
  (que es lo que hace el JS), pero con un hueco **interior** las dos versiones
  se separan. Por eso el pipeline no interpola: corta la cola.
- Los datos de RRG Online se usaron **solo para calibrar**: no se publican ni
  entran al repo, y el JSON no debe contenerlos.

## Diff contra el MD calibrado

| Tema | Calibrado | Este | Estado |
|---|---|---|---|
| Fórmula | Fija: EMA8 / SMA22 / EMA6 / SMA10 | Misma, como preset por defecto de una familia parametrizada | **Idéntico** en números |
| Implementación | pandas | JS vanilla + Python como oráculo, amarrados por test de paridad | Agregado |
| Cuadrantes | Tabla 100/100 | Misma + regla de "pegado a la cruz" en pantalla | Compatible |
| Medidas de cola | Rumbo brújula, distancia, velocidad, ángulo | Adoptadas tal cual, calculadas en cliente | **Idéntico** |
| Señales | Cinco, sin medir fuera de muestra | Mismas, evaluadas sobre la cola guardada y etiquetadas como no medidas | Compatible |
| Validación | 3 rondas contra el oficial, 93,6% cuadrante semanal | **No repetida acá**: se hereda. Lo único que este MD exige probar es la paridad JS↔Python | Paridad OK (0 diferencia); contra el oficial, pendiente |
| Datos | Fuera de alcance | `fetch_rrg_data.py` → `data/rrg.json`, Actions, stdlib pura | Agregado |
| Render / UI | Fuera de alcance (solo menciona cola 4…26) | SVG sobre `taco-core.js`, escala simétrica, vars `--rrg-*`, tabla accesible | Agregado |

Lo que hay que resolver antes de escribir código:

1. Universo y referencia definitivos (¿11 SPDR vs SPY? ¿las 15 de mayor peso de
   cada ETF, en las dos versiones, como hace el Sistema Alarmas?).
2. Si el HUB precalcula X/Y en Python o calcula todo en el navegador. Acá está
   propuesto precalcular; decide el costo de Actions vs el peso del JSON.
3. Si el toggle diario entra en la v1 o queda para después.
