import * as THREE from './three.module.min.js';
import { isla, estandar, fbm3 } from './util.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const TONO = '#include <tonemapping_fragment>\n#include <colorspace_fragment>';

function en(m, p) { m.position.copy(p); return m; }
function pieza(id, base, alejar, extra = {}) {
  const grupo = new THREE.Group();
  return { id, grupo, base, alejar: alejar.clone().normalize(), luces: [], update: () => {}, ...extra };
}
function luz(p, color, int, dist, pos) {
  const l = new THREE.PointLight(color, 0, dist, 1.1);
  l.position.copy(pos);
  p.luces.push({ luz: l, int });
  return l;
}
function caja(w, h, d, mat, x, y, z) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  return m;
}
function templo(mat, ancho = 22, fondo = 10, alto = 9, cols = 8) {
  const g = new THREE.Group();
  g.add(caja(ancho + 2, 1.2, fondo + 2, mat, 0, 0.6, 0));
  const colG = new THREE.CylinderGeometry(0.75, 0.85, alto, 12);
  for (let i = 0; i < cols; i++) {
    const x = -ancho / 2 + (ancho / (cols - 1)) * i;
    for (const z of [-fondo / 2, fondo / 2]) {
      const c = new THREE.Mesh(colG, mat);
      c.position.set(x, 1.2 + alto / 2, z);
      g.add(c);
    }
  }
  g.add(caja(ancho + 2, 1.4, fondo + 2, mat, 0, 1.2 + alto + 0.7, 0));
  const tri = new THREE.Shape();
  tri.moveTo(-(ancho + 2) / 2, 0); tri.lineTo((ancho + 2) / 2, 0); tri.lineTo(0, 3.2); tri.lineTo(-(ancho + 2) / 2, 0);
  const fr = new THREE.Mesh(new THREE.ExtrudeGeometry(tri, { depth: fondo + 2, bevelEnabled: false }), mat);
  fr.position.set(0, 1.2 + alto + 1.4, -(fondo + 2) / 2);
  g.add(fr);
  return g;
}
function ventanas(n, area, color, semilla = 3) {
  const g = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({ color });
  const geo = new THREE.BoxGeometry(0.9, 1.2, 0.9);
  for (let i = 0; i < n; i++) {
    const r = (k) => fbm3(i * 3.1 + semilla, k * 7.7, semilla) * 2 - 1;
    const m = new THREE.Mesh(geo, mat);
    m.position.set(r(1) * area.x, area.y + Math.abs(r(2)) * 3, r(3) * area.z);
    g.add(m);
  }
  return g;
}

let texHumo = null;
function texturaHumo() {
  if (texHumo) return texHumo;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d');
  const gr = x.createRadialGradient(64, 64, 4, 64, 64, 62);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.45, 'rgba(255,255,255,.55)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = gr;
  x.fillRect(0, 0, 128, 128);
  texHumo = new THREE.CanvasTexture(c);
  return texHumo;
}
function columnasHumo(g, focos, color = '#1b1a19', alto = 70, op = 0.5) {
  const hs = [];
  focos.forEach((f, k) => {
    for (let i = 0; i < 14; i++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: texturaHumo(), color, transparent: true, depthWrite: false, opacity: 0 }));
      g.add(sp);
      hs.push({ sp, f, fase: i / 14 + k * 0.13 });
    }
  });
  return (t) => hs.forEach(({ sp, f, fase }) => {
    const c = (t * 0.035 + fase) % 1;
    const y = c * alto;
    sp.position.set(f.x + y * 0.32 + Math.sin(t * 0.4 + fase * 20) * 1.5, f.y + y, f.z);
    sp.scale.setScalar(5 + y * 0.42);
    sp.material.opacity = op * Math.sin(Math.min(1, c * 5) * Math.PI / 2) * (1 - c);
  });
}

