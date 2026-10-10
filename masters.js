// masters.js — giant walk-in installations after Monet, Van Gogh, Picasso & Dalí for "Phoenix in the Dusty City"
// Every builder returns { g, obs, update(dt, t, ctx), height, title } (+ extras). g origin = ground centre, facing +Z.
// Paintings become walkable 3D through procedural CanvasTextures: see paintTexture() / cubistMaskTexture().
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
export function initMasters(api) { const d = defaultApi(); API = Object.assign(d, api || {}); if (!API.glowMap) API.glowMap = d.glowMap; }
const mat = (c, o) => A().mat(c, o);
const neon = (c, k) => A().neon(c, k);

// ============================================================ small utils
let _seed = 8675309;
function rnd() { _seed |= 0; _seed = _seed + 0x6D2B79F5 | 0; let t = Math.imul(_seed ^ _seed >>> 15, 1 | _seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }
function prng(seed) { let s = (seed * 2654435761) | 0 || 1; return () => { s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const R = (a, b) => a + rnd() * (b - a);
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp = (a, b, u) => a + (b - a) * u;
const NOCTX = { night: 0, playerPos: null };

const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3();
const _q1 = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _m1 = new THREE.Matrix4(), _o3 = new THREE.Object3D();
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
function ctex(c, rep) { const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; if (rep) t.wrapS = t.wrapT = THREE.RepeatWrapping; return t; }
function mtx(x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) {
  return new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(sx, sy, sz));
}
function segMtx(a, b, r) { const d = new THREE.Vector3().subVectors(b, a); const len = d.length(); return new THREE.Matrix4().compose(new THREE.Vector3().addVectors(a, b).multiplyScalar(.5), new THREE.Quaternion().setFromUnitVectors(_UP, d.normalize()), new THREE.Vector3(r, len, r)); }
const V3 = (p) => p.isVector3 ? p : new THREE.Vector3(p[0], p[1], p[2]);
// merge [geometry, matrix?] pairs -> one non-indexed geometry (position+normal(+uv)(+color))
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
// batch sibling meshes sharing a material into one mesh (per parent). userData.keep / meshes with children are left alone.
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
const noShadow = (o) => { o.castShadow = false; return o; };
function taperTube(pts, rFn, tubSeg = 16, radSeg = 7, closed = false) {
  const curve = new THREE.CatmullRomCurve3(pts.map(V3), closed);
  const geo = new THREE.TubeGeometry(curve, tubSeg, 1, radSeg, closed);
  const pos = geo.attributes.position, P = new THREE.Vector3(), V = new THREE.Vector3();
  for (let i = 0; i <= tubSeg; i++) {
    const t = i / tubSeg; curve.getPointAt(t, P); const r = rFn(t);
    for (let j = 0; j <= radSeg; j++) { const k = i * (radSeg + 1) + j; V.fromBufferAttribute(pos, k).sub(P).multiplyScalar(r).add(P); pos.setXYZ(k, V.x, V.y, V.z); }
  }
  geo.computeVertexNormals(); geo.userData.curve = curve; return geo;
}
const lin = (a, b, p = 1) => (t) => a + (b - a) * Math.pow(t, p);
const lathe = (pts, seg = 20) => new THREE.LatheGeometry(pts.map(p => new THREE.Vector2(p[0], p[1])), seg);
// flat extruded 2D shape (points [[x,y],...]) of given depth, centred on z=0
function slab(pts, depth = .3, bevel = 0) {
  const s = new THREE.Shape(pts.map(p => new THREE.Vector2(p[0], p[1])));
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: bevel > 0, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 1, curveSegments: 6 });
  g.translate(0, 0, -depth / 2); return g;
}
// ellipse points
function ell(cx, cy, rx, ry, n = 14, a0 = 0) { const p = []; for (let i = 0; i < n; i++) { const a = a0 + i / n * TAU; p.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]); } return p; }
// grow polygon about centroid (cheap outline offset for mostly-convex shapes)
function grow(pts, d) { let cx = 0, cy = 0; for (const p of pts) { cx += p[0]; cy += p[1]; } cx /= pts.length; cy /= pts.length; return pts.map(([x, y]) => { const dx = x - cx, dy = y - cy, l = Math.hypot(dx, dy) || 1; return [x + dx / l * d, y + dy / l * d]; }); }
// Picasso plane: coloured slab with a thick black outline slab behind it
function cubPlane(parent, pts, color, o = {}) {
  const d = o.depth ?? .25, m = mtx(o.x || 0, o.y || 0, o.z || 0, o.rx || 0, o.ry || 0, o.rz || 0);
  const a = M(slab(pts, d).applyMatrix4(m), typeof color === 'number' ? mat(color, { roughness: .7 }) : color, 1, 1, 1, 0, 0, 0, parent);
  if (o.outline !== 0) M(slab(grow(pts, o.outline ?? .12), d * .8).translate(0, 0, -d * .2).applyMatrix4(m), mat(0x0d0d0f, { roughness: .6 }), 1, 1, 1, 0, 0, 0, parent);
  return a;
}
function makeGlowSprite(color, scale) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: A().glowMap, color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 })); s.scale.setScalar(scale); return s; }
// textured material that can glow (emissiveMap = its own map) at night; updated through glowList
function paintMat(tex, o = {}) {
  const m = new THREE.MeshStandardMaterial({ map: tex, roughness: o.rough ?? .8, metalness: o.metal ?? 0, side: o.side ?? THREE.FrontSide, transparent: !!o.transparent, alphaTest: o.alphaTest ?? 0, depthWrite: o.transparent ? false : true, vertexColors: !!o.vc });
  if (o.color != null) m.color.set(o.color);
  if (o.glow) { m.emissive.set(o.glowColor ?? 0xffffff); m.emissiveMap = o.emMap || tex; m.userData.g0 = o.glow[0]; m.userData.g1 = o.glow[1]; m.emissiveIntensity = o.glow[0]; }
  return m;
}
function glowUpd(list, night) { for (let i = 0; i < list.length; i++) { const m = list[i]; m.emissiveIntensity = m.userData.g0 + (m.userData.g1 - m.userData.g0) * night; } }
function sprUpd(list, night, t, base = .55) { for (let i = 0; i < list.length; i++) { const s = list[i]; s.material.opacity = night * base * (.8 + .2 * Math.sin(t * 2.3 + i * 1.7)); } }

// ============================================================ shared geometry
const G = {
  sph: new THREE.SphereGeometry(1, 14, 10),
  sphLo: new THREE.SphereGeometry(1, 8, 6),
  hemi: new THREE.SphereGeometry(1, 14, 6, 0, TAU, 0, PI / 2),
  cyl: new THREE.CylinderGeometry(1, 1, 1, 12),
  cylLo: new THREE.CylinderGeometry(1, 1, 1, 6),
  box: new THREE.BoxGeometry(1, 1, 1),
  cone: new THREE.ConeGeometry(1, 1, 10),
  coneLo: new THREE.ConeGeometry(1, 1, 5),
  disc: new THREE.CylinderGeometry(1, 1, 1, 28),
  torus: new THREE.TorusGeometry(1, .12, 6, 28),
  oct: new THREE.OctahedronGeometry(1, 0),
  ico: new THREE.IcosahedronGeometry(1, 1),
  plane: new THREE.PlaneGeometry(1, 1),
  circ: new THREE.CircleGeometry(1, 32),
};

// ============================================================ painterly textures
// Exported styles: 'vangogh' | 'monet' | 'picasso' | 'harlequin' | 'bluePeriod' | 'dali'.
// Extra internal variants (also accepted): vg: 'cypress','wheat','storm','sunbg','skin','coat','beard','straw','cobble','cafewall','seeds','vase'
// monet: 'water','haystack','haystack2','meadow','dress','parasol','bridge'
const TX = {};
const VG_PAL = {
  vangogh: { bg: '#1a2f6e', a: ['#1d3c8f', '#2a56b5', '#3f72c9', '#6f9ad8', '#a9c6e8', '#14286a', '#4b86c4'], b: ['#f4d23a', '#f7e27a', '#fff3b0', '#e8b52a', '#cfe3f0'], dir: 0, vort: 5, swirl: 1.3 },
  cypress: { bg: '#0d1a10', a: ['#1f3d1e', '#2e5a2a', '#43703a', '#0c160d', '#5d7d3a', '#1a2a3a', '#26462c'], b: ['#6f8f3a', '#1e3348'], dir: -PI / 2, vort: 6, swirl: 1.6 },
  wheat: { bg: '#c9952e', a: ['#e3b53a', '#f0cc55', '#c9902a', '#f6e08a', '#a8761d', '#d9a540'], b: ['#7a8a3a', '#e0732a'], dir: -PI / 2.4, vort: 3, swirl: .7 },
  storm: { bg: '#0f1d4a', a: ['#0e1c4a', '#1d3a8a', '#2c55a8', '#08102a', '#3a6ac0', '#1a2f6a'], b: ['#5f8fd0', '#e8eef8'], dir: 0, vort: 6, swirl: 1.4 },
  sunbg: { bg: '#e2bd45', a: ['#e9c547', '#f2d566', '#d9ad2f', '#f7e39a', '#e6b83a'], b: ['#f0a830', '#c8d26a'], dir: -PI / 2, vort: 2, swirl: .4 },
  skin: { bg: '#c99863', a: ['#d9a66c', '#c48a52', '#8fa36a', '#e6c08a', '#b8783e', '#a3b07a'], b: ['#e8c89a', '#9a5f30'], dir: -PI / 2, vort: 2, swirl: .5 },
  coat: { bg: '#2a4878', a: ['#2b4f8a', '#3d6aa6', '#6b8fb9', '#24406e', '#4f7d6a', '#1c3360'], b: ['#8fb0d0', '#3f7a7a'], dir: -PI / 2.2, vort: 3, swirl: .6 },
  beard: { bg: '#c0601e', a: ['#d2691e', '#e8873a', '#b5501a', '#f0a050', '#c8781e'], b: ['#f6c070', '#8a3a12'], dir: PI / 2, vort: 1, swirl: .3 },
  straw: { bg: '#d8bb62', a: ['#e8cf7a', '#d4b04f', '#f3e2a3', '#b8913a', '#e0c060'], b: ['#9a7a2a'], dir: 0, vort: 0, swirl: 0 },
  cobble: { bg: '#8a6a52', a: ['#c9874a', '#a8693a', '#e0a860', '#6a5a8a', '#4f6a9a', '#b07a50'], b: ['#e8c890'], dir: 0, vort: 4, swirl: .8 },
  cafewall: { bg: '#e8a83a', a: ['#f0b43a', '#e89a2a', '#f6d26a', '#d07a20', '#f8e090'], b: ['#e06a20'], dir: -PI / 2, vort: 2, swirl: .5 },
  seeds: { bg: '#4a2c14', a: ['#5a3818', '#7a4a1e', '#3a2210', '#8a5a2a', '#6a6a2a'], b: ['#c08a3a'], dir: 0, vort: 3, swirl: 2 },
  swirlbg: { bg: '#7fa8b8', a: ['#8fb8c8', '#6fa0b8', '#a9cfd8', '#5f8aa0', '#c8e0e0', '#4f7890'], b: ['#e8f0e0', '#3f6a80'], dir: 0, vort: 7, swirl: 1.6 },
  vase: { bg: '#e0b048', a: ['#e8bc50', '#d8a238', '#f2d27a', '#c88a2a'], b: ['#f6e0a0'], dir: 0, vort: 0, swirl: 0 },
};
const MO_PAL = {
  monet: { bg: ['#d9cfe6', '#cfe0d0'], p: ['#c8a2c8', '#b5c9a5', '#e8b4bc', '#a9cbe0', '#f3ead2', '#9fb98f', '#d6c4e6'], ang: 0, jit: PI },
  water: { bg: ['#6f9bb0', '#4f7f8a'], p: ['#5f8fa8', '#7fb0b8', '#3d6f86', '#a9c9d6', '#c8b6d8', '#6a9a7a', '#e6e0f0', '#4a7a6a'], ang: 0, jit: .25 },
  haystack: { bg: ['#e2a050', '#b8604a'], p: ['#e8a24a', '#d9773a', '#f2c66a', '#c75a4a', '#b38ad0', '#f5d79a', '#8a6ab0', '#e88a6a'], ang: PI / 2, jit: .6 },
  haystack2: { bg: ['#d0b8d8', '#9fb0d0'], p: ['#c9b3e0', '#e8c0a8', '#9fb4d8', '#f0d8c0', '#d89a8a', '#f6e6d0', '#a888c0'], ang: PI / 2, jit: .6 },
  meadow: { bg: ['#9ab878', '#7fa060'], p: ['#8fb06a', '#a9c47a', '#6f9a5a', '#d8d27a', '#c9d9a0', '#e8e0a0', '#5f8a50', '#b8c8e0'], ang: 0, jit: .9 },
  dress: { bg: ['#eef0f0', '#d8e4ec'], p: ['#f4f1e8', '#dfe8f0', '#b9cde0', '#e8e0ef', '#c8d8c8', '#ffffff', '#a8c0d8'], ang: PI / 2, jit: .5 },
  parasol: { bg: ['#7fa86a', '#5f8a50'], p: ['#6f9a5a', '#8fb87a', '#4f7a4a', '#b9d09a', '#d8e0a0'], ang: 0, jit: PI },
  bridge: { bg: ['#4f8a58', '#3a6a48'], p: ['#4f8a58', '#6faa6a', '#2f5a3a', '#8fc080', '#3f7a5a'], ang: 0, jit: .4 },
};
// van Gogh: many short curved impasto strokes following a vortex flow field
function vgPaint(x, S, rr, P) {
  x.fillStyle = P.bg; x.fillRect(0, 0, S, S);
  const vs = []; for (let i = 0; i < P.vort; i++) vs.push([rr() * S, rr() * S, (rr() < .5 ? -1 : 1) * P.swirl, S * (.08 + rr() * .14)]);
  const flow = (px, py) => {
    let dx = Math.cos(P.dir) + .35 * Math.sin(py / S * 9 + px / S * 3), dy = Math.sin(P.dir) + .35 * Math.cos(px / S * 7); let near = 0;
    for (const [cx, cy, s, r] of vs) { let ox = px - cx, oy = py - cy; if (ox > S / 2) ox -= S; if (ox < -S / 2) ox += S; if (oy > S / 2) oy -= S; if (oy < -S / 2) oy += S; const w = Math.exp(-(ox * ox + oy * oy) / (r * r * 2)); dx += -oy / r * s * w * 3; dy += ox / r * s * w * 3; near = Math.max(near, Math.exp(-(ox * ox + oy * oy) / (r * r * .5))); }
    const l = Math.hypot(dx, dy) || 1; return [dx / l, dy / l, near];
  };
  const n = Math.floor(S * S / 75), sc = S / 512; x.lineCap = 'round';
  for (let i = 0; i < n; i++) {
    let px = rr() * S, py = rr() * S; const f0 = flow(px, py);
    const pal = (f0[2] > .35 && rr() < .8) || rr() < .07 ? P.b : P.a, c = pal[Math.floor(rr() * pal.length)];
    const w = (2.2 + rr() * 3.5) * sc, steps = 4 + Math.floor(rr() * 5), len = (3 + rr() * 3) * sc, path = [[px, py]];
    for (let k = 0; k < steps; k++) { const f = flow(px, py); px += f[0] * len; py += f[1] * len; path.push([px, py]); }
    for (const [off, col, lw, al] of [[0, c, w, 1], [-.45 * w, 'rgba(255,255,255,.35)', w * .35, 1], [.45 * w, 'rgba(0,0,20,.25)', w * .3, 1]]) {
      x.strokeStyle = col; x.lineWidth = lw; x.globalAlpha = al; x.beginPath();
      for (let k = 0; k < path.length; k++) { const q = path[k]; k ? x.lineTo(q[0] + off * .5, q[1] + off) : x.moveTo(q[0] + off * .5, q[1] + off); }
      x.stroke();
    }
  }
  x.globalAlpha = 1;
}
// Monet: soft pastel dabs over a hazy gradient
function moPaint(x, S, rr, P, H = S) {
  const gr = x.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, P.bg[0]); gr.addColorStop(1, P.bg[1]); x.fillStyle = gr; x.fillRect(0, 0, S, H);
  const n = Math.floor(S * H / 60), sc = S / 512;
  for (let i = 0; i < n; i++) {
    const px = rr() * S, py = rr() * H; x.globalAlpha = .35 + rr() * .55; x.fillStyle = P.p[Math.floor(rr() * P.p.length)];
    x.beginPath(); x.ellipse(px, py, (4 + rr() * 8) * sc, (1.8 + rr() * 3) * sc, P.ang + (rr() - .5) * P.jit, 0, TAU); x.fill();
  }
  x.globalAlpha = 1;
}
// polygon split by a line through p with normal n
function splitPoly(poly, px, py, nx, ny) {
  const a = [], b = []; const s = (q) => (q[0] - px) * nx + (q[1] - py) * ny;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i], q = poly[(i + 1) % poly.length], sp = s(p), sq = s(q);
    (sp >= 0 ? a : b).push(p);
    if ((sp >= 0) !== (sq >= 0)) { const u = sp / (sp - sq); const m = [p[0] + (q[0] - p[0]) * u, p[1] + (q[1] - p[1]) * u]; a.push(m); b.push(m); }
  }
  return [a, b];
}
const PIC_COL = ['#d94a2b', '#f2c230', '#2b5fa8', '#f2ead8', '#3a8a5a', '#e88aa8', '#f08a2a', '#7a4fb0', '#8ac0e0'];
function picPaint(x, S, rr, pal = PIC_COL, depth = 7) {
  let polys = [[[0, 0], [S, 0], [S, S], [0, S]]];
  for (let d = 0; d < depth; d++) {
    const nx2 = []; for (const p of polys) { if (p.length < 3 || rr() < .15) { nx2.push(p); continue; } let cx = 0, cy = 0; for (const q of p) { cx += q[0]; cy += q[1]; } cx /= p.length; cy /= p.length; const a = rr() * PI; const [u, v] = splitPoly(p, cx + (rr() - .5) * S * .1, cy + (rr() - .5) * S * .1, Math.cos(a), Math.sin(a)); if (u.length > 2) nx2.push(u); if (v.length > 2) nx2.push(v); }
    polys = nx2;
  }
  x.lineJoin = 'round';
  for (const p of polys) { x.fillStyle = pal[Math.floor(rr() * pal.length)]; x.beginPath(); p.forEach((q, i) => i ? x.lineTo(q[0], q[1]) : x.moveTo(q[0], q[1])); x.closePath(); x.fill(); }
  for (let i = 0; i < 5; i++) { x.fillStyle = 'rgba(20,20,20,.9)'; x.beginPath(); x.arc(rr() * S, rr() * S, S * (.015 + rr() * .03), 0, TAU); x.fill(); }
  x.strokeStyle = '#111'; x.lineWidth = S / 70;
  for (const p of polys) { x.beginPath(); p.forEach((q, i) => i ? x.lineTo(q[0], q[1]) : x.moveTo(q[0], q[1])); x.closePath(); x.stroke(); }
  x.lineWidth = S / 110; for (let i = 0; i < 6; i++) { x.beginPath(); x.arc(rr() * S, rr() * S, S * (.05 + rr() * .15), rr() * TAU, rr() * TAU + 1.5); x.stroke(); }
}
function harlequinPaint(x, S, rr) {
  x.fillStyle = '#e8a6a0'; x.fillRect(0, 0, S, S);
  const cols = ['#d84a5a', '#f2d27a', '#3f9a96', '#f4efe4', '#e07a3a', '#2a3a6a'], N = 6, w = S / N, h = S / N;
  x.strokeStyle = '#1a1414'; x.lineWidth = S / 128;
  for (let j = -2; j <= 2 * N + 1; j++) for (let i = -1; i <= N; i++) {
    const cx = (i + .5) * w + (j & 1 ? w / 2 : 0), cy = j * h / 2; x.fillStyle = cols[((i * 2 + j * 3) % cols.length + cols.length) % cols.length];
    x.beginPath(); x.moveTo(cx, cy - h / 2); x.lineTo(cx + w / 2, cy); x.lineTo(cx, cy + h / 2); x.lineTo(cx - w / 2, cy); x.closePath(); x.fill(); x.stroke();
  }
  for (let i = 0; i < S * 3; i++) { x.globalAlpha = .12; x.fillStyle = rr() < .5 ? '#fff' : '#600'; x.fillRect(rr() * S, rr() * S, 3, 1 + rr() * 4); } x.globalAlpha = 1;
}
function bluePaint(x, S, rr) {
  const gr = x.createLinearGradient(0, 0, S * .3, S); gr.addColorStop(0, '#2c4f7c'); gr.addColorStop(.6, '#1b3358'); gr.addColorStop(1, '#13233f'); x.fillStyle = gr; x.fillRect(0, 0, S, S);
  const pal = ['#1b2f5a', '#2a4a7a', '#3f6a9a', '#5f8ab0', '#16233f', '#7fa0c0', '#3a5f7a', '#9ab8c8'];
  x.lineCap = 'round';
  for (let i = 0; i < S * 3.5; i++) { const px = rr() * S, py = rr() * S, a = PI / 2 + (rr() - .5) * .5, l = S * (.02 + rr() * .06); x.globalAlpha = .25 + rr() * .4; x.strokeStyle = pal[Math.floor(rr() * pal.length)]; x.lineWidth = S / 512 * (2 + rr() * 6); x.beginPath(); x.moveTo(px, py); x.quadraticCurveTo(px + Math.cos(a) * l * .5 + rr() * 6, py + Math.sin(a) * l * .5, px + Math.cos(a) * l, py + Math.sin(a) * l); x.stroke(); }
  x.globalAlpha = 1;
}
function daliPaint(x, S, rr) {
  const gr = x.createLinearGradient(0, 0, 0, S); gr.addColorStop(0, '#1d3a6a'); gr.addColorStop(.35, '#5f86a8'); gr.addColorStop(.55, '#f2d290'); gr.addColorStop(.6, '#e0a050'); gr.addColorStop(.8, '#b8763a'); gr.addColorStop(1, '#7a2a1a');
  x.fillStyle = gr; x.fillRect(0, 0, S, S);
  x.fillStyle = '#c9933c'; x.beginPath(); x.moveTo(S * .55, S * .58); for (let i = 0; i <= 12; i++) { const u = i / 12; x.lineTo(S * (.55 + .45 * u), S * (.58 - .12 * Math.sin(u * PI) * (1 + .3 * Math.sin(u * 13)))); } x.lineTo(S, S * .6); x.closePath(); x.fill();
  for (let i = 0; i < 9; i++) { const px = rr() * S, py = S * (.62 + rr() * .35), r = S * (.03 + rr() * .07); const g2 = x.createRadialGradient(px - r * .3, py - r * .4, r * .05, px, py, r); g2.addColorStop(0, '#fff6dc'); g2.addColorStop(.4, ['#e8b23a', '#c0182a', '#d9a63a', '#a8442a'][i % 4]); g2.addColorStop(1, 'rgba(60,20,10,.0)'); x.fillStyle = g2; x.beginPath(); x.ellipse(px, py, r * 1.4, r * .8, 0, 0, TAU); x.fill(); x.fillStyle = 'rgba(40,15,10,.35)'; x.beginPath(); x.ellipse(px + r * 1.8, py + r * .6, r * 2.4, r * .25, 0, 0, TAU); x.fill(); }
  for (let i = 0; i < S; i++) { x.globalAlpha = .05; x.fillStyle = '#fff'; x.fillRect(rr() * S, rr() * S * .5, rr() * S * .2, 1); } x.globalAlpha = 1;
}
export function paintTexture(style = 'vangogh', seed = 1, size = 512) {
  const key = style + '|' + seed + '|' + size; if (TX[key]) return TX[key];
  const [c, x] = cnv(size, size), rr = prng(seed + style.length * 977);
  if (VG_PAL[style]) vgPaint(x, size, rr, VG_PAL[style]);
  else if (MO_PAL[style]) moPaint(x, size, rr, MO_PAL[style]);
  else if (style === 'picasso') picPaint(x, size, rr);
  else if (style === 'harlequin') harlequinPaint(x, size, rr);
  else if (style === 'bluePeriod') bluePaint(x, size, rr);
  else if (style === 'dali') daliPaint(x, size, rr);
  else vgPaint(x, size, rr, VG_PAL.vangogh);
  return (TX[key] = ctex(c, true));
}

