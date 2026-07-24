/*
 * taco-core.js — motor compartido del índice TACO.
 *
 * Usado por taco.html, taco-en.html y taco-hub.html. Contiene el motor de
 * gráficos (lineChart), utilidades de dibujo SVG y el resaltado cruzado
 * tile/leyenda -> gráfico. Cada página define su propio render() con sus
 * textos, colores de serie y features (no todo es compartible: distinto
 * idioma, distinto semáforo, distintas features por tema).
 *
 * El motor lee los colores de "chrome" del gráfico (grilla, eje, banda de
 * peligro, crosshair) a través de un set fijo de variables CSS alias que
 * cada pagina debe declarar sobre su propio tema:
 *   --chart-surface  fondo de la card/tile (para anillos y placas de texto)
 *   --chart-ink      color de énfasis (línea principal, valor final)
 *   --chart-muted    texto secundario dentro del gráfico
 *   --chart-muted2   texto más apagado (ticks de eje, meses)
 *   --chart-grid     líneas de grilla
 *   --chart-axis     línea del cero / eje más fuerte
 *   --chart-danger   rojo: banda de pivote, hawkish, crosshair
 *   --chart-good     verde: dovish / nominal
 *   --chart-accent   color del crosshair y sus puntos (puede == danger)
 *
 * Los colores de las 4 series de "Componentes" siguen siendo responsabilidad
 * de cada render() (se pasan como nombre de variable CSS en seriesDefs[].color).
 */