// ---------------------------------------------------------------- I Troya
function troya() {
  const p = pieza(1, V(95, 0, -55), V(1, 0, -0.6));
  const g = p.grupo;
  g.add(isla({ sx: 58, sy: 9, sz: 30, color: '#120d0b', semilla: 2 }));
  const piedra = estandar('#1c1512');
  g.add(caja(62, 7, 3, piedra, 0, 11, 8));
  for (let i = 0; i < 7; i++) g.add(caja(5, 17, 5, piedra, -30 + i * 10, 13, 8));
  g.add(caja(20, 12, 14, piedra, 4, 13, -4));
  const fuegoMat = new THREE.MeshBasicMaterial({ color: '#ff7a2e' });
  const fuegos = [];
  for (let i = 0; i < 16; i++) {
    const f = new THREE.Mesh(new THREE.SphereGeometry(1.2 + (i % 3) * 0.6, 10, 8), fuegoMat);
    f.position.set(-28 + i * 3.8, 15 + (i % 4) * 2.5, 8 + ((i * 7) % 5) - 6);
    fuegos.push(f);
    g.add(f);
  }
  const l = luz(p, '#ff6a2a', 90, 260, V(0, 26, 20));
  g.add(l);
  const humoT = columnasHumo(g, [V(-20, 18, 6), V(2, 20, 2), V(22, 17, 7)], '#150d0a', 80, 0.55);
  p.update = (t) => {
    humoT(t);
    fuegos.forEach((f, i) => f.scale.setScalar(0.75 + 0.35 * Math.sin(t * 7 + i * 1.7) * Math.sin(t * 3.1 + i)));
    l.userData.parpadeo = 0.8 + 0.2 * Math.sin(t * 9) * Math.sin(t * 5.3);
  };
  return p;
}

// ---------------------------------------------------------------- II Cicones
function cicones() {
  const p = pieza(2, V(10, 0, -72), V(0.2, 0, -1));
  const g = p.grupo;
  g.add(isla({ sx: 95, sy: 7, sz: 16, color: '#26221f', semilla: 5 }));
  const muro = estandar('#2e2925');
  for (let i = 0; i < 9; i++) g.add(caja(4 + (i % 3) * 2, 3 + (i % 4) * 1.5, 4, muro, -30 + i * 7, 7, 4));
  const humoC = columnasHumo(g, [V(-22, 7, 4), V(-2, 8, 2), V(18, 7, 5)], '#252321', 75, 0.62);
  p.update = (t) => humoC(t);
  return p;
}

// ---------------------------------------------------------------- III Lotofagos
function lotofagos() {
  const p = pieza(3, V(48, 0, -50), V(1, 0, -0.7));
  const g = p.grupo;
  g.add(isla({ sx: 36, sy: 5, sz: 22, color: '#4c5a36', semilla: 8, rugo: 0.3 }));
  const copa = estandar('#26351f');
  const tronco = estandar('#2a1e15');
  for (let i = 0; i < 9; i++) {
    const x = -24 + i * 6, z = ((i * 13) % 11) - 5;
    g.add(en(new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.6, 7, 6), tronco), V(x, 7, z)));
    g.add(en(new THREE.Mesh(new THREE.SphereGeometry(3.4, 10, 8), copa), V(x, 11.5, z)));
  }
  // flores de loto flotando alrededor de la nave (no se alejan con la isla)
  const n = 110;
  const flor = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.9, 0.3, 0.35, 7),
    estandar('#e9c9c6', 0.7, 0, { emissive: '#3a2020' }), n);
  const semillas = [];
  for (let i = 0; i < n; i++) {
    const a = i * 2.39996, r = 9 + Math.sqrt(i / n) * 48;
    semillas.push([Math.cos(a) * r + 8, Math.sin(a) * r - 6, i]);
  }
  p.extraFijo = flor;
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3();
  p.update = (t, pp, ctx) => {
    const w = ctx.peso;
    semillas.forEach(([x, z, i]) => {
      const h = ctx.altura(x, z);
      s.setScalar(Math.max(0.001, w));
      q.setFromEuler(new THREE.Euler(0, t * 0.1 + i, 0));
      m4.compose(V(x, h + 0.15, z), q, s);
      flor.setMatrixAt(i, m4);
    });
    flor.instanceMatrix.needsUpdate = true;
    flor.visible = w > 0.01;
  };
  return p;
}