// ---------- cubist masks
const MASK_COL = ['#e2412f', '#f3c52f', '#2f63b8', '#3fa36b', '#f2ead6', '#e98bb0', '#f08a2a', '#7a4fb0', '#8fc8e8', '#c8a070'];
function drawMask(x, e, seed, ox, oy, S) {
  const rr = prng(seed * 31 + 7), P = (u, v) => [ox + u * S, oy + v * S], col = () => MASK_COL[Math.floor(rr() * MASK_COL.length)];
  const path = (pts, close = true) => { x.beginPath(); pts.forEach((p, i) => i ? x.lineTo(p[0], p[1]) : x.moveTo(p[0], p[1])); if (close) x.closePath(); };
  const LW = S * .035; x.lineJoin = 'round'; x.lineCap = 'round';
  // face outline: long oval with pointed chin, slightly asymmetric
  const face = []; const lw = .3 + rr() * .07, rw = .3 + rr() * .07, chin = .95 + rr() * .02;
  for (let i = 0; i <= 20; i++) { const a = -PI / 2 + i / 20 * TAU, s = Math.cos(a) > 0 ? rw : lw; let v = .48 + Math.sin(a) * .44; if (Math.sin(a) > .6) v = .48 + (Math.sin(a) - .6) / .4 * (chin - .48 - .26) + .26; face.push(P(.5 + Math.cos(a) * s * (Math.sin(a) > 0 ? 1 - .35 * Math.sin(a) * Math.sin(a) : 1), v)); }
  path(face); x.save(); x.clip();
  const ca = col(); let cb = col(); if (cb === ca) cb = MASK_COL[(MASK_COL.indexOf(ca) + 3) % MASK_COL.length];
  x.fillStyle = ca; x.fillRect(ox, oy, S, S);
  const sl = .45 + rr() * .1, tilt = (rr() - .5) * .3; x.fillStyle = cb; path([P(sl + tilt, 0), P(1, 0), P(1, 1), P(sl - tilt, 1)]); x.fill();
  x.fillStyle = col(); x.globalAlpha = .9; path([P(.1, .55 + rr() * .1), P(.5, .6), P(.4, 1), P(.05, 1)]); x.fill(); x.globalAlpha = 1;
  // scarification / hair lines on forehead
  x.strokeStyle = '#141414'; x.lineWidth = LW * .45; const hl = 3 + Math.floor(rr() * 4);
  for (let i = 0; i < hl; i++) { const u = .3 + i / hl * .4; x.beginPath(); x.moveTo(...P(u, .06)); x.lineTo(...P(u + (rr() - .5) * .05, .17)); x.stroke(); }
  x.restore();
  x.strokeStyle = '#111'; x.lineWidth = LW; path(face); x.stroke();
  x.beginPath(); x.moveTo(...P(sl + tilt, .02)); x.lineTo(...P(sl - tilt * .4, .6)); x.stroke();
  // eyes: misaligned, different shapes
  const eyes = [];
  const y1 = .33 + rr() * .06, y2 = y1 + .06 + rr() * .08, side = rr() < .5 ? 1 : -1;
  eyes.push({ u: .5 - .15 * side, v: side > 0 ? y1 : y2, k: 'almond', r: .09 }); eyes.push({ u: .5 + .15 * side, v: side > 0 ? y2 : y1, k: rr() < .5 ? 'round' : 'diamond', r: .065 });
  for (const ey of eyes) {
    for (const [ctx, glow] of [[x, false], [e, true]]) {
      if (!ctx) continue; const [cx, cy] = P(ey.u, ey.v), r = ey.r * S;
      ctx.beginPath();
      if (ey.k === 'almond') { ctx.moveTo(cx - r * 1.3, cy); ctx.quadraticCurveTo(cx, cy - r * 1.2, cx + r * 1.3, cy); ctx.quadraticCurveTo(cx, cy + r * 1.2, cx - r * 1.3, cy); }
      else if (ey.k === 'round') ctx.arc(cx, cy, r, 0, TAU);
      else { ctx.moveTo(cx, cy - r * 1.2); ctx.lineTo(cx + r, cy); ctx.lineTo(cx, cy + r * 1.2); ctx.lineTo(cx - r, cy); ctx.closePath(); }
      ctx.fillStyle = glow ? '#fff4b0' : '#f8f4e8'; ctx.fill();
      if (!glow) { ctx.strokeStyle = '#111'; ctx.lineWidth = LW * .8; ctx.stroke(); ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(cx + r * .15, cy, r * .42, 0, TAU); ctx.fill(); }
      else { ctx.fillStyle = '#ffd040'; ctx.beginPath(); ctx.arc(cx + r * .15, cy, r * .45, 0, TAU); ctx.fill(); }
    }
    x.strokeStyle = '#111'; x.lineWidth = LW * 1.1; x.beginPath(); const [bx, by] = P(ey.u, ey.v - ey.r - .04); x.arc(bx, by + S * .08, S * ey.r * 1.3, PI * 1.2, PI * 1.85); x.stroke();
  }
  // long profile nose
  const nd = rr() < .5 ? 1 : -1, nx0 = .5 + nd * .02;
  x.fillStyle = col(); path([P(nx0, .3), P(nx0 + nd * .2, .62), P(nx0 + nd * .02, .66), P(nx0 - nd * .04, .62)]); x.fill(); x.lineWidth = LW * .9; x.stroke();
  x.fillStyle = '#111'; x.beginPath(); x.arc(...P(nx0 + nd * .07, .635), S * .015, 0, TAU); x.fill();
  // mouth
  const mv = .76 + rr() * .04, mw = .08 + rr() * .05, mt = (rr() - .5) * .1;
  x.fillStyle = rr() < .5 ? '#c0182a' : '#111'; x.beginPath(); x.ellipse(...P(.5 - nd * .03, mv), mw * S, .028 * S, mt, 0, TAU); x.fill(); x.lineWidth = LW * .7; x.stroke();
  x.strokeStyle = '#f2ead6'; x.lineWidth = LW * .35; x.beginPath(); x.moveTo(...P(.5 - nd * .03 - mw * .8, mv)); x.lineTo(...P(.5 - nd * .03 + mw * .8, mv)); x.stroke();
  // cheek marks
  x.fillStyle = '#111'; for (let i = 0; i < 3; i++) { x.beginPath(); x.arc(...P(.5 + nd * (.18 + i * .035), .66 + i * .025), S * .012, 0, TAU); x.fill(); }
}
export function cubistMaskTexture(seed = 1) {
  const key = 'mask|' + seed; if (TX[key]) return TX[key];
  const [c, x] = cnv(256, 256); drawMask(x, null, seed, 0, 0, 256); return (TX[key] = ctex(c));
}
// 4x4 atlas (16 masks) + emissive (eyes) atlas, shared by totem & wall
function maskAtlas() {
  if (TX.atlas) return TX.atlas;
  const [c, x] = cnv(1024, 1024), [ce, e] = cnv(512, 512); e.fillStyle = '#000'; e.fillRect(0, 0, 512, 512); e.scale(.5, .5);
  for (let i = 0; i < 16; i++) drawMask(x, e, i + 1, (i % 4) * 256, Math.floor(i / 4) * 256, 256);
  const map = ctex(c), em = ctex(ce);
  const m = new THREE.MeshStandardMaterial({ map, emissiveMap: em, emissive: 0xffffff, emissiveIntensity: .1, alphaTest: .5, roughness: .55, side: THREE.DoubleSide });
  m.userData.g0 = .05; m.userData.g1 = 2.2;
  return (TX.atlas = { map, em, mat: m });
}
// plane geometry showing atlas cell i (w x h, centred)
function maskGeo(i, w, h) {
  const g = new THREE.PlaneGeometry(w, h), uv = g.attributes.uv, cx = i % 4, cy = Math.floor(i / 4);
  for (let k = 0; k < uv.count; k++) uv.setXY(k, (cx + uv.getX(k)) / 4, 1 - (cy + 1 - uv.getY(k)) / 4);
  return g;
}

function uvScale(geo, su, sv = su) { const uv = geo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv); return geo; }
// bump vertices radially with smooth noise (organic shapes)
function lumpy(geo, amp, f = 3, seed = 1) {
  const p = geo.attributes.position, rr = prng(seed), a = rr() * 9, b = rr() * 9;
  for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i), k = 1 + amp * (Math.sin(x * f + a) * Math.sin(y * f * .8 + b) + .5 * Math.sin(z * f * 1.3 + a + b)); p.setXYZ(i, x * k, y, z * k); }
  geo.computeVertexNormals(); return geo;
}
function setVC(geo, c) { const n = geo.attributes.position.count, a = new Float32Array(n * 3), col = new THREE.Color(c); for (let i = 0; i < n; i++) { a[i * 3] = col.r; a[i * 3 + 1] = col.g; a[i * 3 + 2] = col.b; } geo.setAttribute('color', new THREE.BufferAttribute(a, 3)); return geo; }
function nonIdx(geo) { return geo.index ? geo.toNonIndexed() : geo; }
const SCATTER = new THREE.Object3D();
function inst(geo, m, n, fn, colFn) {
  const im = new THREE.InstancedMesh(geo, m, n); im.castShadow = true; im.receiveShadow = true;
  for (let i = 0; i < n; i++) { SCATTER.position.set(0, 0, 0); SCATTER.rotation.set(0, 0, 0); SCATTER.scale.set(1, 1, 1); fn(i, SCATTER); SCATTER.updateMatrix(); im.setMatrixAt(i, SCATTER.matrix); if (colFn) im.setColorAt(i, colFn(i)); }
  im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true; im.computeBoundingSphere(); return im;
}
const _c = new THREE.Color();
function groundDisc(parent, r, tex, rep = 4, y = .03, sx = 1, sz = 1) {
  const m = M(uvScale(new THREE.CircleGeometry(r, 40).rotateX(-PI / 2), rep), paintMat(tex, { rough: .95 }), sx, 1, sz, 0, y, 0, parent); m.castShadow = false; return m;
}

// ============================================================ MONET
// 1. Water-lily pond with the green Japanese footbridge
export function buildMonetPond() {
  const g = new THREE.Group(), RX = 11.5, RZ = 8.5, glows = [], sprs = [];
  const bank = lathe([[.97, -.05], [1.0, .22], [1.05, .32], [1.14, .22], [1.2, 0]], 36);
  M(uvScale(bank, 10, 1), paintMat(paintTexture('meadow', 3), { rough: .95 }), RX, 1, RZ, 0, 0, 0, g).castShadow = false;
  M(new THREE.CircleGeometry(1, 40).rotateX(-PI / 2), mat(0x1d3b3a, { roughness: 1 }), RX, 1, RZ, 0, .02, 0, g).castShadow = false;
  const wt = paintTexture('water', 5).clone(); wt.needsUpdate = true; wt.repeat.set(2.5, 2.5);
  const wm = paintMat(wt, { rough: .1, metal: .25, glow: [0, .35] }); glows.push(wm);
  const water = M(new THREE.CircleGeometry(1, 40).rotateX(-PI / 2), wm, RX, 1, RZ, 0, .14, 0, g); water.castShadow = false;
  // lily pads (notched discs) + flowers
  const rr = prng(11), inEll = (o, k) => { for (;;) { const x = (rr() * 2 - 1), z = (rr() * 2 - 1); if (x * x + z * z < k * k) { o.x = x * RX; o.z = z * RZ; return o; } } };
  const pt = { x: 0, z: 0 }, padPts = [];
  const pads = inst(new THREE.CircleGeometry(1, 9, .4, TAU - .4).rotateX(-PI / 2), mat(0xffffff, { roughness: .6 }), 56, (i, o) => { inEll(pt, .9); padPts.push([pt.x, pt.z]); const s = .45 + rr() * .9; o.position.set(pt.x, .16 + i * .0006, pt.z); o.rotation.y = rr() * TAU; o.scale.set(s, 1, s); }, () => _c.setHSL(.24 + rr() * .1, .45 + rr() * .2, .28 + rr() * .14));
  pads.castShadow = false; g.add(pads);
  const fl = [];
  { // star-shaped water lily with yellow heart (vertex colours)
    const pos = [], col = [], tri = (a, b, c, k) => { pos.push(...a, ...b, ...c); for (let i = 0; i < 3; i++) col.push(...k); };
    for (const [n, R0, H, rot] of [[7, .55, .2, 0], [5, .36, .34, .4]]) for (let i = 0; i < n; i++) { const a = rot + i / n * TAU, da = PI / n; const c0 = [0, .04, 0], l = [Math.cos(a - da) * .12, .06, Math.sin(a - da) * .12], r = [Math.cos(a + da) * .12, .06, Math.sin(a + da) * .12], tp = [Math.cos(a) * R0, H, Math.sin(a) * R0]; tri(c0, r, tp, [1, 1, 1]); tri(c0, tp, l, [1, 1, 1]); tri(l, tp, r, [1, .95, .95]); }
    for (let i = 0; i < 4; i++) { const a = i / 4 * TAU, b = (i + 1) / 4 * TAU; tri([0, .2, 0], [Math.cos(b) * .1, .08, Math.sin(b) * .1], [Math.cos(a) * .1, .08, Math.sin(a) * .1], [1, .8, .1]); }
    const fg = new THREE.BufferGeometry(); fg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); fg.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); fg.computeVertexNormals();
    const fm = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .5, side: THREE.DoubleSide, emissive: 0xffd6e8, emissiveIntensity: 0 }); fm.userData.g0 = 0; fm.userData.g1 = .35; glows.push(fm);
    g.add(inst(fg, fm, 26, (i, o) => { const p = padPts[i * 2 % padPts.length]; o.position.set(p[0] + .2, .17, p[1] + .15); o.rotation.y = rr() * TAU; o.scale.setScalar(1.1 + rr() * .9); }, (i) => i % 3 ? _c.set(0xf7a8c8) : _c.set(0xffffff)));
  }
  // reeds / irises along the bank
  { const parts = [], pc = []; for (let i = 0; i < 26; i++) { const a = i / 26 * TAU + rr() * .2; if (Math.abs(Math.cos(a)) > .9) continue; const x = Math.cos(a) * RX * 1.03, z = Math.sin(a) * RZ * 1.03; for (let k = 0; k < 3; k++) { const h = 1.2 + rr() * 1.4; parts.push([G.coneLo, mtx(x + rr() * .5, h / 2, z + rr() * .5, (rr() - .5) * .3, 0, (rr() - .5) * .3, .07, h, .07)]); } pc.push([G.oct, mtx(x, 1.5 + rr() * .5, z, 0, 0, 0, .16, .24, .16)]); }
    M(mergeGeo(parts), mat(0x4f7f3a, { roughness: .9 }), 1, 1, 1, 0, 0, 0, g); M(mergeGeo(pc), mat(0x6a4fc0, { roughness: .7 }), 1, 1, 1, 0, 0, 0, g); }
  // the arched green footbridge (along X)
  const green = mat(0x3f8a52, { roughness: .6 }), L = 13.2, W = 1.2, yAt = (x) => .35 + 2.1 * (1 - (x / L) * (x / L));
  const bp = g; const N = 14, deck = [], rails = [], posts = [];
  for (let i = 0; i < N; i++) { const x0 = -L + i / N * 2 * L, x1 = -L + (i + 1) / N * 2 * L, y0 = yAt(x0), y1 = yAt(x1); deck.push([G.box, mtx((x0 + x1) / 2, (y0 + y1) / 2, 0, 0, 0, Math.atan2(y1 - y0, x1 - x0), Math.hypot(x1 - x0, y1 - y0) + .05, .22, W * 2)]); }
  M(mergeGeo(deck), mat(0x6f7a58, { roughness: .8 }), 1, 1, 1, 0, 0, 0, bp);
  for (const s of [-1, 1]) {
    const top = [], mid = [];
    for (let i = 0; i <= N; i++) { const x = -L + i / N * 2 * L, y = yAt(x); posts.push([G.box, mtx(x, y + .55, s * W, 0, 0, 0, .14, 1.1, .14)]); top.push([x, y + 1.1, s * W]); mid.push([x, y + .55, s * W]); if (i < N) for (let k = 1; k < 2; k++) { const xx = x + k / 2 * 2 * L / N; posts.push([G.box, mtx(xx, yAt(xx) + .55, s * W, 0, 0, 0, .05, 1.0, .05)]); } }
    rails.push([taperTube(top, () => .07, 28, 4)], [taperTube(mid, () => .045, 28, 3)]);
  }
  // trellis arch with wisteria
  for (const sx of [-6.5, 6.5]) for (const s of [-1, 1]) posts.push([G.box, mtx(sx, 2.6, s * (W + .15), 0, 0, 0, .2, 5.2, .2)]);
  for (const s of [-1, 1]) rails.push([taperTube([[-7.4, 5.1, s * (W + .15)], [-3, 5.7, s * (W + .15)], [3, 5.7, s * (W + .15)], [7.4, 5.1, s * (W + .15)]], () => .12, 16, 5)]);
  for (let i = 0; i < 7; i++) { const x = -6 + i * 2; posts.push([G.box, mtx(x, 5.55 - Math.abs(x) * .03, 0, 0, 0, 0, .12, .12, W * 2 + .6)]); }
  M(mergeGeo([...posts, ...rails]), green, 1, 1, 1, 0, 0, 0, bp);
  const wis = grp(g), wp = [];
  for (let i = 0; i < 30; i++) { const x = -6.8 + rr() * 13.6, z = (rr() * 2 - 1) * (W + .4), y = 5.4 - Math.abs(x) * .03, h = .6 + rr() * 1.1; wp.push([G.coneLo, mtx(x, y - h / 2, z, PI, 0, 0, .3, h, .3)]); }
  M(mergeGeo(wp), mat(0xb08ad8, { roughness: .8 }), 1, 1, 1, 0, 0, 0, wis);
  const leaf = []; for (let i = 0; i < 9; i++) leaf.push([G.oct, mtx(-7 + rr() * 14, 5.75, (rr() * 2 - 1) * (W + .3), 0, 0, 0, .9, .3, .7)]);
  M(mergeGeo(leaf), mat(0x5f9a4a, { roughness: .9 }), 1, 1, 1, 0, 0, 0, wis);
  // paper lanterns
  for (let i = 0; i < 4; i++) { const x = -4.5 + i * 3; M(G.sphLo, neon(0xffb26a, .9), .32, .42, .32, x, 4.6, 0, g).castShadow = false; const s = makeGlowSprite(0xffa050, 3.2); s.position.set(x, 4.6, 0); g.add(s); sprs.push(s); }
  mergeStatic(g);
  let wob = 0;
  function update(dt, t, ctx) {
    ctx = ctx || NOCTX; wt.offset.set(Math.sin(t * .07) * .04, t * .006 % 1); wob = Math.sin(t * .4) * .015; pads.rotation.y = wob; wis.rotation.z = Math.sin(t * .8) * .006;
    glowUpd(glows, ctx.night); sprUpd(sprs, ctx.night, t, .7);
  }
  const obs = []; for (const x of [-L, L]) for (const s of [-1, 1]) obs.push([x, s * W, .25]); for (const x of [-6.5, 6.5]) for (const s of [-1, 1]) obs.push([x, s * (W + .15), .3]);
  return { g, obs, update, height: 6.2, title: 'Water Lilies & the Japanese Bridge' };
}

