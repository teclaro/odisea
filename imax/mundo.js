import * as THREE from './three.module.min.js';
import { crearDecorados } from './decorados.js';
import { estandar, lerp, clamp, suave } from './util.js';

const TONO = '#include <tonemapping_fragment>\n#include <colorspace_fragment>';

// ---------------------------------------------------------------- estados por estacion
// 0 apertura, 1..14 escalas, 15 epilogo. sol = direccion hacia el astro.
const E = [
  { top: '#04070b', hor: '#18222b', sol: [0.35, 0.22, -0.7], solCol: '#a9bddc', solTam: 0.022, solInt: 0.7, nubes: 0.92, nubCol: '#1a2129', est: 0, hondo: '#02070a', claro: '#0b1c24', niebla: '#111921', dens: 0.0075, olas: 1.35, hemi: 0.35, rayos: 0.55, part: 'lluvia', cam: 'bajo', linterna: 1, expo: 1.15, vel: 5 },
  { top: '#030306', hor: '#2a120b', sol: [1, 0.04, -0.5], solCol: '#ff7a36', solTam: 0, solInt: 0.42, nubes: 0.6, nubCol: '#1c0f0c', est: 0.4, hondo: '#020306', claro: '#120a08', niebla: '#170c0a', dens: 0.005, olas: 0.6, hemi: 0.16, rayos: 0, part: 'brasas', cam: 'A', linterna: 1, expo: 1.1, vel: 4 },
  { top: '#262b33', hor: '#8b8680', sol: [0.9, 0.14, -0.6], solCol: '#ecd0a8', solTam: 0.022, solInt: 1.2, nubes: 0.75, nubCol: '#5f5c5a', est: 0, hondo: '#0a1418', claro: '#28393f', niebla: '#6f6d69', dens: 0.0085, olas: 0.7, hemi: 0.75, rayos: 0, part: 'ceniza', cam: 'lateral', linterna: 0.3, expo: 1, vel: 4 },
  { top: '#6a8aa4', hor: '#e9d0a2', sol: [0.6, 0.24, -0.8], solCol: '#ffdca4', solTam: 0.03, solInt: 1.9, nubes: 0.15, nubCol: '#dccbb2', est: 0, hondo: '#0d2a32', claro: '#3f6a69', niebla: '#dac7a3', dens: 0.0062, olas: 0.25, hemi: 1.05, rayos: 0, part: 'petalos', cam: 'aereo', linterna: 0, expo: 0.95, vel: 2.5 },
  { top: '#0b0d13', hor: '#3e2a22', sol: [1, 0.05, 0.25], solCol: '#ff9258', solTam: 0.028, solInt: 0.6, nubes: 0.5, nubCol: '#2a201f', est: 0.1, hondo: '#04080b', claro: '#141f25', niebla: '#2a221f', dens: 0.0072, olas: 0.5, hemi: 0.42, rayos: 0, part: 'polvo', cam: 'bajo', linterna: 0.8, expo: 1.1, vel: 3 },
  { top: '#2b4e77', hor: '#aabdcc', sol: [0.3, 0.6, -0.5], solCol: '#fff2da', solTam: 0.02, solInt: 2.0, nubes: 0.62, nubCol: '#e9edf1', est: 0, hondo: '#05202d', claro: '#1f5566', niebla: '#a6b7c3', dens: 0.0048, olas: 1.1, hemi: 1.1, rayos: 0, part: 'viento', cam: 'frontal', linterna: 0, expo: 0.82, vel: 7 },
  { top: '#1b2325', hor: '#56625c', sol: [0.2, 0.5, 0.3], solCol: '#b8c4bc', solTam: 0, solInt: 0.8, nubes: 0.9, nubCol: '#394341', est: 0, hondo: '#031012', claro: '#12302d', niebla: '#3b4643', dens: 0.0085, olas: 0.5, hemi: 0.55, rayos: 0, part: 'espuma', cam: 'bajo', linterna: 0.4, expo: 1.05, vel: 3 },
  { top: '#0d0a18', hor: '#4a3558', sol: [0.8, 0.1, -0.4], solCol: '#c9a2d6', solTam: 0.016, solInt: 0.55, nubes: 0.3, nubCol: '#3c2a4a', est: 0.5, hondo: '#060812', claro: '#211f39', niebla: '#3d2c4b', dens: 0.0075, olas: 0.35, hemi: 0.48, rayos: 0, part: 'chispas', cam: 'A', linterna: 0.7, expo: 1.1, vel: 3 },
  { top: '#000000', hor: '#0d1915', sol: [0, 1, 0], solCol: '#6fa08a', solTam: 0, solInt: 0.25, nubes: 0, nubCol: '#0a100e', est: 0, hondo: '#010302', claro: '#06100c', niebla: '#0b1511', dens: 0.012, olas: 0.15, hemi: 0.2, rayos: 0, part: 'almas', cam: 'aereo', linterna: 1, expo: 1.2, vel: 2 },
  { top: '#6a757f', hor: '#c9cbc5', sol: [0.5, 0.3, -0.6], solCol: '#f3efe6', solTam: 0.03, solInt: 1.1, nubes: 0.8, nubCol: '#aab0b2', est: 0, hondo: '#0c1d21', claro: '#3a5558', niebla: '#b8bbb7', dens: 0.011, olas: 0.3, hemi: 0.95, rayos: 0, part: 'oro', cam: 'lateral', linterna: 0, expo: 0.95, vel: 3 },
  { top: '#0b1215', hor: '#3b4947', sol: [0.3, 0.4, 0.4], solCol: '#9ab0aa', solTam: 0, solInt: 0.7, nubes: 0.95, nubCol: '#27312f', est: 0, hondo: '#02090b', claro: '#0e2929', niebla: '#252f2e', dens: 0.0068, olas: 0.8, hemi: 0.45, rayos: 0.25, part: 'espuma', cam: 'estrecho', linterna: 0.6, expo: 1.1, vel: 3, remolino: 1 },
  { top: '#6a5937', hor: '#ffd98c', sol: [-0.3, 0.3, -0.9], solCol: '#ffe2a2', solTam: 0.06, solInt: 3.0, nubes: 0.2, nubCol: '#f0d8a8', est: 0, hondo: '#0b2226', claro: '#4a6a5a', niebla: '#e7c78f', dens: 0.0055, olas: 0.4, hemi: 1.3, rayos: 0, part: 'polvo', cam: 'frontal', linterna: 0, expo: 0.9, vel: 2.5 },
  { top: '#3e7ea8', hor: '#cfe6df', sol: [0.4, 0.8, -0.3], solCol: '#fff8e8', solTam: 0.025, solInt: 2.2, nubes: 0.25, nubCol: '#ffffff', est: 0, hondo: '#032f39', claro: '#1a8989', niebla: '#bedfdb', dens: 0.0045, olas: 0.35, hemi: 1.3, rayos: 0, part: 'ninguna', cam: 'aereo', linterna: 0, expo: 0.95, vel: 1.5 },
  { top: '#060b1b', hor: '#2b3959', sol: [-0.9, 0.12, -0.35], solCol: '#b9c9f0', solTam: 0.015, solInt: 0.65, nubes: 0.15, nubCol: '#1a2238', est: 1, hondo: '#01050b', claro: '#0b192b', niebla: '#131b2f', dens: 0.0052, olas: 0.3, hemi: 0.38, rayos: 0, part: 'ninguna', cam: 'lateral', linterna: 1, expo: 1.15, vel: 11 },
  { top: '#293350', hor: '#f0a878', sol: [1, 0.07, -0.25], solCol: '#ffb272', solTam: 0.032, solInt: 1.6, nubes: 0.45, nubCol: '#c78f80', est: 0.15, hondo: '#06131b', claro: '#2d3d49', niebla: '#c79987', dens: 0.0058, olas: 0.4, hemi: 0.72, rayos: 0, part: 'ninguna', cam: 'A', linterna: 0.5, expo: 1, vel: 3 },
  { top: '#3a5a80', hor: '#e6c8a8', sol: [0.8, 0.3, -0.4], solCol: '#ffe0b8', solTam: 0.026, solInt: 1.8, nubes: 0.3, nubCol: '#e8d8c8', est: 0, hondo: '#07202b', claro: '#2a5565', niebla: '#ccb8a8', dens: 0.0042, olas: 0.3, hemi: 0.95, rayos: 0, part: 'ninguna', cam: 'alto', linterna: 0, expo: 0.95, vel: 2 },
];

