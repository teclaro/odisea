import { TEXTOS } from './textos.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const rampa = (x, a, b) => clamp((x - a) / (b - a));
const params = new URLSearchParams(location.search);
const PRUEBA = params.has('prueba');
const reducir = matchMedia('(prefers-reduced-motion: reduce)').matches;
const ROLLOS = { 4: 'ojo', 14: 'hachas' };

// ---------------------------------------------------------------- idioma
let idioma = params.get('lang') || ((navigator.language || 'es').toLowerCase().startsWith('es') ? 'es' : 'en');
if (!TEXTOS[idioma]) idioma = 'es';

function construir() {
  const T = TEXTOS.es;
  const cont = $('#escalas');
  cont.innerHTML = T.escalas.map((_, i) => `
    <section class="escala" id="escala-${i + 1}" data-estacion="${i + 1}">
      <div class="marco"><div class="texto">
        <span class="numeral"></span><h2></h2><p class="lema"></p><p class="relato"></p>
        <p class="clave"><b></b><span></span></p>
      </div></div>
    </section>`).join('');
  $('#ruta').innerHTML = T.escalas.map((_, i) => `<button type="button" class="hito" data-ir="${i + 1}"></button>`).join('');
  $('#elenco').innerHTML = T.personajes.map(() => '<article><h3></h3><p class="rol"></p><p class="desc"></p><p class="actor"></p></article>').join('');
  const g = [0, 0, 0, 0, 1, 1, 1, 1, 3, 3, 3, 3, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4];
  $('#barra-cantos').innerHTML = g.map((k) => `<i class="g${k === 0 ? 1 : k === 1 ? 2 : k}"></i>`).join('');
  $('#leyenda-cantos').innerHTML = T.cantos.map(() => '<div><b></b><span></span></div>').join('');
  $('#lista-sala').innerHTML = T.sala.map(() => '<div><h3></h3><p></p></div>').join('');
}

function pintar() {
  const T = TEXTOS[idioma];
  document.documentElement.lang = idioma;
  document.title = T.doc;
  $$('[data-t]').forEach((el) => { const v = T[el.dataset.t]; if (typeof v === 'string') el.textContent = v; });
  $$('.escala').forEach((sec, i) => {
    const e = T.escalas[i];
    $('.numeral', sec).textContent = e.n;
    $('h2', sec).textContent = e.lugar;
    $('.lema', sec).textContent = e.lema;
    $('.relato', sec).textContent = e.relato;
    $('.clave b', sec).textContent = T.clave;
    $('.clave span', sec).textContent = e.clave;
  });
  $$('.hito').forEach((b, i) => { b.setAttribute('aria-label', `${T.escalas[i].n}. ${T.escalas[i].lugar}`); b.title = T.escalas[i].lugar; });
  $$('#elenco article').forEach((a, i) => {
    const p = T.personajes[i];
    $('h3', a).textContent = p.nombre; $('.rol', a).textContent = p.rol;
    $('.desc', a).textContent = p.texto; $('.actor', a).textContent = p.actor || '';
  });
  $$('#leyenda-cantos div').forEach((d, i) => {
    const c = T.cantos[i];
    $('b', d).textContent = T.cantoAbrev(c.de, c.a); $('span', d).textContent = c.texto;
  });
  $$('#lista-sala > div').forEach((d, i) => { $('h3', d).textContent = T.sala[i].t; $('p', d).textContent = T.sala[i].d; });
  $('#otra-version').href = T.otraVersionUrl;
  $('#boton-idioma').setAttribute('lang', idioma === 'es' ? 'en' : 'es');
  ultimaEtiqueta = -1;
  medir();
}

// ---------------------------------------------------------------- grano de pelicula
function grano() {
  const c = document.createElement('canvas');
  c.width = c.height = 180;
  const x = c.getContext('2d');
  const img = x.createImageData(180, 180);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = Math.random() * 255;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
    img.data[i + 3] = 255;
  }
  x.putImageData(img, 0, 0);
  $('#grano').style.backgroundImage = `url(${c.toDataURL()})`;
}

