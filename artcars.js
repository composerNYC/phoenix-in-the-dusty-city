// artcars.js — artist-inspired mutant vehicles ("art cars") for "Phoenix in the Dusty City"
// Each build() returns { g, deck, seat, dancers, spot, poofers, anims, lasers, update(dt,t,ctx), length, height }
// g origin = ground centre, car faces +Z. ctx = { night: 0..1, speed: m/s }.
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
export function initArtCars(api) { const d = defaultApi(); API = Object.assign(d, api || {}); if (!API.glowMap) API.glowMap = d.glowMap; }
const mat = (c, o) => A().mat(c, o);
const neon = (c, k) => A().neon(c, k);

// ============================================================ small utils
let _seed = 1;
function rnd() { _seed |= 0; _seed = _seed + 0x6D2B79F5 | 0; let t = Math.imul(_seed ^ _seed >>> 15, 1 | _seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }
function srnd(s) { let a = s | 0; return () => { a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function seedFrom(str) { let h = 2166136261; for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619); _seed = h; }
const R = (a, b) => a + rnd() * (b - a);
const smooth = (u) => u * u * (3 - 2 * u);
const NOCTX = { night: 0, speed: 0 };
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _m1 = new THREE.Matrix4(), _q1 = new THREE.Quaternion();
const _UP = new THREE.Vector3(0, 1, 0), _Z = new THREE.Vector3(0, 0, 1);

function grp(parent, x = 0, y = 0, z = 0) { const g = new THREE.Group(); g.position.set(x, y, z); if (parent) parent.add(g); return g; }
function M(geo, m, sx = 1, sy = sx, sz = sx, x = 0, y = 0, z = 0, parent) {
  const o = new THREE.Mesh(geo, m); o.scale.set(sx, sy, sz); o.position.set(x, y, z);
  o.castShadow = true; o.receiveShadow = true; if (parent) parent.add(o); return o;
}
const noSh = (o) => { o.castShadow = false; return o; };
const keep = (o) => { o.userData.keep = true; return o; };
function placeSeg(o, a, b, r) {
  _v1.subVectors(b, a); const len = _v1.length() || 1e-4;
  o.position.addVectors(a, b).multiplyScalar(.5); _v1.multiplyScalar(1 / len);
  o.quaternion.setFromUnitVectors(_UP, _v1); o.scale.set(r, len, r);
}
function cnv(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; }
function ctex(c, rep) { const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; if (rep) t.wrapS = t.wrapT = THREE.RepeatWrapping; return t; }
function mtx(x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) {
  return new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(sx, sy, sz));
}
// merge [geometry, matrix?] pairs -> one non-indexed geometry (position+normal(+uv))
function mergeGeo(parts) {
  let n = 0; const list = [];
  for (const [geo, m] of parts) { const gg = geo.index ? geo.toNonIndexed() : geo.clone(); if (m) gg.applyMatrix4(m); list.push(gg); n += gg.attributes.position.count; }
  const hasUv = list.every(gg => gg.attributes.uv), hasCol = list.every(gg => gg.attributes.color);
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uv = hasUv ? new Float32Array(n * 2) : null, col = hasCol ? new Float32Array(n * 3) : null; let o = 0;
  for (const gg of list) { pos.set(gg.attributes.position.array, o * 3); nor.set(gg.attributes.normal.array, o * 3); if (uv) uv.set(gg.attributes.uv.array, o * 2); if (col) col.set(gg.attributes.color.array, o * 3); o += gg.attributes.position.count; gg.dispose(); }
  const out = new THREE.BufferGeometry(); out.setAttribute('position', new THREE.BufferAttribute(pos, 3)); out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  if (uv) out.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); if (col) out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  out.computeBoundingSphere(); return out;
}
// batch sibling meshes sharing a material (per parent). Skips userData.keep, meshes with children, instanced meshes.
function mergeStatic(root) {
  const nodes = []; root.traverse(o => { if (!o.isMesh && !o.isSprite && !o.isLight) nodes.push(o); });
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
// tapered tube along catmull-rom points; rFn(t) radius
function taperTube(pts, rFn, tubSeg = 16, radSeg = 6) {
  const curve = new THREE.CatmullRomCurve3(pts.map(p => p.isVector3 ? p : new THREE.Vector3(p[0], p[1], p[2])));
  const geo = new THREE.TubeGeometry(curve, tubSeg, 1, radSeg, false);
  const pos = geo.attributes.position, P = new THREE.Vector3(), Q = new THREE.Vector3();
  for (let i = 0; i <= tubSeg; i++) {
    const t = i / tubSeg; curve.getPointAt(t, P); const r = rFn(t);
    for (let j = 0; j <= radSeg; j++) { const k = i * (radSeg + 1) + j; Q.fromBufferAttribute(pos, k).sub(P).multiplyScalar(r).add(P); pos.setXYZ(k, Q.x, Q.y, Q.z); }
  }
  geo.computeVertexNormals(); return geo;
}
const lin = (a, b, p = 1) => (t) => a + (b - a) * Math.pow(t, p);
function tube(pts, r, seg = 16, rad = 4, closed = false) { return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map(p => p.isVector3 ? p : V(p[0], p[1], p[2])), closed), seg, r, rad, closed); }
function ellipseTube(rx, rz, y, r, seg = 40) { const pts = []; for (let i = 0; i < seg; i++) { const a = i / seg * TAU; pts.push(V(Math.sin(a) * rx, y, Math.cos(a) * rz)); } return tube(pts, r, seg, 4, true); }
// box with UVs in world units (tw x th metres per texture tile)
function boxGeoUV(w, h, d, tw, th) {
  const geo = new THREE.BoxGeometry(w, h, d); const uv = geo.attributes.uv; const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) for (let k = 0; k < 4; k++) { const i = f * 4 + k; uv.setXY(i, uv.getX(i) * dims[f][0] / tw + f * .31, uv.getY(i) * dims[f][1] / th); }
  return geo;
}
function solveKnee(H, An, L1, L2, bend, out) {
  _v2.subVectors(An, H); let dist = _v2.length(); _v2.multiplyScalar(1 / (dist || 1)); dist = Math.min(dist, (L1 + L2) * .999);
  const a = (L1 * L1 - L2 * L2 + dist * dist) / (2 * dist), h = Math.sqrt(Math.max(0, L1 * L1 - a * a));
  _v3.copy(bend).addScaledVector(_v2, -bend.dot(_v2)).normalize();
  out.copy(H).addScaledVector(_v2, a).addScaledVector(_v3, h);
}
function glowSprite(color, scale) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: A().glowMap, color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 })); s.scale.setScalar(scale); return s; }
function makeLasers(n, colors, len) {
  const g = new THREE.Group(); const geo = new THREE.CylinderGeometry(.045, .045, len, 5, 1, true); geo.rotateX(PI / 2); geo.translate(0, 0, len / 2);
  const beams = []; for (let i = 0; i < n; i++) { const m = new THREE.MeshBasicMaterial({ color: new THREE.Color(colors[i % colors.length]).multiplyScalar(4), transparent: true, opacity: .55, blending: THREE.AdditiveBlending, depthWrite: false }); const b = new THREE.Mesh(geo, m); b.frustumCulled = false; b.userData.keep = true; g.add(b); beams.push({ b, ph: i / n * TAU, sp: R(.4, 1.1) }); }
  g.userData.beams = beams; g.visible = false; return g;
}

// vertex-coloured flat-panel kit (cubist planes with thick black outlines)
class Kit {
  constructor() { this.P = []; this.C = []; this.c = new THREE.Color(); }
  tri(a, b, c, col) { this.P.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]); for (let i = 0; i < 3; i++) this.C.push(col.r, col.g, col.b); }
  poly(pts, hex) { const c = new THREE.Color(hex); for (let i = 1; i < pts.length - 1; i++) this.tri(pts[0], pts[i], pts[i + 1], c); }
  bar(a, b, w, hex = 0x111111) {
    const c = new THREE.Color(hex), P0 = V(...a), P1 = V(...b), d = P1.clone().sub(P0).normalize();
    const ref = Math.abs(d.y) < .9 ? _UP : V(1, 0, 0); const u = V().crossVectors(d, ref).normalize().multiplyScalar(w), v = V().crossVectors(d, u).normalize().multiplyScalar(w);
    P0.addScaledVector(d, -w * .7); P1.addScaledVector(d, w * .7);
    const cs = [[1, 1], [-1, 1], [-1, -1], [1, -1]];
    const ca = cs.map(([p, q]) => P0.clone().addScaledVector(u, p).addScaledVector(v, q).toArray()), cb = cs.map(([p, q]) => P1.clone().addScaledVector(u, p).addScaledVector(v, q).toArray());
    for (let i = 0; i < 4; i++) { const j = (i + 1) % 4; this.tri(ca[i], cb[i], cb[j], c); this.tri(ca[i], cb[j], ca[j], c); }
  }
  line(pts, w, hex, closed) { for (let i = 0; i < pts.length - (closed ? 0 : 1); i++) this.bar(pts[i], pts[(i + 1) % pts.length], w, hex); }
  panel(pts, hex, w = .065) { this.poly(pts, hex); this.line(pts, w, 0x111111, true); }
  geo() { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(this.P, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(this.C, 3)); g.computeVertexNormals(); return g; }
}

// ============================================================ shared geometry
const G = {
  box: new THREE.BoxGeometry(1, 1, 1),
  sph: new THREE.SphereGeometry(1, 12, 8),
  sphLo: new THREE.SphereGeometry(1, 8, 6),
  knob: new THREE.SphereGeometry(1, 6, 4),
  oct: new THREE.OctahedronGeometry(1, 0),
  cyl: new THREE.CylinderGeometry(1, 1, 1, 10),
  cylLo: new THREE.CylinderGeometry(1, 1, 1, 6),
  cone: new THREE.ConeGeometry(1, 1, 8),
  cone4: new THREE.ConeGeometry(1, 1, 4).rotateY(PI / 4),
  tire: new THREE.CylinderGeometry(1, 1, 1, 16),
  hub: new THREE.CylinderGeometry(1, 1, 1, 10),
  halo: new THREE.TorusGeometry(1, .07, 4, 16),
  ring: new THREE.TorusGeometry(1, .12, 4, 12),
  plane: new THREE.PlaneGeometry(1, 1),
};
G.eye = new THREE.SphereGeometry(1, 14, 9).rotateX(PI / 2); // iris pole -> +Z

// ============================================================ textures
const TX = {};
const PIC = ['#e8b04a', '#d9603b', '#3d6fb6', '#f2e3c6', '#7fb069', '#c94f7a', '#efc8a8', '#8a6bbf', '#f4d35e', '#2a9d8f', '#ec8f6a', '#5b8fd1'];