const PLANOS = {
  A:       { pos: [-30, 7, 26],    mira: [6, 3.5, -16], fov: 38 },
  bajo:    { pos: [-20, 2.2, 16],  mira: [16, 6, -14],  fov: 46 },
  lateral: { pos: [-6, 4.2, 28],   mira: [-4, 4, 0],    fov: 38 },
  aereo:   { pos: [-18, 27, 24],   mira: [14, 0, -16],  fov: 42 },
  frontal: { pos: [24, 4.6, 9.5],  mira: [-2, 3, 0],    fov: 40 },
  alto:    { pos: [-32, 15, 32],   mira: [22, 2, -12],  fov: 40 },
  estrecho:{ pos: [-24, 14, 24],   mira: [22, 1, -16],  fov: 46 },
};

const PARTS = {
  lluvia:  { col: '#9fb2c4', tam: 0.16, vel: [-4, -26, 3],  caja: [90, 40, 90],  centro: [0, 14, 0],    a: 0.55, tw: 0, wob: 0 },
  brasas:  { col: '#ff7a30', tam: 0.42, vel: [1.4, 3.2, 0.4], caja: [130, 50, 90], centro: [55, 16, -30], a: 0.95, tw: 1, wob: 1.2 },
  ceniza:  { col: '#8c8782', tam: 0.28, vel: [0.6, -0.9, 0.2], caja: [100, 40, 80], centro: [10, 15, -12], a: 0.55, tw: 0, wob: 1.2 },
  petalos: { col: '#f2b9c2', tam: 0.34, vel: [0.5, -0.35, 0.2], caja: [90, 30, 90], centro: [12, 10, -10], a: 0.6, tw: 0, wob: 1.6 },
  polvo:   { col: '#e3c18e', tam: 0.2,  vel: [0.3, 0.25, 0.1], caja: [80, 30, 80],  centro: [10, 10, -10], a: 0.45, tw: 1, wob: 0.8 },
  viento:  { col: '#eef4fa', tam: 0.15, vel: [34, 0.4, -2],  caja: [150, 30, 110], centro: [0, 8, 0],    a: 0.5, tw: 0, wob: 0 },
  espuma:  { col: '#dfe8ea', tam: 0.22, vel: [0.3, 1.3, 0],  caja: [100, 7, 100],  centro: [20, 1.5, -10], a: 0.45, tw: 1, wob: 0.4 },
  chispas: { col: '#d99af2', tam: 0.34, vel: [0, 1.0, 0],    caja: [100, 40, 80],  centro: [55, 16, -38], a: 0.9, tw: 1, wob: 1.1 },
  almas:   { col: '#9fe2c2', tam: 0.55, vel: [0, 1.3, 0],    caja: [120, 50, 100], centro: [40, 20, -22], a: 0.4, tw: 1, wob: 0.7 },
  oro:     { col: '#f2ca7a', tam: 0.3,  vel: [2.4, 0.5, 2.6], caja: [100, 30, 80],  centro: [10, 11, -22], a: 0.85, tw: 1, wob: 1.1 },
  ninguna: { col: '#000000', tam: 0.1,  vel: [0, 0, 0],      caja: [10, 10, 10],   centro: [0, 0, 0],     a: 0, tw: 0, wob: 0 },
};

