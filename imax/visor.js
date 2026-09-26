import * as THREE from './three.module.min.js';

// Una toma renderizada en Blender por estacion (0 apertura, 1..14 escalas, 15 epilogo).
// foco: punto horizontal que se conserva al recortar en pantallas verticales.
const TOMAS = [
  { img: 'tormenta', foco: 0.45 },
  { img: 'troya', foco: 0.5 }, { img: 'cicones', foco: 0.4 }, { img: 'lotofagos', foco: 0.55 },
  { img: 'polifemo', foco: 0.48 }, { img: 'eolo', foco: 0.5 }, { img: 'lestrigones', foco: 0.5 },
  { img: 'circe', foco: 0.52 }, { img: 'inframundo', foco: 0.5 }, { img: 'sirenas', foco: 0.45 },
  { img: 'escila', foco: 0.45 }, { img: 'helios', foco: 0.4 }, { img: 'calipso', foco: 0.45 },
  { img: 'feacios', foco: 0.5 }, { img: 'itaca', foco: 0.4 }, { img: 'itaca', foco: 0.4 },
];
const ASPECTO_IMG = 16 / 9;

const VERT = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;
const FRAG = `
uniform sampler2D uColA, uProA, uColB, uProB;
uniform vec2 uEscA, uEscB, uOffA, uOffB, uCenA, uCenB;
uniform float uZoomA, uZoomB, uMezcla, uDestello, uListoA, uListoB, uTime, uTipo, uAspecto;
varying vec2 vUv;
vec3 toma(sampler2D col, sampler2D pro, vec2 esc, vec2 off, float zoom, vec2 cen){
  vec2 p = (vUv - 0.5) * esc / zoom + cen;
  vec2 q = p;
  for (int i = 0; i < 6; i++) { q = p - off * (texture2D(pro, clamp(q, 0.001, 0.999)).r - 0.35); }
  return texture2D(col, clamp(q, 0.001, 0.999)).rgb;
}
void main(){
  vec3 a = toma(uColA, uProA, uEscA, uOffA, uZoomA, uCenA) * uListoA;
  vec3 b = toma(uColB, uProB, uEscB, uOffB, uZoomB, uCenB) * uListoB;
  float T = uMezcla;
  vec3 c;
  if (uTipo < 0.5) {                       // fundido encadenado
    c = mix(a, b, smoothstep(0.0, 1.0, T));
  } else if (uTipo < 1.5) {                // paso por negro
    c = T < 0.5 ? a * (1.0 - T * 2.0) : b * ((T - 0.5) * 2.0);
  } else if (uTipo < 2.5) {                // barrido lateral de borde suave
    float w = T * 1.4 - 0.2;
    c = mix(b, a, smoothstep(w - 0.2, w + 0.2, vUv.x));
  } else {                                 // iris que se abre desde el centro
    float d = length((vUv - 0.5) * vec2(uAspecto, 1.0));
    float r = T * (0.6 * uAspecto + 0.6);
    c = mix(b, a, smoothstep(r - 0.18, r, d));
  }
  c += uDestello * vec3(0.5, 0.56, 0.7) * 0.5;
  gl_FragColor = vec4(c, 1.0);
}`;