function starryTex() {
  if (TX.starry) return TX.starry;
  const W = 1024, H = 384, [c, x] = cnv(W, H), r = srnd(11), pk = (a) => a[(r() * a.length) | 0];
  const gr = x.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, '#173a86'); gr.addColorStop(.75, '#1f4a9c'); gr.addColorStop(1, '#0f2350'); x.fillStyle = gr; x.fillRect(0, 0, W, H);
  const vort = [{ x: 330, y: 160, r: 95, s: 1 }, { x: 545, y: 120, r: 62, s: -1 }, { x: 830, y: 185, r: 80, s: 1 }];
  const stars = [{ x: 110, y: 75, r: 32 }, { x: 225, y: 245, r: 22 }, { x: 455, y: 60, r: 28 }, { x: 660, y: 235, r: 25 }, { x: 705, y: 70, r: 30 }, { x: 980, y: 280, r: 22 }, { x: 40, y: 220, r: 20 }];
  const moon = { x: 925, y: 80, r: 44 }, srcs = stars.concat([moon]);
  const flow = (px, py) => {
    let vx = 1, vy = .45 * Math.sin(px * .011 + py * .004) + .25 * Math.sin(px * .027);
    for (const v of vort) { const dx = px - v.x, dy = py - v.y, d = Math.hypot(dx, dy) + 1e-3, f = 2.6 * Math.exp(-Math.pow(d / (v.r * 1.5), 2)); vx += -dy / d * f * v.s; vy += dx / d * f * v.s; }
    for (const s of srcs) { const dx = px - s.x, dy = py - s.y, d = Math.hypot(dx, dy) + 1e-3, f = 2.2 * Math.exp(-Math.pow(d / (s.r * 2), 2)); vx += -dy / d * f; vy += dx / d * f; }
    const l = Math.hypot(vx, vy); return [vx / l, vy / l];
  };
  const BL = ['#1b419b', '#2a56b0', '#3a69c2', '#163781', '#5585cf', '#86b1e3', '#244d9f', '#0f2c6e'], PALE = ['#a9cdee', '#d8e8f2', '#7fb0e0', '#eef0c8', '#b9d6ea'], YEL = ['#f7e27a', '#fff2a8', '#efc93e', '#f6f0c9', '#e6b52e'];
  x.lineCap = 'round';
  const stroke = (px, py, col, w, steps, step) => { x.strokeStyle = col; x.lineWidth = w; x.beginPath(); x.moveTo(px, py); for (let k = 0; k < steps; k++) { const f = flow(px, py); px += f[0] * step; py += f[1] * step; x.lineTo(px, py); } x.stroke(); };
  for (let i = 0; i < 7500; i++) {
    const px = r() * W, py = r() * H * .84; let near = 1e9, vn = 1e9;
    for (const s of srcs) near = Math.min(near, Math.hypot(px - s.x, py - s.y) / s.r);
    for (const v of vort) vn = Math.min(vn, Math.hypot(px - v.x, py - v.y) / v.r);
    let col;
    if (near < 2.4) col = (near < 1.4 || r() < .6) ? pk(YEL) : pk(PALE);
    else if (vn < 1.5 && r() < .7) col = r() < .2 ? pk(YEL) : pk(PALE);
    else col = r() < .1 ? pk(PALE) : pk(BL);
    stroke(px, py, col, 2.5 + r() * 3.5, 4 + (r() * 5 | 0), 4 + r() * 2);
  }
  // rolling hills / village band
  for (let i = 0; i < 2200; i++) {
    const px = r() * W, base = H * .84 + 14 * Math.sin(px * .012) + 8 * Math.sin(px * .031), py = base + r() * (H - base) - 4;
    x.strokeStyle = pk(['#14295e', '#1d3a6e', '#25466b', '#1a3b3a', '#2c4f7a', '#3a5f8a']); x.lineWidth = 3 + r() * 3;
    x.beginPath(); x.moveTo(px, py); x.quadraticCurveTo(px + 8, py - 3 * r(), px + 16, py + (r() - .5) * 3); x.stroke();
  }
  for (let i = 0; i < 14; i++) { const px = 60 + i * 70 + r() * 30, py = H * .9 + r() * 10; x.fillStyle = '#f5d76e'; x.fillRect(px, py, 5, 5); }
  for (const s of stars) { const g2 = x.createRadialGradient(s.x, s.y, 0, s.x, s.y, s.r * .6); g2.addColorStop(0, '#fffef0'); g2.addColorStop(.6, '#fff2a0'); g2.addColorStop(1, 'rgba(255,230,120,0)'); x.fillStyle = g2; x.beginPath(); x.arc(s.x, s.y, s.r * .6, 0, TAU); x.fill(); }
  // crescent moon in an orange halo
  x.fillStyle = 'rgba(240,170,50,.85)'; x.beginPath(); x.arc(moon.x, moon.y, moon.r * .78, 0, TAU); x.fill();
  const [mc, mx] = cnv(128, 128); mx.fillStyle = '#ffe87a'; mx.beginPath(); mx.arc(64, 64, 30, 0, TAU); mx.fill(); mx.globalCompositeOperation = 'destination-out'; mx.beginPath(); mx.arc(78, 54, 27, 0, TAU); mx.fill();
  x.drawImage(mc, moon.x - 64, moon.y - 64);
  return (TX.starry = ctex(c, true));
}
function cypressTex() {
  if (TX.cyp) return TX.cyp; const [c, x] = cnv(128, 256), r = srnd(5);
  x.fillStyle = '#16301b'; x.fillRect(0, 0, 128, 256); x.lineCap = 'round';
  const cols = ['#0f2414', '#2b5a2e', '#3f7a3a', '#183018', '#5a8a40', '#6d6a2a', '#0a160c', '#24482a'];
  for (let i = 0; i < 1100; i++) { const px = r() * 128, py = r() * 270; x.strokeStyle = cols[(r() * cols.length) | 0]; x.lineWidth = 2.5 + r() * 3.5; x.beginPath(); x.moveTo(px, py); x.quadraticCurveTo(px + (r() - .5) * 18, py - 12, px + (r() - .5) * 10, py - 24); x.stroke(); }
  return (TX.cyp = ctex(c, true));
}
function signTex(text, fg, bg, w = 512, h = 64) {
  const k = 'sign' + text; if (TX[k]) return TX[k]; const [c, x] = cnv(w, h);
  x.fillStyle = bg; x.fillRect(0, 0, w, h); x.fillStyle = fg; x.font = `bold ${h * .58}px Georgia, "Times New Roman", serif`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(text, w / 2, h / 2 + 2);
  return (TX[k] = ctex(c));
}
// vase: lathe v rows follow the profile index (12 pts)
function vaseTex() {
  if (TX.vase) return TX.vase; const W = 512, H = 256, [c, x] = cnv(W, H), r = srnd(21);
  const rowY = (v) => (1 - v) * H;
  x.fillStyle = '#c0603a'; x.fillRect(0, 0, W, H);
  const band = (v0, v1, cols, n) => { for (let i = 0; i < n; i++) { const px = r() * W, py = rowY(v0) - r() * (rowY(v0) - rowY(v1)); x.strokeStyle = cols[(r() * cols.length) | 0]; x.lineWidth = 3 + r() * 4; x.beginPath(); x.moveTo(px, py); x.lineTo(px + 10 + r() * 12, py + (r() - .5) * 4); x.stroke(); } };
  x.lineCap = 'round';
  band(0, 1, ['#b5532f', '#cf6e43', '#a8482a', '#d98055', '#c26038'], 2200);
  // yellow belly band with "Vincent"
  x.fillStyle = '#e8b53c'; x.fillRect(0, rowY(.37), W, rowY(.17) - rowY(.37));
  band(.17, .37, ['#f2c94c', '#e0a52e', '#f7dd7a', '#d89a2a'], 900);
  x.fillStyle = '#2c5aa0'; x.fillRect(0, rowY(.395), W, 7); x.fillRect(0, rowY(.165), W, 5);
  x.font = 'italic bold 30px "Brush Script MT", "Segoe Script", cursive'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillStyle = '#1f4a9a';
  for (const u of [.25, .75]) x.fillText('Vincent', u * W, (rowY(.37) + rowY(.17)) / 2);
  // ochre neck
  x.fillStyle = '#d99a35'; x.fillRect(0, rowY(.78), W, rowY(.5) - rowY(.78)); band(.5, .78, ['#e6ad45', '#c98a2c', '#efc163'], 700);
  x.fillStyle = '#2c5aa0'; x.fillRect(0, rowY(.5), W, 5);
  return (TX.vase = ctex(c, true));
}
function sunflowerTex() {
  if (TX.sun) return TX.sun; const [c, x] = cnv(256, 256), r = srnd(31);
  for (let layer = 0; layer < 2; layer++) {
    const n = layer ? 17 : 21;
    for (let i = 0; i < n; i++) {
      const a = i / n * TAU + layer * .17 + (r() - .5) * .12, len = (layer ? 92 : 118) * (.85 + r() * .15), w = 15 + r() * 9, curl = (r() - .5) * 18;
      x.save(); x.translate(128, 128); x.rotate(a);
      const gr = x.createLinearGradient(20, 0, len, 0); gr.addColorStop(0, layer ? '#c8701a' : '#d9821e'); gr.addColorStop(.45, '#f2b72a'); gr.addColorStop(1, '#ffe066');
      x.fillStyle = gr; x.beginPath(); x.moveTo(20, 0); x.bezierCurveTo(len * .35, -w, len * .8, -w * .6 + curl * .5, len, curl); x.bezierCurveTo(len * .8, w * .6 + curl * .5, len * .35, w, 20, 0); x.fill();
      x.strokeStyle = 'rgba(150,70,10,.65)'; x.lineWidth = 1.6; x.stroke();
      x.strokeStyle = 'rgba(190,110,20,.5)'; x.lineWidth = 1.2; for (let k = -1; k <= 1; k++) { x.beginPath(); x.moveTo(30, k * 3); x.quadraticCurveTo(len * .6, k * w * .3 + curl * .3, len * .9, curl * .9 + k * 2); x.stroke(); }
      x.restore();
    }
  }
  x.fillStyle = '#4a2a0c'; x.beginPath(); x.arc(128, 128, 30, 0, TAU); x.fill();
  return (TX.sun = ctex(c));
}
function seedTex() {
  if (TX.seed) return TX.seed; const [c, x] = cnv(128, 128);
  x.fillStyle = '#3b230c'; x.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 260; i++) { const a = i * 2.39996, rr = Math.sqrt(i) * 3.9; const px = 64 + Math.cos(a) * rr, py = 64 + Math.sin(a) * rr; x.fillStyle = i < 30 ? '#6b7a2a' : i % 3 ? '#8a4a12' : '#c8701a'; x.beginPath(); x.arc(px, py, 2.6, 0, TAU); x.fill(); }
  return (TX.seed = ctex(c));
}
function dabTex(key, base, pal, n, horiz) {
  if (TX[key]) return TX[key]; const W = 512, H = 512, [c, x] = cnv(W, H), r = srnd(key.length * 977 + 3);
  x.fillStyle = base; x.fillRect(0, 0, W, H);
  for (let i = 0; i < n; i++) {
    const px = r() * W, py = r() * H, w = (4 + r() * 7) * (horiz ? 1.9 : 1.2), h = 2.5 + r() * 3.5, rot = horiz ? (r() - .5) * .35 : r() * PI;
    x.globalAlpha = .55 + r() * .45; x.fillStyle = pal[(r() * pal.length) | 0];
    for (const ox of [0, -W, W]) for (const oy of [0, -H, H]) { if (ox && (px > 20 && px < W - 20)) continue; if (oy && (py > 20 && py < H - 20)) continue; x.beginPath(); x.ellipse(px + ox, py + oy, w, h, rot, 0, TAU); x.fill(); }
  }
  x.globalAlpha = 1; return (TX[key] = ctex(c, true));
}
const waterTex = () => dabTex('water', '#6f8fc0', ['#8fb0d8', '#b7c9e8', '#c9b4df', '#7fa7a0', '#a8d0b8', '#e9e1f2', '#f2d9a0', '#5e7fb5', '#9fc6c0'], 9000, true);
const gardenTex = () => dabTex('garden', '#7f9fc4', ['#b9a6dc', '#e8a8c8', '#6f9a5a', '#a8c878', '#f2d9a0', '#8cb8d8', '#5a8a5a', '#f4b8b0', '#c8b8f0'], 6000, false);
function harlequinTex() {
  if (TX.harl) return TX.harl; const W = 512, [c, x] = cnv(W, W), r = srnd(41), S = 128;
  x.fillStyle = '#f0e6d2'; x.fillRect(0, 0, W, W);
  const dia = (cx, cy, col) => { x.fillStyle = col; x.beginPath(); x.moveTo(cx, cy - S / 2); x.lineTo(cx + S / 2, cy); x.lineTo(cx, cy + S / 2); x.lineTo(cx - S / 2, cy); x.closePath(); x.fill();
    x.save(); x.clip(); for (let k = 0; k < 40; k++) { x.strokeStyle = r() < .5 ? 'rgba(255,255,255,.18)' : 'rgba(0,0,0,.1)'; x.lineWidth = 3 + r() * 4; const px = cx + (r() - .5) * S, py = cy + (r() - .5) * S; x.beginPath(); x.moveTo(px, py); x.lineTo(px + 10, py - 8); x.stroke(); } x.restore(); };
  const A = ['#e58fa0', '#4a78b8'], B = ['#e0b050', '#f0e6d2'];
  for (let i = 0; i <= 4; i++) for (let j = 0; j <= 4; j++) { dia(i * S + S / 2, j * S + S / 2, A[(i + j) % 2]); dia(i * S, j * S, B[(i + j) % 2]); }
  x.strokeStyle = '#1a1a1a'; x.lineWidth = 3;
  for (let k = -4; k <= 8; k++) { x.beginPath(); x.moveTo(k * S, 0); x.lineTo(k * S + W, W); x.stroke(); x.beginPath(); x.moveTo(k * S, 0); x.lineTo(k * S - W, W); x.stroke(); }
  x.fillStyle = '#e8c25a'; for (let i = 0; i <= 4; i++) for (let j = 0; j <= 4; j++) for (const [ox, oy] of [[S / 2, 0], [0, S / 2]]) { x.beginPath(); x.arc(i * S + ox, j * S + oy, 6, 0, TAU); x.fill(); }
  return (TX.harl = ctex(c, true));
}
function collageTex() {
  if (TX.coll) return TX.coll; const W = 512, H = 256, [c, x] = cnv(W, H), r = srnd(51), pk = (a) => a[(r() * a.length) | 0];
  x.fillStyle = '#e9dcc0'; x.fillRect(0, 0, W, H); x.lineJoin = 'round';
  for (let i = 0; i < 46; i++) {
    x.fillStyle = pk(PIC); x.strokeStyle = '#141414'; x.lineWidth = 4; const px = r() * W, py = r() * H, s = 30 + r() * 70, k = r();
    x.beginPath();
    if (k < .45) x.rect(px - s / 2, py - s * .35, s, s * .7);
    else if (k < .8) { x.moveTo(px, py - s * .6); x.lineTo(px + s * .6, py + s * .4); x.lineTo(px - s * .5, py + s * .5); x.closePath(); }
    else x.arc(px, py, s * .3, 0, TAU);
    x.fill(); x.stroke();
    if (r() < .15) { x.fillStyle = '#1a1a1a'; x.beginPath(); x.arc(px, py, s * .12, 0, TAU); x.fill(); }
  }
  // faux bois + newspaper scraps
  for (let i = 0; i < 3; i++) { const px = r() * (W - 120), py = r() * (H - 60); x.fillStyle = '#a8743f'; x.fillRect(px, py, 110, 50); x.strokeStyle = '#6b4220'; x.lineWidth = 2; for (let k = 0; k < 8; k++) { x.beginPath(); x.moveTo(px, py + 4 + k * 6); x.bezierCurveTo(px + 30, py + k * 6 - 4, px + 70, py + k * 6 + 10, px + 110, py + 4 + k * 6); x.stroke(); } x.strokeStyle = '#141414'; x.lineWidth = 4; x.strokeRect(px, py, 110, 50); }
  for (const [px, py, t] of [[70, 60, 'LE JOU'], [330, 190, 'JOURNAL']]) { x.fillStyle = '#f4efe2'; x.fillRect(px - 60, py - 22, 120, 44); x.fillStyle = '#141414'; x.font = 'bold 26px Georgia, serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(t, px, py); x.lineWidth = 4; x.strokeRect(px - 60, py - 22, 120, 44); }
  return (TX.coll = ctex(c, true));
}
function blanketTex() {
  if (TX.blanket) return TX.blanket; const [c, x] = cnv(256, 128);
  x.fillStyle = '#a3121e'; x.fillRect(0, 0, 256, 128);
  x.strokeStyle = '#e2b03c'; x.lineWidth = 2; for (let i = -8; i < 24; i++) { x.beginPath(); x.moveTo(i * 16, 18); x.lineTo(i * 16 + 64, 110); x.moveTo(i * 16 + 64, 18); x.lineTo(i * 16, 110); x.stroke(); }
  x.fillStyle = '#e2b03c'; x.fillRect(0, 0, 256, 14); x.fillRect(0, 114, 256, 14);
  return (TX.blanket = ctex(c));
}
function eyeTex() {
  if (TX.eye) return TX.eye; const [c, x] = cnv(256, 128), r = srnd(4242);
  x.fillStyle = '#f5f0e8'; x.fillRect(0, 0, 256, 128);
  x.strokeStyle = '#b8141f'; x.lineCap = 'round';
  for (let v = 0; v < 30; v++) { let px = r() * 256, py = 128 - r() * 12; x.lineWidth = 1 + r() * 1.4; x.beginPath(); x.moveTo(px, py); for (let k = 0; k < 14 && py > 28; k++) { px += (r() - .5) * 16; py -= 3 + r() * 5; x.lineTo(px, py); } x.stroke(); }
  for (let i = 0; i < 256; i++) { const n = .7 + .2 * Math.sin(i * .9) + .15 * Math.sin(i * 2.7 + 1); x.fillStyle = `rgb(${40 * n | 0},${110 * n | 0},${220 * n | 0})`; x.fillRect(i, 0, 1, 26); }
  x.fillStyle = 'rgba(8,12,30,.75)'; x.fillRect(0, 22, 256, 5);
  x.fillStyle = '#050505'; x.fillRect(0, 0, 256, 11);
  return (TX.eye = ctex(c));
}
// ---------- melting clock (hang mode: origin = ledge top edge, ledge extends to -Z, hangs down past +Z edge)
function clockFaceTex() {
  if (TX.clock) return TX.clock; const [c, x] = cnv(256, 256);
  const gr = x.createRadialGradient(128, 128, 10, 128, 128, 128); gr.addColorStop(0, '#fbf1d6'); gr.addColorStop(.85, '#eedcae'); gr.addColorStop(1, '#c99f55');
  x.fillStyle = gr; x.fillRect(0, 0, 256, 256);
  x.strokeStyle = '#5a3c16'; x.lineWidth = 3; x.beginPath(); x.arc(128, 128, 118, 0, TAU); x.stroke();
  for (let i = 0; i < 60; i++) { const a = i / 60 * TAU, r0 = i % 5 ? 104 : 96; x.lineWidth = i % 5 ? 1.5 : 3.5; x.beginPath(); x.moveTo(128 + Math.sin(a) * r0, 128 - Math.cos(a) * r0); x.lineTo(128 + Math.sin(a) * 109, 128 - Math.cos(a) * 109); x.stroke(); }
  x.fillStyle = '#2a1a0a'; x.font = 'bold 28px Georgia, "Times New Roman", serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
  for (let h = 1; h <= 12; h++) { const a = h / 12 * TAU; x.fillText(String(h), 128 + Math.sin(a) * 78, 130 - Math.cos(a) * 78); }
  // ants on the dial
  x.fillStyle = '#120c08'; const r = srnd(3); for (let i = 0; i < 9; i++) { const px = 100 + r() * 60, py = 130 + r() * 50, a = r() * TAU; x.save(); x.translate(px, py); x.rotate(a); x.beginPath(); x.ellipse(0, 0, 4, 2.4, 0, 0, TAU); x.ellipse(5, 0, 2.4, 2, 0, 0, TAU); x.ellipse(-5, 0, 2, 1.7, 0, 0, TAU); x.fill(); x.restore(); }
  return (TX.clock = ctex(c));
}
function makeHangingClock(size, melt = 1) {
  const r = size / 2, g = new THREE.Group(), rb = .09 * size / 2, v0 = .08 * r, arc = PI / 2 * rb;
  const def = (a, b, out) => {
    const s = v0 - b;
    if (s < 0) { const bul = .03 * r * Math.max(0, 1 - (a * a + b * b) / (r * r)); return out.set(a, bul, -rb + s); }
    if (s <= arc) { const th = s / rb; return out.set(a, -rb + rb * Math.cos(th), -rb + rb * Math.sin(th)); }
    const d = s - arc, dn = d / r;
    return out.set(a * (1 - .22 * melt * dn) + .12 * melt * r * dn * dn, -rb - d * (1 + .55 * melt * dn), .04 * d + .04 * r * Math.sin(a / r * 2.5) * dn);
  };
  const RINGS = 5, SEG = 22, irr = (th) => 1 + .035 * Math.sin(3 * th + 1) + .025 * Math.sin(5 * th + 2);
  const pos = [], uv = [], idx = [], P = new THREE.Vector3();
  def(0, 0, P); pos.push(P.x, P.y, P.z); uv.push(.5, .5);
  for (let k = 1; k <= RINGS; k++) for (let j = 0; j < SEG; j++) { const th = j / SEG * TAU, f = k / RINGS, rr = r * f, sc = 1 + (irr(th) - 1) * f, a = Math.cos(th) * rr, b = Math.sin(th) * rr; def(a * sc, b * sc, P); pos.push(P.x, P.y, P.z); uv.push(a / (2 * r) + .5, b / (2 * r) + .5); }
  for (let j = 0; j < SEG; j++) idx.push(0, 1 + j, 1 + (j + 1) % SEG);
  for (let k = 1; k < RINGS; k++) for (let j = 0; j < SEG; j++) { const i0 = 1 + (k - 1) * SEG + j, i1 = 1 + (k - 1) * SEG + (j + 1) % SEG, o0 = 1 + k * SEG + j, o1 = 1 + k * SEG + (j + 1) % SEG; idx.push(i0, o0, o1, i0, o1, i1); }
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geo.setIndex(idx); geo.computeVertexNormals();
  if (!TX.clockMat) TX.clockMat = new THREE.MeshStandardMaterial({ map: clockFaceTex(), roughness: .55, emissiveMap: clockFaceTex(), emissive: 0xffffff, emissiveIntensity: .05 });
  M(geo, TX.clockMat, 1, 1, 1, 0, 0, 0, g);
  M(geo, mat(0xc0902c, { roughness: .35, metalness: .45, side: THREE.BackSide }), 1, 1, 1, 0, 0, 0, g);
  const offGeo = (d) => { const gg = geo.clone(), p = gg.attributes.position, n = gg.attributes.normal; for (let i = 0; i < p.count; i++) p.setXYZ(i, p.getX(i) + n.getX(i) * d, p.getY(i) + n.getY(i) * d, p.getZ(i) + n.getZ(i) * d); return gg; };
  const [hc, hx] = cnv(128, 128), ht = ctex(hc);
  const drawHands = (t) => { hx.clearRect(0, 0, 128, 128); hx.fillStyle = '#16100a'; for (const [L, W, a] of [[34, 5.5, t * .03 + 1.3], [52, 3.2, t * .35]]) { hx.save(); hx.translate(64, 64); hx.rotate(a); hx.beginPath(); hx.moveTo(-W, 6); hx.lineTo(-W * .8, -L * .55); hx.lineTo(0, -L); hx.lineTo(W * .8, -L * .55); hx.lineTo(W, 6); hx.closePath(); hx.fill(); hx.restore(); } hx.beginPath(); hx.arc(64, 64, 7, 0, TAU); hx.fill(); ht.needsUpdate = true; };
  drawHands(0);
  noSh(M(offGeo(.008 * size + .005), new THREE.MeshStandardMaterial({ map: ht, alphaTest: .5, roughness: .5 }), 1, 1, 1, 0, 0, 0, g));
  const rim = []; for (let j = 0; j < 32; j++) { const th = j / 32 * TAU, sc = irr(th); rim.push(def(Math.cos(th) * r * sc, Math.sin(th) * r * sc, new THREE.Vector3())); }
  M(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(rim, true), 28, .045 * size, 4, true), mat(0xd9a63a, { roughness: .3, metalness: .5 }), 1, 1, 1, 0, 0, 0, g);
  const c1 = def(0, -r * 1.06, new THREE.Vector3()); M(G.sphLo, mat(0xd9a63a, { roughness: .3, metalness: .5 }), .05 * size, .05 * size, .05 * size, c1.x, c1.y, c1.z, g);
  let last = -1; return { g, update(t) { const q = Math.floor(t * 8); if (q !== last) { last = q; drawHands(t); } } };
}

