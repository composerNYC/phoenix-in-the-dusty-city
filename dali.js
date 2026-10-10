// dali.js — surreal, Salvador-Dalí-inspired creatures & set pieces for "Phoenix in the Dusty City"
// Every builder returns { g, obs, update(dt, t, ctx) } (+ extras). g origin = ground, facing +Z.
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.170.0/+esm';

const TAU = Math.PI * 2, PI = Math.PI;

// ============================================================ api / materials
let API = null;
function makeGlowMap() {
  const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d');
  const gr = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(.25, 'rgba(255,255,255,.75)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = gr; x.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c);
}
function defaultApi() {
  const cache = {};
  return {
    mat(c, o) { const k = c + '|' + (o ? JSON.stringify(o) : ''); return cache[k] || (cache[k] = new THREE.MeshStandardMaterial(Object.assign({ color: c, roughness: .85, metalness: 0 }, o || {}))); },
    neon(c, k) { k = k || 1; const key = 'N' + c + '|' + k; if (!cache[key]) { const col = new THREE.Color(c); const m = new THREE.MeshStandardMaterial({ color: col.clone().multiplyScalar(.25), emissive: col, emissiveIntensity: k, roughness: .35 }); m.userData.k = k; cache[key] = m; } return cache[key]; },
    glowMap: makeGlowMap(),
  };
}
const A = () => API || (API = defaultApi());
export function initDali(api) { const d = defaultApi(); API = Object.assign(d, api || {}); if (!API.glowMap) API.glowMap = d.glowMap; }
const mat = (c, o) => A().mat(c, o);
const neon = (c, k) => A().neon(c, k);

// ============================================================ small utils
let _seed = 1234567;
function rnd() { _seed |= 0; _seed = _seed + 0x6D2B79F5 | 0; let t = Math.imul(_seed ^ _seed >>> 15, 1 | _seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }
const R = (a, b) => a + rnd() * (b - a);
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const smooth = (u) => u * u * (3 - 2 * u);
const flick = (t, ph) => .5 + .3 * Math.sin(t * 11.3 + ph) + .2 * Math.sin(t * 23.7 + ph * 2.3);
const NOCTX = { night: 0, playerPos: null, speed: 0 };

const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _v4 = new THREE.Vector3();
const _q1 = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _m1 = new THREE.Matrix4();
const _UP = new THREE.Vector3(0, 1, 0);

function grp(parent, x = 0, y = 0, z = 0) { const g = new THREE.Group(); g.position.set(x, y, z); if (parent) parent.add(g); return g; }
function M(geo, m, sx = 1, sy = sx, sz = sx, x = 0, y = 0, z = 0, parent) {
  const o = new THREE.Mesh(geo, m); o.scale.set(sx, sy, sz); o.position.set(x, y, z);
  o.castShadow = true; o.receiveShadow = true; if (parent) parent.add(o); return o;
}
function placeSeg(o, a, b, r) {
  _v1.subVectors(b, a); const len = _v1.length() || 1e-4;
  o.position.addVectors(a, b).multiplyScalar(.5); _v1.multiplyScalar(1 / len);
  o.quaternion.setFromUnitVectors(_UP, _v1); o.scale.set(r, len, r);
}
function cnv(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; }
function ctex(c) { const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; }
function mtx(x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) {
  return new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(sx, sy, sz));
}
function segMtx(a, b, r) { const d = new THREE.Vector3().subVectors(b, a); const len = d.length(); return new THREE.Matrix4().compose(new THREE.Vector3().addVectors(a, b).multiplyScalar(.5), new THREE.Quaternion().setFromUnitVectors(_UP, d.normalize()), new THREE.Vector3(r, len, r)); }
// merge [geometry, matrix?] pairs -> one non-indexed geometry (position+normal)
function mergeGeo(parts) {
  let n = 0; const list = [];
  for (const [geo, m] of parts) { const gg = geo.index ? geo.toNonIndexed() : geo.clone(); if (m) gg.applyMatrix4(m); list.push(gg); n += gg.attributes.position.count; }
  const hasUv = list.every(gg => gg.attributes.uv);
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uv = hasUv ? new Float32Array(n * 2) : null; let o = 0;
  for (const gg of list) { pos.set(gg.attributes.position.array, o * 3); nor.set(gg.attributes.normal.array, o * 3); if (uv) uv.set(gg.attributes.uv.array, o * 2); o += gg.attributes.position.count; gg.dispose(); }
  const out = new THREE.BufferGeometry(); out.setAttribute('position', new THREE.BufferAttribute(pos, 3)); out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  if (uv) out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  out.computeBoundingSphere(); return out;
}
// batch sibling meshes that share a material into one mesh (per parent), to cut draw calls.
// Meshes flagged userData.keep (moved directly by update) or having children are left alone.
function mergeStatic(root) {
  const nodes = []; root.traverse(o => { if (!o.isMesh && !o.isSprite) nodes.push(o); });
  for (const node of nodes) {
    const by = new Map();
    for (const c of node.children) if (c.isMesh && !c.isInstancedMesh && !c.userData.keep && !c.children.length) { if (!by.has(c.material)) by.set(c.material, []); by.get(c.material).push(c); }
    for (const [m, list] of by) {
      if (list.length < 2) continue;
      const mesh = new THREE.Mesh(mergeGeo(list.map(c => { c.updateMatrix(); return [c.geometry, c.matrix]; })), m);
      mesh.castShadow = list.some(c => c.castShadow); mesh.receiveShadow = true; mesh.renderOrder = list[0].renderOrder;
      for (const c of list) node.remove(c); node.add(mesh);
    }
  }
  return root;
}
const keep = (o) => { o.userData.keep = true; return o; };
// tapered tube along catmull-rom points; rFn(t) radius
function taperTube(pts, rFn, tubSeg = 16, radSeg = 7) {
  const curve = new THREE.CatmullRomCurve3(pts.map(p => p.isVector3 ? p : new THREE.Vector3(p[0], p[1], p[2])));
  const geo = new THREE.TubeGeometry(curve, tubSeg, 1, radSeg, false);
  const pos = geo.attributes.position, P = new THREE.Vector3(), V = new THREE.Vector3();
  for (let i = 0; i <= tubSeg; i++) {
    const t = i / tubSeg; curve.getPointAt(t, P); const r = rFn(t);
    for (let j = 0; j <= radSeg; j++) { const k = i * (radSeg + 1) + j; V.fromBufferAttribute(pos, k).sub(P).multiplyScalar(r).add(P); pos.setXYZ(k, V.x, V.y, V.z); }
  }
  geo.userData.curve = curve; return geo;
}
const lin = (a, b, p = 1) => (t) => a + (b - a) * Math.pow(t, p);

// ============================================================ shared geometry
const G = {
  sph: new THREE.SphereGeometry(1, 12, 9),
  sphLo: new THREE.SphereGeometry(1, 8, 6),
  knob: new THREE.SphereGeometry(1, 6, 4),
  hemi: new THREE.SphereGeometry(1, 12, 5, 0, TAU, 0, PI / 2),
  cyl: new THREE.CylinderGeometry(1, 1, 1, 10),
  cylLo: new THREE.CylinderGeometry(1, 1, 1, 6),
  taper: new THREE.CylinderGeometry(.65, 1, 1, 8),
  torso: new THREE.CylinderGeometry(1, .78, 1, 10),
  box: new THREE.BoxGeometry(1, 1, 1),
  cone: new THREE.ConeGeometry(1, 1, 8),
  cone4: new THREE.ConeGeometry(1, 1, 4).rotateY(PI / 4),
  ico: new THREE.IcosahedronGeometry(1, 0),
  oct: new THREE.OctahedronGeometry(1, 0),
  disc: new THREE.CylinderGeometry(1, 1, 1, 24),
  torus: new THREE.TorusGeometry(1, .15, 6, 24),
  flame: new THREE.LatheGeometry([[0, 0], [.5, .12], [.6, .36], [.34, .68], [0, 1]].map(p => new THREE.Vector2(p[0], p[1])), 6),
};
G.eye = new THREE.SphereGeometry(1, 24, 16).rotateX(PI / 2); // iris pole -> +Z
let _pompomGeo = null;
function pompomGeo() {
  if (_pompomGeo) return _pompomGeo; const g = new THREE.IcosahedronGeometry(1, 1); const p = g.attributes.position; const s0 = _seed; _seed = 77;
  const map = {}; for (let i = 0; i < p.count; i++) { const k = p.getX(i).toFixed(3) + p.getY(i).toFixed(3) + p.getZ(i).toFixed(3); const f = map[k] || (map[k] = R(.75, 1.25)); p.setXYZ(i, p.getX(i) * f, p.getY(i) * f, p.getZ(i) * f); }
  _seed = s0; g.computeVertexNormals(); return (_pompomGeo = g);
}

// ============================================================ textures
const TX = {};
function clockFaceTex() {
  if (TX.clock) return TX.clock; const [c, x] = cnv(256, 256);
  const gr = x.createRadialGradient(128, 128, 10, 128, 128, 128); gr.addColorStop(0, '#fbf1d6'); gr.addColorStop(.85, '#eedcae'); gr.addColorStop(1, '#c99f55');
  x.fillStyle = gr; x.fillRect(0, 0, 256, 256);
  x.strokeStyle = '#5a3c16'; x.lineWidth = 3; x.beginPath(); x.arc(128, 128, 118, 0, TAU); x.stroke();
  x.lineWidth = 1.5; x.beginPath(); x.arc(128, 128, 110, 0, TAU); x.stroke();
  for (let i = 0; i < 60; i++) { const a = i / 60 * TAU, r0 = i % 5 ? 104 : 96; x.lineWidth = i % 5 ? 1.5 : 3.5; x.beginPath(); x.moveTo(128 + Math.sin(a) * r0, 128 - Math.cos(a) * r0); x.lineTo(128 + Math.sin(a) * 109, 128 - Math.cos(a) * 109); x.stroke(); }
  x.fillStyle = '#2a1a0a'; x.font = 'bold 28px Georgia, "Times New Roman", serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
  for (let h = 1; h <= 12; h++) { const a = h / 12 * TAU; x.fillText(String(h), 128 + Math.sin(a) * 78, 130 - Math.cos(a) * 78); }
  return (TX.clock = ctex(c));
}
function handTex(minute) {
  const k = minute ? 'hm' : 'hh'; if (TX[k]) return TX[k]; const [c, x] = cnv(128, 128); x.fillStyle = '#16100a';
  const L = minute ? 52 : 34, W = minute ? 3.2 : 5.5; x.beginPath(); x.moveTo(64 - W, 70); x.lineTo(64 - W * .8, 64 - L * .55); x.lineTo(64, 64 - L); x.lineTo(64 + W * .8, 64 - L * .55); x.lineTo(64 + W, 70); x.closePath(); x.fill();
  x.beginPath(); x.arc(64, 64, minute ? 5 : 7, 0, TAU); x.fill();
  const t = ctex(c); t.center.set(.5, .5); return (TX[k] = t);
}
function eyeTex(iris) {
  const key = 'eye' + iris; if (TX[key]) return TX[key]; const s0 = _seed; _seed = 4242;
  const [c, x] = cnv(256, 128), [ce, xe] = cnv(64, 32);
  x.fillStyle = '#f5f0e8'; x.fillRect(0, 0, 256, 128);
  const gr = x.createLinearGradient(0, 30, 0, 128); gr.addColorStop(0, 'rgba(255,200,200,0)'); gr.addColorStop(1, 'rgba(225,120,120,.55)'); x.fillStyle = gr; x.fillRect(0, 0, 256, 128);
  x.strokeStyle = '#b8141f'; x.lineCap = 'round';
  for (let v = 0; v < 30; v++) {
    let px = rnd() * 256, py = 128 - rnd() * 12; x.lineWidth = R(1, 2.4); x.beginPath(); x.moveTo(px, py);
    for (let k = 0; k < 16 && py > 26; k++) { px += (rnd() - .5) * 16; py -= R(3, 8); x.lineTo(px, py); if (rnd() < .25) { x.moveTo(px, py); x.lineTo(px + R(-12, 12), py - R(4, 10)); x.moveTo(px, py); } }
    x.stroke();
  }
  const col = new THREE.Color(iris), cc = new THREE.Color();
  for (let i = 0; i < 256; i++) { const n = .7 + .2 * Math.sin(i * .9) + .15 * Math.sin(i * 2.7 + 1) + .1 * Math.sin(i * .21); cc.copy(col).multiplyScalar(n); x.fillStyle = cc.getStyle(); x.fillRect(i, 0, 1, 24); }
  x.fillStyle = 'rgba(8,12,30,.75)'; x.fillRect(0, 20, 256, 5);
  x.fillStyle = 'rgba(255,240,200,.35)'; x.fillRect(0, 11, 256, 2);
  x.fillStyle = '#050505'; x.fillRect(0, 0, 256, 10);
  xe.fillStyle = '#000'; xe.fillRect(0, 0, 64, 32); xe.fillStyle = '#' + col.getHexString(); xe.fillRect(0, 2, 64, 4); xe.fillStyle = '#000'; xe.fillRect(0, 0, 64, 2.5);
  _seed = s0; return (TX[key] = { map: ctex(c), em: ctex(ce) });
}
function giraffeTex() {
  if (TX.giraffe) return TX.giraffe; const s0 = _seed; _seed = 99; const N = 128, [c, x] = cnv(N, N), img = x.createImageData(N, N);
  const pts = []; for (let i = 0; i < 26; i++) pts.push([rnd() * N, rnd() * N, R(.8, 1.1)]);
  for (let y = 0; y < N; y++) for (let xx = 0; xx < N; xx++) {
    let d1 = 1e9, d2 = 1e9, best = 0;
    for (let i = 0; i < pts.length; i++) { let dx = Math.abs(xx - pts[i][0]), dy = Math.abs(y - pts[i][1]); dx = Math.min(dx, N - dx); dy = Math.min(dy, N - dy); const d = Math.sqrt(dx * dx + dy * dy); if (d < d1) { d2 = d1; d1 = d; best = i; } else if (d < d2) d2 = d; }
    const o = (y * N + xx) * 4; const f = pts[best][2];
    if (d2 - d1 < 2.6) { img.data[o] = 238; img.data[o + 1] = 214; img.data[o + 2] = 160; } else { img.data[o] = 186 * f; img.data[o + 1] = 98 * f; img.data[o + 2] = 34 * f; }
    img.data[o + 3] = 255;
  }
  x.putImageData(img, 0, 0); _seed = s0; const t = ctex(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; return (TX.giraffe = t);
}
function blanketTex() {
  if (TX.blanket) return TX.blanket; const [c, x] = cnv(256, 128);
  x.fillStyle = '#a3121e'; x.fillRect(0, 0, 256, 128);
  x.strokeStyle = '#e2b03c'; x.lineWidth = 2; for (let i = -8; i < 24; i++) { x.beginPath(); x.moveTo(i * 16, 18); x.lineTo(i * 16 + 64, 110); x.moveTo(i * 16 + 64, 18); x.lineTo(i * 16, 110); x.stroke(); }
  x.fillStyle = '#e2b03c'; x.fillRect(0, 0, 256, 14); x.fillRect(0, 114, 256, 14); x.fillRect(0, 0, 12, 128); x.fillRect(244, 0, 12, 128);
  x.fillStyle = '#7a0c14'; x.fillRect(0, 14, 256, 3); x.fillRect(0, 111, 256, 3);
  return (TX.blanket = ctex(c));
}
function dialTex() {
  if (TX.dial) return TX.dial; const [c, x] = cnv(256, 256);
  x.fillStyle = '#d9d2c2'; x.beginPath(); x.arc(128, 128, 126, 0, TAU); x.fill();
  x.fillStyle = '#1a1a1a'; x.beginPath(); x.arc(128, 128, 112, 0, TAU); x.fill();
  x.font = 'bold 18px Georgia, serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
  for (let i = 0; i < 10; i++) { const a = -PI * .35 + i / 12 * TAU; const px = 128 + Math.cos(a) * 82, py = 128 + Math.sin(a) * 82; x.fillStyle = '#f2ead6'; x.beginPath(); x.arc(px, py, 19, 0, TAU); x.fill(); x.fillStyle = '#222'; x.fillText(String((i + 1) % 10), px, py + 1); }
  x.fillStyle = '#efe4c6'; x.beginPath(); x.arc(128, 128, 46, 0, TAU); x.fill(); x.fillStyle = '#b3121e'; x.font = 'italic bold 22px Georgia, serif'; x.fillText('Dalí', 128, 130);
  return (TX.dial = ctex(c));
}
function lipTex() {
  if (TX.lip) return TX.lip; const [c, x] = cnv(256, 32); const s0 = _seed; _seed = 5;
  x.fillStyle = '#d4153c'; x.fillRect(0, 0, 256, 32);
  for (let i = 0; i < 70; i++) { const px = rnd() * 256; x.fillStyle = rnd() < .5 ? 'rgba(120,0,25,.35)' : 'rgba(255,150,170,.25)'; x.fillRect(px, 0, R(1, 3), 32); }
  _seed = s0; return (TX.lip = ctex(c));
}

// ============================================================ shared parts
function flameSet() { return []; }
function addFlame(list, parent, x, y, z, s, lean = 0) {
  const f = grp(parent, x, y, z); f.rotation.z = lean;
  const a = M(G.flame, neon(0xff5a1f, 1.15), .42, 1, .42, 0, 0, 0, f);
  const b = M(G.flame, neon(0xffc83a, 1.3), .26, .62, .26, .1, .02, .14, f);
  a.castShadow = b.castShadow = false;
  f.scale.setScalar(s); list.push({ o: f, s, ph: rnd() * 10, lean }); return f;
}
function updFlames(list, t) {
  for (let i = 0; i < list.length; i++) { const f = list[i], n = flick(t, f.ph); f.o.scale.set(f.s * (.85 + .25 * n), f.s * (.7 + .55 * n), f.s * (.85 + .25 * n)); f.o.rotation.z = f.lean + .18 * Math.sin(t * 7.3 + f.ph); f.o.rotation.x = .12 * Math.sin(t * 5.1 + f.ph * 1.7); }
}
function makeGlowSprite(color, scale) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: A().glowMap, color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 })); s.scale.setScalar(scale); return s; }

