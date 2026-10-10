// artcars2.js — 12 more artist-inspired mutant vehicles ("art cars") for "Phoenix in the Dusty City"
// Same contract as artcars.js: each build() returns
//   { g, deck, seat, dancers, spot, poofers, anims, lasers, update(dt,t,ctx), length, height }
// g origin = ground centre, car faces +Z. ctx = { night: 0..1, speed: m/s } (may be undefined).
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
export function initArtCars2(api) { const d = defaultApi(); API = Object.assign(d, api || {}); if (!API.glowMap) API.glowMap = d.glowMap; }
const mat = (c, o) => A().mat(c, o);
const neon = (c, k) => A().neon(c, k);
// own (not game-managed) materials: textured with a night-glow emissive map, or a flat glowing colour
const texMat = (tex, o) => new THREE.MeshStandardMaterial(Object.assign({ map: tex, emissiveMap: tex, emissive: 0xffffff, emissiveIntensity: 0, roughness: .75 }, o || {}));
const glowMat = (c, o) => new THREE.MeshStandardMaterial(Object.assign({ color: c, emissive: c, emissiveIntensity: 0, roughness: .55 }, o || {}));

// ============================================================ small utils
let _seed = 1;
function rnd() { _seed |= 0; _seed = _seed + 0x6D2B79F5 | 0; let t = Math.imul(_seed ^ _seed >>> 15, 1 | _seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }
function srnd(s) { let a = s | 0; return () => { a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function hashStr(str) { let h = 2166136261; for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619); return h; }
function seedFrom(str) { _seed = hashStr(str); }
const R = (a, b) => a + rnd() * (b - a);
const NOCTX = { night: 0, speed: 0 };
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const _v1 = new THREE.Vector3();
const _UP = new THREE.Vector3(0, 1, 0);

function grp(parent, x = 0, y = 0, z = 0) { const g = new THREE.Group(); g.position.set(x, y, z); if (parent) parent.add(g); return g; }
function M(geo, m, sx = 1, sy = sx, sz = sx, x = 0, y = 0, z = 0, parent) {
  const o = new THREE.Mesh(geo, m); o.scale.set(sx, sy, sz); o.position.set(x, y, z);
  o.castShadow = true; o.receiveShadow = true; if (parent) parent.add(o); return o;
}
const noSh = (o) => { o.castShadow = false; return o; };
const keep = (o) => { o.userData.keep = true; return o; };
function cnv(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; }
function ctex(c, rep) { const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; if (rep) t.wrapS = t.wrapT = THREE.RepeatWrapping; return t; }
function rtex(t, rx, ry) { const c = t.clone(); c.repeat.set(rx, ry); c.wrapS = c.wrapT = THREE.RepeatWrapping; c.needsUpdate = true; return c; }
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
// batch sibling meshes sharing a material (per parent). Skips userData.keep, meshes with children, instanced meshes, multi-material meshes.
function mergeStatic(root) {
  const nodes = []; root.traverse(o => { if (!o.isMesh && !o.isSprite && !o.isLight) nodes.push(o); });
  for (const node of nodes) {
    const by = new Map();
    for (const c of node.children) if (c.isMesh && !c.isInstancedMesh && !c.userData.keep && !c.children.length && !Array.isArray(c.material)) { if (!by.has(c.material)) by.set(c.material, []); by.get(c.material).push(c); }
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
function glowSprite(color, scale) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: A().glowMap, color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 })); s.scale.setScalar(scale); return s; }
function makeLasers(n, colors, len) {
  const g = new THREE.Group(); const geo = new THREE.CylinderGeometry(.045, .045, len, 5, 1, true); geo.rotateX(PI / 2); geo.translate(0, 0, len / 2);
  const beams = []; for (let i = 0; i < n; i++) { const m = new THREE.MeshBasicMaterial({ color: new THREE.Color(colors[i % colors.length]).multiplyScalar(4), transparent: true, opacity: .55, blending: THREE.AdditiveBlending, depthWrite: false }); const b = new THREE.Mesh(geo, m); b.frustumCulled = false; b.userData.keep = true; g.add(b); beams.push({ b, ph: i / n * TAU, sp: R(.4, 1.1) }); }
  g.userData.beams = beams; g.visible = false; return g;
}
// thin prism-segment polylines (neon outlines)
class Kit {
  constructor() { this.P = []; }
  tri(a, b, c) { this.P.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]); }
  bar(a, b, w) {
    const P0 = V(...a), P1 = V(...b), d = P1.clone().sub(P0).normalize();
    const ref = Math.abs(d.y) < .9 ? _UP : V(1, 0, 0); const u = V().crossVectors(d, ref).normalize().multiplyScalar(w), v = V().crossVectors(d, u).normalize().multiplyScalar(w);
    P0.addScaledVector(d, -w * .7); P1.addScaledVector(d, w * .7);
    const cs = [[1, 1], [-1, 1], [-1, -1], [1, -1]];
    const ca = cs.map(([p, q]) => P0.clone().addScaledVector(u, p).addScaledVector(v, q).toArray()), cb = cs.map(([p, q]) => P1.clone().addScaledVector(u, p).addScaledVector(v, q).toArray());
    for (let i = 0; i < 4; i++) { const j = (i + 1) % 4; this.tri(ca[i], cb[i], cb[j]); this.tri(ca[i], cb[j], ca[j]); }
  }
  line(pts, w, closed) { for (let i = 0; i < pts.length - (closed ? 0 : 1); i++) this.bar(pts[i], pts[(i + 1) % pts.length], w); return this; }
  geo() { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(this.P, 3)); g.computeVertexNormals(); return g; }
}
const neonLine = (parent, pts, w, m, closed) => noSh(M(new Kit().line(pts, w, closed).geo(), m, 1, 1, 1, 0, 0, 0, parent));
// neon rectangle (deck rims etc.) in the XZ plane
function rectNeon(parent, w, l, y, zc, m, t = .07) { for (const s of [-1, 1]) { noSh(M(G.box, m, t, t, l, s * w / 2, y, zc, parent)); noSh(M(G.box, m, w, t, t, 0, y, zc + s * l / 2, parent)); } }

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
  tire: new THREE.CylinderGeometry(1, 1, 1, 16),
  hub: new THREE.CylinderGeometry(1, 1, 1, 10),
  ring: new THREE.TorusGeometry(1, .06, 4, 24),
  plane: new THREE.PlaneGeometry(1, 1),
};
// plane whose UVs pick a (cw x ch) block of cells from an n x n atlas (row 0 = top); flip mirrors U
function atlasGeo(n, col, row, cw = 1, ch = 1, flip = false) {
  const key = `at${n}_${col}_${row}_${cw}_${ch}_${flip ? 1 : 0}`; if (G[key]) return G[key];
  const geo = new THREE.PlaneGeometry(1, 1), uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) { let u = uv.getX(i); if (flip) u = 1 - u; uv.setXY(i, (col + u * cw) / n, (n - row - ch + uv.getY(i) * ch) / n); }
  return (G[key] = geo);
}
// two back-to-back planes facing +-X; the image's right side points to +Z (car front) from both sides
function sideCard(m, n, col, row, cw, ch, w, h, parent, x, y, z, gap = .02) {
  const g2 = grp(parent, x, y, z);
  noSh(M(atlasGeo(n, col, row, cw, ch, true), m, w, h, 1, gap, 0, 0, g2)).rotation.y = PI / 2;
  noSh(M(atlasGeo(n, col, row, cw, ch, false), m, w, h, 1, -gap, 0, 0, g2)).rotation.y = -PI / 2;
  return g2;
}
const cardMat = (tex, o) => texMat(tex, Object.assign({ alphaTest: .5, side: THREE.DoubleSide, roughness: .8 }, o || {}));

// ============================================================ textures
const TX = {};
// draw fn at (px,py) and at wrapped copies when the r-radius footprint crosses a tile edge
function wrapDraw(W, H, px, py, r, fn) { for (const ox of [0, -W, W]) for (const oy of [0, -H, H]) { if (ox && px - r >= 0 && px + r <= W) continue; if (oy && py - r >= 0 && py + r <= H) continue; fn(px + ox, py + oy); } }
function dotTex(key, base, pal, n, r0, r1, W = 512) {
  if (TX[key]) return TX[key]; const [c, x] = cnv(W, W), r = srnd(hashStr(key));
  x.fillStyle = base; x.fillRect(0, 0, W, W);
  for (let i = 0; i < n; i++) { const px = r() * W, py = r() * W, rr = r0 + r() * (r1 - r0), col = pal[(r() * pal.length) | 0]; x.fillStyle = col; wrapDraw(W, W, px, py, rr, (a, b) => { x.beginPath(); x.arc(a, b, rr, 0, TAU); x.fill(); }); }
  return (TX[key] = ctex(c, true));
}
function almondPath(x, a, b, w, h) { x.beginPath(); x.moveTo(a - w, b); x.quadraticCurveTo(a, b - h * 2, a + w, b); x.quadraticCurveTo(a, b + h * 2, a - w, b); x.closePath(); }
function petalFlower(x, cx, cy, R0, n, col, edge, center, inner) {
  x.fillStyle = col; x.strokeStyle = edge; x.lineWidth = Math.max(1.5, R0 * .06);
  for (let i = 0; i < n; i++) { const a = i / n * TAU; x.beginPath(); x.ellipse(cx + Math.cos(a) * R0 * .55, cy + Math.sin(a) * R0 * .55, R0 * .48, R0 * .3, a, 0, TAU); x.fill(); x.stroke(); }
  if (inner) { x.fillStyle = inner; for (let i = 0; i < n; i++) { const a = (i + .5) / n * TAU; x.beginPath(); x.ellipse(cx + Math.cos(a) * R0 * .32, cy + Math.sin(a) * R0 * .32, R0 * .3, R0 * .2, a, 0, TAU); x.fill(); } }
  x.fillStyle = center; x.beginPath(); x.arc(cx, cy, R0 * .22, 0, TAU); x.fill();
}