// ---------- cubist masks (Picasso): asymmetric planes, misaligned almond eyes, long profile nose, black outlines
function almond(c, e) { c.save(); c.translate(e.x, e.y); c.rotate(e.rot); c.beginPath(); c.moveTo(-e.w, 0); c.quadraticCurveTo(0, -e.h * 2, e.w, 0); c.quadraticCurveTo(0, e.h * 2, -e.w, 0); c.closePath(); c.restore(); }
function drawMask(x, S, seed, ex) {
  const r = srnd(seed * 7919 + 13), pk = (a) => a[(r() * a.length) | 0];
  const cols = PIC.slice(); for (let i = cols.length - 1; i > 0; i--) { const j = (r() * (i + 1)) | 0; [cols[i], cols[j]] = [cols[j], cols[i]]; }
  const [cA, cB, cC, cD] = cols;
  const cx = S * (.5 + (r() - .5) * .04), cy = S * .53, fw = S * (.29 + r() * .07), fh = S * (.41 + r() * .04), shape = (r() * 3) | 0, dir = r() < .5 ? -1 : 1;
  const face = (c) => {
    c.beginPath();
    if (shape === 0) c.ellipse(cx, cy, fw, fh, (r0 => r0)(0), 0, TAU);
    else if (shape === 1) { c.moveTo(cx - fw * .9, cy - fh); c.lineTo(cx + fw * .95, cy - fh * .92); c.lineTo(cx + fw, cy + fh * .25); c.lineTo(cx + fw * .3, cy + fh); c.lineTo(cx - fw * .45, cy + fh * .95); c.lineTo(cx - fw, cy + fh * .1); c.closePath(); }
    else { c.moveTo(cx, cy - fh); c.bezierCurveTo(cx + fw * 1.4, cy - fh * .8, cx + fw * 1.1, cy + fh * .9, cx + fw * .1, cy + fh); c.bezierCurveTo(cx - fw * 1.2, cy + fh * .9, cx - fw * 1.3, cy - fh * .6, cx, cy - fh); c.closePath(); }
  };
  x.lineJoin = 'round'; x.lineCap = 'round';
  // hair (behind)
  if (r() < .75) { x.fillStyle = pk(['#1c1410', '#3a2416', '#5b3a1e', '#2b2f55', '#7a2a1a']); x.beginPath(); x.ellipse(cx + dir * S * .03, cy - fh * .45, fw * 1.12, fh * .66, dir * .2, PI * .95, TAU * 1.02); x.closePath(); x.fill(); x.lineWidth = S * .018; x.strokeStyle = '#111'; x.stroke(); }
  // ear (behind)
  x.fillStyle = cA; x.beginPath(); x.ellipse(cx - dir * fw * .98, cy - fh * .05, S * .04, S * .07, 0, 0, TAU); x.fill(); x.lineWidth = S * .014; x.strokeStyle = '#111'; x.stroke();
  face(x); x.fillStyle = cA; x.fill();
  const sx = cx + dir * fw * (.05 + r() * .2);
  x.save(); face(x); x.clip();
  x.fillStyle = cB; x.beginPath(); x.moveTo(sx + dir * S * .02, cy - fh * 1.1); x.lineTo(cx + dir * fw * 2, cy - fh * 1.1); x.lineTo(cx + dir * fw * 2, cy + fh * 1.1); x.lineTo(sx - dir * S * .06, cy + fh * 1.1); x.closePath(); x.fill();
  x.fillStyle = cC; x.globalAlpha = .9; x.beginPath(); x.moveTo(cx - dir * fw * 1.3, cy + fh * (.05 + r() * .3)); x.lineTo(cx - dir * fw * .05, cy + fh * .4); x.lineTo(cx - dir * fw * 1.3, cy + fh * 1.2); x.closePath(); x.fill(); x.globalAlpha = 1;
  x.strokeStyle = 'rgba(20,15,10,.4)'; x.lineWidth = S * .007; const hx = cx + dir * fw * .55, hy = cy - fh * .55; for (let k = 0; k < 7; k++) { x.beginPath(); x.moveTo(hx + k * S * .018, hy); x.lineTo(hx + k * S * .018 - S * .05, hy + S * .1); x.stroke(); }
  // cheek dot
  x.fillStyle = pk(['#e05a6a', '#f08aa0', '#c8283a']); x.beginPath(); x.arc(cx - dir * fw * .45, cy + fh * .3, S * .035, 0, TAU); x.fill();
  x.restore();
  x.strokeStyle = '#111'; x.lineWidth = S * .018; x.beginPath(); x.moveTo(sx + dir * S * .02, cy - fh * .98); x.lineTo(sx - dir * S * .06, cy + fh * .98); x.stroke();
  // eyes: one frontal, one shifted/rotated
  const ey = cy - fh * (.2 + r() * .1);
  const eyes = [{ x: cx - dir * fw * .5, y: ey - S * (.02 + r() * .04), w: S * (.075 + r() * .03), h: S * (.034 + r() * .014), rot: (r() - .5) * .5 },
    { x: sx + dir * fw * .42, y: ey + S * (.035 + r() * .05), w: S * (.06 + r() * .03), h: S * (.03 + r() * .018), rot: r() < .4 ? dir * 1.2 : (r() - .5) * .9 }];
  for (const e of eyes) {
    almond(x, e); x.fillStyle = '#fbf6e8'; x.fill();
    x.save(); almond(x, e); x.clip(); x.fillStyle = pk(['#2a6fdb', '#1a1a1a', '#3a8a5a', '#7a3fa0', '#1e3a8a']); x.beginPath(); x.arc(e.x, e.y, e.h * 1.05, 0, TAU); x.fill(); x.fillStyle = '#050505'; x.beginPath(); x.arc(e.x, e.y, e.h * .5, 0, TAU); x.fill(); x.restore();
    almond(x, e); x.strokeStyle = '#111'; x.lineWidth = S * .014; x.stroke();
    x.beginPath(); x.ellipse(e.x, e.y - e.h * 1.6, e.w * 1.05, e.h * 1.1, e.rot, PI * 1.1, PI * 1.9); x.lineWidth = S * .02; x.stroke();
    if (ex) { almond(ex, e); ex.fillStyle = '#fff'; ex.fill(); ex.fillStyle = '#000'; ex.beginPath(); ex.arc(e.x, e.y, e.h * .45, 0, TAU); ex.fill(); }
  }
  // long profile nose
  const nTop = ey - S * .03, nTip = cy + fh * (.28 + r() * .14);
  x.fillStyle = cD; x.beginPath(); x.moveTo(sx, nTop); x.lineTo(sx + dir * S * (.11 + r() * .05), nTip); x.lineTo(sx - dir * S * .015, nTip + S * .04); x.closePath(); x.fill(); x.strokeStyle = '#111'; x.lineWidth = S * .014; x.stroke();
  x.fillStyle = '#111'; x.beginPath(); x.arc(sx + dir * S * .03, nTip + S * .015, S * .012, 0, TAU); x.fill();
  // offset lips
  const my = cy + fh * (.62 + r() * .1), mx = cx + dir * fw * (r() * .25), mw = S * (.06 + r() * .03);
  x.fillStyle = pk(['#c8283a', '#e05a4a', '#a01e3c']); x.beginPath(); x.moveTo(mx - mw, my); x.quadraticCurveTo(mx - mw * .3, my - S * .035, mx, my - S * .012); x.quadraticCurveTo(mx + mw * .3, my - S * .035, mx + mw, my + dir * S * .01); x.quadraticCurveTo(mx, my + S * .045, mx - mw, my); x.closePath(); x.fill(); x.lineWidth = S * .012; x.stroke();
  x.beginPath(); x.moveTo(mx - mw, my); x.lineTo(mx + mw, my + dir * S * .01); x.stroke();
  face(x); x.lineWidth = S * .026; x.strokeStyle = '#111'; x.stroke();
}
export function cubistMaskTexture(seed = 1) {
  const [c, x] = cnv(256, 256), [ce, xe] = cnv(256, 256);
  xe.fillStyle = '#000'; xe.fillRect(0, 0, 256, 256);
  drawMask(x, 256, seed, xe);
  const t = ctex(c); t.userData.eyes = ctex(ce); return t;
}
function maskAtlas() {
  if (TX.atlas) return TX.atlas; const [c, x] = cnv(1024, 1024), [ce, xe] = cnv(1024, 1024);
  xe.fillStyle = '#000'; xe.fillRect(0, 0, 1024, 1024);
  for (let k = 0; k < 16; k++) { const ox = (k % 4) * 256, oy = ((k / 4) | 0) * 256; x.save(); x.translate(ox, oy); xe.save(); xe.translate(ox, oy); drawMask(x, 256, k + 1, xe); x.restore(); xe.restore(); }
  xe.globalCompositeOperation = 'lighter'; xe.globalAlpha = .3; xe.drawImage(c, 0, 0); xe.globalAlpha = 1; xe.globalCompositeOperation = 'source-over';
  const em = ctex(ce);
  return (TX.atlas = { map: ctex(c), em });
}
function maskMat() {
  if (TX.maskMat) return TX.maskMat; const a = maskAtlas();
  return (TX.maskMat = new THREE.MeshStandardMaterial({ map: a.map, emissiveMap: a.em, emissive: 0xffe2a8, emissiveIntensity: .1, alphaTest: .5, side: THREE.DoubleSide, roughness: .7 }));
}
function maskGeo(k) {
  const key = 'mg' + (k % 16); if (G[key]) return G[key]; const geo = new THREE.PlaneGeometry(1, 1), uv = geo.attributes.uv, col = k % 4, row = (k % 16 / 4) | 0;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (col + uv.getX(i)) / 4, (3 - row + uv.getY(i)) / 4);
  return (G[key] = geo);
}
function maskMesh(k, size, parent, x = 0, y = 0, z = 0) { const m = noSh(M(maskGeo(k), maskMat(), size, size, 1, x, y, z, parent)); return m; }