// drawer facing +Z; origin at surface centre
function makeDrawer(parent, x, y, z, w, h, d, out, o = {}) {
  const g = grp(parent, x, y, z); const wood = o.wood || mat(0x8a5530, { roughness: .7 }); const dark = mat(0x1c120c, { roughness: 1 });
  M(G.box, dark, w * 1.12, h * 1.18, .04, 0, 0, -.01, g);
  const dr = grp(g, 0, 0, out);
  M(G.box, wood, w * 1.06, h * 1.06, Math.max(.03, w * .06), 0, 0, 0, dr);
  M(G.box, wood, w, h * .08, d, 0, -h * .46, -d / 2, dr);
  M(G.box, wood, w * .06, h, d, -w * .47, 0, -d / 2, dr); M(G.box, wood, w * .06, h, d, w * .47, 0, -d / 2, dr);
  if (o.glow) M(G.box, neon(o.glow, .55), w * .86, h * .05, d * .9, 0, -h * .38, -d / 2, dr).castShadow = false;
  const kr = o.knob || Math.min(w, h) * .22;
  if (o.pompom !== false) M(pompomGeo(), mat(o.pomColor || 0xf3e2cf, { roughness: 1, flatShading: true }), kr, kr, kr, 0, 0, w * .03 + kr * .9, dr);
  else M(G.sphLo, mat(0xc9962f, { roughness: .35, metalness: .6 }), kr * .6, kr * .6, kr * .6, 0, 0, w * .03 + kr * .4, dr);
  g.userData.drawer = dr; return g;
}

// ---------- melting clock core
// deform(a,b) maps disc coords (a right, b toward 12) -> 3D. modes: flat (ground), drape (origin = branch axis, fold along X), hang (origin = ledge top/front edge)
function clockDeform(mode, r, o) {
  const melt = o.melt ?? 1;
  if (mode === 'drape') {
    const v0 = .22 * r, rb = o.wrap ?? .12, arc = PI / 2 * rb;
    return (a, b, out) => {
      const s = v0 - b, as = Math.abs(s);
      if (as <= arc) { const th = s / rb; return out.set(a, rb * Math.cos(th), rb * Math.sin(th)); }
      const d = as - arc, sg = Math.sign(s), dn = d / r;
      const y = -d * (1 + .5 * melt * dn) - .22 * melt * (a / r) * (a / r) * d * (sg > 0 ? .3 : .6);
      const x = a * (1 - .2 * melt * dn) + (sg > 0 ? .14 : -.08) * melt * r * dn * dn;
      const z = sg * (rb + .06 * d + .05 * r * Math.sin(a / r * 3) * dn);
      return out.set(x, y, z);
    };
  }
  if (mode === 'hang') {
    const v0 = .08 * r, rb = o.wrap ?? .09, arc = PI / 2 * rb;
    return (a, b, out) => {
      const s = v0 - b;
      if (s < 0) { const bul = .03 * r * Math.max(0, 1 - (a * a + b * b) / (r * r)); return out.set(a, bul, -rb + s); }
      if (s <= arc) { const th = s / rb; return out.set(a, -rb + rb * Math.cos(th), -rb + rb * Math.sin(th)); }
      const d = s - arc, dn = d / r;
      return out.set(a * (1 - .22 * melt * dn) + .12 * melt * r * dn * dn, -rb - d * (1 + .55 * melt * dn), .04 * d + .04 * r * Math.sin(a / r * 2.5) * dn);
    };
  }
  // flat
  return (a, b, out) => {
    let z = -b; const dn = Math.max(0, z / r - .05); z += melt * .6 * r * dn * dn;
    const q = clamp(1 - (a * a + b * b) / (r * r), 0, 1);
    const y = Math.max(.012, (.035 + .07 * q) * r * 2 * (1 - .6 * clamp(dn, 0, 1)) + .015 * r * Math.sin(a / r * 4 + b / r * 2));
    return out.set(a, y, z);
  };
}
function makeClock(size, mode, o = {}) {
  const r = size / 2, g = new THREE.Group(), def = clockDeform(mode, r, o);
  const RINGS = 7, SEG = 30, irr = (th) => 1 + .035 * Math.sin(3 * th + 1) + .025 * Math.sin(5 * th + 2);
  const pos = [], uv = [], idx = [], P = new THREE.Vector3();
  def(0, 0, P); pos.push(P.x, P.y, P.z); uv.push(.5, .5);
  for (let k = 1; k <= RINGS; k++) {
    const f = k / RINGS;
    for (let j = 0; j < SEG; j++) {
      const th = j / SEG * TAU, rr = r * f, sc = 1 + (irr(th) - 1) * f;
      const a = Math.cos(th) * rr, b = Math.sin(th) * rr; def(a * sc, b * sc, P); pos.push(P.x, P.y, P.z); uv.push(a / (2 * r) + .5, b / (2 * r) + .5);
    }
  }
  for (let j = 0; j < SEG; j++) idx.push(0, 1 + j, 1 + (j + 1) % SEG);
  for (let k = 1; k < RINGS; k++) for (let j = 0; j < SEG; j++) {
    const i0 = 1 + (k - 1) * SEG + j, i1 = 1 + (k - 1) * SEG + (j + 1) % SEG, o0 = 1 + k * SEG + j, o1 = 1 + k * SEG + (j + 1) % SEG;
    idx.push(i0, o0, o1, i0, o1, i1);
  }
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geo.setIndex(idx); geo.computeVertexNormals();
  if (!TX.clockMat) TX.clockMat = new THREE.MeshStandardMaterial({ map: clockFaceTex(), roughness: .55 });
  const face = M(geo, TX.clockMat, 1, 1, 1, 0, 0, 0, g);
  M(geo, mat(0xc0902c, { roughness: .35, metalness: .45, side: THREE.BackSide }), 1, 1, 1, 0, 0, 0, g);
  face.userData.geo = geo;
  // hand overlays (offset along normals)
  const offGeo = (d) => { const gg = geo.clone(), p = gg.attributes.position, n = gg.attributes.normal; for (let i = 0; i < p.count; i++) p.setXYZ(i, p.getX(i) + n.getX(i) * d, p.getY(i) + n.getY(i) * d, p.getZ(i) + n.getZ(i) * d); return gg; };
  const hm = handTex(true).clone(), hh = handTex(false).clone();
  const mm = new THREE.MeshStandardMaterial({ map: hm, alphaTest: .5, roughness: .5 }), mh = new THREE.MeshStandardMaterial({ map: hh, alphaTest: .5, roughness: .5 });
  const l1 = M(offGeo(.006 * size + .004), mh, 1, 1, 1, 0, 0, 0, g), l2 = M(offGeo(.011 * size + .006), mm, 1, 1, 1, 0, 0, 0, g);
  l1.castShadow = l2.castShadow = false;
  // gold rim
  const rim = []; for (let j = 0; j < 48; j++) { const th = j / 48 * TAU, sc = irr(th); rim.push(def(Math.cos(th) * r * sc, Math.sin(th) * r * sc, new THREE.Vector3())); }
  const gold = mat(0xd9a63a, { roughness: .3, metalness: .5 });
  M(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(rim, true), 48, .045 * size, 5, true), gold, 1, 1, 1, 0, 0, 0, g);
  // crown at 12
  const sc12 = irr(PI / 2), c0 = def(0, r * sc12 + .02 * size, new THREE.Vector3()), c1 = def(0, r * sc12 + .12 * size, new THREE.Vector3());
  const stem = M(G.cyl, gold, 1, 1, 1, 0, 0, 0, g); placeSeg(stem, c0, c1, .035 * size);
  const ring = M(G.torus, gold, .07 * size, .07 * size, .07 * size, 0, 0, 0, g); ring.position.copy(c1).addScaledVector(_v1, .05 * size); ring.quaternion.copy(stem.quaternion).multiply(_q1.setFromAxisAngle(new THREE.Vector3(1, 0, 0), PI / 2));
  const knob = M(G.sphLo, gold, .045 * size, .045 * size, .045 * size, 0, 0, 0, g); knob.position.copy(c1);
  // flat mode drips
  if (mode === 'flat') for (let i = 0; i < 3; i++) { const a = (i - 1) * .5 * r; const p = def(a, -r * .98, new THREE.Vector3()); M(G.sphLo, gold, .06 * size, .03 * size, .16 * size, p.x, .02, p.z + .1 * size, g); }
  let minY = 0; for (let i = 1; i < pos.length; i += 3) minY = Math.min(minY, pos[i]);
  const ph1 = rnd() * TAU, ph2 = rnd() * TAU, sp = o.handSpeed ?? 1;
  return { g, minY, update(t) { hm.rotation = -(t * .35 * sp + ph1); hh.rotation = -(t * .03 * sp + ph2); } };
}