export function crearMundo(lienzo) {
  const movil = Math.min(innerWidth, innerHeight) < 700;
  const renderer = new THREE.WebGLRenderer({ canvas: lienzo, antialias: false });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5));
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
  const escena = new THREE.Scene();
  const camara = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const negro = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1);
  negro.needsUpdate = true;
  const u = {
    uColA: { value: negro }, uProA: { value: negro }, uColB: { value: negro }, uProB: { value: negro },
    uEscA: { value: new THREE.Vector2(1, 1) }, uEscB: { value: new THREE.Vector2(1, 1) },
    uCenA: { value: new THREE.Vector2(0.5, 0.5) }, uCenB: { value: new THREE.Vector2(0.5, 0.5) },
    uOffA: { value: new THREE.Vector2() }, uOffB: { value: new THREE.Vector2() },
    uZoomA: { value: 1 }, uZoomB: { value: 1 }, uMezcla: { value: 0 }, uDestello: { value: 0 },
    uListoA: { value: 0 }, uListoB: { value: 0 }, uTime: { value: 0 }, uTipo: { value: 0 }, uAspecto: { value: 1.78 },
  };
  escena.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({ uniforms: u, vertexShader: VERT, fragmentShader: FRAG, depthTest: false })));

  // carga perezosa de texturas: la toma actual y sus vecinas
  const cargador = new THREE.TextureLoader();
  const cache = new Map();
  function textura(nombre) {
    if (cache.has(nombre)) return cache.get(nombre);
    const e = { col: null, pro: null, listo: false };
    cache.set(nombre, e);
    let n = 0;
    const fin = () => { if (++n === 2) e.listo = true; };
    e.col = cargador.load(`tomas/${nombre}.jpg`, fin, undefined, fin);
    e.pro = cargador.load(`tomas/${nombre}-prof.jpg`, fin, undefined, fin);
    for (const t of [e.col, e.pro]) { t.minFilter = THREE.LinearFilter; t.generateMipmaps = false; t.colorSpace = THREE.NoColorSpace; }
    e.col.colorSpace = THREE.LinearSRGBColorSpace;
    return e;
  }

  function escala(foco) {
    const asp = innerWidth / innerHeight;
    return asp < ASPECTO_IMG ? new THREE.Vector2(asp / ASPECTO_IMG, 1) : new THREE.Vector2(1, ASPECTO_IMG / asp);
  }
  function redimensionar() {
    renderer.setSize(innerWidth, innerHeight, false);
  }
  redimensionar();

  const reducir = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let destello = 0, proxRayo = 4, sPrev = 0;
  const RAYOS = { 0: 0.5, 10: 0.2 };

  function fijar(lado, i, prog, t, puntero) {
    const toma = TOMAS[Math.max(0, Math.min(TOMAS.length - 1, i))];
    const tx = textura(toma.img);
    const esc = escala(toma.foco);
    const U = lado === 'A' ? ['uColA', 'uProA', 'uEscA', 'uOffA', 'uZoomA', 'uListoA', 'uCenA'] : ['uColB', 'uProB', 'uEscB', 'uOffB', 'uZoomB', 'uListoB', 'uCenB'];
    u[U[0]].value = tx.listo ? tx.col : negro;
    u[U[1]].value = tx.listo ? tx.pro : negro;
    u[U[5]].value = tx.listo ? Math.min(1, u[U[5]].value + 0.08) : 0;
    u[U[2]].value.copy(esc);
    // en pantallas verticales la ventana se centra en el foco de la toma
    const medio = esc.x / 2;
    u[U[6]].value.set(Math.min(1 - medio, Math.max(medio, toma.foco)), 0.5);
    const m = reducir ? 0 : 1;
    // avance lento de camara dentro de la toma, respiracion y puntero
    u[U[4]].value = 1.03 + prog * 0.07 * m;
    u[U[3]].value.set(
      ((prog - 0.5) * 0.028 + Math.sin(t * 0.11) * 0.004 + puntero.x * 0.01) * m,
      (Math.sin(t * 0.08) * 0.003 + puntero.y * 0.006 - prog * 0.006) * m);
  }

  function actualizar(s, t, dt, puntero) {
    // cada toma domina su escala; la transicion ocurre solo al cruzar la mitad entre dos escalas
    const i = Math.round(s), local = s - i;
    let lo = i, hi = i, T = 0;
    if (local >= 0.36) { hi = i + 1; T = (local - 0.36) / 0.28; }
    else if (local <= -0.36) { lo = i - 1; T = 0.5 + (local + 0.5) / 0.28; }
    u.uMezcla.value = Math.min(1, Math.max(0, T));
    u.uTipo.value = hi % 4;
    u.uAspecto.value = innerWidth / innerHeight;
    fijar('A', lo, Math.min(1, Math.max(0, s - lo + 0.5)), t, puntero);
    fijar('B', hi, Math.min(1, Math.max(0, s - hi + 0.5)), t, puntero);
    textura(TOMAS[Math.max(0, Math.min(TOMAS.length - 1, i + (local >= 0 ? 2 : -2)))].img);
    const cerca = Math.round(s);
    const frec = RAYOS[cerca] || 0;
    if (!reducir && frec > 0) {
      proxRayo -= dt;
      if (proxRayo <= 0) { destello = 1; proxRayo = 2 + Math.random() * 6 / frec; if (api.alRayo) api.alRayo(); }
    }
    if ((sPrev < 11.45 && s >= 11.45) || (sPrev > 11.45 && s <= 11.45)) { destello = 1.3; if (api.alRayo) api.alRayo(); }
    sPrev = s;
    destello = Math.max(0, destello - dt * (destello > 0.6 ? 5 : 1.8));
    u.uDestello.value = destello * (0.6 + 0.4 * Math.sin(t * 60));
    u.uTime.value = t;
    renderer.render(escena, camara);
  }

  const api = { actualizar, redimensionar, renderer, alRayo: null };
  return api;
}
