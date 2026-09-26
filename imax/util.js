import * as THREE from './three.module.min.js';

// Ruido de valor 3D determinista (para modelar islas y rocas)
function hash3(x, y, z) {
  let h = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
  return h - Math.floor(h);
}
function ruido3(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const xf = x - xi, yf = y - yi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf);
  const l = (a, b, t) => a + (b - a) * t;
  const c = (dx, dy, dz) => hash3(xi + dx, yi + dy, zi + dz);
  return l(l(l(c(0, 0, 0), c(1, 0, 0), u), l(c(0, 1, 0), c(1, 1, 0), u), v),
           l(l(c(0, 0, 1), c(1, 0, 1), u), l(c(0, 1, 1), c(1, 1, 1), u), v), w);
}
export function fbm3(x, y, z, oct = 4) {
  let s = 0, a = 0.5, f = 1;
  for (let i = 0; i < oct; i++) { s += a * ruido3(x * f, y * f, z * f); a *= 0.5; f *= 2.03; }
  return s;
}

export function estandar(color, rough = 0.9, metal = 0, extra = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, ...extra });
}

// Isla o roca: icosaedro deformado con ruido; base aplanada o colgante (isla flotante)
export function isla({ sx = 40, sy = 12, sz = 30, color = '#1a1714', semilla = 1, rugo = 0.42,
                       detalle = 0, flotante = false, rough = 0.95 } = {}) {
  const g = new THREE.IcosahedronGeometry(1, detalle || (Math.max(sx, sy, sz) > 45 ? 6 : 5));
  const pos = g.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const n = fbm3(v.x * 1.9 + semilla * 7.3, v.y * 1.9 + semilla, v.z * 1.9 - semilla * 3.1, 5);
    const fino = fbm3(v.x * 7.5 - semilla, v.y * 7.5 + semilla * 2.1, v.z * 7.5, 4);
    v.multiplyScalar(1 + (n - 0.5) * rugo * 2 + (fino - 0.5) * rugo * 0.38);
    if (v.y < 0) v.y *= flotante ? 1.8 : 0.04;
    pos.setXYZ(i, v.x * sx, v.y * sy, v.z * sz);
  }
  g.computeVertexNormals();
  return new THREE.Mesh(g, estandar(color, rough));
}

export const lerp = (a, b, t) => a + (b - a) * t;
export const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const suave = (t) => t * t * (3 - 2 * t);
export const campana = (p, ancho = 1) => Math.max(0, 1 - Math.abs(p) / ancho);