// 2. Haystacks at sunset
export function buildMonetHaystacks() {
  const g = new THREE.Group(), glows = [], obs = [];
  groundDisc(g, 10.5, paintTexture('meadow', 21), 5);
  const ma = paintMat(paintTexture('haystack', 4), { rough: .95, glow: [0, .45], glowColor: 0xffc890 }), mb = paintMat(paintTexture('haystack2', 9), { rough: .95, glow: [0, .45], glowColor: 0xd8c0ff });
  glows.push(ma, mb);
  const prof = [[0, 0], [1, 0], [1.05, .2], [1.0, .44], [.92, .53], [.98, .57], [.66, .74], [.3, .9], [.06, .99], [0, 1]];
  for (const [x, z, h, m, sd] of [[-4.6, -2.6, 5.4, ma, 1], [2.6, -4.2, 4.8, mb, 2], [5.4, 2.4, 4.2, ma, 3], [-1.4, 4.0, 3.6, mb, 4]]) {
    const r = h * .42, geo = lumpy(uvScale(lathe(prof, 22), 3, 1.5), .05, 2.2, sd);
    const s = M(geo, m, r, h, r, x, 0, z, g); s.rotation.y = sd;
    obs.push([x, z, r * .95]);
  }
  // little shadows of hay tufts
  const tufts = []; const rr = prng(5); for (let i = 0; i < 24; i++) tufts.push([G.sphLo, mtx((rr() - .5) * 16, .05, (rr() - .5) * 16, 0, rr() * 3, 0, .5 + rr() * .5, .15, .3)]);
  M(mergeGeo(tufts), mat(0xd9a050, { roughness: 1 }), 1, 1, 1, 0, 0, 0, g);
  mergeStatic(g);
  return { g, obs, update(dt, t, ctx) { glowUpd(glows, (ctx || NOCTX).night); }, height: 5.4, title: 'Haystacks (Sunset)' };
}

// 3. Poppy field with the woman with a parasol
function poppyGroundTex() {
  if (TX.poppyGround) return TX.poppyGround; const S = 512, [c, x] = cnv(S, S), rr = prng(77);
  moPaint(x, S, rr, MO_PAL.meadow);
  for (let i = 0; i < 1400; i++) { const px = rr() * S, py = rr() * S; if (rr() > .35 + .6 * Math.exp(-Math.pow((px + py - S) / (S * .35), 2))) continue; x.globalAlpha = .6 + rr() * .4; x.fillStyle = rr() < .8 ? '#d8281e' : '#f05a2a'; x.beginPath(); x.ellipse(px, py, 3 + rr() * 4, 2 + rr() * 2, rr() * PI, 0, TAU); x.fill(); }
  x.globalAlpha = 1; return (TX.poppyGround = ctex(c, true));
}
export function buildMonetPoppies() {
  const g = new THREE.Group(), glows = [], rr = prng(31);
  groundDisc(g, 10.5, poppyGroundTex(), 2);
  { // instanced poppies: red cup with dark heart + stem (vertex colours)
    const pos = [], col = [], tri = (a, b, c, k) => { pos.push(...a, ...b, ...c); for (let i = 0; i < 3; i++) col.push(...k); };
    const H = .75; for (let i = 0; i < 6; i++) { const a = i / 6 * TAU, b = (i + 1) / 6 * TAU; tri([0, H, 0], [Math.cos(b) * .22, H + .14, Math.sin(b) * .22], [Math.cos(a) * .22, H + .14, Math.sin(a) * .22], i % 2 ? [.86, .1, .06] : [.95, .2, .1]); tri([0, H + .02, 0], [Math.cos(b) * .05, H + .03, Math.sin(b) * .05], [Math.cos(a) * .05, H + .03, Math.sin(a) * .05], [.06, .04, .05]); }
    tri([-.02, 0, 0], [.02, 0, 0], [0, H, 0], [.25, .45, .15]); tri([0, 0, -.02], [0, 0, .02], [0, H, 0], [.25, .45, .15]);
    const pg = new THREE.BufferGeometry(); pg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); pg.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); pg.computeVertexNormals();
    const pm = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .6, side: THREE.DoubleSide });
    var pop = inst(pg, pm, 230, (i, o) => { let x, z; for (;;) { x = (rr() * 2 - 1) * 10; z = (rr() * 2 - 1) * 10; if (x * x + z * z > 98) continue; const band = Math.exp(-Math.pow((x - z) / 7, 2)); if (rr() < .25 + .75 * band && Math.hypot(x - 1.5, z + 1) > 2.2) break; } o.position.set(x, 0, z); o.rotation.set((rr() - .5) * .3, rr() * TAU, (rr() - .5) * .3); o.scale.setScalar(.8 + rr() * .7); });
    pop.castShadow = false; g.add(pop);
  }
  // woman with parasol (~4.3 m) + child
  const fig = grp(g, 1.5, 0, -1);
  fig.rotation.y = -.5;
  const dm = paintMat(paintTexture('dress', 8), { rough: .9 }), skin = mat(0xf0d0b4, { roughness: .7 }), dark = mat(0x2a2a3a, { roughness: .8 });
  M(lumpy(lathe([[0, 0], [1.25, 0], [1.15, .4], [.9, 1.1], [.6, 1.8], [.36, 2.3], [0, 2.32]], 18), .04, 3, 2), dm, 1, 1, 1, 0, 0, 0, fig);
  M(lathe([[0, 0], [.38, 0], [.42, .4], [.36, .8], [.18, .95], [0, 1]], 14), dm, 1, 1, .8, 0, 2.28, 0, fig);
  M(G.cyl, skin, .1, .25, .1, 0, 3.3, 0, fig); M(G.sph, skin, .26, .32, .28, 0, 3.6, .02, fig);
  M(G.disc, mat(0x2a2a3a, { roughness: .8 }), .55, .05, .55, 0, 3.86, 0, fig); M(G.cyl, dark, .26, .22, .26, 0, 3.97, 0, fig);
  M(G.sphLo, mat(0xc8402a), .1, .08, .1, .2, 3.95, .2, fig);
  const veil = grp(fig, -.2, 3.9, -.1); M(new THREE.PlaneGeometry(1.6, .5, 4, 1).translate(-.8, -.2, 0), mat(0x8fb0d0, { roughness: .9, side: THREE.DoubleSide }), 1, 1, 1, 0, 0, 0, veil).castShadow = false; keep(veil.children[0]);
  // arm + parasol
  const arm = grp(fig, .32, 3.15, .1); M(G.cyl, dm, .08, .7, .08, 0, .3, 0, arm); arm.rotation.z = -.5; arm.rotation.x = -.2;
  const par = grp(fig, .7, 3.6, .3); par.rotation.z = -.35; par.rotation.x = -.25;
  M(G.cylLo, mat(0x3a2a1a), .03, 2.0, .03, 0, .6, 0, par);
  M(new THREE.ConeGeometry(1.7, .75, 18, 1, true), paintMat(paintTexture('parasol', 2), { rough: .8, side: THREE.DoubleSide }), 1, 1, 1, 0, 1.55, 0, par);
  // child in front
  const ch = grp(g, 3.2, 0, .6); ch.rotation.y = -.3;
  M(lathe([[0, 0], [.42, 0], [.36, .5], [.2, 1.0], [0, 1.05]], 12), mat(0xf2ece0, { roughness: .9 }), 1, 1, 1, 0, 0, 0, ch);
  M(G.sph, skin, .16, .19, .17, 0, 1.2, 0, ch); M(G.disc, mat(0xd8281e, { roughness: .8 }), .32, .04, .32, 0, 1.35, 0, ch);
  mergeStatic(g);
  function update(dt, t, ctx) { veil.rotation.y = .4 + .25 * Math.sin(t * 1.7); veil.rotation.x = .15 * Math.sin(t * 2.3); par.rotation.y = .08 * Math.sin(t * .6); pop.rotation.y = .004 * Math.sin(t * .9); }
  return { g, obs: [[1.5, -1, 1.15], [3.2, .6, .4]], update, height: 5.2, title: 'Poppy Field (Argenteuil)' };
}

// 4. Giant easel with "Impression, Sunrise"
function impressionTex() {
  if (TX.impression) return TX.impression; const W = 512, H = 360, [c, x] = cnv(W, H), rr = prng(1872);
  const gr = x.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, '#8aa6ac'); gr.addColorStop(.35, '#b8a8a0'); gr.addColorStop(.5, '#7f9aa4'); gr.addColorStop(1, '#3f5a70'); x.fillStyle = gr; x.fillRect(0, 0, W, H);
  const dab = (px, py, w, h, col, a, ang = 0) => { x.globalAlpha = a; x.fillStyle = col; x.beginPath(); x.ellipse(px, py, w, h, ang, 0, TAU); x.fill(); };
  for (let i = 0; i < 2600; i++) { const py = rr() * H, warm = Math.exp(-Math.pow((py - H * .33) / 50, 2)); dab(rr() * W, py, 5 + rr() * 9, 1.5 + rr() * 2.5, rr() < warm * .5 ? ['#e8a088', '#f0b890', '#d89a9a'][i % 3] : ['#6f8fa0', '#8aa8b0', '#4f6f86', '#9ab0b8', '#5a7890', '#a0b8b8'][i % 6], .4 + rr() * .4, (rr() - .5) * .3); }
  // misty cranes & masts
  x.globalAlpha = .35; x.strokeStyle = '#3f5468'; x.lineCap = 'round';
  for (let i = 0; i < 14; i++) { const px = 30 + rr() * 260, w = 2 + rr() * 3; x.lineWidth = w; x.beginPath(); x.moveTo(px, H * .52); x.lineTo(px + rr() * 6 - 3, H * (.12 + rr() * .25)); x.stroke(); }
  x.fillStyle = '#4a5f72'; x.fillRect(0, H * .45, W * .45, H * .08);
  // the sun & its broken reflection
  x.globalAlpha = 1; const sx = W * .56, sy = H * .36; const sg = x.createRadialGradient(sx, sy, 2, sx, sy, 60); sg.addColorStop(0, 'rgba(255,140,60,.55)'); sg.addColorStop(1, 'rgba(255,140,60,0)'); x.fillStyle = sg; x.fillRect(sx - 60, sy - 60, 120, 120);
  x.fillStyle = '#ff5a1e'; x.beginPath(); x.arc(sx, sy, 17, 0, TAU); x.fill();
  for (let i = 0; i < 9; i++) { const py = H * .5 + i * 16 + rr() * 6, w = 26 - i * 1.6 + rr() * 6; dab(sx + (rr() - .5) * 10, py, w, 3.2, i % 2 ? '#ff6a28' : '#ff8a3a', .95, (rr() - .5) * .1); }
  // boats
  for (const [bx, by, s] of [[W * .3, H * .72, 1.3], [W * .52, H * .64, .9], [W * .7, H * .58, .6]]) {
    x.globalAlpha = .92; x.fillStyle = '#1f2a3a'; x.beginPath(); x.moveTo(bx - 34 * s, by); x.quadraticCurveTo(bx, by + 12 * s, bx + 34 * s, by - 3 * s); x.lineTo(bx + 26 * s, by + 4 * s); x.quadraticCurveTo(bx, by + 14 * s, bx - 30 * s, by + 4 * s); x.fill();
    x.fillRect(bx - 4 * s, by - 18 * s, 7 * s, 16 * s); x.beginPath(); x.arc(bx, by - 20 * s, 4 * s, 0, TAU); x.fill();
  }
  x.globalAlpha = 1; x.fillStyle = '#2a3a50'; x.font = 'italic 14px Georgia, serif'; x.fillText('Claude Monet 72', W - 130, H - 14);
  return (TX.impression = ctex(c));
}
export function buildMonetEasel() {
  const g = new THREE.Group(), glows = [], sprs = [];
  const wood = mat(0x8a6038, { roughness: .75 }), parts = [];
  const leg = (a, b, r) => parts.push([G.box, segMtx(V3(a), V3(b), 1).multiply(new THREE.Matrix4().makeScale(r, 1, r))]);
  leg([-2.4, 0, .9], [-.5, 8.2, .1], .28); leg([2.4, 0, .9], [.5, 8.2, .1], .28); leg([0, 0, -2.8], [0, 7.9, -.15], .26);
  parts.push([G.box, mtx(0, 2.35, .62, 0, 0, 0, 6.6, .22, .7)], [G.box, mtx(0, 7.0, .35, 0, 0, 0, 2.2, .3, .3)], [G.box, mtx(0, 1.0, .5, 0, 0, 0, 4.4, .16, .16)]);
  M(mergeGeo(parts), wood, 1, 1, 1, 0, 0, 0, g);
  const cw = 6.4, chh = 4.5, cg = grp(g, 0, 2.5 + chh / 2, .6); cg.rotation.x = -.07;
  M(G.box, mat(0xe8dcc0, { roughness: .9 }), cw, chh, .16, 0, 0, 0, cg);
  const cm = paintMat(impressionTex(), { rough: .85, glow: [.04, 1.0] }); glows.push(cm);
  M(G.plane, cm, cw - .1, chh - .1, 1, 0, 0, .085, cg).castShadow = false;
  const fr = mat(0xc9962f, { roughness: .35, metalness: .55 });
  for (const [x, y, w, h] of [[0, chh / 2, cw + .3, .18], [0, -chh / 2, cw + .3, .18], [cw / 2, 0, .18, chh + .3], [-cw / 2, 0, .18, chh + .3]]) M(G.box, fr, w, h, .26, x, y, .05, cg);
  const sun = makeGlowSprite(0xff7a30, 3.5); sun.position.set(cw * .06, chh * .14, .4); cg.add(sun); sprs.push(sun);
  // palette & giant brushes leaning on the easel
  const pal = grp(g, -3.2, 1.1, 1.6); pal.rotation.set(-1.1, .3, .2);
  M(slab([...ell(0, 0, 1.4, 1.0, 16)], .08), mat(0xb88a50, { roughness: .6 }), 1, 1, 1, 0, 0, 0, pal);
  const dabs = ['#ff5a1e', '#2a56b5', '#f2d27a', '#f4efe4', '#6f9a5a', '#c8a2c8']; dabs.forEach((c, i) => { const a = .6 + i * .55; M(G.sphLo, mat(new THREE.Color(c).getHex(), { roughness: .4 }), .2, .2, .1, Math.cos(a) * .95, Math.sin(a) * .65, .08, pal); });
  for (const [x, z, rz, c] of [[3.0, 1.5, -.35, 0xff5a1e], [3.4, 1.2, -.22, 0x2a56b5]]) { const b = grp(g, x, 0, z); b.rotation.z = rz; M(G.cyl, mat(0x3a2a1e, { roughness: .5 }), .09, 3.6, .09, 0, 1.8, 0, b); M(G.cyl, mat(0xbfbfbf, { metalness: .7, roughness: .3 }), .11, .4, .11, 0, 3.8, 0, b); M(G.cone, mat(c, { roughness: .5 }), .14, .6, .14, 0, 4.3, 0, b).rotation.x = PI; }
  mergeStatic(g);
  return { g, obs: [[-2.4, .9, .3], [2.4, .9, .3], [0, -2.8, .3]], update(dt, t, ctx) { ctx = ctx || NOCTX; glowUpd(glows, ctx.night); sprUpd(sprs, ctx.night, t, .8); }, height: 8.3, title: 'Impression, Sunrise (Easel)' };
}