// ---------------------------------------------------------------- medidas y scroll
let anclas = [], secciones = [];
function medir() {
  const vh = innerHeight;
  const est = $$('[data-estacion]').sort((a, b) => a.dataset.estacion - b.dataset.estacion);
  anclas = est.map((el) => {
    const r = el.getBoundingClientRect(), top = r.top + scrollY;
    const n = +el.dataset.estacion;
    if (n === 0) return 0;
    if (n === 15) return top - vh * 0.4;
    return top + Math.max(0, r.height - vh) * 0.5;
  });
  secciones = [$('#premisa'), ...$$('.escala')].map((el) => {
    const r = el.getBoundingClientRect();
    return { el, marco: $('.marco', el), top: r.top + scrollY, alto: r.height, n: +(el.dataset.estacion || 0) };
  });
  const w = innerWidth, h = innerHeight;
  const cine = w < 720 ? Math.min(h * 0.12, Math.max(44, (h - w / 2.39) / 2)) : Math.max(44, (h - w / 2.39) / 2);
  const imax = Math.max(44, (h - w / 1.43) / 2);
  document.documentElement.style.setProperty('--b-cine', `${Math.round(cine)}px`);
  document.documentElement.style.setProperty('--b-imax', `${Math.round(Math.min(imax, cine))}px`);
}
function estacion(y) {
  if (y <= anclas[0]) return 0;
  for (let k = 0; k < anclas.length - 1; k++) {
    if (y < anclas[k + 1]) return k + (y - anclas[k]) / (anclas[k + 1] - anclas[k]);
  }
  return anclas.length - 1;
}
function irA(n) {
  const sec = secciones.find((s) => s.n === n);
  if (sec) scrollTo({ top: sec.top + (sec.alto - innerHeight) * 0.3, behavior: reducir ? 'auto' : 'smooth' });
}

// ---------------------------------------------------------------- sonido
const sonido = { ctx: null, maestro: null, canto: null, activo: false, ultimoBraam: 0 };
function iniciarSonido() {
  const A = new (window.AudioContext || window.webkitAudioContext)();
  const maestro = A.createGain();
  maestro.gain.value = 0;
  maestro.connect(A.destination);
  const buf = A.createBuffer(1, A.sampleRate * 4, A.sampleRate);
  const d = buf.getChannelData(0);
  let ult = 0;
  for (let i = 0; i < d.length; i++) { ult = (ult + 0.02 * (Math.random() * 2 - 1)) / 1.02; d[i] = ult * 3.5; }
  const ruido = A.createBufferSource();
  ruido.buffer = buf; ruido.loop = true;
  const pb = A.createBiquadFilter(); pb.type = 'lowpass'; pb.frequency.value = 420;
  const ola = A.createGain(); ola.gain.value = 0.55;
  const lfo = A.createOscillator(); lfo.frequency.value = 0.11;
  const lfoG = A.createGain(); lfoG.gain.value = 0.35;
  lfo.connect(lfoG); lfoG.connect(ola.gain); lfo.start();
  ruido.connect(pb); pb.connect(ola); ola.connect(maestro); ruido.start();
  const dron = A.createGain(); dron.gain.value = 0.045;
  const fd = A.createBiquadFilter(); fd.type = 'lowpass'; fd.frequency.value = 150;
  [55, 55.35, 82.4].forEach((f) => { const o = A.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.connect(fd); o.start(); });
  fd.connect(dron); dron.connect(maestro);
  const canto = A.createGain(); canto.gain.value = 0;
  [440, 554.37, 659.25].forEach((f, i) => {
    const o = A.createOscillator(); o.type = 'sine'; o.frequency.value = f;
    const v = A.createOscillator(); v.frequency.value = 4.6 + i * 0.4;
    const vg = A.createGain(); vg.gain.value = 5;
    v.connect(vg); vg.connect(o.frequency); v.start(); o.connect(canto); o.start();
  });
  canto.connect(maestro);
  Object.assign(sonido, { ctx: A, maestro, canto });
}
function braam() {
  const A = sonido.ctx;
  if (!A || !sonido.activo || A.currentTime - sonido.ultimoBraam < 2.5) return;
  sonido.ultimoBraam = A.currentTime;
  const t0 = A.currentTime;
  const g = A.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(0.2, t0 + 0.28);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + 3.4);
  const f = A.createBiquadFilter(); f.type = 'lowpass';
  f.frequency.setValueAtTime(80, t0); f.frequency.exponentialRampToValueAtTime(760, t0 + 0.45); f.frequency.exponentialRampToValueAtTime(90, t0 + 3.2);
  [43.65, 87.3, 130.8, 65.4].forEach((fr) => {
    const o = A.createOscillator(); o.type = 'sawtooth'; o.frequency.value = fr; o.detune.value = (Math.random() - 0.5) * 18;
    o.connect(f); o.start(t0); o.stop(t0 + 3.5);
  });
  f.connect(g); g.connect(sonido.maestro);
}
function trueno() {
  const A = sonido.ctx;
  if (!A || !sonido.activo) return;
  const t0 = A.currentTime + 0.25 + Math.random() * 0.6;
  const buf = A.createBuffer(1, A.sampleRate * 3, A.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 2.2);
  const src = A.createBufferSource(); src.buffer = buf;
  const f = A.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 260;
  const g = A.createGain(); g.gain.value = 0.9;
  src.connect(f); f.connect(g); g.connect(sonido.maestro); src.start(t0);
}
function alternarSonido() {
  if (!sonido.ctx) iniciarSonido();
  sonido.activo = !sonido.activo;
  const A = sonido.ctx;
  A.resume();
  sonido.maestro.gain.cancelScheduledValues(A.currentTime);
  sonido.maestro.gain.setTargetAtTime(sonido.activo ? 0.9 : 0, A.currentTime, 0.4);
  $('#boton-sonido').setAttribute('aria-pressed', String(sonido.activo));
}