// ---------------------------------------------------------------- IV Polifemo
const OJO_VERT = `varying vec3 vL; varying vec3 vN; varying vec3 vP;
void main(){ vL = position; vN = normalize(mat3(modelMatrix) * normal); vec4 w = modelMatrix * vec4(position,1.0); vP = w.xyz;
gl_Position = projectionMatrix * viewMatrix * w; }`;
const OJO_FRAG = `uniform float uPupila; uniform float uTime; varying vec3 vL; varying vec3 vN; varying vec3 vP;
void main(){
  vec3 n = normalize(vL); float r = length(n.xy); float fr = step(0.0, n.z);
  float ang = atan(n.y, n.x);
  float fib = 0.5 + 0.5 * sin(ang * 46.0 + sin(ang * 9.0 + r * 30.0) * 2.2);
  vec3 esclera = vec3(0.2, 0.1, 0.07) + vec3(0.16,0.02,0.0) * smoothstep(0.5, 1.0, r);
  vec3 iris = mix(vec3(0.38, 0.15, 0.02), vec3(1.0, 0.64, 0.16), fib * 0.55 + smoothstep(0.1, 0.42, r) * 0.45);
  float R = 0.43;
  vec3 c = mix(esclera, iris, fr * (1.0 - smoothstep(R - 0.015, R + 0.01, r)));
  c = mix(c, vec3(0.06, 0.02, 0.0), fr * smoothstep(R - 0.06, R - 0.01, r) * (1.0 - smoothstep(R, R + 0.02, r)));
  c = mix(c, vec3(0.0), fr * (1.0 - smoothstep(uPupila - 0.012, uPupila + 0.012, r)));
  vec3 N = normalize(vN); vec3 Vd = normalize(cameraPosition - vP);
  vec3 Ld = normalize(vec3(0.35, 0.55, 0.75));
  float spec = pow(max(dot(reflect(-Ld, N), Vd), 0.0), 90.0);
  float rim = pow(1.0 - max(dot(N, Vd), 0.0), 3.0);
  vec3 col = c * (0.6 + 0.5 * max(dot(N, Ld), 0.0)) * 1.25 + vec3(1.0,0.55,0.12) * fr * (1.0 - smoothstep(0.1, 0.43, r)) * 0.35 + spec * vec3(1.0, 0.86, 0.62) * 1.6 + rim * vec3(0.45, 0.16, 0.03);
  gl_FragColor = vec4(col, 1.0);
  ${TONO}
}`;
function polifemo() {
  const p = pieza(4, V(88, 0, -20), V(1, 0.05, -0.3));
  const g = p.grupo;
  g.add(isla({ sx: 42, sy: 36, sz: 30, color: '#16110f', semilla: 11, rugo: 0.55 }));
  const roca = g.children[0];
  const haciaCam = V(-0.943, 0, 0.332).normalize();
  roca.updateMatrixWorld(true);
  const rc = new THREE.Raycaster(haciaCam.clone().multiplyScalar(140).setY(15), haciaCam.clone().negate());
  const hit = rc.intersectObject(roca)[0];
  const sup = hit ? hit.point : haciaCam.clone().multiplyScalar(40).setY(15);
  const boca = new THREE.Mesh(new THREE.CircleGeometry(13, 40), new THREE.MeshBasicMaterial({ color: '#000' }));
  boca.scale.set(1, 0.72, 1);
  boca.position.copy(sup).addScaledVector(haciaCam, 2.2);
  boca.lookAt(boca.position.clone().add(haciaCam));
  g.add(boca);
  const umat = { uPupila: { value: 0.16 }, uTime: { value: 0 } };
  const ojo = new THREE.Mesh(new THREE.SphereGeometry(6.2, 64, 40),
    new THREE.ShaderMaterial({ uniforms: umat, vertexShader: OJO_VERT, fragmentShader: OJO_FRAG }));
  const ojoPiv = new THREE.Group();
  ojoPiv.position.copy(sup).addScaledVector(haciaCam, 3.2);
  ojoPiv.add(ojo);
  const carne = estandar('#1d110c', 0.75);
  const sup_ = new THREE.Mesh(new THREE.SphereGeometry(6.9, 40, 20, 0, Math.PI * 2, 0, 1.05), carne);
  const inf_ = new THREE.Mesh(new THREE.SphereGeometry(6.9, 40, 20, 0, Math.PI * 2, Math.PI - 0.95, 0.95), carne);
  ojoPiv.add(sup_, inf_);
  const orbita = new THREE.Mesh(new THREE.TorusGeometry(7.6, 2.4, 16, 48), estandar('#140d0a', 0.9));
  orbita.scale.set(1, 0.78, 1);
  ojoPiv.add(orbita);
  ojoPiv.lookAt(ojoPiv.position.clone().add(haciaCam));
  g.add(ojoPiv);
  const l = luz(p, '#ff8a3a', 28, 70, ojoPiv.position.clone().add(haciaCam.clone().multiplyScalar(6)));
  g.add(l);
  const mira = new THREE.Vector3();
  let parpado = 0;
  p.update = (t, pp, ctx) => {
    mira.copy(ctx.camara.position).add(V(ctx.puntero.x * 14, ctx.puntero.y * 8, 0));
    const w = ojoPiv.localToWorld(V(0, 0, 0));
    const m = new THREE.Matrix4().lookAt(mira, w, V(0, 1, 0));
    const qObj = new THREE.Quaternion().setFromRotationMatrix(m);
    const qPadre = new THREE.Quaternion();
    ojoPiv.getWorldQuaternion(qPadre);
    ojo.quaternion.slerp(qPadre.invert().multiply(qObj), 0.08);
    const ciclo = t % 5.2;
    parpado = ciclo < 0.18 ? Math.sin((ciclo / 0.18) * Math.PI) : 0;
    sup_.rotation.x = parpado * 0.95; inf_.rotation.x = -parpado * 0.8;
    umat.uPupila.value = 0.13 + 0.05 * Math.sin(t * 0.7);
    umat.uTime.value = t;
  };
  return p;
}