// ============================================================ VAN GOGH
// transparent stroke textures: 'swirl' (spiral of strokes for rotating sky rings) / 'halo' (concentric star halo)
function strokeRingTex(kind) {
  const key = 'ring|' + kind; if (TX[key]) return TX[key]; const S = 512, [c, x] = cnv(S, S), rr = prng(kind.length * 17); x.lineCap = 'round';
  const pal = kind === 'halo' ? ['#fff3a0', '#f6d23a', '#ffffff', '#e8b52a', '#cfe8ff'] : ['#cfe3f0', '#a9c6e8', '#ffffff', '#f7e27a', '#6f9ad8', '#e8f2ff'];
  const n = kind === 'halo' ? 900 : 1500;
  for (let i = 0; i < n; i++) {
    const r = S * (.12 + .37 * Math.sqrt(rr())), a0 = rr() * TAU + (kind === 'swirl' ? r / S * 7 : 0), len = (.08 + rr() * .15) * (kind === 'halo' ? .6 : 1);
    x.strokeStyle = pal[Math.floor(rr() * pal.length)]; x.globalAlpha = .55 + rr() * .45; x.lineWidth = 3 + rr() * 6; x.beginPath();
    for (let k = 0; k <= 5; k++) { const a = a0 + k / 5 * len * TAU / 3, rk = r * (1 - (kind === 'swirl' ? k * .012 : 0)); const px = S / 2 + Math.cos(a) * rk, py = S / 2 + Math.sin(a) * rk; k ? x.lineTo(px, py) : x.moveTo(px, py); }
    x.stroke();
  }
  x.globalAlpha = 1; return (TX[key] = ctex(c));
}
// flame-shaped twisted cypress (uv-mapped for the cypress stroke texture)
function cypressGeo(h, r, seed) {
  const rr = prng(seed), prof = [], ph = rr() * TAU, tw = 1.6 + rr() * 1.2;
  for (let i = 0; i <= 26; i++) { const t = i / 26; prof.push([Math.max(.02, r * Math.pow(Math.sin(PI * Math.min(1, (t + .06) / 1.06)), .5) * (1 - .62 * t) * (t < .05 ? .5 : 1)), t * h]); }
  prof[26][0] = 0;
  const geo = uvScale(lathe(prof, 14), 3, 4), p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i), y = p.getY(i), z = p.getZ(i); const t = y / h, a = Math.atan2(x, z), rad = Math.hypot(x, z) * (1 + .2 * Math.sin(a * 4 + t * 16 + ph) * Math.min(1, t * 3));
    const aa = a + t * tw; x = Math.sin(aa) * rad + Math.sin(t * PI * 2.4 + ph) * r * .3 * t; z = Math.cos(aa) * rad + Math.cos(t * PI * 1.7 + ph) * r * .15 * t;
    p.setXYZ(i, x, y, z);
  }
  geo.computeVertexNormals(); return geo;
}
// 5. Starry Night
export function buildStarryNight() {
  const g = new THREE.Group(), glows = [], sprs = [], spin = [], stars = [];
  const DR = 7.6, DY = 8.6, DX = 2.2;
  const sky = paintMat(paintTexture('vangogh', 1889), { rough: .7, glow: [.03, .7] }); glows.push(sky);
  const disc = grp(g, DX, DY, -1.2);
  M(new THREE.CircleGeometry(DR, 48), sky, 1, 1, 1, 0, 0, .21, disc).castShadow = false;
  M(new THREE.CircleGeometry(DR, 48).rotateY(PI), sky, 1, 1, 1, 0, 0, -.21, disc);
  M(G.disc, mat(0x16245a, { roughness: .6 }), DR + .05, .4, DR + .05, 0, 0, 0, disc).rotation.x = PI / 2;
  M(G.torus, mat(0xd9a63a, { roughness: .35, metalness: .5 }), DR + .1, DR + .1, 2.2, 0, 0, 0, disc);
  // rotating stroke rings (the great swirls)
  const swM = new THREE.MeshStandardMaterial({ map: strokeRingTex('swirl'), transparent: true, depthWrite: false, roughness: .7, emissive: 0xbfd8ff, emissiveMap: strokeRingTex('swirl'), emissiveIntensity: .05 }); swM.userData.g0 = .05; swM.userData.g1 = .9; glows.push(swM);
  for (const [x, y, r0, r1, sp] of [[-1.2, 1.2, .5, 3.4, .25], [3.0, 3.6, .3, 1.7, -.4], [-4.4, -1.6, .3, 1.5, .35], [1.8, -2.2, .6, 2.2, -.2]]) {
    const rg = grp(disc, x, y, .3 + spin.length * .04); const m = M(new THREE.RingGeometry(r0, r1, 40, 1), swM, 1, 1, 1, 0, 0, 0, rg); m.castShadow = false; m.renderOrder = 2;
    spin.push({ o: rg, sp });
  }
  { // glowing spiral at the heart of the big swirl
    const pts = []; for (let i = 0; i <= 40; i++) { const t = i / 40, a = t * TAU * 2.2, r = .3 + t * 2.9; pts.push([Math.cos(a) * r, Math.sin(a) * r * .8, .05 * t]); }
    M(taperTube(pts, lin(.06, .2), 60, 4), neon(0xcfe6ff, .55), 1, 1, 1, 0, 0, 0, spin[0].o).castShadow = false;
  }
  // stars with stroke halos
  const halo = new THREE.MeshStandardMaterial({ map: strokeRingTex('halo'), transparent: true, depthWrite: false, roughness: .6, emissive: 0xffe680, emissiveMap: strokeRingTex('halo'), emissiveIntensity: .2 }); halo.userData.g0 = .2; halo.userData.g1 = 1.4; glows.push(halo);
  const starM = neon(0xffe36a, 1.3);
  for (const [x, y, s] of [[-5.6, 3.4, .55], [-3.4, 5.4, .45], [-.6, 5.9, .5], [1.6, 6.4, .35], [5.2, 1.6, .5], [-6.6, -.4, .4], [4.4, -3.6, .45], [-2.4, -4.8, .35], [.4, 2.8, .32], [6.4, -1.4, .3], [-4.2, 1.2, .3]]) {
    const sg = grp(disc, x, y, .5); M(G.sphLo, starM, s, s, s * .6, x, y, .5, disc).castShadow = false;
    const h = M(G.circ, halo, s * 2.6, s * 2.6, 1, 0, 0, -.12, sg); h.castShadow = false; h.renderOrder = 3; keep(h);
    const sp = makeGlowSprite(0xffe68a, s * 6); sg.add(sp); sprs.push(sp); stars.push({ h, s, ph: x * 1.7 + y });
  }
  // crescent moon
  const cres = []; for (let i = 0; i <= 16; i++) { const a = PI / 2 + i / 16 * PI; cres.push([Math.cos(a) * 1.4, Math.sin(a) * 1.4]); } for (let i = 16; i >= 0; i--) { const a = PI / 2 + i / 16 * PI; cres.push([Math.cos(a) * .55, Math.sin(a) * 1.4 * .97]); }
  const moon = grp(disc, 5.1, 4.2, .55); moon.rotation.z = PI + .5; M(slab(cres, .5), neon(0xffc83a, 1.4), 1, 1, 1, 0, 0, 0, moon).castShadow = false;
  const mh = M(G.circ, halo, 2.6, 2.6, 1, -.3, 0, -.3, moon); mh.castShadow = false; mh.renderOrder = 3;
  const msp = makeGlowSprite(0xffd060, 7); moon.add(msp); sprs.push(msp);
  // supports
  const steel = mat(0x1c2440, { roughness: .6 }), parts = [];
  for (const s of [-1, 1]) parts.push([G.box, segMtx(V3([DX + s * 3.2, 0, -3.2]), V3([DX + s * 2.4, DY - 1, -1.6]), 1).multiply(new THREE.Matrix4().makeScale(.35, 1, .35))]);
  parts.push([G.box, mtx(DX, .45, -1.2, 0, 0, 0, 7, .9, 1.6)]);
  M(mergeGeo(parts), steel, 1, 1, 1, 0, 0, 0, g);
  // the sleeping village
  const vh = [], win = [], vw = mat(0x2a3a72, { roughness: .8 }), vr = mat(0x18224a, { roughness: .8 }), rp = [], rr = prng(42);
  for (let i = 0; i < 9; i++) { const x = -3 + i * 1.25 + rr() * .4, z = 1.6 + rr() * 1.6, w = .9 + rr() * .7, h = .9 + rr() * 1.1; vh.push([G.box, mtx(x, h / 2, z, 0, 0, 0, w, h, .9)]); rp.push([G.box, mtx(x, h, z, PI / 4, 0, 0, w + .1, .62, .62)]); win.push([G.box, mtx(x - w * .2, h * .55, z + .46, 0, 0, 0, .2, .26, .04)]); if (rr() < .6) win.push([G.box, mtx(x + w * .22, h * .55, z + .46, 0, 0, 0, .2, .26, .04)]); }
  vh.push([G.box, mtx(1.4, 1.4, 3.6, 0, 0, 0, 1.0, 2.8, 1.6)]); rp.push([G.coneLo, mtx(1.4, 4.6, 3.6, 0, 0, 0, .45, 3.6, .45)]);
  M(mergeGeo(vh), vw, 1, 1, 1, 0, 0, 0, g); M(mergeGeo(rp), vr, 1, 1, 1, 0, 0, 0, g); M(mergeGeo(win), neon(0xffc860, 1), 1, 1, 1, 0, 0, 0, g).castShadow = false;
  // flame cypress
  const cyp = grp(g, -5.6, 0, 1.4);
  const cm = paintMat(paintTexture('cypress', 7), { rough: .85 });
  M(cypressGeo(16.5, 2.3, 3), cm, 1, 1, 1, 0, 0, 0, cyp);
  mergeStatic(g);
  function update(dt, t, ctx) {
    ctx = ctx || NOCTX; const n = ctx.night;
    for (const s of spin) s.o.rotation.z += s.sp * dt;
    for (let i = 0; i < stars.length; i++) { const s = stars[i], k = 1 + (.06 + .2 * n) * Math.sin(t * 2.2 + s.ph); s.h.scale.set(s.s * 2.6 * k, s.s * 2.6 * k, 1); s.h.rotation.z = t * .15 + s.ph; }
    cyp.rotation.z = .015 * Math.sin(t * .7); cyp.rotation.x = .01 * Math.sin(t * .53);
    glowUpd(glows, n); sprUpd(sprs, n, t, .6);
  }
  update(0, 0, NOCTX);
  return { g, obs: [[DX - 3.2, -3.2, .4], [DX + 3.2, -3.2, .4], [DX - 2.5, -1.2, 1], [DX, -1.2, 1], [DX + 2.5, -1.2, 1], [-5.6, 1.4, 1.2], [1.4, 3.6, .9]], update, height: 16.5, title: 'The Starry Night' };
}

// 6. Sunflowers in a vase
function vaseTex() {
  if (TX.vase) return TX.vase; const S = 512, [c, x] = cnv(S, S), rr = prng(1888); vgPaint(x, S, rr, VG_PAL.vase);
  x.globalAlpha = .75; x.fillStyle = '#c8862a'; x.fillRect(0, S * .56, S, S * .44); x.globalAlpha = 1;
  x.lineCap = 'round'; for (let i = 0; i < 600; i++) { const px = rr() * S, py = S * (.58 + rr() * .42); x.strokeStyle = ['#d8962e', '#b8741e', '#e8b04a'][i % 3]; x.lineWidth = 3 + rr() * 3; x.beginPath(); x.moveTo(px, py); x.lineTo(px + 10 + rr() * 8, py + rr() * 4 - 2); x.stroke(); }
  x.fillStyle = '#2a56b5'; x.fillRect(0, S * .545, S, S * .03);
  x.font = 'italic bold 46px Georgia, serif'; x.textAlign = 'center'; x.fillText('Vincent', S / 2, S * .72);
  return (TX.vase = ctex(c));
}
let _petalGeo = null;
function petalRingGeo() {
  if (_petalGeo) return _petalGeo; const sh = [[0, 0], [.13, .25], [.11, .7], [0, 1], [-.11, .7], [-.13, .25]], base = new THREE.ShapeGeometry(new THREE.Shape(sh.map(p => new THREE.Vector2(p[0], p[1]))));
  const out = [];
  for (const [n, rc, len, tilt, ph] of [[15, .55, .75, -.35, 0], [11, .5, .55, -.6, .2]]) for (let i = 0; i < n; i++) { const a = i / n * TAU + ph, m = new THREE.Matrix4().makeRotationZ(a).multiply(new THREE.Matrix4().makeRotationX(tilt)).multiply(new THREE.Matrix4().makeScale(1.2, len, 1)); m.setPosition(-Math.sin(a) * rc, Math.cos(a) * rc, -.04); out.push([setVC(base.clone(), rc > .52 ? 0xf2b21e : 0xe07a18), m]); }
  return (_petalGeo = mergeGeo(out));
}
export function buildSunflowers() {
  const g = new THREE.Group(), glows = [], heads = [], rr = prng(1889);
  // painted backdrop: yellow wall + ochre table + blue line
  const bg = paintMat(paintTexture('sunbg', 3), { rough: .9, glow: [0, .45] }); glows.push(bg);
  M(G.box, mat(0x8a6a2a, { roughness: .8 }), 10.4, 10.2, .4, 0, 5.1, -2.2, g);
  M(G.plane, bg, 10, 9.8, 1, 0, 5.1, -1.98, g).castShadow = false; M(G.plane, bg, 10, 9.8, 1, 0, 5.1, -2.42, g).rotation.y = PI;
  M(G.box, mat(0xd99a3a, { roughness: .8 }), 7, 1.4, 3, 0, .7, 0, g);
  M(G.box, mat(0x2a56b5, { roughness: .6 }), 7.05, .14, 3.05, 0, 1.4, 0, g);
  const vase = M(uvScale(lathe([[0, 0], [.95, 0], [1.3, .6], [1.4, 1.2], [1.2, 1.9], [.82, 2.5], [.76, 2.9], [.88, 3.2], [.72, 3.2], [0, 3.1]], 22), 1, 1), paintMat(vaseTex(), { rough: .55 }), 1, 1, 1, 0, 1.47, 0, g); vase.rotation.y = PI;
  const topY = 1.47 + 3.1;
  const petM = mat(0xffffff, { roughness: .7, side: THREE.DoubleSide, vertexColors: true });
  const seed = paintMat(paintTexture('seeds', 5), { rough: .9, glow: [0, .8], glowColor: 0xffb040 }); glows.push(seed);
  const stems = [], leaves = [];
  const spots = [[0, 8.8, .3, 1.25], [-2.1, 7.6, .4, 1.15], [2.2, 7.9, .2, 1.2], [-3.3, 5.9, .7, 1.0], [3.4, 6.2, .5, 1.05], [-1.1, 6.4, 1.3, .9], [1.2, 6.8, 1.2, .95], [-.2, 5.5, 1.7, .85], [2.6, 5.0, 1.4, .8], [-2.5, 4.9, 1.5, .8], [.9, 9.6, -.5, .95]];
  for (const [x, y, z, s] of spots) {
    const tip = V3([x, y, z]); stems.push([taperTube([[x * .12, topY - .3, z * .1], [x * .45, topY + (y - topY) * .55, z * .5 + .1], tip], lin(.11, .07), 8, 4)]);
    const h = grp(g, x, y, z); h.scale.setScalar(s); h.lookAt(x * 2.2, y + (y - 6) * .5 - 1.5, z + 6); h.userData.rest = h.quaternion.clone();
    M(petalRingGeo(), petM, 1, 1, 1, 0, 0, 0, h);
    M(G.cyl, seed, .62, .28, .62, 0, 0, .08, h).rotation.x = PI / 2; M(G.coneLo, mat(0x4f6a2a, { roughness: .8 }), .5, .5, .5, 0, 0, -.25, h).rotation.x = -PI / 2;
    heads.push(h);
    leaves.push([G.oct, mtx(x * .6, topY + (y - topY) * .35, z * .4 + .3, .4, x * .3, x > 0 ? -.9 : .9, .16, .7, .4)]);
  }
  M(mergeGeo(stems), mat(0x5f7a2a, { roughness: .8 }), 1, 1, 1, 0, 0, 0, g); M(mergeGeo(leaves), mat(0x4f7a2a, { roughness: .8 }), 1, 1, 1, 0, 0, 0, g);
  // a couple of fallen flowers on the table
  for (const [x, z] of [[-2.6, .9], [2.8, .6]]) { const h = grp(g, x, 1.5, z); h.rotation.x = -PI / 2.3; h.scale.setScalar(.7); M(petalRingGeo(), petM, 1, 1, 1, 0, 0, 0, h); M(G.disc, seed, .62, .28, .62, 0, 0, .08, h).rotation.x = PI / 2; }
  mergeStatic(g);
  function update(dt, t, ctx) {
    ctx = ctx || NOCTX; const k = Math.min(1, dt * .9);
    for (let i = 0; i < heads.length; i++) {
      const h = heads[i]; _q1.copy(h.quaternion);
      if (ctx.playerPos) { h.lookAt(ctx.playerPos); _q2.copy(h.userData.rest).slerp(h.quaternion, .7); } else _q2.copy(h.userData.rest);
      h.quaternion.copy(_q1).slerp(_q2, k); h.rotateZ(.0015 * Math.sin(t * .8 + i));
    }
    glowUpd(glows, ctx.night);
  }
  return { g, obs: [[-2.4, 0, 1.5], [0, 0, 1.6], [2.4, 0, 1.5], [-4.2, -2.2, .7], [-1.4, -2.2, .7], [1.4, -2.2, .7], [4.2, -2.2, .7]], update, height: 10.2, title: 'Sunflowers' };
}

// 7. Café Terrace at Night
export function buildCafeTerrace() {
  const g = new THREE.Group(), glows = [], sprs = [], seats = [];
  const floor = paintMat(paintTexture('cobble', 4), { rough: .9, glow: [0, .5], glowColor: 0xffc070 }); glows.push(floor);
  M(uvScale(new THREE.PlaneGeometry(12, 9).rotateX(-PI / 2), 2.4, 1.8), floor, 1, 1, 1, 0, .03, .5, g).castShadow = false;
  const wallM = paintMat(paintTexture('cafewall', 6), { rough: .85, glow: [.02, .9], glowColor: 0xffd080 }); glows.push(wallM);
  const upM = paintMat(paintTexture('coat', 15), { rough: .85 });
  M(G.box, mat(0x3a3a5a, { roughness: .8 }), 12, 8, .6, 0, 4, -3.8, g);
  M(uvScale(new THREE.PlaneGeometry(11.9, 3.9), 2, .7), wallM, 1, 1, 1, 0, 1.95, -3.49, g).castShadow = false;
  M(uvScale(new THREE.PlaneGeometry(11.9, 4.0), 2, .7), upM, 1, 1, 1, 0, 6.0, -3.49, g).castShadow = false;
  // windows & door
  const shut = [], winLit = [];
  for (let i = 0; i < 4; i++) { const x = -4.4 + i * 2.9; winLit.push([G.box, mtx(x, 6.2, -3.47, 0, 0, 0, 1.0, 1.6, .05)]); shut.push([G.box, mtx(x - .75, 6.2, -3.45, 0, 0, 0, .45, 1.7, .08)], [G.box, mtx(x + .75, 6.2, -3.45, 0, 0, 0, .45, 1.7, .08)]); }
  for (const x of [-3.6, 3.6]) winLit.push([G.box, mtx(x, 1.6, -3.47, 0, 0, 0, 2.0, 2.2, .05)]);
  M(mergeGeo(shut), mat(0x3f7a5a, { roughness: .7 }), 1, 1, 1, 0, 0, 0, g); M(mergeGeo(winLit), neon(0xffb24a, .8), 1, 1, 1, 0, 0, 0, g).castShadow = false;
  M(G.box, mat(0x3a2414, { roughness: .7 }), 1.6, 2.8, .1, 0, 1.4, -3.45, g);
  // awning
  const aw = grp(g, 0, 3.95, -3.5); aw.rotation.x = .3;
  M(G.box, neon(0xf0b030, .3), 11, .16, 4.2, 0, 0, 2.1, aw);
  M(G.plane, neon(0xffc23a, .75), 10.9, 4.1, 1, 0, -.09, 2.1, aw).rotation.x = PI / 2;
  M(G.box, mat(0xe89a20, { roughness: .6 }), 11, .7, .08, 0, -.32, 4.2, aw); M(G.box, neon(0xfff0a0, .9), 11, .07, .1, 0, -.68, 4.22, aw).castShadow = false;
  const frontY = 3.95 - Math.sin(.3) * 4.2, frontZ = -3.5 + Math.cos(.3) * 4.2;
  const pole = mat(0x2a2a2a, { roughness: .5 });
  for (const x of [-5.3, 5.3]) M(G.cylLo, pole, .07, frontY, .07, x, frontY / 2, frontZ, g);
  const lamp = grp(g, 3.2, frontY - .1, frontZ - 1); M(G.cylLo, pole, .02, .5, .02, 0, -.2, 0, lamp); M(G.sphLo, neon(0xfff0a0, 1.6), .28, .36, .28, 0, -.6, 0, lamp).castShadow = false;
  for (const [x, z, s] of [[0, -1.2, 9], [3.2, frontZ - 1.6, 4], [-3.2, -1.4, 6]]) { const sp = makeGlowSprite(0xffc060, s); sp.position.set(x, 2.4, z); g.add(sp); sprs.push(sp); }
  // tables & chairs
  const marble = mat(0xece6d6, { roughness: .4 }), chairM = mat(0x5a3a1e, { roughness: .7 }), tp = [], cp = [], obs = [];
  for (const [tx, tz] of [[-3.6, -1.6], [0, -1.0], [3.6, -1.6], [-2.2, 1.6], [2.0, 1.8], [-4.8, 2.6]]) {
    tp.push([G.cyl, mtx(tx, .95, tz, 0, 0, 0, .6, .06, .6)], [G.cylLo, mtx(tx, .48, tz, 0, 0, 0, .06, .95, .06)], [G.cylLo, mtx(tx, .03, tz, 0, 0, 0, .3, .06, .3)]);
    obs.push([tx, tz, .45]);
    for (let k = 0; k < 3; k++) {
      const a = k / 3 * TAU + tx, cx = tx + Math.sin(a) * 1.0, cz = tz + Math.cos(a) * 1.0, ry = a + PI; seats.push([cx, cz, ry]);
      const ch = new THREE.Matrix4().makeRotationY(ry).setPosition(cx, 0, cz);
      for (const m of [mtx(0, .5, 0, 0, 0, 0, .48, .06, .48), mtx(0, .85, -.22, 0, 0, 0, .48, .66, .05), mtx(-.2, .25, .2, 0, 0, 0, .05, .5, .05), mtx(.2, .25, .2, 0, 0, 0, .05, .5, .05), mtx(-.2, .55, -.22, 0, 0, 0, .05, 1.1, .05), mtx(.2, .55, -.22, 0, 0, 0, .05, 1.1, .05)]) cp.push([G.box, ch.clone().multiply(m)]);
    }
  }
  M(mergeGeo(tp), marble, 1, 1, 1, 0, 0, 0, g); M(mergeGeo(cp), chairM, 1, 1, 1, 0, 0, 0, g);
  for (let x = -5.4; x <= 5.5; x += 1.35) obs.push([x, -3.8, .75]);
  obs.push([-5.3, frontZ, .15], [5.3, frontZ, .15]);
  mergeStatic(g);
  function update(dt, t, ctx) { ctx = ctx || NOCTX; glowUpd(glows, ctx.night); sprUpd(sprs, ctx.night, t, .55); lamp.rotation.z = .04 * Math.sin(t * 1.3); }
  return { g, obs, update, height: 8, title: 'Café Terrace at Night', seats };
}

// 8. Cypress grove
export function buildCypresses() {
  const g = new THREE.Group(), trees = [], obs = [];
  groundDisc(g, 6.5, paintTexture('wheat', 8), 3);
  const cm = paintMat(paintTexture('cypress', 11), { rough: .85 });
  for (const [x, z, h, r, sd] of [[-2.6, .4, 9.6, 1.5, 1], [1.6, -1.8, 10.4, 1.7, 2], [3.4, 2.0, 6.6, 1.1, 3], [-.4, 3.4, 7.4, 1.2, 4], [-4.2, -2.6, 6.2, 1.0, 5]]) {
    const tg = grp(g, x, 0, z); M(cypressGeo(h, r, sd), cm, 1, 1, 1, 0, 0, 0, tg); trees.push({ tg, ph: sd * 1.3, k: 1 / h }); obs.push([x, z, r * .6]);
  }
  mergeStatic(g);
  function update(dt, t) { for (const s of trees) { s.tg.rotation.z = .025 * Math.sin(t * .8 + s.ph); s.tg.rotation.x = .018 * Math.sin(t * .63 + s.ph * 2); } }
  return { g, obs, update, height: 10.4, title: 'Cypresses' };
}