// ---------------------------------------------------------------- videos
const rollos = {};
$$('.rollo').forEach((r) => { rollos[r.id.replace('rollo-', '')] = { el: r, video: $('video', r), op: -1 }; });
function fijarRollo(nombre, op) {
  const r = rollos[nombre];
  if (!r || Math.abs(r.op - op) < 0.002) return;
  r.op = op;
  r.el.style.opacity = op.toFixed(3);
  const v = r.video;
  if (op > 0.01 && !reducir) {
    if (v.preload === 'none') v.preload = 'auto';
    if (v.paused) v.play().catch(() => {});
  } else if (op <= 0.01 && !v.paused) v.pause();
}

// ---------------------------------------------------------------- bucle
const marcoApertura = $('#apertura .marco'), pieDerEl = $('#pie-der');
function fijarO(el, o) {
  const v = o.toFixed(3);
  if (el._o !== v) { el._o = v; el.style.setProperty('--o', v); }
}
let mundo = null, sSuave = 0, ultimaEtiqueta = -1, ultimoCapitulo = 0;
const puntero = { x: 0, y: 0, tx: 0, ty: 0 };
addEventListener('pointermove', (e) => { puntero.tx = (e.clientX / innerWidth) * 2 - 1; puntero.ty = -((e.clientY / innerHeight) * 2 - 1); }, { passive: true });