(function (global) {
  "use strict";

  const css = (n) => getComputedStyle(document.body).getPropertyValue(n).trim();

  const el = (tag, attrs = {}, parent = null) => {
    const ns = "http://www.w3.org/2000/svg";
    const node = ["svg", "defs", "pattern", "g", "path", "line", "rect", "circle", "text"].includes(tag)
      ? document.createElementNS(ns, tag)
      : document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
    if (parent) parent.appendChild(node);
    return node;
  };

  const parseDate = (s) => new Date(s + "T12:00:00");

  const createFormatters = (locale) => ({
    FMT: new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    DFMT: new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric" }),
  });

  // texto SVG con placa de fondo solida (legible sobre cualquier trazo detras)
  const tagText = (svg, attrs, text, pad = 3) => {
    const t = el("text", attrs, svg);
    t.textContent = text;
    const bb = t.getBBox();
    const bg = el("rect", {
      x: bb.x - pad, y: bb.y - pad, width: bb.width + pad * 2, height: bb.height + pad * 2,
      fill: css("--chart-surface"),
    });
    svg.insertBefore(bg, t);
    return t;
  };

  /**
   * Gráfico de líneas con crosshair, tooltip y banda de pivote opcional.
   *
   * opts:
   *   FMT, DFMT       formatters ya creados (createFormatters)
   *   label           aria-label del svg
   *   band            {low, avg, high, pattern:"hazard"|"soft", text} | undefined
   *   pivots          [{date, type:"dovish"|"hawkish", label, label_en}]
   *   pivotLabel(type) -> texto del tipo de pivote en el tooltip
   *   eventLabel(p)   -> texto del evento del pivote (label / label_en según idioma)
   *   valueTag(v)     -> texto de la etiqueta del valor final (con o sin [ ])
   *   monthLabel(date)-> texto del tick de mes en el eje x
   *   uppercaseAxis   bool, mayúsculas en los ticks numéricos del eje y (raro, default false)
   *
   * Devuelve {seriesEls} — mapa key -> {path, endDot} para armar el resaltado.
   */
  function lineChart(box, rows, seriesDefs, opts) {
    const { FMT, DFMT } = opts;
    const W = 920, H = 340, m = { t: 16, r: 16, b: 30, l: 44 };
    const iw = W - m.l - m.r, ih = H - m.t - m.b;
    const xs = rows.map((r) => parseDate(r.date).getTime());
    const x0 = xs[0], x1 = xs[xs.length - 1];
    let vmin = Infinity, vmax = -Infinity;
    for (const r of rows) for (const s of seriesDefs) {
      const v = r[s.key]; if (v == null) continue;
      if (v < vmin) vmin = v; if (v > vmax) vmax = v;
    }
    if (opts.band) { vmin = Math.min(vmin, -1); vmax = Math.max(vmax, opts.band.high + 0.3); }
    const pad = (vmax - vmin) * 0.06; vmin -= pad; vmax += pad;
    const X = (t) => m.l + (t - x0) / (x1 - x0) * iw;
    const Y = (v) => m.t + (vmax - v) / (vmax - vmin) * ih;

    const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": opts.label }, box);

    // banda de umbral + línea de promedio
    if (opts.band) {
      if (opts.band.pattern === "hazard") {
        const defs = el("defs", {}, svg);
        const patId = "hz" + Math.random().toString(36).slice(2, 8);
        const pat = el("pattern", { id: patId, width: 9, height: 9, patternUnits: "userSpaceOnUse", patternTransform: "rotate(45)" }, defs);
        el("rect", { width: 9, height: 9, fill: "transparent" }, pat);
        el("line", { x1: 0, y1: 0, x2: 0, y2: 9, stroke: css("--chart-danger"), "stroke-width": 4, "stroke-opacity": .35 }, pat);
        el("rect", { x: m.l, y: Y(opts.band.high), width: iw, height: Y(opts.band.low) - Y(opts.band.high), fill: `url(#${patId})` }, svg);
        el("line", { x1: m.l, x2: m.l + iw, y1: Y(opts.band.avg), y2: Y(opts.band.avg), stroke: css("--chart-danger"), "stroke-width": 1.5 }, svg);
      } else {
        el("rect", { x: m.l, y: Y(opts.band.high), width: iw, height: Y(opts.band.low) - Y(opts.band.high), fill: css("--chart-danger"), opacity: .08 }, svg);
        el("line", { x1: m.l, x2: m.l + iw, y1: Y(opts.band.avg), y2: Y(opts.band.avg), stroke: css("--chart-danger"), "stroke-width": 1.5, "stroke-opacity": .6, "stroke-dasharray": "5 3" }, svg);
      }
      tagText(svg, { x: m.l + 4, y: Y(opts.band.avg) - 7, "text-anchor": "start", "font-size": 10.5, "letter-spacing": ".02em", fill: css("--chart-muted") }, opts.band.text);
    }

    // grilla y ejes
    const range = vmax - vmin;
    const step = range > 20 ? 5 : range > 8 ? 2 : range > 4 ? 1 : 0.5;
    for (let v = Math.ceil(vmin / step) * step; v <= vmax; v += step) {
      const y = Y(v);
      el("line", { x1: m.l, x2: m.l + iw, y1: y, y2: y, stroke: css("--chart-grid"), "stroke-width": 1 }, svg);
      el("text", { x: m.l - 8, y: y + 4, "text-anchor": "end", "font-size": 10.5, fill: css("--chart-muted2") }, svg)
        .textContent = (step < 1 ? v.toFixed(1) : Math.round(v));
    }
    el("line", { x1: m.l, x2: m.l + iw, y1: Y(0), y2: Y(0), stroke: css("--chart-axis"), "stroke-width": 1 }, svg);
    const months = new Set();
    for (const t of xs) {
      const d = new Date(t), k = d.getFullYear() + "-" + d.getMonth();
      if (months.has(k)) continue; months.add(k);
      if (d.getDate() > 7) continue;
      el("text", { x: X(t), y: H - 8, "text-anchor": "middle", "font-size": 10.5, fill: css("--chart-muted2") }, svg)
        .textContent = opts.monthLabel(d);
    }

    // pivotes históricos
    const pivotPts = [];
    for (const p of (opts.pivots || [])) {
      const t = parseDate(p.date).getTime();
      if (t < x0 || t > x1) continue;
      const c = css(p.type === "hawkish" ? "--chart-danger" : "--chart-good");
      el("line", { x1: X(t), x2: X(t), y1: m.t, y2: m.t + ih, stroke: c, "stroke-width": 1, "stroke-opacity": .55 }, svg);
      el("circle", { cx: X(t), cy: m.t + 5, r: 4, fill: c, stroke: css("--chart-surface"), "stroke-width": 2 }, svg);
      pivotPts.push({ x: X(t), p, c });
    }

    // series
    const seriesEls = {};
    for (const s of seriesDefs) {
      const d = rows.map((r, i) => (r[s.key] == null ? "" : `${i ? "L" : "M"}${X(xs[i]).toFixed(1)} ${Y(r[s.key]).toFixed(1)}`)).join("");
      const path = el("path", { d, fill: "none", stroke: css(s.color), "stroke-width": 2, class: "hl-line", "data-key": s.key, "stroke-linejoin": "round", "stroke-linecap": "round" }, svg);
      const last = rows[rows.length - 1];
      const endDot = el("circle", { cx: X(xs[xs.length - 1]), cy: Y(last[s.key]), r: 4.5, fill: css(s.color), class: "hl-line", "data-key": s.key, stroke: css("--chart-surface"), "stroke-width": 2 }, svg);
      seriesEls[s.key] = { path, endDot };
    }
    const main = seriesDefs[0], lastRow = rows[rows.length - 1];
    tagText(svg, { x: m.l + iw - 2, y: Y(lastRow[main.key]) - 10, "text-anchor": "end", "font-size": 12, "font-weight": 700, fill: css("--chart-ink") }, opts.valueTag(lastRow[main.key]), 4);

    // crosshair + tooltip
    const cross = el("line", { y1: m.t, y2: m.t + ih, stroke: css("--chart-accent"), "stroke-width": 1, "stroke-opacity": 0 }, svg);
    const dots = seriesDefs.map(() => el("circle", { r: 5, fill: css("--chart-accent"), stroke: css("--chart-surface"), "stroke-width": 2, opacity: 0 }, svg));
    const tt = el("div", { class: "tooltip" }, box);
    const hit = el("rect", { x: m.l, y: m.t, width: iw, height: ih, fill: "transparent", "data-role": "hit" }, svg);
    hit.addEventListener("pointermove", (ev) => {
      const rect = svg.getBoundingClientRect();
      const px = (ev.clientX - rect.left) * (W / rect.width);
      const t = x0 + (px - m.l) / iw * (x1 - x0);
      let i = 0; while (i < xs.length - 1 && Math.abs(xs[i + 1] - t) < Math.abs(xs[i] - t)) i++;
      const r = rows[i], cx = X(xs[i]);
      cross.setAttribute("x1", cx); cross.setAttribute("x2", cx);
      cross.setAttribute("stroke-opacity", .6);
      seriesDefs.forEach((s, k) => {
        dots[k].setAttribute("cx", cx); dots[k].setAttribute("cy", Y(r[s.key]));
        dots[k].setAttribute("opacity", 1);
      });
      tt.classList.add("is-visible");
      tt.innerHTML = `<div class="tt-date">${DFMT.format(parseDate(r.date))}</div>` +
        seriesDefs.map((s) => `<div class="tt-row"><span>${s.name}</span><b>${FMT.format(r[s.key])}</b></div>`).join("");
      const bw = box.clientWidth, ttw = tt.offsetWidth || 160;
      let left = cx / W * bw + 14; if (left + ttw > bw - 4) left = cx / W * bw - ttw - 14;
      tt.style.left = left + "px";
      tt.style.top = Math.max(0, (ev.clientY - rect.top) * (H / rect.height) / H * box.clientHeight - 40) + "px";
    });
    hit.addEventListener("pointerleave", () => {
      cross.setAttribute("stroke-opacity", 0);
      dots.forEach((d) => d.setAttribute("opacity", 0));
      tt.classList.remove("is-visible");
    });
    for (const { x, p, c } of pivotPts) {
      const pr = el("rect", { x: x - 8, y: m.t, width: 16, height: ih, fill: "transparent", "data-role": "pivot" }, svg);
      pr.style.cursor = "help";
      const show = (ev) => {
        cross.setAttribute("stroke-opacity", 0);
        dots.forEach((d) => d.setAttribute("opacity", 0));
        tt.classList.add("is-visible");
        tt.innerHTML = `<div class="tt-date">${DFMT.format(parseDate(p.date))}</div>
          <div style="display:flex;align-items:center;gap:7px;margin-bottom:4px">
            <span style="width:7px;height:7px;border-radius:50%;background:${c};flex:none"></span>
            <b style="color:var(--chart-ink)">${opts.pivotLabel(p.type)}</b></div>
          <div style="color:var(--chart-muted);max-width:230px;text-transform:none;letter-spacing:normal">${opts.eventLabel(p)}</div>`;
        const bw = box.clientWidth, ttw = tt.offsetWidth || 190;
        let left = x / W * bw + 14; if (left + ttw > bw - 4) left = x / W * bw - ttw - 14;
        tt.style.left = left + "px";
        const rect = svg.getBoundingClientRect();
        tt.style.top = Math.max(0, (ev.clientY - rect.top) / rect.height * box.clientHeight - 44) + "px";
      };
      pr.addEventListener("pointerenter", show);
      pr.addEventListener("pointermove", show);
      pr.addEventListener("pointerleave", () => { tt.classList.remove("is-visible"); });
    }
    return { seriesEls };
  }

  /**
   * Conecta un set de elementos (tiles + tags de leyenda) para que el hover
   * resalte la serie correspondiente en un gráfico de componentes.
   *
   * targets: [{key, el}]
   * chartOpts: {onWidth, offWidth, recolor: {on, off, onFill, offFill} | null}
   *   recolor null (p.ej. cuando cada serie ya tiene su propio color distintivo):
   *     solo cambia stroke-width y atenúa las demás (clase hl-dim).
   *   recolor definido (p.ej. series monocromas por defecto): además cambia
   *     stroke/fill a colores explícitos on/off.
   */
  function attachSeriesHighlight(seriesEls, targets, chartOpts = {}) {
    const allKeys = Object.keys(seriesEls);
    const { onWidth = 3, offWidth = 2, recolor = null } = chartOpts;
    const setHighlight = (key) => {
      for (const k of allKeys) {
        const { path, endDot } = seriesEls[k];
        const on = k === key;
        path.setAttribute("stroke-width", on ? onWidth : offWidth);
        if (recolor) {
          path.setAttribute("stroke", css(on ? recolor.on : recolor.off));
          endDot.setAttribute("fill", css(on ? (recolor.onFill || recolor.on) : (recolor.offFill || recolor.off)));
        }
        path.classList.toggle("hl-dim", !on);
        endDot.classList.toggle("hl-dim", !on);
      }
    };
    const clearHighlight = () => {
      for (const k of allKeys) {
        const { path, endDot } = seriesEls[k];
        path.setAttribute("stroke-width", offWidth);
        if (recolor) {
          path.setAttribute("stroke", css(recolor.off));
          endDot.setAttribute("fill", css(recolor.offFill || recolor.off));
        }
        path.classList.remove("hl-dim"); endDot.classList.remove("hl-dim");
      }
    };
    for (const { key, el: targetEl } of targets) {
      targetEl.addEventListener("pointerenter", () => { targetEl.classList.add("is-active"); setHighlight(key); });
      targetEl.addEventListener("pointerleave", () => { targetEl.classList.remove("is-active"); clearHighlight(); });
    }
  }

  global.TacoCore = { css, el, parseDate, createFormatters, tagText, lineChart, attachSeriesHighlight };
})(window);