// 9. Self-portrait bust (bandaged ear, straw hat)
export function buildVanGoghBust() {
  const g = new THREE.Group(), glows = [];
  const panel = paintMat(paintTexture('swirlbg', 1889), { rough: .85, glow: [0, .55] }); glows.push(panel);
  M(G.box, mat(0x2a3a4a, { roughness: .8 }), 7.4, 8.6, .4, 0, 4.3, -2.4, g);
  M(G.plane, panel, 7.1, 8.3, 1, 0, 4.3, -2.18, g).castShadow = false; M(G.plane, panel, 7.1, 8.3, 1, 0, 4.3, -2.62, g).rotation.y = PI;
  M(G.box, mat(0x3a3028, { roughness: .8 }), 4.2, 1, 3, 0, .5, 0, g);
  const coat = paintMat(paintTexture('coat', 21), { rough: .85 }), skin = paintMat(paintTexture('skin', 3), { rough: .7 }), beard = paintMat(paintTexture('beard', 4), { rough: .9 }), straw = paintMat(paintTexture('straw', 5), { rough: .9 });
  M(uvScale(lathe([[0, 0], [2.4, 0], [2.45, .9], [2.3, 1.6], [1.75, 2.1], [.8, 2.4], [0, 2.45]], 20), 2, 1), coat, 1, 1, .55, 0, 1, 0, g);
  // lapels
  for (const s of [-1, 1]) M(slab([[0, 0], [s * .9, .4], [s * .55, 2.2], [s * .15, 2.6]], .12), coat, 1, 1, 1, s * .1, 1.2, 1.32, g).rotation.x = -.35;
  M(G.cyl, skin, .55, 1.0, .5, 0, 4.0, 0, g);
  const hd = grp(g, 0, 5.0, .15); hd.rotation.y = -.25;
  M(G.sph, skin, .95, 1.22, 1.0, 0, 0, 0, hd);
  const bd = M(G.hemi, beard, 1.0, .95, 1.06, 0, -.05, .04, hd); bd.rotation.x = PI;
  M(G.sph, beard, .6, .3, .3, 0, -.32, .78, hd);
  M(G.hemi, beard, .99, .75, 1.03, 0, .3, -.05, hd);
  // face
  const dark = mat(0x2a1a10, { roughness: .6 }), white = mat(0xf2ead8, { roughness: .5 });
  for (const s of [-1, 1]) {
    M(G.sphLo, white, .2, .13, .1, s * .36, .25, .86, hd); M(G.sphLo, mat(0x3f7a6a, { roughness: .3 }), .1, .1, .06, s * .36, .25, .93, hd); M(G.sphLo, dark, .05, .05, .03, s * .36, .25, .98, hd);
    M(G.box, mat(0xb8501a, { roughness: .8 }), .44, .09, .1, s * .37, .45, .88, hd).rotation.z = s * .12;
  }
  const nose = M(G.coneLo, skin, .16, .55, .2, 0, .02, 1.0, hd); nose.rotation.x = .25;
  M(G.box, mat(0x8a2a1a, { roughness: .6 }), .3, .06, .08, 0, -.42, .98, hd);
  // ears: left ear + bandaged right ear
  M(G.sphLo, skin, .12, .25, .16, -.95, .1, 0, hd);
  const ban = mat(0xf6f3ec, { roughness: .9 });
  M(G.sph, ban, .32, .42, .4, .95, .0, 0, hd);
  const wrap = M(G.torus, ban, 1, 1, 1, .66, .05, -.05, hd); wrap.rotation.set(0, PI / 2, -.12); wrap.scale.set(.82, 1.08, 1.6);
  // straw hat
  const hat = grp(hd, 0, .95, -.05); hat.rotation.set(-.08, 0, .06);
  M(G.disc, straw, 2.0, .1, 2.0, 0, 0, 0, hat); M(G.cyl, straw, .95, .9, .95, 0, .45, 0, hat); M(G.cyl, mat(0x2a56b5, { roughness: .6 }), .97, .2, .97, 0, .15, 0, hat);
  M(G.disc, straw, .95, .05, .95, 0, .92, 0, hat);
  // pipe (a wisp of glowing ember)
  const pp = grp(hd, -.12, -.45, .95); pp.rotation.y = -.35; const pipeM = mat(0x5a3418, { roughness: .5 }); M(G.cylLo, dark, .05, .9, .05, 0, -.08, .42, pp).rotation.x = PI / 2.3; M(G.cyl, pipeM, .15, .36, .15, 0, .02, .86, pp); M(G.sphLo, neon(0xff6a20, 1.2), .11, .04, .11, 0, .2, .86, pp).castShadow = false;
  mergeStatic(g);
  function update(dt, t, ctx) { ctx = ctx || NOCTX; glowUpd(glows, ctx.night); hd.rotation.y = -.25 + .06 * Math.sin(t * .25); }
  return { g, obs: [[-1.4, 0, 1.2], [0, 0, 1.4], [1.4, 0, 1.2], [-2.5, -2.4, .7], [0, -2.4, .7], [2.5, -2.4, .7]], update, height: 7.3, title: 'Self-Portrait with Bandaged Ear' };
}

// 10. Wheatfield with crows
function wheatClumpTex() {
  if (TX.wheatClump) return TX.wheatClump; const S = 128, [c, x] = cnv(S, S), rr = prng(1890); x.lineCap = 'round';
  for (let i = 0; i < 70; i++) { const bx = 8 + rr() * (S - 16), lean = (rr() - .5) * 26, h = S * (.55 + rr() * .42); x.strokeStyle = ['#e3b53a', '#f0cc55', '#c9902a', '#f6e08a', '#a8761d'][i % 5]; x.lineWidth = 2 + rr() * 2.5; x.beginPath(); x.moveTo(bx, S); x.quadraticCurveTo(bx + lean * .3, S - h * .5, bx + lean, S - h); x.stroke(); if (rr() < .6) { x.lineWidth = 4.5; x.beginPath(); x.moveTo(bx + lean, S - h); x.lineTo(bx + lean * 1.1, S - h - 10); x.stroke(); } }
  return (TX.wheatClump = ctex(c));
}
let _crowBody = null, _crowWing = null;
function crowGeos() {
  if (_crowBody) return; _crowBody = mergeGeo([[G.oct, mtx(0, 0, 0, 0, 0, 0, .18, .16, .5)], [G.sphLo, mtx(0, .06, .42, 0, 0, 0, .13, .12, .14)], [G.coneLo, mtx(0, .04, .62, PI / 2, 0, 0, .05, .18, .05)], [G.coneLo, mtx(0, 0, -.55, -PI / 2, 0, 0, .14, .35, .04)]]);
  _crowWing = mergeGeo([[slab([[0, -.2], [.35, -.18], [.75, -.32], [1.05, -.42], [.95, -.2], [.6, .05], [.3, .2], [0, .22]], .03), mtx(0, 0, 0, PI / 2, 0, 0)]]);
}
export function buildWheatfield() {
  const g = new THREE.Group(), glows = [], rr = prng(1890), W = 22, D = 13;
  const fieldM = paintMat(paintTexture('wheat', 1890), { rough: .95 });
  M(uvScale(new THREE.PlaneGeometry(W, D).rotateX(-PI / 2), 3, 2), fieldM, 1, 1, 1, 0, .03, 0, g).castShadow = false;
  // the three paths
  const P0 = [0, 5.6], PATHS = [[0, -6.4, 1.7], [-10.8, -1.2, 1.3], [10.8, -2.4, 1.3]], pathP = [];
  for (const [x1, z1, w] of PATHS) { const dx = x1 - P0[0], dz = z1 - P0[1]; pathP.push([G.box, mtx((P0[0] + x1) / 2, .02, (P0[1] + z1) / 2, 0, Math.atan2(dx, dz), 0, w, .04, Math.hypot(dx, dz) + w)]); }
  M(mergeGeo(pathP), mat(0x9a4a22, { roughness: 1 }), 1, 1, 1, 0, 0, 0, g).castShadow = false;
  const segD = (x, z, x1, z1) => { const dx = x1 - P0[0], dz = z1 - P0[1], u = clamp(((x - P0[0]) * dx + (z - P0[1]) * dz) / (dx * dx + dz * dz), 0, 1); return Math.hypot(x - P0[0] - dx * u, z - P0[1] - dz * u); };
  // wheat: alpha-tested crossed quads, swaying in a vertex shader
  const wq = new THREE.PlaneGeometry(1, 1).translate(0, .5, 0), wg = mergeGeo([[wq, null], [wq, new THREE.Matrix4().makeRotationY(PI / 2)]]);
  const wm = new THREE.MeshStandardMaterial({ map: wheatClumpTex(), alphaTest: .45, side: THREE.DoubleSide, roughness: .9 });
  const uT = { value: 0 };
  wm.onBeforeCompile = (sh) => { sh.uniforms.uT = uT; sh.vertexShader = 'uniform float uT;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n#ifdef USE_INSTANCING\n float ph = instanceMatrix[3].x * .35 + instanceMatrix[3].z * .2;\n#else\n float ph = 0.;\n#endif\n transformed.x += sin(uT * 1.6 + ph) * transformed.y * .18; transformed.z += cos(uT * 1.1 + ph) * transformed.y * .08;'); };
  wm.customProgramCacheKey = () => 'mastersWheat';
  const onPath = (x, z) => PATHS.some(([x1, z1, w]) => segD(x, z, x1, z1) < w / 2 + .35);
  const wheat = inst(wg, wm, 420, (i, o) => { let x, z; do { x = (rr() - .5) * W * .96; z = (rr() - .5) * D * .96; } while (onPath(x, z)); o.position.set(x, 0, z); o.rotation.y = rr() * PI; const s = 1.1 + rr() * .7; o.scale.set(s * 1.1, s, s * 1.1); });
  wheat.castShadow = false; g.add(wheat);
  // stormy sky backdrop (curved screen)
  const sky = paintMat(paintTexture('storm', 1890), { rough: .8, glow: [0, .5], side: THREE.DoubleSide }); glows.push(sky);
  const scr = new THREE.CylinderGeometry(16, 16, 7.5, 24, 1, true, PI - .75, 1.5); uvScale(scr, 2, 1);
  M(scr, sky, 1, 1, 1, 0, 3.75 + .4, 9.5, g);
  const frame = mat(0x1a1a2a, { roughness: .7 }), fp = [];
  for (let i = 0; i <= 4; i++) { const a = PI - .75 + i / 4 * 1.5; fp.push([G.box, mtx(Math.sin(a) * 16.1, 4.1, 9.5 + Math.cos(a) * 16.1, 0, a, 0, .25, 8.2, .25)]); }
  M(mergeGeo(fp), frame, 1, 1, 1, 0, 0, 0, g);
  // crows (instanced bodies & wings)
  crowGeos(); const NC = 12, cm = mat(0x111114, { roughness: .5 });
  const bodies = new THREE.InstancedMesh(_crowBody, cm, NC), wl = new THREE.InstancedMesh(_crowWing, cm, NC), wr = new THREE.InstancedMesh(_crowWing, cm, NC);
  for (const m of [bodies, wl, wr]) { m.castShadow = true; m.frustumCulled = false; g.add(m); }
  const crows = []; for (let i = 0; i < NC; i++) crows.push({ cx: (rr() - .5) * 10, cz: -2 + (rr() - .5) * 6, r: 3 + rr() * 5, h: 5 + rr() * 6, sp: (.35 + rr() * .3) * (rr() < .5 ? -1 : 1), ph: rr() * TAU, fl: 6 + rr() * 3, s: .85 + rr() * .35 });
  const eul = new THREE.Euler();
  function update(dt, t, ctx) {
    ctx = ctx || NOCTX; uT.value = t; glowUpd(glows, ctx.night);
    for (let i = 0; i < NC; i++) {
      const c = crows[i], a = c.ph + t * c.sp, x = c.cx + Math.cos(a) * c.r, z = c.cz + Math.sin(a) * c.r * .7, y = c.h + Math.sin(t * .9 + c.ph) * .8;
      const yaw = Math.atan2(-Math.sin(a) * c.sp, Math.cos(a) * c.sp * .7), bank = -.35 * Math.sign(c.sp), flap = .15 + Math.sin(t * c.fl + c.ph) * .55;
      _o3.position.set(x, y, z); _o3.rotation.set(0, yaw, bank); _o3.scale.setScalar(c.s); _o3.updateMatrix(); bodies.setMatrixAt(i, _o3.matrix);
      _m1.copy(_o3.matrix);
      _o3.position.set(.12, .05, 0); _o3.rotation.set(0, 0, flap); _o3.scale.setScalar(1); _o3.updateMatrix(); _o3.matrix.premultiply(_m1); wl.setMatrixAt(i, _o3.matrix);
      _o3.position.set(-.12, .05, 0); _o3.rotation.set(0, PI, -flap); _o3.updateMatrix(); _o3.matrix.premultiply(_m1); wr.setMatrixAt(i, _o3.matrix);
    }
    bodies.instanceMatrix.needsUpdate = wl.instanceMatrix.needsUpdate = wr.instanceMatrix.needsUpdate = true;
  }
  update(0, 0, NOCTX); mergeStatic(g);
  const obs = []; for (let i = 0; i <= 4; i++) { const a = PI - .75 + i / 4 * 1.5; obs.push([Math.sin(a) * 16.1, 9.5 + Math.cos(a) * 16.1, .3]); }
  return { g, obs, update, height: 11.5, title: 'Wheatfield with Crows' };
}

// ============================================================ PICASSO
const PK = { red: 0xd94a2b, yel: 0xf2c230, blu: 0x2b5fa8, cre: 0xf2ead8, grn: 0x3a8a5a, pink: 0xe88aa8, org: 0xf08a2a, vio: 0x7a4fb0, blk: 0x111111, wht: 0xf4f1ea };
// 11. Mask totem
export function buildMaskTotem() {
  const g = new THREE.Group(), at = maskAtlas(), glows = [at.mat], tiers = [];
  M(G.box, mat(PK.blk, { roughness: .6 }), 3.0, .5, 3.0, 0, .25, 0, g); M(G.box, mat(PK.cre, { roughness: .7 }), 2.6, .5, 2.6, 0, .75, 0, g);
  const cols = [PK.red, PK.blu, PK.yel, PK.grn], side = [PK.pink, PK.org, PK.vio, PK.blu];
  for (let i = 0; i < 4; i++) {
    const tg = grp(g, 0, 1.0 + i * 2.3 + 1.15, 0), w = 1.9 - i * .08; tiers.push({ tg, sp: (i % 2 ? -1 : 1) * (.12 + i * .03), ph: i * 1.3 });
    M(G.box, mat(cols[i], { roughness: .6 }), w, 2.15, 1.5, 0, 0, 0, tg);
    M(maskGeo(i * 2, 2.25, 2.25), at.mat, 1, 1, 1, 0, 0, .78, tg).castShadow = false;
    M(maskGeo(i * 2 + 1, 2.25, 2.25), at.mat, 1, 1, 1, 0, 0, -.78, tg).rotation.y = PI;
    // profile noses sticking out front and back
    for (const s of [1, -1]) { const n = cubPlane(tg, [[0, 0], [.55, -.72], [.05, -.82]], side[i], { x: (i % 2 ? .06 : -.06) * s, y: .42, z: .8 * s, ry: -PI / 2 * s, depth: .16, outline: .06 }); }
    // angled ear planes (cubist fragments)
    for (const s of [-1, 1]) cubPlane(tg, [[0, -.8], [.9, -.4], [.7, .7], [0, .9]], s > 0 ? side[i] : side[(i + 2) % 4], { x: s * w / 2, ry: s > 0 ? -.5 : PI + .5, depth: .14, outline: .07 });
  }
  // crown: fan of coloured blades
  const crown = grp(g, 0, 1.0 + 4 * 2.3 + .05, 0);
  [PK.yel, PK.red, PK.blu, PK.grn, PK.org].forEach((c, k) => cubPlane(crown, [[-.18, 0], [.18, 0], [.05, 1.6 - Math.abs(k - 2) * .3], [-.05, 1.6 - Math.abs(k - 2) * .3]], c, { rz: (k - 2) * .38, depth: .18, outline: .07 }));
  mergeStatic(g);
  function update(dt, t, ctx) { ctx = ctx || NOCTX; for (const r of tiers) r.tg.rotation.y = .5 * Math.sin(t * r.sp + r.ph); glowUpd(glows, ctx.night); }
  return { g, obs: [[0, 0, 1.45]], update, height: 11.1, title: 'Totem of Masks' };
}

// 12. Cubist head (Chicago Picasso meets portrait)
export function buildCubistHead() {
  const g = new THREE.Group(), rust = mat(0x8a4a2a, { roughness: .45, metalness: .55 }), sprs = [];
  M(G.box, mat(0x9a948a, { roughness: .9 }), 4.4, .6, 3.4, 0, .3, 0, g);
  M(G.box, rust, 1.0, 3.2, 1.0, 0, 2.2, 0, g);
  const hg = grp(g, 0, 3.6, 0);
  // wings & rods
  for (const s of [-1, 1]) cubPlane(hg, [[0, 0], [1.2, .6], [2.6, 3.4], [2.2, 5.2], [.9, 4.5], [.3, 2.4]], rust, { x: s * .7, z: -.9, ry: s > 0 ? -.35 : PI + .35, depth: .14, outline: 0 });
  const rods = []; for (let i = 0; i < 9; i++) { const y = 1.4 + i * .4; rods.push([G.cylLo, new THREE.Matrix4().makeRotationZ(PI / 2).premultiply(new THREE.Matrix4().makeTranslation(0, y, -1.15 - i * .04)).multiply(new THREE.Matrix4().makeScale(.04, 3.6 + i * .12, .04))]); }
  M(mergeGeo(rods), rust, 1, 1, 1, 0, 0, 0, hg);
  // frontal face plane
  const face = [[-1.25, .3], [0, -.1], [1.2, .4], [1.45, 2.4], [1.0, 4.0], [-.2, 4.4], [-1.3, 3.6], [-1.5, 1.8]];
  cubPlane(hg, face, 0xe8b48a, { z: 0, depth: .3, outline: .14 });
  const [fl] = splitPoly(face, .1, 2, 1, -.25); cubPlane(hg, fl, PK.pink, { z: .18, depth: .06, outline: 0 });
  // profile plane (perpendicular) with long nose
  cubPlane(hg, [[-.9, .4], [.3, .2], [.75, .9], [.55, 1.25], [.9, 1.45], [.6, 1.7], [1.8, 2.15], [.6, 2.8], [.9, 3.5], [-.2, 4.3], [-1.2, 3.6]], PK.blu, { x: .25, ry: -PI / 2, depth: .2, outline: .1 });
  // eyes at different heights
  const glowEye = neon(0xfff2a0, 1.2);
  cubPlane(hg, ell(0, 0, .45, .3, 12), PK.wht, { x: -.65, y: 2.9, z: .24, depth: .12, outline: .08 });
  M(G.cyl, glowEye, .14, .2, .14, -.6, 2.9, .3, hg).rotation.x = PI / 2;
  cubPlane(hg, [[0, -.4], [.32, 0], [0, .4], [-.32, 0]], PK.yel, { x: .75, y: 2.35, z: .24, depth: .12, outline: .08 });
  M(G.cyl, glowEye, .12, .2, .12, .75, 2.35, .3, hg).rotation.x = PI / 2;
  cubPlane(hg, [[-.5, -.08], [.4, -.15], [.5, .1], [-.4, .12]], PK.red, { x: -.2, y: 1.05, z: .24, rz: .15, depth: .14, outline: .06 });
  // hair / colour blocks
  M(G.box, mat(PK.yel, { roughness: .6 }), 1.2, 1.2, 1.2, -.9, 4.3, -.4, hg).rotation.set(.3, .5, .2);
  M(G.box, mat(PK.blk, { roughness: .6 }), .5, 2.6, .5, -1.5, 3.2, -.5, hg).rotation.z = -.25;
  cubPlane(hg, [[0, 0], [1.4, .5], [.6, 1.6]], PK.grn, { x: .5, y: 3.6, z: -.3, ry: .4, depth: .2, outline: .08 });
  for (const [x, y] of [[-.6, 2.9], [.75, 2.35]]) { const sp = makeGlowSprite(0xfff2a0, 1.8); sp.position.set(x, 3.6 + y, .5); g.add(sp); sprs.push(sp); }
  mergeStatic(g);
  return { g, obs: [[0, 0, .8], [-1.6, -.6, .5], [1.6, -.6, .5]], update(dt, t, ctx) { sprUpd(sprs, (ctx || NOCTX).night, t, .6); }, height: 9.0, title: 'Cubist Head' };
}