// ---------- Hokusai
function seigaihaTex() {
  if (TX.seig) return TX.seig; const N = 256, S = 64, [c, x] = cnv(N, N);
  x.fillStyle = '#163a6e'; x.fillRect(0, 0, N, N);
  const cols = ['#2a5f9e', '#dbe9f3', '#2a5f9e', '#dbe9f3', '#0f2f5c'];
  for (let j = -2; j <= 2 * N / S + 2; j++) for (let i = -1; i <= N / S + 1; i++) {
    const cx = i * S + (j & 1 ? S / 2 : 0), cy = j * S / 2;
    for (let k = 5; k >= 1; k--) { x.beginPath(); x.arc(cx, cy, S / 2 * k / 5, 0, TAU); x.fillStyle = cols[k - 1]; x.fill(); }
  }
  return (TX.seig = ctex(c, true));
}
function waveSideTex() {
  if (TX.wside) return TX.wside; const [c, x] = cnv(256, 256), r = srnd(12);
  const cols = ['#163f78', '#1d4e89', '#2d66a8', '#3f7abb', '#5a93c8'];
  for (let i = 0; i < 16; i++) { x.fillStyle = cols[(r() * cols.length) | 0]; x.fillRect(0, i * 16, 256, 16); }
  x.strokeStyle = '#e9f3fa'; x.lineWidth = 2.5; for (let i = 0; i < 16; i++) { x.globalAlpha = .45 + r() * .5; x.beginPath(); x.moveTo(0, i * 16 + 8); x.lineTo(256, i * 16 + 8); x.stroke(); }
  x.globalAlpha = 1; return (TX.wside = ctex(c, true));
}
// cap texture painted in shape space: canvas covers z [-4.5,4], y [-.5,8] (metres)
function waveCapTex(outer, inner) {
  if (TX.wcap) return TX.wcap; const N = 1024, [c, x] = cnv(N, N), r = srnd(9);
  const Z0 = -4.5, Y0 = -.5, k = N / 8.5, P = (z, y) => [(z - Z0) * k, N - (y - Y0) * k];
  x.fillStyle = '#123a70'; x.fillRect(0, 0, N, N);
  const nrm = outer.map((p, i) => { const a = outer[Math.max(0, i - 1)], b = outer[Math.min(outer.length - 1, i + 1)], tz = b.x - a.x, ty = b.y - a.y, l = Math.hypot(tz, ty) || 1; return [-ty / l, tz / l]; });
  const off = (d) => outer.map((p, i) => P(p.x - nrm[i][0] * d, p.y - nrm[i][1] * d));
  const poly = (pts, col, w) => { x.strokeStyle = col; x.lineWidth = w; x.beginPath(); x.moveTo(pts[0][0], pts[0][1]); for (const q of pts) x.lineTo(q[0], q[1]); x.stroke(); };
  x.lineCap = 'round'; x.lineJoin = 'round';
  const bands = ['#f4f9fd', '#bcd8ee', '#86b6dc', '#5f98cb', '#447fbe', '#2f6aac', '#245a98', '#1d4c88', '#17427c', '#133a70'];
  for (let i = bands.length - 1; i >= 0; i--) poly(off(.1 + i * .2), bands[i], .26 * k);
  for (let i = 1; i < 16; i++) { x.globalAlpha = Math.max(.15, .9 - i * .05); poly(off(i * .2), '#eaf4fb', 2.5); }
  x.globalAlpha = 1;
  poly(off(0), '#ffffff', .16 * k);
  for (let i = Math.floor(outer.length * .35); i < outer.length; i++) for (let j = 0; j < 7; j++) { const d = r() * .45, p = P(outer[i].x - nrm[i][0] * d, outer[i].y - nrm[i][1] * d); x.fillStyle = r() < .7 ? '#ffffff' : '#cfe6f6'; x.beginPath(); x.arc(p[0], p[1], 3 + r() * 9, 0, TAU); x.fill(); }
  poly(inner.map(p => P(p.x, p.y)), '#0b2550', .22 * k);
  return (TX.wcap = ctex(c));
}
function fujiTex() {
  if (TX.fuji) return TX.fuji; const [c, x] = cnv(256, 128), r = srnd(14);
  const gr = x.createLinearGradient(0, 0, 0, 128); gr.addColorStop(0, '#3a5f9a'); gr.addColorStop(1, '#16305c'); x.fillStyle = gr; x.fillRect(0, 0, 256, 128);
  x.fillStyle = '#f6f8fb'; x.beginPath(); x.moveTo(0, 0); x.lineTo(256, 0);
  for (let i = 16; i >= 0; i--) { const px = i * 16; x.lineTo(px, 38 + (i % 2 ? 22 + r() * 18 : r() * 8)); }
  x.closePath(); x.fill();
  return (TX.fuji = ctex(c));
}
// ---------- Kahlo
function casaAzulTex() {
  if (TX.casa) return TX.casa; const W = 1024, H = 256, [c, x] = cnv(W, H), r = srnd(31);
  x.fillStyle = '#1d4fd8'; x.fillRect(0, 0, W, H);
  x.fillStyle = '#d4202a'; x.fillRect(0, 0, W, 22); x.fillRect(0, H - 20, W, 20);
  x.fillStyle = '#2bb24c'; x.fillRect(0, 22, W, 6); x.fillRect(0, H - 26, W, 6);
  // watermelon slices ("Viva la Vida")
  for (const [cx, cy, a] of [[110, 150, -.3], [380, 168, .25], [620, 150, -.15], [900, 166, .3]]) {
    x.save(); x.translate(cx, cy); x.rotate(a);
    x.fillStyle = '#1f7a2e'; x.beginPath(); x.arc(0, 0, 62, 0, PI); x.fill(); x.fillStyle = '#d8f0b0'; x.beginPath(); x.arc(0, 0, 54, 0, PI); x.fill();
    x.fillStyle = '#e8243c'; x.beginPath(); x.arc(0, 0, 48, 0, PI); x.fill();
    x.fillStyle = '#111'; for (let i = 0; i < 7; i++) { const aa = .3 + i * .4, rr = 22 + (i % 2) * 12; x.beginPath(); x.ellipse(Math.cos(aa) * rr, Math.sin(aa) * rr, 3, 5, aa, 0, TAU); x.fill(); }
    x.restore();
  }
  for (let i = 0; i < 18; i++) { const px = 30 + i * 56 + r() * 20, py = 58 + r() * 20; petalFlower(x, px, py, 14 + r() * 6, 6, ['#ffd23f', '#ff6fae', '#ff8c1a', '#ffffff'][i % 4], 'rgba(0,0,0,.25)', '#c8102e'); }
  x.font = 'bold 54px Georgia, "Times New Roman", serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillStyle = '#111'; x.fillText('VIVA LA VIDA', W / 2 + 3, 113); x.fillStyle = '#ffd23f'; x.fillText('VIVA LA VIDA', W / 2, 110);
  return (TX.casa = ctex(c, true));
}
function fridaTex() {
  if (TX.frida) return TX.frida; const S = 512, [c, x] = cnv(S, S), r = srnd(77);
  const leaf = (bx, by, a, len, w, col) => { x.save(); x.translate(bx, by); x.rotate(a); x.fillStyle = col; x.beginPath(); x.moveTo(0, 0); x.quadraticCurveTo(len * .5, -w, len, 0); x.quadraticCurveTo(len * .5, w, 0, 0); x.fill(); x.strokeStyle = 'rgba(10,40,15,.75)'; x.lineWidth = 3; x.beginPath(); x.moveTo(10, 0); x.lineTo(len * .92, 0); x.stroke(); x.restore(); };
  for (let i = 0; i < 17; i++) { const a = PI * .9 + i / 16 * PI * 1.2; leaf(256, 300, a + (r() - .5) * .12, 175 + r() * 70, 30 + r() * 18, i % 2 ? '#2f8a3e' : '#1b5a2a'); }
  // blouse
  x.fillStyle = '#c8102e'; x.beginPath(); x.moveTo(96, 512); x.bezierCurveTo(110, 430, 160, 396, 230, 392); x.lineTo(282, 392); x.bezierCurveTo(352, 396, 402, 430, 416, 512); x.closePath(); x.fill();
  x.fillStyle = '#ffd23f'; for (let i = 0; i < 26; i++) { const a = PI * 1.05 + i / 25 * PI * .9; x.beginPath(); x.arc(256 + Math.cos(a) * 120, 520 + Math.sin(a) * 110, 6, 0, TAU); x.fill(); }
  x.fillStyle = '#2bb24c'; for (let i = 0; i < 25; i++) { const a = PI * 1.07 + i / 24 * PI * .86; x.beginPath(); x.arc(256 + Math.cos(a) * 100, 520 + Math.sin(a) * 90, 4, 0, TAU); x.fill(); }
  // neck
  x.fillStyle = '#b97a4e'; x.fillRect(222, 320, 68, 92);
  // back hair
  x.fillStyle = '#120a06'; x.beginPath(); x.ellipse(256, 240, 108, 122, 0, 0, TAU); x.fill();
  // face
  const fg = x.createRadialGradient(250, 245, 10, 256, 250, 110); fg.addColorStop(0, '#dca878'); fg.addColorStop(1, '#b77a4c');
  x.fillStyle = fg; x.beginPath(); x.ellipse(256, 252, 80, 102, 0, 0, TAU); x.fill();
  // hair cap with centre part
  x.fillStyle = '#120a06'; x.beginPath(); x.moveTo(170, 240); x.bezierCurveTo(165, 150, 220, 116, 256, 120); x.bezierCurveTo(292, 116, 347, 150, 342, 240);
  x.quadraticCurveTo(332, 192, 290, 182); x.quadraticCurveTo(264, 179, 256, 190); x.quadraticCurveTo(248, 179, 222, 182); x.quadraticCurveTo(180, 192, 170, 240); x.fill();
  x.strokeStyle = '#8a5a3a'; x.lineWidth = 3; x.beginPath(); x.moveTo(256, 122); x.lineTo(256, 186); x.stroke();
  // flower crown
  for (const [fx, fy, rr, col, inn] of [[160, 182, 34, '#e8243c', '#a8101e'], [196, 136, 38, '#ff3fa4', '#c01070'], [256, 112, 42, '#ffd23f', '#ff8c1a'], [316, 136, 38, '#ff8c1a', '#e05a10'], [352, 182, 34, '#e8243c', '#a8101e']]) {
    leaf(fx, fy, -PI / 2 + (fx - 256) * .01, rr * 1.4, rr * .35, '#2f8a3e');
    petalFlower(x, fx, fy, rr, 8, col, 'rgba(60,0,0,.5)', '#3a1a08', inn);
  }
  // unibrow
  x.strokeStyle = '#0c0604'; x.lineWidth = 9; x.lineCap = 'round'; x.beginPath(); x.moveTo(204, 224); x.quadraticCurveTo(228, 207, 250, 216); x.quadraticCurveTo(256, 220, 262, 216); x.quadraticCurveTo(284, 207, 308, 224); x.stroke();
  // eyes
  for (const ex of [229, 283]) { almondPath(x, ex, 240, 17, 6.5); x.fillStyle = '#f1e6d6'; x.fill(); x.fillStyle = '#2a1408'; x.beginPath(); x.arc(ex, 240, 7, 0, TAU); x.fill(); x.strokeStyle = '#120a06'; x.lineWidth = 3; almondPath(x, ex, 240, 17, 6.5); x.stroke(); }
  // nose, moustache shadow, lips
  x.strokeStyle = '#8a5434'; x.lineWidth = 3; x.beginPath(); x.moveTo(252, 244); x.lineTo(247, 282); x.quadraticCurveTo(256, 292, 268, 284); x.stroke();
  x.strokeStyle = 'rgba(40,20,10,.35)'; x.lineWidth = 4; x.beginPath(); x.moveTo(238, 300); x.quadraticCurveTo(256, 296, 274, 300); x.stroke();
  x.fillStyle = '#a3192b'; x.beginPath(); x.moveTo(232, 313); x.quadraticCurveTo(244, 302, 256, 308); x.quadraticCurveTo(268, 302, 280, 313); x.quadraticCurveTo(256, 330, 232, 313); x.fill();
  x.fillStyle = 'rgba(200,60,60,.18)'; for (const ex of [210, 302]) { x.beginPath(); x.arc(ex, 280, 20, 0, TAU); x.fill(); }
  // earrings + jade necklace
  x.fillStyle = '#e8b22a'; for (const ex of [176, 336]) { x.beginPath(); x.arc(ex, 272, 7, 0, TAU); x.fill(); x.beginPath(); x.ellipse(ex, 292, 6, 11, 0, 0, TAU); x.fill(); }
  x.fillStyle = '#2fae7a'; for (let i = 0; i < 9; i++) { const a = PI * .2 + i / 8 * PI * .6; x.beginPath(); x.arc(256 + Math.cos(a) * 52, 372 + Math.sin(a) * 34, 8, 0, TAU); x.fill(); }
  return (TX.frida = ctex(c));
}
function kahloFlowerTex() {
  if (TX.kflow) return TX.kflow; const S = 256, [c, x] = cnv(512, 512), r = srnd(55);
  const cell = (i, fn) => { x.save(); x.translate((i % 2) * S, ((i / 2) | 0) * S); fn(); x.restore(); };
  // marigold: ruffled rings
  cell(0, () => { for (let ring = 0; ring < 5; ring++) { const rr = 118 - ring * 22, n = 22 - ring * 3; for (let i = 0; i < n; i++) { const a = i / n * TAU + ring * .3; x.fillStyle = ['#ff8c00', '#ffa31a', '#ffb52e', '#ff7a00', '#ffc23a'][ring]; x.strokeStyle = 'rgba(150,50,0,.55)'; x.lineWidth = 2; x.beginPath(); x.ellipse(128 + Math.cos(a) * rr * .62, 128 + Math.sin(a) * rr * .62, rr * .38, rr * .2, a, 0, TAU); x.fill(); x.stroke(); } } x.fillStyle = '#a84a00'; x.beginPath(); x.arc(128, 128, 14, 0, TAU); x.fill(); });
  // rose: spiral
  cell(1, () => { x.fillStyle = '#c8102e'; x.beginPath(); x.arc(128, 128, 116, 0, TAU); x.fill(); x.strokeStyle = '#7a0618'; x.lineWidth = 6; x.lineCap = 'round'; x.beginPath(); for (let i = 0; i <= 80; i++) { const u = i / 80, a = u * 4.2 * TAU, rr = 6 + 104 * u; const px = 128 + Math.cos(a) * rr, py = 128 + Math.sin(a) * rr * .92; i ? x.lineTo(px, py) : x.moveTo(px, py); } x.stroke(); x.strokeStyle = 'rgba(255,120,140,.6)'; x.lineWidth = 3; x.beginPath(); for (let i = 0; i <= 80; i++) { const u = i / 80, a = u * 4.2 * TAU + .4, rr = 10 + 100 * u; const px = 128 + Math.cos(a) * rr, py = 128 + Math.sin(a) * rr * .92; i ? x.lineTo(px, py) : x.moveTo(px, py); } x.stroke(); });
  // magenta dahlia: pointed petals
  cell(2, () => { for (let ring = 0; ring < 4; ring++) { const n = 16 - ring * 2, rr = 120 - ring * 26; for (let i = 0; i < n; i++) { const a = i / n * TAU + ring * .2; x.save(); x.translate(128, 128); x.rotate(a); x.fillStyle = ['#e0218a', '#f0409c', '#ff6ab4', '#ff9acb'][ring]; x.strokeStyle = 'rgba(90,0,40,.5)'; x.lineWidth = 2; x.beginPath(); x.moveTo(0, 0); x.quadraticCurveTo(rr * .5, -rr * .16, rr, 0); x.quadraticCurveTo(rr * .5, rr * .16, 0, 0); x.fill(); x.stroke(); x.restore(); } } x.fillStyle = '#ffd23f'; x.beginPath(); x.arc(128, 128, 13, 0, TAU); x.fill(); });
  // purple bougainvillea / anemone
  cell(3, () => { petalFlower(x, 128, 128, 112, 6, '#8a2bd0', 'rgba(30,0,60,.6)', '#111', '#b46ff0'); for (let i = 0; i < 14; i++) { const a = r() * TAU; x.fillStyle = '#ffd23f'; x.beginPath(); x.arc(128 + Math.cos(a) * 26, 128 + Math.sin(a) * 26, 3, 0, TAU); x.fill(); } });
  return (TX.kflow = ctex(c));
}
function papelTex() {
  if (TX.papel) return TX.papel; const [c, x] = cnv(128, 160);
  x.fillStyle = '#fff'; x.fillRect(0, 0, 128, 160);
  x.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 8; i++) { x.beginPath(); x.arc(8 + i * 16, 160, 8, 0, TAU); x.fill(); }
  x.lineWidth = 3; x.strokeStyle = '#000'; x.strokeRect(10, 14, 108, 124);
  for (let i = 0; i < 8; i++) { const a = i / 8 * TAU; x.beginPath(); x.ellipse(64 + Math.cos(a) * 20, 74 + Math.sin(a) * 20, 10, 5, a, 0, TAU); x.fill(); }
  x.beginPath(); x.arc(64, 74, 6, 0, TAU); x.fill();
  for (const [px, py] of [[24, 28], [104, 28], [24, 122], [104, 122], [64, 26], [64, 124], [22, 74], [106, 74]]) { x.beginPath(); x.moveTo(px, py - 7); x.lineTo(px + 5, py); x.lineTo(px, py + 7); x.lineTo(px - 5, py); x.fill(); }
  x.globalCompositeOperation = 'source-over';
  return (TX.papel = ctex(c));
}
// ---------- Klimt
function goldTex() {
  if (TX.gold) return TX.gold; const W = 1024, H = 512, [c, x] = cnv(W, H), r = srnd(808), pk = a => a[(r() * a.length) | 0];
  x.fillStyle = '#c9952e'; x.fillRect(0, 0, W, H);
  for (let i = 0; i < 9000; i++) { const px = r() * W, py = r() * H, s = 5 + r() * 7; x.fillStyle = pk(['#e2b548', '#f1d27a', '#b8842a', '#d6a63e', '#a87726', '#f6e3a0']); x.fillRect(px, py, s, s * (.8 + r() * .4)); }
  const W2 = (px, py, rr, fn) => wrapDraw(W, H, px, py, rr, fn);
  for (let i = 0; i < 28; i++) {
    const w = 22 + r() * 24, h = 46 + r() * 56, px = r() * W, py = r() * H, dark = r() < .6;
    W2(px, py, Math.max(w, h), (a, b) => { x.fillStyle = dark ? '#151010' : '#f4efe4'; x.fillRect(a - w / 2, b - h / 2, w, h); x.fillStyle = dark ? '#f4efe4' : '#151010'; for (let k = 0; k < 3; k++) for (let q = 0; q < 2; q++) x.fillRect(a - w / 2 + 4 + q * w / 2, b - h / 2 + 5 + k * h / 3, w / 2 - 8, h / 3 - 10); });
  }
  const spiral = (a, b, R0) => { x.strokeStyle = '#3a2408'; x.lineWidth = 3.5; x.beginPath(); for (let k = 0; k <= 60; k++) { const u = k / 60, ang = u * 3 * TAU, rr = R0 * u; const px = a + Math.cos(ang) * rr, py = b + Math.sin(ang) * rr; k ? x.lineTo(px, py) : x.moveTo(px, py); } x.stroke(); };
  for (let i = 0; i < 34; i++) { const px = r() * W, py = r() * H, R0 = 16 + r() * 24; W2(px, py, R0 + 4, (a, b) => { x.fillStyle = '#efc95e'; x.beginPath(); x.arc(a, b, R0 + 3, 0, TAU); x.fill(); spiral(a, b, R0); }); }
  for (let i = 0; i < 18; i++) {
    const px = r() * W, py = r() * H, w = 26 + r() * 14, h = w * .42, iris = pk(['#2c5fbf', '#b8322a', '#2f8a5a']);
    W2(px, py, w + 4, (a, b) => { almondPath(x, a, b, w, h); x.fillStyle = '#f6f0e0'; x.fill(); x.strokeStyle = '#1a1008'; x.lineWidth = 3; x.stroke(); x.fillStyle = iris; x.beginPath(); x.arc(a, b, h * .9, 0, TAU); x.fill(); x.fillStyle = '#111'; x.beginPath(); x.arc(a, b, h * .4, 0, TAU); x.fill(); });
  }
  for (let i = 0; i < 30; i++) {
    const R0 = 10 + r() * 20, px = r() * W, py = r() * H, col = pk(['#3b5bbf', '#c0392b', '#7b4a9c', '#3e8e5a', '#e07a9a']);
    W2(px, py, R0 + 2, (a, b) => { x.fillStyle = col; x.beginPath(); x.arc(a, b, R0, 0, TAU); x.fill(); x.strokeStyle = '#f6e3a0'; x.lineWidth = 3; x.beginPath(); x.arc(a, b, R0 * .62, 0, TAU); x.stroke(); x.fillStyle = '#111'; x.beginPath(); x.arc(a, b, R0 * .2, 0, TAU); x.fill(); });
  }
  return (TX.gold = ctex(c, true));
}
function robeTex() {
  if (TX.robe) return TX.robe; const S = 512, [c, x] = cnv(S, S), r = srnd(909), pk = a => a[(r() * a.length) | 0];
  x.drawImage(goldTex().image, 0, 0, 512, 512, 0, 0, 512, 512);
  // man's half: black & white rectangles
  for (let i = 0; i < 46; i++) { const w = 18 + r() * 22, h = 40 + r() * 60, px = r() * (S / 2 - w), py = r() * (S - h); x.fillStyle = r() < .55 ? '#121010' : r() < .6 ? '#f4efe4' : '#8a8a8a'; x.fillRect(px, py, w, h); x.strokeStyle = '#d6a63e'; x.lineWidth = 2; x.strokeRect(px, py, w, h); }
  // woman's half: flower circles
  for (let i = 0; i < 60; i++) { const R0 = 8 + r() * 18, px = S / 2 + R0 + r() * (S / 2 - 2 * R0), py = r() * S; x.fillStyle = pk(['#3b5bbf', '#c0392b', '#7b4a9c', '#e07a9a', '#3e8e5a', '#f2e6c8']); x.beginPath(); x.arc(px, py, R0, 0, TAU); x.fill(); x.strokeStyle = '#f6e3a0'; x.lineWidth = 2; x.beginPath(); x.arc(px, py, R0 * .6, 0, TAU); x.stroke(); x.fillStyle = '#f6e3a0'; x.beginPath(); x.arc(px, py, R0 * .2, 0, TAU); x.fill(); }
  return (TX.robe = ctex(c));
}
function meadowTex() { return dotTex('meadow', '#2f6b2a', ['#ff6ab4', '#ffd23f', '#6aa8ff', '#ffffff', '#ff3b3b', '#48b03a', '#8ad85a'], 1400, 4, 10, 256); }
// ---------- Mondrian: Broadway Boogie Woogie deck
function bbwTex() {
  if (TX.bbw) return TX.bbw; const W = 512, H = 1024, [c, x] = cnv(W, H), r = srnd(1942);
  x.fillStyle = '#efeadb'; x.fillRect(0, 0, W, H);
  const vx = [34, 140, 262, 372, 470], hy = [40, 150, 300, 420, 560, 690, 830, 960], LW = 16;
  const sq = () => ['#d8231d', '#1f4fb8', '#b9b6ae', '#d8231d'][(r() * 4) | 0];
  // big blocks
  for (const [px, py, w, h, col, inner] of [[60, 190, 70, 90, '#d8231d', '#b9b6ae'], [300, 460, 60, 80, '#1f4fb8', '#f2c51f'], [170, 720, 80, 60, '#f2c51f', '#d8231d'], [400, 860, 56, 70, '#d8231d', '#1f4fb8'], [190, 330, 50, 50, '#1f4fb8', '#efeadb']]) { x.fillStyle = col; x.fillRect(px, py, w, h); x.fillStyle = inner; x.fillRect(px + w * .3, py + h * .3, w * .4, h * .4); }
  x.fillStyle = '#f2c51f'; for (const px of vx) x.fillRect(px - LW / 2, 0, LW, H); for (const py of hy) x.fillRect(0, py - LW / 2, W, LW);
  for (const px of vx) for (let py = 8; py < H; py += 22 + r() * 30) { x.fillStyle = sq(); x.fillRect(px - LW / 2, py, LW, LW); }
  for (const py of hy) for (let px = 8; px < W; px += 22 + r() * 30) { x.fillStyle = sq(); x.fillRect(px, py - LW / 2, LW, LW); }
  return (TX.bbw = ctex(c));
}
// ---------- Kandinsky
function kandHullTex() {
  if (TX.kandHull) return TX.kandHull; const W = 1024, H = 256, [c, x] = cnv(W, H), r = srnd(1923), pk = a => a[(r() * a.length) | 0];
  const gr = x.createLinearGradient(0, 0, W, H); gr.addColorStop(0, '#efe6cc'); gr.addColorStop(.5, '#e8dcbc'); gr.addColorStop(1, '#efe6cc'); x.fillStyle = gr; x.fillRect(0, 0, W, H);
  const cols = ['#d8231d', '#1f4fb8', '#f2c51f', '#7b3fa6', '#1f9e5a', '#f08a24', '#e86aa0'];
  for (let i = 0; i < 9; i++) { const px = r() * W, py = 40 + r() * 170, R0 = 14 + r() * 40; x.fillStyle = pk(cols); x.beginPath(); x.arc(px, py, R0, 0, TAU); x.fill(); x.strokeStyle = '#111'; x.lineWidth = 3 + r() * 4; x.beginPath(); x.arc(px, py, R0 * (1 + r() * .3), 0, TAU); x.stroke(); }
  for (let i = 0; i < 7; i++) { const px = r() * W, py = 40 + r() * 170, s = 30 + r() * 50; x.fillStyle = pk(cols); x.beginPath(); x.moveTo(px, py - s * .6); x.lineTo(px + s * .55, py + s * .4); x.lineTo(px - s * .55, py + s * .4); x.closePath(); x.fill(); x.strokeStyle = '#111'; x.lineWidth = 3; x.stroke(); }
  for (let i = 0; i < 5; i++) { const px = r() * (W - 70), py = 30 + r() * 160, n = 4; for (let a = 0; a < n; a++) for (let b = 0; b < n; b++) { x.fillStyle = (a + b) % 2 ? '#111' : (r() < .25 ? pk(cols) : '#f6f0de'); x.fillRect(px + a * 13, py + b * 13, 13, 13); } }
  x.strokeStyle = '#111'; for (let i = 0; i < 22; i++) { x.lineWidth = 1.5 + r() * 3; x.beginPath(); const px = r() * W, py = r() * H, a = r() * PI, l = 80 + r() * 260; x.moveTo(px, py); x.lineTo(px + Math.cos(a) * l, py + Math.sin(a) * l); x.stroke(); }
  for (let i = 0; i < 6; i++) { x.lineWidth = 3; x.strokeStyle = pk(['#111', '#7b3fa6', '#1f4fb8']); x.beginPath(); x.arc(r() * W, r() * H, 30 + r() * 50, r() * TAU, r() * TAU + 2); x.stroke(); }
  x.fillStyle = '#d8231d'; x.fillRect(0, H - 10, W, 10); x.fillStyle = '#111'; x.fillRect(0, 0, W, 6);
  return (TX.kandHull = ctex(c, true));
}
function kandAtlas() {
  if (TX.kand) return TX.kand; const S = 256, [c, x] = cnv(1024, 1024), r = srnd(8);
  const cell = (i, fn) => { x.save(); x.translate((i % 4) * S + 128, ((i / 4) | 0) * S + 128); fn(); x.restore(); };
  const disc = (rr, col, ox = 0, oy = 0) => { x.fillStyle = col; x.beginPath(); x.arc(ox, oy, rr, 0, TAU); x.fill(); };
  const ring = (rr, col, w) => { x.strokeStyle = col; x.lineWidth = w; x.beginPath(); x.arc(0, 0, rr, 0, TAU); x.stroke(); };
  cell(0, () => { const g2 = x.createRadialGradient(0, 0, 60, 0, 0, 118); g2.addColorStop(0, '#5a1a8a'); g2.addColorStop(.7, '#9b4fd0'); g2.addColorStop(1, '#e48ad8'); disc(118, g2); disc(78, '#0e0b12'); disc(30, '#e0281f', 16, -14); ring(116, '#111', 5); });
  cell(1, () => { disc(116, '#f2c51f'); ring(78, '#1f4fb8', 22); disc(28, '#d8231d'); ring(114, '#111', 4); });
  cell(2, () => { disc(116, '#f0a0b0'); ring(86, '#111', 12); disc(36, '#111'); disc(12, '#f2c51f'); });
  cell(3, () => { disc(116, '#1f4fb8'); ring(76, '#f6f0de', 10); disc(26, '#f2c51f'); ring(114, '#111', 4); });
  const tri = (fill) => { x.beginPath(); x.moveTo(0, -112); x.lineTo(112, 98); x.lineTo(-112, 98); x.closePath(); x.fillStyle = fill; x.fill(); };
  cell(4, () => { tri('#f2c51f'); x.lineWidth = 7; x.strokeStyle = '#111'; x.stroke(); x.beginPath(); x.moveTo(0, 10); x.lineTo(42, 80); x.lineTo(-42, 80); x.closePath(); x.fillStyle = '#1f4fb8'; x.fill(); });
  cell(5, () => { tri('#d8231d'); x.save(); x.clip(); x.fillStyle = '#111'; x.fillRect(-128, -128, 128, 256); x.restore(); x.lineWidth = 6; x.strokeStyle = '#111'; tri('rgba(0,0,0,0)'); x.stroke(); });
  cell(6, () => { const n = 6, s = 36; for (let a = 0; a < n; a++) for (let b = 0; b < n; b++) { x.fillStyle = (a + b) % 2 ? '#111' : '#f6f0de'; if (r() < .18) x.fillStyle = ['#d8231d', '#f2c51f', '#1f4fb8'][(r() * 3) | 0]; x.fillRect(-108 + a * s, -108 + b * s, s, s); } x.strokeStyle = '#111'; x.lineWidth = 5; x.strokeRect(-108, -108, 216, 216); });
  cell(7, () => { x.fillStyle = '#f08a24'; x.beginPath(); x.arc(0, 40, 112, PI, TAU); x.closePath(); x.fill(); x.strokeStyle = '#1f4fb8'; x.lineWidth = 14; x.beginPath(); x.arc(0, 40, 70, PI, TAU); x.stroke(); x.strokeStyle = '#111'; x.lineWidth = 6; x.beginPath(); x.arc(0, 40, 112, PI, TAU); x.closePath(); x.stroke(); });
  cell(8, () => { const cs = ['#111', '#f2c51f', '#d8231d', '#1f4fb8', '#f6f0de', '#7b3fa6']; for (let i = 0; i < 6; i++) disc(116 - i * 19, cs[i]); });
  return (TX.kand = ctex(c));
}
// ---------- Warhol
function soupLabelTex() {
  if (TX.soup) return TX.soup; const W = 1024, H = 512, [c, x] = cnv(W, H);
  x.fillStyle = '#f7f4ee'; x.fillRect(0, 0, W, H);
  x.fillStyle = '#c8102e'; x.fillRect(0, 0, W, H * .47);
  x.fillStyle = '#e8b62a'; x.fillRect(0, H * .47 - 6, W, 6); x.fillRect(0, H - 34, W, 6);
  for (let i = 0; i < 64; i++) { x.fillStyle = '#e8b62a'; x.beginPath(); x.arc(i * 16 + 8, H - 16, 4, 0, TAU); x.fill(); }
  for (const cx of [W * .25, W * .75]) {
    x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillStyle = '#ffffff'; x.font = 'italic bold 78px "Brush Script MT", "Snell Roundhand", "Segoe Script", cursive'; x.fillText("Warhol's", cx, H * .21);
    x.font = 'bold 22px Georgia, serif'; x.fillText('CONDENSED', cx, H * .38);
    // gold medallion straddling the band
    x.fillStyle = '#e8b62a'; x.beginPath(); x.arc(cx, H * .47, 34, 0, TAU); x.fill(); x.strokeStyle = '#a87726'; x.lineWidth = 3; x.beginPath(); x.arc(cx, H * .47, 26, 0, TAU); x.stroke();
    x.fillStyle = '#c8102e'; x.font = 'bold 74px Georgia, "Times New Roman", serif'; x.fillText('TOMATO', cx, H * .64);
    x.font = 'bold 66px Georgia, "Times New Roman", serif'; x.fillText('SOUP', cx, H * .81);
  }
  return (TX.soup = ctex(c));
}
function lidTex() {
  if (TX.lid) return TX.lid; const [c, x] = cnv(256, 256);
  const gr = x.createRadialGradient(128, 128, 10, 128, 128, 128); gr.addColorStop(0, '#e8ebef'); gr.addColorStop(1, '#a9aeb6'); x.fillStyle = gr; x.fillRect(0, 0, 256, 256);
  x.strokeStyle = 'rgba(60,60,70,.45)'; x.lineWidth = 3; for (const rr of [40, 70, 96, 118]) { x.beginPath(); x.arc(128, 128, rr, 0, TAU); x.stroke(); }
  return (TX.lid = ctex(c));
}
function popFaceTex(variant) {
  const key = 'pop' + variant; if (TX[key]) return TX[key]; const S = 512, [c, x] = cnv(1024, 1024);
  const pals = [
    { bg: '#ff8a1e', face: '#ff9ec2', hair: '#ffe14a', lid: '#2ad4d0', lip: '#e0102a' },
    { bg: '#25c6ef', face: '#ffe14a', hair: '#ff4fa8', lid: '#7b3fff', lip: '#ff3b1e' },
    { bg: '#9ef01a', face: '#ff7a3a', hair: '#2f4fff', lid: '#ffe14a', lip: '#c8008a' },
    { bg: '#ff2f8f', face: '#9fd8ff', hair: '#ff9a1e', lid: '#2ad46a', lip: '#e0102a' },
    { bg: '#7b3fff', face: '#ffd0a8', hair: '#f6ff3a', lid: '#ff4fa8', lip: '#ff1e1e' },
  ];
  for (let q = 0; q < 4; q++) {
    const p = pals[(q + variant) % pals.length]; x.save(); x.translate((q % 2) * S, ((q / 2) | 0) * S);
    x.fillStyle = p.bg; x.fillRect(0, 0, S, S);
    x.fillStyle = p.hair; x.beginPath(); x.ellipse(256, 210, 190, 170, 0, 0, TAU); x.fill(); x.beginPath(); x.ellipse(150, 300, 80, 120, .3, 0, TAU); x.fill(); x.beginPath(); x.ellipse(362, 300, 80, 120, -.3, 0, TAU); x.fill();
    x.fillStyle = p.face; x.fillRect(205, 380, 102, 132); x.beginPath(); x.ellipse(256, 290, 112, 140, 0, 0, TAU); x.fill();
    x.fillStyle = p.hair; x.beginPath(); x.ellipse(220, 165, 120, 60, -.25, 0, TAU); x.fill();
    x.fillStyle = p.lid; for (const ex of [208, 306]) { x.beginPath(); x.ellipse(ex, 262, 40, 20, 0, PI, TAU); x.fill(); }
    x.fillStyle = p.lip; x.beginPath(); x.moveTo(206, 362); x.quadraticCurveTo(232, 340, 256, 350); x.quadraticCurveTo(282, 340, 308, 362); x.quadraticCurveTo(256, 400, 206, 362); x.fill();
    // offset black silkscreen layer
    x.save(); x.translate(9, 6); x.fillStyle = '#111'; x.strokeStyle = '#111'; x.lineCap = 'round';
    for (const ex of [208, 306]) { almondPath(x, ex, 270, 30, 9); x.lineWidth = 6; x.stroke(); x.beginPath(); x.arc(ex, 270, 9, 0, TAU); x.fill(); x.lineWidth = 7; x.beginPath(); x.moveTo(ex - 38, 236); x.quadraticCurveTo(ex, 214, ex + 38, 232); x.stroke(); }
    x.lineWidth = 5; x.beginPath(); x.moveTo(262, 280); x.lineTo(252, 322); x.quadraticCurveTo(262, 330, 274, 322); x.stroke();
    x.lineWidth = 5; x.beginPath(); x.moveTo(214, 362); x.lineTo(298, 362); x.stroke();
    x.beginPath(); x.arc(312, 340, 5, 0, TAU); x.fill();
    x.globalAlpha = .85; x.beginPath(); x.moveTo(340, 220); x.quadraticCurveTo(390, 320, 330, 420); x.lineTo(318, 410); x.quadraticCurveTo(360, 320, 322, 230); x.fill();
    x.beginPath(); x.moveTo(205, 430); x.lineTo(238, 430); x.lineTo(232, 512); x.lineTo(205, 512); x.fill(); x.globalAlpha = 1;
    x.lineWidth = 6; for (let i = 0; i < 6; i++) { x.beginPath(); x.arc(150 + i * 42, 120 + (i % 2) * 18, 26, PI * .9, PI * 1.9); x.stroke(); }
    x.restore(); x.restore();
  }
  return (TX[key] = ctex(c));
}
function warholFlowersTex() {
  if (TX.wflow) return TX.wflow; const W = 1024, H = 256, [c, x] = cnv(W, H), r = srnd(1964);
  x.fillStyle = '#0d1a0d'; x.fillRect(0, 0, W, H);
  x.strokeStyle = '#2f7a2a'; x.lineCap = 'round'; for (let i = 0; i < 900; i++) { const px = r() * W, py = r() * H; x.lineWidth = 2 + r() * 3; x.strokeStyle = ['#2f7a2a', '#4fa83a', '#1c4a1a', '#7ad04a'][(r() * 4) | 0]; x.beginPath(); x.moveTo(px, py); x.lineTo(px + (r() - .5) * 10, py - 10 - r() * 14); x.stroke(); }
  const pals = [['#ff4fa8', '#ff9ad0'], ['#ff8a1e', '#ffd23f'], ['#2f9fff', '#9fd8ff'], ['#ffe14a', '#fff6b0'], ['#e0102a', '#ff6a6a']];
  for (let i = 0; i < 8; i++) {
    const cx = 64 + i * 128, cy = 128 + (i % 2 ? -18 : 18), [a, b] = pals[i % pals.length], R0 = 34;
    for (const [ox, oy, col] of [[6, 5, '#111'], [0, 0, a]]) { x.fillStyle = col; for (const [dx, dy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { x.beginPath(); x.arc(cx + dx * R0 * .62 + ox, cy + dy * R0 * .62 + oy, R0 * .72, 0, TAU); x.fill(); } }
    x.fillStyle = b; x.beginPath(); x.arc(cx - 6, cy - 6, R0 * .35, 0, TAU); x.fill();
  }
  return (TX.wflow = ctex(c, true));
}
// ---------- Haring
const HP = {
  d1: { head: [.5, .17], neck: [.5, .32], hip: [.5, .58], le: [.3, .3], lh: [.2, .1], re: [.7, .34], rh: [.84, .2], lk: [.36, .75], lf: [.26, .93], rk: [.64, .74], rf: [.76, .9] },
  d2: { head: [.44, .2], neck: [.47, .34], hip: [.55, .6], le: [.28, .42], lh: [.14, .3], re: [.72, .36], rh: [.86, .5], lk: [.38, .75], lf: [.28, .92], rk: [.74, .7], rf: [.88, .82] },
  d3: { head: [.24, .44], neck: [.36, .46], hip: [.66, .42], le: [.32, .62], lh: [.4, .78], re: [.48, .64], rh: [.54, .8], lk: [.62, .66], lf: [.55, .92], rk: [.82, .62], rf: [.88, .9] },
  d4: { head: [.5, .2], neck: [.5, .33], hip: [.52, .58], le: [.36, .2], lh: [.4, .05], re: [.66, .42], rh: [.82, .34], lk: [.44, .76], lf: [.42, .95], rk: [.72, .5], rf: [.9, .44] },
  d5: { head: [.5, .26], neck: [.5, .38], hip: [.5, .64], le: [.3, .3], lh: [.22, .12], re: [.7, .3], rh: [.78, .12], lk: [.32, .76], lf: [.18, .86], rk: [.68, .76], rf: [.82, .86] },
  d6: { head: [.58, .16], neck: [.55, .3], hip: [.46, .56], le: [.74, .26], lh: [.9, .16], re: [.38, .3], rh: [.24, .4], lk: [.32, .68], lf: [.2, .82], rk: [.56, .76], rf: [.5, .95] },
};
function haringFig(x, S, P0, fill) {
  const P = (p) => [p[0] * S, p[1] * S];
  const limbs = [[P0.neck, P0.le, P0.lh], [P0.neck, P0.re, P0.rh], [P0.hip, P0.lk, P0.lf], [P0.hip, P0.rk, P0.rf]];
  x.lineCap = 'round'; x.lineJoin = 'round';
  const pass = (col, w, tw, hr) => {
    x.strokeStyle = col; x.lineWidth = w; for (const l of limbs) { x.beginPath(); x.moveTo(...P(l[0])); for (let i = 1; i < l.length; i++) x.lineTo(...P(l[i])); x.stroke(); }
    x.lineWidth = tw; x.beginPath(); x.moveTo(...P(P0.neck)); x.lineTo(...P(P0.hip)); x.stroke();
    x.fillStyle = col; x.beginPath(); x.arc(...P(P0.head), hr, 0, TAU); x.fill();
  };
  pass('#111', S * .13, S * .19, S * .115); pass(fill, S * .07, S * .13, S * .075);
  // action lines
  const cx = (P0.neck[0] + P0.hip[0]) / 2 * S, cy = (P0.neck[1] + P0.hip[1]) / 2 * S;
  x.strokeStyle = '#111'; x.lineWidth = S * .025;
  for (const a of [-2.6, -2.2, -.9, -.5, .3, 2.9]) { const d0 = S * .4, d1 = S * .47; const ax = Math.cos(a), ay = Math.sin(a); if (cx + ax * d1 < 6 || cx + ax * d1 > S - 6 || cy + ay * d1 < 6 || cy + ay * d1 > S - 6) continue; x.beginPath(); x.moveTo(cx + ax * d0, cy + ay * d0); x.lineTo(cx + ax * d1, cy + ay * d1); x.stroke(); }
}
function haringAtlas() {
  if (TX.haring) return TX.haring; const S = 256, [c, x] = cnv(1024, 1024);
  const cell = (i, fn) => { x.save(); x.translate((i % 4) * S, ((i / 4) | 0) * S); fn(); x.restore(); };
  const fills = ['#ff2a2a', '#1e7bff', '#2ecc40', '#ff8c00', '#ff3fa4', '#9b30ff'];
  ['d1', 'd2', 'd3', 'd4', 'd5', 'd6'].forEach((k, i) => cell(i, () => haringFig(x, S, HP[k], fills[i])));
  const rays = (cx, cy, r0, r1, n, w) => { x.strokeStyle = '#111'; x.lineWidth = w * S; for (let i = 0; i < n; i++) { const a = i / n * TAU + .2; x.beginPath(); x.moveTo((cx + Math.cos(a) * r0) * S, (cy + Math.sin(a) * r0) * S); x.lineTo((cx + Math.cos(a) * r1) * S, (cy + Math.sin(a) * r1) * S); x.stroke(); } };
  // radiant baby (crawling, facing right)
  cell(6, () => {
    x.lineCap = 'round'; x.lineJoin = 'round'; rays(.5, .55, .36, .47, 14, .03);
    const Y = '#ffd400', parts = [[[[.34, .56], [.6, .52]], .2], [[[.58, .55], [.64, .74]], .1], [[[.5, .56], [.46, .74]], .1], [[[.38, .58], [.32, .74], [.22, .75]], .11]];
    for (const [col, k] of [['#111', 1], [Y, .58]]) { for (const [pts, w] of parts) { x.strokeStyle = col; x.lineWidth = w * k * S; x.beginPath(); x.moveTo(pts[0][0] * S, pts[0][1] * S); for (const p of pts) x.lineTo(p[0] * S, p[1] * S); x.stroke(); } x.fillStyle = col; x.beginPath(); x.arc(.7 * S, .42 * S, (k === 1 ? .12 : .085) * S, 0, TAU); x.fill(); }
  });
  // barking dog (facing right)
  cell(7, () => {
    x.lineCap = 'round'; x.lineJoin = 'round'; const F = '#ff2a2a';
    const parts = [[[.3, .5], [.62, .5]], [[.66, .42], [.8, .38]], [[.66, .37], [.88, .29]], [[.66, .47], [.85, .51]], [[.34, .52], [.32, .76]], [[.43, .52], [.43, .76]], [[.54, .52], [.54, .76]], [[.61, .52], [.63, .76]], [[.3, .48], [.2, .3]], [[.7, .34], [.66, .22]]];
    const ws = [.17, .15, .08, .08, .08, .08, .08, .08, .07, .07];
    for (const [col, k] of [['#111', 1], [F, .55]]) parts.forEach((pts, i) => { x.strokeStyle = col; x.lineWidth = ws[i] * k * S; x.beginPath(); x.moveTo(pts[0][0] * S, pts[0][1] * S); x.lineTo(pts[1][0] * S, pts[1][1] * S); x.stroke(); });
    x.strokeStyle = '#111'; x.lineWidth = .025 * S; for (const [a, b, cc, d] of [[.9, .26, .97, .2], [.93, .38, .99, .38], [.9, .5, .96, .56]]) { x.beginPath(); x.moveTo(a * S, b * S); x.lineTo(cc * S, d * S); x.stroke(); }
  });
  // heart with rays
  cell(8, () => {
    rays(.5, .52, .38, .47, 12, .03);
    const hp = () => { x.beginPath(); x.moveTo(.5 * S, .78 * S); x.bezierCurveTo(.12 * S, .52 * S, .2 * S, .2 * S, .5 * S, .36 * S); x.bezierCurveTo(.8 * S, .2 * S, .88 * S, .52 * S, .5 * S, .78 * S); x.closePath(); };
    hp(); x.fillStyle = '#ff1e3c'; x.fill(); x.lineWidth = .06 * S; x.strokeStyle = '#111'; x.lineJoin = 'round'; x.stroke();
  });
  return (TX.haring = ctex(c));
}
function haringHullTex() {
  if (TX.harHull) return TX.harHull; const S = 256, [c, x] = cnv(1024, 256), r = srnd(1958);
  x.fillStyle = '#ffd800'; x.fillRect(0, 0, 1024, 256);
  const keys = Object.keys(HP);
  for (let i = 0; i < 5; i++) { x.save(); x.translate(i * 205 + 4, 8); x.scale(.92, .92); haringFig(x, S, HP[keys[(i * 2) % keys.length]], i % 2 ? '#ffd800' : ['#ff2a2a', '#1e7bff', '#2ecc40'][i % 3]); x.restore(); }
  x.strokeStyle = '#111'; x.lineWidth = 5; x.lineCap = 'round';
  for (let i = 0; i < 40; i++) { const px = r() * 1024, py = r() * 256; x.beginPath(); x.moveTo(px, py); x.lineTo(px + (r() - .5) * 20, py + (r() - .5) * 20); x.stroke(); }
  return (TX.harHull = ctex(c, true));
}
// ---------- Kusama
function polkaTex(key, base, dot, W = 256, n = 22, r0 = 10, r1 = 20, seedKey = key) {
  if (TX[key]) return TX[key]; const [c, x] = cnv(W, W), r = srnd(hashStr(seedKey));
  x.fillStyle = base; x.fillRect(0, 0, W, W); x.fillStyle = dot;
  const g = Math.sqrt(n) | 0, s = W / g;
  for (let i = 0; i < g; i++) for (let j = 0; j < g; j++) { const px = (i + .5 + (j % 2) * .5) * s + (r() - .5) * s * .2, py = (j + .5) * s + (r() - .5) * s * .2, rr = r0 + r() * (r1 - r0); wrapDraw(W, W, px, py, rr, (a, b) => { x.beginPath(); x.arc(a, b, rr, 0, TAU); x.fill(); }); }
  return (TX[key] = ctex(c, true));
}
function pumpkinTex(emissive) {
  const key = emissive ? 'pumpE' : 'pump'; if (TX[key]) return TX[key]; const W = 1024, H = 512, [c, x] = cnv(W, H), r = srnd(1929);
  if (emissive) { x.fillStyle = '#2a1e00'; x.fillRect(0, 0, W, H); }
  else { x.fillStyle = '#f7cf00'; x.fillRect(0, 0, W, H); for (let k = 0; k < 10; k++) { const gx = (k + .5) / 10 * W; const g2 = x.createLinearGradient(gx - 30, 0, gx + 30, 0); g2.addColorStop(0, 'rgba(160,110,0,0)'); g2.addColorStop(.5, 'rgba(150,100,0,.45)'); g2.addColorStop(1, 'rgba(160,110,0,0)'); x.fillStyle = g2; x.fillRect(gx - 30, 0, 60, H); } }
  const glowCols = ['#fff3b0', '#ff7ad8', '#7af0ff', '#ffd23f', '#ffffff', '#ff9a4a'];
  for (let k = 0; k <= 10; k++) for (let col = -1; col <= 1; col++) {
    const u = k / 10 + col * .031; if (u < -.05 || u > 1.05) continue;
    for (let j = 0; j < 11; j++) {
      const v = .07 + j * .086, th = (1 - v) * PI, sn = Math.sin(th), ry = (col ? 10 : 17) * (.45 + .55 * sn) * (H / 512) * 1.6, rx = ry * .85;
      x.fillStyle = emissive ? glowCols[(k * 3 + j + col + 6) % glowCols.length] : '#111';
      for (const ox of [0, -W, W]) { x.beginPath(); x.ellipse(u * W + ox, (1 - v) * H, rx, ry, 0, 0, TAU); x.fill(); }
    }
  }
  return (TX[key] = ctex(c));
}
// ---------- Munch
function fjordTex() {
  if (TX.fjord) return TX.fjord; const W = 1024, H = 256, [c, x] = cnv(W, H), r = srnd(1893);
  x.fillStyle = '#1b2f6a'; x.fillRect(0, 0, W, H); x.lineCap = 'round';
  const cols = ['#1b2f6a', '#2a4a9a', '#3a63b0', '#1d6a7a', '#2f8a8a', '#132350', '#4a3f7a', '#2a5a3a'];
  for (let i = 0; i < 2600; i++) {
    let px = r() * W, py = r() * H; x.strokeStyle = cols[(r() * cols.length) | 0]; x.lineWidth = 4 + r() * 6; x.beginPath(); x.moveTo(px, py);
    for (let k = 0; k < 6; k++) { const a = Math.sin(px * .012 + py * .03) * 1.1 + Math.sin(py * .05) * .6; px += Math.cos(a) * 9; py += Math.sin(a) * 5; x.lineTo(px, py); } x.stroke();
  }
  for (let i = 0; i < 500; i++) { const px = r() * W, py = 12 + r() * 30 + 10 * Math.sin(px * .01); x.strokeStyle = ['#c86a2a', '#e8902a', '#8a4a1a'][(r() * 3) | 0]; x.lineWidth = 4 + r() * 4; x.beginPath(); x.moveTo(px, py); x.lineTo(px + 14, py + (r() - .5) * 4); x.stroke(); }
  return (TX.fjord = ctex(c, true));
}
function screamSkyTex() {
  if (TX.ssky) return TX.ssky; const W = 512, H = 512, [c, x] = cnv(W, H), r = srnd(1895);
  x.fillStyle = '#e0601e'; x.fillRect(0, 0, W, H); x.lineCap = 'round';
  const bandCol = (v) => v < .15 ? ['#c8281e', '#e04a1e', '#a81e1a'] : v < .35 ? ['#ff8a1e', '#f0a02a', '#e8601e'] : v < .5 ? ['#ffc23a', '#ffe06a', '#f0a02a'] : v < .62 ? ['#e8601e', '#c8281e', '#ff8a1e'] : ['#2a4a9a', '#1b2f6a', '#3a63b0', '#2f6a7a'];
  for (let i = 0; i < 4200; i++) {
    let px = r() * W, py = r() * H; const v = py / H; x.strokeStyle = bandCol(v)[(r() * 3) | 0]; x.lineWidth = 5 + r() * 7; x.beginPath(); x.moveTo(px, py);
    for (let k = 0; k < 5; k++) { const sl = Math.cos(px * .02 + v * 9) * (v < .62 ? .9 : 1.6); px += 10; py += sl * 4; x.lineTo(px, py); } x.stroke();
  }
  return (TX.ssky = ctex(c));
}
function screamFaceTex() {
  if (TX.sface) return TX.sface; const [c, x] = cnv(256, 128);
  x.fillStyle = '#d9cf96'; x.fillRect(0, 0, 256, 128);
  x.strokeStyle = 'rgba(150,170,90,.5)'; x.lineWidth = 3; for (let i = 0; i < 12; i++) { x.beginPath(); x.moveTo(20 + i * 20, 0); x.quadraticCurveTo(30 + i * 20, 64, 15 + i * 20, 128); x.stroke(); }
  x.fillStyle = '#4a3b26'; for (const ex of [50, 78]) { x.beginPath(); x.ellipse(ex, 52, 9, 12, 0, 0, TAU); x.fill(); }
  x.fillStyle = '#0d0905'; for (const ex of [50, 78]) { x.beginPath(); x.arc(ex, 53, 3.5, 0, TAU); x.fill(); }
  x.fillStyle = '#3a2a18'; x.beginPath(); x.arc(61, 72, 2.5, 0, TAU); x.fill(); x.beginPath(); x.arc(67, 72, 2.5, 0, TAU); x.fill();
  x.fillStyle = '#5a1e14'; x.beginPath(); x.ellipse(64, 95, 10, 17, 0, 0, TAU); x.fill(); x.fillStyle = '#0d0605'; x.beginPath(); x.ellipse(64, 95, 7, 14, 0, 0, TAU); x.fill();
  return (TX.sface = ctex(c));
}
// ---------- Magritte
function skyCloudTex() {
  if (TX.mag) return TX.mag; const W = 512, H = 256, [c, x] = cnv(W, H), r = srnd(1964);
  const gr = x.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, '#3f7fd6'); gr.addColorStop(1, '#a9cdf0'); x.fillStyle = gr; x.fillRect(0, 0, W, H);
  for (let i = 0; i < 7; i++) {
    const cx = r() * W, cy = 40 + r() * 170, s = 22 + r() * 18;
    for (let k = 0; k < 9; k++) { const ox = (r() - .5) * s * 4, oy = (r() - .3) * s * 1.2, rr = s * (.6 + r() * .7); wrapDraw(W, H, cx + ox, cy + oy, rr, (a, b) => { const g2 = x.createRadialGradient(a, b - rr * .3, rr * .2, a, b, rr); g2.addColorStop(0, '#ffffff'); g2.addColorStop(.8, '#eef2f8'); g2.addColorStop(1, 'rgba(200,210,225,0)'); x.fillStyle = g2; x.beginPath(); x.arc(a, b, rr, 0, TAU); x.fill(); }); }
  }
  return (TX.mag = ctex(c, true));
}
function pipeSignTex() {
  if (TX.pipe) return TX.pipe; const W = 1024, H = 320, [c, x] = cnv(W, H);
  x.fillStyle = '#efe6cf'; x.fillRect(0, 0, W, H); x.strokeStyle = '#6b5a3a'; x.lineWidth = 10; x.strokeRect(8, 8, W - 16, H - 16);
  x.save(); x.translate(300, 120);
  x.fillStyle = '#111'; x.beginPath(); x.moveTo(-210, -18); x.quadraticCurveTo(-60, -40, 60, -6); x.lineTo(60, 14); x.quadraticCurveTo(-60, -10, -210, 2); x.closePath(); x.fill();
  const bg = x.createLinearGradient(40, 0, 170, 0); bg.addColorStop(0, '#5a2e12'); bg.addColorStop(.5, '#a85a22'); bg.addColorStop(1, '#4a240c'); x.fillStyle = bg;
  x.beginPath(); x.moveTo(40, -60); x.lineTo(170, -60); x.quadraticCurveTo(175, 60, 105, 72); x.quadraticCurveTo(48, 70, 40, -60); x.fill(); x.fillStyle = '#1a0c04'; x.beginPath(); x.ellipse(105, -60, 65, 12, 0, 0, TAU); x.fill();
  x.restore();
  x.fillStyle = '#1a1208'; x.font = 'italic 64px "Snell Roundhand", "Brush Script MT", "Segoe Script", cursive'; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillText("Ceci n'est pas une voiture.", W / 2, 258);
  return (TX.pipe = ctex(c));
}
// ---------- Matisse
function snailTex() {
  if (TX.snail) return TX.snail; const W = 1024, H = 256, [c, x] = cnv(W, H), r = srnd(1953);
  x.fillStyle = '#f4efe2'; x.fillRect(0, 0, W, H);
  const cols = ['#f28c28', '#d6247a', '#1f9e4a', '#1d4fb5', '#111111', '#ffd23f', '#2bb3b1', '#e8301e', '#8a3fbf'];
  let px = 0, i = 0; while (px < W) { const w = 60 + r() * 110; let py = 0; while (py < H) { const h = 50 + r() * 120; x.fillStyle = cols[(i++ * 5 + (r() * 3 | 0)) % cols.length]; x.beginPath(); x.moveTo(px + r() * 6, py + r() * 6); x.lineTo(px + w - r() * 6, py + r() * 6); x.lineTo(px + w - r() * 6, py + h - r() * 6); x.lineTo(px + r() * 6, py + h - r() * 6); x.closePath(); x.fill(); py += h; } px += w; }
  for (let k = 0; k < 7; k++) { const cx = 70 + k * 140 + r() * 30, cy = 128 + (r() - .5) * 60; x.fillStyle = k % 2 ? '#ffffff' : '#ffe9a0'; algaeShape(x, cx, cy + 90, 170, .9, r); }
  return (TX.snail = ctex(c, true));
}
function algaeShape(x, cx, by, h, w, r) {
  const n = 9; x.lineCap = 'round'; x.lineWidth = h * .045; x.strokeStyle = x.fillStyle; x.beginPath();
  for (let i = 0; i <= n; i++) { const v = i / n, sx = cx + Math.sin(v * 5 + 1) * h * .06, sy = by - v * h; i ? x.lineTo(sx, sy) : x.moveTo(sx, sy); } x.stroke();
  for (let i = 1; i < n; i++) {
    const v = i / n, sx = cx + Math.sin(v * 5 + 1) * h * .06, sy = by - v * h, side = i % 2 ? 1 : -1, s = h * .13 * (1 - v * .55) * w;
    x.save(); x.translate(sx + side * s * .8, sy); x.rotate(side * (.7 + r() * .3)); x.beginPath(); x.ellipse(0, 0, s, s * .42, side * -.5, 0, TAU); x.fill(); x.restore();
  }
  x.beginPath(); x.ellipse(cx + Math.sin(6) * h * .06, by - h - h * .04, h * .06 * w, h * .09, 0, 0, TAU); x.fill();
}
function matisseAtlas() {
  if (TX.mat) return TX.mat; const S = 256, [c, x] = cnv(1024, 1024), r = srnd(1869);
  const cell = (col, row, fn) => { x.save(); x.translate(col * S, row * S); fn(); x.restore(); };
  const BLUE = '#1f4fb4';
  // big blue dancer (2x2 cells)
  const dancer = (sc, pts, cuts) => {
    x.save(); x.scale(sc, sc); x.fillStyle = BLUE; x.strokeStyle = BLUE; x.lineCap = 'round'; x.lineJoin = 'round';
    for (const [w, ...p] of pts) { x.lineWidth = w; x.beginPath(); x.moveTo(p[0][0], p[0][1]); for (let i = 1; i < p.length; i++) x.quadraticCurveTo(p[i][0], p[i][1], p[i][2] ?? p[i][0], p[i][3] ?? p[i][1]); x.stroke(); }
    x.beginPath(); x.ellipse(122, 46, 21, 25, -.2, 0, TAU); x.fill();
    x.globalCompositeOperation = 'destination-out'; x.lineWidth = 3; for (const p of cuts) { x.beginPath(); x.moveTo(p[0], p[1]); x.lineTo(p[2], p[3]); x.stroke(); }
    x.restore(); x.globalCompositeOperation = 'source-over';
  };
  cell(0, 0, () => dancer(2, [
    [40, [128, 82], [134, 110, 132, 150]],
    [24, [116, 76], [84, 60, 66, 26], [62, 14, 48, 12]],
    [24, [140, 78], [176, 66, 194, 34], [200, 18, 214, 16]],
    [27, [130, 150], [104, 180, 88, 206], [80, 228, 60, 242]],
    [27, [134, 150], [176, 160, 206, 150], [226, 146, 240, 128]],
  ], [[104, 112, 160, 108], [92, 186, 112, 196], [180, 140, 188, 168]]));
  // algae
  const alg = (col, row, color) => cell(col, row, () => { x.fillStyle = color; algaeShape(x, 128, 248, 220, 1, r); });
  alg(2, 0, '#1f9e4a'); alg(3, 0, '#f28c28'); alg(0, 2, '#2bb3b1'); alg(0, 3, '#d6247a');
  // lobed leaves
  const leaf = (col, row, color, lobes) => cell(col, row, () => { x.fillStyle = color; x.beginPath(); for (let i = 0; i <= 90; i++) { const a = i / 90 * TAU, rr = 104 * (.5 + .5 * Math.pow(Math.abs(Math.sin(a * lobes / 2)), .55)) * (1 + .05 * Math.sin(a * 7)); const px = 128 + Math.cos(a) * rr, py = 120 + Math.sin(a) * rr; i ? x.lineTo(px, py) : x.moveTo(px, py); } x.closePath(); x.fill(); x.lineWidth = 12; x.strokeStyle = color; x.beginPath(); x.moveTo(128, 200); x.lineTo(128, 252); x.stroke(); });
  leaf(2, 1, '#d6247a', 7); leaf(1, 2, '#9ad030', 5);
  // irregular stars
  const star = (col, row, color, n) => cell(col, row, () => { x.fillStyle = color; x.beginPath(); for (let i = 0; i < n * 2; i++) { const a = i / (n * 2) * TAU + (r() - .5) * .15, rr = i % 2 ? 40 + r() * 14 : 100 + r() * 22; const px = 128 + Math.cos(a) * rr, py = 128 + Math.sin(a) * rr; i ? x.lineTo(px, py) : x.moveTo(px, py); } x.closePath(); x.fill(); });
  star(3, 1, '#ffd23f', 7); star(2, 2, '#e8301e', 8);
  // Icarus on blue with yellow stars
  cell(3, 2, () => {
    x.fillStyle = BLUE; x.fillRect(16, 6, 224, 244);
    x.fillStyle = '#ffd23f'; for (const [px, py] of [[44, 40], [210, 56], [40, 200], [214, 196], [60, 120], [200, 128]]) { x.beginPath(); for (let i = 0; i < 10; i++) { const a = i / 10 * TAU, rr = i % 2 ? 6 : 16; x.lineTo(px + Math.cos(a) * rr, py + Math.sin(a) * rr); } x.closePath(); x.fill(); }
    x.fillStyle = '#111'; x.strokeStyle = '#111'; x.lineCap = 'round'; x.lineWidth = 26;
    x.beginPath(); x.ellipse(128, 60, 18, 22, 0, 0, TAU); x.fill();
    x.beginPath(); x.moveTo(128, 90); x.quadraticCurveTo(132, 130, 126, 160); x.stroke(); x.lineWidth = 16; x.beginPath(); x.moveTo(118, 96); x.quadraticCurveTo(80, 110, 70, 80); x.moveTo(138, 96); x.quadraticCurveTo(178, 112, 188, 84); x.moveTo(122, 160); x.quadraticCurveTo(100, 200, 104, 236); x.moveTo(132, 160); x.quadraticCurveTo(150, 200, 146, 236); x.stroke();
    x.fillStyle = '#e8301e'; x.beginPath(); x.arc(136, 112, 12, 0, TAU); x.fill();
  });
  // coral / sponge
  cell(1, 3, () => { x.fillStyle = '#1d4fb5'; for (let i = 0; i < 9; i++) { const a = -PI / 2 + (i - 4) * .33; x.lineWidth = 16; x.strokeStyle = '#1d4fb5'; x.lineCap = 'round'; x.beginPath(); x.moveTo(128, 240); x.quadraticCurveTo(128 + Math.cos(a) * 60, 240 + Math.sin(a) * 90, 128 + Math.cos(a) * 110, 240 + Math.sin(a) * 200); x.stroke(); x.beginPath(); x.arc(128 + Math.cos(a) * 110, 240 + Math.sin(a) * 200, 14, 0, TAU); x.fill(); } });
  return (TX.mat = ctex(c));
}
// ---------- Seurat
const riverTex = () => dotTex('river', '#3a62b8', ['#6f9ad8', '#2f4f9a', '#4a7fd0', '#7a5fb0', '#3a8ab0', '#9fbbe8', '#2a3f8a', '#5a8ae0', '#f4efe0', '#e8a04a'], 2000, 10, 17);
const grassTex = () => dotTex('grass', '#4a8a2c', ['#2f6a1e', '#7ab83a', '#c8d84a', '#3a7aa0', '#5aa03a', '#e8d870', '#1f4a1a'], 3200, 7, 13);
const dressTex = () => dotTex('dress', '#1c2236', ['#2a3050', '#3a2a5a', '#101420', '#4a3f7a', '#8a3a3a', '#24304a'], 2600, 6, 11);
const coatTex = () => dotTex('coat', '#18181e', ['#26263a', '#3a2a4a', '#0c0c12', '#2a3a5a', '#4a2a2a'], 2600, 6, 11);
const parA = () => dotTex('parA', '#e07a3a', ['#f0a04a', '#ffd06a', '#c8401e', '#ff8aa0', '#f4e0a0', '#a85ab0'], 2600, 7, 12);
const parB = () => dotTex('parB', '#c9b5e0', ['#ffffff', '#ffb8d0', '#9fbbe8', '#e8d0f8', '#f4e8a0', '#8a7ad0'], 2600, 7, 12);
const treeTex = () => dotTex('tree', '#21462a', ['#2f6a2a', '#16301a', '#3a5aa0', '#6a9a3a', '#c8d84a', '#0f2410', '#4a7a2a'], 3000, 7, 12);
function sparkleTex() {
  if (TX.spark) return TX.spark; const W = 256, [c, x] = cnv(W, W), r = srnd(1884);
  x.fillStyle = '#000'; x.fillRect(0, 0, W, W);
  const cols = ['#fff6d0', '#ffd06a', '#9fd8ff', '#ff9ad0', '#c8ff9a'];
  for (let i = 0; i < 110; i++) { const px = r() * W, py = r() * W, rr = 2 + r() * 3.5; x.fillStyle = cols[(r() * cols.length) | 0]; wrapDraw(W, W, px, py, rr, (a, b) => { x.beginPath(); x.arc(a, b, rr, 0, TAU); x.fill(); }); }
  return (TX.spark = ctex(c, true));
}

// ============================================================ shared car parts
function carBase(o) {
  const g = new THREE.Group(), Rw = o.R || .75, fw = o.frameW || 2.4, dark = mat(0x26221f, { roughness: .6, metalness: .4 });
  M(G.box, dark, fw, .5, o.len, 0, Rw + .15, o.cz || 0, g);
  if (o.glow != null) { const gm = neon(o.glow, .8); for (const s of [-1, 1]) noSh(M(G.box, gm, .07, .07, o.len * .92, s * (fw / 2 + .04), Rw - .02, o.cz || 0, g)); }
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
  const spot = new THREE.PointLight(o.spotColor, 0, 28, 2); spot.name = 'spot'; spot.position.set(0, o.deck + 3, 0); g.add(spot);
  if (o.lasers) g.add(o.lasers);
  mergeStatic(g);
  const nm = o.nightMats || [], sprites = o.sprites || [], wheels = o.wheels || [], Rw = o.Rw || .75, own = o.update;
  const update = (dt, t, ctx) => {
    ctx = ctx || NOCTX; dt = dt || 0; t = t || 0; const night = ctx.night || 0, sp = ctx.speed || 0;
    for (const w of wheels) w.rotation.x += sp * dt / Rw;
    for (const [m, lo, hi] of nm) m.emissiveIntensity = lo + (hi - lo) * night;
    for (const [s, op] of sprites) s.material.opacity = op * night;
    if (own) own(dt, t, ctx, night, sp);
  };
  update(0, 0, NOCTX);
  g.userData.artType = type;
  return { g, deck: o.deck, seat: o.seat, dancers: o.dancers, spot, poofers, anims: [], lasers: o.lasers || null, update, length: o.len, height: o.height };
}
// standard painted hull block + deck plate; returns deck height
function hull(g, tex, w, h, len, zc, tw, th, deckMat, nm, lo = 0, hi = .35, y0 = 1.05) {
  const m = texMat(tex, { roughness: .7 }); nm.push([m, lo, hi]);
  M(boxGeoUV(w, h, len, tw, th), m, 1, 1, 1, 0, y0 + h / 2, zc, g);
  M(G.box, deckMat, w + .1, .1, len + .1, 0, y0 + h + .05, zc, g);
  return Math.round((y0 + h + .1) * 1000) / 1000;
}

// ============================================================ 1. THE GREAT WAVE (Hokusai)
function waveShape() {
  const OZ = 1.3, sh = new THREE.Shape(), P = (z, y) => [z + OZ, y];
  const c = (a, b, d) => sh.bezierCurveTo(...P(...a), ...P(...b), ...P(...d));
  sh.moveTo(...P(-5.4, 0));
  c([-5.6, 2.6], [-5.0, 5.2], [-3.6, 5.8]);
  c([-2.4, 6.7], [-.6, 6.7], [.6, 6.0]);
  c([1.6, 5.6], [2.1, 4.2], [1.6, 3.2]);
  c([1.1, 3.3], [.7, 4.2], [.1, 4.6]);
  c([-.7, 5.1], [-1.8, 5.0], [-2.3, 4.3]);
  c([-2.8, 3.5], [-2.9, 1.6], [-2.7, 0]);
  sh.closePath(); return sh;
}
function buildWave() {
  seedFrom('wave');
  const { g, wheels, Rw } = carBase({ len: 9.6, frameW: 2.4, R: .8, axles: [3.4, -3.6], halfW: 1.55, glow: 0x46c8ff, hub: 0xeaf6ff });
  const nm = [], sprites = [];
  const hullT = rtex(seigaihaTex(), 1, 1), hullM = texMat(hullT, { roughness: .6 }); nm.push([hullM, 0, .3]);
  M(boxGeoUV(3.0, 1.3, 10.8, 1.1, 1.1), hullM, 1, 1, 1, 0, 1.75, -.6, g);
  const navy = mat(0x163a6e, { roughness: .6 });
  M(new THREE.CylinderGeometry(1, 1, 1.3, 3), navy, 1.73, 1, 1.2, 0, 1.75, 5.4, g);
  M(G.box, mat(0x6b4a2e, { roughness: .8 }), 3.1, .1, 10.9, 0, 2.45, -.6, g);
  const deck = 2.5;
  neonLine(g, [[-1.53, 2.42, -6.0], [-1.53, 2.42, 4.8], [0, 2.42, 6.62], [1.53, 2.42, 4.8], [1.53, 2.42, -6.0]], .045, neon(0x7fe0ff, 1), true);
  // the wave: extruded side silhouette, swept across the car
  const sh = waveShape(), D = 2.8, PZ = -4.1, outer = [], inner = [];
  for (let ci = 0; ci < 3; ci++) for (let i = 0; i <= 16; i++) { if (ci && !i) continue; outer.push(sh.curves[ci].getPoint(i / 16)); }
  for (let ci = 3; ci < 6; ci++) for (let i = 0; i <= 16; i++) { if (ci > 3 && !i) continue; inner.push(sh.curves[ci].getPoint(i / 16)); }
  const capT = waveCapTex(outer, inner); capT.repeat.set(1 / 8.5, 1 / 8.5); capT.offset.set(4.5 / 8.5, .5 / 8.5);
  const capM = texMat(capT, { roughness: .7 }); nm.push([capM, .02, .3]);
  const sideT = rtex(waveSideTex(), .5, 1 / .7), sideM = texMat(sideT, { roughness: .85, color: 0x8a9ab8 }); nm.push([sideM, 0, .2]);
  const wgeo = new THREE.ExtrudeGeometry(sh, { depth: D, bevelEnabled: false, curveSegments: 18 }); wgeo.rotateY(-PI / 2); wgeo.translate(D / 2, 0, 0);
  const piv = grp(g, 0, deck, PZ), wi = grp(piv, 0, 0, -PZ);
  keep(M(wgeo, [capM, sideM], 1, 1, 1, 0, 0, 0, wi));
  const toV = (arr, xx) => arr.map(p => V(xx, p.y, p.x));
  const foamN = neon(0xd8f2ff, 1.2), deepN = neon(0x2f8bff, 1);
  for (const s of [-1, 1]) { noSh(M(tube(toV(outer, s * (D / 2 + .03)), .06, 64, 3), foamN, 1, 1, 1, 0, 0, 0, wi)); noSh(M(tube(toV(inner, s * (D / 2 + .03)), .05, 48, 3), deepN, 1, 1, 1, 0, 0, 0, wi)); }
  // foam claws along the crest
  const clawM = new THREE.MeshStandardMaterial({ color: 0xf4f9ff, roughness: .45, emissive: 0xcfeaff, emissiveIntensity: 0 }); nm.push([clawM, 0, .6]);
  const tipM = neon(0xeaf8ff, 1.4), T = new THREE.Vector2(), Pp = new THREE.Vector2();
  const spots = [[1, .5], [1, .68], [1, .86], [2, .04], [2, .24], [2, .44], [2, .64], [2, .82]];
  let row = 0;
  for (const [ci, tt] of spots) {
    sh.curves[ci].getPoint(tt, Pp); sh.curves[ci].getTangent(tt, T);
    const nz = -T.y, ny = T.x, xs = row++ % 2 ? [-1.05, -.35, .35, 1.05] : [-.7, 0, .7];
    for (const xx of xs) {
      const s = R(.75, 1.15), j = R(-.12, .12), q = (a, b) => V(xx + j, Pp.y + (ny * a + T.y * b) * s, Pp.x + (nz * a + T.x * b) * s);
      const pts = [q(-.15, 0), q(.3, .12), q(.55, .45), q(.42, .8), q(.15, .92)];
      M(taperTube(pts, lin(.2, .035, .8), 8, 4), clawM, 1, 1, 1, 0, 0, 0, wi);
      noSh(M(G.oct, tipM, .07, .07, .07, pts[4].x, pts[4].y, pts[4].z, wi));
    }
  }
  // spray droplets
  const spray = grp(wi), sprayM = neon(0xf0faff, 1.1);
  for (let i = 0; i < 16; i++) { const s = R(.05, .11); noSh(M(G.oct, sprayM, s, s, s, R(-1.4, 1.4), R(4.6, 7.0), R(1.6, 3.9), spray)); }
  const fsp = glowSprite(0xbfe6ff, 6); fsp.position.set(0, 5.6, 2.2); wi.add(fsp); sprites.push([fsp, .4]);
  // Mt Fuji at the back
  const fujiM = texMat(fujiTex(), { roughness: .8 }); nm.push([fujiM, 0, .4]);
  M(new THREE.ConeGeometry(1.5, 2.6, 16, 1, true), fujiM, 1, 1, 1, 0, deck + 1.3, -5.2, g);
  noSh(M(G.oct, neon(0xff4a2a, 1.2), .22, .22, .22, 0, deck + 3.4, -5.2, g));
  const sun = glowSprite(0xff6a3a, 2.2); sun.position.set(0, deck + 3.4, -5.2); g.add(sun); sprites.push([sun, .5]);
  return finish('wave', g, {
    deck, seat: [0, deck, 4.1], dancers: [[-.7, deck, 1.6], [.7, deck, .6], [-.5, deck, -.7], [.6, deck, 2.4]],
    poofers: [[-1.3, deck, -5.75], [1.3, deck, -5.75]], spotColor: 0x8fd8ff, nightMats: nm, sprites, wheels, Rw, len: 12.6, height: 9.6,
    update(dt, t) {
      piv.rotation.x = .025 + .025 * Math.sin(t * .9); piv.scale.y = 1 + .02 * Math.sin(t * .9 + .6);
      spray.position.y = .14 * Math.sin(t * 2.1); spray.position.z = .12 * Math.sin(t * 1.3);
    },
  });
}

// ============================================================ 2. FRIDA'S GARDEN (Frida Kahlo)
function monkey(parent, x, y, z, ry) {
  const m = grp(parent, x, y, z); m.rotation.y = ry;
  const fur = mat(0x3a2414, { roughness: .9 }), face = mat(0xc89a6a, { roughness: .8 }), blk = mat(0x111111, { roughness: .4 });
  M(G.sphLo, fur, .32, .42, .28, 0, .42, 0, m);
  const head = grp(m, 0, .98, .04); M(G.sphLo, fur, .25, .24, .24, 0, 0, 0, head); M(G.sphLo, face, .17, .15, .1, 0, -.03, .18, head);
  for (const s of [-1, 1]) {
    M(G.knob, face, .08, .09, .04, s * .25, .04, 0, head); M(G.knob, blk, .03, .03, .03, s * .07, .04, .25, head);
    M(taperTube([[s * .25, .68, 0], [s * .36, .4, .2], [s * .14, .32, .32]], lin(.07, .05), 6, 4), fur, 1, 1, 1, 0, 0, 0, m);
    M(taperTube([[s * .18, .18, .08], [s * .32, .12, .38], [s * .14, .05, .48]], lin(.08, .05), 6, 4), fur, 1, 1, 1, 0, 0, 0, m);
  }
  const tail = grp(m, 0, .16, -.24); M(taperTube([[0, 0, 0], [0, -.05, -.4], [.1, .3, -.65], [.05, .6, -.5], [-.05, .5, -.35]], lin(.05, .025), 12, 4), fur, 1, 1, 1, 0, 0, 0, tail);
  return { m, head, tail };
}
function parrot(parent, x, y, z) {
  const p = grp(parent, x, y, z), green = mat(0x1fae3a, { roughness: .6 }), red = mat(0xe0201e, { roughness: .6 }), blue = mat(0x1e5bd8, { roughness: .6 }), yel = mat(0xffc81e, { roughness: .5 });
  const b = M(G.sphLo, green, .17, .3, .2, 0, .3, 0, p); b.rotation.x = -.25;
  M(G.sphLo, green, .14, .14, .14, 0, .62, .08, p); M(G.knob, red, .1, .06, .08, 0, .66, .14, p);
  M(G.cone, yel, .05, .14, .05, 0, .6, .24, p).rotation.x = PI / 2 + .6;
  for (const s of [-1, 1]) { const w = M(G.sphLo, s > 0 ? red : blue, .06, .24, .14, s * .16, .3, -.02, p); w.rotation.x = -.3; }
  M(G.cone, red, .07, .55, .05, 0, -.05, -.18, p).rotation.x = PI + .45;
  return p;
}
function buildKahlo() {
  seedFrom('kahlo');
  const { g, wheels, Rw } = carBase({ len: 9.6, frameW: 2.4, R: .78, axles: [3.4, -3.4], halfW: 1.55, glow: 0xff3fa4, hub: 0x2fd6c8 });
  const nm = [], sprites = [];
  const deck = hull(g, casaAzulTex(), 3.2, 1.3, 11, -.3, 5.5, 1.3, mat(0xb4532a, { roughness: .8 }), nm, 0, .35);
  rectNeon(g, 3.3, 11.1, deck, -.3, neon(0xff3fa4, 1));
  for (const s of [-1, 1]) noSh(M(G.box, neon(0x2fd6c8, .9), .07, .07, 11, s * 1.63, 1.08, -.3, g));
  // portrait cut-out (two-sided), with a 3D flower crown
  const pM = cardMat(fridaTex(), { side: THREE.FrontSide }); nm.push([pM, .02, .6]);
  const PS = 4.4, PZ = -3.5;
  sideCard(pM, 1, 0, 0, 1, 1, PS, PS, g, 0, deck + PS / 2, PZ, .03);
  const flM = cardMat(kahloFlowerTex()); nm.push([flM, .05, 1.1]);
  const crown = [[160, 182, 1], [196, 136, 2], [256, 112, 0], [316, 136, 3], [352, 182, 1]];
  for (const [cx, cy, k] of crown) for (const s of [-1, 1]) { const f = noSh(M(atlasGeo(2, k % 2, (k / 2) | 0), flM, .78, .78, 1, s * .1, deck + (1 - cy / 512) * PS, PZ + (cx - 256) / 512 * PS, g)); f.rotation.y = s * PI / 2; }
  // giant flowers on stems
  const stemM = mat(0x2f7a2a, { roughness: .8 }), leafM = mat(0x3f9a3a, { roughness: .8, flatShading: true }), heads = [];
  const fcol = [0x3a1a08, 0x5a0a14, 0xffd23f, 0x111111];
  for (const [x, z, h, k, D] of [[-1.4, 3.9, 2.8, 0, 1.5], [1.4, 3.5, 3.4, 1, 1.4], [-1.45, .2, 3.9, 2, 1.7], [1.45, -1.0, 3.0, 3, 1.5], [-1.35, -2.1, 2.5, 1, 1.3]]) {
    const top = V(x * 1.08, deck + h, z);
    M(taperTube([V(x, deck, z), V(x * .98, deck + h * .5, z + .1), top], lin(.11, .07), 8, 5), stemM, 1, 1, 1, 0, 0, 0, g);
    for (const kk of [.3, .55]) { const lf = M(G.knob, leafM, .6, .05, .26, x + Math.sign(x) * .3, deck + h * kk, z + (kk > .4 ? .2 : -.2), g); lf.rotation.z = Math.sign(x) * .5; lf.rotation.y = kk > .4 ? .5 : -.5; }
    const hd = grp(g, top.x, top.y, top.z); hd.rotation.z = -Math.sign(x) * .25;
    const geo = atlasGeo(2, k % 2, (k / 2) | 0);
    noSh(M(geo, flM, D, D, 1, 0, 0, 0, hd)); noSh(M(geo, flM, D, D, 1, 0, 0, 0, hd)).rotation.y = PI / 2;
    M(G.sphLo, mat(fcol[k], { roughness: .7 }), D * .12, D * .12, D * .12, 0, 0, 0, hd);
    heads.push({ hd, ph: R(0, TAU), z0: hd.rotation.z });
  }
  // monkey on a talavera pedestal, parrot on a perch
  M(G.box, mat(0x2a5fd8, { roughness: .5 }), .75, .7, .75, 1.15, deck + .35, -1.9, g); noSh(M(G.box, neon(0xffd23f, .8), .8, .06, .8, 1.15, deck + .7, -1.9, g));
  const mk = monkey(g, 1.15, deck + .7, -1.9, -.6);
  M(G.cylLo, mat(0x6b4a2e), .05, 2.0, .05, -1.3, deck + 1.0, 2.0, g); M(G.cylLo, mat(0x6b4a2e), .04, .6, .04, -1.3, deck + 2.0, 2.0, g).rotation.x = PI / 2;
  const par = parrot(g, -1.3, deck + 2.03, 2.0);
  // papel picado strung on poles
  const poleM = mat(0x5a3a22, { roughness: .7 }), PH = 3.9, strM = mat(0x222222), pt = papelTex();
  const flagMs = [0xff3fa4, 0xff8c1a, 0xffd23f, 0x2bd46a, 0x2f8bff, 0x9b30ff].map(c => { const m = new THREE.MeshStandardMaterial({ map: pt, color: c, emissiveMap: pt, emissive: c, emissiveIntensity: 0, alphaTest: .5, side: THREE.DoubleSide, roughness: .8 }); nm.push([m, 0, .7]); return m; });
  const lantern = [neon(0xff3fa4, 1.2), neon(0xffd23f, 1.2)];
  for (const [x, z] of [[-1.55, 4.9], [1.55, 4.9], [-1.55, -5.6], [1.55, -5.6]]) { M(G.cylLo, poleM, .06, PH, .06, x, deck + PH / 2, z, g); noSh(M(G.sphLo, lantern[z > 0 ? 0 : 1], .16, .2, .16, x, deck + PH + .15, z, g)); }
  const strands = [];
  const strand = (a, b, n, axis) => {
    const mid = a.clone().lerp(b, .5), sg = grp(g, mid.x, mid.y, mid.z), pts = [];
    for (let i = 0; i <= 10; i++) { const u = i / 10; pts.push(a.clone().lerp(b, u).sub(mid).add(V(0, -.45 * Math.sin(PI * u), 0))); }
    M(tube(pts, .015, 14, 3), strM, 1, 1, 1, 0, 0, 0, sg);
    for (let i = 0; i < n; i++) { const u = (i + .5) / n, p = a.clone().lerp(b, u).sub(mid).add(V(0, -.45 * Math.sin(PI * u) - .36, 0)); const f = noSh(M(G.plane, flagMs[i % flagMs.length], .5, .64, 1, p.x, p.y, p.z, sg)); if (axis === 'z') f.rotation.y = PI / 2; }
    strands.push({ sg, axis, ph: R(0, TAU) });
  };
  for (const s of [-1, 1]) strand(V(s * 1.55, deck + PH, 4.9), V(s * 1.55, deck + PH, -5.6), 13, 'z');
  strand(V(-1.55, deck + PH, 4.9), V(1.55, deck + PH, 4.9), 5, 'x');
  for (const [x, z] of [[-1.55, 4.9], [1.55, -5.6]]) { const sp = glowSprite(0xff9ad0, 2.2); sp.position.set(x, deck + PH + .15, z); g.add(sp); sprites.push([sp, .6]); }
  return finish('kahlo', g, {
    deck, seat: [0, deck, 4.0], dancers: [[-.55, deck, 2.3], [.65, deck, 1.1], [-.5, deck, -.5], [.35, deck, -.4]],
    poofers: [[-1.2, deck, -5.3], [1.2, deck, -5.3]], spotColor: 0xff7ab8, nightMats: nm, sprites, wheels, Rw, len: 11.2, height: 7.5,
    update(dt, t, ctx, night, sp) {
      const k = 1 + Math.min(1, sp / 5);
      for (const h of heads) { h.hd.rotation.x = Math.sin(t * 1.3 + h.ph) * .12 * k; h.hd.rotation.z = h.z0 + Math.sin(t * 1.1 + h.ph * 2) * .1; }
      for (const s of strands) { const a = (.12 + .08 * Math.min(1, sp / 6)) * Math.sin(t * 1.7 + s.ph); if (s.axis === 'z') s.sg.rotation.z = a; else s.sg.rotation.x = a; }
      mk.head.rotation.y = .6 * Math.sin(t * .7); mk.tail.rotation.x = .25 * Math.sin(t * 1.9); mk.tail.rotation.z = .2 * Math.sin(t * 1.3);
      par.rotation.x = .12 * Math.max(0, Math.sin(t * 2.4)); par.rotation.y = .4 * Math.sin(t * .5);
    },
  });
}

// ============================================================ 3. THE GOLDEN KISS (Klimt)
function buildKlimt() {
  seedFrom('klimt');
  const { g, wheels, Rw } = carBase({ len: 9.8, frameW: 2.4, R: .78, axles: [3.5, -3.5], halfW: 1.6, glow: 0xffc030, hub: 0xfff0b0 });
  const nm = [], sprites = [];
  const gt = rtex(goldTex(), 1, 1), hullM = texMat(gt, { metalness: .55, roughness: .38 }); nm.push([hullM, .02, .5]);
  M(boxGeoUV(3.3, 1.45, 11.2, 4.4, 2.2), hullM, 1, 1, 1, 0, 1.05 + .725, -.2, g);
  M(G.box, mat(0x1a1410, { roughness: .6 }), 3.4, .1, 11.3, 0, 2.55, -.2, g);
  const deck = 2.6, goldM = mat(0xd9a63a, { roughness: .3, metalness: .6 });
  rectNeon(g, 3.4, 11.3, deck, -.2, neon(0xffc030, 1.1));
  for (const s of [-1, 1]) noSh(M(G.box, neon(0xffe9a0, .8), .07, .07, 11.1, s * 1.68, 1.07, -.2, g));
  // twinkling tesserae along the flanks
  const tess = [0xfff2c0, 0x2ad4d0, 0xff3b30].map(c => glowMat(c, { roughness: .4 }));
  for (const s of [-1, 1]) for (let i = 0; i < 12; i++) M(G.box, tess[i % 3], .05, .26, .26, s * 1.66, 2.22, -5.3 + i * .93, g);
  // turntable with the embracing couple
  const KZ = -3.0, tt = grp(g, 0, deck, KZ);
  const meadowM = texMat(rtex(meadowTex(), 3, 1), { roughness: .8 }); nm.push([meadowM, 0, .6]);
  M(new THREE.CylinderGeometry(1.6, 1.7, .3, 24), meadowM, 1, 1, 1, 0, .15, 0, tt);
  noSh(M(new THREE.TorusGeometry(1.68, .05, 4, 28), neon(0xffd23f, 1.1), 1, 1, 1, 0, .3, 0, tt)).rotation.x = PI / 2;
  const robeM = texMat(robeTex(), { metalness: .45, roughness: .4 }); nm.push([robeM, .03, .42]);
  const prof = [[0, 0], [1.25, 0], [1.3, .3], [1.15, 1.0], [1.0, 2.0], [.92, 3.0], [.86, 3.6], [.74, 4.0], [.5, 4.28], [.2, 4.4], [0, 4.42]];
  const cloak = new THREE.LatheGeometry(prof.map(p => new THREE.Vector2(p[0], p[1])), 18); cloak.scale(1, 1, .72);
  M(cloak, robeM, 1, 1, 1, 0, .3, 0, tt);
  const skin = mat(0xf0d2b8, { roughness: .6 }), hairM = mat(0x1a1208, { roughness: .7 }), auburn = mat(0x8a3a1a, { roughness: .7 });
  const kiss = grp(tt, 0, .3, 0);
  const mh = grp(kiss, -.3, 4.75, 0); mh.rotation.z = -.6; M(G.sph, hairM, .44, .52, .46, 0, 0, 0, mh); M(G.cylLo, skin, .18, .5, .18, 0, -.45, 0, mh);
  for (let i = 0; i < 9; i++) { const a = i / 9 * TAU; noSh(M(G.knob, neon(0x6adf5a, .9), .11, .07, .11, Math.sin(a) * .42, .22, Math.cos(a) * .44, mh)); }
  const wh = grp(kiss, .55, 4.25, 0); wh.rotation.z = -1.3;
  M(G.sph, skin, .36, .44, .36, 0, 0, 0, wh); M(G.sph, auburn, .38, .36, .4, -.12, .18, -.02, wh);
  for (const s of [-1, 1]) M(G.knob, hairM, .09, .02, .03, .08, .06, s * .14, wh);
  M(G.knob, mat(0xc8283a), .07, .03, .1, .2, -.25, 0, wh);
  const fl = [neon(0xff6ab4, 1), neon(0x6aa8ff, 1), neon(0xfff2a0, 1)];
  for (let i = 0; i < 7; i++) noSh(M(G.oct, fl[i % 3], .09, .09, .09, -.16 + R(-.25, .25), .32 + R(-.1, .14), R(-.32, .32), wh));
  for (const [x, y, z] of [[.78, 4.55, .2], [.25, 4.05, .26], [.0, 4.55, .3]]) M(G.sphLo, skin, .13, .18, .1, x, y, z, kiss);
  noSh(M(ellipseTube(1.75, 2.85, 0, .06, 36), neon(0xffd23f, 1.2), 1, 1, 1, 0, 2.85, 0, kiss)).rotation.x = PI / 2;
  // two Tree-of-Life trees with spinning spiral branches
  const spirals = [], spN = [neon(0xffd23f, 1.1), neon(0xffa020, 1)];
  const spiralGeo = (r1, turns) => { const pts = []; for (let i = 0; i <= 30; i++) { const u = i / 30, a = u * turns * TAU, rr = .06 + r1 * u; pts.push(V(0, Math.sin(a) * rr, Math.cos(a) * rr)); } return tube(pts, .06, 24, 3); };
  for (const [x, z] of [[-1.42, 2.9], [1.42, 2.9]]) {
    const tg = grp(g, x, deck, z), sx = Math.sign(x);
    M(taperTube([[0, 0, 0], [0, 1.2, .05], [sx * .05, 2.4, 0], [0, 3.0, 0]], lin(.13, .06), 8, 5), goldM, 1, 1, 1, 0, 0, 0, tg);
    for (const [y, dz, r1, turns] of [[3.5, 0, .7, 2.6], [2.35, .85, .48, 2.2], [1.85, -.85, .45, 2.2]]) {
      if (dz) M(taperTube([[0, y - .75, 0], [0, y - .35, dz * .45], [0, y, dz]], lin(.06, .04), 6, 4), goldM, 1, 1, 1, 0, 0, 0, tg);
      const sw = grp(tg, sx * .04, y, dz); noSh(M(spiralGeo(r1, turns), spN[dz ? 1 : 0], 1, 1, 1, 0, 0, 0, sw));
      noSh(M(G.sphLo, neon(0xfff2c0, 1.2), .1, .1, .1, 0, 0, 0, sw));
      spirals.push({ sw, sp: (dz >= 0 ? .7 : -.8) * sx });
    }
    for (const [y, dz] of [[1.2, .35], [2.9, -.4], [2.9, .45]]) { const e = noSh(M(G.sphLo, neon(0x2ad4d0, 1), .06, .1, .16, 0, y, dz, tg)); e.rotation.x = .4; }
  }
  return finish('klimt', g, {
    deck, seat: [0, deck, 4.3], dancers: [[-.6, deck, 2.2], [.7, deck, 1.4], [-.5, deck, -.4], [.6, deck, -.9]],
    poofers: [[-1.3, deck, -5.3], [1.3, deck, -5.3]], spotColor: 0xffc860, nightMats: nm, sprites, wheels, Rw, len: 11.4, height: 8.6,
    update(dt, t, ctx, night) {
      tt.rotation.y += dt * .3;
      const sh = .85 + .15 * Math.sin(t * 2.1); hullM.emissiveIntensity *= sh; robeM.emissiveIntensity *= 1.15 - (sh - .85);
      for (let i = 0; i < 3; i++) tess[i].emissiveIntensity = .05 + night * (.25 + 1.6 * Math.pow(.5 + .5 * Math.sin(t * 3 + i * 2.1), 3));
      for (const s of spirals) s.sw.rotation.x = t * s.sp;
      kiss.rotation.z = .02 * Math.sin(t * .8);
    },
  });
}

// ============================================================ 4. BOOGIE WOOGIE (Mondrian)
function buildMondrian() {
  seedFrom('mondrian');
  const { g, wheels, Rw } = carBase({ len: 9.6, frameW: 2.4, R: .78, axles: [3.4, -3.6], halfW: 1.55, glow: 0xffe14a, hub: 0xe8262b });
  const nm = [], sprites = [];
  const whiteM = new THREE.MeshStandardMaterial({ color: 0xece8de, roughness: .7, emissive: 0xfff6e0, emissiveIntensity: 0 }); nm.push([whiteM, 0, .12]);
  const blackM = mat(0x111111, { roughness: .5 });
  const pm = [0xe3201b, 0xffd41f, 0x1f4fb8].map(c => new THREE.MeshStandardMaterial({ color: c, roughness: .45, emissive: c, emissiveIntensity: .08 }));
  const LW = .12;
  const comp = (c, n, U, Vh) => {
    const [nx, nz] = n, tx = nx ? 0 : 1, tz = nx ? 1 : 0;
    const box = (uc, vc, w, h, m, off, th) => M(G.box, m, tx ? w : th, h, tz ? w : th, c.x + tx * uc + nx * off, c.y + vc, c.z + tz * uc + nz * off, g);
    const nu = U > 6 ? 3 : U > 2.5 ? 2 : 1, nv = Vh > 2.4 ? 2 : 1, us = [-U / 2], vs = [-Vh / 2];
    for (let i = 0; i < nu; i++) us.push(-U / 2 + U * (i + R(.3, .7)) / nu); us.push(U / 2);
    for (let i = 0; i < nv; i++) vs.push(-Vh / 2 + Vh * (i + R(.35, .65)) / nv); vs.push(Vh / 2);
    const cells = []; for (let i = 0; i < us.length - 1; i++) for (let j = 0; j < vs.length - 1; j++) cells.push([i, j]);
    for (let k = cells.length - 1; k > 0; k--) { const q = (rnd() * (k + 1)) | 0; [cells[k], cells[q]] = [cells[q], cells[k]]; }
    const ncol = Math.min(cells.length, U > 4 ? 3 : U > 1.5 ? 2 : 1), c0 = (rnd() * 3) | 0;
    for (let k = 0; k < ncol; k++) { const [i, j] = cells[k]; const u0 = us[i] + LW / 2, u1 = us[i + 1] - LW / 2, v0 = vs[j] + LW / 2, v1 = vs[j + 1] - LW / 2; box((u0 + u1) / 2, (v0 + v1) / 2, u1 - u0, v1 - v0, pm[(c0 + k) % 3], .02, .03); }
    for (const u of us) box(u, 0, LW, Vh + LW, blackM, .03, .045);
    for (const v of vs) box(0, v, U + LW, LW, blackM, .03, .045);
  };
  const vols = [[0, 1.9, -.3, 3.2, 1.8, 11.0], [0, 3.4, 4.6, 3.2, 1.2, 1.2], [-.3, 4.4, -4.4, 2.6, 3.2, 2.4], [.5, 6.75, -4.0, 1.6, 1.5, 1.6]];
  for (const [x, y, z, w, h, d] of vols) {
    M(G.box, whiteM, w, h, d, x, y, z, g);
    for (const s of [-1, 1]) { comp(V(x + s * w / 2, y, z), [s, 0], d, h); comp(V(x, y, z + s * d / 2), [0, s], w, h); }
  }
  // Broadway Boogie Woogie deck
  const deck = 2.82, bbwM = texMat(bbwTex(), { roughness: .6 }); nm.push([bbwM, .02, .2]);
  const dp = noSh(M(G.plane, bbwM, 3.2, 7.2, 1, 0, 2.81, .4, g)); dp.rotation.x = -PI / 2;
  // side rails with travelling Boogie Woogie squares
  const railN = neon(0xffd41f, 1);
  for (const s of [-1, 1]) { for (let i = 0; i < 6; i++) M(G.cylLo, blackM, .04, .9, .04, s * 1.52, deck + .45, -3.1 + i * 1.4, g); noSh(M(G.box, railN, .09, .09, 7.1, s * 1.52, deck + .92, .4, g)); }
  const NQ = 9, sq = [neon(0xff2a1e, 1.5), neon(0x2f6bff, 1.6), neon(0xf0f0f0, 1.1)].map(m => { const im = new THREE.InstancedMesh(G.box, m, 6); im.castShadow = false; im.frustumCulled = false; g.add(im); return im; });
  const _m = new THREE.Matrix4(), _s = V(.2, .2, .2);
  const updSq = (t) => { const cnt = [0, 0, 0]; for (const s of [-1, 1]) for (let k = 0; k < NQ; k++) { const u = ((k / NQ + s * t * .05) % 1 + 1) % 1, ci = k % 3; _m.makeScale(_s.x, _s.y, _s.z); _m.setPosition(s * 1.52, deck + .92, -3.1 + u * 7.0); sq[ci].setMatrixAt(cnt[ci]++, _m); } for (const im of sq) im.instanceMatrix.needsUpdate = true; };
  updSq(0);
  const lasers = makeLasers(4, [0xff2a1e, 0x2f6bff, 0xffd41f], 90); lasers.position.set(.5, 7.6, -4.0);
  return finish('mondrian', g, {
    deck, seat: [0, deck, 3.4], dancers: [[-.7, deck, 1.9], [.7, deck, .8], [-.6, deck, -.7], [.6, deck, -2.3]],
    poofers: [[-1.3, 6.0, -5.3], [.75, 6.0, -5.35]], spotColor: 0xfff0d0, nightMats: nm, sprites, wheels, Rw, lasers, len: 11.0, height: 7.6,
    update(dt, t, ctx, night) {
      const beat = t * 2.1;
      for (let k = 0; k < 3; k++) { const ph = ((beat + k / 3) % 1 + 1) % 1; pm[k].emissiveIntensity = .08 + night * (.45 + 1.5 * Math.exp(-ph * 5)); }
      updSq(t);
    },
  });
}

// ============================================================ 5. COMPOSITION VIII (Kandinsky)
function buildKandinsky() {
  seedFrom('kandinsky');
  const { g, wheels, Rw } = carBase({ len: 9.6, frameW: 2.4, R: .78, axles: [3.4, -3.4], halfW: 1.55, glow: 0x9b5bff, hub: 0xffd23f });
  const nm = [], sprites = [];
  const deck = hull(g, rtex(kandHullTex(), 1, 1), 3.2, 1.3, 11, -.3, 5.5, 1.3, mat(0x1c1a24, { roughness: .6 }), nm, .02, .4);
  rectNeon(g, 3.3, 11.1, deck, -.3, neon(0x9b5bff, 1.1));
  for (const s of [-1, 1]) noSh(M(G.box, neon(0xff4fa8, .9), .07, .07, 11, s * 1.63, 1.08, -.3, g));
  const cardM = cardMat(kandAtlas()); nm.push([cardM, .03, .6]);
  const rodM = mat(0x111111, { roughness: .5 });
  const card = (k, size, parent) => noSh(M(atlasGeo(4, k % 4, (k / 4) | 0), cardM, size, size, 1, 0, 0, 0, parent));
  const spinners = [];
  const onRod = (x, z, h, fn, sp) => { M(G.cylLo, rodM, .05, h, .05, x, deck + h / 2, z, g); const s = grp(g, x, deck + h, z); fn(s); spinners.push({ s, sp, ph: R(0, TAU) }); return s; };
  // the big haloed circle
  onRod(-.9, -4.3, 5.6, (s) => { card(0, 3.2, s); noSh(M(G.ring, neon(0xb06aff, 1.2), 1.54, 1.54, 1.54, 0, 0, 0, s)); noSh(M(G.ring, neon(0xff3b5a, 1), .55, .55, .55, .26, .22, 0, s)); const sp = glowSprite(0xb98aff, 5); s.add(sp); sprites.push([sp, .35]); }, .25);
  // triangle with neon edges
  onRod(1.2, 2.7, 3.6, (s) => { card(4, 2.5, s); neonLine(s, [[0, 1.1, 0], [1.1, -.96, 0], [-1.1, -.96, 0]], .04, neon(0xffd23f, 1.2), true); }, -.5);
  // circle front-left
  onRod(-1.25, 1.0, 4.4, (s) => { card(1, 2.1, s); noSh(M(G.ring, neon(0x46c8ff, 1.2), 1.0, 1.0, 1.0, 0, 0, 0, s)); }, .6);
  // checkerboard grid
  onRod(1.2, -3.5, 3.8, (s) => { card(6, 2.1, s); neonLine(s, [[-.92, -.92, 0], [.92, -.92, 0], [.92, .92, 0], [-.92, .92, 0]], .035, neon(0xffffff, .8), true); }, -.35);
  // central mast with orbiting shapes
  M(G.cylLo, rodM, .07, 5.2, .07, 0, deck + 2.6, -1.2, g);
  const orbit = grp(g, 0, deck + 5.0, -1.2), orb = [];
  for (const [k, a, h, ring] of [[2, 0, .2, 0xff4fa8], [7, TAU / 3, -.3, 0xffa020], [5, 2 * TAU / 3, .5, 0]]) {
    const arm = grp(orbit, 0, 0, 0); arm.rotation.y = a; M(G.cylLo, rodM, .03, 1.8, .03, 0, 0, .9, arm).rotation.x = PI / 2;
    const s = grp(arm, 0, h, 1.8); card(k, 1.6, s); if (ring) noSh(M(G.ring, neon(ring, 1.1), .76, .76, .76, 0, 0, 0, s)); else neonLine(s, [[0, .7, 0], [.7, -.6, 0], [-.7, -.6, 0]], .03, neon(0xff3b30, 1.1), true);
    orb.push({ s, ph: R(0, TAU) });
  }
  noSh(M(G.sphLo, neon(0xffd23f, 1.3), .18, .18, .18, 0, deck + 5.25, -1.2, g));
  // straight lines and floating dots
  const lineM = [neon(0xff4fa8, 1), neon(0x46c8ff, 1), neon(0xffd23f, .9)];
  noSh(M(tube([[1.55, deck + .2, 1.2], [1.25, deck + 6.2, -5.2]], .035, 2, 3), lineM[0], 1, 1, 1, 0, 0, 0, g));
  noSh(M(tube([[-1.55, deck + .2, -.4], [-1.05, deck + 5.2, -5.6]], .035, 2, 3), lineM[1], 1, 1, 1, 0, 0, 0, g));
  noSh(M(tube([[-1.4, deck + 5.8, 2.4], [1.45, deck + 4.2, -1.6]], .03, 2, 3), lineM[2], 1, 1, 1, 0, 0, 0, g));
  const dots = grp(g), dcol = [0xff3b30, 0x2f6bff, 0xffd23f, 0x9b5bff, 0x2bd46a];
  for (let i = 0; i < 9; i++) { const s = R(.1, .22); noSh(M(G.sphLo, neon(dcol[i % 5], 1.1), s, s, s, R(-1.5, 1.5), deck + R(3.2, 6.6), R(-5, 3), dots)); }
  const lasers = makeLasers(4, [0x9b5bff, 0xffd23f], 90); lasers.position.set(0, deck + 5.3, -1.2);
  return finish('kandinsky', g, {
    deck, seat: [0, deck, 4.1], dancers: [[-.5, deck, 2.4], [.55, deck, .8], [-.6, deck, -.6], [.55, deck, -1.9]],
    poofers: [[-1.3, deck, -5.4], [1.3, deck, -5.4]], spotColor: 0xc8a0ff, nightMats: nm, sprites, wheels, Rw, lasers, len: 11.0, height: 9.8,
    update(dt, t) {
      orbit.rotation.y = t * .45;
      for (const o of orb) { o.s.rotation.y = t * .9 + o.ph; o.s.position.y = .15 * Math.sin(t * 1.4 + o.ph); }
      for (const s of spinners) { s.s.rotation.y = s.ph + t * s.sp; s.s.rotation.z = .12 * Math.sin(t * .8 + s.ph); }
      dots.position.y = .15 * Math.sin(t * 1.1); dots.rotation.y = .05 * Math.sin(t * .4);
    },
  });
}

// ============================================================ 6. SOUP CAN CRUISER (Warhol)
function buildWarhol() {
  seedFrom('warhol');
  const { g, wheels, Rw } = carBase({ len: 9.8, frameW: 2.4, R: .8, axles: [3.5, -3.5], halfW: 1.6, glow: 0xff2a6a, hub: 0x30e0ff });
  const nm = [], sprites = [];
  const deckM = mat(0xc8ccd4, { roughness: .28, metalness: .85 });
  const deck = hull(g, rtex(warholFlowersTex(), 1, 1), 3.4, 1.3, 11.6, -.2, 5.8, 1.3, deckM, nm, 0, .45);
  rectNeon(g, 3.5, 11.7, deck, -.2, neon(0x30e0ff, 1));
  for (const s of [-1, 1]) noSh(M(G.box, neon(0xff2a6a, .9), .07, .07, 11.5, s * 1.73, 1.08, -.2, g));
  // the giant can (label glows at night)
  const CR = 1.75, CH = 5.0, CZ = -.2;
  const labM = texMat(soupLabelTex(), { roughness: .45 }); nm.push([labM, .02, .75]);
  const lidM = new THREE.MeshStandardMaterial({ map: lidTex(), roughness: .25, metalness: .8 });
  keep(M(new THREE.CylinderGeometry(CR, CR, CH, 32), [labM, lidM, lidM], 1, 1, 1, 0, deck + CH / 2, CZ, g));
  const chrome = mat(0xe6e8ec, { roughness: .2, metalness: .9 });
  for (const y of [deck + .05, deck + CH]) { M(new THREE.TorusGeometry(CR, .08, 6, 36), chrome, 1, 1, 1, 0, y, CZ, g).rotation.x = PI / 2; }
  noSh(M(new THREE.TorusGeometry(CR + .1, .05, 4, 40), neon(0xffd23f, 1.2), 1, 1, 1, 0, deck + CH + .12, CZ, g)).rotation.x = PI / 2;
  noSh(M(new THREE.TorusGeometry(CR + .08, .05, 4, 40), neon(0xffffff, 1), 1, 1, 1, 0, deck + .25, CZ, g)).rotation.x = PI / 2;
  // 2x2 pop portrait grid (two-sided), cycling colourways
  const popT = [popFaceTex(0), popFaceTex(2), popFaceTex(1)];
  const popM = new THREE.MeshStandardMaterial({ map: popT[0], emissiveMap: popT[0], emissive: 0xffffff, emissiveIntensity: 0, roughness: .6 }); nm.push([popM, .02, .6]);
  const GS = 3.2, GZ = -4.2, GY = deck + .2 + GS / 2;
  sideCard(popM, 1, 0, 0, 1, 1, GS, GS, g, 0, GY, GZ, .07);
  M(G.box, mat(0x111111, { roughness: .5 }), .12, GS + .2, GS + .2, 0, GY, GZ, g);
  for (const [s, c] of [[-1, 0xff2a8a], [1, 0x30e0ff]]) neonLine(g, [[s * .1, GY - GS / 2 - .08, GZ - GS / 2 - .08], [s * .1, GY - GS / 2 - .08, GZ + GS / 2 + .08], [s * .1, GY + GS / 2 + .08, GZ + GS / 2 + .08], [s * .1, GY + GS / 2 + .08, GZ - GS / 2 - .08]], .045, neon(c, 1.1), true);
  for (const s of [-1, 1]) { neonLine(g, [[s * .1, GY, GZ - GS / 2], [s * .1, GY, GZ + GS / 2]], .025, neon(0xffffff, .7)); neonLine(g, [[s * .1, GY - GS / 2, GZ], [s * .1, GY + GS / 2, GZ]], .025, neon(0xffffff, .7)); }
  M(G.box, mat(0x111111), .2, .2, .2, 0, deck + .1, GZ, g);
  // the banana (Velvet Underground cover) as a hood ornament
  const banM = glowMat(0xffd81e, { roughness: .5 }); nm.push([banM, .0, .55]);
  const ban = grp(g, 0, deck + .35, 4.9);
  M(taperTube([[-1.0, .35, 0], [-.5, .06, .04], [0, 0, .06], [.5, .08, .04], [1.0, .38, 0]], (t) => .05 + .22 * Math.pow(Math.sin(PI * t), .7), 12, 6), banM, 1, 1, 1, 0, 0, 0, ban);
  M(G.knob, mat(0x3a2a14), .06, .08, .06, -1.02, .37, 0, ban); M(G.cylLo, mat(0x6a5a2a), .05, .22, .05, 1.06, .46, 0, ban).rotation.z = -.5;
  const lasers = makeLasers(4, [0xff2a6a, 0x30e0ff], 90); lasers.position.set(0, deck + CH + .2, CZ);
  const csp = glowSprite(0xff6a7a, 6); csp.position.set(0, deck + CH * .55, CZ); g.add(csp); sprites.push([csp, .22]);
  let last = -1;
  return finish('warhol', g, {
    deck, seat: [0, deck, 4.0], dancers: [[-.7, deck, 2.6], [.7, deck, 2.2], [0, deck + CH + .02, CZ - .3], [-.4, deck + CH + .02, CZ + .5]],
    poofers: [[-1.35, deck, -5.6], [1.35, deck, -5.6]], spotColor: 0xff8aa8, nightMats: nm, sprites, wheels, Rw, lasers, len: 11.8, height: deck + CH + 1.3,
    update(dt, t, ctx, night, sp) {
      const q = Math.floor(t / 1.4) % popT.length; if (q !== last) { last = q; popM.map = popT[q]; popM.emissiveMap = popT[q]; }
      ban.rotation.z = .05 * Math.sin(t * 1.6); ban.position.y = deck + .35 + .04 * Math.sin(t * 2.2);
    },
  });
}

// ============================================================ 7. RADIANT BABY (Keith Haring)
function buildHaring() {
  seedFrom('haring');
  const { g, wheels, Rw } = carBase({ len: 9.8, frameW: 2.4, R: .78, axles: [3.4, -3.8], halfW: 1.55, glow: 0x39ff6a, hub: 0xff2a2a });
  const nm = [], sprites = [];
  const deck = hull(g, rtex(haringHullTex(), 1, 1), 3.2, 1.4, 11.4, -.5, 4.6, 1.4, mat(0xe52320, { roughness: .6 }), nm, .02, .45);
  rectNeon(g, 3.3, 11.5, deck, -.5, neon(0x39ff6a, 1.1));
  for (const s of [-1, 1]) noSh(M(G.box, neon(0xff3fa4, .9), .07, .07, 11.3, s * 1.63, 1.08, -.5, g));
  const at = haringAtlas(), figM = texMat(at, { alphaTest: .5, roughness: .8 }); nm.push([figM, .04, .9]);
  const figs = [];
  const fig = (k, size, x, y, z, gap, ph, amp = .3) => { const s = sideCard(figM, 4, k % 4, (k / 4) | 0, 1, 1, size, size, g, x, y, z, gap); figs.push({ s, y, ph, amp }); return s; };
  fig(0, 3.0, 0, deck + 1.5, -2.6, .02, 0);
  fig(3, 3.0, 0, deck + 1.5, -4.3, .06, PI);
  fig(7, 1.9, 0, deck + .95, -6.0, .1, PI / 2, .18);
  fig(4, 1.6, 1.15, deck + .8, 1.4, .02, 1.3, .25); fig(1, 1.6, -1.15, deck + .8, .2, .02, 2.2, .25);
  // radiant baby up front with neon rays
  M(G.box, mat(0xffd800, { roughness: .6 }), 2.2, .7, 1.0, 0, deck + .35, 4.9, g); noSh(M(G.box, neon(0x111111, .2), 2.25, .08, 1.05, 0, deck + .7, 4.9, g));
  const baby = fig(6, 2.1, 0, deck + 1.65, 4.9, .02, .7, .12);
  const rays = grp(baby), rayM = neon(0xffd400, 1.4);
  for (let i = 0; i < 12; i++) { const a = i / 12 * TAU + .2; const r0 = .95, r1 = 1.35; const b = noSh(M(G.box, rayM, .07, r1 - r0, .07, 0, Math.sin(a) * (r0 + r1) / 2, Math.cos(a) * (r0 + r1) / 2, rays)); b.rotation.x = -a + PI / 2; }
  // heart on a pole over the dance floor
  M(G.cylLo, mat(0x111111), .05, 4.3, .05, 0, deck + 2.15, -.9, g);
  const heart = sideCard(figM, 4, 0, 2, 1, 1, 1.7, 1.7, g, 0, deck + 4.9, -.9, .02);
  const hrays = grp(heart), hrM = neon(0xff1e3c, 1.4);
  for (let i = 0; i < 10; i++) { const a = i / 10 * TAU; const b = noSh(M(G.box, hrM, .06, .35, .06, 0, Math.sin(a) * 1.05, Math.cos(a) * 1.05, hrays)); b.rotation.x = -a + PI / 2; }
  const hsp = glowSprite(0xff4a6a, 3.5); heart.add(hsp); sprites.push([hsp, .5]);
  return finish('haring', g, {
    deck, seat: [0, deck, 3.7], dancers: [[-.7, deck, 2.4], [.7, deck, .2], [-.65, deck, -.9], [.6, deck, -1.5]],
    poofers: [[-1.3, deck, -5.4], [1.3, deck, -5.4]], spotColor: 0x8aff9a, nightMats: nm, sprites, wheels, Rw, len: 12.0, height: 8.4,
    update(dt, t, ctx, night, sp) {
      const k = 1 + Math.min(.6, sp / 8), bt = t * 4.2;
      for (const f of figs) { f.s.position.y = f.y + Math.abs(Math.sin(bt * .5 + f.ph)) * f.amp * k; f.s.rotation.x = .08 * Math.sin(bt * .5 + f.ph); }
      const pul = 1 + .12 * Math.pow(Math.abs(Math.sin(t * 3.1)), 4);
      heart.scale.setScalar(pul); rays.rotation.x = t * .5; rays.scale.setScalar(.95 + .1 * Math.sin(t * 6)); hrays.rotation.x = -t * .4;
    },
  });
}

// ============================================================ 8. INFINITY PUMPKIN (Yayoi Kusama)
function buildKusama() {
  seedFrom('kusama');
  const { g, wheels, Rw } = carBase({ len: 9.6, frameW: 2.4, R: .78, axles: [3.4, -3.4], halfW: 1.55, glow: 0xff2a2a, hub: 0xffe600 });
  const nm = [], sprites = [];
  const hullT = polkaTex('polkaRW', '#e0141e', '#ffffff', 256, 16, 14, 26), hullE = polkaTex('polkaRWe', '#000000', '#ffffff', 256, 16, 14, 26, 'polkaRW');
  const hm = new THREE.MeshStandardMaterial({ map: rtex(hullT, 1, 1), emissiveMap: rtex(hullE, 1, 1), emissive: 0xffffff, emissiveIntensity: 0, roughness: .6 }); nm.push([hm, 0, .45]);
  M(boxGeoUV(3.3, 1.3, 11, 1.4, 1.4), hm, 1, 1, 1, 0, 1.7, -.3, g);
  M(G.box, mat(0x111111, { roughness: .5 }), 3.4, .1, 11.1, 0, 2.4, -.3, g);
  const deck = 2.45;
  rectNeon(g, 3.4, 11.1, deck, -.3, neon(0xffe600, 1));
  for (const s of [-1, 1]) noSh(M(G.box, neon(0xff3fa4, .9), .07, .07, 11, s * 1.68, 1.06, -.3, g));
  // the pumpkin
  const pg = new THREE.SphereGeometry(1, 30, 16), pp = pg.attributes.position;
  for (let i = 0; i < pp.count; i++) {
    const x = pp.getX(i), y = pp.getY(i), z = pp.getZ(i), phi = Math.atan2(z, -x), rib = .86 + .14 * Math.pow(Math.abs(Math.cos(5 * phi)), .5), rr = Math.hypot(x, z);
    pp.setXYZ(i, x * rib, y * .8 - Math.sign(y) * .2 * Math.exp(-rr * rr / .05), z * rib);
  }
  pg.computeVertexNormals();
  const pumpM = new THREE.MeshStandardMaterial({ map: pumpkinTex(false), emissiveMap: pumpkinTex(true), emissive: 0xffffff, emissiveIntensity: 0, roughness: .75 });
  const PZ = -3.2, PR = 2.3, PY = deck + .8 * 2.15 - .05;
  M(pg, pumpM, PR, 2.15, PR * .95, 0, PY, PZ, g);
  M(taperTube([[0, 0, 0], [.05, .4, 0], [.25, .7, .05], [.45, .8, .1]], lin(.24, .15), 8, 6), mat(0x3a5a1a, { roughness: .7 }), 1, 1, 1, 0, PY + 1.35, PZ, g);
  noSh(M(ellipseTube(PR * .93, PR * .9, 0, .06, 48), neon(0xffe600, 1.2), 1, 1, 1, 0, deck + .3, PZ, g));
  const psp = glowSprite(0xffe680, 7); psp.position.set(0, PY + .3, PZ); g.add(psp); sprites.push([psp, .25]);
  // red & white polka-dot tentacles
  const tRed = new THREE.MeshStandardMaterial({ map: rtex(hullT, 1, 2), emissiveMap: rtex(hullE, 1, 2), emissive: 0xffffff, emissiveIntensity: 0, roughness: .5 }); nm.push([tRed, 0, .7]);
  const tents = [];
  for (const [x, z, lean, h] of [[-1.35, -.3, -1, 1], [1.35, -.4, 1, 1.1], [-1.45, -5.55, -1, .9], [1.45, -5.45, 1, 1.0]]) {
    let parent = grp(g, x, deck, z); const root = parent, segs = [];
    for (let i = 0; i < 6; i++) { const r0 = .42 - i * .055, L = .7 * h; const sg = grp(parent, 0, i ? L : 0, 0); M(G.cylLo, tRed, r0, L, r0, 0, L / 2, 0, sg); M(G.knob, tRed, r0 * 1.05, r0 * 1.05, r0 * 1.05, 0, 0, 0, sg); segs.push(sg); parent = sg; }
    M(G.sphLo, tRed, .17, .17, .17, 0, .7 * h, 0, parent);
    tents.push({ root, segs, lean, ph: R(0, TAU) });
  }
  // polka spheres on rods (red/white and white/red) + glowing dot orbs
  const wM = new THREE.MeshStandardMaterial({ map: rtex(polkaTex('polkaWR', '#f6f2ea', '#e0141e', 256, 16, 14, 26), 2, 1), roughness: .45 });
  const balls = [], rodM = mat(0x111111);
  for (const [x, z, h, s, m] of [[-1.3, 3.3, 2.8, .5, tRed], [1.3, 3.0, 3.4, .42, wM], [-1.4, 1.5, 4.0, .38, wM], [1.35, 1.1, 2.2, .55, tRed], [0, 5.1, 1.0, .45, wM]]) {
    M(G.cylLo, rodM, .03, h, .03, x, deck + h / 2, z, g); const b = grp(g, x, deck + h, z); M(G.sph, m, s, s, s, 0, 0, 0, b); balls.push({ b, y: deck + h, ph: R(0, TAU) });
  }
  const orbs = grp(g), oc = [0xfff3b0, 0xff7ad8, 0x7af0ff, 0xffd23f];
  for (let i = 0; i < 14; i++) { const s = R(.1, .17); noSh(M(G.knob, neon(oc[i % 4], 1.0), s, s, s, R(-1.6, 1.6), deck + R(3.5, 6.2), R(-5.5, 3.5), orbs)); }
  return finish('kusama', g, {
    deck, seat: [0, deck, 4.2], dancers: [[-.55, deck, 2.4], [.6, deck, 2.0], [-.4, deck, .5], [.45, deck, .1]],
    poofers: [[-.55, deck, -5.6], [.55, deck, -5.6]], spotColor: 0xffe680, nightMats: nm, sprites, wheels, Rw, len: 11.2, height: 7.6,
    update(dt, t, ctx, night, sp) {
      pumpM.emissiveIntensity = night * (.55 + .45 * Math.sin(t * 1.3)) + .02;
      pumpM.emissive.setHSL((.12 + .08 * Math.sin(t * .3)) % 1, .5, .75);
      const k = 1 + Math.min(.5, sp / 10);
      for (const tn of tents) { tn.root.rotation.z = -tn.lean * .45; for (let i = 0; i < tn.segs.length; i++) { const sg = tn.segs[i]; sg.rotation.z = tn.lean * (.05 + .1 * Math.sin(t * 1.3 - i * .6 + tn.ph)) * k; sg.rotation.x = .07 * Math.sin(t * .9 - i * .5 + tn.ph * 2); } }
      for (const b of balls) b.b.position.y = b.y + .12 * Math.sin(t * 1.5 + b.ph);
      orbs.position.y = .2 * Math.sin(t * .8); orbs.rotation.y = .05 * Math.sin(t * .3);
    },
  });
}

// ============================================================ 9. THE SCREAM (Munch)
function buildScream() {
  seedFrom('scream');
  const { g, wheels, Rw } = carBase({ len: 9.8, frameW: 2.4, R: .78, axles: [3.5, -3.5], halfW: 1.55, glow: 0xff6a1a, hub: 0x3a8cff });
  const nm = [], sprites = [];
  const plankM = mat(0x8a4a22, { roughness: .85 });
  const deck = hull(g, rtex(fjordTex(), 1, 1), 3.2, 1.4, 11.2, -.4, 5.6, 1.4, plankM, nm, .02, .4);
  for (let i = 0; i < 18; i++) M(G.box, mat(0x3a1e0e), 3.2, .02, .03, 0, deck + .005, -5.9 + i * .62, g);
  for (const s of [-1, 1]) noSh(M(G.box, neon(0x3a8cff, 1), .07, .07, 11.1, s * 1.63, 1.08, -.4, g));
  // bridge railing along the deck
  const railM = mat(0x7a4a26, { roughness: .8 }), railN = neon(0xff7a1a, 1.1);
  for (const s of [-1, 1]) {
    for (let i = 0; i < 9; i++) M(G.cylLo, railM, .05, 1.0, .05, s * 1.52, deck + .5, -5.8 + i * 1.22, g);
    M(G.box, railM, .07, .07, 9.9, s * 1.52, deck + .5, -.9, g); noSh(M(G.box, railN, .08, .08, 9.9, s * 1.52, deck + 1.0, -.9, g));
    for (let i = 0; i < 8; i++) { const z0 = -5.8 + i * 1.22; M(tube([[s * 1.52, deck + .05, z0], [s * 1.52, deck + .95, z0 + 1.22]], .025, 1, 3), railM, 1, 1, 1, 0, 0, 0, g); }
  }
  // the swirling sky panel (two-sided, rippling)
  const skyM = texMat(screamSkyTex(), { side: THREE.DoubleSide, roughness: .8 }); nm.push([skyM, .05, .8]);
  const SL = 4.6, SH = 5.0, sgeo = new THREE.PlaneGeometry(SL, SH, 20, 8); sgeo.rotateY(PI / 2);
  const spos = sgeo.attributes.position, base = Float32Array.from(spos.array);
  for (let i = 0; i < spos.count; i++) { const y = base[i * 3 + 1], z = base[i * 3 + 2], v = (y + SH / 2) / SH; base[i * 3 + 1] = -SH / 2 + v * (SH + v * (.45 * Math.sin(z * 2.2) + .25 * Math.sin(z * 3.7 + 1))); }
  spos.array.set(base); sgeo.computeVertexNormals();
  const SZ = -3.2, sky = keep(noSh(M(sgeo, skyM, 1, 1, 1, 0, deck + SH / 2, SZ, g)));
  M(G.box, mat(0x2a1a10), .12, .3, SL, 0, deck + .15, SZ, g);
  for (const z of [SZ - SL / 2 - .05, SZ + SL / 2 + .05]) noSh(M(G.box, neon(0xffc23a, 1), .08, SH * .95, .08, 0, deck + SH * .47, z, g));
  const ssp = glowSprite(0xff7a2a, 7); ssp.position.set(0, deck + 3.2, SZ); g.add(ssp); sprites.push([ssp, .3]);
  // the wailing figure
  const fig = grp(g, 0, deck, 1.5), navy = mat(0x1a2238, { roughness: .8 }); fig.scale.setScalar(1.12);
  M(taperTube([[0, 0, 0], [.3, 1.0, -.1], [-.25, 2.1, 0], [.1, 3.0, .1], [0, 3.6, .05]], (t) => .22 + .5 * Math.pow(1 - t, 1.5), 16, 8), navy, 1, 1, 1, 0, 0, 0, fig);
  M(G.sphLo, navy, .52, .24, .32, 0, 3.32, .05, fig);
  const hg = new THREE.SphereGeometry(1, 18, 14), hp = hg.attributes.position;
  for (let i = 0; i < hp.count; i++) { const x = hp.getX(i), y = hp.getY(i), z = hp.getZ(i), k = y < 0 ? 1 + .45 * y : 1 + .08 * y; hp.setXYZ(i, x * k * .62, y * .9, z * k * .58); }
  hg.computeVertexNormals();
  const faceM = texMat(screamFaceTex(), { roughness: .7 }); nm.push([faceM, .02, .7]);
  const head = grp(fig, 0, 4.35, .08); head.scale.setScalar(.85);
  M(hg, faceM, 1, 1, 1, 0, 0, 0, head);
  const skinM = mat(0xd9cf96, { roughness: .7 });
  for (const s of [-1, 1]) {
    const hand = M(G.sphLo, skinM, .14, .36, .2, s * .58, -.18, .14, head); hand.rotation.z = s * .2;
    M(taperTube([[s * .45, 3.35, 0], [s * .95, 2.8, .25], [s * .62, 4.0, .25]], lin(.13, .09), 10, 5), navy, 1, 1, 1, 0, 0, 0, fig);
  }
  const fsp = glowSprite(0xfff0b0, 2.6); fsp.position.set(0, 4.3, .5); fig.add(fsp); sprites.push([fsp, .35]);
  return finish('scream', g, {
    deck, seat: [0, deck, 3.9], dancers: [[-.85, deck, -1.8], [.85, deck, -3.4], [-.75, deck, .0], [.85, deck, 2.9]],
    poofers: [[-1.2, deck, -5.6], [1.2, deck, -5.6]], spotColor: 0xff8a3a, nightMats: nm, sprites, wheels, Rw, len: 11.4, height: 8.2,
    update(dt, t, ctx, night, sp) {
      fig.rotation.z = .07 * Math.sin(t * .8); fig.rotation.y = 1.25 * Math.sin(t * .33);
      head.rotation.z = -.1 * Math.sin(t * .8 + .5); head.position.y = 4.35 + .04 * Math.sin(t * 2.5);
      const a = .22 + Math.min(.15, sp * .02);
      for (let i = 0; i < spos.count; i++) { const y = base[i * 3 + 1], z = base[i * 3 + 2], v = (y + SH / 2) / SH; spos.array[i * 3] = a * v * Math.sin(z * 1.6 - t * 1.8) + .08 * Math.sin(y * 1.3 + t); }
      spos.needsUpdate = true; sky.geometry.computeBoundingSphere();
    },
  });
}

// ============================================================ 10. SON OF MAN EXPRESS (Magritte)
function buildMagritte() {
  seedFrom('magritte');
  const { g, wheels, Rw } = carBase({ len: 9.6, frameW: 2.4, R: .78, axles: [3.4, -3.4], halfW: 1.55, glow: 0x8fd0ff, hub: 0x7aff6a });
  const nm = [], sprites = [];
  const skyT = skyCloudTex();
  const deck = hull(g, rtex(skyT, 1, 1), 3.2, 1.4, 11, -.3, 3.6, 1.8, mat(0x6a6a66, { roughness: .9 }), nm, .03, .4);
  rectNeon(g, 3.3, 11.1, deck, -.3, neon(0xffffff, .9));
  for (const s of [-1, 1]) noSh(M(G.box, neon(0x8fd0ff, 1), .07, .07, 11, s * 1.63, 1.08, -.3, g));
  // "Ceci n'est pas une voiture." plaques
  const signM = texMat(pipeSignTex(), { roughness: .8 }); nm.push([signM, .02, .55]);
  for (const s of [-1, 1]) noSh(M(G.plane, signM, 3.4, 1.06, 1, s * 1.615, 1.75, 2.2, g)).rotation.y = s * PI / 2;
  // sky apse behind the man
  const apseM = texMat(rtex(skyT, 1.5, 1), { side: THREE.DoubleSide, roughness: .8 }); nm.push([apseM, .05, .5]);
  M(new THREE.CylinderGeometry(2.0, 2.0, 6.8, 22, 1, true, PI / 2, PI), apseM, 1, 1, 1, 0, deck + 3.4, -3.6, g);
  noSh(M(new THREE.TorusGeometry(2.03, .05, 4, 28, PI), neon(0xffffff, .9), 1, 1, 1, 0, deck + 6.8, -3.6, g)).rotation.x = -PI / 2;
  M(G.box, mat(0x9a9890, { roughness: .9 }), 3.3, .7, .5, 0, deck + .35, -5.6, g);
  // the man in the bowler hat
  const man = grp(g, 0, deck, -2.4), suit = mat(0x2b2e33, { roughness: .75 }), skin = mat(0xe8c4a0, { roughness: .6 }), blk = mat(0x0c0c0e, { roughness: .45 }); man.scale.setScalar(1.22);
  for (const s of [-1, 1]) { M(G.cylLo, suit, .2, 1.8, .2, s * .25, .9, 0, man); M(G.box, blk, .26, .14, .45, s * .25, .07, .08, man); }
  const coat = new THREE.LatheGeometry([[.0, 1.5], [.72, 1.5], [.74, 2.2], [.72, 3.3], [.8, 3.9], [.6, 4.12], [.24, 4.22], [0, 4.24]].map(p => new THREE.Vector2(p[0], p[1])), 16); coat.scale(1.1, 1, .7);
  M(coat, suit, 1, 1, 1, 0, 0, 0, man);
  M(G.box, mat(0xc8102e, { roughness: .6 }), .16, .8, .06, 0, 3.6, .52, man); M(G.box, mat(0xf4f4f0), .5, .16, .1, 0, 4.12, .38, man);
  for (const s of [-1, 1]) { M(taperTube([[s * .82, 3.9, 0], [s * .9, 3.0, .05], [s * .84, 2.3, .1]], lin(.17, .14), 8, 6), suit, 1, 1, 1, 0, 0, 0, man); M(G.sphLo, skin, .1, .13, .1, s * .84, 2.15, .1, man); }
  M(G.cylLo, skin, .16, .3, .16, 0, 4.3, 0, man); M(G.sph, skin, .4, .48, .42, 0, 4.72, 0, man);
  M(G.sph, blk, .44, .36, .46, 0, 5.1, -.02, man); M(new THREE.CylinderGeometry(.72, .72, .05, 24), blk, 1, 1, 1, 0, 5.04, -.02, man);
  noSh(M(G.ring, neon(0xffffff, .9), .72, .72, .72, 0, 5.06, -.02, man)).rotation.x = PI / 2;
  noSh(M(G.ring, neon(0xffffff, .6), .46, .46, .46, 0, 5.18, -.02, man)).rotation.x = PI / 2;
  // floating green apple
  const appleM = glowMat(0x5ec22a, { roughness: .35 }); nm.push([appleM, .08, 1.8]);
  const apple = grp(man, 0, 4.66, .62);
  M(G.sph, appleM, .38, .36, .36, 0, 0, 0, apple); M(G.cylLo, mat(0x3a2410), .025, .18, .025, 0, .36, 0, apple);
  const lf = M(G.knob, mat(0x2f8a2a, { roughness: .6 }), .16, .03, .07, .1, .4, 0, apple); lf.rotation.z = .5;
  const asp = glowSprite(0x9aff5a, 2.8); apple.add(asp); sprites.push([asp, .8]);
  // drifting clouds
  const cloudM = glowMat(0xe4eaf2, { roughness: 1, emissive: 0xcfe0ff }); nm.push([cloudM, 0, .2]);
  const clouds = [];
  for (const [x, z, h] of [[-1.25, 1.0, 4.4], [1.3, -.4, 5.0], [0, 4.7, 3.2]]) {
    M(G.cylLo, mat(0x8a8a86), .03, h - .4, .03, x, deck + (h - .4) / 2, z, g);
    const c = grp(g, x, deck + h, z);
    for (let i = 0; i < 6; i++) { const s = R(.35, .6); M(G.sphLo, cloudM, s * 1.2, s * .9, s, R(-.7, .7), R(-.1, .25), R(-.3, .3), c); }
    clouds.push({ c, y: deck + h, ph: R(0, TAU) });
  }
  // the pipe on the nose, smouldering
  const pipe = grp(g, 0, 2.75, 5.0), brown = mat(0x7a3f18, { roughness: .45 }); pipe.scale.setScalar(1.4);
  M(new THREE.CylinderGeometry(.32, .24, .62, 12), brown, 1, 1, 1, -.6, .3, 0, pipe);
  M(taperTube([[-.4, .1, 0], [.2, .05, .05], [.8, .25, .02], [1.1, .35, 0]], lin(.09, .05), 10, 5), blk, 1, 1, 1, 0, 0, 0, pipe);
  noSh(M(new THREE.CylinderGeometry(.26, .26, .04, 12), neon(0xff6a1a, 1.4), 1, 1, 1, -.6, .6, 0, pipe));
  const ember = glowSprite(0xff7a2a, 1.6); ember.position.set(-.6, .75, 0); pipe.add(ember); sprites.push([ember, .7]);
  return finish('magritte', g, {
    deck, seat: [0, deck, 4.2], dancers: [[-.6, deck, 2.3], [.65, deck, 1.6], [-.55, deck, -.1], [.6, deck, .1]],
    poofers: [[-1.3, deck, -5.6], [1.3, deck, -5.6]], spotColor: 0xbfe0ff, nightMats: nm, sprites, wheels, Rw, len: 11.2, height: 8.6,
    update(dt, t) {
      apple.position.y = 4.66 + .06 * Math.sin(t * 1.7); apple.rotation.y = .3 * Math.sin(t * .6);
      for (const c of clouds) { c.c.position.y = c.y + .12 * Math.sin(t * .9 + c.ph); c.c.rotation.y = .15 * Math.sin(t * .3 + c.ph); }
      ember.material.opacity *= .75 + .25 * Math.sin(t * 7);
    },
  });
}

// ============================================================ 11. CUT-OUT DANCER (Matisse)
function buildMatisse() {
  seedFrom('matisse');
  const { g, wheels, Rw } = carBase({ len: 9.6, frameW: 2.4, R: .78, axles: [3.4, -3.4], halfW: 1.55, glow: 0x2f6bff, hub: 0xff7a1a });
  const nm = [], sprites = [];
  const deck = hull(g, rtex(snailTex(), 1, 1), 3.2, 1.3, 11, -.3, 5.5, 1.3, mat(0xf4efe2, { roughness: .8 }), nm, .02, .45);
  const nc = [neon(0xff7a1a, 1), neon(0x2f6bff, 1.1), neon(0xff3fa4, 1), neon(0x39d46a, 1)];
  for (let i = 0; i < 11; i++) for (const s of [-1, 1]) noSh(M(G.box, nc[(i + (s > 0 ? 1 : 0)) % 4], .07, .07, .96, s * 1.65, deck, -5.3 + i * 1.0, g));
  for (const z of [-5.85, 5.25]) noSh(M(G.box, nc[1], 3.3, .07, .07, 0, deck, z, g));
  for (const s of [-1, 1]) noSh(M(G.box, nc[0], .07, .07, 11, s * 1.63, 1.08, -.3, g));
  const cutM = cardMat(matisseAtlas()); nm.push([cutM, .04, .85]);
  const sway = [];
  const cut = (col, row, cw, ch, w, h, x, z, ry, amp, y0 = 0) => { const p = grp(g, x, deck + y0, z); p.rotation.y = ry; noSh(M(atlasGeo(4, col, row, cw, ch), cutM, w, h, 1, 0, h / 2, 0, p)); sway.push({ p, ry, amp, ph: R(0, TAU) }); return p; };
  // the big blue dancer
  const dancer = cut(0, 0, 2, 2, 4.6, 4.6, 0, -3.0, PI / 2, .5);
  const dsp = glowSprite(0x6a9aff, 6); dsp.position.set(0, 2.6, 0); dancer.add(dsp); sprites.push([dsp, .25]);
  // fronds, leaves, coral around the deck
  cut(2, 0, 1, 1, 2.6, 2.6, -1.45, 3.0, PI / 2, .25); cut(3, 0, 1, 1, 2.3, 2.3, 1.45, 2.5, -PI / 2, .25);
  cut(0, 2, 1, 1, 2.8, 2.8, -1.45, -.4, PI / 2, .2); cut(0, 3, 1, 1, 2.4, 2.4, 1.45, -.9, -PI / 2, .22);
  cut(2, 1, 1, 1, 2.0, 2.0, 1.4, .9, -PI / 2 - .4, .18); cut(1, 2, 1, 1, 1.9, 1.9, -1.4, 1.4, PI / 2 + .4, .18);
  cut(1, 3, 1, 1, 2.6, 2.6, -1.3, -5.3, .3, .2); cut(2, 0, 1, 1, 3.0, 3.0, 1.3, -5.2, -.3, .2);
  // Icarus hood ornament
  cut(3, 2, 1, 1, 1.5, 1.5, 0, 5.1, 0, .06, .2);
  // floating stars
  const stars = [];
  for (const [col, row, x, y, z, s] of [[3, 1, -.8, 5.6, 1.2, 1.2], [2, 2, .9, 6.0, -.8, 1.0], [3, 1, .2, 5.0, 3.0, .8], [2, 2, -.4, 6.6, -5.2, .9]]) {
    M(G.cylLo, mat(0x111111), .025, y - .5, .025, x, deck + (y - .5) / 2, z, g);
    const p = grp(g, x, deck + y, z); noSh(M(atlasGeo(4, col, row), cutM, s, s, 1, 0, 0, 0, p)); stars.push({ p, ph: R(0, TAU) });
  }
  return finish('matisse', g, {
    deck, seat: [0, deck, 4.0], dancers: [[-.5, deck, 2.2], [.55, deck, .9], [-.55, deck, -.3], [.5, deck, 2.8]],
    poofers: [[-.6, deck, -5.6], [.6, deck, -5.6]], spotColor: 0x9ab8ff, nightMats: nm, sprites, wheels, Rw, len: 11.1, height: 7.4,
    update(dt, t, ctx, night, sp) {
      const k = 1 + Math.min(.8, sp / 6);
      for (const s of sway) { s.p.rotation.z = .1 * k * Math.sin(t * 1.1 + s.ph) * (s.amp > .3 ? .6 : 1); s.p.rotation.y = s.ry + s.amp * Math.sin(t * .45 + s.ph); }
      dancer.rotation.x = .05 * Math.sin(t * 2.2);
      for (const s of stars) { s.p.rotation.y = t * .7 + s.ph; s.p.rotation.z = t * .3; }
    },
  });
}

// ============================================================ 12. POINTILLIST PARASOL (Seurat)
function buildSeurat() {
  seedFrom('seurat');
  const { g, wheels, Rw } = carBase({ len: 10, frameW: 2.4, R: .8, axles: [3.6, -3.6], halfW: 1.6, glow: 0x9fd8ff, hub: 0xffd27a });
  const nm = [], sprites = [], spark = sparkleTex(), sparks = [];
  const dotM = (tex, rx, ry, o) => { const sp = rtex(spark, rx, ry); const m = new THREE.MeshStandardMaterial(Object.assign({ map: rtex(tex, rx, ry), emissiveMap: sp, emissive: 0xffffff, emissiveIntensity: 0, roughness: .8 }, o || {})); nm.push([m, 0, 1.0]); sparks.push(sp); return m; };
  const rivM = new THREE.MeshStandardMaterial({ map: rtex(riverTex(), 1, 1), emissiveMap: rtex(spark, 1, 1), emissive: 0xffffff, emissiveIntensity: 0, roughness: .6 }); nm.push([rivM, 0, 1.0]); sparks.push(rivM.emissiveMap);
  M(boxGeoUV(3.4, 1.25, 11.6, 1.6, 1.6), rivM, 1, 1, 1, 0, 1.68, -.4, g);
  const grassM = dotM(grassTex(), 3, 10);
  M(G.box, grassM, 3.5, .12, 11.7, 0, 2.36, -.4, g);
  const deck = 2.42;
  // pointillist bulbs along the deck edges
  const bulb = [neon(0xfff2c8, 1.3), neon(0xff9ad0, 1.3), neon(0x9fd8ff, 1.3)];
  for (const s of [-1, 1]) for (let i = 0; i < 24; i++) noSh(M(G.oct, bulb[i % 3], .07, .07, .07, s * 1.76, deck - .02, -6.1 + i * .5, g));
  for (let i = 0; i < 7; i++) for (const z of [-6.25, 5.45]) noSh(M(G.oct, bulb[i % 3], .07, .07, .07, -1.5 + i * .5, deck - .02, z, g));
  for (const s of [-1, 1]) noSh(M(G.box, neon(0x6fa8ff, .9), .07, .07, 11.4, s * 1.73, 1.07, -.4, g));
  const skin = mat(0xe8c8a8, { roughness: .7 }), dress = dotM(dressTex(), 2, 2), coat = dotM(coatTex(), 2, 2), black = mat(0x111114, { roughness: .5 });
  const pA = dotM(parA(), 3, 1, { side: THREE.DoubleSide }), pB = dotM(parB(), 3, 1, { side: THREE.DoubleSide });
  const lady = (x, z, ry, pm, s) => {
    const L = grp(g, x, deck, z); L.rotation.y = ry; L.scale.setScalar(s);
    const sk = new THREE.LatheGeometry([[0, 0], [.46, 0], [.44, .25], [.38, .6], [.3, .85], [.18, .98], [.12, 1.02]].map(p => new THREE.Vector2(p[0], p[1])), 16), sp2 = sk.attributes.position;
    for (let i = 0; i < sp2.count; i++) { const z2 = sp2.getZ(i), y = sp2.getY(i); if (z2 < 0) sp2.setZ(i, z2 * (1 + 1.1 * Math.exp(-Math.pow((y - .78) / .2, 2)))); }
    sk.computeVertexNormals(); M(sk, dress, 1, 1, 1, 0, 0, 0, L);
    M(G.cylLo, dress, .12, .36, .1, 0, 1.18, 0, L); M(G.sphLo, dress, .15, .15, .14, 0, 1.33, .04, L);
    M(G.sphLo, skin, .1, .12, .1, 0, 1.6, .01, L); M(G.sphLo, black, .09, .07, .09, 0, 1.66, -.06, L);
    M(new THREE.CylinderGeometry(.13, .15, .07, 10), black, 1, 1, 1, 0, 1.72, 0, L); M(G.knob, mat(0xc8402e), .05, .09, .05, .06, 1.79, -.04, L);
    M(taperTube([[.13, 1.38, 0], [.22, 1.2, .1], [.12, 1.12, .2]], lin(.05, .04), 6, 4), dress, 1, 1, 1, 0, 0, 0, L);
    const par = grp(L, .14, 1.12, .2); par.rotation.z = -.15;
    M(G.cylLo, black, .015, 1.2, .015, 0, .6, 0, par); M(new THREE.ConeGeometry(.75, .3, 12, 1, true), pm, 1, 1, 1, 0, 1.25, 0, par);
    return L;
  };
  // the couple (lady with bustle + top-hatted gentleman) and the little monkey
  lady(-.6, -3.7, 0, pA, 1.55);
  const gent = grp(g, .65, deck, -3.5); gent.scale.setScalar(1.55);
  for (const s of [-1, 1]) M(G.cylLo, black, .08, .85, .08, s * .1, .43, 0, gent);
  M(new THREE.LatheGeometry([[.0, .75], [.26, .72], [.24, 1.1], [.22, 1.4], [.1, 1.48], [0, 1.5]].map(p => new THREE.Vector2(p[0], p[1])), 12), coat, 1, 1, 1, 0, 0, 0, gent);
  M(G.sphLo, skin, .1, .12, .1, 0, 1.62, 0, gent); M(G.cylLo, black, .1, .32, .1, 0, 1.86, 0, gent); M(new THREE.CylinderGeometry(.18, .18, .02, 12), black, 1, 1, 1, 0, 1.71, 0, gent);
  M(taperTube([[.22, 1.38, 0], [.3, 1.0, .12], [.28, .9, .22]], lin(.06, .05), 6, 4), coat, 1, 1, 1, 0, 0, 0, gent);
  M(G.cylLo, mat(0x5a3a1a), .015, 1.0, .015, .32, .45, .28, gent).rotation.x = .12;
  const mky = grp(g, -1.3, deck, -2.4); mky.scale.setScalar(1.5); M(G.sphLo, black, .12, .18, .12, 0, .3, 0, mky); M(G.sphLo, black, .1, .1, .1, 0, .54, .04, mky); M(tube([[0, .2, -.1], [0, .1, -.35], [0, .35, -.45]], .025, 6, 3), black, 1, 1, 1, 0, 0, 0, mky);
  lady(1.05, 2.6, -.2, pB, 1.45);
  // big festival parasols over the deck
  const pars = [];
  for (const [x, z, pm, lean] of [[-1.4, 1.0, pA, .2], [1.4, -1.3, pB, -.2]]) {
    const p = grp(g, x, deck, z); p.rotation.z = lean;
    M(G.cylLo, mat(0x3a2a1a), .05, 3.9, .05, 0, 1.95, 0, p);
    const can = grp(p, 0, 3.75, 0); M(new THREE.ConeGeometry(2.0, .7, 16, 1, true), pm, 1, 1, 1, 0, 0, 0, can);
    for (let i = 0; i < 16; i++) { const a = i / 16 * TAU; noSh(M(G.oct, bulb[i % 3], .08, .08, .08, Math.sin(a) * 2.0, -.36, Math.cos(a) * 2.0, can)); }
    noSh(M(G.sphLo, neon(0xfff2c8, 1.2), .1, .1, .1, 0, .4, 0, can));
    pars.push({ can, sp: x > 0 ? .25 : -.2 });
  }
  // dotted tree at the stern
  const tree = grp(g, -.6, deck, -5.5), trM = dotM(treeTex(), 2, 2);
  M(taperTube([[0, 0, 0], [.1, 1.4, 0], [.0, 2.8, .05]], lin(.22, .14), 6, 6), mat(0x3a2a1e, { roughness: .9 }), 1, 1, 1, 0, 0, 0, tree);
  M(G.sph, trM, 1.5, 1.7, 1.3, 0, 3.8, 0, tree); M(G.sph, trM, 1.0, 1.1, .9, .9, 3.0, .2, tree);
  return finish('seurat', g, {
    deck, seat: [0, deck, 4.4], dancers: [[-.5, deck, 1.8], [.55, deck, .5], [-.45, deck, -.8], [.3, deck, -1.9]],
    poofers: [[1.3, deck, -5.9], [-1.4, deck, -6.0]], spotColor: 0xffe0b0, nightMats: nm, sprites, wheels, Rw, len: 12.2, height: 8.0,
    update(dt, t) {
      for (let i = 0; i < sparks.length; i++) { sparks[i].offset.set((t * .013 * (i % 2 ? 1 : -1)) % 1, (t * .009) % 1); }
      for (const p of pars) p.can.rotation.y = t * p.sp;
      mky.rotation.y = .4 * Math.sin(t * .9); tree.rotation.z = .02 * Math.sin(t * .7);
    },
  });
}

// ============================================================ registry
export const ART_CAR_TYPES_2 = [
  { type: 'wave', name: 'The Great Wave', artist: 'Katsushika Hokusai', build: buildWave },
  { type: 'kahlo', name: 'Frida’s Garden', artist: 'Frida Kahlo', build: buildKahlo },
  { type: 'klimt', name: 'The Golden Kiss', artist: 'Gustav Klimt', build: buildKlimt },
  { type: 'mondrian', name: 'Boogie Woogie', artist: 'Piet Mondrian', build: buildMondrian },
  { type: 'kandinsky', name: 'Composition VIII', artist: 'Wassily Kandinsky', build: buildKandinsky },
  { type: 'warhol', name: 'Soup Can Cruiser', artist: 'Andy Warhol', build: buildWarhol },
  { type: 'haring', name: 'Radiant Baby', artist: 'Keith Haring', build: buildHaring },
  { type: 'kusama', name: 'Infinity Pumpkin', artist: 'Yayoi Kusama', build: buildKusama },
  { type: 'scream', name: 'The Scream', artist: 'Edvard Munch', build: buildScream },
  { type: 'magritte', name: 'Son of Man Express', artist: 'René Magritte', build: buildMagritte },
  { type: 'matisse', name: 'Cut-Out Dancer', artist: 'Henri Matisse', build: buildMatisse },
  { type: 'seurat', name: 'Pointillist Parasol', artist: 'Georges Seurat', build: buildSeurat },
];