// ---------- gnarled dead olive tree. returns { g, anchor, branchR }
function makeTree(parent, spec) {
  const wood = mat(spec.color || 0x6a5642, { roughness: .95, flatShading: true });
  for (const b of spec.branches) M(taperTube(b.p, b.r, b.seg || 14, b.rad || 7), wood, 1, 1, 1, 0, 0, 0, parent);
  return wood;
}

// ---------- lobster (head toward +Z, length L)
function makeLobster(L, color = 0xd42a1c) {
  const g = new THREE.Group(), s = grp(g); s.scale.setScalar(L / 4.4);
  const red = mat(color, { roughness: .4 }), dark = mat(0x9a1a10, { roughness: .5 }), blk = mat(0x0c0c0c, { roughness: .25 });
  M(G.sph, red, .5, .42, .85, 0, 0, .78, s);
  M(G.sphLo, dark, .46, .3, .2, 0, .08, .05, s);
  M(G.cone, red, .12, .55, .12, 0, .1, 1.75, s).rotation.x = PI / 2;
  for (const k of [-1, 1]) { M(G.cylLo, dark, .03, .2, .03, k * .16, .25, 1.42, s); M(G.sphLo, blk, .075, .075, .075, k * .17, .36, 1.44, s); }
  const tail = []; let prev = s;
  for (let i = 0; i < 5; i++) { const sg = grp(prev, 0, i ? .01 : 0, i ? -.4 : 0); M(i < 2 ? G.sph : G.sphLo, i % 2 ? dark : red, .44 - .045 * i, .29 - .025 * i, .29, 0, 0, -.2, sg); tail.push(sg); prev = sg; }
  for (let k = -2; k <= 2; k++) { const f = M(G.sphLo, red, .13, .035, .32, k * .1, 0, -.62, prev); f.rotation.y = k * .38; }
  const claws = [];
  for (const k of [-1, 1]) {
    const sh = grp(s, k * .36, 0, 1.2); sh.rotation.y = k * .55;
    M(G.cyl, red, .1, .75, .1, 0, 0, .37, sh).rotation.x = PI / 2;
    const el = grp(sh, 0, 0, .75); el.rotation.y = -k * .75;
    M(G.cyl, red, .11, .6, .11, 0, 0, .3, el).rotation.x = PI / 2;
    const cl = grp(el, 0, 0, .6);
    M(G.sph, red, .3, .22, .55, 0, 0, .45, cl);
    M(G.cone, red, .12, .6, .1, k * .07, 0, 1.18, cl).rotation.x = PI / 2;
    const fing = grp(cl, -k * .12, 0, .85); M(G.cone, dark, .09, .55, .08, 0, 0, .27, fing).rotation.x = PI / 2; fing.rotation.y = -k * .3;
    claws.push({ sh, el, fing, k });
  }
  const legM = dark;
  for (let i = 0; i < 4; i++) for (const k of [-1, 1]) {
    const z = 1.0 - i * .2, a = new THREE.Vector3(k * .3, -.12, z), b = new THREE.Vector3(k * .8, .05, z - .05), c = new THREE.Vector3(k * 1.0, -.38, z - .15);
    placeSeg(M(G.cylLo, legM, 1, 1, 1, 0, 0, 0, s), a, b, .035); placeSeg(M(G.cylLo, legM, 1, 1, 1, 0, 0, 0, s), b, c, .028);
  }
  const ants = [];
  for (const k of [-1, 1]) { const ag = grp(s, k * .12, .14, 1.6); M(taperTube([[0, 0, 0], [k * .3, .3, .8], [k * .9, .45, 1.6], [k * 1.7, .25, 2.3]], lin(.035, .008), 10, 4), red, 1, 1, 1, 0, 0, 0, ag); ants.push(ag); }
  return { g, claws, tail, ants };
}
function updLobster(lb, t, ring) {
  for (const c of lb.claws) { c.fing.rotation.y = -c.k * (ring ? .15 + .25 * Math.abs(Math.sin(t * 22)) : .2 + .15 * Math.sin(t * 1.3 + c.k)); c.sh.rotation.x = ring ? .12 * Math.sin(t * 31 + c.k) : .05 * Math.sin(t * .9 + c.k); }
  for (let i = 0; i < lb.tail.length; i++) lb.tail[i].rotation.x = (ring ? .1 * Math.sin(t * 25 - i) : .05 * Math.sin(t * 1.4 - i * .6)) + (i ? .06 : 0);
  for (const a of lb.ants) { a.rotation.y = .2 * Math.sin(t * (ring ? 18 : 1.7) + a.position.x * 9); a.rotation.x = .1 * Math.sin(t * 1.1 + a.position.x * 5); }
}

// ---------- eyeball (look group faces +Z). returns { g, inner, lid }
const EYEMATS = {};
function eyeMat(iris) { if (EYEMATS[iris]) return EYEMATS[iris]; const t = eyeTex(iris); return (EYEMATS[iris] = new THREE.MeshStandardMaterial({ map: t.map, emissiveMap: t.em, emissive: 0xffffff, emissiveIntensity: .15, roughness: .18 })); }
function makeEyeball(R0, iris = 0x2f7be0, o = {}) {
  const g = new THREE.Group(), inner = grp(g); inner.scale.setScalar(R0);
  const em = eyeMat(iris); M(G.eye, em, 1, 1, 1, 0, 0, 0, inner);
  let lid = null;
  if (o.lid !== false) {
    lid = grp(inner); lid.rotation.x = -.15;
    if (!G.lid) G.lid = new THREE.SphereGeometry(1.07, 20, 7, 0, TAU, 0, 1.05);
    M(G.lid, mat(o.lidColor || 0xe2a48c, { roughness: .6, side: THREE.DoubleSide }), 1, 1, 1, 0, 0, 0, lid);
    if (!G.lashes) {
      const parts = [], th = 1.05, rr = 1.07;
      for (let i = 0; i < 9; i++) {
        const az = -1.05 + i / 8 * 2.1, E = new THREE.Vector3(Math.sin(th) * Math.sin(az) * rr, Math.cos(th) * rr, Math.sin(th) * Math.cos(az) * rr), n = E.clone().normalize();
        const len = 1 - Math.abs(az) * .3;
        const p = [E, E.clone().addScaledVector(n, .35 * len).add(new THREE.Vector3(0, .12, 0)), E.clone().addScaledVector(n, .7 * len).add(new THREE.Vector3(0, .5 * len, 0)), E.clone().addScaledVector(n, .72 * len).add(new THREE.Vector3(0, .95 * len, 0)), E.clone().addScaledVector(n, .55 * len).add(new THREE.Vector3(0, 1.1 * len, 0))];
        parts.push([taperTube(p, lin(.055, .01), 8, 4)]);
      }
      G.lashes = mergeGeo(parts);
      const lp = [];
      for (let i = 0; i < 5; i++) { const az = -.7 + i / 4 * 1.4, th2 = 2.25, E = new THREE.Vector3(Math.sin(th2) * Math.sin(az), Math.cos(th2), Math.sin(th2) * Math.cos(az)), n = E.clone().normalize(); lp.push([taperTube([E, E.clone().addScaledVector(n, .2).add(new THREE.Vector3(0, -.1, 0)), E.clone().addScaledVector(n, .3).add(new THREE.Vector3(0, -.3, 0))], lin(.035, .008), 5, 4)]); }
      G.lowLashes = mergeGeo(lp);
    }
    M(G.lashes, mat(0x0d0b0a, { roughness: .5 }), 1, 1, 1, 0, 0, 0, lid);
    M(G.lowLashes, mat(0x0d0b0a, { roughness: .5 }), 1, 1, 1, 0, 0, 0, inner);
  }
  return { g, inner, lid, mat: em, ph: rnd() * 10 };
}
function updEye(e, dt, t, ctx, k = 3) {
  e.mat.emissiveIntensity = .12 + 1.1 * (ctx.night || 0);
  if (ctx.playerPos) { _q1.copy(e.g.quaternion); e.g.lookAt(ctx.playerPos); _q2.copy(e.g.quaternion); e.g.quaternion.copy(_q1).slerp(_q2, Math.min(1, dt * k)); }
  if (e.lid) { const c = (t + e.ph) % 4.5; e.lid.rotation.x = c < .22 ? -.15 + 1.05 * Math.sin(c / .22 * PI) : -.15 + .04 * Math.sin(t * 1.3); }
}

// ---------- mustache halves (span = tip-to-tip width)
const MUST = {};
function mustacheHalfGeo(sg, span, thick) {
  const key = sg + '|' + span + '|' + thick; if (MUST[key]) return MUST[key]; const k = span / 3.2;
  const pts = [[.0, 0, .05], [.35, -.11, .08], [.8, -.17, .06], [1.2, -.08, .02], [1.45, .15, 0], [1.53, .45, -.02], [1.43, .68, 0], [1.26, .71, .03], [1.17, .59, .03], [1.23, .49, .02]].map(p => [p[0] * k * sg, p[1] * k, p[2] * k]);
  return (MUST[key] = taperTube(pts, (t) => thick * k * Math.pow(1 - t, .85) + .018 * k, 30, 8));
}
function makeMustache(parent, span, thick = .24, col = 0x15100d) {
  const m = mat(col, { roughness: .28, metalness: .1 }), halves = [];
  for (const sg of [-1, 1]) { const h = grp(parent); M(mustacheHalfGeo(sg, span, thick), m, 1, 1, 1, 0, 0, 0, h); halves.push(h); }
  M(G.sph, m, thick * span / 3.2 * 1.25, thick * span / 3.2 * 1.0, thick * span / 3.2 * 1.1, 0, -.02 * span, .04 * span / 3.2, parent);
  return halves;
}

// ---------- humanoid rig for walkers
function makeRig(o) {
  const g = new THREE.Group(), body = grp(g);
  const L = o.leg, T = o.torso, SW = o.shoulder || .62, HW = o.hip || .34, ak = o.armK || 1;
  const pants = mat(o.pants, { roughness: .8 }), shoe = mat(o.shoe || 0x1a1410, { roughness: .5 }), suit = mat(o.suit, { roughness: .75 }), skin = mat(o.skin || 0xe9c3a0, { roughness: .7 }), sleeve = o.sleeve ? mat(o.sleeve, { roughness: .75 }) : suit;
  const legs = [], arms = [];
  for (const s of [-1, 1]) {
    const th = grp(body, s * HW / 2, L, 0); let sh;
    if (o.stilt) {
      const st = mat(0x221d1b, { roughness: .6 }), kn = mat(0xc9962f, { roughness: .35, metalness: .5 });
      M(G.cylLo, st, .05, L * .5, .05, 0, -L * .25, 0, th); M(G.sphLo, kn, .1, .1, .1, 0, 0, 0, th); M(G.sphLo, st, .07, .07, .07, 0, -L * .25, 0, th);
      sh = grp(th, 0, -L * .5, 0); M(G.sphLo, kn, .09, .09, .09, 0, 0, 0, sh); M(G.cylLo, st, .04, L * .5, .04, 0, -L * .25, 0, sh); M(G.sphLo, st, .06, .06, .06, 0, -L * .25, 0, sh);
      M(G.cone, st, .07, .14, .07, 0, -L * .5 + .07, 0, sh).rotation.x = PI;
      M(G.cyl, pants, .1, .3, .1, 0, -.1, 0, th);
    } else {
      const lr = o.legR || .1;
      M(G.cyl, pants, lr, L * .52, lr, 0, -L * .25, 0, th);
      sh = grp(th, 0, -L * .5, 0);
      M(G.cyl, pants, lr * .85, L * .5, lr * .85, 0, -L * .25, 0, sh);
      M(G.box, shoe, .17, .1, .3, 0, -L * .5 + .05, .06, sh);
    }
    legs.push({ th, sh, s });
    const ar = grp(body, s * SW / 2, L + T - .07, 0); ar.rotation.z = s * .1;
    M(G.sphLo, sleeve, .09, .09, .09, 0, 0, 0, ar);
    M(G.cyl, sleeve, .075, .4 * ak, .075, 0, -.2 * ak, 0, ar);
    const fa = grp(ar, 0, -.4 * ak, 0); M(G.cyl, sleeve, .066, .36 * ak, .066, 0, -.18 * ak, 0, fa); M(G.sphLo, skin, .085, .1, .085, 0, -.4 * ak, 0, fa);
    arms.push({ ar, fa, s });
  }
  let torso = null;
  if (!o.noTorso) { torso = M(G.torso, suit, SW * .5, T, .2, 0, L + T / 2, 0, body); M(G.sph, pants, HW * .78, .16, .2, 0, L + .02, 0, body); }
  const neck = grp(body, 0, L + T, 0);
  return { g, body, legs, arms, neck, torso, L, T, skin, suit, A: o.amp || .5, cyc: o.cyc || L * 1.75, ph: 0, amp: 0, by: 0 };
}
function updRig(r, dt, t, sp) {
  r.amp += ((sp > .05 ? 1 : 0) - r.amp) * Math.min(1, dt * 5);
  r.ph += dt * Math.max(0, sp) / r.cyc * TAU;
  const a = r.amp, s = Math.sin(r.ph), c = Math.cos(r.ph), A0 = r.A;
  for (const l of r.legs) { const sg = l.s; l.th.rotation.x = -sg * s * A0 * a; l.sh.rotation.x = Math.max(0, sg * c) * A0 * 1.4 * a; }
  for (const m of r.arms) { m.ar.rotation.x = m.s * s * A0 * .9 * a + (1 - a) * .05 * Math.sin(t * 1.2 + m.s); m.fa.rotation.x = -.25 - .3 * a; }
  r.body.position.y = Math.abs(c) * .06 * a * r.L + (1 - a) * .012 * Math.sin(t * 2);
  r.body.rotation.z = (1 - a) * .03 * Math.sin(t * .9) + a * .03 * s;
  r.body.rotation.y = a * .08 * s;
}