// 13. Cubist guitar
function newsTex() {
  if (TX.news) return TX.news; const S = 256, [c, x] = cnv(S, S), rr = prng(1912);
  x.fillStyle = '#e8dcc0'; x.fillRect(0, 0, S, S); x.fillStyle = '#1a1a1a'; x.font = 'bold 70px Georgia, serif'; x.fillText('JOU', 18, 74);
  for (let col = 0; col < 3; col++) for (let l = 0; l < 22; l++) { const y = 96 + l * 7; if (y > S - 6) break; x.fillStyle = 'rgba(30,30,30,.75)'; x.fillRect(10 + col * 82, y, 70 * (.6 + rr() * .4), 3); }
  x.fillRect(8, 86, S - 16, 2);
  return (TX.news = ctex(c, true));
}
export function buildCubistGuitar() {
  const g = new THREE.Group(), sprs = [];
  M(G.box, mat(PK.blk, { roughness: .6 }), 4.4, .4, 2.4, 0, .2, 0, g);
  cubPlane(g, [[-2.2, 0], [2.0, -.2], [2.4, 6.2], [-1.8, 6.8]], PK.blu, { y: .4, z: -.9, ry: .12, depth: .2, outline: .12 });
  const nm = paintMat(newsTex(), { rough: .9 });
  const npg = slab([[0, 0], [2.2, 0], [2.4, 2.6], [.2, 2.4]], .1); uvScale(npg, 1 / 2.4, 1 / 2.6);
  const np = grp(g, -2.9, 2.6, -.2); np.rotation.set(0, .55, -.12); M(npg, nm, 1, 1, 1, 0, 0, 0, np);
  M(slab(grow([[0, 0], [2.2, 0], [2.4, 2.6], [.2, 2.4]], .1), .08), mat(PK.blk), 1, 1, 1, 0, 0, -.06, np);
  cubPlane(g, [[0, 0], [1.6, .3], [1.2, 2.4], [-.2, 2.0]], PK.org, { x: 1.0, y: 4.3, z: -.6, ry: -.3, depth: .16, outline: .1 });
  // body outline (figure-8), split into two shifted halves
  const body = [], bw = (y) => y < 2.05 ? 1.75 - .65 * Math.exp(-Math.pow((y - 2.05) / .4, 2)) : 1.35 - .25 * Math.exp(-Math.pow((y - 2.05) / .3, 2));
  for (let i = 0; i < 32; i++) { const a = i / 32 * TAU, y = 1.65 + Math.sin(a) * 1.65; body.push([Math.cos(a) * bw(y), y]); }
  const [L, Rh] = splitPoly(body, 0, 1.6, 1, -.15);
  const gg = grp(g, 0, .7, .3); gg.rotation.z = .08;
  cubPlane(gg, L, 0xc88a3a, { depth: .35, outline: .14 });
  cubPlane(gg, Rh, 0x7a4a22, { x: .3, y: .25, z: .3, depth: .35, outline: .14 });
  M(G.cyl, mat(PK.blk, { roughness: .4 }), .55, .3, .55, .1, 2.35, .55, gg).rotation.x = PI / 2;
  M(G.torus, mat(PK.wht, { roughness: .5 }), .62, .62, .6, .1, 2.35, .68, gg);
  M(G.box, mat(0x3a2414, { roughness: .6 }), .5, 3.9, .26, .1, 5.2, .5, gg);
  M(G.box, mat(0x2a1a10, { roughness: .6 }), .8, 1.0, .3, .1, 7.5, .5, gg);
  for (let k = 0; k < 6; k++) M(G.sphLo, mat(PK.cre, { roughness: .4 }), .09, .09, .09, k < 3 ? -.38 : .58, 7.2 + (k % 3) * .3, .55, gg);
  M(G.box, mat(PK.blk), .9, .14, .2, .1, 1.1, .6, gg);
  const strings = grp(gg, .1, 0, .7), sp = [];
  for (let k = 0; k < 6; k++) sp.push([G.box, mtx((k - 2.5) * .075, 4.2, 0, 0, 0, 0, .025, 6.2, .025)]);
  const sm = M(mergeGeo(sp), neon(0xfff2c0, 1.1), 1, 1, 1, 0, 0, 0, strings); sm.castShadow = false; keep(sm);
  for (let k = 0; k < 3; k++) { const s2 = makeGlowSprite(0xfff0c0, 2.4); s2.position.set(0, 2 + k * 2.2, .2); strings.add(s2); sprs.push(s2); }
  mergeStatic(g);
  let amp = 0;
  function update(dt, t, ctx) {
    ctx = ctx || NOCTX; let near = 0;
    if (ctx.playerPos) { _v1.copy(ctx.playerPos); g.worldToLocal(_v1); near = _v1.x * _v1.x + _v1.z * _v1.z < 36 ? 1 : 0; }
    amp += (near - amp) * Math.min(1, dt * 3); strings.scale.x = 1 + amp * .9 * Math.sin(t * 70); sprUpd(sprs, Math.max(ctx.night, amp * .6), t, .5);
  }
  return { g, obs: [[-1.5, 0, .7], [0, 0, .9], [1.5, 0, .7]], update, height: 8.6, title: 'Guitar (Cubist)' };
}

// 14. Guernica bull & horse
export function buildGuernica() {
  const g = new THREE.Group(), sprs = [], W = PK.wht, LG = 0xb8b8b0, MG = 0x7a7a74, DK = 0x2a2a2a;
  M(G.box, mat(0x1a1a1a, { roughness: .7 }), 11, .3, 4, 0, .15, 0, g);
  const tiles = []; for (let i = 0; i < 11; i++) for (let j = 0; j < 4; j++) if ((i + j) % 2) tiles.push([G.box, mtx(-5 + i, .31, -1.5 + j, 0, 0, 0, .98, .02, .98)]);
  M(mergeGeo(tiles), mat(0xe8e6e0, { roughness: .8 }), 1, 1, 1, 0, 0, 0, g);
  // bull (left): grey body profile, white frontal head, crescent horns
  const bull = grp(g, -2.9, .3, -.4); bull.scale.setScalar(1.15);
  cubPlane(bull, [[-2.2, 1.9], [-2.0, 3.3], [-.8, 3.9], [.6, 4.6], [1.6, 4.2], [1.8, 2.6], [1.0, 1.8], [-1.4, 1.7]], DK, { depth: .4, outline: .12 });
  for (const [x, w] of [[-1.6, .35], [-1.0, .3], [.8, .35], [1.3, .3]]) cubPlane(bull, [[x - w / 2, 0], [x + w / 2, 0], [x + w / 2, 2.0], [x - w / 2, 2.0]], x < 0 ? DK : MG, { z: x > 1 ? .25 : -.1, depth: .25, outline: .08 });
  cubPlane(bull, [[-2.0, 3.2], [-2.6, 3.1], [-2.85, 1.7], [-2.6, 1.6], [-2.45, 2.9], [-2.0, 2.95]], DK, { depth: .2, outline: .06 });
  const hd = grp(bull, 1.6, 4.0, .4); hd.rotation.y = .5;
  cubPlane(hd, [[-.8, 0], [.7, .1], [1.0, 1.4], [.4, 2.4], [-.6, 2.3], [-1.0, 1.2]], W, { depth: .3, outline: .14 });
  cubPlane(hd, [[-.6, 1.5], [-.15, 1.75], [.1, 1.5], [-.3, 1.3]], DK, { z: .2, depth: .06, outline: 0 });
  cubPlane(hd, ell(.5, 1.0, .18, .26, 10), DK, { z: .2, depth: .06, outline: 0 });
  cubPlane(hd, [[-.4, .3], [.5, .35], [.4, .55], [-.3, .5]], MG, { z: .2, depth: .06, outline: 0 });
  for (const s of [-1, 1]) { const hp = []; for (let i = 0; i <= 10; i++) { const a = i / 10 * PI * .8; hp.push([s * (.4 + Math.sin(a) * 1.1), 2.2 + (1 - Math.cos(a)) * .9]); } for (let i = 10; i >= 0; i--) { const a = i / 10 * PI * .8; hp.push([s * (.4 + Math.sin(a) * .85), 2.2 + (1 - Math.cos(a)) * .9 + .12]); } cubPlane(hd, hp, W, { z: -.05, depth: .2, outline: .08 }); }
  // horse (right): hatched newsprint body, rearing neck & head
  const horse = grp(g, 2.6, .3, .5), news = paintMat(newsTex(), { rough: .9 });
  const hb = grp(horse); M(uvScale(slab([[-1.6, 2.0], [-1.8, 3.4], [-.6, 3.8], [1.2, 3.6], [1.6, 2.4], [.8, 1.8], [-1.0, 1.8]], .45), .4), news, 1, 1, 1, 0, 0, 0, hb);
  M(slab(grow([[-1.6, 2.0], [-1.8, 3.4], [-.6, 3.8], [1.2, 3.6], [1.6, 2.4], [.8, 1.8], [-1.0, 1.8]], .12), .35), mat(PK.blk), 1, 1, 1, 0, 0, -.1, hb);
  for (const [x, w] of [[-1.4, .3], [-.8, .28], [.9, .3], [1.3, .28]]) cubPlane(horse, [[x - w / 2, 0], [x + w / 2, 0], [x + w / 2 + .1, 1.9], [x - w / 2 + .1, 1.9]], x < 0 ? LG : W, { z: x > 0 ? .3 : -.1, depth: .22, outline: .08 });
  cubPlane(horse, [[.8, 3.3], [1.5, 3.0], [1.9, 5.2], [1.3, 5.6]], LG, { depth: .3, outline: .1 });
  const hh = grp(horse, 1.6, 5.4, .2); hh.rotation.z = .5; hh.scale.setScalar(1.25);
  cubPlane(hh, [[-.4, -.25], [.4, -.35], [2.1, -.1], [2.2, .25], [1.2, .45], [2.1, .9], [1.9, 1.1], [.5, 1.05], [-.6, .75]], W, { depth: .3, outline: .12 });
  cubPlane(hh, [[1.2, .5], [2.3, .62], [1.2, .62]], LG, { z: .2, depth: .08, outline: .04 });
  cubPlane(hh, ell(.1, .6, .14, .2, 8), DK, { z: .2, depth: .06, outline: 0 });
  for (let i = 0; i < 4; i++) cubPlane(hh, [[-.4 + i * .2, .9], [-.2 + i * .2, .95], [-.5 + i * .25, 1.6 - i * .08]], DK, { depth: .1, outline: 0 });
  cubPlane(horse, [[-1.8, 3.0], [-2.6, 2.4], [-2.4, 1.6], [-1.7, 2.4]], LG, { depth: .2, outline: .06 });
  // the electric eye-sun overhead
  const sun = grp(g, -.2, 7.3, -.9), rays = [];
  for (let i = 0; i < 14; i++) { const a = i / 14 * TAU, r = i % 2 ? 1.0 : 1.55; rays.push([Math.cos(a) * r * 1.4, Math.sin(a) * r * .9]); }
  cubPlane(sun, rays, W, { depth: .2, outline: .1 });
  cubPlane(sun, [[-1.0, 0], [0, .55], [1.0, 0], [0, -.55]], LG, { z: .14, depth: .06, outline: .05 });
  M(G.sph, neon(0xfff6d0, 1.6), .32, .44, .25, 0, 0, .2, sun).castShadow = false;
  M(G.box, mat(PK.blk), .06, 1.6, .06, 0, -1.6, -.1, sun);
  const sp = makeGlowSprite(0xfff4d0, 5); sp.position.set(0, 0, .5); sun.add(sp); sprs.push(sp);
  mergeStatic(g);
  function update(dt, t, ctx) { ctx = ctx || NOCTX; sprUpd(sprs, Math.max(.15, ctx.night), t, .7); hh.rotation.z = .5 + .05 * Math.sin(t * 1.3); hd.rotation.y = .5 + .08 * Math.sin(t * .7); }
  return { g, obs: [[-4.2, -.4, .5], [-1.6, -.4, .5], [1.2, .5, .5], [4.0, .5, .5]], update, height: 8.9, title: 'Guernica: Bull & Horse' };
}

// 15. Rose-period harlequin seated on a drum
export function buildHarlequin() {
  const g = new THREE.Group(), hm = paintMat(paintTexture('harlequin', 2), { rough: .75 });
  const arch = [[-2.8, 0], [2.8, 0], [2.8, 4.6]]; for (let i = 1; i < 12; i++) { const a = i / 12 * PI; arch.push([Math.cos(a) * 2.8, 4.6 + Math.sin(a) * 2.2]); } arch.push([-2.8, 4.6]);
  cubPlane(g, arch, 0xe8a6a0, { z: -1.8, depth: .3, outline: .14 });
  M(taperTube(arch.slice(1, -1).map(([x, y]) => [x * 1.02, y + .02, -1.6]), () => .06, 40, 4), neon(0xff8fb0, .9), 1, 1, 1, 0, 0, 0, g).castShadow = false;
  cubPlane(g, [[-2.2, .2], [-.4, .2], [-1.0, 3.6], [-2.2, 4.0]], 0xd88a8a, { z: -1.6, depth: .06, outline: 0 });
  cubPlane(g, [[1.2, .2], [2.4, .2], [2.4, 5.4], [1.6, 5.8]], 0xf2c8b0, { z: -1.6, depth: .06, outline: 0 });
  // drum
  M(G.cyl, mat(0xc84a3a, { roughness: .6 }), 1.3, 1.8, 1.3, 0, .9, 0, g);
  for (const y of [.08, 1.72]) M(G.torus, mat(PK.cre, { roughness: .6 }), 1.32, 1.32, 1.4, 0, y, 0, g).rotation.x = PI / 2;
  const zz = []; for (let i = 0; i < 16; i++) { const a0 = i / 16 * TAU, a1 = (i + 1) / 16 * TAU, up = i % 2; zz.push([G.cylLo, segMtx(V3([Math.sin(a0) * 1.33, up ? 1.6 : .2, Math.cos(a0) * 1.33]), V3([Math.sin(a1) * 1.33, up ? .2 : 1.6, Math.cos(a1) * 1.33]), .035)]); }
  M(mergeGeo(zz), mat(PK.cre, { roughness: .6 }), 1, 1, 1, 0, 0, 0, g);
  // figure (scaled to ~6 m overall)
  const f = grp(g); f.scale.setScalar(1.12);
  const skin = mat(0xf0dccb, { roughness: .6 }), blk = mat(0x141414, { roughness: .5 });
  const limb = (a, b, r, m) => { const o = M(G.cyl, m, 1, 1, 1, 0, 0, 0, f); placeSeg(o, V3(a), V3(b), r); M(G.sphLo, m, r, r, r, b[0], b[1], b[2], f); };
  M(G.sph, hm, .62, .45, .55, 0, 1.95, 0, f);
  for (const s of [-1, 1]) { limb([s * .3, 1.95, 0], [s * .38, 2.0, 1.3], .25, hm); limb([s * .38, 2.0, 1.3], [s * .4, .2, 1.5], .2, hm); M(G.box, blk, .28, .16, .55, s * .4, .08, 1.62, f); }
  M(uvScale(lathe([[0, 0], [.58, 0], [.62, .6], [.7, 1.3], [.62, 1.65], [0, 1.72]], 16), 2, 1), hm, 1, 1, .72, 0, 2.0, 0, f);
  const ruff = new THREE.TorusGeometry(.5, .2, 6, 24); { const p = ruff.attributes.position; for (let i = 0; i < p.count; i++) { const a = Math.atan2(p.getY(i), p.getX(i)), k = 1 + .12 * Math.sin(a * 12); p.setXYZ(i, p.getX(i) * k, p.getY(i) * k, p.getZ(i)); } ruff.computeVertexNormals(); }
  M(ruff, mat(PK.wht, { roughness: .8 }), 1, 1, 1, 0, 3.72, 0, f).rotation.x = PI / 2;
  M(G.cyl, skin, .16, .4, .16, 0, 3.9, 0, f);
  const hd = grp(f, 0, 4.35, .02); hd.rotation.set(.12, -.15, .08);
  M(G.sph, skin, .4, .5, .43, 0, 0, 0, hd);
  for (const s of [-1, 1]) { M(G.sphLo, blk, .08, .045, .03, s * .15, .06, .39, hd); M(G.box, blk, .2, .035, .03, s * .16, .18, .38, hd).rotation.z = -s * .15; }
  M(G.coneLo, skin, .06, .2, .07, 0, -.04, .45, hd).rotation.x = .3; M(G.sphLo, mat(0xb83a3a, { roughness: .5 }), .1, .035, .04, 0, -.24, .38, hd);
  M(G.hemi, mat(0x2a1a14, { roughness: .8 }), .42, .3, .45, 0, .12, -.03, hd);
  const hat = []; for (let i = 0; i <= 12; i++) { const a = i / 12 * PI; hat.push([Math.cos(a) * .95, Math.sin(a) * .5]); }
  const hg = grp(hd, 0, .32, 0); M(slab(hat, .5), blk, 1, 1, 1, 0, 0, 0, hg); M(G.box, mat(PK.red), 1.6, .08, .52, 0, .02, 0, hg);
  // arms: right hand on knee, left hand to chin (pensive)
  limb([.62, 3.55, 0], [.85, 2.65, .55], .17, hm); limb([.85, 2.65, .55], [.45, 2.3, 1.2], .15, hm); M(G.sphLo, skin, .16, .12, .2, .45, 2.3, 1.25, f);
  limb([-.62, 3.55, 0], [-.6, 2.75, .9], .17, hm); limb([-.6, 2.75, .9], [-.18, 3.95, .5], .15, hm); M(G.sphLo, skin, .14, .18, .14, -.16, 4.02, .48, f);
  mergeStatic(g);
  return { g, obs: [[0, 0, 1.35], [-2.4, -1.8, .4], [2.4, -1.8, .4]], update(dt, t) { hd.rotation.z = .08 + .03 * Math.sin(t * .5); }, height: 7.0, title: 'Harlequin (Rose Period)' };
}