// ---------------------------------------------------------------- V Eolo
function eolo() {
  const p = pieza(5, V(-130, 34, -4), V(-1, 0.25, 0.2));
  const g = p.grupo;
  g.add(isla({ sx: 36, sy: 12, sz: 28, color: '#2d2723', semilla: 14, flotante: true }));
  const muro = new THREE.Mesh(new THREE.CylinderGeometry(30, 30, 8, 72, 1, true),
    estandar('#a27a42', 0.32, 0.9, { side: THREE.DoubleSide }));
  muro.position.y = 8;
  g.add(muro);
  p.update = (t) => { g.rotation.y = t * 0.05; g.position.y += Math.sin(t * 0.6) * 1.2; };
  return p;
}

// ---------------------------------------------------------------- VI Lestrigones
function lestrigones() {
  const p = pieza(6, V(0, 0, 0), V(1, 0, 0));
  const g = p.grupo;
  const izq = isla({ sx: 110, sy: 50, sz: 13, color: '#1a201e', semilla: 17, rugo: 0.5 });
  izq.position.set(70, 0, -38);
  const der = isla({ sx: 110, sy: 42, sz: 13, color: '#181d1b', semilla: 19, rugo: 0.5 });
  der.position.set(70, 0, 36);
  g.add(izq, der);
  const rocaMat = estandar('#231f1c');
  const salpMat = new THREE.MeshBasicMaterial({ color: '#dfe6e6', transparent: true, opacity: 0, depthWrite: false });
  const rocas = [];
  for (let i = 0; i < 4; i++) {
    const r = new THREE.Mesh(new THREE.DodecahedronGeometry(2.6 + (i % 2), 0), rocaMat);
    const s = new THREE.Mesh(new THREE.ConeGeometry(4, 9, 14, 1, true), salpMat.clone());
    const ox = 22 + i * 17, oz = i % 2 ? 24 : -26;
    rocas.push({ r, s, ox, oz, fase: i * 0.83 });
    g.add(r, s);
  }
  p.update = (t) => {
    rocas.forEach((o) => {
      const c = ((t * 0.42 + o.fase) % 1);
      const y = 48 * (1 - c * c) - 2;
      o.r.position.set(o.ox + c * 6, y, o.oz * (1 - c * 0.55));
      o.r.rotation.set(t * 2, t * 1.3, 0);
      const imp = c > 0.93 ? (c - 0.93) / 0.07 : 0;
      o.s.position.set(o.ox + 6, 3 + imp * 3, o.oz * 0.45);
      o.s.scale.set(0.6 + imp * 1.3, 0.3 + imp * 1.2, 0.6 + imp * 1.3);
      o.s.material.opacity = imp > 0 ? 0.75 * (1 - imp * 0.6) : 0;
    });
  };
  return p;
}