// ============================================================ 1. SPACE ELEPHANT
export function buildSpaceElephant(opts = {}) {
  const g = new THREE.Group(), cargo = opts.cargo || 'obelisk';
  const skin = mat(opts.color ?? 0x5f5964, { roughness: .8 }), skin2 = mat(0x4c4651, { roughness: .85 });
  const legM = mat(0x2a2527, { roughness: .65 }), knobM = mat(0x403739, { roughness: .55 });
  const BODY_Y = 19.6;
  const body = grp(g, 0, BODY_Y, 0);
  M(G.sph, skin, 1.45, 1.55, 2.7, 0, 0, 0, body);
  M(G.sph, skin, 1.3, 1.35, 1.25, 0, .25, -1.45, body);
  const head = grp(body, 0, .45, 2.5);
  M(G.sph, skin, 1.05, 1.15, 1.0, 0, 0, 0, head);
  M(G.sph, skin, .72, .72, .72, 0, .55, .2, head);
  for (const s of [-1, 1]) {
    M(G.sphLo, neon(0xffb35a, .5), .1, .1, .1, s * .6, .2, .76, head);
    M(G.sphLo, skin2, .2, .08, .14, s * .6, .32, .74, head);
    M(taperTube([[s * .38, -.45, .55], [s * .5, -.95, .9], [s * .45, -1.2, 1.45], [s * .32, -1.05, 1.85]], lin(.13, .03), 10, 6), mat(0xf1e6cf, { roughness: .45 }), 1, 1, 1, 0, 0, 0, head);
  }
  const ears = [];
  for (const s of [-1, 1]) { const ear = grp(head, s * .78, .25, -.3); ear.rotation.y = s * .35; M(G.sph, skin2, .12, 1.2, .95, s * .06, -.3, -.6, ear); ears.push({ ear, s }); }
  // trunk chain
  const trunk = []; let tp = grp(head, 0, -.35, .82);
  for (let i = 0; i < 8; i++) { const sg = grp(tp, 0, i ? -.5 : 0, 0); const rr = .33 - i * .028; M(G.cylLo, skin, rr, .54, rr, 0, -.25, 0, sg); M(G.knob, skin, rr, rr, rr, 0, 0, 0, sg); trunk.push(sg); tp = sg; }
  M(G.sphLo, skin2, .14, .1, .14, 0, -.52, 0, tp);
  M(taperTube([[0, .2, -2.6], [0, -.3, -3.0], [.05, -1.2, -3.15], [.1, -1.9, -3.1]], lin(.09, .03), 8, 5), skin, 1, 1, 1, 0, 0, 0, body);
  M(G.sphLo, skin2, .12, .25, .12, .1, -2.05, -3.1, body);
  // saddle blanket
  const bl = M(new THREE.CylinderGeometry(1, 1, 2.8, 20, 1, true, PI - 1.85, 3.7).rotateX(PI / 2), new THREE.MeshStandardMaterial({ map: blanketTex(), roughness: .75, side: THREE.DoubleSide }), 1.56, 1.66, 1, 0, 0, -.15, body);
  bl.castShadow = true;
  const trimM = neon(0xffc04a, .7);
  for (const s of [-1, 1]) {
    const ex = Math.sin(1.85) * 1.56 * s, ey = Math.cos(1.85) * 1.66;
    M(G.box, trimM, .08, .08, 2.82, ex * 1.01, ey, -.15, body);
    for (let i = 0; i < 4; i++) M(G.knob, mat(0xd9a63a, { roughness: .35, metalness: .5 }), .1, .16, .1, ex * 1.02, ey - .18, -1.45 + i * .87, body);
  }
  // cargo
  const cg = grp(body, 0, 1.6, -.1);
  const goldM = mat(0xc9962f, { roughness: .35, metalness: .5 });
  M(G.box, goldM, 1.4, .3, 1.5, 0, .1, 0, cg);
  if (cargo === 'obelisk') {
    if (!G.obel) G.obel = new THREE.CylinderGeometry(.34, .58, 1, 4).rotateY(PI / 4);
    M(G.obel, mat(0xe7d4a8, { roughness: .7, flatShading: true }), 1, 4.6, 1, 0, 2.55, 0, cg);
    M(G.cone4, goldM, .48, .6, .48, 0, 5.15, 0, cg);
    M(G.sphLo, neon(0xffd23f, 1.2), .12, .12, .12, 0, 5.5, 0, cg).castShadow = false;
    for (let i = 0; i < 3; i++) M(G.box, neon(0xff5a1f, .6), .5 - i * .04, .06, .02, 0, 1.5 + i * 1.1, .45 - i * .045, cg).castShadow = false;
  } else if (cargo === 'tower') {
    M(G.cyl, mat(0xe7d4a8, { roughness: .7 }), .7, 2.8, .7, 0, 1.65, 0, cg);
    for (let i = 0; i < 6; i++) { const a = i / 6 * TAU; M(G.box, neon(0xffb35a, .8), .14, .5, .05, Math.sin(a) * .71, 2.2, Math.cos(a) * .71, cg).rotation.y = a; }
    M(G.hemi, mat(0xb3121e, { roughness: .5 }), .78, .78, .78, 0, 3.05, 0, cg);
    M(G.cone, goldM, .1, .9, .1, 0, 4.2, 0, cg);
  }
  // legs (in g space)
  const legs = [], tars = 1.9, L1 = 9.4, L2 = 7.9;
  const order = { '1,1': 0, '-1,-1': .25, '-1,1': .5, '1,-1': .75 };
  for (const sz of [1, -1]) for (const sx of [1, -1]) {
    const l = { sx, sz, off: order[sx + ',' + sz], hipL: new THREE.Vector3(sx * .85, -1.0, sz * 1.6), foot0: new THREE.Vector3(sx * 2.1, 0, sz * 2.45), H: new THREE.Vector3(), F: new THREE.Vector3(), An: new THREE.Vector3(), K: new THREE.Vector3(), bend: new THREE.Vector3(sx, 0, sz * .35).normalize() };
    l.up = M(G.cylLo, legM, 1, 1, 1, 0, 0, 0, g); l.lo = M(G.cylLo, legM, 1, 1, 1, 0, 0, 0, g); l.ta = M(G.cylLo, legM, 1, 1, 1, 0, 0, 0, g);
    l.kH = M(G.sphLo, knobM, .42, .42, .42, 0, 0, 0, g); l.kK = M(G.sphLo, knobM, .36, .36, .36, 0, 0, 0, g); l.kA = M(G.knob, knobM, .26, .26, .26, 0, 0, 0, g);
    l.m1 = M(G.knob, knobM, .25, .25, .25, 0, 0, 0, g); l.m2 = M(G.knob, knobM, .21, .21, .21, 0, 0, 0, g);
    l.pad = M(G.sphLo, skin2, .42, .2, .42, 0, 0, 0, g);
    for (const k of ['up', 'lo', 'ta', 'kH', 'kK', 'kA', 'm1', 'm2', 'pad']) keep(l[k]);
    legs.push(l);
  }
  let phase = 0, amp = 0;
  const ST = .75, AMPZ = 1.6;
  function update(dt, t, ctx) {
    ctx = ctx || NOCTX; const sp = ctx.speed || 0;
    amp += ((sp > .05 ? 1 : 0) - amp) * Math.min(1, dt * 1.5);
    phase = (phase + dt * sp * ST / (2 * AMPZ)) % 1;
    body.position.y = BODY_Y + Math.sin(phase * TAU * 2) * .14 * amp + Math.sin(t * .6) * .06;
    body.rotation.z = Math.sin(phase * TAU) * .025 * amp; body.rotation.x = Math.sin(t * .5) * .01;
    for (let i = 0; i < trunk.length; i++) { trunk[i].rotation.x = -.1 - .055 * i + .09 * Math.sin(t * 1.1 - i * .45); trunk[i].rotation.z = .07 * Math.sin(t * .7 - i * .4); }
    for (const e of ears) e.ear.rotation.y = e.s * (.35 + .22 * Math.sin(t * 1.4 + e.s * .3));
    for (const l of legs) {
      const p = (phase + l.off) % 1; let dz, lift = 0;
      if (p < ST) dz = AMPZ - 2 * AMPZ * (p / ST); else { const u = (p - ST) / (1 - ST); dz = -AMPZ + 2 * AMPZ * smooth(u); lift = Math.sin(PI * u) * 1.2; }
      l.F.set(l.foot0.x, lift * amp, l.foot0.z + dz * amp);
      l.An.set(l.F.x + l.sx * .25, l.F.y + tars, l.F.z + l.sz * .15);
      l.H.copy(l.hipL).applyEuler(body.rotation).add(body.position);
      solveKnee(l.H, l.An, L1, L2, l.bend, l.K);
      placeSeg(l.up, l.H, l.K, .2); placeSeg(l.lo, l.K, l.An, .15); placeSeg(l.ta, l.An, l.F, .12);
      l.kH.position.copy(l.H); l.kK.position.copy(l.K); l.kA.position.copy(l.An);
      l.m1.position.lerpVectors(l.H, l.K, .55); l.m2.position.lerpVectors(l.K, l.An, .5);
      l.pad.position.set(l.F.x, l.F.y + .12, l.F.z);
    }
  }
  update(0, 0, NOCTX);
  return { g: mergeStatic(g), obs: legs.map(l => [l.foot0.x, l.foot0.z, .45]), update, height: BODY_Y + 1.6 + (cargo === 'obelisk' ? 5.6 : cargo === 'tower' ? 4.6 : .3) };
}
function solveKnee(H, An, L1, L2, bend, out) {
  _v2.subVectors(An, H); let dist = _v2.length(); _v2.multiplyScalar(1 / (dist || 1)); dist = Math.min(dist, (L1 + L2) * .999);
  const a = (L1 * L1 - L2 * L2 + dist * dist) / (2 * dist), h = Math.sqrt(Math.max(0, L1 * L1 - a * a));
  _v3.copy(bend).addScaledVector(_v2, -bend.dot(_v2)).normalize();
  out.copy(H).addScaledVector(_v2, a).addScaledVector(_v3, h);
}

// ============================================================ 2. BURNING GIRAFFE
export function buildBurningGiraffe(opts = {}) {
  const g = new THREE.Group(), body = grp(g), flames = flameSet();
  const gm = new THREE.MeshStandardMaterial({ map: giraffeTex(), roughness: .8 }), dark = mat(0x3a2414, { roughness: .7 });
  const tor = M(G.sph, gm, .74, .82, 1.42, 0, 2.95, 0, body); tor.rotation.x = -.13;
  const neckG = grp(body, 0, 3.05, .95);
  const ng = taperTube([[0, 0, 0], [0, 1.1, .5], [0, 2.3, .9], [0, 3.25, 1.12]], lin(.38, .19), 14, 9);
  { const uv = ng.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 3, uv.getY(i)); }
  M(ng, gm, 1, 1, 1, 0, 0, 0, neckG);
  const head = grp(neckG, 0, 3.3, 1.15); head.rotation.x = .45;
  M(G.sph, gm, .24, .26, .38, 0, 0, .12, head); M(G.sph, mat(0x8a5a33, { roughness: .7 }), .17, .17, .25, 0, -.05, .45, head);
  for (const s of [-1, 1]) {
    M(G.cylLo, dark, .035, .32, .035, s * .1, .3, -.05, head); M(G.sphLo, dark, .06, .06, .06, s * .1, .47, -.05, head);
    M(G.sph, gm, .05, .14, .09, s * .22, .17, -.1, head).rotation.z = s * .9;
    M(G.sphLo, mat(0x111111, { roughness: .2 }), .045, .045, .045, s * .2, .07, .22, head);
  }
  // mane flames along neck + back flames
  for (let i = 0; i < 6; i++) { const t = .1 + i / 6 * .85; const p = ng.userData.curve.getPointAt(t); addFlame(flames, neckG, p.x, p.y + .05, p.z - .3, .55 + .1 * Math.sin(i), -.25); }
  for (let i = 0; i < 7; i++) { const z = -1.05 + i * .32; addFlame(flames, body, .08 * Math.sin(i * 2.1), 3.55 + .12 * Math.sin(i * .8) - z * .1, z, .95 + .4 * Math.sin(i * 1.3 + .4) + (i === 3 || i === 5 ? .5 : 0), -.2); }
  addFlame(flames, body, .36, 3.45, .4, .6, .4); addFlame(flames, body, -.36, 3.45, -.4, .65, -.5);
  const glow = makeGlowSprite(0xff7a2a, 4); glow.position.set(0, 4, 0); body.add(glow);
  // drawers in flank & chest
  const wood = mat(0x7a4a28, { roughness: .7 });
  const d1 = makeDrawer(body, .7, 3.05, .3, .6, .3, .5, .42, { wood, pompom: false, glow: 0xff7a2a }); d1.rotation.y = PI / 2;
  const d2 = makeDrawer(body, .68, 2.72, -.45, .55, .28, .45, .2, { wood, pompom: false }); d2.rotation.y = PI / 2;
  const d3 = makeDrawer(body, -.72, 3.0, -.1, .58, .3, .45, .32, { wood, pompom: false, glow: 0xff7a2a }); d3.rotation.y = -PI / 2;
  const d4 = makeDrawer(body, 0, 2.8, 1.33, .46, .26, .4, .28, { wood, pompom: false }); d4.rotation.x = .2;
  // legs
  const legs = [];
  for (const sz of [1, -1]) for (const sx of [-1, 1]) {
    const th = grp(body, sx * .34, 2.6, sz * .85);
    M(G.cyl, gm, .11, 1.35, .11, 0, -.65, 0, th); M(G.sphLo, gm, .13, .13, .13, 0, -1.3, 0, th);
    const sh = grp(th, 0, -1.3, 0); M(G.cyl, gm, .08, 1.25, .08, 0, -.62, 0, sh); M(G.cyl, dark, .11, .14, .11, 0, -1.23, 0, sh);
    legs.push({ th, sh, sx, sz });
  }
  M(taperTube([[0, 3.0, -1.2], [0, 2.6, -1.45], [0, 1.9, -1.5]], lin(.05, .03), 6, 4), gm, 1, 1, 1, 0, 0, 0, body);
  M(G.sphLo, dark, .09, .2, .09, 0, 1.8, -1.5, body);
  let ph = 0, amp = 0;
  function update(dt, t, ctx) {
    ctx = ctx || NOCTX; const sp = ctx.speed || 0;
    amp += ((sp > .05 ? 1 : 0) - amp) * Math.min(1, dt * 4); ph += dt * sp / 3.2 * TAU;
    for (const l of legs) { const s = Math.sin(ph + (l.sx > 0 ? PI : 0)), c = Math.cos(ph + (l.sx > 0 ? PI : 0)); l.th.rotation.x = -s * .42 * amp; l.sh.rotation.x = Math.max(0, c) * .6 * amp * (l.sz > 0 ? 1 : .8); }
    body.position.y = Math.abs(Math.cos(ph)) * .08 * amp; body.rotation.z = Math.sin(ph) * .04 * amp;
    neckG.rotation.x = .06 * Math.sin(ph * 2) * amp + .04 * Math.sin(t * .7); neckG.rotation.y = .1 * Math.sin(t * .45);
    head.rotation.y = .15 * Math.sin(t * .6 + 1);
    updFlames(flames, t); glow.material.opacity = .25 + .55 * (ctx.night || 0) + .1 * Math.sin(t * 9);
  }
  update(0, 0, NOCTX);
  return { g: mergeStatic(g), obs: legs.map(l => [l.sx * .34, l.sz * .85, .28]), update, height: 7 };
}