// ---------------------------------------------------------------- olas
const OLAS = [[1.0, 0.35, 0.22, 64], [0.4, 1.0, 0.18, 33], [1.0, 1.4, 0.14, 17], [-0.7, 1.0, 0.10, 8.5]];
function alturaOla(x, z, t, amp, viaje) {
  let y = 0;
  const px = x + viaje;
  for (const [dx, dz, st, wl] of OLAS) {
    const k = (2 * Math.PI) / wl, c = Math.sqrt(9.8 / k), l = Math.hypot(dx, dz);
    y += ((st * amp) / k) * Math.sin(k * ((dx / l) * px + (dz / l) * z - c * t));
  }
  return y;
}

const OCEANO_VERT = `
uniform float uTime, uAmp, uViaje, uRem; uniform vec2 uRemPos;
varying vec3 vP; varying vec3 vN; varying float vH; varying vec2 vRel;
vec3 gerstner(vec4 w, vec2 p, inout vec3 tg, inout vec3 bn){
  float k = 6.2831853 / w.w; float c = sqrt(9.8 / k); vec2 d = normalize(w.xy);
  float st = w.z * uAmp; float f = k * (dot(d, p) - c * uTime); float a = st / k;
  float sf = sin(f), cf = cos(f);
  tg += vec3(-d.x*d.x*st*sf, d.x*st*cf, -d.x*d.y*st*sf);
  bn += vec3(-d.x*d.y*st*sf, d.y*st*cf, -d.y*d.y*st*sf);
  return vec3(d.x*a*cf, a*sf, d.y*a*cf);
}
void main(){
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vec2 rel = wp.xz - uRemPos; float r = length(rel);
  float giro = uRem * 4.0 * exp(-r*r/1600.0);
  float cg = cos(giro), sg = sin(giro);
  vec2 relG = vec2(rel.x*cg - rel.y*sg, rel.x*sg + rel.y*cg);
  vec2 p = mix(wp.xz, relG + uRemPos, step(0.001, uRem)) + vec2(uViaje, 0.0);
  vec3 tg = vec3(1.0,0.0,0.0), bn = vec3(0.0,0.0,1.0), g = vec3(0.0);
  g += gerstner(vec4(1.0,0.35,0.22,64.0), p, tg, bn);
  g += gerstner(vec4(0.4,1.0,0.18,33.0), p, tg, bn);
  g += gerstner(vec4(1.0,1.4,0.14,17.0), p, tg, bn);
  g += gerstner(vec4(-0.7,1.0,0.10,8.5), p, tg, bn);
  wp.xyz += g;
  wp.y -= uRem * 15.0 * exp(-r*r/700.0);
  vec3 nn = normalize(cross(bn, tg));
  vN = normalize(vec3(nn.x*cg + nn.z*sg, nn.y, -nn.x*sg + nn.z*cg));
  vH = g.y; vP = wp.xyz; vRel = rel;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;
const OCEANO_FRAG = `
uniform vec3 uHondo, uClaro, uTop, uHor, uSolCol, uNiebla, uSolDir;
uniform float uSolInt, uDens, uDestello, uTime, uRem, uAmp;
varying vec3 vP; varying vec3 vN; varying float vH; varying vec2 vRel;
float hs(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
  return mix(mix(hs(i), hs(i+vec2(1,0)), f.x), mix(hs(i+vec2(0,1)), hs(i+vec2(1,1)), f.x), f.y); }