// ============================================================ shared car parts
function carBase(o) {
  const g = new THREE.Group(), Rw = o.R || .75, fw = o.frameW || 2.4, dark = mat(0x26221f, { roughness: .6, metalness: .4 });
  M(G.box, dark, fw, .5, o.len, 0, Rw + .15, 0, g);
  if (o.glow != null) { const gm = neon(o.glow, .8); for (const s of [-1, 1]) noSh(M(G.box, gm, .07, .07, o.len * .92, s * (fw / 2 + .04), Rw - .02, 0, g)); }
  const wheels = [], tire = mat(0x161616, { roughness: .9 }), hub = neon(o.hub ?? o.glow ?? 0xffd23f, .9), spoke = mat(0xd9d9d9, { roughness: .2, metalness: .9 });
  for (const z of o.axles) {
    M(G.box, dark, o.halfW * 2, .14, .14, 0, Rw, z, g);
    for (const s of [-1, 1]) {
      const w = grp(g, s * o.halfW, Rw, z);
      M(G.tire, tire, Rw, .46, Rw, 0, 0, 0, w).rotation.z = PI / 2;
      noSh(M(G.hub, hub, Rw * .52, .5, Rw * .52, 0, 0, 0, w)).rotation.z = PI / 2;
      M(G.box, spoke, .54, Rw * 1.5, .13, 0, 0, 0, w); M(G.box, spoke, .54, .13, Rw * 1.5, 0, 0, 0, w);
      wheels.push(w);
    }
  }
  return { g, wheels, Rw };
}
function addPoofers(g, pts) {
  const chrome = mat(0xdddddd, { roughness: .15, metalness: 1 }), base = mat(0x222222), lip = neon(0xff7a2a, .9);
  for (const p of pts) { M(G.cyl, chrome, .17, 1.1, .17, p[0], p[1] + .55, p[2], g); M(G.cyl, base, .22, .12, .22, p[0], p[1] + .06, p[2], g); noSh(M(G.cyl, lip, .2, .05, .2, p[0], p[1] + 1.09, p[2], g)); p[1] += 1.15; }
  return pts;
}
// common finishing: poofers, spot light, merge, standard update wrapper
function finish(type, g, o) {
  const poofers = addPoofers(g, o.poofers);
  const spot = new THREE.PointLight(o.spotColor, 0, 28, 2); spot.name = 'spot'; spot.position.set(0, o.deck + 3, o.spotZ || 0); g.add(spot);
  if (o.lasers) g.add(o.lasers);
  mergeStatic(g);
  const nm = o.nightMats || [], sprites = o.sprites || [], wheels = o.wheels || [], Rw = o.Rw || .75, own = o.update;
  const update = (dt, t, ctx) => {
    ctx = ctx || NOCTX; const night = ctx.night || 0, sp = ctx.speed || 0;
    for (const w of wheels) w.rotation.x += sp * dt / Rw;
    for (const [m, lo, hi] of nm) m.emissiveIntensity = lo + (hi - lo) * night;
    for (const [s, op] of sprites) s.material.opacity = op * night;
    if (own) own(dt, t, ctx, night, sp);
  };
  update(0, 0, NOCTX);
  g.userData.artType = type;
  return { g, deck: o.deck, seat: o.seat, dancers: o.dancers, spot, poofers, anims: [], lasers: o.lasers || null, update, length: o.len, height: o.height };
}

// ============================================================ 1. THE STARRY NIGHT EXPRESS (Van Gogh)
function flameLathe(h, rmax, twist, ph) {
  const prof = [[0, 0], [.55, .04], [.85, .12], [.98, .26], [.92, .42], [.76, .57], [.56, .71], [.36, .83], [.18, .92], [.05, .98], [0, 1]];
  const geo = new THREE.LatheGeometry(prof.map(p => new THREE.Vector2(p[0] * rmax, p[1] * h)), 10), pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i), a = Math.atan2(x, z), rr = Math.hypot(x, z), u = y / h;
    const k = 1 + .2 * Math.sin(a * 3 + u * 9 + ph) * u, na = a + twist * u * u;
    pos.setXYZ(i, Math.sin(na) * rr * k + .22 * rmax * Math.sin(u * 7 + ph) * u, y, Math.cos(na) * rr * k);
  }
  geo.computeVertexNormals(); return geo;
}
function buildStarry() {
  seedFrom('starry');
  const { g, wheels, Rw } = carBase({ len: 9.6, frameW: 2.4, R: .8, axles: [3.5, -3.4], halfW: 1.3, glow: 0x4fa8ff, hub: 0xffd84a });
  const L = 11, W = 3, y0 = 1.6, H = 3.3, top = y0 + H, nm = [], sprites = [];
  const starMat = new THREE.MeshStandardMaterial({ map: starryTex(), emissiveMap: starryTex(), emissive: 0xffffff, emissiveIntensity: .05, roughness: .8 }); nm.push([starMat, .04, .5]);
  M(boxGeoUV(W, H, L, L, H), starMat, 1, 1, 1, 0, y0 + H / 2, 0, g);
  M(G.box, mat(0x101a3a, { roughness: .7 }), 2.7, .5, 10.4, 0, y0 - .2, 0, g);
  M(G.box, mat(0x14204a, { roughness: .6 }), W + .12, .1, L + .12, 0, top + .05, 0, g);
  const deck = top + .1;
  // window frames (neon outlines so the painting shows through): two rows = double-decker
  const wf = neon(0xffd25a, .55);
  for (const s of [-1, 1]) for (const [yb, yt] of [[2.55, 3.45], [3.85, 4.55]]) {
    const x = s * (W / 2 + .03);
    noSh(M(G.box, wf, .05, .07, 8.6, x, yb, -.35, g)); noSh(M(G.box, wf, .05, .07, 8.6, x, yt, -.35, g));
    for (let i = 0; i <= 6; i++) noSh(M(G.box, wf, .05, yt - yb, .07, x, (yb + yt) / 2, -4.65 + i * 1.433, g));
  }
  // front: windscreens, destination sign, headlights; rear lights
  const glass = mat(0x0e1630, { roughness: .15, metalness: .4 });
  M(G.box, glass, 2.5, .95, .06, 0, 3.0, L / 2 + .01, g); M(G.box, glass, 2.5, .7, .06, 0, 4.2, L / 2 + .01, g);
  const signM = new THREE.MeshBasicMaterial({ map: signTex('STARRY NIGHT EXPRESS', '#ffd84a', '#0b1230') });
  noSh(M(G.plane, signM, 2.6, .34, 1, 0, 4.7, L / 2 + .05, g));
  noSh(M(G.box, wf, 2.6, .06, .06, 0, 3.5, L / 2 + .04, g)); noSh(M(G.box, wf, 2.6, .06, .06, 0, 2.5, L / 2 + .04, g));
  for (const s of [-1, 1]) { noSh(M(G.sphLo, neon(0xfff4d8, 1.3), .22, .22, .1, s * 1.15, 2.05, L / 2 + .03, g)); noSh(M(G.box, neon(0xff2a2a, 1), .3, .25, .06, s * 1.2, 2.1, -L / 2 - .03, g)); }
  // roof railing
  const goldM = mat(0xd9a63a, { roughness: .3, metalness: .5 }), rail = neon(0xffe066, .8);
  for (const s of [-1, 1]) { for (let i = 0; i < 6; i++) M(G.cylLo, goldM, .05, .9, .05, s * 1.45, deck + .45, -5.2 + i * 2.08, g); noSh(M(G.box, rail, .07, .07, 10.6, s * 1.45, deck + .9, 0, g)); }
  noSh(M(G.box, rail, 2.9, .07, .07, 0, deck + .9, 5.3, g)); noSh(M(G.box, rail, 2.9, .07, .07, 0, deck + .9, -5.3, g));
  // stars on poles with rotating halo rings
  const poleM = mat(0x1a1a24, { roughness: .5, metalness: .5 }), spin = [];
  const starSpecs = [{ x: -1.42, z: 3.6, h: 3.2, s: 1.0, lean: .22 }, { x: 1.42, z: 1.2, h: 4.1, s: 1.15, lean: -.2 }, { x: -1.42, z: -2.2, h: 3.7, s: .95, lean: .2 }, { x: 1.42, z: -3.9, h: 2.9, s: .8, lean: -.24 }];
  for (const sp of starSpecs) {
    const pg = grp(g, sp.x, deck, sp.z); pg.rotation.z = sp.lean; M(G.cylLo, poleM, .06, sp.h, .06, 0, sp.h / 2, 0, pg);
    const st = grp(pg, 0, sp.h, 0); st.rotation.z = -sp.lean;
    noSh(M(G.sphLo, neon(0xfff0a0, 1.1), .36 * sp.s, .36 * sp.s, .36 * sp.s, 0, 0, 0, st));
    const r1 = keep(noSh(M(G.halo, neon(0xffd84a, .8), .72 * sp.s, .72 * sp.s, .72 * sp.s, 0, 0, 0, st)));
    const r2 = keep(noSh(M(G.halo, neon(0x9fd4ff, .6), 1.02 * sp.s, 1.02 * sp.s, 1.02 * sp.s, 0, 0, 0, st)));
    const spr = glowSprite(0xffe9a0, 3.0 * sp.s); st.add(spr); sprites.push([spr, .5]);
    spin.push({ r1, r2, ph: R(0, TAU), st, by: sp.h });
  }
  // crescent moon
  const mg = grp(g, 1.42, deck, 4.0); mg.rotation.z = -.18; M(G.cylLo, poleM, .06, 4.4, .06, 0, 2.2, 0, mg);
  const moon = grp(mg, 0, 4.6, 0); moon.rotation.y = PI / 2;
  noSh(M(new THREE.TorusGeometry(.62, .26, 6, 14, PI * 1.15), neon(0xffc83a, 1.3), 1, 1, 1, 0, 0, 0, moon)).rotation.z = -.55;
  const mh = keep(noSh(M(G.halo, neon(0xffa23a, .8), 1.15, 1.15, 1.15, 0, 0, 0, moon)));
  const msp = glowSprite(0xffc060, 4.2); moon.add(msp); sprites.push([msp, .9]);
  // the great swirl (rotating double spiral) above the roof
  const sw = grp(g, -1.42, deck, .2); sw.rotation.z = .1; M(G.cylLo, poleM, .07, 5.6, .07, 0, 2.8, 0, sw);
  const swirl = grp(sw, -.1, 5.9, 0);
  const spiral = (ph) => { const pts = []; for (let i = 0; i <= 44; i++) { const u = i / 44, a = u * 2.7 * TAU + ph, rr = .12 + 1.55 * u; pts.push(V(0, Math.sin(a) * rr, Math.cos(a) * rr)); } return tube(pts, .085, 44, 4); };
  noSh(M(spiral(0), neon(0x8cc8ff, 1.1), 1, 1, 1, 0, 0, 0, swirl)); noSh(M(spiral(PI), neon(0xfff1b0, 1), 1, 1, 1, 0, 0, 0, swirl));
  const ssp = glowSprite(0x9ccfff, 5); swirl.add(ssp); sprites.push([ssp, .5]);
  // flame-shaped cypress at the back
  const cyM = new THREE.MeshStandardMaterial({ map: cypressTex(), roughness: .9, emissive: 0x2a6a30, emissiveIntensity: .0 }); cyM.map.repeat.set(2, 3); nm.push([cyM, 0, .25]);
  const cyp = grp(g, 0, 1.0, -6.0), lobes = [];
  for (const [h, rm, x, z, tw, ph] of [[9.4, 1.25, 0, 0, 1.2, 0], [6.6, .95, .55, .35, -1, 2], [7.6, .85, -.5, -.25, 1.6, 4]]) { const lb = grp(cyp, x, 0, z); M(flameLathe(h, rm, tw, ph), cyM, 1, 1, 1, 0, 0, 0, lb); lobes.push(lb); }
  const len = 12.6;
  return finish('starry', g, {
    deck, seat: [0, deck, 4.2], dancers: [[-.7, deck, 1.9], [.8, deck, .3], [-.6, deck, -1.6], [.7, deck, -3.0]],
    poofers: [[-1.1, deck, -4.5], [1.1, deck, -4.5]], spotColor: 0x7fb0ff, nightMats: nm, sprites, wheels, Rw, len, height: 12.4,
    update(dt, t) {
      for (const s of spin) { s.r1.rotation.set(t * 1.1 + s.ph, PI / 2 + .5 * Math.sin(t * .7 + s.ph), 0); s.r2.rotation.set(.6, t * .8 + s.ph, 0); s.st.position.y = s.by + .12 * Math.sin(t * 1.3 + s.ph); }
      mh.rotation.x = t * .6; swirl.rotation.x = -t * .9;
      for (let i = 0; i < lobes.length; i++) lobes[i].rotation.z = .035 * Math.sin(t * 1.1 + i * 2);
    },
  });
}