// ============================================================ 3. MELTING CLOCKS
export function buildMeltingClock(opts = {}) {
  const mode = opts.mode || 'drape', size = opts.size || 1.6, g = new THREE.Group(), sup = opts.support !== false;
  const ck = makeClock(size, mode, { melt: opts.melt, wrap: opts.wrap ?? (mode === 'drape' ? .1 : undefined) });
  g.add(ck.g); const obs = [];
  if (mode === 'drape' && sup) {
    const h = -ck.minY + .35, wood = mat(0x6a5642, { roughness: .95, flatShading: true });
    M(taperTube([[-size * .2, 0, -.15], [-size * .15, h * .5, -.1], [-size * .25, h, 0], [-size * .45, h + .4, .05]], lin(.1, .04), 8, 6), wood, 1, 1, 1, 0, 0, 0, g);
    M(taperTube([[-size * .25, h - .05, 0], [0, h, 0], [size * .6, h + .02, 0], [size * .8, h - .03, 0]], lin(.09, .06), 8, 6), wood, 1, 1, 1, 0, 0, 0, g);
    ck.g.position.set(0, h, 0); obs.push([-size * .2, -.1, .2]);
  } else if (mode === 'hang' && sup) {
    const bh = Math.max(.9, -ck.minY + .25), bd = size * .9, bw = size * 1.3;
    M(G.box, mat(0x8a6238, { roughness: .85 }), bw, bh, bd, 0, bh / 2, -bd / 2 - .03, g);
    ck.g.position.set(0, bh + .015, .015); obs.push([0, -bd / 2, Math.max(bw, bd) * .55]);
  }
  return { g: mergeStatic(g), obs, update(dt, t) { ck.update(t); } };
}
export function buildClockTree() {
  const g = new THREE.Group(), box = mat(0x7b5532, { roughness: .85 });
  M(G.box, box, 2.4, .7, 1.7, 0, .35, 0, g); M(G.box, mat(0x5e3f24, { roughness: .9 }), 2.5, .06, 1.8, 0, .7, 0, g);
  const y0 = .7;
  makeTree(g, { branches: [
    { p: [[-.3, y0 - .05, 0], [-.15, y0 + .8, .05], [-.4, y0 + 1.5, -.05], [-.2, y0 + 2.3, .05], [-.25, y0 + 2.9, 0]], r: (t) => .16 + .22 * Math.pow(1 - t, 3) + .04 * Math.sin(t * 20), seg: 18, rad: 8 },
    { p: [[-.25, y0 + 2.6, 0], [.3, y0 + 2.75, .03], [1.0, y0 + 2.82, 0], [1.6, y0 + 2.78, 0], [1.95, y0 + 2.7, 0]], r: lin(.14, .08) },
    { p: [[-.25, y0 + 2.8, 0], [-.55, y0 + 3.3, .1], [-.75, y0 + 3.75, .25], [-.7, y0 + 4.05, .3]], r: lin(.1, .02) },
    { p: [[-.3, y0 + 2.0, 0], [-.85, y0 + 2.35, -.2], [-1.3, y0 + 2.4, -.3], [-1.55, y0 + 2.6, -.35]], r: lin(.09, .02) },
    { p: [[-.25, y0 + 2.85, 0], [-.1, y0 + 3.4, -.2], [.05, y0 + 3.8, -.35]], r: lin(.07, .015) },
  ] });
  M(G.disc, mat(0xb08a5c, { roughness: .9 }), .075, .02, .075, 1.955, y0 + 2.7, 0, g).rotation.z = PI / 2;
  const ck = makeClock(1.75, 'drape', { wrap: .16 }); ck.g.position.set(1.0, y0 + 2.82, 0); g.add(ck.g);
  return { g: mergeStatic(g), obs: [[0, 0, 1.25]], clock: ck.g, update(dt, t) { ck.update(t); } };
}
export function buildClockPlinth() {
  const g = new THREE.Group(), bw = 2.8, bh = 1.15, bd = 1.7;
  M(G.box, mat(0x8a5f36, { roughness: .85 }), bw, bh, bd, 0, bh / 2, 0, g);
  M(G.box, mat(0x6b4627, { roughness: .9 }), bw + .06, .08, bd + .06, 0, bh, 0, g);
  const ck = makeClock(1.6, 'hang', {}); ck.g.position.set(.45, bh + .04 + .015, bd / 2 + .015); g.add(ck.g);
  // closed orange pocket watch covered in ants
  const ow = grp(g, -.75, bh + .04, -.1);
  M(G.disc, mat(0xd8561c, { roughness: .45 }), .42, .09, .42, 0, .045, 0, ow); M(G.torus, mat(0xb0842a, { roughness: .35, metalness: .5 }), .42, .42, .6, 0, .045, 0, ow).rotation.x = PI / 2;
  M(G.cyl, mat(0xc9962f, { roughness: .35, metalness: .5 }), .05, .14, .05, 0, .05, -.47, ow).rotation.x = PI / 2;
  const sw = buildAntSwarm(16, .3, { size: .9, y: .095 }); ow.add(sw.g);
  const sw2 = buildAntSwarm(10, .5, { size: .9, y: .045 }); sw2.g.position.set(-.1, bh, .3); g.add(sw2.g);
  return { g: mergeStatic(g), obs: [[0, 0, 1.55]], clock: ck.g, update(dt, t, ctx) { ck.update(t); sw.update(dt, t, ctx); sw2.update(dt, t, ctx); } };
}

// ============================================================ 4. LOBSTER TELEPHONE
export function buildLobsterPhone() {
  const g = new THREE.Group(), shell = grp(g);
  const blk = mat(0x121214, { roughness: .28, metalness: .1, flatShading: true }), blk2 = mat(0x1c1c20, { roughness: .35 }), chrome = mat(0xd7d7d2, { roughness: .2, metalness: .8 });
  if (!G.phone) G.phone = new THREE.CylinderGeometry(.62, 1, 1, 4, 1).rotateY(PI / 4);
  M(G.phone, blk, 2.55, 1.5, 2.12, 0, .75, 0, shell);
  M(G.box, blk2, 3.7, .12, 3.1, 0, .06, 0, shell);
  // dial on sloped front
  const dial = grp(shell, 0, .78, 1.24); dial.rotation.x = -.36;
  M(G.disc, chrome, .62, .06, .62, 0, 0, .0, dial).rotation.x = PI / 2;
  const dm = M(new THREE.CircleGeometry(.58, 32), new THREE.MeshStandardMaterial({ map: dialTex(), roughness: .4 }), 1, 1, 1, 0, 0, .035, dial);
  dm.castShadow = false;
  M(G.box, chrome, .05, .22, .05, .5, -.35, .07, dial).rotation.z = .6;
  // cradle
  M(G.box, blk, 2.7, .25, .6, 0, 1.6, 0, shell);
  const prongs = [];
  for (const s of [-1, 1]) { const pr = grp(shell, s * 1.25, 1.6, 0); M(G.box, blk, .32, .55, .5, 0, .25, 0, pr); for (const z of [-.2, .2]) M(G.cyl, blk2, .07, .45, .07, 0, .62, z, pr); M(G.box, chrome, .18, .06, .18, 0, .02, .32, pr); prongs.push(pr); }
  // lobster handset
  const lob = makeLobster(3.9); const lh = grp(g, -.1, 2.25, 0); lh.rotation.y = PI / 2; lh.add(lob.g);
  // coiled cord from base side to lobster tail
  const base = new THREE.CatmullRomCurve3([[-1.55, .45, .9], [-2.3, .25, 1.5], [-2.9, .45, .6], [-2.75, 1.3, -.2], [-2.15, 2.1, 0]].map(p => new THREE.Vector3(...p)));
  const cp = []; const N = 100, T = new THREE.Vector3(), Nn = new THREE.Vector3(), Bn = new THREE.Vector3();
  for (let i = 0; i <= N; i++) { const u = i / N; base.getPointAt(u, _v1); base.getTangentAt(u, T); Nn.set(0, 1, 0).cross(T); if (Nn.lengthSq() < 1e-4) Nn.set(1, 0, 0); Nn.normalize(); Bn.crossVectors(T, Nn); const a = u * 30 * TAU; cp.push(_v1.clone().addScaledVector(Nn, Math.cos(a) * .11).addScaledVector(Bn, Math.sin(a) * .11)); }
  M(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(cp), 170, .045, 3), blk2, 1, 1, 1, 0, 0, 0, g);
  // ring waves (visible when ringing)
  const waves = [];
  for (let i = 0; i < 3; i++) { const w = new THREE.Mesh(new THREE.TorusGeometry(1, .04, 3, 24, PI * .7), neon(0xffd23f, 1.1)); w.rotation.z = PI * .15; w.position.set(0, 2.6, 0); w.visible = false; keep(w); g.add(w); waves.push(w); }
  let ringing = false, rt = 0;
  function update(dt, t, ctx) {
    if (ringing) rt += dt;
    updLobster(lob, t, ringing);
    if (ringing) {
      const burst = (rt % 2.2) < 1.5 ? 1 : 0;
      lh.position.y = 2.25 + burst * Math.abs(Math.sin(t * 38)) * .14; lh.rotation.x = burst * .06 * Math.sin(t * 41); lh.rotation.z = burst * .05 * Math.sin(t * 33);
      shell.position.x = burst * .03 * Math.sin(t * 57); shell.rotation.y = burst * .012 * Math.sin(t * 47);
      for (let i = 0; i < 3; i++) { const w = waves[i], u = ((rt * 1.2 + i / 3) % 1); w.visible = burst > 0; w.scale.setScalar(1.6 + u * 2.4); w.position.y = 2.4 + u * .6; }
    } else { lh.position.y = 2.25; lh.rotation.x = lh.rotation.z = 0; shell.position.x = 0; shell.rotation.y = 0; }
  }
  update(0, 0, NOCTX);
  return { g: mergeStatic(g), obs: [[0, 0, 1.9]], update, height: 3.2, setRinging(b) { ringing = !!b; if (!ringing) { rt = 0; for (const w of waves) w.visible = false; } } };
}