// 16. Weeping Woman face panel
function weepingTex() {
  if (TX.weep) return TX.weep; const S = 512, [c, x] = cnv(S, S), [ce, e] = cnv(256, 256); e.fillStyle = '#000'; e.fillRect(0, 0, 256, 256); e.scale(.5, .5);
  const poly = (ctx, pts, fill, lw = 6) => { ctx.beginPath(); pts.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])); ctx.closePath(); if (fill) { ctx.fillStyle = fill; ctx.fill(); } if (lw) { ctx.strokeStyle = '#111'; ctx.lineWidth = lw; ctx.lineJoin = 'round'; ctx.stroke(); } };
  poly(x, [[0, 0], [300, 0], [180, 512], [0, 512]], '#7a4fb0', 0); poly(x, [[300, 0], [512, 0], [512, 512], [180, 512]], '#3fa36b', 0); poly(x, [[0, 300], [140, 512], [0, 512]], '#f2c230', 0); poly(x, [[420, 0], [512, 0], [512, 200]], '#f08a2a', 0);
  // hair
  poly(x, [[360, 110], [450, 140], [470, 330], [430, 470], [380, 420], [400, 260]], '#1f2340');
  x.strokeStyle = '#8fa8d8'; x.lineWidth = 3; for (let i = 0; i < 6; i++) { x.beginPath(); x.moveTo(380 + i * 12, 130); x.quadraticCurveTo(450, 260 + i * 10, 400 + i * 8, 450); x.stroke(); }
  // face planes
  const face = [[130, 120], [380, 112], [405, 250], [362, 420], [252, 468], [150, 420], [108, 262]];
  poly(x, face, '#f2d23a'); poly(x, [[256, 116], [380, 112], [405, 250], [362, 420], [270, 466], [276, 300]], '#8fd06a', 6);
  poly(x, [[108, 262], [180, 280], [170, 400], [150, 420]], '#e98bb0', 4);
  // hat with flower
  poly(x, [[70, 120], [140, 40], [380, 20], [450, 110], [300, 140]], '#d9282b'); poly(x, [[90, 112], [430, 96], [440, 118], [96, 134]], '#2b5fa8', 5);
  for (let i = 0; i < 6; i++) { const a = i / 6 * TAU; x.fillStyle = '#2b5fa8'; x.beginPath(); x.arc(290 + Math.cos(a) * 22, 46 + Math.sin(a) * 16, 14, 0, TAU); x.fill(); x.strokeStyle = '#111'; x.lineWidth = 3; x.stroke(); }
  x.fillStyle = '#f2c230'; x.beginPath(); x.arc(290, 46, 12, 0, TAU); x.fill(); x.stroke();
  // boat eyes at different heights + lashes + tears (also into the emissive map)
  for (const [ex, ey, w] of [[192, 222, 58], [326, 200, 52]]) {
    for (const [ctx, glow] of [[x, 0], [e, 1]]) {
      ctx.beginPath(); ctx.moveTo(ex - w, ey); ctx.quadraticCurveTo(ex, ey - w * .55, ex + w, ey - 6); ctx.quadraticCurveTo(ex, ey + w * .7, ex - w, ey); ctx.closePath(); ctx.fillStyle = glow ? '#fff8d0' : '#f8f4e8'; ctx.fill();
      if (!glow) { ctx.strokeStyle = '#111'; ctx.lineWidth = 7; ctx.stroke(); }
      ctx.fillStyle = glow ? '#ffd040' : '#111'; ctx.beginPath(); ctx.arc(ex + 4, ey + 2, w * .24, 0, TAU); ctx.fill();
      for (const [tx, ty] of [[ex - 14, ey + 44], [ex + 10, ey + 74], [ex - 4, ey + 108]]) { ctx.beginPath(); ctx.moveTo(tx, ty - 16); ctx.quadraticCurveTo(tx + 12, ty + 2, tx, ty + 9); ctx.quadraticCurveTo(tx - 12, ty + 2, tx, ty - 16); ctx.fillStyle = glow ? '#bfe8ff' : '#ffffff'; ctx.fill(); if (!glow) { ctx.strokeStyle = '#2b5fa8'; ctx.lineWidth = 3; ctx.stroke(); } }
    }
    x.strokeStyle = '#111'; x.lineWidth = 4; for (let k = 0; k < 7; k++) { const a = -PI * .85 + k / 6 * PI * .7; x.beginPath(); x.moveTo(ex + Math.cos(a) * w * .8, ey - 14 + Math.sin(a) * w * .25); x.lineTo(ex + Math.cos(a) * w * 1.1, ey - 18 + Math.sin(a) * w * .6); x.stroke(); }
    x.lineWidth = 10; x.beginPath(); x.arc(ex, ey + 30, w * 1.15, PI * 1.2, PI * 1.8); x.stroke();
  }
  // profile nose
  x.strokeStyle = '#111'; x.lineWidth = 7; x.beginPath(); x.moveTo(250, 170); x.lineTo(214, 300); x.lineTo(252, 312); x.stroke();
  // handkerchief shards + clenched teeth + green fingers
  poly(x, [[150, 300], [240, 290], [300, 320], [370, 300], [380, 380], [300, 440], [200, 450], [140, 400]], '#f6f6f2');
  poly(x, [[170, 330], [260, 330], [250, 380], [180, 390]], '#cfe3f0', 4); poly(x, [[270, 330], [350, 320], [330, 400], [280, 410]], '#e8eef8', 4);
  x.fillStyle = '#fff'; x.fillRect(200, 352, 110, 26); x.strokeStyle = '#111'; x.lineWidth = 4; x.strokeRect(200, 352, 110, 26); for (let i = 1; i < 8; i++) { x.beginPath(); x.moveTo(200 + i * 14, 352); x.lineTo(200 + i * 14, 378); x.stroke(); }
  for (let i = 0; i < 4; i++) poly(x, [[120 + i * 26, 470], [140 + i * 26, 470], [180 + i * 22, 340 + i * 6], [164 + i * 22, 334 + i * 6]], i % 2 ? '#7ac05a' : '#f4f1ea', 5);
  x.strokeStyle = '#111'; x.lineWidth = 8; x.beginPath(); face.forEach((p, i) => i ? x.lineTo(p[0], p[1]) : x.moveTo(p[0], p[1])); x.closePath(); x.stroke();
  return (TX.weep = { map: ctex(c), em: ctex(ce) });
}
export function buildWeepingWoman() {
  const g = new THREE.Group(), wt = weepingTex(), glows = [], S = 7, CY = 4.7;
  const fm = paintMat(wt.map, { rough: .7, glow: [.03, 2.0], emMap: wt.em }); glows.push(fm);
  M(G.box, mat(PK.blk, { roughness: .6 }), S + .5, S + .5, .5, 0, CY, 0, g);
  for (const s of [-1, 1]) M(G.box, mat(PK.blk, { roughness: .6 }), .5, CY - S / 2 + .3, 1.6, s * 2.6, (CY - S / 2) / 2, 0, g);
  M(G.plane, fm, S, S, 1, 0, CY, .26, g).castShadow = false;
  M(G.plane, paintMat(paintTexture('picasso', 37), { rough: .8 }), S, S, 1, 0, CY, -.26, g).rotation.y = PI;
  const P = (px, py) => [(px / 512 - .5) * S, (.5 - py / 512) * S];
  // relief: hat brim, handkerchief, fingers pop out of the canvas
  cubPlane(g, [[70, 120], [140, 40], [380, 20], [450, 110], [300, 140]].map(p => P(...p)), 0xd9282b, { y: CY, z: .5, depth: .25, outline: .1 });
  cubPlane(g, [[90, 112], [430, 96], [440, 118], [96, 134]].map(p => P(...p)), PK.blu, { y: CY, z: .7, depth: .1, outline: .05 });
  cubPlane(g, [[150, 300], [240, 290], [300, 320], [370, 300], [380, 380], [300, 440], [200, 450], [140, 400]].map(p => P(...p)).map(([x2, y2]) => [x2, y2]), mat(PK.wht, { roughness: .7, transparent: true, opacity: .35 }), { y: CY, z: .55, depth: .05, outline: 0 });
  for (let i = 0; i < 4; i++) cubPlane(g, [[120 + i * 26, 470], [140 + i * 26, 470], [180 + i * 22, 340 + i * 6], [164 + i * 22, 334 + i * 6]].map(p => P(...p)), i % 2 ? 0x7ac05a : PK.wht, { y: CY, z: .5 + i * .06, depth: .14, outline: .05 });
  const nose = cubPlane(g, [[0, 0], [.6, -1.4], [.05, -1.55]], 0xf2d23a, { x: P(250, 170)[0], y: CY + P(250, 170)[1], z: .3, ry: -PI / 2, depth: .12, outline: .06 });
  const sprs = []; for (const [ex, ey] of [[192, 222], [326, 200]]) { const sp = makeGlowSprite(0xfff4c0, 2.2); const p = P(ex, ey); sp.position.set(p[0], CY + p[1], .6); g.add(sp); sprs.push(sp); }
  mergeStatic(g);
  return { g, obs: [[-2.6, 0, .6], [2.6, 0, .6]], update(dt, t, ctx) { ctx = ctx || NOCTX; glowUpd(glows, ctx.night); sprUpd(sprs, ctx.night, t, .5); }, height: CY + S / 2 + .25, title: 'The Weeping Woman' };
}

// 17. Wall / arch of cubist masks (selfie spot)
export function buildMaskWall() {
  const g = new THREE.Group(), at = maskAtlas(), glows = [at.mat], HW = 7, H = 7.5, AW = 2.4, AH = 4.2, D = 1.2;
  const sh = new THREE.Shape(); sh.moveTo(-HW, 0); sh.lineTo(-AW, 0); sh.lineTo(-AW, AH); sh.absarc(0, AH, AW, PI, 0, true); sh.lineTo(AW, 0); sh.lineTo(HW, 0); sh.lineTo(HW, H); sh.lineTo(-HW, H); sh.closePath();
  const wg = new THREE.ExtrudeGeometry(sh, { depth: D, bevelEnabled: false, curveSegments: 16 }); wg.translate(0, 0, -D / 2);
  M(wg, mat(0xf2ead6, { roughness: .85 }), 1, 1, 1, 0, 0, 0, g);
  M(G.box, paintMat(paintTexture('picasso', 7), { rough: .7 }), 2 * HW + .6, .7, D + .4, 0, H + .35, 0, g);
  const stripes = [PK.yel, PK.blu, PK.red, PK.grn];
  for (let i = 0; i < 4; i++) { const x = (i < 2 ? -1 : 1) * (AW + .6 + (i % 2) * 2.4); M(G.box, mat(stripes[i], { roughness: .7 }), 2.3, .5, D + .1, x + (i < 2 ? -.6 : .6), .25, 0, g); }
  // masks: one merged mesh, one material (atlas)
  const parts = []; let k = 0;
  for (const s of [-1, 1]) for (const cx of [3.5, 5.7]) for (const y of [1.5, 3.55, 5.6]) parts.push([maskGeo(k++, 1.95, 1.95), mtx(s * (cx + (y === 3.55 ? .15 : 0)), y, D / 2 + .02)]);
  for (const [x, y, sz] of [[-3.2, H + 1.9, 2.4], [0, H + 2.2, 3.0], [3.2, H + 1.9, 2.4]]) { parts.push([maskGeo(k++, sz, sz), mtx(x, y, .05)]); M(slab(ell(0, 0, sz * .36, sz * .5, 16), .14), mat(PK.blk, { roughness: .6 }), 1, 1, 1, x, y - sz * .02, -.1, g); }
  parts.push([maskGeo(k++, 3, 3), mtx(0, H + 2.2, -.24, 0, PI, 0)]);
  M(mergeGeo(parts), at.mat, 1, 1, 1, 0, 0, 0, g).castShadow = false;
  // neon arch outline, both faces
  const ap = [[-AW, .05], [-AW, AH]]; for (let i = 1; i < 12; i++) { const a = PI - i / 12 * PI; ap.push([Math.cos(a) * AW, AH + Math.sin(a) * AW]); } ap.push([AW, AH], [AW, .05]);
  for (const z of [D / 2 + .1, -D / 2 - .1]) M(taperTube(ap.map(([x, y]) => [x * 1.04, y * 1.01, z]), () => .07, 48, 4), neon(0xff4fa8, 1.2), 1, 1, 1, 0, 0, 0, g).castShadow = false;
  const sprs = []; for (const [x, y] of [[-AW, 2.5], [AW, 2.5], [0, AH + AW]]) { const sp = makeGlowSprite(0xff5fb0, 4); sp.position.set(x, y, D / 2 + .4); g.add(sp); sprs.push(sp); }
  mergeStatic(g);
  const obs = []; for (const s of [-1, 1]) for (const x of [3.2, 4.6, 6.1]) obs.push([s * x, 0, .8]);
  return { g, obs, update(dt, t, ctx) { ctx = ctx || NOCTX; glowUpd(glows, ctx.night); sprUpd(sprs, ctx.night, t, .55); }, height: H + 3.7, title: 'Wall of Masks' };
}

// ============================================================ MORE DALÍ
let _antGeo = null;
function antGeo() {
  if (_antGeo) return _antGeo;
  const parts = [[G.oct, mtx(0, .03, -.065, 0, 0, 0, .032, .026, .05)], [G.oct, mtx(0, .032, 0, 0, 0, 0, .017, .015, .028)], [G.oct, mtx(0, .035, .045, 0, 0, 0, .022, .02, .022)]];
  for (const r of [.55, 0, -.55]) parts.push([G.box, mtx(0, .02, 0, 0, r, 0, .13, .006, .008)]);
  return (_antGeo = mergeGeo(parts));
}
// instanced ants wandering in lissajous loops: groups = [{n, cx, cz, rad, y, size}]
function antSwarm(parent, groups) {
  const n = groups.reduce((a, b) => a + b.n, 0), im = new THREE.InstancedMesh(antGeo(), mat(0x120d0a, { roughness: .35 }), n); im.castShadow = true; im.frustumCulled = false; parent.add(im);
  const D = new Float32Array(n * 8), rr = prng(n * 13); let i = 0;
  for (const gp of groups) for (let k = 0; k < gp.n; k++, i++) { const a = rr() * TAU, r0 = Math.sqrt(rr()) * gp.rad * .55, ax = (.15 + rr() * .3) * gp.rad, az = (.15 + rr() * .3) * gp.rad; D.set([gp.cx + Math.cos(a) * r0, gp.cz + Math.sin(a) * r0, ax, az, ((.25 + rr() * .2) * gp.size / Math.max(ax, az)) * (rr() < .5 ? 1 : -1), rr() * TAU, gp.size * (.8 + rr() * .4), gp.y], i * 8); }
  const e = _m1.elements;
  return function (t) {
    for (let i = 0; i < n; i++) {
      const o = i * 8, w = D[o + 4], a = t * w + D[o + 5], ax = D[o + 2], az = D[o + 3];
      const x = D[o] + ax * Math.sin(a), z = D[o + 1] + az * Math.sin(2 * a) * .5, dx = ax * w * Math.cos(a), dz = az * w * Math.cos(2 * a), h = Math.atan2(dx, dz), c = Math.cos(h), s = Math.sin(h), k = D[o + 6];
      e[0] = c * k; e[1] = 0; e[2] = -s * k; e[3] = 0; e[4] = 0; e[5] = k; e[6] = 0; e[7] = 0; e[8] = s * k; e[9] = 0; e[10] = c * k; e[11] = 0; e[12] = x; e[13] = D[o + 7] + .004 * k * Math.sin(t * 20 + i); e[14] = z; e[15] = 1;
      im.setMatrixAt(i, _m1);
    }
    im.instanceMatrix.needsUpdate = true;
  };
}
function solveKnee(H, An, L1, L2, bend, out) {
  _v2.subVectors(An, H); let dist = _v2.length(); _v2.multiplyScalar(1 / (dist || 1)); dist = Math.min(dist, (L1 + L2) * .999);
  const a = (L1 * L1 - L2 * L2 + dist * dist) / (2 * dist), h = Math.sqrt(Math.max(0, L1 * L1 - a * a));
  _v3.copy(bend).addScaledVector(_v2, -bend.dot(_v2)).normalize();
  out.copy(H).addScaledVector(_v2, a).addScaledVector(_v3, h);
}
const GOLD = () => mat(0xd9a63a, { roughness: .3, metalness: .6 });

// 18. Rhinocerontic bust: a figure made of rhinoceros horns
export function buildRhinoBust() {
  const g = new THREE.Group(), sprs = [];
  M(G.cyl, mat(0x2a1a14, { roughness: .6 }), 1.6, 1.2, 1.6, 0, .6, 0, g); M(G.torus, GOLD(), 1.62, 1.62, 1.5, 0, 1.2, 0, g).rotation.x = PI / 2;
  const rot = grp(g, 0, 1.2, 0);
  const core = mat(0x7a1a1a, { roughness: .3, metalness: .2 });
  M(lathe([[0, 0], [1.3, 0], [1.9, .8], [1.9, 1.6], [1.2, 2.4], [.55, 2.8], [0, 2.85]], 16), core, 1, 1, .7, 0, 0, 0, rot);
  M(G.sph, core, .85, 1.15, .95, 0, 3.9, 0, rot);
  const ivory = [], gold = [], rr = prng(1950);
  const addHorn = (P, N, L, r, list) => { const up = new THREE.Vector3(0, 1, 0), b = P.clone(), m1 = P.clone().addScaledVector(N, L * .5).addScaledVector(up, L * .08), tip = P.clone().addScaledVector(N, L).addScaledVector(up, L * .45); list.push([taperTube([b, m1, tip], (t) => r * Math.pow(1 - t, 1.2) + .012, 5, 5)]); };
  // head (fibonacci points on ellipsoid)
  for (let i = 0; i < 46; i++) { const y = 1 - (i + .5) / 46 * 2, rad = Math.sqrt(1 - y * y), a = i * 2.39996; const N = new THREE.Vector3(Math.cos(a) * rad, y, Math.sin(a) * rad); const P = new THREE.Vector3(N.x * .82, 3.9 + N.y * 1.1, N.z * .92); if (N.y < -.75) continue; addHorn(P, N.clone().add(new THREE.Vector3(0, .35, 0)).normalize(), .65 + rr() * .55, .2 + rr() * .1, i % 3 ? ivory : gold); }
  // shoulders
  for (let i = 0; i < 26; i++) { const a = i / 26 * TAU + rr() * .2, y = .7 + rr() * 1.6, r = y < 1.6 ? 1.9 : 1.9 - (y - 1.6) * .9; const N = new THREE.Vector3(Math.cos(a), .25 + rr() * .3, Math.sin(a) * .7).normalize(); addHorn(new THREE.Vector3(Math.cos(a) * r * .95, y, Math.sin(a) * r * .66), N, .8 + rr() * .7, .26 + rr() * .1, i % 4 ? ivory : gold); }
  M(mergeGeo(ivory), mat(0xeadfc6, { roughness: .35 }), 1, 1, 1, 0, 0, 0, rot); M(mergeGeo(gold), GOLD(), 1, 1, 1, 0, 0, 0, rot);
  const halo = M(G.torus, neon(0xffc84a, 1.1), 1.0, 1.0, .5, 0, 5.75, 0, rot); halo.rotation.x = PI / 2 - .15; halo.castShadow = false; keep(halo);
  const sp = makeGlowSprite(0xffb050, 6); sp.position.set(0, 4, 0); rot.add(sp); sprs.push(sp);
  mergeStatic(g);
  return { g, obs: [[0, 0, 1.7]], update(dt, t, ctx) { ctx = ctx || NOCTX; rot.rotation.y = t * .12; halo.position.y = 5.75 + .12 * Math.sin(t * 1.3); sprUpd(sprs, ctx.night, t, .5); }, height: 7.4, title: 'Rhinocerontic Bust' };
}

// 19. Metamorphosis of Narcissus: stone hand holding an egg with a narcissus
export function buildHandEgg() {
  const g = new THREE.Group(), sprs = [];
  const tiles = [[], []]; for (let i = 0; i < 6; i++) for (let j = 0; j < 6; j++) tiles[(i + j) % 2].push([G.box, mtx(-2.5 + i, .2, -2.5 + j, 0, 0, 0, 1, .4, 1)]);
  M(mergeGeo(tiles[0]), mat(0xe8dcc0, { roughness: .5 }), 1, 1, 1, 0, 0, 0, g); M(mergeGeo(tiles[1]), mat(0x2a2420, { roughness: .5 }), 1, 1, 1, 0, 0, 0, g);
  const stone = mat(0xa8957a, { roughness: .9, flatShading: true });
  M(lumpy(taperTube([[0, .3, -.2], [.05, 1.6, -.25], [0, 3.0, -.1]], lin(.75, .62), 8, 9), .04, 4, 2), stone, 1, 1, 1, 0, 0, 0, g);
  M(lumpy(new THREE.SphereGeometry(1, 10, 8), .06, 3, 4), stone, 1.05, .7, .85, 0, 3.4, 0, g);
  const fingers = [];
  for (const [x, z, h] of [[-.6, .25, 6.2], [-.2, .45, 6.55], [.22, .45, 6.5], [.6, .25, 6.1]]) fingers.push([lumpy(taperTube([[x, 3.4, z * .4], [x * 1.1, 4.4, z + .1], [x * 1.05, 5.4, z + .05], [x * .85, h, z - .15], [x * .7, h + .25, z - .35]], (t) => .26 - .08 * t + .03 * Math.sin(t * PI * 3), 12, 7), .05, 6, x * 10 + 7)]);
  fingers.push([taperTube([[-.9, 3.3, .3], [-1.3, 4.0, .8], [-1.1, 4.9, .9], [-.75, 5.5, .6]], lin(.3, .2), 8, 7)]);
  M(mergeGeo(fingers), stone, 1, 1, 1, 0, 0, 0, g);
  // egg + glowing crack + narcissus
  const egg = grp(g, 0, 7.45, .1);
  M(G.sph, mat(0xf3ede0, { roughness: .35 }), .78, 1.0, .78, 0, 0, 0, egg);
  const cp = []; for (let i = 0; i <= 14; i++) { const a = i / 14 * TAU; cp.push([Math.cos(a) * .79, .45 + (i % 2 ? .1 : -.08), Math.sin(a) * .79]); }
  M(taperTube(cp, () => .03, 42, 3, true), neon(0xffc040, 1.2), 1, 1, 1, 0, 0, 0, egg).castShadow = false;
  const fl = grp(egg, 0, .9, 0);
  M(taperTube([[0, 0, 0], [.1, .5, .05], [.05, 1.0, .15], [.15, 1.35, .35]], lin(.07, .04), 8, 5), mat(0x4f8a3a, { roughness: .7 }), 1, 1, 1, 0, 0, 0, fl);
  const head = grp(fl, .15, 1.4, .38); head.rotation.x = .9;
  const petals = []; for (let i = 0; i < 6; i++) { const a = i / 6 * TAU; petals.push([G.sphLo, new THREE.Matrix4().makeRotationY(a).multiply(mtx(0, 0, .38, -.15, 0, 0, .2, .04, .36))]); }
  M(mergeGeo(petals), mat(0xfaf7ee, { roughness: .5 }), 1, 1, 1, 0, 0, 0, head);
  M(new THREE.CylinderGeometry(.16, .1, .26, 10, 1, true), mat(0xf0a020, { roughness: .5, side: THREE.DoubleSide }), 1, 1, 1, 0, .13, 0, head);
  M(G.sphLo, neon(0xff8a20, 1.2), .07, .07, .07, 0, .08, 0, head).castShadow = false;
  const sp = makeGlowSprite(0xffd070, 4); sp.position.set(0, 0, 0); egg.add(sp); sprs.push(sp);
  // narcissus pool & ants
  M(G.circ, mat(0x2f6a90, { roughness: .05, metalness: .4 }), 1.1, 1.1, 1, 1.55, .42, 1.55, g).rotation.x = -PI / 2;
  const ants = antSwarm(g, [{ n: 20, cx: 0, cz: 0, rad: 3.2, y: .4, size: 3.2 }, { n: 6, cx: -.1, cz: .4, rad: 1.0, y: 3.95, size: 2.4 }]);
  mergeStatic(g);
  function update(dt, t, ctx) { ctx = ctx || NOCTX; fl.rotation.z = .06 * Math.sin(t * .9); fl.rotation.x = .04 * Math.sin(t * .7); ants(t); sprUpd(sprs, ctx.night, t, .6); }
  update(0, 0, NOCTX);
  return { g, obs: [[0, -.1, .85]], update, height: 9.6, title: 'Metamorphosis of Narcissus' };
}