// ============================================================ 2. SUNFLOWER CRUISER (Van Gogh)
function buildSunflower() {
  seedFrom('sunflower');
  const { g, wheels, Rw } = carBase({ len: 8.6, frameW: 2.2, R: .8, axles: [3.0, -3.0], halfW: 1.55, glow: 0xffb020, hub: 0x46c8ff });
  const nm = [], SX = 2.1, SZ = 5.0;
  const prof = [[.5, .55], [.78, .9], [.95, 1.5], [1.0, 2.1], [.96, 2.6], [.84, 3.0], [.74, 3.3], [.76, 3.55], [.88, 3.75], [.92, 3.85], [.84, 3.82], [.74, 3.45]];
  const vgeo = new THREE.LatheGeometry(prof.map(p => new THREE.Vector2(p[0], p[1])), 22); vgeo.scale(SX, 1, SZ);
  const vaseM = new THREE.MeshStandardMaterial({ map: vaseTex(), roughness: .75, side: THREE.DoubleSide, emissiveMap: vaseTex(), emissive: 0xffffff, emissiveIntensity: 0 }); nm.push([vaseM, 0, .35]);
  M(vgeo, vaseM, 1, 1, 1, 0, 0, 0, g);
  M(new THREE.CylinderGeometry(1, 1, .12, 24), mat(0x3a9a96, { roughness: .8 }), 1.52, 1, 3.65, 0, 3.42, 0, g);
  const deck = 3.48;
  noSh(M(ellipseTube(.93 * SX, .93 * SZ, 3.86, .06, 44), neon(0xffc21a, 1), 1, 1, 1, 0, 0, 0, g));
  noSh(M(ellipseTube(.85 * SX, .85 * SZ, 3.0, .06, 44), neon(0x2c7cff, 1), 1, 1, 1, 0, 0, 0, g));
  // sunflowers
  const petalM = new THREE.MeshStandardMaterial({ map: sunflowerTex(), emissiveMap: sunflowerTex(), emissive: 0xffb52a, emissiveIntensity: 0, alphaTest: .5, side: THREE.DoubleSide, roughness: .8 }); nm.push([petalM, .0, 1.1]);
  const seedM = new THREE.MeshStandardMaterial({ map: seedTex(), roughness: .9 }), stalkM = mat(0x4f7a2a, { roughness: .8 }), leafM = mat(0x5d8f2f, { roughness: .8, flatShading: true }), calyxM = mat(0x3f6a22, { roughness: .8 }), ringM = neon(0xff9a1a, 1);
  const discGeo = new THREE.CylinderGeometry(1, 1, 1, 18);
  const specs = [{ phi: PI, h: 5.6, D: 3.1, up: .5 }, { phi: 2.45, h: 4.6, D: 2.6, up: .25 }, { phi: -2.45, h: 4.2, D: 2.5, up: .25 }, { phi: 1.95, h: 3.3, D: 2.1, up: .1 }, { phi: -1.95, h: 3.6, D: 2.2, up: .1 }, { phi: 2.85, h: 2.9, D: 1.8, up: 0 }, { phi: .62, h: 2.3, D: 1.55, up: .3 }, { phi: -.62, h: 2.5, D: 1.6, up: .3 }];
  const heads = [];
  for (const s of specs) {
    const dir = V(Math.sin(s.phi), 0, Math.cos(s.phi)), base = V(dir.x * 1.25, deck, dir.z * 3.15), topP = base.clone().addScaledVector(dir, .9 + s.D * .2).setY(deck + s.h);
    M(taperTube([base, base.clone().addScaledVector(dir, .25).setY(deck + s.h * .45), topP.clone().addScaledVector(dir, -.25).setY(deck + s.h * .85), topP], lin(.15, .09), 10, 5), stalkM, 1, 1, 1, 0, 0, 0, g);
    for (const k of [.35, .6]) { const lp = base.clone().lerp(topP, k), lf = M(G.knob, leafM, .75, .06, .3, lp.x + dir.x * .35, lp.y, lp.z + dir.z * .35, g); lf.rotation.y = Math.atan2(dir.x, dir.z) + PI / 2 + (k > .5 ? .6 : -.6); lf.rotation.z = k > .5 ? .5 : -.4; }
    const piv = grp(g, topP.x, topP.y, topP.z); _v1.set(dir.x, s.up + .3, dir.z * .3 + .45).normalize(); piv.quaternion.setFromUnitVectors(_Z, _v1);
    const bob = grp(piv), D = s.D;
    noSh(M(G.plane, petalM, D, D, 1, 0, 0, 0, bob)); noSh(M(G.plane, petalM, D * .9, D * .9, 1, 0, 0, -.07, bob)).rotation.z = .14;
    M(discGeo, seedM, D * .21, .28, D * .21, 0, 0, .08, bob).rotation.x = PI / 2;
    noSh(M(G.ring, ringM, D * .22, D * .22, D * .22, 0, 0, .1, bob));
    M(G.cone, calyxM, D * .2, .5, D * .2, 0, 0, -.32, bob).rotation.x = -PI / 2;
    heads.push({ bob, ph: R(0, TAU), sp: R(1.2, 2) });
  }
  return finish('sunflower', g, {
    deck, seat: [0, deck, 2.4], dancers: [[-.6, deck, .9], [.7, deck, -.5], [-.6, deck, -1.8], [.45, deck, -2.5]],
    poofers: [[-.8, deck, -2.8], [.8, deck, -2.8]], spotColor: 0xffc04a, nightMats: nm, wheels, Rw, len: 10.6, height: 10.6,
    update(dt, t, ctx, night, sp) {
      const k = 1 + Math.min(1, sp / 5);
      for (const h of heads) { h.bob.rotation.x = Math.sin(t * h.sp + h.ph) * .13 * k; h.bob.rotation.y = Math.sin(t * h.sp * .7 + h.ph * 2) * .1; h.bob.rotation.z = t * .15 + h.ph; }
    },
  });
}

// ============================================================ 3. WATER LILY BARGE (Monet)
function buildLily() {
  seedFrom('lily');
  const { g, wheels, Rw } = carBase({ len: 9, frameW: 2.2, R: .72, axles: [3.0, -3.0], halfW: 1.55, glow: 0x8ff0ff, hub: 0xff9ccf });
  const nm = [];
  const zs = [-5.2, -4.9, -4.3, -3, -1, 1, 2.5, 3.5, 4.4, 5.1, 5.7], hw = [1.2, 1.7, 1.95, 2.05, 2.05, 2.05, 1.95, 1.7, 1.25, .7, 0];
  const outline = (inset) => { const pts = []; for (let i = 0; i < zs.length; i++) pts.push([Math.max(.05, hw[i] - inset), Math.max(-5.2 + inset, Math.min(zs[i], 5.7 - inset * 2.2))]); return pts; };
  const shapeOf = (inset) => { const p = outline(inset), sh = new THREE.Shape(); sh.moveTo(-p[0][0], -p[0][1]); for (let i = 0; i < p.length; i++) sh.lineTo(p[i][0], -p[i][1]); for (let i = p.length - 2; i >= 0; i--) sh.lineTo(-p[i][0], -p[i][1]); return sh; };
  const hullTex = gardenTex().clone(); hullTex.repeat.set(.13, .2); hullTex.needsUpdate = true;
  const hullM = new THREE.MeshStandardMaterial({ map: hullTex, roughness: .8, emissiveMap: hullTex, emissive: 0xffffff, emissiveIntensity: 0 }); nm.push([hullM, 0, .3]);
  const hull = new THREE.ExtrudeGeometry(shapeOf(0), { depth: 1.2, bevelEnabled: true, bevelThickness: .15, bevelSize: .12, bevelSegments: 2 }); hull.rotateX(-PI / 2);
  M(hull, hullM, 1, 1, 1, 0, 1.25, 0, g);
  const gsh = shapeOf(0); gsh.holes.push(shapeOf(.28));
  const gun = new THREE.ExtrudeGeometry(gsh, { depth: .42, bevelEnabled: false }); gun.rotateX(-PI / 2);
  M(gun, mat(0xf4ecdc, { roughness: .6 }), 1, 1, 1, 0, 2.6, 0, g);
  // waterline glow
  const wl = []; const p0 = outline(-.14); for (let i = 0; i < p0.length; i++) wl.push(V(p0[i][0], 1.5 + .06 * Math.sin(i * 2), p0[i][1])); for (let i = p0.length - 2; i > 0; i--) wl.push(V(-p0[i][0], 1.5 + .06 * Math.sin(i * 2 + 1), p0[i][1]));
  noSh(M(tube(wl, .055, 60, 4, true), neon(0x8ff0ff, .9), 1, 1, 1, 0, 0, 0, g));
  // pond surface
  const wtex = waterTex().clone(); wtex.repeat.set(.13, .13); wtex.needsUpdate = true;
  const waterM = new THREE.MeshStandardMaterial({ map: wtex, roughness: .25, metalness: .1, emissiveMap: wtex, emissive: 0xffffff, emissiveIntensity: .05 }); nm.push([waterM, .05, .45]);
  const wgeo = new THREE.ShapeGeometry(shapeOf(.28)); wgeo.rotateX(-PI / 2); M(wgeo, waterM, 1, 1, 1, 0, 2.62, 0, g);
  const deck = 2.74, wood = mat(0x9a6a3e, { roughness: .8 });
  M(G.box, wood, 2.9, .12, 2.3, 0, deck - .06, 2.85, g); M(G.box, wood, 3.4, .12, 1.85, 0, deck - .06, -3.85, g);
  // Japanese arched bridge (Monet's green bridge), spanning the pond lengthwise
  const bz0 = -2.95, bz1 = 1.75, span = bz1 - bz0, bh = 1.3, bm = mat(0x3d8a5a, { roughness: .6 });
  const arcY = (u) => deck + bh * Math.sin(PI * u);
  for (let i = 0; i < 14; i++) { const u = (i + .5) / 14, pl = M(G.box, bm, 1.5, .09, span / 14 * 1.12, 0, arcY(u), bz0 + u * span, g); pl.rotation.x = -Math.atan(bh * PI / span * Math.cos(PI * u)); }
  for (const s of [-1, 1]) for (const hh of [.55, 1.0]) { const pts = []; for (let i = 0; i <= 12; i++) { const u = i / 12; pts.push(V(s * .72, arcY(u) + hh, bz0 + u * span)); } M(tube(pts, .055, 18, 4), bm, 1, 1, 1, 0, 0, 0, g); }
  for (const s of [-1, 1]) for (let i = 0; i <= 5; i++) { const u = i / 5; M(G.cylLo, bm, .06, 1.05, .06, s * .72, arcY(u) + .5, bz0 + u * span, g); }
  // lily pads & flowers on the pond
  const padA = mat(0x4f8f4a, { roughness: .7 }), padB = mat(0x76b05a, { roughness: .7 }), padGeo = new THREE.CircleGeometry(1, 11, .3, TAU - .6).rotateX(-PI / 2);
  const petalP = neon(0xff9ccf, .45), petalW = neon(0xfff0f5, .4), heart = neon(0xffd84a, .8), cupGeo = new THREE.ConeGeometry(1, 1, 6, 1, true).rotateX(PI);
  for (let i = 0; i < 18; i++) {
    const s = i % 2 ? 1 : -1, z = R(-2.7, 1.5), x = s * R(1.0, 1.75), pr = R(.28, .55);
    const pd = M(padGeo, i % 3 ? padA : padB, pr, 1, pr, x, 2.65 + i * .001, z, g); pd.rotation.y = R(0, TAU); pd.castShadow = false;
    if (i % 2 === 0 || i % 5 === 0) { const f = R(.22, .32); noSh(M(cupGeo, i % 4 ? petalP : petalW, f, f * .9, f, x + R(-.1, .1), 2.65 + f * .45, z, g)); noSh(M(cupGeo, i % 4 ? petalP : petalW, f * .7, f * .8, f * .7, x, 2.68 + f * .5, z, g)).rotation.y = .5; noSh(M(G.knob, heart, f * .25, f * .25, f * .25, x, 2.7 + f * .3, z, g)); }
  }
  // parasol (Woman with a Parasol) on the stern deck
  const pg = grp(g, -1.15, deck, -4.3); pg.rotation.z = .25; pg.rotation.x = -.15;
  M(G.cylLo, mat(0x6b4f3a), .04, 2.6, .04, 0, 1.3, 0, pg);
  const parM = new THREE.MeshStandardMaterial({ map: gardenTex(), roughness: .8, side: THREE.DoubleSide });
  M(new THREE.ConeGeometry(1.25, .55, 12, 1, true), parM, 1, 1, 1, 0, 2.55, 0, pg);
  // lantern posts + strings of paper lanterns
  const postM = mat(0x3d5a4a, { roughness: .6 }), strM = mat(0x2a2a2a), lcols = [0xffb38a, 0xff9ccf, 0xc8a8ff, 0xfff0a8], lanterns = [];
  const lgeo = new THREE.SphereGeometry(1, 8, 6), capM = mat(0x2a1a12);
  const corners = [[-1.7, 4.0], [1.7, 4.0], [-1.85, -4.6], [1.85, -4.6]], PH = 3.6;
  for (const [x, z] of corners) { M(G.cylLo, postM, .07, PH, .07, x, deck + PH / 2, z, g); noSh(M(lgeo, neon(lcols[(x > 0 ? 1 : 0) + (z > 0 ? 2 : 0)], .8), .3, .38, .3, x, deck + PH + .3, z, g)); M(G.cylLo, capM, .18, .08, .18, x, deck + PH + .68, z, g); }
  for (const s of [-1, 1]) {
    const a = V(s * 1.7, deck + PH, 4.0), b = V(s * 1.85, deck + PH, -4.6), pts = [];
    for (let i = 0; i <= 8; i++) { const u = i / 8; pts.push(a.clone().lerp(b, u).add(V(0, -.6 * Math.sin(PI * u), 0))); }
    M(tube(pts, .02, 16, 3), strM, 1, 1, 1, 0, 0, 0, g);
    for (let i = 1; i <= 5; i++) { const u = i / 6, p = a.clone().lerp(b, u).add(V(0, -.6 * Math.sin(PI * u), 0)); const lg = grp(g, p.x, p.y, p.z); noSh(M(lgeo, neon(lcols[(i + (s > 0 ? 1 : 0)) % 4], .75), .26, .34, .26, 0, -.42, 0, lg)); M(G.cylLo, capM, .14, .06, .14, 0, -.08, 0, lg); lanterns.push({ lg, ph: R(0, TAU) }); }
  }
  // bow lantern
  noSh(M(lgeo, neon(0xfff0a8, .9), .25, .32, .25, 0, 3.3, 5.35, g));
  return finish('lily', g, {
    deck, seat: [0, deck, 3.3], dancers: [[-.9, deck, -3.6], [.9, deck, -4.0], [0, deck + bh + .05, -.6], [-.7, deck, 2.2]],
    poofers: [[-1.25, deck, -4.25], [1.25, deck, -4.25]], spotColor: 0xffb3d9, nightMats: nm, wheels, Rw, len: 11.2, height: 7.2,
    update(dt, t) {
      wtex.offset.x = (t * .01) % 1; wtex.offset.y = Math.sin(t * .2) * .02;
      for (const l of lanterns) { l.lg.rotation.x = .12 * Math.sin(t * 1.4 + l.ph); l.lg.rotation.z = .1 * Math.sin(t * 1.1 + l.ph * 2); }
    },
  });
}