// ============================================================ 5. MAE WEST LIPS SOFA
function sausageGeo(n, m, fn) {
  const pos = [], uv = [], idx = [], o = { x: 0, cy: 0, cz: 0, h: 0, d: 0 };
  for (let i = 0; i <= n; i++) { const t = i / n; fn(t, o); for (let j = 0; j <= m; j++) { const p = j / m * TAU; pos.push(o.x, o.cy + o.h * Math.cos(p), o.cz + o.d * Math.sin(p)); uv.push(t, j / m); } }
  for (let i = 0; i < n; i++) for (let j = 0; j < m; j++) { const a = i * (m + 1) + j, b = (i + 1) * (m + 1) + j, c = b + 1, d = a + 1; idx.push(a, d, b, d, c, b); }
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geo.setIndex(idx); geo.computeVertexNormals(); return geo;
}
export function buildLipsSofa() {
  const g = new THREE.Group(), body = grp(g), W = 3.05;
  const lipM = new THREE.MeshStandardMaterial({ map: lipTex(), roughness: .22, metalness: .05, color: 0xffffff });
  const mouth = (x) => .98 - .2 * Math.pow(Math.abs(x) / W, 2);
  // lower lip (seat)
  const lower = sausageGeo(40, 16, (t, o) => {
    const x = (t - .5) * 2 * W, s = Math.pow(Math.sin(PI * t), .55), u = x / W;
    const top = mouth(x) - .02, bot = Math.max(.0, mouth(x) - .98 * Math.pow(Math.sin(PI * t), .5));
    o.x = x; o.cy = (top + bot) / 2; o.h = Math.max(.01, (top - bot) / 2); o.cz = .3 - .5 * u * u; o.d = Math.max(.01, 1.0 * s);
  });
  M(lower, lipM, 1, 1, 1, 0, 0, 0, body);
  // upper lip (backrest) with cupid's bow
  const upper = sausageGeo(40, 16, (t, o) => {
    const x = (t - .5) * 2 * W, u = x / W, s = Math.sin(PI * t);
    const bow = .2 * Math.exp(-Math.pow((Math.abs(x) - .75) / .55, 2)) - .2 * Math.exp(-Math.pow(x / .28, 2));
    const top = mouth(x) + 1.08 * Math.pow(s, .5) + bow * s, bot = mouth(x) + .02;
    o.x = x; o.cy = (top + bot) / 2; o.h = Math.max(.01, (top - bot) / 2); o.cz = -.62 + .35 * u * u; o.d = Math.max(.01, .55 * Math.pow(s, .5));
  });
  M(upper, lipM, 1, 1, 1, 0, 0, 0, body);
  // neon smile line
  const lp = []; for (let i = 0; i <= 24; i++) { const t = .06 + i / 24 * .88, x = (t - .5) * 2 * W, u = x / W; lp.push(new THREE.Vector3(x, mouth(x) + .04, -.62 + .35 * u * u + .55 * Math.pow(Math.sin(PI * t), .5) * .92)); }
  M(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(lp), 48, .035, 5), neon(0xff4fa8, .9), 1, 1, 1, 0, 0, 0, body).castShadow = false;
  let k = 0;
  function update(dt, t, ctx) {
    ctx = ctx || NOCTX; let near = 0;
    if (ctx.playerPos) { _v1.copy(ctx.playerPos); g.worldToLocal(_v1); near = (Math.abs(_v1.x) < W + .5 && Math.abs(_v1.z) < 1.8 && _v1.y < 2.5) ? 1 : 0; }
    k += (near - k) * Math.min(1, dt * 6);
    const b = .015 * Math.sin(t * 1.6) + k * (-.05 + .035 * Math.sin(t * 9) * Math.exp(-((t * 2) % 3)));
    body.scale.set(1 - b * .4, 1 + b, 1 - b * .4);
  }
  return { g: mergeStatic(g), obs: [[-1.9, -.05, 1.05], [0, -.1, 1.15], [1.9, -.05, 1.05]], update, height: 2.3 };
}

// ============================================================ 6. FLOATING EYE
export function buildFloatingEye(opts = {}) {
  const g = new THREE.Group(), hold = grp(g, 0, opts.height || 4.5, 0);
  const e = makeEyeball(1, opts.iris ?? 0x2f7be0, { lidColor: 0xd99a86 }); hold.add(e.g);
  const halo = makeGlowSprite(0x9fd8ff, 5.5); hold.add(halo);
  const ph = rnd() * 10, H0 = hold.position.y;
  function update(dt, t, ctx) {
    ctx = ctx || NOCTX;
    hold.position.y = H0 + Math.sin(t * .8 + ph) * .6; hold.rotation.z = .08 * Math.sin(t * .6 + ph);
    updEye(e, dt, t, ctx, 2.5);
    halo.material.opacity = .45 * (ctx.night || 0);
  }
  return { g: mergeStatic(g), obs: [], update, height: H0 + 1.6 };
}

// ============================================================ 7. MUSTACHE SPIRIT
export function buildMustacheSpirit() {
  const g = new THREE.Group(), hold = grp(g, 0, 3.2, 0);
  const halves = makeMustache(hold, 3.4, .26);
  const nm = neon(0xffd23f, 1);
  for (let i = 0; i < 2; i++) {
    const sg = i ? 1 : -1, k = 3.4 / 3.2;
    const tipGeo = taperTube([[.0, -.2, .1], [.4, -.31, .12], [.85, -.36, .1], [1.25, -.24, .06], [1.52, .05, .04], [1.62, .42, .02]].map(p => [p[0] * k * sg, p[1] * k, p[2] * k]), lin(.035, .015), 24, 4);
    M(tipGeo, nm, 1, 1, 1, 0, 0, 0, halves[i]).castShadow = false;
    M(G.sphLo, nm, .07, .07, .07, 1.23 * k * sg, .5 * k, .03, halves[i]).castShadow = false;
  }
  const eyes = [];
  for (const s of [-1, 1]) {
    const e = makeEyeball(.3, 0x6b3a1a, { lid: false }); e.g.position.set(s * .5, .82, -.05); hold.add(e.g); eyes.push(e);
    M(G.torus, nm, .34, .34, .34, s * .5, .82, -.06, hold).castShadow = false;
    const br = M(taperTube([[s * .2, 1.25, 0], [s * .5, 1.42, 0], [s * .85, 1.32, -.05]], (t) => .07 * Math.sin(PI * t) + .02, 10, 5), mat(0x15100d, { roughness: .4 }), 1, 1, 1, 0, 0, 0, hold);
    eyes[eyes.length - 1].brow = keep(br);
  }
  const halo = makeGlowSprite(0xffd27a, 6); halo.position.set(0, .3, -.4); hold.add(halo);
  const ph = rnd() * 10;
  function update(dt, t, ctx) {
    ctx = ctx || NOCTX;
    hold.position.y = 3.2 + Math.sin(t * 1.3 + ph) * .3; hold.rotation.z = .08 * Math.sin(t * .9 + ph); hold.rotation.x = .05 * Math.sin(t * .7);
    for (let i = 0; i < 2; i++) halves[i].rotation.z = (i ? 1 : -1) * .07 * Math.sin(t * 2.6 + ph);
    for (const e of eyes) { updEye(e, dt, t, ctx, 4); e.brow.position.y = .04 * Math.sin(t * 3.1 + ph); }
    halo.material.opacity = .35 * (ctx.night || 0);
  }
  return { g: mergeStatic(g), obs: [], update, height: 4.8 };
}

// ============================================================ 8. SOFT FACE (Dalí "Sleep")
export function buildSoftFace() {
  const g = new THREE.Group();
  const W = 3.9, H = 2.2, D = 2.1, CY = 3.4, SAG = 2.1;
  const gs = (x, y, sx, sy) => Math.exp(-(x * x) / (sx * sx) - (y * y) / (sy * sy));
  const feat = (lon, lat) => {
    const f = Math.max(0, Math.cos(lon)); if (f <= 0) return 0; const al = Math.abs(lon);
    return f * (1.15 * gs(lon, lat + .02, .15, .3) + .2 * gs(al - .42, lat - .42, .3, .1) - .2 * gs(al - .4, lat - .2, .16, .11) + .22 * gs(al - .55, lat + .3, .25, .25) + .26 * gs(lon, lat + .55, .28, .07) + .22 * gs(lon, lat + .67, .24, .07) + .25 * gs(lon, lat + .92, .25, .16));
  };
  const SUP = [[0, -.32], [-.65, -.85], [.75, -.7], [2.5, -.55], [-2.2, -.6]];
  const supXZ = SUP.map(([lon, lat]) => [W * Math.sin(lon) * Math.cos(lat), (D + feat(lon, lat)) * Math.cos(lon) * Math.cos(lat)]);
  const P = new THREE.Vector3();
  function fp(lon, lat, out, target) {
    const cl = Math.cos(lat), sl = Math.sin(lat), ft = feat(lon, lat);
    let X = (W + out) * Math.sin(lon) * cl, Y = (H + out) * sl, Z = (D + out + ft) * Math.cos(lon) * cl;
    Y -= .55 * 1.15 * Math.max(0, Math.cos(lon)) * gs(lon, lat + .02, .15, .3) * (lat < .02 ? 1 : .5);
    let S = 0; for (const s of supXZ) { const dx = X - s[0], dz = Z - s[1]; S = Math.max(S, Math.exp(-(dx * dx + dz * dz) / 1.3)); }
    const rel = Math.max(0, -sl);
    Y -= SAG * Math.pow(rel, .9) * (1 - S) + .25 * (1 - S) * cl;
    // left side melts towards the ground
    if (X < -2.2) Y -= Math.pow(X + 2.2, 2) * .9 * (1 - S);
    Y += CY;
    if (Y < .06) { const a = .06 - Y; Y = .06 - a * .04; const hl = Math.hypot(X, Z) || 1; X += X / hl * a * .6; Z += Z / hl * a * .6; }
    return target.set(X, Y, Z);
  }
  const NL = 36, NT = 22, pos = [], idx = [];
  for (let j = 0; j <= NT; j++) { const lat = -PI / 2 + j / NT * PI; for (let i = 0; i <= NL; i++) { const lon = -PI + i / NL * TAU; fp(lon, lat, 0, P); pos.push(P.x, P.y, P.z); } }
  for (let j = 0; j < NT; j++) for (let i = 0; i < NL; i++) { const a = j * (NL + 1) + i, b = a + 1, c = a + NL + 1, d = c + 1; idx.push(a, b, d, a, d, c); }
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setIndex(idx); geo.computeVertexNormals();
  const skin = mat(0xe8b48e, { roughness: .62 });
  M(geo, skin, 1, 1, 1, 0, 0, 0, g);
  const dark = mat(0x3b2216, { roughness: .6 });
  const line = (pts, r) => M(taperTube(pts.map(([lo, la, o]) => fp(lo, la, o, new THREE.Vector3())), r, 16, 5), dark, 1, 1, 1, 0, 0, 0, g);
  const lashP = [];
  for (const s of [-1, 1]) {
    const pts = []; for (let i = 0; i <= 8; i++) { const u = i / 8; pts.push([s * (.18 + u * .46), .2 - .07 * Math.sin(PI * u), .04]); }
    line(pts, (t) => .05 + .03 * Math.sin(PI * t));
    for (let i = 1; i < 8; i++) { const u = i / 8, p = fp(s * (.18 + u * .46), .2 - .07 * Math.sin(PI * u), .05, new THREE.Vector3()); lashP.push([taperTube([p, p.clone().add(new THREE.Vector3(s * .04, -.2, .14)), p.clone().add(new THREE.Vector3(s * .06, -.45, .2))], lin(.04, .01), 4, 4)]); }
    const bp = []; for (let i = 0; i <= 8; i++) { const u = i / 8; bp.push([s * (.15 + u * .55), .5 + .06 * Math.sin(PI * u) - u * .08, .06]); }
    line(bp, (t) => .08 * Math.sin(PI * t) + .03);
  }
  M(mergeGeo(lashP), dark, 1, 1, 1, 0, 0, 0, g);
  // Dalí mustache under the nose
  const mg = grp(g); fp(0, -.4, .45, mg.position); mg.rotation.x = -.15; makeMustache(mg, 2.1, .3);
  // crutches
  const wood = mat(0xb4864f, { roughness: .7 }), pad = mat(0x5a3a26, { roughness: .8 });
  for (let i = 0; i < SUP.length; i++) {
    const c = fp(SUP[i][0], SUP[i][1], 0, new THREE.Vector3()); c.y -= .12;
    const gx = c.x * 1.12 + (i === 0 ? 0 : 0), gz = c.z * 1.12 + (i === 0 ? .6 : 0), base = new THREE.Vector3(gx, 0, gz);
    const L = base.distanceTo(c), parts = [], a = new THREE.Vector3(0, 0, 0), f = new THREE.Vector3(0, L * .45, 0);
    parts.push([G.cylLo, segMtx(a, f, .06)]);
    for (const s of [-1, 1]) { const tp = new THREE.Vector3(s * .17, L - .08, 0); parts.push([G.cylLo, segMtx(f, new THREE.Vector3(s * .14, L * .7, 0), .045)], [G.cylLo, segMtx(new THREE.Vector3(s * .14, L * .7, 0), tp, .045)]); }
    parts.push([G.box, mtx(0, L * .72, 0, 0, 0, 0, .3, .05, .05)]);
    const cm = M(mergeGeo(parts), wood, 1, 1, 1, 0, 0, 0, g); cm.position.copy(base); cm.quaternion.setFromUnitVectors(_UP, _v1.subVectors(c, base).normalize());
    const pd = M(G.cylLo, pad, .07, .4, .07, 0, L - .04, 0); pd.rotation.z = PI / 2; cm.add(pd);
  }
  return { g: mergeStatic(g), obs: [[-2.6, 0, 1.8], [0, .6, 2.3], [2.6, 0, 1.8]], update() { }, height: 6 };
}