// 20. Spindly-legged horse (Temptation of St Anthony)
export function buildSpindlyHorse() {
  const g = new THREE.Group(), BY = 12.6, body = grp(g, 0, BY, 0);
  const white = mat(0xebe5d8, { roughness: .55 }), grey = mat(0x8a847a, { roughness: .6 }), legM = mat(0x2a2522, { roughness: .6 }), knob = mat(0x4a403a, { roughness: .5 });
  body.rotation.x = -.22;
  M(G.sph, white, 1.05, 1.1, 2.3, 0, 0, 0, body);
  M(taperTube([[0, .4, 1.7], [0, 1.6, 2.4], [0, 2.7, 2.9]], lin(.7, .42), 10, 9), white, 1, 1, 1, 0, 0, 0, body);
  const head = grp(body, 0, 2.95, 3.1); head.rotation.x = .9;
  M(G.sph, white, .42, .5, 1.05, 0, 0, .5, head); M(G.sphLo, grey, .3, .3, .25, 0, -.08, 1.45, head);
  for (const s of [-1, 1]) { M(G.cone, white, .1, .4, .1, s * .22, .5, -.1, head); M(G.sphLo, mat(0x111111, { roughness: .2 }), .08, .08, .08, s * .36, .15, .4, head); }
  // flaming mane & tail
  const mane = []; for (let i = 0; i < 9; i++) { const u = i / 8; mane.push([G.cone, mtx(0, .9 + u * 2.1, 1.55 + u * 1.3, -.7, 0, 0, .22, .9 + .3 * Math.sin(i), .12)]); }
  M(mergeGeo(mane), grey, 1, 1, 1, 0, 0, 0, body);
  const tail = grp(body, 0, .4, -2.2); M(taperTube([[0, 0, 0], [0, -.4, -.9], [.2, -1.4, -1.4], [-.1, -2.8, -1.3], [.15, -3.6, -.9]], lin(.22, .04), 14, 6), grey, 1, 1, 1, 0, 0, 0, tail);
  // saddle cloth & golden plume
  M(new THREE.CylinderGeometry(1, 1, 1.6, 16, 1, true, -1.3, 2.6).rotateX(PI / 2).rotateZ(PI / 2), mat(0xb3121e, { roughness: .6, side: THREE.DoubleSide }), 1.12, 1.15, 1, 0, 0, -.2, body).rotation.z = -PI / 2;
  const plume = grp(body, 0, 1.1, -.2); for (let i = 0; i < 5; i++) M(G.cone, GOLD(), .12, 1.4, .12, 0, .7, 0, plume).rotation.set((i - 2) * .25, 0, (i - 2) * .12);
  M(G.sphLo, neon(0xffc04a, 1.1), .18, .18, .18, 0, 1.6, 0, plume).castShadow = false;
  // legs (IK)
  const legs = [], L1 = 6.7, L2 = 6.5, ord = [0, .5, .25, .75];
  [[.6, 1.5, 1], [-.6, 1.5, 1], [.6, -1.6, -1], [-.6, -1.6, -1]].forEach(([x, z, f], i) => {
    const l = { hip: new THREE.Vector3(x, -.6, z), foot0: new THREE.Vector3(x * 2.3, 0, z * 1.6 + f * .8), An: new THREE.Vector3(), H: new THREE.Vector3(), F: new THREE.Vector3(), K: new THREE.Vector3(), bend: new THREE.Vector3(0, 0, f), off: ord[i] };
    l.up = keep(M(G.cylLo, legM, 1, 1, 1, 0, 0, 0, g)); l.lo = keep(M(G.cylLo, legM, 1, 1, 1, 0, 0, 0, g)); l.kn = keep(M(G.sphLo, knob, .2, .2, .2, 0, 0, 0, g)); l.hf = keep(M(G.cylLo, knob, .2, .25, .2, 0, 0, 0, g));
    legs.push(l);
  });
  mergeStatic(g);
  function update(dt, t, ctx) {
    const ph = t * .25;
    body.position.y = BY + .25 * Math.sin(t * .5); body.rotation.z = .04 * Math.sin(t * .25); head.rotation.x = .9 + .1 * Math.sin(t * .6); tail.rotation.x = .15 * Math.sin(t * .8); tail.rotation.z = .1 * Math.sin(t * .55);
    body.updateMatrix();
    for (const l of legs) {
      const p = (ph + l.off) % 1, lift = p < .25 ? Math.sin(p / .25 * PI) * .9 : 0, fwd = p < .25 ? (p / .25 - .5) * .8 : .4 - (p - .25) / .75 * .8;
      l.F.set(l.foot0.x, lift, l.foot0.z + fwd); l.H.copy(l.hip).applyMatrix4(body.matrix);
      l.An.copy(l.F).setY(l.F.y + .25); solveKnee(l.H, l.An, L1, L2, l.bend, l.K);
      placeSeg(l.up, l.H, l.K, .13); placeSeg(l.lo, l.K, l.An, .09); l.kn.position.copy(l.K); l.hf.position.set(l.F.x, l.F.y + .12, l.F.z);
    }
  }
  update(0, 0, NOCTX);
  return { g, obs: legs.map(l => [l.foot0.x, l.foot0.z, .3]), update, height: 17, title: 'Spindly Horse (Temptation of St Anthony)' };
}

// 21. Giant pocket watch swarmed by ants
function watchLidTex() {
  if (TX.lid) return TX.lid; const S = 256, [c, x] = cnv(S, S);
  const gr = x.createRadialGradient(100, 90, 10, 128, 128, 140); gr.addColorStop(0, '#f6a050'); gr.addColorStop(.6, '#d8601c'); gr.addColorStop(1, '#a8400e'); x.fillStyle = gr; x.fillRect(0, 0, S, S);
  x.strokeStyle = 'rgba(120,40,0,.35)'; x.lineWidth = 1.2; for (let r = 8; r < 128; r += 7) { x.beginPath(); for (let k = 0; k <= 64; k++) { const a = k / 64 * TAU, rr = r + 2.5 * Math.sin(a * 12); k ? x.lineTo(128 + Math.cos(a) * rr, 128 + Math.sin(a) * rr) : x.moveTo(128 + Math.cos(a) * rr, 128 + Math.sin(a) * rr); } x.stroke(); }
  return (TX.lid = ctex(c));
}
export function buildAntsWatch() {
  const g = new THREE.Group(), R0 = 3, TH = .7;
  const lid = new THREE.MeshStandardMaterial({ map: watchLidTex(), roughness: .35, metalness: .35 });
  M(G.disc, lid, R0, TH, R0, 0, TH / 2 + .02, 0, g);
  M(G.torus, GOLD(), R0, R0, 2.4, 0, TH * .5, 0, g).rotation.x = PI / 2;
  M(G.sph, mat(0xd8601c, { roughness: .35, metalness: .3 }), R0 * .96, .18, R0 * .96, 0, TH, 0, g);
  M(G.cyl, GOLD(), .3, .7, .3, 0, TH * .5, R0 + .3, g).rotation.x = PI / 2; M(G.cyl, GOLD(), .42, .2, .42, 0, TH * .5, R0 + .7, g).rotation.x = PI / 2;
  M(new THREE.TorusGeometry(.75, .13, 8, 24), GOLD(), 1, 1, 1, 0, TH * .5 + .55, R0 + 1.25, g);
  // chain arcing over the sand
  const cp = []; for (let i = 0; i <= 24; i++) { const u = i / 24; cp.push([Math.sin(u * PI * .9) * 2.4 - .2 * u, Math.sin(u * PI) * 3.2 + .3, R0 + 1.9 + u * 3.6]); }
  const links = [], linkG = new THREE.TorusGeometry(1, .16, 3, 10); const cc = new THREE.CatmullRomCurve3(cp.map(V3)); for (let i = 0; i < 22; i++) { const u = i / 21, p = cc.getPointAt(u), tg = cc.getTangentAt(u); const m = new THREE.Matrix4().lookAt(new THREE.Vector3(), tg, _UP).multiply(new THREE.Matrix4().makeRotationZ(i % 2 ? PI / 2 : 0)).multiply(new THREE.Matrix4().makeRotationY(PI / 2)).multiply(new THREE.Matrix4().makeScale(.3, .17, .17)); m.setPosition(p); links.push([linkG, m]); }
  M(mergeGeo(links), GOLD(), 1, 1, 1, 0, 0, 0, g);
  const ants = antSwarm(g, [{ n: 32, cx: 0, cz: 0, rad: 4.2, y: TH + .17, size: 6.5 }, { n: 12, cx: 0, cz: 0, rad: 9, y: 0, size: 6.5 }]);
  mergeStatic(g);
  function update(dt, t) { ants(t); }
  update(0, 0);
  return { g, obs: [[0, 0, R0 + .1], [0, R0 + 1.25, .5]], update, height: 3.6, title: 'Ants on a Pocket Watch' };
}

// 22. The Anthropomorphic Cabinet
function makeDrawer(parent, x, y, z, w, h, d, out, o = {}) {
  const gg = grp(parent, x, y, z); if (o.ry) gg.rotation.y = o.ry; if (o.rx) gg.rotation.x = o.rx;
  const wood = o.wood, dark = mat(0x1c120c, { roughness: 1 });
  M(G.box, dark, w * 1.12, h * 1.18, .05, 0, 0, -.01, gg);
  const dr = grp(gg, 0, 0, out);
  M(G.box, wood, w * 1.06, h * 1.06, Math.max(.04, w * .06), 0, 0, 0, dr);
  M(G.box, wood, w, h * .08, d, 0, -h * .46, -d / 2, dr);
  M(G.box, wood, w * .06, h, d, -w * .47, 0, -d / 2, dr); M(G.box, wood, w * .06, h, d, w * .47, 0, -d / 2, dr);
  M(G.box, neon(0xffb35a, .7), w * .86, h * .05, d * .9, 0, -h * .38, -d / 2, dr).castShadow = false;
  M(G.sphLo, GOLD(), Math.min(w, h) * .14, Math.min(w, h) * .14, Math.min(w, h) * .14, 0, 0, w * .05, dr);
  if (o.cloth) M(slab([[-w * .3, 0], [w * .25, 0], [w * .35, -h * 1.6], [0, -h * 2.4], [-w * .2, -h * 1.8]], .03), mat(0xc0182a, { roughness: .8, side: THREE.DoubleSide }), 1, 1, 1, 0, -h * .3, w * .06, dr);
  return { dr, out, ph: rnd() * TAU };
}
export function buildAnthroCabinet() {
  const g = new THREE.Group(), skin = mat(0xd9b896, { roughness: .55 }), hair = mat(0x3a2418, { roughness: .8 }), drawers = [];
  M(G.box, mat(0x6a5a4a, { roughness: .95 }), 8.4, .12, 3.6, .5, .06, 0, g);
  // body reclining along +X (feet) with chest propped up at -X
  const tor = M(G.sph, skin, 1.7, 1.35, 1.05, -.6, 1.5, 0, g); tor.rotation.z = -.45;
  M(G.sph, skin, 1.35, 1.0, 1.1, 1.3, 1.05, 0, g);
  for (const s of [-1, 1]) M(taperTube([[1.6, 1.0, s * .45], [3.4, .75, s * .5 + .1], [4.6, .55, s * .45 + (s > 0 ? .5 : 0)], [6.0, .35, s * .4 + (s > 0 ? .9 : 0)]], lin(.6, .28), 12, 9), skin, 1, 1, 1, 0, 0, 0, g);
  for (const s of [-1, 1]) M(G.sphLo, skin, .38, .22, .25, 6.2, .22, s * .4 + (s > 0 ? .95 : 0), g);
  // arm propping the body + arm across
  M(taperTube([[-1.6, 2.6, .6], [-2.5, 1.4, 1.0], [-2.6, .3, 1.3], [-1.6, .25, 1.9]], lin(.36, .22), 12, 8), skin, 1, 1, 1, 0, 0, 0, g);
  M(taperTube([[-1.4, 2.7, -.6], [-.4, 2.0, -.95], [.6, 1.7, -1.0]], lin(.34, .22), 10, 8), skin, 1, 1, 1, 0, 0, 0, g);
  // drooping head with long hair
  const hd = grp(g, -1.6, 2.7, 0); hd.rotation.z = .05;
  M(taperTube([[0, 0, 0], [-.5, .3, .05], [-.85, .4, .1]], lin(.32, .26), 6, 8), skin, 1, 1, 1, 0, 0, 0, hd);
  M(G.sph, skin, .55, .66, .58, -1.05, .42, .2, hd);
  M(G.sph, hair, .62, .68, .62, -1.2, .58, 0, hd);
  M(taperTube([[-1.35, .5, 0], [-1.65, -.2, .05], [-1.75, -1.0, .1], [-1.65, -1.7, .2]], lin(.55, .22), 10, 8), hair, 1, 1, 1, 0, 0, 0, hd);
  // drawers in chest, belly and thigh
  const wood = mat(0x7a4a28, { roughness: .6 });
  for (const [x, y, z, w, h, out, cloth, ry, rx] of [[-1.1, 2.35, .9, .7, .32, .6, 0, .25, -.4], [-.3, 1.95, 1.0, .9, .38, .9, 1, .1, -.15], [-1.2, 1.5, 1.05, .6, .3, .35, 0, .3, 0], [-.1, 1.25, 1.08, .75, .32, .5, 0, 0, 0], [.95, 1.35, 1.12, .6, .3, .7, 1, -.1, -.1], [1.75, .95, 1.12, .55, .28, .3, 0, -.15, 0], [2.9, .95, .95, .5, .26, .55, 0, 0, -.1], [3.9, .75, 1.05, .45, .24, .4, 0, 0, 0]])
    drawers.push(makeDrawer(g, x, y, z, w, h, .7, out, { wood, cloth, ry, rx }));
  mergeStatic(g);
  function update(dt, t) { for (let i = 0; i < drawers.length; i++) { const d = drawers[i]; d.dr.position.z = d.out * (.55 + .45 * Math.sin(t * .4 + d.ph)); } hd.rotation.z = .05 + .04 * Math.sin(t * .3); }
  update(0, 0);
  return { g, obs: [[-1.0, 0, 1.4], [1.3, 0, 1.2], [3.2, 0, .8], [5.0, .3, .6], [-2.4, 1.3, .4]], update, height: 4.1, title: 'The Anthropomorphic Cabinet' };
}

// 23. Telephone tree
export function buildTelephoneTree() {
  const g = new THREE.Group(), wood = mat(0x5e4a3a, { roughness: .95, flatShading: true }), br = [];
  br.push([taperTube([[0, 0, 0], [.3, 1.6, .1], [-.2, 3.0, 0], [.1, 4.4, -.1]], (t) => .42 + .35 * Math.pow(1 - t, 4), 12, 8)]);
  for (const s of [-1, 1]) br.push([taperTube([[s * .2, .1, 0], [s * .9, -.05, .3], [s * 1.6, .05, .2]], lin(.28, .06), 5, 5)]);
  const tips = [];
  const branch = (p, r) => { br.push([taperTube(p, lin(r, .05), 10, 6)]); tips.push(p[p.length - 1]); };
  branch([[0, 3.6, 0], [1.4, 4.4, .2], [2.6, 5.0, .4], [3.5, 5.1, .6]], .22);
  branch([[0, 3.3, 0], [-1.3, 4.0, -.2], [-2.6, 4.6, -.3], [-3.3, 4.5, -.2]], .22);
  branch([[.1, 4.3, -.1], [.6, 5.5, -.7], [1.2, 6.4, -1.2], [1.6, 6.8, -1.6]], .17);
  branch([[.05, 4.2, 0], [-.6, 5.4, .6], [-1.4, 6.3, 1.0], [-2.0, 6.5, 1.2]], .17);
  branch([[.1, 2.6, 0], [.7, 3.0, 1.2], [1.0, 3.5, 2.2], [1.1, 3.6, 2.8]], .16);
  branch([[0, 4.5, -.1], [.0, 5.8, .2], [.2, 6.9, .1], [.1, 7.4, 0]], .14);
  M(mergeGeo(br), wood, 1, 1, 1, 0, 0, 0, g);
  const blk = mat(0x121214, { roughness: .25 }), cord = mat(0x1e1e22, { roughness: .4 });
  const hs = mergeGeo([[new THREE.CapsuleGeometry(.1, .9, 3, 8), mtx(0, 0, 0, 0, 0, PI / 2)], [G.cyl, mtx(-.5, -.12, 0, 0, 0, 0, .19, .14, .19)], [G.cyl, mtx(.5, -.12, 0, 0, 0, 0, .19, .14, .19)]]);
  const phones = [], sprs = [];
  tips.forEach((tp, i) => {
    const L = 1.0 + (i % 3) * .5, P3 = V3(tp), p = grp(g, P3.x, P3.y, P3.z); const c = M(G.cylLo, cord, .025, L, .025, 0, -L / 2, 0, p); c.castShadow = false;
    const h = M(hs, blk, 1, 1, 1, 0, -L - .1, 0, p); h.rotation.set(.2, i, .3);
    const sp = makeGlowSprite(0xff4040, 1.4); sp.position.set(0, -L - .1, 0); p.add(sp); sprs.push(sp);
    phones.push({ p, ph: i * 1.7, L });
  });
  // a few receivers fallen in the sand
  for (const [x, z, r] of [[1.8, 1.4, .4], [-1.5, 2.0, 2.1]]) { const h = M(hs, blk, 1, 1, 1, x, .12, z, g); h.rotation.set(-PI / 2, 0, r); }
  mergeStatic(g);
  let ring = 0;
  function update(dt, t, ctx) {
    ctx = ctx || NOCTX; let near = 0;
    if (ctx.playerPos) { _v1.copy(ctx.playerPos); g.worldToLocal(_v1); near = _v1.x * _v1.x + _v1.z * _v1.z < 81 ? 1 : 0; }
    ring += (near - ring) * Math.min(1, dt * 2); const burst = ring * ((t % 2.4) < 1.4 ? 1 : 0);
    for (let i = 0; i < phones.length; i++) { const q = phones[i]; q.p.rotation.z = .18 * Math.sin(t * 1.1 + q.ph) + burst * .1 * Math.sin(t * 31 + i); q.p.rotation.x = .12 * Math.sin(t * .8 + q.ph * 2); sprs[i].material.opacity = burst * (.5 + .5 * Math.sin(t * 20 + i)) * (.4 + .6 * ctx.night); }
  }
  return { g, obs: [[0, 0, .6]], update, height: 7.5, title: 'The Telephone Tree' };
}

// ============================================================ registry
export const MASTER_PIECES = [
  { id: 'monet_pond', artist: 'monet', title: 'Water Lilies & the Japanese Bridge', build: buildMonetPond, footprint: 14 },
  { id: 'monet_haystacks', artist: 'monet', title: 'Haystacks (Sunset)', build: buildMonetHaystacks, footprint: 10.5 },
  { id: 'monet_poppies', artist: 'monet', title: 'Poppy Field (Argenteuil)', build: buildMonetPoppies, footprint: 10.5 },
  { id: 'monet_easel', artist: 'monet', title: 'Impression, Sunrise (Easel)', build: buildMonetEasel, footprint: 4.5 },
  { id: 'vg_starry', artist: 'vangogh', title: 'The Starry Night', build: buildStarryNight, footprint: 10 },
  { id: 'vg_sunflowers', artist: 'vangogh', title: 'Sunflowers', build: buildSunflowers, footprint: 5.5 },
  { id: 'vg_cafe', artist: 'vangogh', title: 'Café Terrace at Night', build: buildCafeTerrace, footprint: 7.5 },
  { id: 'vg_cypress', artist: 'vangogh', title: 'Cypresses', build: buildCypresses, footprint: 6.5 },
  { id: 'vg_bust', artist: 'vangogh', title: 'Self-Portrait with Bandaged Ear', build: buildVanGoghBust, footprint: 4 },
  { id: 'vg_wheat', artist: 'vangogh', title: 'Wheatfield with Crows', build: buildWheatfield, footprint: 12.5 },
  { id: 'pic_masks', artist: 'picasso', title: 'Totem of Masks', build: buildMaskTotem, footprint: 2.2 },
  { id: 'pic_head', artist: 'picasso', title: 'Cubist Head', build: buildCubistHead, footprint: 3.5 },
  { id: 'pic_guitar', artist: 'picasso', title: 'Guitar (Cubist)', build: buildCubistGuitar, footprint: 3.5 },
  { id: 'pic_bull', artist: 'picasso', title: 'Guernica: Bull & Horse', build: buildGuernica, footprint: 6.5 },
  { id: 'pic_harlequin', artist: 'picasso', title: 'Harlequin (Rose Period)', build: buildHarlequin, footprint: 3.5 },
  { id: 'pic_weeping', artist: 'picasso', title: 'The Weeping Woman', build: buildWeepingWoman, footprint: 4.2 },
  { id: 'pic_mask_wall', artist: 'picasso', title: 'Wall of Masks', build: buildMaskWall, footprint: 7.5 },
  { id: 'dali_rhino', artist: 'dali', title: 'Rhinocerontic Bust', build: buildRhinoBust, footprint: 2.6 },
  { id: 'dali_hand_egg', artist: 'dali', title: 'Metamorphosis of Narcissus', build: buildHandEgg, footprint: 4.3 },
  { id: 'dali_spindly_horse', artist: 'dali', title: 'Spindly Horse (Temptation of St Anthony)', build: buildSpindlyHorse, footprint: 4.5 },
  { id: 'dali_ants_clock', artist: 'dali', title: 'Ants on a Pocket Watch', build: buildAntsWatch, footprint: 9.5 },
  { id: 'dali_cabinet', artist: 'dali', title: 'The Anthropomorphic Cabinet', build: buildAnthroCabinet, footprint: 4.6 },
  { id: 'dali_telephone_tree', artist: 'dali', title: 'The Telephone Tree', build: buildTelephoneTree, footprint: 4 },
];