// ============================================================ 4. CUBIST BULL (Picasso)
function buildCubist() {
  seedFrom('cubist');
  const { g, wheels, Rw } = carBase({ len: 8.4, frameW: 2.6, R: .75, axles: [1.7, -3.0], halfW: 1.5, glow: 0xff3b6b, hub: 0xffd23f });
  const cubM = new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: .8, flatShading: true, emissive: 0xffffff, emissiveIntensity: 0 });
  cubM.onBeforeCompile = (sh) => { sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n#ifdef USE_COLOR\ntotalEmissiveRadiance *= vColor.rgb;\n#endif'); };
  cubM.customProgramCacheKey = () => 'artcars-cubist';
  const k = new Kit(), X = 1.8;
  const side = (pts, x, hex) => k.panel(pts.map(([z, y]) => [x, y, z]), hex);
  const facets = [
    [[-4.7, 1.8], [-4.9, 3.6], [-3.6, 4.5], [-1.6, 4.42], [-1.9, 1.7]],
    [[-2.1, 1.7], [-1.8, 4.45], [.6, 4.58], [.9, 1.6]],
    [[.5, 1.6], [.3, 4.6], [2.0, 5.3], [3.4, 4.2], [3.3, 1.9]],
  ];
  const colsL = ['#d9a441', '#3f6fb5', '#c8553d'], colsR = ['#3f6fb5', '#efe0c0', '#d9a441'];
  for (let i = 0; i < 3; i++) { side(facets[i], X + i * .02, colsL[i]); side(facets[i], -X - i * .02, colsR[i]); }
  // overlay planes (cubist shards)
  side([[-3.4, 2.2], [-1.2, 3.9], [.1, 2.0]], X + .1, '#efe0c0'); side([[1.0, 2.5], [2.6, 4.6], [3.0, 2.3]], X + .1, '#5f9e6e');
  side([[-4.3, 2.6], [-2.6, 4.1], [-2.4, 2.0]], -X - .1, '#c8553d'); side([[.4, 3.4], [1.9, 4.9], [2.4, 2.4], [1.0, 2.0]], -X - .1, '#2f2f2f');
  // top hump, chest, rump
  k.panel([[-X, 4.6, .3], [X, 4.6, .3], [X, 5.3, 2.0], [-X, 5.3, 2.0]], '#efe0c0');
  k.panel([[-X, 5.3, 2.0], [X, 5.3, 2.0], [X, 4.2, 3.4], [-X, 4.2, 3.4]], '#d9a441');
  k.panel([[-X, 4.2, 3.4], [0, 4.2, 3.4], [0, 1.9, 3.3], [-X, 1.9, 3.3]], '#3f6fb5'); k.panel([[0, 4.2, 3.4], [X, 4.2, 3.4], [X, 1.9, 3.3], [0, 1.9, 3.3]], '#c8553d');
  k.panel([[-X, 1.8, -4.7], [X, 1.8, -4.7], [X, 3.6, -4.9], [-X, 3.6, -4.9]], '#c8553d');
  k.panel([[-X, 3.6, -4.9], [X, 3.6, -4.9], [X, 4.5, -3.6], [-X, 4.5, -3.6]], '#d9a441');
  // legs: angular planes outside the wheels
  const legs = [[[2.4, 2.6], [3.4, 2.7], [3.5, 1.0], [2.8, 1.05]], [[2.8, 1.05], [3.5, 1.0], [4.0, .15], [3.3, .15]], [[-4.6, 2.9], [-3.6, 2.6], [-3.9, 1.15], [-4.75, 1.25]], [[-4.75, 1.25], [-3.9, 1.15], [-4.25, .12], [-4.95, .15]]];
  const legCols = ['#c8553d', '#efe0c0', '#d9a441', '#3f6fb5'];
  for (let i = 0; i < 4; i++) { side(legs[i], 1.98, legCols[i]); side(legs[i], -1.98, legCols[(i + 2) % 4]); }
  for (const s of [-1, 1]) { k.panel([[s * 1.98, .15, 3.25], [s * 1.98, .15, 4.05], [s * 1.98, 0, 4.1], [s * 1.98, 0, 3.2]].map(p => [p[0], p[1], p[2]]), '#1a1a1a'); }
  // head (vertex panels in local head space)
  const hk = new Kit();
  hk.panel([[-1.3, .9, .2], [1.3, 1.0, .2], [1.0, .7, 1.5], [-1.1, .6, 1.4]], '#efe0c0');
  hk.panel([[-1.1, .6, 1.4], [0, .65, 1.45], [0, -1.6, 2.25], [-.6, -1.6, 2.2]], '#d9a441');
  hk.panel([[0, .65, 1.45], [1.0, .7, 1.5], [.6, -1.6, 2.3], [0, -1.6, 2.25]], '#3f6fb5');
  hk.panel([[-1.3, .9, .2], [-1.1, .6, 1.4], [-.6, -1.6, 2.2], [-.8, -1.1, .2]], '#c8553d');
  hk.panel([[1.3, 1.0, .2], [1.0, .7, 1.5], [.6, -1.6, 2.3], [.8, -1.0, .2]], '#5f9e6e');
  hk.panel([[-.75, -1.5, 2.2], [.75, -1.5, 2.3], [.7, -2.3, 2.55], [-.7, -2.3, 2.45]], '#e9b8a0');
  hk.panel([[-.7, -2.3, 2.45], [.7, -2.3, 2.55], [.5, -2.0, 1.0], [-.5, -2.0, 1.0]], '#2f2f2f');
  hk.panel([[-1.3, .9, .2], [1.3, 1.0, .2], [1.0, -1.6, 0], [-1.0, -1.6, 0]], '#d9a441');
  hk.panel([[-1.3, .7, .3], [-1.9, 1.1, .1], [-1.5, .3, .1]], '#efe0c0'); hk.panel([[1.3, .8, .3], [2.0, .9, .3], [1.4, .2, .2]], '#c8553d');
  for (const [nx, ny] of [[-.3, -1.85], [.32, -2.0]]) { const pts = []; for (let i = 0; i < 6; i++) { const a = i / 6 * TAU; pts.push([nx + Math.cos(a) * .12, ny + Math.sin(a) * .1, 2.42 + (ny + 1.5) * -.32]); } hk.poly(pts, '#111111'); }
  const head = grp(g, 0, 4.0, 3.4);
  M(hk.geo(), cubM, 1, 1, 1, 0, 0, 0, head);
  // misaligned almond eyes (glowing)
  const almondGeo = (() => { const s = new THREE.Shape(); s.moveTo(-1, 0); s.quadraticCurveTo(0, .95, 1, 0); s.quadraticCurveTo(0, -.95, -1, 0); return new THREE.ShapeGeometry(s, 8); })();
  const eyeW = neon(0xfff4d0, .9), blk = mat(0x0a0a0a, { roughness: .4, side: THREE.DoubleSide }), pupilGeo = new THREE.CircleGeometry(.36, 10);
  const mkEye = (pos, nrm, sz, roll) => { const e = grp(head, ...pos); e.quaternion.setFromUnitVectors(_Z, V(...nrm).normalize()); const r = grp(e); r.rotation.z = roll; M(almondGeo, blk, sz * 1.3, sz * 1.45, 1, 0, 0, .0, r); noSh(M(almondGeo, eyeW, sz, sz, 1, 0, 0, .03, r)); M(pupilGeo, blk, sz, sz, 1, sz * .15, 0, .06, r); };
  mkEye([-.55, .05, 1.66], [-.06, .34, .94], .42, .15);
  mkEye([1.0, .45, .85], [1, .15, .45], .36, 1.25);
  // huge glowing horns
  const hornM = neon(0xfff0c8, .8);
  noSh(M(taperTube([[.9, .8, .6], [1.9, 1.2, .5], [2.8, 1.9, .9], [3.2, 2.9, 1.8], [3.0, 3.6, 2.6]], lin(.34, .05), 14, 6), hornM, 1, 1, 1, 0, 0, 0, head));
  noSh(M(taperTube([[-.9, .8, .6], [-1.8, 1.4, .4], [-2.9, 2.1, .7], [-3.3, 3.2, 1.5], [-3.0, 3.9, 2.3]], lin(.34, .05), 14, 6), hornM, 1, 1, 1, 0, 0, 0, head));
  M(G.ring, mat(0xd9a63a, { roughness: .3, metalness: .6 }), .3, .3, .3, 0, -2.45, 2.55, head).rotation.y = PI / 2;
  // body + neon outlines
  M(k.geo(), cubM, 1, 1, 1, 0, 0, 0, g);
  const nk = (pts, x, col) => { const kk = new Kit(); kk.line(pts.map(([z, y]) => [x, y, z]), .05, 0xffffff); noSh(M(kk.geo(), neon(col, 1), 1, 1, 1, 0, 0, 0, g)); };
  const outlineZY = [[-4.75, 1.8], [-4.95, 3.6], [-3.6, 4.55], [.3, 4.65], [2.0, 5.35], [3.45, 4.2], [3.35, 1.9]];
  nk(outlineZY, X + .16, 0xff4fa8); nk(outlineZY, -X - .16, 0x46f1ff); nk([[-4.7, 1.75], [3.3, 1.85]], X + .16, 0xffd23f); nk([[-4.7, 1.75], [3.3, 1.85]], -X - .16, 0xffd23f);
  // deck on its back
  M(G.box, mat(0x2a2320, { roughness: .7 }), 3.5, .16, 4.4, 0, 4.54, -1.8, g);
  const deck = 4.62;
  for (const s of [-1, 1]) noSh(M(G.box, neon(0xffd23f, .8), .06, .06, 4.4, s * 1.76, deck + .02, -1.8, g));
  // tail
  const tail = grp(g, 0, 3.4, -4.9);
  M(taperTube([[0, 0, 0], [.3, -.8, -.5], [-.2, -1.6, -.45], [.1, -2.1, -.6]], lin(.08, .04), 10, 4), blk, 1, 1, 1, 0, 0, 0, tail);
  M(G.cone, blk, .2, .5, .2, .1, -2.3, -.6, tail).rotation.x = PI;
  return finish('cubist', g, {
    deck, seat: [0, deck, -.2], dancers: [[-.9, deck, -1.3], [.5, deck, -2.9], [-.8, deck, -3.5]],
    poofers: [[-1.3, deck, -3.7], [1.3, deck, -3.7]], spotColor: 0xff6b4a, nightMats: [[cubM, 0, .45]], wheels, Rw, len: 11.2, height: 9.9,
    update(dt, t, ctx, night, sp) {
      const a = .08 + Math.min(.1, sp * .02);
      head.rotation.x = .06 + Math.sin(t * 1.7) * a; head.rotation.y = Math.sin(t * .6) * .08;
      tail.rotation.z = Math.sin(t * 2.3) * .35; tail.rotation.x = Math.sin(t * 1.3) * .15;
    },
  });
}