// ---------------------------------------------------------------- VII Circe
function circe() {
  const p = pieza(7, V(112, 0, -42), V(1, 0, -0.4));
  const g = p.grupo;
  g.add(isla({ sx: 30, sy: 9, sz: 20, color: '#172219', semilla: 23 }));
  const piedra = estandar('#35303b');
  const torre = new THREE.Mesh(new THREE.CylinderGeometry(3.4, 4.6, 28, 18), piedra);
  torre.position.set(-8, 18, 6);
  const techo = new THREE.Mesh(new THREE.ConeGeometry(5.6, 9, 18), estandar('#221c29'));
  techo.position.set(-8, 36.5, 6);
  const ventana = new THREE.Mesh(new THREE.PlaneGeometry(2, 3.4), new THREE.MeshBasicMaterial({ color: '#f0b6ff' }));
  ventana.position.set(-10.4, 25, 9.1);
  ventana.rotation.y = -0.85;
  g.add(torre, techo, ventana);
  const l = luz(p, '#c27cff', 45, 150, V(-14, 26, 14));
  g.add(l);
  p.update = (t) => { ventana.material.color.setHSL(0.8, 0.9, 0.72 + 0.08 * Math.sin(t * 2.3)); };
  return p;
}

// ---------------------------------------------------------------- VIII Inframundo
const ALMA_FRAG = `uniform float uA; uniform float uTime; varying vec2 vUv; uniform float uSem;
void main(){
  vec2 u = vUv; u.x += sin(u.y * 9.0 + uTime * 1.6 + uSem) * 0.04 * (1.0 - u.y);
  float cuerpo = smoothstep(0.34, 0.1, abs(u.x - 0.5)) * smoothstep(0.0, 0.45, u.y) * (1.0 - smoothstep(0.72, 0.8, u.y));
  float cab = smoothstep(0.13, 0.05, length((u - vec2(0.5, 0.84)) * vec2(1.0, 1.7)));
  float a = max(cuerpo * 0.7, cab) * uA;
  gl_FragColor = vec4(vec3(0.62, 0.95, 0.8) * a, a);
}`;
function inframundo() {
  const p = pieza(8, V(26, 0, -12), V(1, 0, -0.5));
  const g = p.grupo;
  const orilla = isla({ sx: 130, sy: 4, sz: 20, color: '#050706', semilla: 29 });
  orilla.position.set(20, 0, -58);
  g.add(orilla);
  const almas = [];
  const vert = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`;
  for (let i = 0; i < 22; i++) {
    const u = { uA: { value: 0 }, uTime: { value: 0 }, uSem: { value: i * 1.7 } };
    const m = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 11), new THREE.ShaderMaterial({
      uniforms: u, vertexShader: vert, fragmentShader: ALMA_FRAG, transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
    const x = -30 + ((i * 37) % 64), z = -24 + ((i * 23) % 34);
    almas.push({ m, u, x, z, fase: (i * 0.137) % 1 });
    g.add(m);
  }
  p.update = (t, pp, ctx) => {
    almas.forEach((a) => {
      const c = (t * 0.045 + a.fase) % 1;
      a.m.position.set(a.x + Math.sin(t * 0.3 + a.fase * 9) * 2, 2 + c * 26, a.z);
      a.m.quaternion.copy(ctx.camara.quaternion);
      a.u.uA.value = Math.sin(c * Math.PI) * 0.9 * ctx.peso;
      a.u.uTime.value = t;
    });
  };
  return p;
}

// ---------------------------------------------------------------- IX Sirenas
function sirenas() {
  const p = pieza(9, V(16, 0, -50), V(0.3, 0, -1));
  const g = p.grupo;
  const roca = estandar('#292725', 0.85);
  for (let i = 0; i < 7; i++) {
    const geo = new THREE.ConeGeometry(5 + (i % 3) * 2.5, 14 + ((i * 7) % 5) * 4, 7, 3);
    const pos = geo.attributes.position;
    for (let k = 0; k < pos.count; k++) {
      const j = fbm3(pos.getX(k) * 0.4 + i, pos.getY(k) * 0.4, pos.getZ(k) * 0.4) - 0.5;
      pos.setX(k, pos.getX(k) * (1 + j * 0.6));
      pos.setZ(k, pos.getZ(k) * (1 + j * 0.6));
    }
    geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, roca);
    m.position.set(-24 + i * 8, geo.parameters.height / 2 - 1, ((i * 5) % 7) - 3);
    g.add(m);
  }
  const huesos = new THREE.InstancedMesh(new THREE.SphereGeometry(0.5, 6, 4), estandar('#d9d1c0', 0.6), 60);
  const m4 = new THREE.Matrix4();
  for (let i = 0; i < 60; i++) {
    m4.compose(V(-28 + (i * 1.03) % 56, 0.6 + (i % 4) * 0.5, -4 + (i * 7) % 9),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(i, i * 2, 0)), V(1.6, 0.35, 0.35));
    huesos.setMatrixAt(i, m4);
  }
  g.add(huesos);
  // tres sirenas: aves oscuras con cabeza humana, posadas en las rocas
  const cuerpoMat = estandar('#0d0c0b', 0.8);
  const aves = [];
  [[-16, 24, 1], [0, 21, 2], [14, 26, 3]].forEach(([x, y, s]) => {
    const a = new THREE.Group();
    const cuerpo = new THREE.Mesh(new THREE.SphereGeometry(1.1, 12, 8), cuerpoMat);
    cuerpo.scale.set(1.5, 1, 1);
    const cabeza = new THREE.Mesh(new THREE.SphereGeometry(0.55, 10, 8), cuerpoMat);
    cabeza.position.set(1.2, 1.1, 0);
    const alaG = new THREE.Shape();
    alaG.moveTo(0, 0); alaG.lineTo(-3.4, 2.2); alaG.lineTo(-2.2, 0.2); alaG.lineTo(0, 0);
    const alas = [1, -1].map((lado) => {
      const w = new THREE.Mesh(new THREE.ShapeGeometry(alaG), new THREE.MeshStandardMaterial({ color: '#0d0c0b', side: THREE.DoubleSide }));
      const piv = new THREE.Group();
      piv.position.set(0, 0.6, lado * 0.4);
      piv.add(w);
      a.add(piv);
      return { piv, lado };
    });
    a.add(cuerpo, cabeza);
    a.position.set(x, y, 2);
    a.rotation.y = -0.4;
    aves.push({ a, alas, s });
    g.add(a);
  });
  p.update = (t) => aves.forEach(({ alas, s }) => alas.forEach(({ piv, lado }) => {
    piv.rotation.x = lado * (0.35 + 0.35 * Math.sin(t * 2.2 + s));
  }));
  return p;
}

// ---------------------------------------------------------------- X Escila
function escila() {
  const p = pieza(10, V(14, 0, -46), V(-0.3, 0.1, -1));
  const g = p.grupo;
  g.add(isla({ sx: 34, sy: 46, sz: 18, color: '#131816', semilla: 31, rugo: 0.55 }));
  const cueva = V(-4, 26, 15);
  const boca = new THREE.Mesh(new THREE.CircleGeometry(6, 28), new THREE.MeshBasicMaterial({ color: '#000' }));
  boca.position.copy(cueva).add(V(0, 0, 1.5));
  boca.lookAt(boca.position.clone().add(V(0, 0.2, 1)));
  g.add(boca);
  const N = 6, S = 42;
  const cuello = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 12, 10), estandar('#2b3a34', 0.55), N * S);
  const cabezas = new THREE.InstancedMesh(new THREE.ConeGeometry(2.1, 6.5, 10), estandar('#22302b', 0.5), N);
  g.add(cuello, cabezas);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), pos = V(0, 0, 0), prev = V(0, 0, 0);
  const arriba = V(0, 1, 0);
  p.update = (t) => {
    for (let n = 0; n < N; n++) {
      const abre = (n - 2.5) * 0.32;
      for (let i = 0; i < S; i++) {
        const k = i / (S - 1);
        const ataque = Math.max(0, Math.sin(t * 0.9 + n * 1.3)) ** 3;
        pos.set(
          cueva.x + Math.sin(abre) * k * 22 + Math.sin(t * 1.4 + n * 2 + k * 4) * 3 * k,
          cueva.y + Math.sin(k * Math.PI * 0.8) * 9 - k * k * (12 + ataque * 10) + Math.cos(t * 1.1 + n) * 2 * k,
          cueva.z + k * (20 + ataque * 12) + Math.cos(abre) * 2);
        const r = 2.7 - k * 1.4;
        m4.compose(pos, q.identity(), V(r, r, r));
        cuello.setMatrixAt(n * S + i, m4);
        if (i === S - 1) {
          const dir = pos.clone().sub(prev).normalize();
          q.setFromUnitVectors(arriba, dir);
          m4.compose(pos.clone().add(dir.multiplyScalar(2)), q, V(1, 1, 1));
          cabezas.setMatrixAt(n, m4);
        }
        prev.copy(pos);
      }
    }
    cuello.instanceMatrix.needsUpdate = true;
    cabezas.instanceMatrix.needsUpdate = true;
  };
  return p;
}

// ---------------------------------------------------------------- XI Vacas del Sol
function helios() {
  const p = pieza(11, V(-82, 0, -36), V(-1, 0, -0.3));
  const g = p.grupo;
  const cerros = isla({ sx: 55, sy: 18, sz: 20, color: '#5d4b25', semilla: 37 });
  cerros.position.set(-18, 0, -24);
  const prado = new THREE.Mesh(new THREE.CylinderGeometry(36, 40, 3, 48), estandar('#7a6a30'));
  prado.position.y = 1.2;
  g.add(cerros, prado);
  const n = 12;
  const cuerpos = new THREE.InstancedMesh(new THREE.BoxGeometry(3.2, 1.6, 1.3), estandar('#34190f', 0.8), n);
  const cabezas = new THREE.InstancedMesh(new THREE.BoxGeometry(1.1, 0.9, 0.8), estandar('#2a130b', 0.8), n);
  const patas = new THREE.InstancedMesh(new THREE.BoxGeometry(0.32, 1.3, 0.32), estandar('#1f0f08', 0.8), n * 4);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion();
  for (let i = 0; i < n; i++) {
    const a = i * 2.4, r = 6 + (i % 4) * 6;
    const x = Math.cos(a) * r, z = Math.sin(a) * r * 0.6, rot = a * 1.7;
    q.setFromEuler(new THREE.Euler(0, rot, 0));
    m4.compose(V(x, 4.6, z), q, V(1, 1, 1));
    cuerpos.setMatrixAt(i, m4);
    m4.compose(V(x + Math.cos(rot) * 2, 4.4, z - Math.sin(rot) * 2), q, V(1, 1, 1));
    cabezas.setMatrixAt(i, m4);
    [[1.2, 0.45], [1.2, -0.45], [-1.2, 0.45], [-1.2, -0.45]].forEach(([dx, dz], k) => {
      m4.compose(V(x + Math.cos(rot) * dx + Math.sin(rot) * dz, 3.3, z - Math.sin(rot) * dx + Math.cos(rot) * dz), q, V(1, 1, 1));
      patas.setMatrixAt(i * 4 + k, m4);
    });
  }
  g.add(cuerpos, cabezas, patas);
  return p;
}

// ---------------------------------------------------------------- XII Calipso
function calipso() {
  const p = pieza(12, V(44, 0, -42), V(1, 0, -0.7));
  const g = p.grupo;
  g.add(isla({ sx: 34, sy: 10, sz: 26, color: '#2b5431', semilla: 41, rugo: 0.35 }));
  const playa = new THREE.Mesh(new THREE.CylinderGeometry(37, 41, 1.4, 56), estandar('#cbb68a'));
  playa.position.y = 0.2;
  g.add(playa);
  const troncoMat = estandar('#4a3524');
  const hojas = new THREE.InstancedMesh(new THREE.BoxGeometry(6, 0.1, 1.3), estandar('#1d4824', 0.8), 9 * 7);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion();
  for (let i = 0; i < 9; i++) {
    const a = i * 0.7 - 2.6, x = Math.cos(a) * 30, z = Math.sin(a) * 20 + 6;
    const incl = 0.18 + (i % 3) * 0.08;
    const tr = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.7, 12, 7), troncoMat);
    tr.position.set(x, 6, z);
    tr.rotation.z = incl * (i % 2 ? 1 : -1);
    g.add(tr);
    const tope = V(x - Math.sin(tr.rotation.z) * 6, 12, z);
    for (let k = 0; k < 7; k++) {
      const ang = (k / 7) * Math.PI * 2;
      q.setFromEuler(new THREE.Euler(0, ang, -0.45));
      m4.compose(tope.clone().add(V(Math.cos(ang) * 2.6, -0.8, -Math.sin(ang) * 2.6)), q, V(1, 1, 1));
      hojas.setMatrixAt(i * 7 + k, m4);
    }
  }
  g.add(hojas);
  const fuego = new THREE.Mesh(new THREE.SphereGeometry(0.9, 10, 8), new THREE.MeshBasicMaterial({ color: '#ffb060' }));
  fuego.position.set(-8, 5, 21);
  g.add(fuego);
  g.add(luz(p, '#ffb060', 10, 60, V(-8, 6, 23)));
  return p;
}

// ---------------------------------------------------------------- XIII Feacios
function feacios() {
  const p = pieza(13, V(0, 0, -96), V(0, 0, -1));
  const g = p.grupo;
  g.add(isla({ sx: 105, sy: 8, sz: 22, color: '#171b24', semilla: 43 }));
  const marmol = estandar('#d4cdbf', 0.6);
  const t = templo(marmol);
  t.position.set(-6, 7, 2);
  g.add(t);
  g.add(ventanas(26, V(42, 8, 8), '#ffcf8a', 5));
  g.add(luz(p, '#ffcf8a', 30, 160, V(-6, 22, 20)));
  return p;
}

// ---------------------------------------------------------------- XIV Itaca
function itaca() {
  const p = pieza(14, V(92, 0, -48), V(1, 0, -0.6), { permanece: true });
  const g = p.grupo;
  g.add(isla({ sx: 62, sy: 22, sz: 36, color: '#2a2920', semilla: 47 }));
  const piedra = estandar('#c7bba2', 0.7);
  const palacio = templo(piedra, 18, 9, 7, 6);
  palacio.position.set(-8, 17.5, 6);
  g.add(palacio);
  g.add(caja(10, 5, 8, piedra, 8, 19, 2));
  const vent = ventanas(8, V(12, 18.5, 5), '#ffc27a', 9);
  vent.position.set(-2, 0, 6);
  g.add(vent);
  const olivo = new THREE.Group();
  olivo.add(en(new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.9, 5, 7), estandar('#3a2c1e')), V(0, 2.5, 0)));
  [[0, 6, 0, 3], [2, 5.4, 1, 2.4], [-2, 5.6, -1, 2.2]].forEach(([x, y, z, r]) =>
    olivo.add(en(new THREE.Mesh(new THREE.SphereGeometry(r, 10, 8), estandar('#3d4a2c')), V(x, y, z))));
  olivo.position.set(18, 16, 10);
  g.add(olivo);
  g.add(luz(p, '#ffc27a', 22, 120, V(-4, 26, 18)));
  return p;
}

export function crearDecorados() {
  return [troya(), cicones(), lotofagos(), polifemo(), eolo(), lestrigones(), circe(),
          inframundo(), sirenas(), escila(), helios(), calipso(), feacios(), itaca()];
}