// ============================================================ 9. VENUS DE MILO WITH DRAWERS
export function buildDrawerVenus() {
  const g = new THREE.Group(), U = 3, P0 = .6;
  const marble = mat(0xf1e8d8, { roughness: .5 }), stone = mat(0x2f2a28, { roughness: .8 });
  M(G.box, stone, 2.2, P0, 2.2, 0, P0 / 2, 0, g);
  for (const [x, z, w, d] of [[0, 1.11, 2.2, .04], [0, -1.11, 2.2, .04], [1.11, 0, .04, 2.2], [-1.11, 0, .04, 2.2]]) M(G.box, neon(0xffc04a, .7), w, .05, d, x, P0 - .05, z, g).castShadow = false;
  const fig = grp(g, 0, P0, 0);
  const lathe = (pts) => new THREE.LatheGeometry(pts.map(p => new THREE.Vector2(p[0] * U, p[1] * U)), 22);
  const robe = lathe([[0, 0], [.3, 0], [.31, .05], [.27, .2], [.225, .45], [.235, .7], [.25, .88], [.22, .98], [0, .99]]);
  { const p = robe.attributes.position; for (let i = 0; i < p.count; i++) { let x = p.getX(i), y = p.getY(i), z = p.getZ(i); const a = Math.atan2(x, z), f = 1 + .08 * Math.sin(9 * a + y * 1.5) * (1 - y / U) + .03 * Math.sin(5 * a); p.setXYZ(i, x * f, y, z * f * .82); } robe.computeVertexNormals(); }
  M(robe, marble, 1, 1, 1, 0, 0, 0, fig).rotation.y = .2;
  const roll = M(G.torus, marble, .23 * U, .23 * U, .23 * U * 1.6, 0, .93 * U, 0, fig); roll.rotation.x = PI / 2; roll.rotation.y = .12; roll.scale.set(.235 * U, .2 * U, .3 * U);
  const tg = grp(fig, 0, .95 * U, 0); tg.rotation.z = .07; tg.rotation.y = -.1;
  const torso = lathe([[0, 0], [.2, .01], [.155, .1], [.165, .23], [.18, .35], [.17, .41], [.12, .46], [.06, .49], [0, .5]]);
  { const p = torso.attributes.position; for (let i = 0; i < p.count; i++) p.setZ(i, p.getZ(i) * .72); torso.computeVertexNormals(); }
  M(torso, marble, 1, 1, 1, 0, 0, 0, tg);
  for (const s of [-1, 1]) { M(G.sph, marble, .068 * U, .066 * U, .068 * U, s * .075 * U, .285 * U, .085 * U, tg); M(G.sph, marble, .078 * U, .078 * U, .078 * U, s * .175 * U, .41 * U, 0, tg); }
  M(G.cyl, marble, .07 * U, .1 * U, .07 * U, .2 * U, .36 * U, 0, tg).rotation.z = .5;
  M(G.cyl, marble, .056 * U, .12 * U, .056 * U, 0, .53 * U, .005 * U, tg);
  const hd = grp(tg, 0, .64 * U, .01 * U); hd.rotation.y = .4; hd.rotation.z = -.1;
  M(G.sph, marble, .093 * U, .115 * U, .105 * U, 0, 0, 0, hd);
  M(G.sph, mat(0xe9dfcd, { roughness: .7, flatShading: true }), .1 * U, .085 * U, .108 * U, 0, .04 * U, -.012 * U, hd);
  M(G.sph, mat(0xe9dfcd, { roughness: .7, flatShading: true }), .055 * U, .05 * U, .05 * U, 0, .03 * U, -.1 * U, hd);
  M(G.box, marble, .022 * U, .05 * U, .04 * U, 0, -.01 * U, .1 * U, hd);
  // drawers with fluffy pom-poms
  const dw = { wood: mat(0xdcc9a8, { roughness: .5 }), pomColor: 0xf7d2d6, glow: 0xffb35a };
  makeDrawer(hd, 0, .05 * U, .09 * U, .11 * U, .04 * U, .1 * U, .07 * U, Object.assign({ knob: .08 }, dw));
  makeDrawer(tg, .078 * U, .28 * U, .145 * U, .1 * U, .07 * U, .14 * U, .13 * U, Object.assign({ knob: .14 }, dw));
  makeDrawer(tg, -.078 * U, .28 * U, .145 * U, .1 * U, .07 * U, .14 * U, .05 * U, Object.assign({ knob: .14 }, dw));
  makeDrawer(tg, 0, .13 * U, .112 * U, .17 * U, .075 * U, .18 * U, .17 * U, Object.assign({ knob: .16 }, dw));
  makeDrawer(fig, .07 * U, .5 * U, .19 * U, .14 * U, .075 * U, .16 * U, .1 * U, Object.assign({ knob: .15 }, dw)).rotation.y = .25;
  return { g: mergeStatic(g), obs: [[0, 0, 1.4]], update() { }, height: P0 + 1.73 * U };
}

// ============================================================ 10. SWANS REFLECTING ELEPHANTS
export function buildSwanPool() {
  const g = new THREE.Group(), WY = 1.35, RIN = 6.6;
  const stone = mat(0xd8bf94, { roughness: .9, side: THREE.DoubleSide });
  M(new THREE.LatheGeometry([[RIN, 0], [RIN, 1.45], [RIN + .12, 1.6], [7.28, 1.6], [7.42, 1.45], [7.42, 0]].map(p => new THREE.Vector2(p[0], p[1])), 40), stone, 1, 1, 1, 0, 0, 0, g);
  M(new THREE.CircleGeometry(RIN, 48).rotateX(-PI / 2), mat(0x9fbfd6, { roughness: .9 }), 1, 1, 1, 0, .03, 0, g);
  const nt = new THREE.Mesh(new THREE.TorusGeometry(7.3, .05, 3, 40), neon(0x46f1ff, .6)); nt.rotation.x = PI / 2; nt.position.y = 1.62; g.add(nt);
  const water = new THREE.Mesh(new THREE.CircleGeometry(RIN, 48).rotateX(-PI / 2), new THREE.MeshStandardMaterial({ color: 0x2f78b0, roughness: .05, metalness: .3, transparent: true, opacity: .42, depthWrite: false }));
  water.position.y = WY; water.renderOrder = 2; g.add(water);
  const white = mat(0xf7f3ea, { roughness: .55 }), orange = mat(0xf08a1c, { roughness: .5 }), blk = mat(0x111111), ele = mat(0x2b2622, { roughness: .8 });
  const neck = [[0, .22, .5], [0, .62, .74], [0, .98, .6], [0, 1.2, .42], [0, 1.33, .5], [0, 1.31, .68]];
  const swans = [];
  for (let i = 0; i < 3; i++) {
    const sw = grp(g); const s = grp(sw, 0, WY, 0);
    M(G.sph, white, .45, .32, .78, 0, .12, 0, s);
    M(taperTube(neck, lin(.14, .075), 10, 6), white, 1, 1, 1, 0, 0, 0, s);
    M(G.sphLo, white, .12, .11, .17, 0, 1.3, .7, s);
    M(G.cone, orange, .06, .26, .05, 0, 1.25, .92, s).rotation.x = 1.9;
    M(G.knob, blk, .05, .05, .05, 0, 1.33, .82, s);
    for (const k of [-1, 1]) { const w = M(G.sphLo, white, .26, .17, .62, k * .26, .3, -.12, s); w.rotation.x = -.35; w.rotation.z = k * .25; }
    M(G.cone, white, .12, .35, .12, 0, .32, -.8, s).rotation.x = -2.2;
    // upside-down "reflection": an elephant hanging below the water
    const r = grp(s, 0, -.02, 0); r.scale.set(1.25, .95, 1.25);
    M(G.sphLo, ele, .42, .42, .44, 0, -.38, .3, r);
    M(taperTube(neck.map(p => [p[0], -p[1] - .08, p[2] + .05]), lin(.16, .05), 10, 6), ele, 1, 1, 1, 0, 0, 0, r);
    for (const k of [-1, 1]) { const e = M(G.sphLo, mat(0x3a3530, { roughness: .8 }), .07, .45, .42, k * .42, -.4, .12, r); e.rotation.z = k * .35; }
    M(G.sphLo, ele, .52, .45, .78, 0, -.55, -.55, r);
    for (const [x, z] of [[-.3, .05], [.3, .05], [-.3, -1.0], [.3, -1.0]]) { M(G.cylLo, ele, .07, .62, .07, x, -1.0, z, r); M(G.knob, ele, .11, .05, .11, x, -1.3, z, r); }
    M(taperTube([[0, -.15, -.8], [.05, -.5, -1.42], [0, -.95, -1.5]], lin(.05, .02), 6, 4), ele, 1, 1, 1, 0, 0, 0, r);
    swans.push({ sw, s, R: 2.6 + i * 1.1, a0: i * 2.1 + .3, sp: (i % 2 ? -1 : 1) * (.09 - i * .015), ph: i * 1.7 });
  }
  function update(dt, t) {
    for (const s of swans) { const a = s.a0 + t * s.sp; s.sw.position.set(Math.cos(a) * s.R, 0, Math.sin(a) * s.R); s.sw.rotation.y = -a + (s.sp > 0 ? 0 : PI); s.s.position.y = WY + .03 * Math.sin(t * 1.4 + s.ph); s.s.rotation.z = .03 * Math.sin(t + s.ph); }
  }
  update(0, 0);
  return { g: mergeStatic(g), obs: [[0, 0, 7.45]], update, height: 2.9 };
}

// ============================================================ 11. ANT SWARM
let _antGeo = null;
function antGeo() {
  if (_antGeo) return _antGeo;
  const parts = [[G.oct, mtx(0, .03, -.065, 0, 0, 0, .032, .026, .05)], [G.oct, mtx(0, .032, 0, 0, 0, 0, .017, .015, .028)], [G.oct, mtx(0, .035, .045, 0, 0, 0, .022, .02, .022)]];
  for (const r of [.55, -.55]) parts.push([G.box, mtx(0, .02, 0, 0, r, 0, .13, .006, .008)]);
  return (_antGeo = mergeGeo(parts));
}
export function buildAntSwarm(n = 80, radius = 2, opts = {}) {
  const g = new THREE.Group(), size = opts.size || 1.4, y0 = opts.y || 0;
  const im = new THREE.InstancedMesh(antGeo(), mat(0x120d0a, { roughness: .4 }), n); im.castShadow = true; im.frustumCulled = false; g.add(im);
  const D = new Float32Array(n * 7);
  for (let i = 0; i < n; i++) {
    const a = rnd() * TAU, rr = Math.sqrt(rnd()) * radius * .6, ax = R(.15, radius * .4), az = R(.15, radius * .4);
    D.set([Math.cos(a) * rr, Math.sin(a) * rr, ax, az, (R(.25, .45) / Math.max(ax, az)) * (rnd() < .5 ? 1 : -1), rnd() * TAU, size * R(.8, 1.2)], i * 7);
  }
  const e = _m1.elements;
  function update(dt, t) {
    for (let i = 0; i < n; i++) {
      const o = i * 7, w = D[o + 4], a = t * w + D[o + 5], ax = D[o + 2], az = D[o + 3];
      const x = D[o] + ax * Math.sin(a), z = D[o + 1] + az * Math.sin(2 * a) * .5;
      const dx = ax * w * Math.cos(a), dz = az * w * Math.cos(2 * a), h = Math.atan2(dx, dz), c = Math.cos(h), s = Math.sin(h), k = D[o + 6];
      e[0] = c * k; e[1] = 0; e[2] = -s * k; e[3] = 0; e[4] = 0; e[5] = k; e[6] = 0; e[7] = 0; e[8] = s * k; e[9] = 0; e[10] = c * k; e[11] = 0;
      e[12] = x; e[13] = y0 + .004 * Math.sin(t * 20 + i); e[14] = z; e[15] = 1;
      im.setMatrixAt(i, _m1);
    }
    im.instanceMatrix.needsUpdate = true;
  }
  update(0, 0);
  return { g: mergeStatic(g), obs: [], update, mesh: im };
}