// ============================================================ 5. HARLEQUIN CAROUSEL (Picasso, Rose period)
function buildHarlequin() {
  seedFrom('harlequin');
  const { g, wheels, Rw } = carBase({ len: 9.2, frameW: 2.6, R: .7, axles: [2.8, -3.4], halfW: 1.9, glow: 0xff8fb0, hub: 0x7fb2ff });
  const nm = [[maskMat(), .08, 2.2]], sprites = [];
  const ht = harlequinTex(), floorT = ht.clone(); floorT.repeat.set(1.5, 1.5); floorT.needsUpdate = true;
  const CZ = -.6, deck = 1.95;
  M(new THREE.CylinderGeometry(3.6, 3.7, .35, 28), new THREE.MeshStandardMaterial({ map: floorT, roughness: .7 }), 1, 1, 1, 0, deck - .175, CZ, g);
  noSh(M(new THREE.TorusGeometry(3.66, .06, 4, 40), neon(0xffd25a, 1), 1, 1, 1, 0, deck - .08, CZ, g)).rotation.x = PI / 2;
  noSh(M(new THREE.TorusGeometry(3.7, .06, 4, 40), neon(0xff6fae, 1), 1, 1, 1, 0, deck - .3, CZ, g)).rotation.x = PI / 2;
  // front cab
  M(G.box, mat(0x2a3f7a, { roughness: .5 }), 2.8, .35, 2.0, 0, deck - .175, 4.0, g);
  M(G.box, mat(0xe58fa0, { roughness: .6 }), 2.8, .9, .2, 0, deck + .45, 5.0, g);
  noSh(M(G.box, neon(0x46f1ff, .9), 2.85, .06, .06, 0, deck + .92, 5.06, g));
  // rotating carousel
  const rot = grp(g, 0, deck, CZ);
  const gold = mat(0xd9a63a, { roughness: .3, metalness: .55 }), brass = mat(0xe8c36a, { roughness: .25, metalness: .7 });
  M(G.cyl, gold, .32, 4.3, .32, 0, 2.15, 0, rot);
  for (const y of [.8, 2.0, 3.2]) noSh(M(G.cyl, neon(0xff6fae, .9), .36, .08, .36, 0, y, 0, rot));
  const canT = ht.clone(); canT.repeat.set(4, 1); canT.needsUpdate = true;
  const canM = new THREE.MeshStandardMaterial({ map: canT, roughness: .7, side: THREE.DoubleSide, emissiveMap: canT, emissive: 0xffffff, emissiveIntensity: 0 }); nm.push([canM, 0, .35]);
  M(new THREE.ConeGeometry(4.25, 1.9, 16, 1, true), canM, 1, 1, 1, 0, 4.3 + .95, 0, rot);
  const valT = ht.clone(); valT.repeat.set(8, 1); valT.needsUpdate = true;
  M(new THREE.CylinderGeometry(4.25, 4.25, .75, 24, 1, true), new THREE.MeshStandardMaterial({ map: valT, roughness: .7, side: THREE.DoubleSide }), 1, 1, 1, 0, 3.92, 0, rot);
  // bulbs around the rim + canopy ridges
  const b1 = neon(0xfff2c8, 1.2), b2 = neon(0xff7fb0, 1.2);
  for (let i = 0; i < 28; i++) { const a = i / 28 * TAU; noSh(M(G.oct, i % 2 ? b1 : b2, .1, .1, .1, Math.sin(a) * 4.3, 3.52, Math.cos(a) * 4.3, rot)); }
  for (let i = 0; i < 8; i++) for (let j = 1; j <= 3; j++) { const a = (i + .5) / 8 * TAU, f = j / 4; noSh(M(G.oct, j % 2 ? b2 : b1, .09, .09, .09, Math.sin(a) * 4.25 * (1 - f), 4.3 + 1.9 * f + .05, Math.cos(a) * 4.25 * (1 - f), rot)); }
  // finial + pennant
  M(G.cyl, gold, .05, 1.0, .05, 0, 6.6, 0, rot); noSh(M(G.sph, neon(0xffd23f, 1.3), .2, .2, .2, 0, 7.15, 0, rot));
  const pen = M(G.plane, new THREE.MeshStandardMaterial({ map: ht, side: THREE.DoubleSide, roughness: .7 }), .9, .5, 1, .45, 6.85, 0, rot); pen.castShadow = false;
  const fsp = glowSprite(0xffd890, 2.5); fsp.position.set(0, 7.15, 0); rot.add(fsp); sprites.push([fsp, .8]);
  // masks around the valance
  const masks = [];
  for (let i = 0; i < 8; i++) { const a = i / 8 * TAU, mk = keep(maskMesh(i, 1.35, rot, Math.sin(a) * 4.32, 3.35, Math.cos(a) * 4.32)); mk.rotation.y = a; masks.push(mk); }
  // poles with acrobats' balls (Acrobat on a Ball) that rise & fall
  const balls = [], ballMs = [mat(0x4a78b8, { roughness: .35 }), mat(0xe58fa0, { roughness: .35 }), mat(0xe0b050, { roughness: .35 })];
  for (let i = 0; i < 8; i++) {
    const a = (i + .5) / 8 * TAU, x = Math.sin(a) * 3.2, z = Math.cos(a) * 3.2;
    M(G.cylLo, brass, .055, 3.6, .055, x, 1.8, z, rot);
    const b = keep(M(G.sph, ballMs[i % 3], .42, .42, .42, x, 1.4, z, rot));
    const bandM = neon(i % 2 ? 0xfff2c8 : 0x46f1ff, .8), band = keep(noSh(M(G.halo, bandM, .43, .43, .43, x, 1.4, z, rot))); band.rotation.x = PI / 2;
    balls.push({ b, band, ph: i * 1.7 });
  }
  return finish('harlequin', g, {
    deck, seat: [0, deck, 4.3], dancers: [[-1.6, deck, -.3], [1.55, deck, -1.0], [-.2, deck, -2.4], [.9, deck, .9]],
    poofers: [[-1.1, deck, 4.55], [1.1, deck, 4.55]], spotColor: 0xff8fc0, nightMats: nm, sprites, wheels, Rw, len: 10.0, height: 9.2,
    update(dt, t) {
      rot.rotation.y += dt * .55;
      for (const b of balls) { const y = 1.4 + .45 * Math.sin(t * 1.8 + b.ph); b.b.position.y = y; b.band.position.y = y; }
      for (let i = 0; i < masks.length; i++) masks[i].rotation.x = .08 * Math.sin(t * 2 + i);
    },
  });
}

// ============================================================ 6. DALÍ'S MUSTACHE MOBILE
const MUST = {};
function mustacheHalfGeo(sg, span, thick) {
  const key = sg + '|' + span + '|' + thick; if (MUST[key]) return MUST[key]; const k = span / 3.2;
  const pts = [[.0, 0, .05], [.35, -.11, .08], [.8, -.17, .06], [1.2, -.08, .02], [1.45, .15, 0], [1.53, .45, -.02], [1.43, .68, 0], [1.26, .71, .03], [1.17, .59, .03], [1.23, .49, .02]].map(p => [p[0] * k * sg, p[1] * k, p[2] * k]);
  return (MUST[key] = taperTube(pts, (t) => thick * k * Math.pow(1 - t, .85) + .018 * k, 20, 6));
}
let _antGeo = null;
function antGeo() {
  if (_antGeo) return _antGeo;
  const parts = [[G.oct, mtx(0, .03, -.065, 0, 0, 0, .032, .026, .05)], [G.oct, mtx(0, .032, 0, 0, 0, 0, .017, .015, .028)], [G.oct, mtx(0, .035, .045, 0, 0, 0, .022, .02, .022)], [G.box, mtx(0, .02, 0, 0, 0, 0, .13, .006, .05)]];
  return (_antGeo = mergeGeo(parts));
}
function buildMustache() {
  seedFrom('mustache');
  const { g, wheels, Rw } = carBase({ len: 10, frameW: 2.4, R: .75, axles: [3.7, -3.8], halfW: 1.8, glow: 0xff3048, hub: 0xffd23f });
  const nm = [], sprites = [];
  const goldM = mat(0xd9a63a, { roughness: .3, metalness: .55 });
  const body = new THREE.CapsuleGeometry(1, 9.6, 4, 12); body.rotateX(PI / 2);
  M(body, goldM, 2.0, .95, 1, 0, 2.05, 0, g);
  M(G.box, goldM, 3.6, .6, 6.4, 0, 2.7, -1.8, g);
  M(G.box, mat(0x8a1020, { roughness: .9 }), 3.5, .06, 6.3, 0, 3.02, -1.8, g);
  const deck = 3.05;
  const edge = neon(0xffc23a, .9); for (const s of [-1, 1]) noSh(M(G.box, edge, .06, .06, 6.4, s * 1.82, 3.02, -1.8, g)); noSh(M(G.box, edge, 3.6, .06, .06, 0, 3.02, 1.42, g)); noSh(M(G.box, edge, 3.6, .06, .06, 0, 3.02, -5.02, g));
  for (const s of [-1, 1]) noSh(M(G.box, neon(0xff3048, 1), .06, .1, 8.6, s * 2.01, 2.05, 0, g));
  // the mustache bumper
  const mm = mat(0x15100d, { roughness: .28, metalness: .1 }), span = 7.8, thick = .3, kk = span / 3.2;
  const mg = grp(g, 0, 2.0, 5.95);
  const mOut = neon(0xffc23a, 1.1);
  for (const sg of [-1, 1]) {
    const mp = [[.0, 0, .05], [.35, -.11, .08], [.8, -.17, .06], [1.2, -.08, .02], [1.45, .15, 0], [1.53, .45, -.02], [1.43, .68, 0], [1.26, .71, .03], [1.17, .59, .03]].map((p, i, arr) => { const t = i / (arr.length - 1), th = thick * kk * Math.pow(1 - t * .9, .85) + .018 * kk; return V(p[0] * kk * sg, p[1] * kk + th * .55, p[2] * kk + th * .75); });
    noSh(M(tube(mp, .045, 30, 4), mOut, 1, 1, 1, 0, 0, 0, mg));
    M(mustacheHalfGeo(sg, span, thick), mm, 1, 1, 1, 0, 0, 0, mg); noSh(M(G.sphLo, neon(0xffd23f, 1.2), .14, .14, .14, sg * 1.23 * kk, .49 * kk, .02 * kk, mg)); }
  M(G.sph, mm, thick * kk * 1.25, thick * kk, thick * kk * 1.1, 0, -.02 * span, .04 * kk, mg);
  // nose + headlamps
  M(G.sph, goldM, .55, .7, .6, 0, 2.75, 5.85, g);
  // eyes on stalks
  const eyeM = new THREE.MeshStandardMaterial({ map: eyeTex(), emissiveMap: eyeTex(), emissive: 0xffffff, emissiveIntensity: .05, roughness: .2 }); nm.push([eyeM, .03, .7]);
  const stalkM = mat(0x2a1a10, { roughness: .4, metalness: .3 }), eyes = [];
  for (const s of [-1, 1]) {
    const top = V(s * 1.35, 5.7, 4.3);
    M(taperTube([[s * .85, 2.85, 3.5], [s * .95, 3.9, 3.7], [s * 1.25, 4.9, 4.2], top], lin(.13, .07), 10, 5), stalkM, 1, 1, 1, 0, 0, 0, g);
    const eg = grp(g, top.x, top.y + .5, top.z); M(G.eye, eyeM, .62, .62, .62, 0, 0, 0, eg);
    noSh(M(G.halo, neon(0xffc23a, .9), .66, .66, .66, 0, 0, 0, eg)).rotation.y = 0;
    const lid = M(new THREE.SphereGeometry(1, 10, 4, 0, TAU, 0, PI / 2), goldM, .66, .66, .66, 0, 0, 0, eg); lid.rotation.x = -.5;
    eyes.push({ eg, s });
  }
  // crutch-supported canopy roof
  const crutchM = mat(0x8a6038, { roughness: .7 }), padM = mat(0x5a2a1a, { roughness: .6 }), RY = 6.35;
  for (const x of [-1.55, 1.55]) for (const z of [.9, -4.6]) {
    M(G.cylLo, crutchM, .07, RY - deck - .6, .07, x, (deck + RY - .6) / 2, z, g);
    for (const s of [-1, 1]) { const st = M(G.cylLo, crutchM, .05, .75, .05, x, RY - .45, z + s * .14, g); st.rotation.x = s * .35; }
    M(G.box, padM, .16, .14, .6, x, RY - .1, z, g);
    noSh(M(G.sphLo, neon(0xffc23a, .9), .1, .1, .1, x, deck + 1.0, z, g));
  }
  M(G.box, mat(0x2a4a9a, { roughness: .6 }), 3.8, .14, 6.4, 0, RY + .05, -1.85, g);
  for (const s of [-1, 1]) noSh(M(G.box, edge, .06, .06, 6.4, s * 1.92, RY + .12, -1.85, g));
  noSh(M(G.box, edge, 3.8, .06, .06, 0, RY + .12, 1.35, g)); noSh(M(G.box, edge, 3.8, .06, .06, 0, RY + .12, -5.05, g));
  // melting clock draped over the roof edge
  const clock = makeHangingClock(3.0, 1.1); clock.g.position.set(1.92, RY + .13, -2.0); clock.g.rotation.y = PI / 2; g.add(clock.g);
  nm.push([TX.clockMat, .05, .55]);
  // ants marching along both flanks
  const NA = 18, im = new THREE.InstancedMesh(antGeo(), mat(0x0c0806, { roughness: .3 }), NA); im.castShadow = false; im.frustumCulled = false; g.add(im);
  const ants = []; for (let i = 0; i < NA; i++) ants.push({ side: i % 2 ? 1 : -1, lane: (i >> 1) % 2, u: rnd(), sp: R(.05, .08) });
  const mtxA = new THREE.Matrix4(), fw = new THREE.Vector3(), nrm = new THREE.Vector3(), rt = new THREE.Vector3(), AS = 3.2;
  const updAnts = (dt, t) => {
    for (let i = 0; i < NA; i++) {
      const a = ants[i]; a.u = (a.u + a.sp * dt) % 1;
      const dir = a.lane ? 1 : -1, z = (a.lane ? -4.2 + a.u * 8.4 : 4.2 - a.u * 8.4), y = 2.05 + (a.lane ? .38 : -.36) + .12 * Math.sin(z * 1.7 + a.side);
      const q = (y - 2.05) / .95, x = a.side * 2.0 * Math.sqrt(Math.max(0, 1 - q * q)) + a.side * .01;
      nrm.set(x / 4, (y - 2.05) / .9025, 0).normalize(); fw.set(0, .2 * Math.cos(z * 1.7 + a.side) * -dir * 0, dir).normalize();
      rt.crossVectors(nrm, fw).normalize(); fw.crossVectors(rt, nrm).normalize();
      mtxA.makeBasis(rt, nrm, fw).scale(_v1.set(AS, AS, AS)); mtxA.setPosition(x, y + .003 * Math.sin(t * 20 + i), z); im.setMatrixAt(i, mtxA);
    }
    im.instanceMatrix.needsUpdate = true;
  };
  updAnts(0, 0);
  return finish('mustache', g, {
    deck, seat: [0, deck, .7], dancers: [[-.8, deck, -1.3], [.9, deck, -2.6], [-.5, deck, -3.9]],
    poofers: [[-1.15, deck, -4.0], [1.15, deck, -4.0]], spotColor: 0xffb84a, nightMats: nm, sprites, wheels, Rw, len: 12.4, height: 7.9,
    update(dt, t) {
      for (const e of eyes) { e.eg.rotation.y = .55 * Math.sin(t * .7 + e.s) + e.s * .15; e.eg.rotation.x = -.15 + .25 * Math.sin(t * .53 + e.s * 2); }
      mg.rotation.z = .025 * Math.sin(t * 2.1);
      clock.update(t); updAnts(dt, t);
    },
  });
}