void main(){
  vec3 N = normalize(vN);
  vec2 q = vP.xz * 0.32 + vec2(uTime * 0.45, uTime * 0.2);
  float n1 = vn(q), n2 = vn(q * 2.3 + 7.1), n3 = vn(q * 5.1 - 3.3);
  N = normalize(N + vec3((n1 - 0.5) * 0.22 + (n3 - 0.5) * 0.1, 0.0, (n2 - 0.5) * 0.22));
  vec3 V = normalize(cameraPosition - vP);
  vec3 S = normalize(uSolDir);
  float fres = 0.02 + 0.98 * pow(1.0 - max(dot(N, V), 0.0), 5.0);
  vec3 R = reflect(-V, N);
  vec3 cielo = mix(uHor, uTop, pow(clamp(R.y, 0.0, 1.0), 0.5));
  float rs = max(dot(R, S), 0.0);
  vec3 agua = mix(uHondo, uClaro, clamp(vH * 0.3 + 0.35, 0.0, 1.0));
  float sss = pow(max(dot(V, -S), 0.0), 3.0) * clamp(vH * 0.5 + 0.2, 0.0, 1.0);
  agua += uClaro * sss * 0.5 * uSolInt;
  vec3 col = mix(agua, cielo, fres) + uSolCol * (pow(rs, 220.0) * 7.0 + pow(rs, 16.0) * 0.22) * uSolInt;
  float espuma = smoothstep(1.7, 2.7, vH / max(uAmp, 0.25) + (n1 - 0.5) * 1.2) * 0.45;
  float r = length(vRel);
  if (uRem > 0.01) {
    float a = atan(vRel.y, vRel.x);
    float sp = sin(a * 4.0 + log(r + 1.0) * 9.0 + uTime * 2.6);
    col = mix(col, col * 0.08, uRem * exp(-r*r/900.0));
    espuma += smoothstep(0.55, 1.0, sp) * uRem * exp(-r*r/2200.0) * 0.8 * smoothstep(3.0, 10.0, r);
  }
  col = mix(col, vec3(0.78, 0.82, 0.84) * (0.3 + uSolInt * 0.3), clamp(espuma, 0.0, 1.0));
  col += uDestello * vec3(0.45, 0.52, 0.66) * (0.2 + fres);
  float d = length(vP - cameraPosition);
  col = mix(col, uNiebla, 1.0 - exp(-uDens * uDens * d * d));
  gl_FragColor = vec4(col, 1.0);
  ${TONO}
}`;

const CIELO_VERT = `varying vec3 vDir; void main(){ vDir = position; vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; }`;
const CIELO_FRAG = `
uniform vec3 uTop, uHor, uSolDir, uSolCol, uNubCol, uNiebla;
uniform float uSolTam, uNubes, uEst, uTime, uDestello;
varying vec3 vDir;
float h3(vec3 p){ return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
float hs(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
  return mix(mix(hs(i), hs(i+vec2(1,0)), f.x), mix(hs(i+vec2(0,1)), hs(i+vec2(1,1)), f.x), f.y); }
float fbm(vec2 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 6; i++){ s += a * vn(p); p = p * 2.03 + vec2(1.7, 9.2); a *= 0.5; } return s; }
void main(){
  vec3 d = normalize(vDir); float y = d.y;
  vec3 col = mix(uHor, uTop, pow(clamp(y, 0.0, 1.0), 0.5));
  vec3 S = normalize(uSolDir); float s = max(dot(d, S), 0.0);
  col += uSolCol * (pow(s, 8.0) * 0.16 + pow(s, 48.0) * 0.45);
  vec2 uv = d.xz / (y + 0.09) * 0.55;
  float n = fbm(uv * 1.25 + vec2(uTime * 0.012, uTime * 0.004));
  float cub = smoothstep(0.62 - uNubes * 0.32, 0.92 - uNubes * 0.22, n) * smoothstep(-0.02, 0.1, y) * min(1.0, uNubes * 1.3);
  float cr = 1.0 - uSolTam * uSolTam * 0.5;
  float disco = smoothstep(cr - 0.00004, cr + 0.00002, s) * step(0.0005, uSolTam);
  col += uSolCol * disco * 3.2 * (1.0 - cub * 0.85);
  vec3 nube = uNubCol + uSolCol * pow(s, 3.0) * 0.26 * uNubes;
  col = mix(col, nube, cub);
  vec3 q = floor(d * 320.0);
  float st = step(0.9974, h3(q)) * uEst * smoothstep(0.02, 0.25, y) * (1.0 - cub);
  col += st * (0.55 + 0.45 * sin(uTime * 2.0 + h3(q + 1.0) * 40.0));
  col += uDestello * vec3(0.55, 0.62, 0.8) * (0.25 + cub * 1.4);
  col = mix(col, uNiebla, (1.0 - smoothstep(-0.02, 0.16, y)) * 0.7);
  gl_FragColor = vec4(col, 1.0);
  ${TONO}
}`;

const PART_VERT = `
uniform float uTime, uTam, uA, uPR, uTw, uWob; uniform vec3 uVel, uCaja, uCentro;
attribute vec3 aSemilla; varying float vA;
void main(){
  vec3 p = aSemilla * uCaja + uVel * uTime; p = mod(p, uCaja) - uCaja * 0.5;
  p.x += sin(uTime * 0.8 + aSemilla.y * 40.0) * uWob; p.z += cos(uTime * 0.6 + aSemilla.x * 30.0) * uWob;
  vec4 mv = viewMatrix * vec4(p + uCentro, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = uTam * uPR * (420.0 / max(1.0, -mv.z));
  float tw = mix(1.0, 0.35 + 0.65 * sin(uTime * 3.0 + aSemilla.z * 60.0), uTw);
  vec3 e = abs(p) / (uCaja * 0.5);
  vA = uA * tw * (1.0 - smoothstep(0.7, 1.0, max(e.x, max(e.y, e.z))));
}`;
const PART_FRAG = `uniform vec3 uCol; varying float vA;
void main(){ float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.05, d) * vA; if (a < 0.004) discard; gl_FragColor = vec4(uCol * a, a); }`;

// ---------------------------------------------------------------- la galera
function galera() {
  const nave = new THREE.Group();
  const L = 13, W = 2.3, D = 1.25, n = 30, m = 12;
  const vert = [], idx = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, x = (t - 0.5) * L;
    const w = Math.max(0.06, (W / 2) * Math.sin(Math.PI * t) ** 0.55);
    const d = D * (0.3 + 0.7 * Math.sin(Math.PI * t) ** 0.5);
    const popa = Math.max(0, (0.16 - t) / 0.16), proa = Math.max(0, (t - 0.86) / 0.14);
    const ztop = 0.55 + 1.5 * popa * popa + 0.45 * proa * proa;
    for (let j = 0; j <= m; j++) {
      const a = (Math.PI * j) / m;
      vert.push(x, ztop - d * Math.sin(a), w * Math.cos(a));
    }
  }
  const f = (i, j) => i * (m + 1) + j;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < m; j++) idx.push(f(i, j), f(i + 1, j), f(i + 1, j + 1), f(i, j), f(i + 1, j + 1), f(i, j + 1));
    idx.push(f(i, 0), f(i, m), f(i + 1, m), f(i, 0), f(i + 1, m), f(i + 1, 0));
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(vert, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const madera = estandar('#2a1b12', 0.72, 0, { side: THREE.DoubleSide });
  nave.add(new THREE.Mesh(geo, madera));
  const curva = new THREE.CatmullRomCurve3([[-6.2, 1.9, 0], [-6.9, 2.9, 0], [-6.3, 3.5, 0], [-5.7, 2.95, 0]].map((p) => new THREE.Vector3(...p)));
  nave.add(new THREE.Mesh(new THREE.TubeGeometry(curva, 24, 0.12, 8), madera));
  const bronce = estandar('#8a6636', 0.35, 0.9);
  const espolon = new THREE.Mesh(new THREE.ConeGeometry(0.32, 1.7, 8), bronce);
  espolon.rotation.z = -Math.PI / 2;
  espolon.position.set(7.1, -0.35, 0);
  nave.add(espolon);
  // el ojo pintado en la proa, como en las naves griegas
  const blanco = new THREE.MeshBasicMaterial({ color: '#cfc4b0' }), negro = new THREE.MeshBasicMaterial({ color: '#050403' });
  for (const lado of [1, -1]) {
    const o = new THREE.Mesh(new THREE.CircleGeometry(0.34, 20), blanco);
    o.position.set(5.2, 0.42, lado * 0.62);
    o.rotation.y = lado === 1 ? 0.35 : Math.PI - 0.35;
    const pu = new THREE.Mesh(new THREE.CircleGeometry(0.15, 16), negro);
    pu.position.set(0, 0, 0.01);
    o.add(pu);
    nave.add(o);
  }
  const mastil = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 8, 8), madera);
  mastil.position.set(0.6, 4.4, 0);
  const verga = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 7, 6), madera);
  verga.rotation.x = Math.PI / 2;
  verga.position.set(0.6, 7.9, 0);
  nave.add(mastil, verga);
  const vg = new THREE.PlaneGeometry(6.2, 4.2, 16, 12);
  const vp = vg.attributes.position;
  for (let i = 0; i < vp.count; i++) {
    const u = vp.getX(i) / 6.2, h = vp.getY(i) / 4.2;
    vp.setZ(i, 0.85 * Math.cos(Math.PI * u) * (0.4 + 0.6 * Math.cos(Math.PI * h)));
  }
  vg.computeVertexNormals();
  const velaMat = estandar('#5a4331', 1, 0, { side: THREE.DoubleSide });
  const vela = new THREE.Mesh(vg, velaMat);
  vela.rotation.y = Math.PI / 2;
  vela.position.set(0.75, 5.75, 0);
  nave.add(vela);
  const escudoG = new THREE.CylinderGeometry(0.42, 0.42, 0.08, 18);
  for (const lado of [1, -1]) for (let k = 0; k < 7; k++) {
    const e = new THREE.Mesh(escudoG, bronce);
    e.rotation.x = Math.PI / 2;
    e.position.set(-3.8 + k * 1.25, 0.58, lado * (W / 2 + 0.02));
    nave.add(e);
  }
  const remoG = new THREE.CylinderGeometry(0.045, 0.045, 4.4, 6);
  const remos = [];
  for (const lado of [1, -1]) for (let k = 0; k < 9; k++) {
    const piv = new THREE.Group();
    piv.position.set(-4.2 + k * 1.05, 0.35, lado * (W / 2 - 0.05));
    const r = new THREE.Mesh(remoG, madera);
    r.rotation.x = Math.PI / 2;
    r.position.z = lado * 2.2;
    piv.add(r);
    nave.add(piv);
    remos.push({ piv, lado, k });
  }
  const farol = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 8), new THREE.MeshBasicMaterial({ color: '#ffb46a' }));
  farol.position.set(-4.6, 1.6, 0);
  nave.add(farol);
  // Odiseo atado al mastil (solo frente a las sirenas)
  const atado = new THREE.Group();
  const oscuro = estandar('#0f0b09', 0.8);
  const cuerpo = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.26, 1.5, 10), oscuro);
  cuerpo.position.set(1.02, 1.35, 0);
  const cabeza = new THREE.Mesh(new THREE.SphereGeometry(0.27, 12, 10), oscuro);
  cabeza.position.set(1.02, 2.3, 0);
  atado.add(cuerpo, cabeza);
  for (const y of [0.95, 1.35, 1.75]) {
    const c = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.045, 6, 20), bronce);
    c.rotation.x = Math.PI / 2;
    c.position.set(0.82, y, 0);
    atado.add(c);
  }
  atado.visible = false;
  nave.add(atado);
  return { nave, remos, atado, velaMat, farol };
}

function balsa() {
  const g = new THREE.Group();
  const madera = estandar('#3a2a1c', 0.9);
  for (let i = 0; i < 7; i++) {
    const t = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 5.2, 7), madera);
    t.rotation.z = Math.PI / 2;
    t.position.set(0, 0.2, -1.5 + i * 0.5);
    g.add(t);
  }
  const m = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 3.6, 6), madera);
  m.position.set(0.4, 2, 0);
  const v = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 2), estandar('#6a5846', 1, 0, { side: THREE.DoubleSide }));
  v.rotation.y = Math.PI / 2;
  v.position.set(0.5, 2.5, 0);
  const oscuro = estandar('#0f0b09', 0.8);
  const cuerpo = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.3, 0.9, 8), oscuro);
  cuerpo.position.set(-1.2, 0.9, 0.2);
  const cabeza = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), oscuro);
  cabeza.position.set(-1.1, 1.55, 0.2);
  g.add(m, v, cuerpo, cabeza);
  g.visible = false;
  return g;
}

function mallaOceano(seg, R) {
  const pos = [], idx = [];
  const map = (u) => Math.sign(u) * (0.12 * Math.abs(u) + 0.88 * u * u) * R;
  for (let j = 0; j <= seg; j++) for (let i = 0; i <= seg; i++) {
    pos.push(map((i / seg) * 2 - 1), 0, map((j / seg) * 2 - 1));
  }
  for (let j = 0; j < seg; j++) for (let i = 0; i < seg; i++) {
    const a = j * (seg + 1) + i, b = a + 1, c = a + seg + 1, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  return g;
}

// ---------------------------------------------------------------- mundo
export function crearMundo(lienzo) {
  const movil = Math.min(innerWidth, innerHeight) < 700;
  const renderer = new THREE.WebGLRenderer({ canvas: lienzo, antialias: !movil, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, movil ? 1.6 : 1.35));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  const escena = new THREE.Scene();
  escena.fog = new THREE.FogExp2('#111921', 0.007);
  const camara = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, 0.5, 3000);

  const col = (h) => new THREE.Color(h);
  const uCielo = {
    uTop: { value: col('#000') }, uHor: { value: col('#000') }, uSolDir: { value: new THREE.Vector3(0, 1, 0) },
    uSolCol: { value: col('#fff') }, uNubCol: { value: col('#333') }, uNiebla: { value: col('#111') },
    uSolTam: { value: 0.02 }, uNubes: { value: 0.5 }, uEst: { value: 0 }, uTime: { value: 0 }, uDestello: { value: 0 },
  };
  const cielo = new THREE.Mesh(new THREE.SphereGeometry(1500, 48, 24),
    new THREE.ShaderMaterial({ uniforms: uCielo, vertexShader: CIELO_VERT, fragmentShader: CIELO_FRAG, side: THREE.BackSide, depthWrite: false }));
  cielo.renderOrder = -1;
  cielo.frustumCulled = false;
  escena.add(cielo);

  const uMar = {
    uTime: { value: 0 }, uAmp: { value: 1 }, uViaje: { value: 0 }, uRem: { value: 0 }, uRemPos: { value: new THREE.Vector2(58, -4) },
    uHondo: { value: col('#000') }, uClaro: { value: col('#000') }, uTop: uCielo.uTop, uHor: uCielo.uHor,
    uSolCol: uCielo.uSolCol, uNiebla: uCielo.uNiebla, uSolDir: uCielo.uSolDir,
    uSolInt: { value: 1 }, uDens: { value: 0.007 }, uDestello: uCielo.uDestello,
  };
  const mar = new THREE.Mesh(mallaOceano(movil ? 170 : 260, 900),
    new THREE.ShaderMaterial({ uniforms: uMar, vertexShader: OCEANO_VERT, fragmentShader: OCEANO_FRAG }));
  mar.frustumCulled = false;
  escena.add(mar);

  const hemi = new THREE.HemisphereLight('#ffffff', '#000000', 0.5);
  const sol = new THREE.DirectionalLight('#ffffff', 1);
  escena.add(hemi, sol, sol.target);
  const farolLuz = new THREE.PointLight('#ff9a4a', 0, 45, 1.2);
  escena.add(farolLuz);

  const { nave, remos, atado, farol } = galera();
  escena.add(nave);
  const laBalsa = balsa();
  escena.add(laBalsa);

  // particulas
  const N = movil ? 900 : 1600;
  const pg = new THREE.BufferGeometry();
  const sem = new Float32Array(N * 3);
  for (let i = 0; i < N * 3; i++) sem[i] = Math.random();
  pg.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(N * 3), 3));
  pg.setAttribute('aSemilla', new THREE.Float32BufferAttribute(sem, 3));
  const uPart = {
    uTime: { value: 0 }, uTam: { value: 0.2 }, uA: { value: 0 }, uPR: { value: renderer.getPixelRatio() }, uTw: { value: 0 }, uWob: { value: 0 },
    uVel: { value: new THREE.Vector3() }, uCaja: { value: new THREE.Vector3(10, 10, 10) }, uCentro: { value: new THREE.Vector3() }, uCol: { value: col('#fff') },
  };
  const puntos = new THREE.Points(pg, new THREE.ShaderMaterial({
    uniforms: uPart, vertexShader: PART_VERT, fragmentShader: PART_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  puntos.frustumCulled = false;
  escena.add(puntos);

  const decorados = crearDecorados();
  decorados.forEach((d) => {
    escena.add(d.grupo);
    d.luces.forEach(({ luz }) => {
      if (luz.parent) luz.parent.remove(luz);
      luz.userData.local = luz.position.clone();
      escena.add(luz);
    });
    if (d.extraFijo) escena.add(d.extraFijo);
    d.grupo.visible = false;
  });

  // estado interpolado (objetos reutilizables)
  const C = (k) => ({ a: new THREE.Color(), b: new THREE.Color(), k });
  const tmp = { top: new THREE.Color(), hor: new THREE.Color(), solCol: new THREE.Color(), nubCol: new THREE.Color(), hondo: new THREE.Color(), claro: new THREE.Color(), niebla: new THREE.Color() };
  const va = new THREE.Vector3(), vb = new THREE.Vector3();
  const camPos = new THREE.Vector3(), camMira = new THREE.Vector3(), miraSuave = new THREE.Vector3(8, 2.5, -5), posSuave = new THREE.Vector3(-19, 5.5, 16);
  let viaje = 0, destello = 0, proxRayo = 3, sPrev = 0, primera = true;
  const reducir = matchMedia('(prefers-reduced-motion: reduce)').matches;

  function redimensionar() {
    const w = innerWidth, h = innerHeight;
    renderer.setSize(w, h, false);
    camara.aspect = w / h;
    camara.updateProjectionMatrix();
  }
  redimensionar();

  function mezclar(s) {
    const i0 = clamp(Math.floor(s), 0, E.length - 1), i1 = Math.min(i0 + 1, E.length - 1);
    const f = suave(clamp(s - i0));
    const a = E[i0], b = E[i1];
    const r = {};
    for (const k of ['top', 'hor', 'solCol', 'nubCol', 'hondo', 'claro', 'niebla']) r[k] = tmp[k].set(a[k]).lerp(new THREE.Color(b[k]), f);
    for (const k of ['solTam', 'solInt', 'nubes', 'est', 'dens', 'olas', 'hemi', 'rayos', 'linterna', 'expo', 'vel']) r[k] = lerp(a[k], b[k], f);
    r.remolino = lerp(a.remolino || 0, b.remolino || 0, f);
    r.sol = va.set(...a.sol).normalize().lerp(vb.set(...b.sol).normalize(), f).normalize();
    const pa = PLANOS[a.cam], pb = PLANOS[b.cam];
    r.camPos = camPos.set(...pa.pos).lerp(new THREE.Vector3(...pb.pos), f);
    r.camMira = camMira.set(...pa.mira).lerp(new THREE.Vector3(...pb.mira), f);
    r.fov = lerp(pa.fov, pb.fov, f);
    return r;
  }

  function actualizar(s, t, dt, puntero) {
    const r = mezclar(s);
    uCielo.uTop.value.copy(r.top); uCielo.uHor.value.copy(r.hor); uCielo.uSolCol.value.copy(r.solCol);
    uCielo.uNubCol.value.copy(r.nubCol); uCielo.uNiebla.value.copy(r.niebla); uCielo.uSolDir.value.copy(r.sol);
    uCielo.uSolTam.value = r.solTam; uCielo.uNubes.value = r.nubes; uCielo.uEst.value = r.est; uCielo.uTime.value = t;
    uMar.uHondo.value.copy(r.hondo); uMar.uClaro.value.copy(r.claro);
    uMar.uSolInt.value = r.solInt; uMar.uDens.value = r.dens; uMar.uAmp.value = r.olas; uMar.uTime.value = t;
    uMar.uRem.value = r.remolino;
    viaje += dt * r.vel;
    uMar.uViaje.value = viaje;
    escena.fog.color.copy(r.niebla); escena.fog.density = r.dens;
    renderer.toneMappingExposure = r.expo;
    hemi.color.copy(r.top).lerp(r.hor, 0.5).multiplyScalar(1.4); hemi.groundColor.copy(r.hondo); hemi.intensity = r.hemi + destello * 2;
    sol.color.copy(r.solCol); sol.intensity = r.solInt * 1.6 + destello * 4;
    sol.position.copy(r.sol).multiplyScalar(100); sol.target.position.set(0, 0, 0);

    // relampagos
    if (!reducir && r.rayos > 0.02) {
      proxRayo -= dt;
      if (proxRayo <= 0) { destello = 1; proxRayo = 1.5 + Math.random() * 6 / r.rayos; if (api.alRayo) api.alRayo(); }
    }
    const cruza = (x) => (sPrev < x && s >= x) || (sPrev > x && s <= x);
    if (!primera && cruza(11.45)) { destello = 1.4; if (api.alRayo) api.alRayo(); }
    sPrev = s; primera = false;
    destello = Math.max(0, destello - dt * (destello > 0.6 ? 5 : 1.6));
    uCielo.uDestello.value = destello * (0.6 + 0.4 * Math.sin(t * 60));

    // camara con respiracion de mano
    const retrato = camara.aspect < 1;
    const m = reducir ? 0 : 1;
    posSuave.lerp(r.camPos, 1 - Math.pow(0.04, dt));
    miraSuave.lerp(r.camMira, 1 - Math.pow(0.04, dt));
    camara.position.copy(posSuave);
    if (retrato) camara.position.add(new THREE.Vector3(-6, 3, 8));
    camara.position.x += Math.sin(t * 0.17) * 0.9 * m;
    camara.position.y += Math.sin(t * 0.23) * 0.35 * m + puntero.y * 0.8 * m;
    camara.position.z += Math.cos(t * 0.13) * 0.6 * m + puntero.x * 1.2 * m;
    camara.lookAt(miraSuave);
    camara.fov = retrato ? Math.min(78, r.fov * 1.55) : r.fov;
    camara.updateProjectionMatrix();
    cielo.position.copy(camara.position);

    // la nave flota sobre la ola
    const h = (x, z) => alturaOla(x, z, t, r.olas, viaje);
    const hc = h(0, 0), hp = h(5, 0), hs = h(-5, 0), hb = h(0, 1.5), he = h(0, -1.5);
    const enBalsa = s > 11.45 && s < 12.55;
    const flota = enBalsa ? laBalsa : nave;
    nave.visible = !enBalsa; laBalsa.visible = enBalsa;
    flota.position.set(0, hc * 0.9 - (enBalsa ? 0 : 0.05), 0);
    flota.rotation.set(Math.atan2(he - hb, 3) * 0.8, 0, Math.atan2(hp - hs, 10) * 0.9);
    remos.forEach(({ piv, lado, k }) => {
      const ph = t * (2 * Math.PI / 2.4) * m + k * 0.05;
      piv.rotation.set(lado * (0.5 + 0.14 * Math.sin(ph)), lado * 0.3 * Math.cos(ph), 0);
    });
    atado.visible = Math.abs(s - 9) < 0.7;
    farolLuz.position.copy(farol.getWorldPosition(va)).add(vb.set(0, 0.5, 0));
    farolLuz.intensity = r.linterna * (22 + Math.sin(t * 9) * 3) * (nave.visible ? 1 : 0);

    // particulas del capitulo mas cercano
    const cerca = E[clamp(Math.round(s), 0, E.length - 1)];
    const P = PARTS[cerca.part];
    const peso = 1 - suave(clamp((Math.abs(s - Math.round(s)) - 0.3) / 0.2));
    uPart.uCol.value.set(P.col); uPart.uTam.value = P.tam; uPart.uA.value = P.a * peso;
    uPart.uVel.value.set(...P.vel); uPart.uCaja.value.set(...P.caja); uPart.uCentro.value.set(...P.centro);
    uPart.uTw.value = P.tw; uPart.uWob.value = P.wob; uPart.uTime.value = reducir ? 0 : t;

    // decorados
    const ctx = { camara, puntero, altura: h, peso: 0 };
    decorados.forEach((d) => {
      let p = s - d.id;
      if (d.permanece && p > 0) p = 0;
      const w = 1 - suave(clamp((Math.abs(p) - 0.42) / 0.3));
      d.grupo.visible = w > 0.002;
      d.luces.forEach(({ luz, int }) => {
        luz.intensity = int * w * (luz.userData.parpadeo ?? 1);
        luz.position.copy(d.grupo.position).add(luz.userData.local);
      });
      ctx.peso = w;
      if (d.extraFijo && w <= 0.002) d.extraFijo.visible = false;
      if (w > 0.002 || d.extraFijo) {
        d.grupo.position.copy(d.base).addScaledVector(d.alejar, Math.abs(p) * 55);
        d.update(t, p, ctx);
      }
    });
    renderer.render(escena, camara);
  }

  const api = { actualizar, redimensionar, renderer, alRayo: null };
  return api;
}