// ============================================================ 12. SURREAL WALKERS
export const SURREAL_TYPES = ['clockhead', 'drawerman', 'lobsterhead', 'eyehead', 'mustache', 'stilts', 'fishhead', 'burningcoat'];
export function buildSurrealWalker(type) {
  if (!SURREAL_TYPES.includes(type)) type = SURREAL_TYPES[Math.floor(rnd() * SURREAL_TYPES.length)];
  let r, height = 2.5, extra = null; const flames = [];
  const gold = mat(0xd9a63a, { roughness: .3, metalness: .5 }), white = mat(0xf4efe4, { roughness: .7 }), black = mat(0x141416, { roughness: .5 });
  if (type === 'clockhead') {
    r = makeRig({ leg: 1.05, torso: .8, suit: 0x26346a, pants: 0x26346a, skin: 0xf0d6b0 });
    M(G.cyl, white, .12, .1, .12, 0, .03, 0, r.neck); M(G.box, mat(0xc0182a), .22, .1, .06, 0, -.05, .19, r.neck);
    M(G.cyl, gold, .06, .6, .06, 0, .3, 0, r.neck);
    const ck = makeClock(1.0, 'drape', { wrap: .08, melt: 1.1 }); ck.g.position.set(0, .62, .1); r.neck.add(ck.g);
    extra = (dt, t) => ck.update(t * 2); height = 2.6;
  } else if (type === 'drawerman') {
    r = makeRig({ leg: 1.05, torso: .95, noTorso: true, suit: 0xf2ece0, sleeve: 0xf2ece0, pants: 0x9b6a34, shoulder: .82 });
    const wood = mat(0x8a5530, { roughness: .7 });
    M(G.box, wood, .78, .98, .48, 0, 1.05 + .48, 0, r.body); M(G.box, mat(0x6b3f22), .84, .06, .54, 0, 1.05 + .98, 0, r.body);
    const outs = [.24, .05, .15];
    for (let i = 0; i < 3; i++) makeDrawer(r.body, 0, 1.05 + .2 + i * .29, .24, .62, .22, .38, outs[i], { wood, pomColor: 0xf6d6e0, knob: .07 });
    M(G.cyl, r.skin, .07, .2, .07, 0, .1, 0, r.neck);
    M(G.sph, mat(0xf1e8d8, { roughness: .5 }), .2, .25, .21, 0, .38, 0, r.neck);
    makeDrawer(r.neck, 0, .48, .19, .15, .06, .14, .07, { wood, knob: .035, pomColor: 0xf6d6e0 });
    height = 2.7;
  } else if (type === 'lobsterhead') {
    r = makeRig({ leg: 1.05, torso: .8, suit: 0xf0e9d6, pants: 0x1a1a1c, skin: 0xf0d0b0 });
    M(G.box, black, .2, .09, .05, 0, -.06, .19, r.neck);
    const lb = makeLobster(1.25); const outer = grp(r.neck, 0, .5, 0); outer.rotation.y = PI; const inner = grp(outer); inner.rotation.x = -PI / 2; inner.add(lb.g);
    extra = (dt, t) => updLobster(lb, t, false); height = 3.3;
  } else if (type === 'eyehead') {
    r = makeRig({ leg: 1.05, torso: .8, suit: 0x111114, pants: 0x111114, skin: 0xf0d0b0 });
    M(G.box, mat(0xc0182a), .09, .45, .04, 0, -.25, .2, r.neck); M(G.cyl, r.skin, .07, .15, .07, 0, .05, 0, r.neck);
    const e = makeEyeball(.52, 0x2f7be0, { lidColor: 0xd99a86 }); e.g.position.y = .6; r.neck.add(e.g);
    extra = (dt, t, ctx) => updEye(e, dt, t, ctx, 3); height = 2.95;
  } else if (type === 'mustache') {
    r = makeRig({ leg: 1.05, torso: .8, suit: 0x2b3a6e, sleeve: 0xf2ede2, pants: 0x2b3a6e, skin: 0xf0d0b0 });
    M(G.cyl, r.skin, .07, .15, .07, 0, .05, 0, r.neck);
    const mh = grp(r.neck, 0, .4, .08); const halves = makeMustache(mh, 1.6, .3);
    for (const s of [-1, 1]) { M(G.sphLo, white, .085, .085, .085, s * .14, .32, 0, mh); M(G.sphLo, black, .04, .04, .04, s * .14, .32, .07, mh); }
    const hat = grp(r.neck, 0, .95, 0); M(G.hemi, black, .3, .3, .3, 0, 0, 0, hat); M(G.disc, black, .45, .03, .45, 0, 0, 0, hat); M(G.disc, mat(0xc0182a), .305, .06, .305, 0, .04, 0, hat);
    extra = (dt, t) => { hat.position.y = .95 + .05 * Math.sin(t * 2.2); hat.rotation.z = .1 * Math.sin(t * 1.1); for (let i = 0; i < 2; i++) halves[i].rotation.z = (i ? 1 : -1) * .1 * Math.sin(t * 3); };
    height = 2.85;
  } else if (type === 'stilts') {
    r = makeRig({ leg: 3.4, torso: .75, stilt: true, suit: 0xd8a640, pants: 0x7a1a20, skin: 0xf0d0b0, amp: .2, cyc: 3.4 * .9 });
    M(G.sph, r.skin, .2, .24, .2, 0, .3, 0, r.neck);
    const mh = grp(r.neck, 0, .25, .2); makeMustache(mh, .6, .3);
    M(G.cyl, black, .17, .4, .17, 0, .7, 0, r.neck); M(G.disc, black, .3, .03, .3, 0, .5, 0, r.neck); M(G.disc, neon(0xffd23f, .8), .175, .05, .175, 0, .56, 0, r.neck);
    height = 5.05;
  } else if (type === 'fishhead') {
    r = makeRig({ leg: 1.05, torso: .8, suit: 0x2b5d50, pants: 0x223c38, skin: 0xf0d0b0 });
    const fh = grp(r.neck, 0, .42, .05), fish = mat(0x6fa3c8, { roughness: .35, metalness: .3, flatShading: true }), fin = mat(0xf0a028, { roughness: .5 });
    M(G.sph, fish, .3, .36, .62, 0, 0, 0, fh); M(G.sph, mat(0xdfe8ee, { roughness: .4 }), .22, .25, .5, 0, -.1, .05, fh);
    for (const s of [-1, 1]) { M(G.sphLo, white, .1, .1, .1, s * .24, .1, .3, fh); M(G.sphLo, black, .055, .055, .055, s * .3, .1, .33, fh); M(G.sph, fin, .02, .1, .16, s * .3, -.12, .05, fh).rotation.x = .5; }
    M(G.torus, fin, .1, .1, .14, 0, -.02, .6, fh); M(G.sphLo, mat(0x3a0d10), .08, .08, .05, 0, -.02, .6, fh);
    M(G.cone, fin, .04, .35, .2, 0, .4, -.05, fh).rotation.x = -.4;
    const tail = grp(fh, 0, 0, -.6); for (const s of [-1, 1]) { const f = M(G.cone, fin, .04, .4, .18, 0, s * .15, -.12, tail); f.rotation.x = s > 0 ? -2.3 : -.84; }
    extra = (dt, t) => { tail.rotation.y = .35 * Math.sin(t * 4); };
    height = 2.7;
  } else { // burningcoat
    r = makeRig({ leg: 1.05, torso: .82, suit: 0x8e1b1b, pants: 0x2a1a14, skin: 0xefe2cc });
    if (!G.coat) G.coat = new THREE.CylinderGeometry(.33, .58, 1, 12);
    M(G.coat, mat(0x8e1b1b, { roughness: .75 }), 1, 1.3, .85, 0, 1.24, 0, r.body);
    for (let i = 0; i < 3; i++) M(G.sphLo, gold, .035, .035, .035, 0, 1.45 + i * .18, .27 - i * .02, r.body);
    M(G.cyl, r.skin, .07, .14, .07, 0, .05, 0, r.neck); M(G.sph, mat(0xefe2cc, { roughness: .55 }), .19, .26, .2, 0, .32, 0, r.neck);
    M(G.cyl, mat(0x8e1b1b), .2, .14, .2, 0, .02, 0, r.neck);
    for (const s of [-1, 1]) { addFlame(flames, r.body, s * .26, 1.88, -.02, .5, s * .25); addFlame(flames, r.body, s * .16, 1.88, -.12, .38, s * .1); }
    addFlame(flames, r.body, 0, 1.75, -.25, .55, 0);
    height = 2.55;
  }
  const g = r.g;
  function update(dt, t, ctx) { ctx = ctx || NOCTX; updRig(r, dt, t, ctx.speed || 0); if (extra) extra(dt, t, ctx); if (flames.length) updFlames(flames, t); }
  update(0, 0, NOCTX);
  return { g: mergeStatic(g), obs: [[0, 0, type === 'stilts' ? .3 : .4]], update, height, type };
}

// ============================================================ 13. BONUS: FRIED EGG TREE & BREAD HEAD
function makeFriedEgg(parent, s) {
  const e = grp(parent); const wh = mat(0xfbf8f0, { roughness: .35 }), yo = mat(0xf7a812, { roughness: .25 });
  M(G.sphLo, wh, .3 * s, .03 * s, .27 * s, 0, 0, 0, e); M(G.sphLo, wh, .17 * s, .03 * s, .2 * s, .14 * s, 0, .08 * s, e);
  M(G.hemi, yo, .11 * s, .08 * s, .11 * s, -.03 * s, .02 * s, -.02 * s, e); return e;
}
export function buildFriedEggTree() {
  const g = new THREE.Group();
  makeTree(g, { color: 0x5b4a3a, branches: [
    { p: [[0, 0, 0], [.2, 1.2, .05], [-.1, 2.3, 0], [.05, 3.2, .1]], r: (t) => .13 + .2 * Math.pow(1 - t, 3), seg: 14 },
    { p: [[0, 2.5, 0], [.8, 3.0, .1], [1.6, 3.2, .2], [2.1, 3.0, .2]], r: lin(.11, .03) },
    { p: [[0, 2.2, 0], [-.8, 2.7, -.1], [-1.5, 2.9, .1], [-2.0, 2.75, .2]], r: lin(.1, .03) },
    { p: [[.05, 3.1, .1], [.2, 3.7, -.2], [.1, 4.3, -.4]], r: lin(.08, .02) },
  ] });
  const eggs = [], str = mat(0xeee6d6, { roughness: 1 });
  for (const [x, y, z, l] of [[1.1, 3.12, .15, 1.0], [1.75, 3.12, .2, 1.3], [-.9, 2.75, -.05, .9], [-1.6, 2.85, .1, 1.4], [.5, 2.85, .05, 1.6], [-.3, 2.5, 0, .7]]) {
    const p = grp(g, x, y, z); M(G.cylLo, str, .008, l, .008, 0, -l / 2, 0, p);
    const e = makeFriedEgg(p, 1.3); e.position.y = -l - .3; e.rotation.x = PI / 2; e.rotation.z = R(-.4, .4);
    eggs.push({ p, ph: rnd() * TAU });
  }
  for (const [x, z, s] of [[.9, .7, 2.2], [-.8, .9, 1.7]]) makeFriedEgg(g, s).position.set(x, .03, z);
  return { g: mergeStatic(g), obs: [[0, 0, .4]], update(dt, t) { for (const e of eggs) { e.p.rotation.z = .12 * Math.sin(t * 1.2 + e.ph); e.p.rotation.x = .06 * Math.sin(t * .9 + e.ph * 2); } }, height: 4.4 };
}
export function buildBreadHead() {
  const g = new THREE.Group(), por = mat(0xf3ebe0, { roughness: .4 }), H0 = 1.0;
  M(G.box, mat(0x3a2f2a, { roughness: .8 }), 1.6, H0, 1.3, 0, H0 / 2, 0, g);
  const bust = new THREE.LatheGeometry([[0, 0], [.75, 0], [.78, .15], [.7, .45], [.55, .7], [.3, .85], [.2, .95], [0, .97]].map(p => new THREE.Vector2(p[0], p[1])), 20);
  { const p = bust.attributes.position; for (let i = 0; i < p.count; i++) p.setZ(i, p.getZ(i) * .6); bust.computeVertexNormals(); }
  M(bust, por, 1, 1, 1, 0, H0, 0, g);
  M(G.cyl, por, .17, .35, .15, 0, H0 + 1.05, 0, g);
  const hd = grp(g, 0, H0 + 1.45, .02); M(G.sph, por, .3, .37, .33, 0, 0, 0, hd);
  M(G.sph, mat(0x3a2418, { roughness: .8 }), .31, .25, .34, 0, .14, -.03, hd);
  for (const s of [-1, 1]) { M(G.sphLo, mat(0x2a1a14), .035, .02, .02, s * .11, .02, .31, hd); M(G.sph, mat(0xc0182a, { roughness: .4 }), .06, .025, .03, 0, -.17, .3, hd); }
  M(G.box, por, .05, .1, .08, 0, -.04, .33, hd);
  // baguette across the head
  const bread = mat(0xc98a3c, { roughness: .75 }), crumb = mat(0xe9c27c, { roughness: .9 });
  const bg = grp(hd, 0, .42, 0); bg.rotation.z = .08;
  M(new THREE.CapsuleGeometry(.16, 1.8, 4, 10), bread, 1, 1, 1, 0, 0, 0, bg).rotation.z = PI / 2;
  for (let i = 0; i < 5; i++) M(G.sph, crumb, .12, .03, .05, -.7 + i * .35, .14, 0, bg).rotation.y = .5;
  // inkwell with tiny Angelus figures
  const ink = grp(bg, .2, .15, 0); M(G.box, mat(0x2b2b2b, { roughness: .3 }), .3, .12, .22, 0, .06, 0, ink);
  const br = mat(0x5a4632, { roughness: .6 });
  for (const s of [-1, 1]) { M(G.cone, br, .05, .2, .05, s * .07, .22, 0, ink); M(G.sphLo, br, .03, .03, .03, s * .07, .35, s * .01, ink).position.z = .02; }
  // corn cob necklace
  const corn = mat(0xf2c12e, { roughness: .6, flatShading: true }), husk = mat(0x9db45a, { roughness: .8 });
  for (const s of [-1, 1]) { const c = grp(g, s * .3, H0 + .72, .38); c.rotation.z = s * .35; M(G.sphLo, corn, .08, .25, .08, 0, -.2, 0, c); M(G.cone, husk, .07, .2, .03, s * .05, 0, 0, c).rotation.z = PI; }
  M(G.torus, mat(0x8a6a3a), .28, .28, .4, 0, H0 + .95, .05, g).rotation.x = 1.3;
  const sw = buildAntSwarm(10, .45, { size: .55, y: .16 }); sw.g.position.set(-.25, 0, 0); sw.g.scale.set(1, 1, .3); bg.add(sw.g);
  return { g: mergeStatic(g), obs: [[0, 0, .95]], update(dt, t, ctx) { sw.update(dt, t, ctx); }, height: 2.45 };
}