// ============================================================ 7. SPACE ELEPHANT WALKER (Dalí)
function buildElephant() {
  seedFrom('elephant');
  const { g, wheels, Rw } = carBase({ len: 9.2, frameW: 2.4, R: .8, axles: [3.4, -3.4], halfW: 1.55, glow: 0xffb35a, hub: 0xff5a1f });
  const nm = [], sprites = [];
  const skin = mat(0x6a6470, { roughness: .8 }), skin2 = mat(0x56505c, { roughness: .85 }), goldM = mat(0xc9962f, { roughness: .35, metalness: .5 });
  const BY = 6.3, body = grp(g, 0, BY, 0);
  M(G.sph, skin, 2.1, 1.9, 3.4, 0, 0, 0, body); M(G.sph, skin, 1.9, 1.8, 1.5, 0, .1, -2.0, body); M(G.sph, skin, 1.85, 1.85, 1.4, 0, .2, 2.0, body);
  // blanket
  const bl = new THREE.CylinderGeometry(1, 1, 3.8, 18, 1, true, PI - 1.75, 3.5); bl.rotateX(PI / 2);
  const blM = new THREE.MeshStandardMaterial({ map: blanketTex(), roughness: .75, side: THREE.DoubleSide, emissiveMap: blanketTex(), emissive: 0xffffff, emissiveIntensity: 0 }); nm.push([blM, 0, .45]);
  M(bl, blM, 2.18, 1.98, 1, 0, 0, 0, body);
  const trim = neon(0xffc04a, .8); for (const s of [-1, 1]) { const ex = Math.sin(1.75) * 2.2 * s, ey = Math.cos(1.75) * 2.0; noSh(M(G.box, trim, .08, .08, 3.8, ex, ey, 0, body)); }
  // head, ears, tusks, trunk
  const head = grp(body, 0, .75, 3.5);
  M(G.sph, skin, 1.35, 1.45, 1.3, 0, 0, 0, head); M(G.sph, skin, .95, .9, .95, 0, .65, .25, head);
  for (const s of [-1, 1]) {
    noSh(M(G.sphLo, neon(0xffb35a, .9), .14, .14, .14, s * .78, .25, .95, head));
    M(taperTube([[s * .45, -.55, .75], [s * .65, -1.15, 1.25], [s * .6, -1.45, 1.9], [s * .4, -1.25, 2.4]], lin(.17, .04), 10, 5), mat(0xf1e6cf, { roughness: .45 }), 1, 1, 1, 0, 0, 0, head);
  }
  const ears = []; for (const s of [-1, 1]) { const ear = grp(head, s * 1.05, .35, -.3); ear.rotation.y = s * .35; M(G.sph, skin2, .14, 1.5, 1.2, s * .1, -.35, -.65, ear); ears.push({ ear, s }); }
  const trunk = []; let tp = grp(head, 0, -.5, 1.1);
  for (let i = 0; i < 9; i++) { const sg = grp(tp, 0, i ? -.6 : 0, 0); const rr = .42 - i * .035; M(G.cylLo, skin, rr, .64, rr, 0, -.3, 0, sg); M(G.knob, skin, rr, rr, rr, 0, 0, 0, sg); trunk.push(sg); tp = sg; }
  M(taperTube([[0, .2, -3.2], [0, -.4, -3.6], [.05, -1.4, -3.7], [.1, -2.2, -3.6]], lin(.11, .04), 8, 4), skin, 1, 1, 1, 0, 0, 0, body);
  // pedestal column (the "real" support)
  M(G.cyl, goldM, .6, 3.4, .6, 0, 2.9, 0, g);
  for (const y of [1.7, 2.9, 4.1]) noSh(M(G.cyl, neon(0xff5a1f, .9), .66, .1, .66, 0, y, 0, g));
  // saddle deck + rails
  const deck = 8.45;
  M(G.box, goldM, 3.4, .7, 5.0, 0, deck - .6, 0, g); M(G.box, mat(0x7a0c14, { roughness: .8 }), 3.5, .1, 5.1, 0, deck - .05, 0, g);
  for (const s of [-1, 1]) { for (let i = 0; i < 5; i++) M(G.cylLo, goldM, .05, .9, .05, s * 1.7, deck + .45, -2.45 + i * 1.225, g); noSh(M(G.box, neon(0xffd23f, .9), .07, .07, 5.0, s * 1.7, deck + .9, 0, g)); noSh(M(G.box, neon(0xff5a1f, .9), .06, .06, 5.0, s * 1.72, deck - .9, 0, g)); }
  // obelisk
  const OZ = -1.9, OB = deck + .15, OH = 5.4, ob = new THREE.CylinderGeometry(.34, .58, 1, 4).rotateY(PI / 4);
  M(G.box, goldM, 1.5, .3, 1.5, 0, deck + .15, OZ, g);
  M(ob, mat(0xe7d4a8, { roughness: .7, flatShading: true }), 1.6, OH, 1.6, 0, OB + OH / 2, OZ, g);
  const tipY = OB + OH, ok = new Kit(), cb = .58 * 1.6 / Math.SQRT2, ct = .34 * 1.6 / Math.SQRT2;
  for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) ok.bar([sx * cb * 1.01, OB, OZ + sz * cb * 1.01], [sx * ct * 1.01, tipY, OZ + sz * ct * 1.01], .045);
  noSh(M(ok.geo(), neon(0xffd23f, 1), 1, 1, 1, 0, 0, 0, g));
  for (let f = 0; f < 4; f++) { const a = f / 4 * TAU; for (let i = 0; i < 4; i++) { const y = OB + .9 + i * 1.05, w = .36 - i * .045, rr = (.58 - (.24 * (y - OB) / OH)) * 1.6 * .71 + .02; const gl = noSh(M(G.box, neon(0xff5a1f, .9), w * 2, .07, .02, Math.sin(a) * rr, y, OZ + Math.cos(a) * rr, g)); gl.rotation.y = a; } }
  noSh(M(G.cone4, neon(0xffd23f, 1.5), ct * Math.SQRT2, 1.0, ct * Math.SQRT2, 0, tipY + .5, OZ, g));
  const osp = glowSprite(0xffd060, 4.5); osp.position.set(0, tipY + .6, OZ); g.add(osp); sprites.push([osp, .9]);
  const lasers = makeLasers(4, [0xffd23f, 0xff4fa8], 90); lasers.position.set(0, tipY + .6, OZ);
  // spindly stepping legs (visual only; wheels still drive)
  const legM = mat(0x2a2527, { roughness: .65 }), knobM = mat(0x403739, { roughness: .55 }), knee = neon(0xffb35a, .7);
  const legs = [], tars = .9, L1 = 3.5, L2 = 2.7, order = { '1,1': 0, '-1,-1': .25, '-1,1': .5, '1,-1': .75 };
  for (const sz of [1, -1]) for (const sx of [1, -1]) {
    const l = { sx, sz, off: order[sx + ',' + sz], H: V(sx * 1.35, BY - 1.25, sz * 2.0), foot0: V(sx * 2.85, 0, sz * 2.3), F: V(), An: V(), K: V(), bend: V(sx, .25, sz * .3).normalize() };
    l.up = keep(M(G.cylLo, legM, 1, 1, 1, 0, 0, 0, g)); l.lo = keep(M(G.cylLo, legM, 1, 1, 1, 0, 0, 0, g)); l.ta = keep(M(G.cylLo, legM, 1, 1, 1, 0, 0, 0, g));
    l.kH = keep(M(G.sphLo, knobM, .38, .38, .38, l.H.x, l.H.y, l.H.z, g)); l.kK = keep(noSh(M(G.sphLo, knee, .26, .26, .26, 0, 0, 0, g))); l.kA = keep(M(G.knob, knobM, .2, .2, .2, 0, 0, 0, g));
    l.pad = keep(M(G.sphLo, skin2, .4, .18, .4, 0, 0, 0, g));
    legs.push(l);
  }
  let phase = 0, amp = 0; const ST = .75, AMPZ = .9;
  const updLegs = (dt, t, sp) => {
    amp += ((sp > .05 ? 1 : .25) - amp) * Math.min(1, dt * 1.5);
    phase = (phase + dt * Math.max(sp, .35) * ST / (2 * AMPZ)) % 1;
    for (const l of legs) {
      const p = (phase + l.off) % 1; let dz, lift = 0;
      if (p < ST) dz = AMPZ - 2 * AMPZ * (p / ST); else { const u = (p - ST) / (1 - ST); dz = -AMPZ + 2 * AMPZ * smooth(u); lift = Math.sin(PI * u) * .9; }
      l.F.set(l.foot0.x, lift * amp, l.foot0.z + dz * amp); l.An.set(l.F.x + l.sx * .2, l.F.y + tars, l.F.z);
      solveKnee(l.H, l.An, L1, L2, l.bend, l.K);
      placeSeg(l.up, l.H, l.K, .16); placeSeg(l.lo, l.K, l.An, .12); placeSeg(l.ta, l.An, l.F, .09);
      l.kK.position.copy(l.K); l.kA.position.copy(l.An); l.pad.position.set(l.F.x, l.F.y + .1, l.F.z);
    }
  };
  updLegs(0, 0, 0);
  return finish('elephant', g, {
    deck, seat: [0, deck, 1.9], dancers: [[-.9, deck, .8], [.9, deck, -.5], [-.8, deck, -.6]],
    poofers: [[-1.25, deck, -2.0], [1.25, deck, -2.0]], spotColor: 0xffb35a, nightMats: nm, sprites, wheels, Rw, lasers, len: 12.2, height: tipY + 1,
    update(dt, t, ctx, night, sp) {
      updLegs(dt, t, sp);
      for (let i = 0; i < trunk.length; i++) { trunk[i].rotation.x = -.12 - .06 * i + .1 * Math.sin(t * 1.1 - i * .45); trunk[i].rotation.z = .08 * Math.sin(t * .7 - i * .4); }
      for (const e of ears) e.ear.rotation.y = e.s * (.35 + .25 * Math.sin(t * 1.4 + e.s * .3));
      head.rotation.x = .04 * Math.sin(t * .8);
    },
  });
}

// ============================================================ 8. MASK PARADE FLOAT (Picasso)
function buildMask() {
  seedFrom('mask');
  const { g, wheels, Rw } = carBase({ len: 10.6, frameW: 2.6, R: .72, axles: [3.8, 0, -3.8], halfW: 2.45, glow: 0xff4fa8, hub: 0x46f1ff });
  const nm = [[maskMat(), .08, 2.2]], sprites = [];
  const ct = collageTex();
  const collM = new THREE.MeshStandardMaterial({ map: ct, roughness: .8, emissiveMap: ct, emissive: 0xffffff, emissiveIntensity: 0 }); nm.push([collM, 0, .3]);
  M(boxGeoUV(4.6, 1.0, 11.6, 4.6, 2.3), collM, 1, 1, 1, 0, 1.45, 0, g);
  M(G.box, mat(0x5a1424, { roughness: .6 }), 4.7, .1, 11.7, 0, 2.0, 0, g);
  const deck = 2.05;
  // multi-colour neon rim around the stage
  const nc = [neon(0xff4fa8, 1), neon(0x46f1ff, 1), neon(0xffd23f, 1)];
  for (let i = 0; i < 12; i++) for (const s of [-1, 1]) noSh(M(G.box, nc[i % 3], .07, .07, .97, s * 2.36, 2.07, -5.35 + i * .975, g));
  for (let i = 0; i < 5; i++) for (const z of [-5.86, 5.86]) noSh(M(G.box, nc[(i + 1) % 3], .92, .07, .07, -1.88 + i * .94, 2.07, z, g));
  // backdrop wall with masks front & back
  M(boxGeoUV(4.4, 4.6, .3, 4.6, 2.3), collM, 1, 1, 1, 0, deck + 2.3, -5.45, g);
  const bk = new Kit(); bk.line([[-2.2, deck, -5.27], [-2.2, deck + 4.6, -5.27], [2.2, deck + 4.6, -5.27], [2.2, deck, -5.27]], .05); noSh(M(bk.geo(), neon(0xffd23f, 1), 1, 1, 1, 0, 0, 0, g));
  const masks = [];
  const addMask = (k, size, parent, x, y, z, ry = 0, rx = 0, wob = .06) => { const p = grp(parent, x, y, z); p.rotation.set(rx, ry, 0); const m = maskMesh(k, size, p); masks.push({ p, ph: R(0, TAU), rx, ry, wob }); return m; };
  addMask(0, 2.6, g, 0, deck + 3.2, -5.25, 0, 0, .03); addMask(1, 1.9, g, -1.25, deck + 1.25, -5.25, 0, 0, .03); addMask(2, 1.9, g, 1.25, deck + 1.35, -5.25, 0, 0, .03);
  addMask(3, 1.9, g, -.9, deck + 2.8, -5.65, PI, 0, .03); addMask(4, 1.9, g, .95, deck + 2.0, -5.65, PI, 0, .03);
  addMask(5, 2.6, g, 0, deck + 5.8, -5.45, 0, -.1, .1);
  // giant front mask with neon sunburst
  addMask(6, 3.1, g, 0, 2.15, 6.05, 0, -.25, .03);
  const burst = grp(g, 0, 2.3, 5.88);
  for (let i = 0; i < 14; i++) { const a = i / 14 * TAU, b = noSh(M(G.box, nc[i % 3], .1, 1.4, .06, Math.sin(a) * 1.95, Math.cos(a) * 1.95, 0, burst)); b.rotation.z = -a; }
  // side masks on posts
  const postM = mat(0x1a1a1a, { roughness: .5 });
  for (const s of [-1, 1]) for (const [i, z] of [[0, 2.4], [1, -.2], [2, -2.8]]) {
    M(G.cylLo, postM, .07, 1.8, .07, s * 2.2, deck + .9, z, g);
    addMask(7 + i + (s > 0 ? 3 : 0), 2.3, g, s * 2.3, deck + 2.75, z, s * PI / 2, 0, .1);
  }
  const lasers = makeLasers(4, [0xff4fa8, 0x46f1ff], 90); lasers.position.set(0, deck + 4.7, -5.45);
  return finish('mask', g, {
    deck, seat: [0, deck, 3.6], dancers: [[-1.2, deck, .6], [1.1, deck, -1.0], [-.9, deck, -2.7], [1.0, deck, -3.8]],
    poofers: [[-1.95, deck + 4.6, -5.45], [1.95, deck + 4.6, -5.45]], spotColor: 0xff7ad0, nightMats: nm, sprites, wheels, Rw, lasers, len: 12.0, height: 9.0,
    update(dt, t) {
      for (const m of masks) { m.p.rotation.x = m.rx + m.wob * Math.sin(t * 1.6 + m.ph); m.p.rotation.z = m.wob * .8 * Math.sin(t * 1.1 + m.ph * 2); }
      burst.rotation.z = t * .4;
    },
  });
}

// ============================================================ registry
export const ART_CAR_TYPES = [
  { type: 'starry', name: 'The Starry Night Express', artist: 'Vincent van Gogh', build: buildStarry },
  { type: 'sunflower', name: 'Sunflower Cruiser', artist: 'Vincent van Gogh', build: buildSunflower },
  { type: 'lily', name: 'Water Lily Barge', artist: 'Claude Monet', build: buildLily },
  { type: 'cubist', name: 'Cubist Bull', artist: 'Pablo Picasso', build: buildCubist },
  { type: 'harlequin', name: 'Harlequin Carousel', artist: 'Pablo Picasso', build: buildHarlequin },
  { type: 'mustache', name: 'Dalí’s Mustache Mobile', artist: 'Salvador Dalí', build: buildMustache },
  { type: 'elephant', name: 'Space Elephant Walker', artist: 'Salvador Dalí', build: buildElephant },
  { type: 'mask', name: 'Mask Parade Float', artist: 'Pablo Picasso', build: buildMask },
];