function cuadro(ahora, dt) {
  const y = scrollY, vh = innerHeight;
  const s = estacion(y);
  sSuave = PRUEBA ? s : sSuave + (s - sSuave) * (1 - Math.exp(-dt * 5));
  puntero.x += (puntero.tx - puntero.x) * 0.05;
  puntero.y += (puntero.ty - puntero.y) * 0.05;

  // apertura
  const oTitulo = 1 - rampa(y, vh * 0.25, vh * 0.75);
  fijarO(marcoApertura, oTitulo);
  fijarRollo('tormenta', 1 - rampa(y, vh * 0.55, vh * 1.15));

  // capitulos
  let formato = 'cine', etiqueta = -1, pieDer = '';
  const rollosOp = { ojo: 0, hachas: 0 };
  for (const sec of secciones) {
    const prog = (y - sec.top) / Math.max(1, sec.alto - vh);
    let o = rampa(prog, -0.02, 0.12) * (1 - rampa(prog, 0.86, 0.98));
    const rollo = ROLLOS[sec.n];
    if (rollo) {
      o *= 1 - rampa(prog, 0.44, 0.52);
      rollosOp[rollo] = rampa(prog, 0.48, 0.58) * (1 - rampa(prog, 0.9, 0.99));
      if (rollosOp[rollo] > 0.5) pieDer = TEXTOS[idioma].rollo;
    }
    fijarO(sec.marco, o);
    if (sec.n > 0 && prog > 0.06 && prog < 0.94) { formato = 'imax'; etiqueta = sec.n; }
  }
  fijarRollo('ojo', rollosOp.ojo);
  fijarRollo('hachas', rollosOp.hachas);
  if (document.body.dataset.formato !== formato) document.body.dataset.formato = formato;

  if (etiqueta !== ultimaEtiqueta) {
    ultimaEtiqueta = etiqueta;
    $('#pie-izq').textContent = etiqueta > 0 ? `${TEXTOS[idioma].escalaDe(TEXTOS[idioma].escalas[etiqueta - 1].n)}` : '';
    $$('.hito').forEach((b, i) => {
      if (i + 1 === etiqueta) b.setAttribute('aria-current', 'step'); else b.removeAttribute('aria-current');
      b.classList.toggle('pasado', i + 1 < etiqueta);
    });
    if (etiqueta > 0 && etiqueta !== ultimoCapitulo) { ultimoCapitulo = etiqueta; braam(); }
  }
  if (pieDerEl.textContent !== pieDer) pieDerEl.textContent = pieDer;

  if (sonido.canto) sonido.canto.gain.setTargetAtTime(Math.max(0, 1 - Math.abs(sSuave - 9) / 0.7) * 0.035, sonido.ctx.currentTime, 0.3);
  if (mundo && !document.hidden) mundo.actualizar(sSuave, ahora, dt, puntero);
}

let previo = performance.now(), lentos = 0;
function bucle(t) {
  const dt = Math.min(0.1, (t - previo) / 1000);
  previo = t;
  if (mundo && dt > 0.045) {
    lentos += dt;
    if (lentos > 3) {
      lentos = 0;
      const pr = mundo.renderer.getPixelRatio();
      if (pr > 0.75) { mundo.renderer.setPixelRatio(Math.max(0.75, pr * 0.82)); mundo.redimensionar(); }
    }
  } else lentos = Math.max(0, lentos - dt * 0.5);
  cuadro(t / 1000, PRUEBA ? 0.5 : dt);
  requestAnimationFrame(bucle);
}

// ---------------------------------------------------------------- inicio
async function iniciar() {
  construir();
  pintar();
  grano();
  $('#ruta').addEventListener('click', (e) => { const b = e.target.closest('[data-ir]'); if (b) irA(+b.dataset.ir); });
  $('#boton-idioma').addEventListener('click', () => {
    idioma = idioma === 'es' ? 'en' : 'es';
    const u = new URL(location.href); u.searchParams.set('lang', idioma); history.replaceState(null, '', u);
    pintar();
  });
  $('#boton-sonido').addEventListener('click', alternarSonido);
  addEventListener('resize', () => { medir(); if (mundo) mundo.redimensionar(); });
  if (document.fonts) document.fonts.ready.then(medir);
  try {
    const { crearMundo } = await import('./mundo.js');
    mundo = crearMundo($('#mar'));
    mundo.alRayo = trueno;
  } catch (e) {
    console.warn('3D no disponible:', e.message);
    document.body.classList.add('sin-3d');
  }
  medir();
  requestAnimationFrame(bucle);
}
iniciar();
