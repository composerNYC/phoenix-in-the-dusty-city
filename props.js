// props.js — procedural festival props for "Phoenix in the Dusty City"
// Every builder returns { g, update(dt, t, ctx), ...extras }. g origin = ground centre (unless noted), facing +Z, metres.
// ctx = { night: 0..1 }. Emissive parts > 1 glow through the game's bloom at night.
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.170.0/+esm';
import { mergeGeometries } from 'https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/utils/BufferGeometryUtils.js/+esm';

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
export function initProps(api) { const d = defaultApi(); API = Object.assign(d, api || {}); if (!API.glowMap) API.glowMap = d.glowMap; }
const mat = (c, o) => A().mat(c, o);
const neon = (c, k) => A().neon(c, k);
// private (non-cached) emissive material, for things that pulse/blink on their own
function ownNeon(c, k = 1) { const col = new THREE.Color(c); return new THREE.MeshStandardMaterial({ color: col.clone().multiplyScalar(.25), emissive: col, emissiveIntensity: k, roughness: .35 }); }

// ============================================================ small utils
let _seed = 1;
function rnd() { _seed |= 0; _seed = _seed + 0x6D2B79F5 | 0; let t = Math.imul(_seed ^ _seed >>> 15, 1 | _seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }
function seedFrom(str) { let h = 2166136261; for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619); _seed = h; }
const R = (a, b) => a + rnd() * (b - a);
const pick = (a) => a[(rnd() * a.length) | 0];
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const NOCTX = { night: 0 };
const _v1 = new THREE.Vector3(), _m1 = new THREE.Matrix4();
const _UP = new THREE.Vector3(0, 1, 0);
const FEST = [0xff3d7f, 0xffb703, 0x3ddc97, 0x2ec4ff, 0xb15cff, 0xff6b2b, 0xfff05a];

function grp(parent, x = 0, y = 0, z = 0) { const g = new THREE.Group(); g.position.set(x, y, z); if (parent) parent.add(g); return g; }
function M(geo, m, sx = 1, sy = sx, sz = sx, x = 0, y = 0, z = 0, parent) {
  const o = new THREE.Mesh(geo, m); o.scale.set(sx, sy, sz); o.position.set(x, y, z);
  o.castShadow = true; o.receiveShadow = true; if (parent) parent.add(o); return o;
}
const noSh = (o) => { o.castShadow = false; return o; };
const keep = (o) => { o.userData.keep = true; return o; };
// orient a unit (radius 1, height 1, +Y) mesh between a and b
function placeSeg(o, a, b, r, ry = r) {
  _v1.subVectors(b, a); const len = _v1.length() || 1e-4;
  o.position.addVectors(a, b).multiplyScalar(.5); _v1.multiplyScalar(1 / len);
  o.quaternion.setFromUnitVectors(_UP, _v1); o.scale.set(r, len, ry); return o;
}
function seg(geo, m, a, b, r, parent) { const o = M(geo, m, 1, 1, 1, 0, 0, 0, parent); placeSeg(o, a, b, r); return o; }
function cnv(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; }
function ctex(c, rep) { const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; if (rep) t.wrapS = t.wrapT = THREE.RepeatWrapping; return t; }
function mtx(x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) {
  return new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(sx, sy, sz));
}
const hex = (c) => '#' + new THREE.Color(c).getHexString();

// ---- geometry merging (BufferGeometryUtils.mergeGeometries after normalising attributes)
function normGeo(geo, m) {
  const g2 = geo.index ? geo.toNonIndexed() : geo.clone();
  if (m) g2.applyMatrix4(m);
  for (const k of Object.keys(g2.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(k)) g2.deleteAttribute(k);
  if (!g2.attributes.normal) g2.computeVertexNormals();
  if (!g2.attributes.uv) g2.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g2.attributes.position.count * 2), 2));
  g2.morphAttributes = {}; g2.clearGroups();
  return g2;
}
function mergeList(parts) {
  const list = parts.map(([geo, m]) => normGeo(geo, m));
  const hasCol = list.every(gg => gg.attributes.color);
  if (!hasCol) for (const gg of list) if (gg.attributes.color) gg.deleteAttribute('color');
  const out = mergeGeometries(list, false); for (const gg of list) gg.dispose();
  out.computeBoundingSphere(); return out;
}
// batch sibling meshes sharing a material (per parent). Skips userData.keep, meshes with children, instanced meshes.
function mergeStatic(root) {
  const nodes = []; root.traverse(o => { if (!o.isMesh && !o.isSprite && !o.isLight && !o.isLine && !o.isPoints) nodes.push(o); });
  for (const node of nodes) {
    const by = new Map();
    for (const c of node.children) if (c.isMesh && !c.isInstancedMesh && !c.userData.keep && !c.children.length && !Array.isArray(c.material)) { if (!by.has(c.material)) by.set(c.material, []); by.get(c.material).push(c); }
    for (const [m, list] of by) {
      if (list.length < 2) continue;
      const mesh = new THREE.Mesh(mergeList(list.map(c => { c.updateMatrix(); return [c.geometry, c.matrix]; })), m);
      mesh.castShadow = list.some(c => c.castShadow); mesh.receiveShadow = true; mesh.renderOrder = list[0].renderOrder;
      for (const c of list) node.remove(c); node.add(mesh);
    }
  }
  return root;
}

// ============================================================ shared geometry
const G = {
  box: new THREE.BoxGeometry(1, 1, 1),
  sph: new THREE.SphereGeometry(1, 16, 10),
  sphLo: new THREE.SphereGeometry(1, 8, 6),
  cyl: new THREE.CylinderGeometry(1, 1, 1, 12),
  cylLo: new THREE.CylinderGeometry(1, 1, 1, 6),
  cylZ: new THREE.CylinderGeometry(1, 1, 1, 16).rotateX(PI / 2),
  cone: new THREE.ConeGeometry(1, 1, 12),
  coneZ: new THREE.ConeGeometry(1, 1, 12).rotateX(PI / 2),
  torus: new THREE.TorusGeometry(1, .08, 6, 28),
  torusFat: new THREE.TorusGeometry(1, .3, 8, 20),
  plane: new THREE.PlaneGeometry(1, 1),
  bulb: new THREE.SphereGeometry(1, 7, 5),
  ico: new THREE.IcosahedronGeometry(1, 0),
  oct: new THREE.OctahedronGeometry(1, 0),
};

// ============================================================ lights / glow helpers
function glowSprite(color, scale) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: A().glowMap, color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 })); s.scale.setScalar(scale); return s; }
function sagPts(a, b, n, s) { const pts = []; for (let i = 0; i <= n; i++) { const u = i / n, p = a.clone().lerp(b, u); p.y -= s * 4 * u * (1 - u); pts.push(p); } return pts; }
function chain(points, n, s) { const out = []; for (let i = 0; i < points.length - 1; i++) { const p = sagPts(points[i], points[i + 1], n, s); if (i) p.shift(); out.push(...p); } return out; }
// festoon string: one InstancedMesh of bulbs (+ one merged wire). Returns a twinkle controller.
function lightString(parent, pts, colors, size = .07, k = 2.6, wire = true, tw = .5) {
  const m = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const im = new THREE.InstancedMesh(G.bulb, m, pts.length); const base = [], c = new THREE.Color();
  pts.forEach((p, i) => { _m1.makeScale(size, size * 1.3, size).setPosition(p.x, p.y - size * .9, p.z); im.setMatrixAt(i, _m1); const col = new THREE.Color(colors[i % colors.length]); base.push(col); im.setColorAt(i, c.copy(col)); });
  im.castShadow = false; keep(im); im.computeBoundingSphere(); parent.add(im);
  if (wire && pts.length > 1) noSh(M(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), pts.length * 2, .012, 3), mat(0x1d1a1a), 1, 1, 1, 0, 0, 0, parent));
  const ph = rnd() * 10;
  return {
    im, update(t, night) {
      const kk = 1.15 + (k - 1.15) * night;
      for (let i = 0; i < base.length; i++) { const f = 1 - tw * (.5 + .5 * Math.sin(t * 3.1 + i * 1.7 + ph)) * (.5 + .5 * Math.sin(t * 1.3 + i * .37)); im.setColorAt(i, c.copy(base[i]).multiplyScalar(kk * f)); }
      im.instanceColor.needsUpdate = true;
    },
  };
}
// additive light cone; apex at origin. dir 'down' -> points -Y, 'z' -> points +Z. Length 1, base radius r.
let _beamTex = null;
function beamTex() {
  if (_beamTex) return _beamTex;
  const [c, x] = cnv(8, 256); const gr = x.createLinearGradient(0, 0, 0, 256);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(.25, 'rgba(255,255,255,.55)'); gr.addColorStop(.7, 'rgba(255,255,255,.18)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = gr; x.fillRect(0, 0, 8, 256); return (_beamTex = new THREE.CanvasTexture(c));
}
function makeBeam(r, color, op = .3, dir = 'down') {
  const mk = (rr) => { const geo = new THREE.ConeGeometry(rr, 1, 32, 1, true); geo.translate(0, -.5, 0); if (dir === 'z') geo.rotateX(-PI / 2); return geo; };
  const bm = (o) => new THREE.MeshBasicMaterial({ color, map: beamTex(), transparent: true, opacity: o, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const mesh = keep(noSh(new THREE.Mesh(mk(r), bm(op)))); mesh.renderOrder = 5; mesh.receiveShadow = false;
  const core = keep(noSh(new THREE.Mesh(mk(r * .42), bm(op * 1.3)))); core.renderOrder = 6; core.receiveShadow = false; mesh.add(core);
  mesh.userData.op = op; return mesh;
}
function setBeam(beam, k) { beam.material.opacity = beam.userData.op * k; beam.children[0].material.opacity = beam.userData.op * 1.3 * k; }
// rigging lines from fixed points (glider-local) to points on (possibly animated) descendants
function makeRig(g, pairs, color = 0xf6efe0, opacity = .9) {
  const pos = new Float32Array(pairs.length * 6), geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const ls = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color, transparent: opacity < 1, opacity })); ls.frustumCulled = false; g.add(ls);
  const inv = new THREE.Matrix4(), p = new THREE.Vector3();
  ls.userData.refresh = () => {
    g.updateMatrixWorld(true); inv.copy(g.matrixWorld).invert();
    pairs.forEach(([a, o, l], i) => { pos[i * 6] = a.x; pos[i * 6 + 1] = a.y; pos[i * 6 + 2] = a.z; p.copy(l); o.localToWorld(p).applyMatrix4(inv); pos[i * 6 + 3] = p.x; pos[i * 6 + 4] = p.y; pos[i * 6 + 5] = p.z; });
    geo.attributes.position.needsUpdate = true; geo.computeBoundingSphere();
  };
  ls.userData.refresh(); return ls;
}
// common finish: merge, night-material lerps, sprite fades, light strings
function finish(g, o) {
  mergeStatic(g);
  const nm = o.nm || [], sprites = o.sprites || [], strings = o.strings || [], own = o.update; let T = 0;
  const update = (dt = 0, t, ctx) => {
    if (t === undefined) { T += dt; t = T; }
    ctx = ctx || NOCTX; const night = ctx.night || 0;
    for (const [m, lo, hi] of nm) m.emissiveIntensity = lo + (hi - lo) * night;
    for (const [s, op] of sprites) s.material.opacity = op * night;
    for (const s of strings) s.update(t, night);
    if (own) own(dt, t, ctx, night);
  };
  update(0, 0, NOCTX);
  return Object.assign({ g, update }, o.extras || {});
}

// ============================================================ canvas painting helpers
function woodBg(x, w, h, base = '#c98d4e') {
  x.fillStyle = base; x.fillRect(0, 0, w, h);
  const pl = Math.max(1, Math.round(h / 60));
  for (let p = 0; p < pl; p++) { x.fillStyle = `rgba(60,30,10,${.12 + rnd() * .1})`; x.fillRect(0, p * h / pl, w, h / pl * (.15 + rnd() * .2)); x.fillStyle = 'rgba(40,20,5,.6)'; x.fillRect(0, p * h / pl, w, 2); }
  x.strokeStyle = 'rgba(80,40,12,.25)'; x.lineWidth = 1.5;
  for (let i = 0; i < 40; i++) { x.beginPath(); const y = rnd() * h; x.moveTo(0, y); for (let xx = 0; xx <= w; xx += 40) x.lineTo(xx, y + Math.sin(xx * .02 + i) * 4); x.stroke(); }
}
// hand-painted wobbly lettering, each glyph a different colour
function paintText(x, text, cx, cy, size, cols, opts = {}) {
  x.save(); x.font = `${opts.weight || 900} ${size}px ${opts.font || '"Trebuchet MS", "Arial Rounded MT Bold", sans-serif'}`; x.textBaseline = 'middle'; x.textAlign = 'center';
  const ws = [...text].map(ch => x.measureText(ch).width * (opts.track || 1.02)); const tot = ws.reduce((a, b) => a + b, 0); let px = cx - tot / 2;
  [...text].forEach((ch, i) => {
    const w = ws[i]; x.save(); x.translate(px + w / 2, cy + (opts.wob ?? 1) * Math.sin(i * 1.7) * size * .05); x.rotate((opts.wob ?? 1) * (rnd() - .5) * .16);
    x.lineJoin = 'round'; x.lineWidth = size * .16; x.strokeStyle = opts.stroke || '#1b1020'; x.strokeText(ch, 0, 0);
    x.fillStyle = cols[i % cols.length]; x.fillText(ch, 0, 0); x.restore(); px += w;
  });
  x.restore();
}
function signTex(lines, w, h, opts = {}) {
  const [c, x] = cnv(w, h); woodBg(x, w, h, opts.bg || '#c98d4e');
  x.strokeStyle = opts.border || '#ffcf3f'; x.lineWidth = h * .05; x.strokeRect(h * .05, h * .05, w - h * .1, h - h * .1);
  const n = lines.length;
  lines.forEach((ln, i) => {
    let size = opts.size || h / (n + .6) * .78; x.font = `900 ${size}px "Trebuchet MS", sans-serif`;
    const mw = x.measureText(ln).width * 1.05; if (mw > w * .88) size *= w * .88 / mw;
    paintText(x, ln, w / 2, h * (i + .5 + .3 / n) / (n + .3), size, opts.cols || ['#ff3d7f', '#ffd23f', '#3ddcff', '#7dff6b', '#ff8a3d', '#c77dff']);
  });
  if (opts.deco) { for (let i = 0; i < 10; i++) { x.fillStyle = pick(['#ff3d7f', '#ffd23f', '#3ddcff', '#7dff6b']); x.beginPath(); x.arc(rnd() * w, rnd() < .5 ? h * .1 : h * .9, h * .025, 0, TAU); x.fill(); } }
  return ctex(c);
}
function star(x, cx, cy, r, n = 5, k = .45) { x.beginPath(); for (let i = 0; i < n * 2; i++) { const a = i / (n * 2) * TAU - PI / 2, rr = i % 2 ? r * k : r; x.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); } x.closePath(); }
function heart(x, cx, cy, s) { x.beginPath(); x.moveTo(cx, cy + s * .35); x.bezierCurveTo(cx - s * 1.1, cy - s * .4, cx - s * .5, cy - s * 1.1, cx, cy - s * .45); x.bezierCurveTo(cx + s * .5, cy - s * 1.1, cx + s * 1.1, cy - s * .4, cx, cy + s * .35); x.closePath(); }
function flameShape(x, cx, cy, w, h) { x.beginPath(); x.moveTo(cx - w / 2, cy); x.bezierCurveTo(cx - w * .6, cy - h * .5, cx - w * .05, cy - h * .6, cx, cy - h); x.bezierCurveTo(cx + w * .1, cy - h * .55, cx + w * .65, cy - h * .45, cx + w / 2, cy); x.closePath(); }
// ranger emblem (stylised sun-compass in a shield) drawn at cx,cy
function rangerBadge(x, cx, cy, r) {
  x.save(); x.translate(cx, cy);
  x.fillStyle = '#2f3a1c'; x.beginPath(); x.moveTo(0, -r); x.lineTo(r * .9, -r * .6); x.lineTo(r * .8, r * .35); x.quadraticCurveTo(r * .4, r * .85, 0, r); x.quadraticCurveTo(-r * .4, r * .85, -r * .8, r * .35); x.lineTo(-r * .9, -r * .6); x.closePath(); x.fill();
  x.lineWidth = r * .1; x.strokeStyle = '#f2c14e'; x.stroke();
  x.fillStyle = '#f2c14e'; star(x, 0, -r * .05, r * .5, 8, .45); x.fill();
  x.fillStyle = '#2f3a1c'; x.beginPath(); x.arc(0, -r * .05, r * .17, 0, TAU); x.fill();
  x.restore();
}

// ============================================================ 1. ART PLANE
function planeFuseTex() {
  const W = 1024, H = 1024, [c, x] = cnv(W, H); // x = around (0 belly, .25 right, .5 top, .75 left), y: top = nose
  const gr = x.createLinearGradient(0, 0, W, 0);
  gr.addColorStop(0, '#ffb12e'); gr.addColorStop(.12, '#ff5a1f'); gr.addColorStop(.25, '#c2185b'); gr.addColorStop(.38, '#5a1aa0'); gr.addColorStop(.5, '#2a0e5c');
  gr.addColorStop(.62, '#5a1aa0'); gr.addColorStop(.75, '#c2185b'); gr.addColorStop(.88, '#ff5a1f'); gr.addColorStop(1, '#ffb12e');
  x.fillStyle = gr; x.fillRect(0, 0, W, H);
  // feather scales over the top / rear
  for (let row = 0; row < 26; row++) for (let i = 0; i < 18; i++) {
    const cx = (i + (row % 2) * .5) / 18 * W, cy = H * .3 + row * 26;
    const top = Math.abs(cx / W - .5) < .17; if (!top) continue;
    x.fillStyle = row % 3 === 0 ? 'rgba(255,200,60,.55)' : 'rgba(255,90,140,.35)';
    x.beginPath(); x.arc(cx, cy, 22, 0, PI); x.fill(); x.strokeStyle = 'rgba(255,230,140,.6)'; x.lineWidth = 2; x.stroke();
  }
  // flames licking back from the nose along both sides and belly
  const fl = [['#ffe066', .5], ['#ff9a1f', .72], ['#ff3d1f', .95]];
  for (const [col, k] of [...fl].reverse()) {
    x.fillStyle = col;
    for (let i = 0; i < 26; i++) {
      const u = i / 26, cx = u * W + W / 52; const side = Math.min(Math.abs(u - .25), Math.abs(u - .75), Math.abs(u), Math.abs(u - 1));
      const len = H * (.25 + .45 * Math.max(0, 1 - side * 4)) * k * (.8 + .4 * Math.sin(i * 2.3) ** 2);
      x.save(); x.translate(cx, 0); x.scale(1, -1); flameShape(x, 0, 0, W / 26 * 1.5, len); x.restore(); x.fill();
    }
  }
  x.fillStyle = '#ffd23f'; x.fillRect(0, 0, W, 30);
  // pin stripes
  x.fillStyle = '#ffe9a8'; for (const u of [.36, .64]) x.fillRect(u * W - 3, 0, 6, H);
  // name along both sides
  for (const [u, rot] of [[.25, PI / 2], [.75, -PI / 2]]) {
    x.save(); x.translate(u * W, H * .62); x.rotate(rot);
    x.font = '900 80px "Trebuchet MS", sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.lineWidth = 14; x.strokeStyle = '#2a0e5c'; x.strokeText('PHOENIX AIR', 0, 0); x.fillStyle = '#fff3c4'; x.fillText('PHOENIX AIR', 0, 0);
    x.font = '700 34px "Trebuchet MS", sans-serif'; x.lineWidth = 8; x.strokeText('★ NO REFUNDS · ONLY UPDRAFTS ★', 0, 70); x.fillStyle = '#7dfcff'; x.fillText('★ NO REFUNDS · ONLY UPDRAFTS ★', 0, 70);
    x.restore();
  }
  // round porthole windows (bright) on each side
  for (const u of [.31, .69]) for (let i = 0; i < 6; i++) { const cy = H * .42 + i * 62; x.fillStyle = '#1a0830'; x.beginPath(); x.arc(u * W, cy, 20, 0, TAU); x.fill(); x.fillStyle = '#7dfcff'; x.beginPath(); x.arc(u * W, cy, 14, 0, TAU); x.fill(); }
  return ctex(c);
}
function planeWingTex() {
  const W = 1024, H = 256, [c, x] = cnv(W, H); // u = span (-15..15), v = chord (-2.2..2.2), top = leading edge
  const gr = x.createLinearGradient(0, 0, W, 0);
  gr.addColorStop(0, '#ffd23f'); gr.addColorStop(.18, '#ff5a1f'); gr.addColorStop(.38, '#c2185b'); gr.addColorStop(.5, '#4a148c'); gr.addColorStop(.62, '#c2185b'); gr.addColorStop(.82, '#ff5a1f'); gr.addColorStop(1, '#ffd23f');
  x.fillStyle = gr; x.fillRect(0, 0, W, H);
  // feather rows pointing toward the trailing edge
  for (let row = 0; row < 4; row++) for (let i = 0; i < 46; i++) {
    const cx = (i + (row % 2) * .5) / 46 * W, cy = H * (.25 + row * .17), r = 14 + row * 3;
    x.fillStyle = ['rgba(255,240,170,.45)', 'rgba(255,120,60,.45)', 'rgba(255,60,120,.4)', 'rgba(140,60,255,.35)'][row];
    x.beginPath(); x.moveTo(cx - r, cy); x.quadraticCurveTo(cx - r, cy + r * 2.4, cx, cy + r * 2.8); x.quadraticCurveTo(cx + r, cy + r * 2.4, cx + r, cy); x.closePath(); x.fill();
    x.strokeStyle = 'rgba(40,10,40,.35)'; x.lineWidth = 2; x.stroke();
  }
  x.fillStyle = '#ffe36e'; x.fillRect(0, H * .19, W, 10);
  x.fillStyle = '#2a0e5c'; x.fillRect(0, H * .94, W, H * .06);
  return ctex(c);
}
function finTex() {
  const [c, x] = cnv(512, 512);
  const gr = x.createLinearGradient(0, 512, 0, 0); gr.addColorStop(0, '#5a1aa0'); gr.addColorStop(.5, '#e0245e'); gr.addColorStop(1, '#ffb12e');
  x.fillStyle = gr; x.fillRect(0, 0, 512, 512);
  // phoenix silhouette: rising bird
  x.save(); x.translate(250, 300); x.fillStyle = '#ffe36e'; x.strokeStyle = '#2a0e5c'; x.lineWidth = 8;
  x.beginPath(); x.moveTo(0, -120); x.quadraticCurveTo(30, -90, 20, -60); x.quadraticCurveTo(120, -140, 200, -170); x.quadraticCurveTo(150, -60, 40, -10);
  x.quadraticCurveTo(60, 60, 0, 140); x.quadraticCurveTo(-60, 60, -40, -10); x.quadraticCurveTo(-150, -60, -200, -170); x.quadraticCurveTo(-120, -140, -20, -60); x.quadraticCurveTo(-30, -90, 0, -120); x.closePath(); x.fill(); x.stroke();
  x.restore();
  return ctex(c);
}
function discoTex() {
  const [c, x] = cnv(256, 128);
  for (let i = 0; i < 32; i++) for (let j = 0; j < 16; j++) { const v = 120 + rnd() * 135 | 0, tint = rnd(); x.fillStyle = tint < .12 ? '#ff9ad5' : tint < .22 ? '#9ae7ff' : `rgb(${v},${v},${v + 10})`; x.fillRect(i * 8 + .5, j * 8 + .5, 7, 7); }
  return ctex(c);
}
function hazardTex() {
  const [c, x] = cnv(256, 256); x.fillStyle = '#2b2234'; x.fillRect(0, 0, 256, 256);
  for (let i = -8; i < 16; i++) { x.fillStyle = i % 2 ? '#ffd23f' : '#ff3d7f'; x.beginPath(); x.moveTo(i * 32, 0); x.lineTo(i * 32 + 16, 0); x.lineTo(i * 32 + 16 + 40, 40); x.lineTo(i * 32 + 40, 40); x.fill(); }
  x.fillStyle = '#4a3d58'; for (let i = 0; i < 9; i++) x.fillRect(16, 56 + i * 22, 224, 6);
  return ctex(c);
}
function bulkheadTex() {
  const [c, x] = cnv(256, 256); const gr = x.createRadialGradient(128, 128, 10, 128, 128, 128);
  gr.addColorStop(0, '#fff3a0'); gr.addColorStop(.3, '#ff7a1f'); gr.addColorStop(.7, '#e0245e'); gr.addColorStop(1, '#3a0a5c'); x.fillStyle = gr; x.fillRect(0, 0, 256, 256);
  x.strokeStyle = 'rgba(255,255,255,.5)'; x.lineWidth = 4; for (let i = 0; i < 16; i++) { const a = i / 16 * TAU; x.beginPath(); x.moveTo(128 + Math.cos(a) * 30, 128 + Math.sin(a) * 30); x.lineTo(128 + Math.cos(a) * 128, 128 + Math.sin(a) * 128); x.stroke(); }
  x.fillStyle = '#2a0e5c'; x.font = '900 34px sans-serif'; x.textAlign = 'center'; x.fillText('JUMP!', 128, 140);
  return ctex(c);
}
export function buildArtPlane() {
  seedFrom('artplane');
  const g = new THREE.Group(), nm = [], sprites = [], strings = [], props = [];
  // ---- fuselage (lathe along Z; open rear at z=-8)
  const prof = [];
  for (let i = 0; i <= 30; i++) {
    const y = -8 + 19 * i / 30; let r = 1.9;
    if (y > 6) r = 1.9 * Math.sqrt(Math.max(0, 1 - Math.pow((y - 6) / 5, 2.4)));
    if (y < -3) r = 1.9 - ((-3 - y) / 5) * .22;
    prof.push(new THREE.Vector2(Math.max(r, .001), y));
  }
  const ftex = planeFuseTex();
  const fm = new THREE.MeshStandardMaterial({ map: ftex, roughness: .4, metalness: .15, emissiveMap: ftex, emissive: 0xffffff, emissiveIntensity: 0 }); nm.push([fm, 0, .22]);
  const fgeo = new THREE.LatheGeometry(prof, 40); fgeo.rotateX(PI / 2);
  keep(M(fgeo, fm, 1, 1, 1, 0, 0, 0, g));
  const inner = new THREE.LatheGeometry(prof.filter(p => p.y < 3).map(p => new THREE.Vector2(p.x * .95, p.y)), 28); inner.rotateX(PI / 2);
  const inM = new THREE.MeshStandardMaterial({ color: 0x3a1450, roughness: .8, side: THREE.BackSide, emissive: 0x6a1a8a, emissiveIntensity: .25 }); nm.push([inM, .25, .9]);
  keep(noSh(M(inner, inM, 1, 1, 1, 0, 0, 0, g)));
  // interior: floor, glowing bulkhead, ceiling bulbs
  M(G.box, mat(0x2b2234, { roughness: .7 }), 2.9, .12, 11, 0, -1.2, -2.6, g);
  const bh = new THREE.MeshStandardMaterial({ map: bulkheadTex(), emissiveMap: bulkheadTex(), emissive: 0xffffff, emissiveIntensity: .7, roughness: .5 }); nm.push([bh, .7, 2.2]);
  keep(M(new THREE.CircleGeometry(1.82, 28).rotateY(PI), bh, 1, 1, 1, 0, 0, 2.9, g));
  strings.push(lightString(g, sagPts(V(-1.1, 1.45, 2.6), V(-1.1, 1.4, -7.8), 14, .1), FEST, .06, 3));
  strings.push(lightString(g, sagPts(V(1.1, 1.45, 2.6), V(1.1, 1.4, -7.8), 14, .1), FEST, .06, 3));
  // rear ramp (hinged at the lower rear lip)
  const ramp = grp(g, 0, -1.25, -8); ramp.rotation.x = -.33;
  M(G.box, new THREE.MeshStandardMaterial({ map: hazardTex(), roughness: .7 }), 2.8, .16, 3.8, 0, 0, -1.9, ramp);
  for (const s of [-1, 1]) { M(G.box, mat(0x2a0e5c), .12, .45, 3.8, s * 1.4, .25, -1.9, ramp); noSh(M(G.box, neon(0xffd23f, 2), .06, .06, 3.8, s * 1.4, .5, -1.9, ramp)); }
  const door = new THREE.Object3D(); door.name = 'jumpDoor'; door.position.set(0, .2, -3.6); ramp.add(door);
  // ---- tail boom + fins
  const boomM = mat(0xc2185b, { roughness: .45, metalness: .15 });
  const boom = M(new THREE.CylinderGeometry(.42, 1.15, 1, 20), boomM, 1, 1, 1, 0, 0, 0, g);
  { const a = V(0, .95, -6.5), b = V(0, 2.2, -15.5); _v1.subVectors(b, a); const len = _v1.length(); boom.position.addVectors(a, b).multiplyScalar(.5); boom.quaternion.setFromUnitVectors(_UP, _v1.normalize()); boom.scale.set(1, len, 1); }
  noSh(M(G.cyl, neon(0xff3d7f, 2), 1.18, .12, 1.18, 0, .95, -6.5, g)).rotation.x = PI / 2;
  const fs = new THREE.Shape(); fs.moveTo(0, 0); fs.lineTo(3.4, 0); fs.quadraticCurveTo(4.4, 3.2, 4.6, 4.4); fs.lineTo(3.4, 4.6); fs.quadraticCurveTo(1.8, 2.4, 0, .5); fs.closePath();
  const fgeo2 = new THREE.ExtrudeGeometry(fs, { depth: .22, bevelEnabled: true, bevelThickness: .06, bevelSize: .06, bevelSegments: 2 }); fgeo2.translate(0, 0, -.11); fgeo2.rotateY(-PI / 2);
  const ftx = finTex(); ftx.repeat.set(1 / 4.8, 1 / 4.8); ftx.offset.set(0, 0);
  const finM = new THREE.MeshStandardMaterial({ map: ftx, roughness: .45, emissiveMap: ftx, emissive: 0xffffff, emissiveIntensity: 0 }); nm.push([finM, 0, .35]);
  M(fgeo2, finM, 1, 1, 1, 0, 1.9, -11.6, g);
  const hs = new THREE.Shape(); hs.moveTo(-4.8, -.4); hs.lineTo(-4.6, .7); hs.lineTo(0, 1.6); hs.lineTo(4.6, .7); hs.lineTo(4.8, -.4); hs.lineTo(0, -.9); hs.closePath();
  const hgeo = new THREE.ExtrudeGeometry(hs, { depth: .16, bevelEnabled: true, bevelThickness: .05, bevelSize: .05, bevelSegments: 1 }); hgeo.rotateX(PI / 2);
  M(hgeo, mat(0xff5a1f, { roughness: .45 }), 1, 1, 1, 0, 2.15, -14.6, g);
  // ---- wings (high wing)
  const ws = new THREE.Shape(); ws.moveTo(-15, -1.1); ws.quadraticCurveTo(-15.4, .1, -14.6, .7); ws.lineTo(0, 2.1); ws.lineTo(14.6, .7); ws.quadraticCurveTo(15.4, .1, 15, -1.1); ws.lineTo(0, -2.0); ws.closePath();
  const wgeo = new THREE.ExtrudeGeometry(ws, { depth: .34, bevelEnabled: true, bevelThickness: .1, bevelSize: .1, bevelSegments: 2, curveSegments: 6 }); wgeo.rotateX(PI / 2);
  const wtx = planeWingTex(); wtx.repeat.set(1 / 30.4, 1 / 4.4); wtx.offset.set(.5, .48);
  const wingM = new THREE.MeshStandardMaterial({ map: wtx, roughness: .45, metalness: .1, emissiveMap: wtx, emissive: 0xffffff, emissiveIntensity: 0 }); nm.push([wingM, 0, .25]);
  M(wgeo, wingM, 1, 1, 1, 0, 1.95, 1.2, g);
  const lead = (x) => 1.2 + 2.1 - 1.4 * Math.abs(x) / 14.6;
  // neon leading-edge piping
  for (const s of [-1, 1]) { const o = noSh(M(G.cyl, neon(0xffd23f, 2.2), .07, 1, .07, 0, 0, 0, g)); placeSeg(o, V(s * 1.6, 1.82, lead(1.6) + .05), V(s * 14.6, 1.82, lead(14.6) + .05), .07); }
  // ---- engines
  const nacM = mat(0xffd23f, { roughness: .35, metalness: .3 }), nacStripe = mat(0x2a0e5c, { roughness: .4 }), bladeM = mat(0x1d1426, { roughness: .4 }), tipM = mat(0xff3d7f, { roughness: .4 }), spinM = mat(0xff3d7f, { roughness: .3, metalness: .3 });
  for (const ex of [-10.4, -5.4, 5.4, 10.4]) {
    const ez = lead(ex) - 1.2;
    M(G.cylZ, nacM, .58, .58, 3.6, ex, 1.15, ez, g);
    M(G.cylZ, nacStripe, .6, .6, .5, ex, 1.15, ez - .4, g);
    M(G.box, nacStripe, .18, .55, 1.8, ex, 1.6, ez, g);
    noSh(M(G.torus, neon(0x2ec4ff, 2.4), .55, .55, 2.5, ex, 1.15, ez + 1.82, g));
    noSh(M(G.coneZ, neon(0xff6b2b, 2.4), .42, .42, .7, ex, 1.15, ez - 2.1, g)).rotation.y = PI;
    M(G.coneZ, spinM, .32, .32, .8, ex, 1.15, ez + 2.2, g);
    const pr = grp(g, ex, 1.15, ez + 2.0); props.push(pr);
    for (let b = 0; b < 3; b++) { const a = b / 3 * TAU, bl = M(G.box, bladeM, .26, 1.7, .06, Math.sin(a) * .85, Math.cos(a) * .85, 0, pr); bl.rotation.set(0, .3, -a); const tp = M(G.box, tipM, .27, .3, .07, Math.sin(a) * 1.6, Math.cos(a) * 1.6, 0, pr); tp.rotation.set(0, .3, -a); }
  }
  // ---- nose personality: beak, eyes, crest, windscreen
  const gold = mat(0xffc93c, { roughness: .3, metalness: .6 });
  M(G.coneZ, gold, .55, .4, 1.7, 0, -.25, 11.3, g);
  M(G.coneZ, mat(0xe0a020, { roughness: .35, metalness: .5 }), .35, .25, 1.0, 0, -.75, 10.7, g).rotation.x = .25;
  for (const s of [-1, 1]) {
    const ph = 1.08, rr = 1.6, ey = grp(g, s * rr * Math.sin(ph), rr * Math.cos(ph), 8.75); ey.quaternion.setFromUnitVectors(V(0, 0, 1), V(s * Math.sin(ph), Math.cos(ph), .55).normalize());
    M(G.sph, mat(0xffffff, { roughness: .2 }), .52, .56, .22, 0, 0, 0, ey);
    M(G.sph, mat(0x111018, { roughness: .1 }), .27, .3, .12, .06 * s, -.03, .15, ey);
    noSh(M(G.sph, neon(0xffffff, 2.5), .08, .08, .05, .12 * s, .08, .25, ey));
    M(G.box, mat(0x2a0e5c), .9, .12, .16, 0, .6, .08, ey).rotation.z = s * .3;
  }
  const wsM = mat(0x16324f, { roughness: .08, metalness: .6 });
  M(G.sph, wsM, 1.05, .42, 1.15, 0, 1.2, 8.3, g);
  const crestM = ownNeon(0xff6b2b, 1.2); nm.push([crestM, 1.2, 2.6]);
  for (let i = 0; i < 4; i++) {
    const cs = new THREE.Shape(); cs.moveTo(0, 0); cs.quadraticCurveTo(-.2, 1.2, -1.5, 2.2 - i * .2); cs.quadraticCurveTo(-.4, 1.0, 1.0, 0); cs.closePath();
    const cg = new THREE.ExtrudeGeometry(cs, { depth: .1, bevelEnabled: false }); cg.rotateY(-PI / 2);
    M(cg, i % 2 ? crestM : neon(0xffd23f, 1.6), 1, 1 - i * .12, 1, -.05, 1.75, 7.0 - i * .9, g);
  }
  // ---- festoon lights under the wings
  for (const s of [-1, 1]) {
    const xs = [1.9, 5.4, 10.4, 14.4].map(x => x * s);
    strings.push(lightString(g, chain(xs.map(x => V(x, 1.75, lead(Math.abs(x)) - .1)), 7, .45), FEST, .1, 3.2));
    strings.push(lightString(g, chain(xs.map(x => V(x, 1.75, 1.2 - 1.9 + .1 + .9 * Math.abs(x) / 14.6)), 7, .38), [0xfff2b0, 0xffb703, 0xff6b2b], .09, 3.2));
  }
  // ---- disco ball under the belly
  M(G.cyl, gold, .05, .9, .05, 0, -2.25, 1.6, g);
  const dtx = discoTex();
  const discoM = new THREE.MeshStandardMaterial({ map: dtx, emissiveMap: dtx, emissive: 0xffffff, emissiveIntensity: .35, roughness: .15, metalness: .7, flatShading: true }); nm.push([discoM, .35, 1.6]);
  const disco = keep(M(new THREE.SphereGeometry(.9, 18, 12), discoM, 1, 1, 1, 0, -3.2, 1.6, g)); props.push(disco);
  const dsp = glowSprite(0xffe0ff, 5); dsp.position.set(0, -3.2, 1.6); g.add(dsp); sprites.push([dsp, .55]);
  // ---- nav lights
  const red = glowSprite(0xff2040, 3), grn = glowSprite(0x30ff70, 3), strobe = glowSprite(0xffffff, 4);
  red.position.set(-15.1, 2.0, .2); grn.position.set(15.1, 2.0, .2); strobe.position.set(0, 6.6, -15.6); g.add(red, grn, strobe);
  noSh(M(G.sph, neon(0xff2040, 3), .14, .14, .14, -15.1, 2.0, .2, g)); noSh(M(G.sph, neon(0x30ff70, 3), .14, .14, .14, 15.1, 2.0, .2, g));
  sprites.push([red, .9], [grn, .9]);
  const strobeM = ownNeon(0xffffff, 3); noSh(M(G.sph, strobeM, .14, .14, .14, 0, 6.5, -15.5, g));
  return finish(g, {
    nm, sprites, strings, extras: { door, props, ramp, wingspan: 30.5, length: 27 },
    update(dt, t, ctx, night) {
      for (const p of props) if (p === disco) p.rotation.y += dt * .9; else p.rotation.z += dt * 28;
      const on = (t * 1.3 % 1) < .08; strobe.material.opacity = on ? 1 : 0; strobeM.emissiveIntensity = on ? 6 : .3;
      crestM.emissiveIntensity *= .85 + .3 * Math.abs(Math.sin(t * 7.3) * Math.sin(t * 3.1));
    },
  });
}

// ============================================================ 2. GLIDERS
export const GLIDERS = [
  { id: 'phoenix', name: 'Phoenix Wings', blurb: 'Fire-feathered wings that flap on their own. Slightly singed, extremely dramatic.' },
  { id: 'butterfly', name: 'Stained-Glass Butterfly', blurb: 'Hand-leaded glass wings that glow like a chapel window after sundown.' },
  { id: 'balloon', name: 'Pocket Balloon', blurb: 'A tiny hot-air balloon with a burner you really should not touch.' },
  { id: 'parachute', name: 'Patchwork Ram-Air', blurb: 'Sewn from forty camp banners and one very brave bedsheet.' },
];
function featherGeo(L, W, c0, c1) {
  const s = new THREE.Shape(); s.moveTo(0, 0); s.bezierCurveTo(W, -L * .15, W * .9, -L * .75, 0, -L); s.bezierCurveTo(-W * .9, -L * .75, -W, -L * .15, 0, 0);
  const geo = new THREE.ShapeGeometry(s, 5), pos = geo.attributes.position, col = new Float32Array(pos.count * 3), a = new THREE.Color(c0), b = new THREE.Color(c1), c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) { c.copy(a).lerp(b, Math.pow(-pos.getY(i) / L, .8)); col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3)); geo.rotateX(PI / 2); // tip -> -Z
  return geo;
}
function gliderPhoenix(g, nm, sprites) {
  const fm = new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: .55, emissive: 0xff4a10, emissiveIntensity: .12 }); nm.push([fm, .12, .9]);
  const boneM = neon(0xffd23f, 1.4);
  const wings = [], rigPts = [];
  for (const s of [-1, 1]) {
    const inner = grp(g, s * .22, 2.75, .25), outer = grp(inner, s * 2.0, .02, -.1);
    const ip = [], op = [];
    // inner segment: coverts (red), secondaries (orange)
    for (let i = 0; i < 9; i++) { const x = s * (.1 + i * .23); ip.push([featherGeo(1.5 + i * .05, .2, 0xffd23f, 0xff6b2b), mtx(x, -.02, -.05, 0, -s * .05, 0)]); }
    for (let i = 0; i < 8; i++) { const x = s * (.15 + i * .25); ip.push([featherGeo(.8, .18, 0xb3122e, 0xff3d3d), mtx(x, .04, .25, 0, 0, 0)]); }
    // outer segment: long primaries fanning back
    for (let i = 0; i < 9; i++) { const x = s * (.05 + i * .24); op.push([featherGeo(1.8 + i * .14, .2 + i * .006, 0xff8a1f, 0xfff07a), mtx(x, -.02 - i * .006, -.05, 0, -s * i * .085, 0)]); }
    for (let i = 0; i < 9; i++) { const x = s * (.1 + i * .22); op.push([featherGeo(.75, .17, 0xd81b60, 0xff6b2b), mtx(x, .04, .22, 0, -s * i * .04, 0)]); }
    M(mergeList(ip), fm, 1, 1, 1, 0, 0, 0, inner); M(mergeList(op), fm, 1, 1, 1, 0, 0, 0, outer);
    seg(G.cyl, boneM, V(0, .06, .3), V(s * 2.05, .08, .2), .06, inner);
    seg(G.cyl, boneM, V(0, .06, .2), V(s * 2.2, .02, -.3), .05, outer);
    noSh(M(G.sph, boneM, .09, .09, .09, s * 2.2, .02, -.3, outer));
    wings.push({ s, inner, outer }); rigPts.push([V(s * .16, 0, 0), inner, V(s * 1.0, 0, .2)], [V(s * .16, 0, 0), inner, V(s * 1.9, 0, .15)], [V(s * .16, 0, 0), outer, V(s * 1.2, 0, 0)]);
  }
  // body, head, tail
  const red = mat(0xd81b30, { roughness: .5 }), gold = mat(0xffc93c, { roughness: .3, metalness: .5 });
  M(G.sph, red, .32, .3, .95, 0, 2.78, .2, g);
  M(G.sph, red, .24, .24, .26, 0, 3.0, 1.25, g);
  M(G.coneZ, gold, .1, .09, .36, 0, 2.97, 1.6, g);
  for (const s of [-1, 1]) noSh(M(G.sph, neon(0x7dfcff, 2.5), .045, .045, .045, s * .16, 3.05, 1.38, g));
  const crestM = neon(0xffd23f, 1.6);
  for (let i = 0; i < 3; i++) { const c = M(featherGeo(.55, .08, 0xffd23f, 0xff3d3d), crestM, 1, 1, 1, 0, 3.15, 1.2 - i * .08, g); c.rotation.x = -1.1 - i * .25; }
  const tail = grp(g, 0, 2.78, -.65);
  const tp = []; for (let i = -2; i <= 2; i++) tp.push([featherGeo(2.4 - Math.abs(i) * .3, .18, 0xff3d3d, 0xffe36e), mtx(i * .08, -Math.abs(i) * .02, 0, -.12, i * .14, 0)]);
  M(mergeList(tp), fm, 1, 1, 1, 0, 0, 0, tail);
  const sp = glowSprite(0xff7a2a, 9); sp.position.set(0, 2.7, -.2); g.add(sp); sprites.push([sp, .35]);
  rigPts.push([V(-.16, 0, 0), g, V(0, 2.5, .3)], [V(.16, 0, 0), g, V(0, 2.5, .3)]);
  return {
    rigPts, update(dt, t) {
      const f = Math.sin(t * 2.4);
      for (const w of wings) { w.inner.rotation.z = w.s * (.12 + .28 * f); w.outer.rotation.z = w.s * (.08 + .3 * Math.sin(t * 2.4 - .7)); w.inner.rotation.x = .05 * Math.sin(t * 2.4 + .4); }
      tail.rotation.y = .12 * Math.sin(t * 1.3); tail.rotation.x = .08 * Math.sin(t * 2.4 - 1);
    },
  };
}
function stainedGlassTex() {
  const S = 512, [c, x] = cnv(S, S); const img = x.createImageData(S, S), d = img.data;
  const seeds = []; for (let i = 0; i < 90; i++) seeds.push([rnd() * S, rnd() * S]);
  const pal = ['#1e3fff', '#6a1bff', '#00b4d8', '#00d68f', '#ffd23f', '#ff8a1f', '#ff2e63', '#c724b1', '#2ec4ff', '#ffe36e'].map(h => new THREE.Color(h));
  const cols = seeds.map(([sx, sy]) => { const r = Math.hypot(sx / S, (sy - S / 2) / S); const base = r < .25 ? pick(pal.slice(0, 4)) : r < .5 ? pick(pal.slice(2, 7)) : pick(pal.slice(4)); return base; });
  for (let y = 0; y < S; y++) for (let xx = 0; xx < S; xx++) {
    let b1 = 1e9, b2 = 1e9, bi = 0;
    for (let i = 0; i < seeds.length; i++) { const dx = xx - seeds[i][0], dy = y - seeds[i][1], dd = dx * dx + dy * dy; if (dd < b1) { b2 = b1; b1 = dd; bi = i; } else if (dd < b2) b2 = dd; }
    const edge = Math.sqrt(b2) - Math.sqrt(b1) < 3.2; const k = (y * S + xx) * 4, col = cols[bi], sh = .8 + .2 * Math.sin(xx * .05 + y * .03);
    if (edge) { d[k] = 18; d[k + 1] = 12; d[k + 2] = 24; } else { d[k] = col.r * 255 * sh; d[k + 1] = col.g * 255 * sh; d[k + 2] = col.b * 255 * sh; }
    d[k + 3] = 255;
  }
  x.putImageData(img, 0, 0);
  // eye spots
  const toC = (wx, wy) => [wx / 4 * S, (1 - (wy / 5.4 + .5)) * S];
  for (const [wx, wy, r] of [[2.6, 1.5, 34], [1.9, -1.4, 28]]) { const [cx, cy] = toC(wx, wy); for (const [rr, col] of [[r, '#120c1a'], [r * .78, '#ffd23f'], [r * .5, '#ff2e63'], [r * .22, '#120c1a'], [r * .1, '#fff']]) { x.fillStyle = col; x.beginPath(); x.arc(cx, cy, rr, 0, TAU); x.fill(); } }
  // thick lead border following the wing outlines
  x.strokeStyle = '#120c1a'; x.lineWidth = 14; x.lineJoin = 'round';
  for (const sh of BF_SHAPES()) { x.beginPath(); sh.getPoints(24).forEach((p, i) => { const [cx, cy] = toC(p.x, p.y); i ? x.lineTo(cx, cy) : x.moveTo(cx, cy); }); x.closePath(); x.stroke(); }
  return ctex(c);
}
function BF_SHAPES() {
  const f = new THREE.Shape(); f.moveTo(0, .1); f.bezierCurveTo(1.0, 2.0, 3.1, 2.7, 3.75, 1.9); f.bezierCurveTo(4.05, 1.1, 2.9, .1, 0, -.05);
  const h = new THREE.Shape(); h.moveTo(0, -.05); h.bezierCurveTo(1.9, -.1, 3.2, -.8, 2.8, -1.9); h.bezierCurveTo(2.5, -2.75, .9, -2.6, 0, -.6);
  return [f, h];
}
function gliderButterfly(g, nm, sprites) {
  const tx = stainedGlassTex(); tx.repeat.set(1 / 4, 1 / 5.4); tx.offset.set(0, .5);
  const wm = new THREE.MeshStandardMaterial({ map: tx, emissiveMap: tx, emissive: 0xffffff, emissiveIntensity: .3, roughness: .25, metalness: .1, side: THREE.DoubleSide, transparent: true, opacity: .94 }); nm.push([wm, .3, 1.5]);
  const geos = BF_SHAPES().map(s => { const gg = new THREE.ShapeGeometry(s, 24); gg.rotateX(PI / 2); return gg; });
  // rotateX(PI/2) maps shape y -> +z? (z' = y) then flip so forewing points +Z
  const leadM = mat(0x120c1a, { roughness: .4 });
  const sides = [], rigPts = [];
  for (const s of [-1, 1]) {
    const w = grp(g, s * .08, 2.75, 0); w.scale.x = s;
    for (const gg of geos) keep(M(gg, wm, 1, 1, 1, 0, 0, 0, w)).castShadow = true;
    // outline lead came as a tube
    for (const sh of BF_SHAPES()) { const pts = sh.getPoints(20).map(p => V(p.x, 0, p.y)); keep(M(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true), 60, .035, 4, true), leadM, 1, 1, 1, 0, 0, 0, w)); }
    sides.push({ s, w }); rigPts.push([V(s * .16, 0, 0), w, V(1.2, 0, .5)], [V(s * .16, 0, 0), w, V(1.0, 0, -.8)], [V(s * .16, 0, 0), w, V(2.6, 0, .9)]);
  }
  const bodyM = mat(0x2a0e5c, { roughness: .4, metalness: .3 }), ringM = mat(0xffc93c, { roughness: .3, metalness: .6 });
  M(new THREE.CapsuleGeometry(.13, 1.6, 4, 10).rotateX(PI / 2), bodyM, 1, 1, 1, 0, 2.75, -.1, g);
  for (let i = 0; i < 5; i++) M(G.torus, ringM, .14, .14, 1.6, 0, 2.75, -.7 + i * .25, g);
  M(G.sph, bodyM, .17, .17, .17, 0, 2.8, .95, g);
  for (const s of [-1, 1]) {
    M(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([V(s * .06, 2.9, 1.0), V(s * .25, 3.3, 1.4), V(s * .5, 3.5, 1.9)]), 10, .02, 4), bodyM, 1, 1, 1, 0, 0, 0, g);
    noSh(M(G.sph, neon(0x7dfcff, 2.6), .07, .07, .07, s * .5, 3.5, 1.9, g));
    noSh(M(G.sph, neon(0xffd23f, 2), .05, .05, .05, s * .09, 2.86, 1.08, g));
  }
  const sp = glowSprite(0x9a7dff, 9); sp.position.set(0, 2.75, 0); g.add(sp); sprites.push([sp, .3]);
  rigPts.push([V(-.16, 0, 0), g, V(0, 2.62, .2)], [V(.16, 0, 0), g, V(0, 2.62, .2)]);
  return {
    rigPts, update(dt, t) { const f = .12 + .3 * Math.sin(t * 3.1); for (const sd of sides) sd.w.rotation.z = sd.s * f; },
  };
}
function balloonTex() {
  const W = 1024, H = 512, [c, x] = cnv(W, H); // x = around, top = crown
  const cols = ['#ff3d7f', '#ffd23f', '#2ec4ff', '#ff6b2b', '#b15cff', '#3ddc97'];
  const n = 12; for (let i = 0; i < n; i++) { x.fillStyle = cols[i % cols.length]; x.fillRect(i * W / n, 0, W / n + 1, H); }
  // zigzag crown band
  x.fillStyle = '#2a0e5c'; x.fillRect(0, H * .22, W, H * .1);
  x.fillStyle = '#ffe36e'; x.beginPath(); x.moveTo(0, H * .32); for (let i = 0; i <= 48; i++) x.lineTo(i * W / 48, H * (i % 2 ? .23 : .31)); x.lineTo(W, H * .32); x.fill();
  // band of suns / eyes around the equator
  x.fillStyle = '#fff4d0'; x.fillRect(0, H * .48, W, H * .14);
  for (let i = 0; i < n; i++) { const cx = (i + .5) * W / n, cy = H * .55; x.fillStyle = i % 2 ? '#ff6b2b' : '#2a0e5c'; star(x, cx, cy, 30, 8, .5); x.fill(); x.fillStyle = '#ffd23f'; x.beginPath(); x.arc(cx, cy, 13, 0, TAU); x.fill(); }
  // skirt
  const gr = x.createLinearGradient(0, H * .8, 0, H); gr.addColorStop(0, 'rgba(42,14,92,0)'); gr.addColorStop(1, 'rgba(42,14,92,.85)'); x.fillStyle = gr; x.fillRect(0, H * .8, W, H * .2);
  // load tapes
  x.fillStyle = 'rgba(40,20,40,.55)'; for (let i = 0; i < n; i++) x.fillRect(i * W / n - 2, 0, 4, H);
  return ctex(c);
}
function gliderBalloon(g, nm, sprites) {
  const env = grp(g, 0, 0, 0);
  const prof = [[.5, 2.6], [1.2, 3.1], [2.2, 3.95], [2.85, 4.95], [3.05, 5.9], [2.88, 6.85], [2.35, 7.6], [1.5, 8.15], [.5, 8.4], [.001, 8.42]].map(([r, y]) => new THREE.Vector2(r, y));
  const tx = balloonTex();
  const em = new THREE.MeshStandardMaterial({ map: tx, emissiveMap: tx, emissive: 0xffb070, emissiveIntensity: .05, roughness: .55, side: THREE.DoubleSide }); nm.push([em, .05, .7]);
  const lg = new THREE.LatheGeometry(new THREE.SplineCurve(prof).getPoints(28), 36);
  keep(M(lg, em, 1, 1, 1, 0, 0, 0, env));
  // vertical bulges: gore ribs
  M(G.torus, mat(0x2a0e5c, { roughness: .5 }), .5, .5, 1.5, 0, 2.6, 0, env).rotation.x = PI / 2;
  M(G.cyl, mat(0xffc93c, { roughness: .3, metalness: .6 }), .35, .06, .35, 0, 8.43, 0, env);
  // burner frame
  const steel = mat(0xb8bcc8, { roughness: .3, metalness: .8 });
  const bf = grp(g, 0, 1.55, 0); bf.userData.keep = true;
  M(G.box, steel, .7, .05, .05, 0, 0, .33, bf); M(G.box, steel, .7, .05, .05, 0, 0, -.33, bf); M(G.box, steel, .05, .05, .7, .33, 0, 0, bf); M(G.box, steel, .05, .05, .7, -.33, 0, 0, bf);
  M(G.cyl, steel, .16, .3, .16, 0, .1, 0, bf);
  M(G.torus, mat(0x404450, { roughness: .4, metalness: .6 }), .18, .18, 1.6, 0, .28, 0, bf).rotation.x = PI / 2;
  const flM = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff8a2a).multiplyScalar(2.4), transparent: true, opacity: .9, blending: THREE.AdditiveBlending, depthWrite: false });
  const flame = keep(noSh(M(G.cone, flM, .14, .8, .14, 0, .72, 0, bf))); const flame2 = keep(noSh(M(G.cone, new THREE.MeshBasicMaterial({ color: new THREE.Color(0x6ad0ff).multiplyScalar(2), transparent: true, opacity: .8, blending: THREE.AdditiveBlending, depthWrite: false }), .08, .35, .08, 0, .5, 0, bf)));
  const sp = glowSprite(0xff9a3a, 4); sp.position.set(0, 2.4, 0); g.add(sp); sprites.push([sp, .8]);
  // dangling tassels round the mouth
  for (let i = 0; i < 12; i++) { const a = i / 12 * TAU; M(G.cone, mat(FEST[i % FEST.length], { roughness: .6 }), .06, .3, .06, Math.sin(a) * .55, 2.4, Math.cos(a) * .55, env).rotation.x = PI; }
  const rigPts = [];
  for (const [cx, cz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    rigPts.push([V(cx * .16, 0, 0), bf, V(cx * .33, 0, cz * .33)]);
    for (const k of [0, 1]) { const a = Math.atan2(cx, cz) + (k - .5) * .7; rigPts.push([V(cx * .33, 1.55, cz * .33), env, V(Math.sin(a) * .5, 2.6, Math.cos(a) * .5)]); }
  }
  return {
    rigPts, update(dt, t, ctx, night) {
      env.rotation.z = .04 * Math.sin(t * .7); env.rotation.x = .035 * Math.sin(t * .53 + 1);
      const burn = Math.pow(.5 + .5 * Math.sin(t * .9), 6) > .3 ? 1 : .35, fl = burn * (.8 + .4 * Math.abs(Math.sin(t * 23) * Math.sin(t * 13)));
      flame.scale.set(.14 + .05 * fl, .45 + .9 * fl, .14 + .05 * fl); flame.position.y = .3 + flame.scale.y / 2; flame2.scale.y = .25 + .2 * fl;
      em.emissiveIntensity = (.05 + .65 * night) * (.6 + .5 * burn); sp.material.opacity = (.3 + .7 * night) * fl * .8;
    },
  };
}
function gliderParachute(g, nm, sprites) {
  const N = 9, H = 5.0, Rc = 5.8, spread = 1.45, w = Rc * spread / N - .03;
  const pal = [0xff3d7f, 0xffd23f, 0x2ec4ff, 0xff6b2b, 0xb15cff, 0x3ddc97, 0xffffff, 0xff3d7f, 0x2ec4ff].map(c => new THREE.Color(c));
  const sh = new THREE.Shape(); sh.moveTo(-1.35, -.06); sh.bezierCurveTo(-1.45, .38, -.6, .55, .2, .46); sh.quadraticCurveTo(1.0, .35, 1.55, .04); sh.lineTo(1.5, -.02); sh.quadraticCurveTo(.2, -.1, -1.25, -.16); sh.closePath();
  const parts = [];
  for (let i = 0; i < N; i++) {
    const geo = new THREE.ExtrudeGeometry(sh, { depth: w, bevelEnabled: true, bevelThickness: .07, bevelSize: .04, bevelSegments: 2, curveSegments: 8 });
    geo.rotateY(PI / 2); geo.translate(-w / 2, 0, 0);
    const pos = geo.attributes.position, col = new Float32Array(pos.count * 3), A0 = pal[i], B0 = pal[(i + 4) % N], c = new THREE.Color();
    for (let k = 0; k < pos.count; k++) { const z = pos.getZ(k); c.copy(z < -.55 ? B0 : z > .9 ? pal[(i + 2) % N] : A0); if (pos.getY(k) < -.05) c.multiplyScalar(.7); col[k * 3] = c.r; col[k * 3 + 1] = c.g; col[k * 3 + 2] = c.b; }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const th = -spread / 2 + (i + .5) * spread / N;
    parts.push([geo, mtx(Rc * Math.sin(th), H - Rc + Rc * Math.cos(th), 0, 0, 0, -th)]);
  }
  const cg = mergeList(parts), base = cg.attributes.position.array.slice();
  const cm = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .7, side: THREE.DoubleSide, emissive: 0xffffff, emissiveIntensity: 0 }); nm.push([cm, 0, .08]);
  const can = grp(g); keep(M(cg, cm, 1, 1, 1, 0, 0, 0, can));
  // little LED dots on the leading edge for night
  const led = []; for (let i = 0; i <= N * 2; i++) { const th = -spread / 2 + i * spread / (N * 2); led.push(V(Rc * Math.sin(th) * 1.005, H - Rc + Rc * Math.cos(th) * 1.005 + .1, 1.35)); }
  const ls = lightString(can, led, FEST, .06, 3, false, .3);
  const rigPts = [];
  for (let j = 0; j <= N; j++) {
    const th = -spread / 2 + j * spread / N, x = (Rc - .2) * Math.sin(th), y = H - Rc + (Rc - .2) * Math.cos(th), hand = V(Math.sign(x || 1) * .18, 0, 0);
    rigPts.push([hand, can, V(x, y, .9)], [hand, can, V(x, y, -.4)]);
  }
  const bk = []; for (const s of [-1, 1]) { const th = s * spread / 2; bk.push([V(s * .18, 0, 0), can, V((Rc - .2) * Math.sin(th), H - Rc + (Rc - .2) * Math.cos(th), -1.3)]); }
  return {
    rigPts, extraRig: bk, strings: [ls], update(dt, t) {
      const pos = cg.attributes.position.array;
      for (let k = 0; k < pos.length; k += 3) { const z = base[k + 2]; if (z < -.3) { const f = (-.3 - z) / 1.6; pos[k + 1] = base[k + 1] + f * f * .14 * Math.sin(t * 9 + base[k] * 1.3) ; } }
      cg.attributes.position.needsUpdate = true;
      can.rotation.z = .05 * Math.sin(t * .8); can.rotation.x = .03 * Math.sin(t * 1.1); can.scale.y = 1 + .015 * Math.sin(t * 2.3);
    },
  };
}
export function buildGlider(kind = 'parachute') {
  seedFrom('glider-' + kind);
  const g = new THREE.Group(), nm = [], sprites = [];
  const fn = { phoenix: gliderPhoenix, butterfly: gliderButterfly, balloon: gliderBalloon, parachute: gliderParachute }[kind] || gliderParachute;
  const r = fn(g, nm, sprites);
  // harness bar at the hands
  M(G.cylLo, mat(0x2a0e5c, { roughness: .5 }), .025, .5, .025, 0, 0, 0, g).rotation.z = PI / 2;
  for (const s of [-1, 1]) noSh(M(G.sph, neon(0xffd23f, 1.6), .04, .04, .04, s * .25, 0, 0, g));
  mergeStatic(g);
  const lines = makeRig(g, r.rigPts, 0xfff4e0, .85);
  const brakes = r.extraRig ? makeRig(g, r.extraRig, 0xff3d7f, .9) : null;
  const strings = r.strings || [];
  let T = 0;
  const update = (dt = 0, t, ctx) => {
    if (t === undefined) { T += dt; t = T; }
    ctx = ctx || NOCTX; const night = ctx.night || 0;
    for (const [m, lo, hi] of nm) m.emissiveIntensity = lo + (hi - lo) * night;
    for (const [s, op] of sprites) s.material.opacity = op * night;
    for (const s of strings) s.update(t, night);
    r.update(dt, t, ctx, night);
    lines.userData.refresh(); if (brakes) brakes.userData.refresh();
  };
  update(0, 0);
  g.userData.glider = kind;
  return { g, update, lines, kind };
}

// ============================================================ 3. PORTA-POTTY
function stickerTex(seed, door) {
  seedFrom('stickers' + seed);
  const W = 256, H = 512, [c, x] = cnv(W, H);
  x.fillStyle = '#28b8b0'; x.fillRect(0, 0, W, H);
  // moulded ribs
  for (let i = 0; i < 5; i++) { x.fillStyle = 'rgba(0,60,70,.18)'; x.fillRect(18 + i * 52, 0, 10, H); x.fillStyle = 'rgba(255,255,255,.12)'; x.fillRect(28 + i * 52, 0, 4, H); }
  const g2 = x.createLinearGradient(0, H * .85, 0, H); g2.addColorStop(0, 'rgba(160,110,60,0)'); g2.addColorStop(1, 'rgba(170,120,70,.7)'); x.fillStyle = g2; x.fillRect(0, H * .8, W, H * .2);
  const n = door ? 7 : 11;
  for (let i = 0; i < n; i++) {
    const cx = 25 + rnd() * (W - 50), cy = door ? H * (.3 + rnd() * .55) : 40 + rnd() * (H * .75), r = 14 + rnd() * 18, k = (rnd() * 6) | 0;
    x.save(); x.translate(cx, cy); x.rotate((rnd() - .5) * .8);
    const col = pick(['#ff3d7f', '#ffd23f', '#b15cff', '#ff6b2b', '#7dff6b', '#ffffff']);
    x.lineWidth = 4; x.strokeStyle = '#fff';
    if (k === 0) { x.fillStyle = col; star(x, 0, 0, r); x.fill(); x.stroke(); }
    else if (k === 1) { x.fillStyle = col; heart(x, 0, 0, r); x.fill(); x.stroke(); }
    else if (k === 2) { x.fillStyle = '#ffd23f'; x.beginPath(); x.arc(0, 0, r, 0, TAU); x.fill(); x.stroke(); x.fillStyle = '#222'; x.beginPath(); x.arc(-r * .35, -r * .2, r * .12, 0, TAU); x.arc(r * .35, -r * .2, r * .12, 0, TAU); x.fill(); x.lineWidth = 3; x.strokeStyle = '#222'; x.beginPath(); x.arc(0, 0, r * .55, .3, PI - .3); x.stroke(); }
    else { const words = ['HYDRATE', 'LOVE', 'NO SPECTATORS', 'HUGS!', 'GLITTER', 'BE NICE', 'LEAVE NO TRACE', 'DUST BUNNY']; const wd = pick(words); x.font = '900 18px sans-serif'; const tw = x.measureText(wd).width + 14; x.fillStyle = col; x.fillRect(-tw / 2, -14, tw, 28); x.strokeRect(-tw / 2, -14, tw, 28); x.fillStyle = col === '#ffffff' || col === '#ffd23f' || col === '#7dff6b' ? '#2a0e5c' : '#fff'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(wd, 0, 1); }
    x.restore();
  }
  if (door) {
    x.save(); x.translate(W / 2, H * .5); x.rotate(-.08); x.font = '900 26px "Marker Felt", "Comic Sans MS", cursive'; x.textAlign = 'center';
    x.lineWidth = 6; x.strokeStyle = '#2a0e5c'; x.strokeText('TRUST NO BIRD', 0, 0); x.fillStyle = '#ffe36e'; x.fillText('TRUST NO BIRD', 0, 0); x.restore();
  } else {
    x.save(); x.translate(W / 2, H * .7); x.rotate(.1); x.font = '900 30px "Marker Felt", "Comic Sans MS", cursive'; x.textAlign = 'center'; x.lineWidth = 6; x.strokeStyle = '#2a0e5c'; x.strokeText(seed % 2 ? 'WAS HERE ♥' : 'BRB 4EVER', 0, 0); x.fillStyle = '#ff9ad5'; x.fillText(seed % 2 ? 'WAS HERE ♥' : 'BRB 4EVER', 0, 0); x.restore();
  }
  return ctex(c);
}
function indicatorTex(occ) {
  const [c, x] = cnv(128, 48); x.fillStyle = '#111'; x.fillRect(0, 0, 128, 48);
  x.fillStyle = occ ? '#ff2a2a' : '#22ff66'; x.fillRect(4, 4, 120, 40); x.fillStyle = '#111'; x.font = '900 ' + (occ ? 19 : 24) + 'px sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(occ ? 'OCCUPIED' : 'VACANT', 64, 25);
  return ctex(c);
}
export function buildPorta() {
  seedFrom('porta');
  const g = new THREE.Group(), nm = [], strings = [];
  const W = 1.3, H = 2.3, D = 1.3, t = .05;
  const sideM = new THREE.MeshStandardMaterial({ map: stickerTex(1), roughness: .5 }), backM = new THREE.MeshStandardMaterial({ map: stickerTex(2), roughness: .5 });
  const shell = mat(0x28b8b0, { roughness: .5 }), dark = mat(0x167a76, { roughness: .5 }), white = mat(0xf2f0e8, { roughness: .4 });
  M(G.box, sideM, t, H - .1, D, -W / 2 + t / 2, (H - .1) / 2, 0, g); M(G.box, sideM, t, H - .1, D, W / 2 - t / 2, (H - .1) / 2, 0, g);
  M(G.box, backM, W, H - .1, t, 0, (H - .1) / 2, -D / 2 + t / 2, g);
  M(G.box, dark, W + .06, .08, D + .06, 0, .04, 0, g);
  // front frame round the door
  M(G.box, shell, .14, H - .1, .08, -W / 2 + .07, (H - .1) / 2, D / 2 - .04, g); M(G.box, shell, .14, H - .1, .08, W / 2 - .07, (H - .1) / 2, D / 2 - .04, g);
  M(G.box, shell, W, .18, .08, 0, H - .19, D / 2 - .04, g);
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) M(G.box, dark, .08, H - .1, .08, sx * (W / 2 + .01), (H - .1) / 2, sz * (D / 2 + .01), g);
  // roof: flat lip + translucent dome + vent pipe
  M(G.box, white, W + .14, .08, D + .14, 0, H - .1, 0, g);
  const domeM = new THREE.MeshStandardMaterial({ color: 0xf6f3ea, roughness: .35, emissive: 0xffe2a8, emissiveIntensity: 0, transparent: true, opacity: .92 }); nm.push([domeM, 0, 1.1]);
  M(new THREE.CylinderGeometry(.68, .68, D + .06, 20, 1, false, -PI / 2, PI).rotateX(PI / 2), domeM, 1, .32, 1, 0, H - .06, 0, g);
  M(G.cyl, mat(0x222222, { roughness: .6 }), .07, .5, .07, .42, H + .2, -.42, g); M(G.cyl, mat(0x222222, { roughness: .6 }), .1, .06, .1, .42, H + .46, -.42, g);
  // interior: bench, seat, ceiling light, floor, a poster
  M(G.box, white, W - .1, .45, .55, 0, .3, -D / 2 + .32, g); M(G.cyl, mat(0x1a1a1a), .17, .02, .2, 0, .535, -D / 2 + .34, g);
  M(G.box, mat(0x3a3a40, { roughness: .9 }), W - .1, .02, D - .1, 0, .09, 0, g);
  const lamp = ownNeon(0xffd98a, .2); nm.push([lamp, .2, 2.2]); noSh(M(G.box, lamp, .4, .03, .4, 0, H - .16, 0, g));
  // door: hinge on the left (-x) edge; rotation.y 0 = closed, ~-1.9 = open
  const door = grp(g, -.5, .1, D / 2 - .02); door.name = 'portaDoor';
  const ds = new THREE.Shape(); ds.moveTo(0, 0); ds.lineTo(1.0, 0); ds.lineTo(1.0, 1.98); ds.lineTo(0, 1.98); ds.closePath();
  const moon = new THREE.Path(), mc = [.5, 1.68], R0 = .15, q = R0 * Math.sin(PI / 3), c1 = R0 * Math.cos(PI / 3);
  for (let i = 0; i <= 16; i++) { const a = PI / 3 + i / 16 * (4 * PI / 3); const px = mc[0] + Math.cos(a) * R0, py = mc[1] + Math.sin(a) * R0; i ? moon.lineTo(px, py) : moon.moveTo(px, py); }
  for (let i = 1; i < 16; i++) { const a = 3 * PI / 2 - i / 16 * PI; moon.lineTo(mc[0] + c1 + Math.cos(a) * q, mc[1] + Math.sin(a) * q); }
  moon.closePath(); ds.holes.push(moon);
  const dgeo = new THREE.ExtrudeGeometry(ds, { depth: .05, bevelEnabled: false, curveSegments: 4 });
  const dtx = stickerTex(3, true); dtx.repeat.set(1, 1 / 1.98);
  keep(M(dgeo, new THREE.MeshStandardMaterial({ map: dtx, roughness: .5 }), 1, 1, 1, 0, 0, -.025, door));
  const moonGlow = ownNeon(0xffd98a, .1); nm.push([moonGlow, .1, 2.6]); noSh(M(G.plane, moonGlow, .36, .36, 1, .5, 1.68, -.04, door));
  M(G.box, dark, .06, .22, .06, .9, 1.0, .06, door); M(G.box, mat(0xd8d8d8, { roughness: .3, metalness: .7 }), .05, .05, .05, .9, 1.13, .1, door);
  const occM = [indicatorTex(false), indicatorTex(true)].map(tx => new THREE.MeshStandardMaterial({ map: tx, emissiveMap: tx, emissive: 0xffffff, emissiveIntensity: .6, roughness: .4 }));
  const ind = keep(noSh(M(G.box, occM[0], .26, .1, .03, .78, 1.3, .045, door)));
  for (const m of occM) nm.push([m, .6, 2.2]);
  // fairy lights round the roof edge, a flower garland, a little pennant
  strings.push(lightString(g, chain([V(-.7, H - .08, .7), V(.7, H - .08, .7), V(.7, H - .08, -.7), V(-.7, H - .08, -.7), V(-.7, H - .08, .7)], 6, .09), FEST, .045, 3.4));
  const pen = new THREE.Shape(); pen.moveTo(0, 0); pen.lineTo(.4, -.1); pen.lineTo(0, -.22); pen.closePath();
  M(G.cylLo, mat(0x222222), .015, .5, .015, -.42, H + .25, .42, g);
  noSh(M(new THREE.ShapeGeometry(pen), mat(0xff3d7f, { side: THREE.DoubleSide, roughness: .7 }), 1, 1, 1, -.42, H + .48, .42, g));
  let occupied = false;
  return finish(g, {
    nm, strings, extras: {
      door, inside: V(0, .1, -.05), indicator: ind,
      setOccupied(b) { occupied = !!b; ind.material = occM[occupied ? 1 : 0]; },
      get occupied() { return occupied; },
    },
  });
}

// ============================================================ 4. RANGER DRONE
function rangerTextTex(text, w = 256, h = 64, bg = '#3f4a24', fg = '#f2c14e') {
  const [c, x] = cnv(w, h); x.fillStyle = bg; x.fillRect(0, 0, w, h); x.strokeStyle = fg; x.lineWidth = h * .08; x.strokeRect(h * .08, h * .08, w - h * .16, h - h * .16);
  x.fillStyle = fg; x.font = `900 ${h * .5}px "Trebuchet MS", sans-serif`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(text, w / 2, h * .54); return ctex(c);
}
export function buildRangerDrone() {
  seedFrom('drone');
  const g = new THREE.Group(), nm = [], sprites = [];
  const hov = grp(g);
  const olive = mat(0x5b6634, { roughness: .55, metalness: .1 }), khaki = mat(0xd2bd82, { roughness: .6 }), dark = mat(0x22261a, { roughness: .5 }), orange = mat(0xff7a1f, { roughness: .45 });
  M(G.sph, olive, .3, .13, .4, 0, 0, 0, hov);
  M(G.sph, khaki, .2, .1, .26, 0, .07, -.03, hov);
  M(G.box, orange, .62, .03, .08, 0, .01, .12, hov);
  const badge = new THREE.CanvasTexture((() => { const [c, x] = cnv(128, 128); x.fillStyle = '#d2bd82'; x.fillRect(0, 0, 128, 128); rangerBadge(x, 64, 64, 54); return c; })()); badge.colorSpace = THREE.SRGBColorSpace;
  noSh(M(new THREE.PlaneGeometry(.22, .22).rotateX(-PI / 2), new THREE.MeshStandardMaterial({ map: badge, roughness: .6 }), 1, 1, 1, 0, .172, -.04, hov));
  const plate = rangerTextTex('RANGER', 256, 64);
  for (const s of [-1, 1]) { const p = noSh(M(new THREE.PlaneGeometry(.36, .09), new THREE.MeshStandardMaterial({ map: plate, roughness: .6 }), 1, 1, 1, s * .262, .02, 0, hov)); p.rotation.y = s * PI / 2; p.rotation.z = 0; }
  const rotors = [];
  for (const [sx, sz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
    seg(G.cylLo, olive, V(sx * .12, 0, sz * .14), V(sx * .46, .03, sz * .46), .035, hov);
    M(G.cyl, dark, .06, .1, .06, sx * .46, .06, sz * .46, hov);
    M(G.torus, orange, .25, .25, .5, sx * .46, .1, sz * .46, hov).rotation.x = PI / 2;
    const r = grp(hov, sx * .46, .12, sz * .46); r.userData.dir = sx * sz;
    M(G.box, dark, .44, .008, .045, 0, 0, 0, r); M(G.box, dark, .045, .008, .44, 0, 0, 0, r);
    keep(noSh(M(new THREE.CircleGeometry(.23, 20).rotateX(-PI / 2), new THREE.MeshBasicMaterial({ color: 0x222222, transparent: true, opacity: .18, depthWrite: false }), 1, 1, 1, 0, 0, 0, r)));
    rotors.push(r);
    M(G.cylLo, dark, .012, .16, .012, sx * .28, -.13, sz * .2, hov);
  }
  for (const s of [-1, 1]) M(G.cylLo, dark, .018, .62, .018, s * .28, -.21, 0, hov).rotation.x = PI / 2;
  // searchlight + eye camera
  M(G.cyl, dark, .1, .1, .1, 0, -.14, .06, hov);
  const lens = ownNeon(0xfff2c0, 2.2); noSh(M(G.cyl, lens, .085, .02, .085, 0, -.2, .06, hov)); nm.push([lens, 2.2, 5]);
  M(G.sph, mat(0x0d0d12, { roughness: .1, metalness: .4 }), .09, .09, .09, 0, -.02, .38, hov);
  const eye = ownNeon(0xff3030, 2.5); const iris = keep(noSh(M(G.sph, eye, .04, .04, .02, 0, -.02, .46, hov)));
  M(G.cylLo, dark, .008, .3, .008, -.08, .3, -.18, hov); noSh(M(G.sph, neon(0xff7a1f, 2), .025, .025, .025, -.08, .45, -.18, hov));
  // nav lights
  const navR = glowSprite(0xff2040, .35), navG = glowSprite(0x30ff70, .35), blinkS = glowSprite(0xffffff, .5);
  navR.position.set(-.46, .02, .46); navG.position.set(.46, .02, .46); blinkS.position.set(0, -.08, -.42); hov.add(navR, navG, blinkS);
  noSh(M(G.sph, neon(0xff2040, 3), .03, .03, .03, -.46, .02, .5, hov)); noSh(M(G.sph, neon(0x30ff70, 3), .03, .03, .03, .46, .02, .5, hov));
  const blinkM = ownNeon(0xffffff, 3); noSh(M(G.sph, blinkM, .035, .035, .035, 0, -.08, -.42, hov));
  sprites.push([navR, .9], [navG, .9]);
  const cone = makeBeam(2.2, 0xfff0c0, .26, 'down'); cone.position.set(0, -.21, .06); hov.add(cone); cone.scale.y = 1;
  const glowDisc = glowSprite(0xfff0c0, .45); glowDisc.position.set(0, -.24, .06); hov.add(glowDisc); sprites.push([glowDisc, .9]);
  return finish(g, {
    nm, sprites, extras: { cone, rotors, body: hov },
    update(dt, t, ctx, night) {
      for (const r of rotors) r.rotation.y += dt * 40 * r.userData.dir;
      hov.position.y = .04 * Math.sin(t * 2.1); hov.rotation.z = .03 * Math.sin(t * 1.3); hov.rotation.x = .025 * Math.sin(t * 1.7);
      const on = (t * 1.6 % 1) < .12; blinkM.emissiveIntensity = on ? 7 : .2; blinkS.material.opacity = on ? .6 + .4 * night : 0;
      iris.position.x = .03 * Math.sin(t * .7);
      setBeam(cone, .25 + .75 * night);
    },
  });
}

// ============================================================ 5. SEARCH TOWER
function flagTex() {
  const [c, x] = cnv(256, 160); x.fillStyle = '#4e5a2a'; x.fillRect(0, 0, 256, 160);
  x.fillStyle = '#d2bd82'; x.fillRect(0, 60, 256, 40); x.fillStyle = '#ff7a1f'; x.fillRect(0, 70, 256, 6); x.fillRect(0, 84, 256, 6);
  rangerBadge(x, 128, 80, 58); return ctex(c);
}
function wavingFlag(parent, w, h, tex, x, y, z) {
  const geo = new THREE.PlaneGeometry(w, h, 12, 4); geo.translate(w / 2, 0, 0);
  const m = keep(noSh(M(geo, new THREE.MeshStandardMaterial({ map: tex, side: THREE.DoubleSide, roughness: .8 }), 1, 1, 1, x, y, z, parent)));
  const base = geo.attributes.position.array.slice();
  return (t) => { const p = geo.attributes.position.array; for (let i = 0; i < p.length; i += 3) { const u = base[i] / w; p[i + 2] = base[i + 2] + u * .22 * w * Math.sin(t * 4.5 - base[i] * 2.4 + base[i + 1] * .6); p[i + 1] = base[i + 1] - u * u * .05 * w; } geo.attributes.position.needsUpdate = true; geo.computeVertexNormals(); };
}
export function buildSearchTower() {
  seedFrom('tower');
  const g = new THREE.Group(), nm = [], sprites = [], strings = [];
  const pipe = mat(0x9aa0a6, { roughness: .35, metalness: .75 }), olive = mat(0x5b6634, { roughness: .6 }), ply = mat(0xc89a5c, { roughness: .85 }), orange = mat(0xff7a1f, { roughness: .5 });
  const B = 1.3, T = 1.0, PH = 7.4; const leg = (sx, sz, y) => V(sx * (B + (T - B) * y / PH), y, sz * (B + (T - B) * y / PH));
  const corners = [[1, 1], [-1, 1], [-1, -1], [1, -1]];
  for (const [sx, sz] of corners) { seg(G.cylLo, pipe, leg(sx, sz, 0), leg(sx, sz, PH + 1.1), .06, g); M(G.box, mat(0x4a4a4a), .35, .06, .35, sx * B, .03, sz * B, g); }
  const levels = [0, 1.85, 3.7, 5.55, PH];
  for (let i = 0; i < 4; i++) {
    const [ax, az] = corners[i], [bx, bz] = corners[(i + 1) % 4];
    for (let l = 0; l < levels.length; l++) { seg(G.cylLo, pipe, leg(ax, az, levels[l] + .3), leg(bx, bz, levels[l] + .3), .04, g); }
    for (let l = 0; l < levels.length - 1; l++) { const y0 = levels[l] + .3, y1 = levels[l + 1] + .3; seg(G.cylLo, l % 2 ? orange : pipe, leg(ax, az, y0), leg(bx, bz, y1), .03, g); }
  }
  // platform, railing, kick boards
  M(G.box, ply, 2.6, .14, 2.6, 0, PH, 0, g);
  for (const [sx, sz] of corners) M(G.cylLo, pipe, .045, 1.1, .045, sx * 1.25, PH + .6, sz * 1.25, g);
  for (const s of [-1, 1]) { M(G.box, olive, 2.56, .07, .07, 0, PH + 1.05, s * 1.25, g); M(G.box, olive, .07, .07, 2.56, s * 1.25, PH + 1.05, 0, g); M(G.box, mat(0xd2bd82, { roughness: .8 }), 2.5, .45, .03, 0, PH + .35, s * 1.27, g); }
  // sign on the railing
  const st = rangerTextTex('RANGER LOOKOUT', 512, 96, '#d2bd82', '#3f4a24');
  keep(M(new THREE.PlaneGeometry(2.3, .42), new THREE.MeshStandardMaterial({ map: st, roughness: .7 }), 1, 1, 1, 0, PH + .37, 1.29, g));
  // ladder up the back
  const lz = -B - .12;
  for (const s of [-1, 1]) seg(G.cylLo, pipe, V(s * .25, 0, lz), V(s * .25, PH + 1, lz + .28), .03, g);
  for (let i = 0; i < 22; i++) { const y = .3 + i * .33; M(G.cylLo, orange, .022, .5, .022, 0, y, lz + .28 * y / (PH + 1), g).rotation.z = PI / 2; }
  // little shade roof
  for (const [sx, sz] of corners) M(G.cylLo, pipe, .03, 1.2, .03, sx * 1.2, PH + 1.7, sz * 1.2, g);
  const roof = new THREE.ConeGeometry(1.9, .7, 4, 1).rotateY(PI / 4);
  M(roof, mat(0xd2bd82, { roughness: .8, side: THREE.DoubleSide }), 1, 1, 1, 0, PH + 2.6, 0, g);
  for (let i = 0; i < 4; i++) { const a = i / 4 * TAU + PI / 4; const p = new THREE.Shape(); p.moveTo(-.25, 0); p.lineTo(.25, 0); p.lineTo(0, -.3); p.closePath(); }
  // searchlight on the platform
  M(G.cyl, mat(0x2f3320, { roughness: .5 }), .3, .5, .3, 0, PH + .3, 0, g);
  const head = grp(g, 0, PH + .95, 0); head.rotation.order = 'YXZ'; head.name = 'searchHead';
  const yoke = mat(0x3f4a24, { roughness: .5 });
  M(G.cylLo, yoke, .08, .3, .08, 0, -.38, 0, head);
  for (const s of [-1, 1]) M(G.box, yoke, .07, .5, .18, s * .43, -.12, 0, head);
  M(G.box, yoke, .93, .07, .18, 0, -.36, 0, head);
  M(G.cylZ, mat(0x4e5a2a, { roughness: .45, metalness: .3 }), .38, .38, .8, 0, 0, 0, head);
  M(G.cylZ, mat(0x22261a, { roughness: .5 }), .41, .41, .1, 0, 0, .4, head);
  for (let i = 0; i < 4; i++) M(G.cylZ, mat(0x22261a, { roughness: .5 }), .4, .4, .03, 0, 0, -.3 + i * .08, head);
  const lens = ownNeon(0xfff4d0, 2.5); nm.push([lens, 2.5, 6]); noSh(M(G.cylZ, lens, .34, .34, .02, 0, 0, .45, head));
  const beam = makeBeam(3.2, 0xfff2c8, .13, 'z'); beam.position.set(0, 0, .46); head.add(beam);
  const lsp = glowSprite(0xfff2c8, 2.2); lsp.position.set(0, 0, .55); head.add(lsp); sprites.push([lsp, 1]);
  // flag pole + pennant string to a ground stake
  M(G.cylLo, pipe, .035, 3.4, .035, 1.2, PH + 2.1, 1.2, g); noSh(M(G.sph, neon(0xffd23f, 1.4), .07, .07, .07, 1.2, PH + 3.8, 1.2, g));
  const wave = wavingFlag(g, 1.5, .95, flagTex(), 1.22, PH + 3.25, 1.2);
  const pen = []; const pa = V(1.2, PH + 2.0, 1.2), pb = V(6, 0.2, 6); M(G.cylLo, mat(0x6a4a2a), .04, .5, .04, 6, .2, 6, g);
  const pp = sagPts(pa, pb, 16, .6); const tri = new THREE.BufferGeometry(); const P = [], C = [];
  for (let i = 1; i < pp.length - 1; i++) { const a = pp[i], dir = pp[i + 1].clone().sub(a).normalize().multiplyScalar(.3), col = new THREE.Color(FEST[i % FEST.length]); P.push(a.x, a.y, a.z, a.x + dir.x, a.y + dir.y, a.z + dir.z, a.x + dir.x * .5, a.y - .38, a.z + dir.z * .5); for (let k = 0; k < 3; k++) C.push(col.r, col.g, col.b); }
  tri.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); tri.setAttribute('color', new THREE.Float32BufferAttribute(C, 3)); tri.computeVertexNormals();
  keep(noSh(M(tri, new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: .8 }), 1, 1, 1, 0, 0, 0, g)));
  M(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pp), 24, .01, 3), mat(0x222222), 1, 1, 1, 0, 0, 0, g);
  strings.push(lightString(g, chain([V(-1.25, PH + 1.08, 1.25), V(1.25, PH + 1.08, 1.25), V(1.25, PH + 1.08, -1.25), V(-1.25, PH + 1.08, -1.25), V(-1.25, PH + 1.08, 1.25)], 6, .12), [0xffd23f, 0xff7a1f, 0xfff2b0], .05, 3));
  const obs = corners.map(([sx, sz]) => [sx * B, sz * B, .3]);
  return finish(g, {
    nm, sprites, strings, extras: { head, beam, obs, height: PH + 3 },
    update(dt, t, ctx, night) { wave(t); setBeam(beam, .3 + .7 * night); },
  });
}

// ============================================================ 6. RANGER BLIMP
function blimpTex() {
  const W = 1024, H = 1024, [c, x] = cnv(W, H); // x around (0 belly .25 right .5 top .75 left), top = nose
  x.fillStyle = '#d6c088'; x.fillRect(0, 0, W, H);
  x.fillStyle = '#5b6634'; for (const v of [.18, .82]) x.fillRect(0, H * v, W, H * .05);
  x.fillStyle = '#ff7a1f'; x.fillRect(0, 0, W, H * .1); x.fillRect(0, H * .9, W, H * .1);
  x.fillStyle = '#5b6634'; for (let i = 0; i < 8; i++) x.fillRect(i * W / 8 - 3, 0, 6, H);
  // top: big "RANGERS" lettering along the spine
  x.save(); x.translate(W * .5, H * .5); x.rotate(PI / 2); x.font = '900 120px "Trebuchet MS", sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.lineWidth = 16; x.strokeStyle = '#3f4a24'; x.strokeText('RANGERS', 0, 0); x.fillStyle = '#ffe9b0'; x.fillText('RANGERS', 0, 0); x.restore();
  for (const u of [.25, .75]) rangerBadge(x, u * W, H * .27, 60);
  return ctex(c);
}
const LED_MSG = 'PLEASE STAY HYDRATED… JUST KIDDING. HAVE YOU SEEN A BIRD-PERSON?';
function ledTex() {
  const H = 96, [m, mx] = cnv(10, 10); mx.font = '700 64px "Courier New", monospace';
  const msg = '   ★ ' + LED_MSG + '   ★ ' + LED_MSG; const W = 4096;
  const [c, x] = cnv(W, H); x.fillStyle = '#0a0806'; x.fillRect(0, 0, W, H);
  x.font = '900 64px "Courier New", monospace'; x.textBaseline = 'middle'; x.fillStyle = '#ffb21f';
  const tw = x.measureText(msg).width; x.save(); x.scale(W / tw, 1); x.fillText(msg, 0, H / 2 + 3); x.restore();
  // LED dot mask
  x.fillStyle = '#0a0806'; for (let i = 0; i < W; i += 6) x.fillRect(i, 0, 2, H); for (let j = 0; j < H; j += 6) x.fillRect(0, j, W, 2);
  const t = ctex(c, true); t.wrapT = THREE.ClampToEdgeWrapping; return t;
}
export function buildRangerBlimp() {
  seedFrom('blimp');
  const g = new THREE.Group(), nm = [], sprites = [], props = [];
  const L = 11, Rm = 3.4, rAt = (z) => Rm * Math.pow(Math.max(0, 1 - Math.pow(Math.abs(z) / L, 2.2)), .5) * (z < 0 ? 1 - .12 * (-z / L) : 1);
  const prof = []; for (let i = 0; i <= 36; i++) { const z = -L + 2 * L * i / 36; prof.push(new THREE.Vector2(Math.max(rAt(z), .001), z)); }
  const hg = new THREE.LatheGeometry(prof, 40); hg.rotateX(PI / 2);
  const tx = blimpTex(); const hm = new THREE.MeshStandardMaterial({ map: tx, roughness: .55, metalness: .05 });
  keep(M(hg, hm, 1, 1, 1, 0, 0, 0, g));
  // LED band on both flanks, conforming to the hull
  const led = ledTex(); led.repeat.set(.36, 1);
  const ledM = new THREE.MeshStandardMaterial({ map: led, emissiveMap: led, emissive: 0xffffff, emissiveIntensity: 1.1, roughness: .4 }); nm.push([ledM, 1.1, 2.6]);
  const bandW = 12, bandH = 1.3;
  for (const s of [-1, 1]) {
    const geo = new THREE.PlaneGeometry(bandW, bandH, 48, 4); const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) { const lx = p.getX(i), y = p.getY(i) + .2, z = -s * lx; const r = rAt(z) + .04; p.setXYZ(i, s * Math.sqrt(Math.max(0, r * r - y * y)), y, z); }
    geo.computeVertexNormals(); keep(noSh(M(geo, ledM, 1, 1, 1, 0, 0, 0, g)));
    const frame = mat(0x22261a, { roughness: .5 });
    for (const yy of [bandH / 2 + .28, -bandH / 2 + .12]) { const pts = []; for (let k = 0; k <= 24; k++) { const z = -bandW / 2 + bandW * k / 24, r = rAt(z) + .06; pts.push(V(s * Math.sqrt(r * r - yy * yy), yy, z)); } M(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, .06, 4), frame, 1, 1, 1, 0, 0, 0, g); }
  }
  // fins
  const fs = new THREE.Shape(); fs.moveTo(0, 0); fs.lineTo(3.4, 0); fs.lineTo(4.2, 2.4); fs.lineTo(2.6, 2.6); fs.quadraticCurveTo(1, 1.2, 0, .9); fs.closePath();
  const fgeo = new THREE.ExtrudeGeometry(fs, { depth: .14, bevelEnabled: true, bevelThickness: .04, bevelSize: .04, bevelSegments: 1 }); fgeo.translate(0, 0, -.07); fgeo.rotateY(-PI / 2);
  const finM = mat(0x5b6634, { roughness: .55 }), finEdge = neon(0xff7a1f, 1.6);
  for (let i = 0; i < 4; i++) { const a = i / 4 * TAU; const f = grp(g, 0, 0, -L + 3.6); f.rotation.z = a; M(fgeo, finM, 1, 1, 1, 0, rAt(-L + 3) - .5, 0, f); seg(G.cylLo, finEdge, V(0, rAt(-L + 3) - .5 + 2.6, -2.6), V(0, rAt(-L + 3) - .5 + 2.4, -4.2), .05, f); }
  // gondola
  const gy = -Rm - .45;
  M(G.box, mat(0x3f4a24, { roughness: .5 }), 1.8, 1.1, 4.4, 0, gy, 1.0, g);
  M(G.sph, mat(0x3f4a24, { roughness: .5 }), .9, .55, .9, 0, gy, 3.2, g);
  M(G.box, mat(0xd2bd82), 1.84, .12, 4.44, 0, gy + .3, 1.0, g);
  const win = ownNeon(0xffd98a, .3); nm.push([win, .3, 2.4]);
  for (const s of [-1, 1]) for (let i = 0; i < 4; i++) noSh(M(G.box, win, .03, .4, .55, s * .91, gy + .05, -.4 + i * .95, g));
  noSh(M(G.sph, mat(0x16324f, { roughness: .08, metalness: .6 }), .78, .38, .5, 0, gy + .1, 3.55, g));
  for (const s of [-1, 1]) {
    seg(G.cylLo, mat(0x22261a), V(s * .9, gy, -.6), V(s * 2.0, gy + .1, -.6), .06, g);
    M(G.cylZ, mat(0xd2bd82, { roughness: .45 }), .32, .32, 1.1, s * 2.1, gy + .1, -.6, g);
    M(G.torus, mat(0xff7a1f), .62, .62, .8, s * 2.1, gy + .1, -1.25, g);
    const pr = grp(g, s * 2.1, gy + .1, -1.25); props.push(pr);
    for (let b = 0; b < 3; b++) { const bl = M(G.box, mat(0x22261a), .1, .55, .03, 0, .3, 0, pr); bl.position.set(Math.sin(b / 3 * TAU) * .3, Math.cos(b / 3 * TAU) * .3, 0); bl.rotation.z = -b / 3 * TAU; }
  }
  // googly eyes on the nose
  for (const s of [-1, 1]) {
    const z = L - 2.4, r = rAt(z) * .97, ph = .95; const e = grp(g, s * Math.sin(ph) * r, Math.cos(ph) * r, z); e.quaternion.setFromUnitVectors(V(0, 0, 1), V(s * Math.sin(ph), Math.cos(ph), .7).normalize());
    M(G.sph, mat(0xffffff, { roughness: .2 }), .62, .62, .2, 0, 0, 0, e); const pu = keep(M(G.sph, mat(0x111018, { roughness: .1 }), .3, .3, .1, 0, -.1, .14, e)); e.userData.pu = pu; props.push(e);
  }
  // spotlight under the gondola
  const head = grp(g, 0, gy - .7, 2.0); head.rotation.order = 'YXZ'; head.rotation.x = 1.15;
  M(G.cylLo, mat(0x22261a), .06, .4, .06, 0, .35, -.0, head).rotation.x = -1.15;
  M(G.cylZ, mat(0x4e5a2a, { roughness: .45, metalness: .3 }), .28, .28, .55, 0, 0, 0, head);
  const lens = ownNeon(0xfff4d0, 2.5); nm.push([lens, 2.5, 6]); noSh(M(G.cylZ, lens, .25, .25, .02, 0, 0, .29, head));
  const beam = makeBeam(4.5, 0xfff2c8, .13, 'z'); beam.position.set(0, 0, .3); head.add(beam);
  const lsp = glowSprite(0xfff2c8, 2); lsp.position.set(0, 0, .4); head.add(lsp); sprites.push([lsp, 1]);
  // nav lights
  const nr = glowSprite(0xff2040, 2.5), ng = glowSprite(0x30ff70, 2.5), tail = glowSprite(0xffffff, 3);
  nr.position.set(-Rm - .1, 0, 1); ng.position.set(Rm + .1, 0, 1); tail.position.set(0, 0, -L - .2); g.add(nr, ng, tail); sprites.push([nr, .9], [ng, .9]);
  return finish(g, {
    nm, sprites, extras: { beam, head, led, length: 2 * L },
    update(dt, t, ctx, night) {
      led.offset.x = (led.offset.x + dt * .045) % 1;
      for (const p of props) if (p.userData.pu) { p.userData.pu.position.x = .12 * Math.sin(t * 1.7 + p.position.x); p.userData.pu.position.y = -.1 + .06 * Math.cos(t * 2.3); } else p.rotation.z += dt * 20;
      tail.material.opacity = (t * 1.1 % 1) < .1 ? 1 : 0;
      setBeam(beam, .3 + .7 * night);
    },
  });
}

// ============================================================ 7. LAUNCH PAD
function padTex() {
  const S = 512, [c, x] = cnv(S, S), cx = S / 2;
  x.fillStyle = '#1b1530'; x.fillRect(0, 0, S, S);
  for (let i = 7; i >= 0; i--) { x.fillStyle = i % 2 ? '#2a1f4a' : '#3a2a66'; x.beginPath(); x.arc(cx, cx, 30 + i * 30, 0, TAU); x.fill(); }
  // sun rays
  for (let i = 0; i < 24; i++) { const a = i / 24 * TAU; x.fillStyle = i % 2 ? 'rgba(255,61,127,.55)' : 'rgba(46,196,255,.55)'; x.beginPath(); x.moveTo(cx + Math.cos(a) * 60, cx + Math.sin(a) * 60); x.lineTo(cx + Math.cos(a + .1) * 250, cx + Math.sin(a + .1) * 250); x.lineTo(cx + Math.cos(a - .1) * 250, cx + Math.sin(a - .1) * 250); x.fill(); }
  // chevrons pointing inward / up
  for (let i = 0; i < 8; i++) { x.save(); x.translate(cx, cx); x.rotate(i / 8 * TAU); x.fillStyle = '#ffd23f'; x.beginPath(); x.moveTo(-26, -200); x.lineTo(0, -168); x.lineTo(26, -200); x.lineTo(26, -186); x.lineTo(0, -154); x.lineTo(-26, -186); x.fill(); x.restore(); }
  x.fillStyle = '#ffd23f'; x.beginPath(); x.arc(cx, cx, 58, 0, TAU); x.fill();
  x.fillStyle = '#1b1530'; x.font = '900 30px "Trebuchet MS", sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('LAUNCH', cx, cx + 2);
  x.strokeStyle = '#ffd23f'; x.lineWidth = 6; x.beginPath(); x.arc(cx, cx, 246, 0, TAU); x.stroke();
  return ctex(c);
}
export function buildLaunchPad() {
  seedFrom('pad');
  const g = new THREE.Group(), nm = [], sprites = [];
  const radius = 2.6;
  M(G.cyl, mat(0x2a2240, { roughness: .4, metalness: .5 }), radius + .15, .3, radius + .15, 0, .15, 0, g);
  M(new THREE.CylinderGeometry(radius + .5, radius + .7, .12, 32), mat(0x3a3050, { roughness: .6 }), 1, 1, 1, 0, .06, 0, g);
  const pt = padTex(); const topM = new THREE.MeshStandardMaterial({ map: pt, emissiveMap: pt, emissive: 0xffffff, emissiveIntensity: .25, roughness: .5 }); nm.push([topM, .25, 1.4]);
  keep(M(new THREE.CircleGeometry(radius, 48).rotateX(-PI / 2), topM, 1, 1, 1, 0, .305, 0, g));
  const rings = [ownNeon(0xff3d7f, 2), ownNeon(0x2ec4ff, 2), ownNeon(0xffd23f, 2)];
  rings.forEach((m, i) => { const r = keep(noSh(M(new THREE.TorusGeometry(1, .035, 6, 64), m, radius - .02 - i * .02, radius - .02 - i * .02, 1, 0, .32 + i * .01, 0, g))); r.rotation.x = PI / 2; r.scale.set(radius * (1 - i * .27), radius * (1 - i * .27), 1); });
  noSh(M(new THREE.TorusGeometry(1, .06, 6, 64), neon(0xb15cff, 2.2), radius + .15, radius + .15, 1, 0, .3, 0, g)).rotation.x = PI / 2;
  // 4 pylons with glowing caps
  for (let i = 0; i < 4; i++) { const a = i / 4 * TAU + PI / 4, x = Math.sin(a) * (radius + .35), z = Math.cos(a) * (radius + .35); M(G.cylLo, mat(0x2a2240, { metalness: .5, roughness: .4 }), .12, 1.1, .12, x, .55, z, g); noSh(M(G.oct, neon(FEST[i], 2.4), .16, .25, .16, x, 1.25, z, g)); }
  // updraft column
  const ct = (() => { const [c, x] = cnv(64, 256); for (let i = 0; i < 18; i++) { const xx = rnd() * 64, y = rnd() * 256, h = 30 + rnd() * 80; const gr = x.createLinearGradient(0, y, 0, y + h); gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(.5, 'rgba(255,255,255,.9)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = gr; x.fillRect(xx, y, 3 + rnd() * 3, h); } const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(4, 1); return t; })();
  const colGeo = new THREE.CylinderGeometry(radius * .7, radius * .9, 9, 32, 1, true); colGeo.translate(0, 4.8, 0);
  { const uv = colGeo.attributes.uv; } // v along height
  const colM = new THREE.MeshBasicMaterial({ color: 0x5ad8ff, map: ct, alphaMap: beamTex(), transparent: true, opacity: .55, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const colMesh = keep(noSh(M(colGeo, colM, 1, 1, 1, 0, 0, 0, g))); colMesh.receiveShadow = false;
  // alphaMap gradient is bright at top; flip so it fades with height
  const fade = (() => { const [c, x] = cnv(8, 128); const gr = x.createLinearGradient(0, 0, 0, 128); gr.addColorStop(0, '#000'); gr.addColorStop(1, '#fff'); x.fillStyle = gr; x.fillRect(0, 0, 8, 128); return new THREE.CanvasTexture(c); })(); colM.alphaMap = fade;
  // rising rings
  const rr = []; for (let i = 0; i < 5; i++) { const m = new THREE.MeshBasicMaterial({ color: new THREE.Color(FEST[i]).multiplyScalar(2.2), transparent: true, opacity: .8, blending: THREE.AdditiveBlending, depthWrite: false }); const r = keep(noSh(M(new THREE.TorusGeometry(1, .05, 6, 48), m, 1, 1, 1, 0, 0, 0, g))); r.rotation.x = PI / 2; rr.push({ r, m, ph: i / 5 }); }
  // spiral sparks
  const NP = 70, pg = new THREE.BufferGeometry(), pp = new Float32Array(NP * 3), pc = new Float32Array(NP * 3); const pdat = [];
  for (let i = 0; i < NP; i++) { pdat.push({ ph: rnd(), a: rnd() * TAU, r: .5 + rnd() * 1.6, sp: .5 + rnd() * .6 }); const c = new THREE.Color(pick(FEST)).multiplyScalar(2); pc.set([c.r, c.g, c.b], i * 3); }
  pg.setAttribute('position', new THREE.BufferAttribute(pp, 3)); pg.setAttribute('color', new THREE.BufferAttribute(pc, 3));
  const pts = new THREE.Points(pg, new THREE.PointsMaterial({ size: .32, map: A().glowMap, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true })); pts.frustumCulled = false; g.add(pts);
  // floating up-chevrons
  const chev = grp(g, 0, 2.2, 0); const chs = new THREE.Shape(); chs.moveTo(-.6, 0); chs.lineTo(0, .5); chs.lineTo(.6, 0); chs.lineTo(.6, -.22); chs.lineTo(0, .28); chs.lineTo(-.6, -.22); chs.closePath();
  const chGeo = new THREE.ExtrudeGeometry(chs, { depth: .08, bevelEnabled: false }); chGeo.translate(0, 0, -.04);
  const chM = [ownNeon(0xffd23f, 2), ownNeon(0xff6b2b, 2), ownNeon(0xff3d7f, 2)];
  const chv = []; for (let i = 0; i < 3; i++) { const c = keep(noSh(M(chGeo, chM[i], 1, 1, 1, 0, i * .55, 0, chev))); chv.push(c); const c2 = keep(noSh(M(chGeo, chM[i], 1, 1, 1, 0, i * .55, 0, chev))); c2.rotation.y = PI / 2; }
  const sp = glowSprite(0x5ad8ff, 7); sp.position.set(0, 1, 0); g.add(sp); sprites.push([sp, .6]);
  return finish(g, {
    nm, sprites, extras: { obs: [], radius, column: colMesh },
    update(dt, t, ctx, night) {
      ct.offset.y = (ct.offset.y - dt * .9) % 1;
      rings.forEach((m, i) => { m.emissiveIntensity = (1.2 + 1.6 * night) * (.6 + .4 * Math.sin(t * 4 - i * 1.2)); });
      for (const o of rr) { const u = (t * .35 + o.ph) % 1; o.r.position.y = .4 + u * 8; const s = radius * (1 - .45 * u); o.r.scale.set(s, s, 1); o.m.opacity = (1 - u) * Math.min(1, u * 6) * (.45 + .45 * night); }
      for (let i = 0; i < NP; i++) { const d = pdat[i], u = (t * .25 * d.sp + d.ph) % 1, a = d.a + u * 7, r = d.r * (1 - .5 * u); pp[i * 3] = Math.cos(a) * r; pp[i * 3 + 1] = .35 + u * 8; pp[i * 3 + 2] = Math.sin(a) * r; }
      pg.attributes.position.needsUpdate = true; pts.material.opacity = .5 + .5 * night;
      chev.position.y = 2.0 + .25 * Math.sin(t * 2.5); chev.rotation.y = t * .8;
      chv.forEach((c, i) => { chM[i].emissiveIntensity = (1.4 + 1.4 * night) * (.5 + .5 * Math.max(0, Math.sin(t * 5 - i * 1.4))); });
      colM.opacity = .25 + .35 * night;
    },
  });
}

// ============================================================ 8. COSTUME RACK
function furTex(base, spots) {
  const [c, x] = cnv(128, 128); x.fillStyle = base; x.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 900; i++) { const v = rnd(); x.strokeStyle = v < .5 ? 'rgba(255,255,255,.18)' : 'rgba(0,0,0,.14)'; x.lineWidth = 1.2; x.beginPath(); const xx = rnd() * 128, y = rnd() * 128; x.moveTo(xx, y); x.lineTo(xx + (rnd() - .5) * 4, y + 4 + rnd() * 5); x.stroke(); }
  if (spots) for (let i = 0; i < 26; i++) { const xx = rnd() * 128, y = rnd() * 128, r = 4 + rnd() * 5; x.fillStyle = spots[0]; x.beginPath(); x.ellipse(xx, y, r, r * .8, rnd() * 3, 0, TAU); x.fill(); x.fillStyle = spots[1]; x.beginPath(); x.ellipse(xx, y, r * .5, r * .4, 0, 0, TAU); x.fill(); }
  return ctex(c, true);
}
function mirrorTex() {
  const [c, x] = cnv(128, 256); const gr = x.createLinearGradient(0, 0, 0, 256); gr.addColorStop(0, '#9fd8ff'); gr.addColorStop(.55, '#e8f6ff'); gr.addColorStop(.6, '#e8c890'); gr.addColorStop(1, '#c79a63'); x.fillStyle = gr; x.fillRect(0, 0, 128, 256);
  x.fillStyle = 'rgba(255,255,255,.65)'; x.save(); x.rotate(-.5); x.fillRect(-10, 90, 200, 10); x.fillRect(-10, 112, 200, 4); x.restore(); return ctex(c);
}
function coat(parent, x, tex, col, len = 1.05) {
  const m = new THREE.MeshStandardMaterial({ map: tex, color: col || 0xffffff, roughness: .95 });
  const c = grp(parent, x, 0, 0);
  M(G.box, mat(0x222222), .04, .15, .02, 0, -.06, 0, c);
  M(G.cylLo, mat(0x9a9a9a, { metalness: .7, roughness: .3 }), .012, .44, .012, 0, -.15, 0, c).rotation.z = PI / 2;
  const prof = [[.001, 0], [.12, -.01], [.22, -.05], [.27, -.13], [.28, -.3], [.31, -len * .7], [.35, -len], [.001, -len]].map(([r, y]) => new THREE.Vector2(r, y));
  M(new THREE.LatheGeometry(prof, 14), m, 1, 1, .45, 0, -.15, 0, c);
  M(G.torusFat, new THREE.MeshStandardMaterial({ map: tex, color: 0xdddddd, roughness: 1 }), .15, .09, .3, 0, -.2, .04, c).rotation.x = PI / 2 - .3;
  for (const s of [-1, 1]) { const sl = M(new THREE.CylinderGeometry(.08, .1, len * .8, 6), m, 1, 1, 1, s * .27, -.2 - len * .4, 0, c); sl.rotation.z = s * .12; }
  return c;
}
export function buildCostumeRack() {
  seedFrom('rack');
  const g = new THREE.Group(), nm = [], strings = [];
  const pipe = mat(0xffc93c, { roughness: .3, metalness: .7 }), dark = mat(0x2a0e5c, { roughness: .5 });
  const RW = 3.0, RH = 1.9;
  for (const s of [-1, 1]) { M(G.cyl, pipe, .035, RH, .035, s * RW / 2, RH / 2, 0, g); M(G.cyl, pipe, .03, .8, .03, s * RW / 2, .03, 0, g).rotation.x = PI / 2; for (const z of [-.4, .4]) M(G.sph, dark, .06, .06, .06, s * RW / 2, .06, z, g); }
  M(G.cyl, pipe, .03, RW, .03, 0, RH, 0, g).rotation.z = PI / 2;
  // garments
  const items = [
    () => coat(g, 0, furTex('#ff5fb4'), 0xffffff), () => coat(g, 0, furTex('#e8c27a', ['#3a2410', '#c08a40']), 0xffffff, 1.15), () => coat(g, 0, furTex('#2ee6d6'), 0xffffff),
    () => coat(g, 0, furTex('#ffffff'), 0xffffff, 1.2), () => coat(g, 0, furTex('#b15cff'), 0xffffff, .95), () => coat(g, 0, furTex('#ffd23f'), 0xffffff, 1.0),
  ];
  const xs = [-1.25, -.85, -.42, .05, .55, 1.0];
  const hung = [];
  xs.forEach((x, i) => { const c = items[i](); c.position.set(x, RH, (i % 2) * .04); c.rotation.y = (rnd() - .5) * .3; hung.push(c); });
  // tutus on hangers
  const tuM = [0xff9ad5, 0x7dfcff, 0xfff05a].map(c => new THREE.MeshStandardMaterial({ color: c, roughness: .9, transparent: true, opacity: .85, side: THREE.DoubleSide }));
  [-1.05, .3, 1.25].forEach((x, i) => {
    const t = grp(g, x, RH, .16); M(G.box, mat(0x222222), .03, .12, .02, 0, -.06, 0, t);
    M(G.cylLo, tuM[i], .13, .25, .08, 0, -.3, 0, t);
    for (let k = 0; k < 3; k++) M(new THREE.CylinderGeometry(.14, .44 - k * .07, .22, 16, 1, true), tuM[(i + k) % 3], 1, 1, 1, 0, -.48 - k * .06, 0, t);
    noSh(M(G.sph, neon(0xffffff, 1.5), .03, .03, .03, 0, -.2, .1, t));
    hung.push(t);
  });
  // hats on the top of each upright + a hat on the sign
  M(G.cyl, mat(0x18141e, { roughness: .6 }), .2, .3, .2, -RW / 2, RH + .2, 0, g); M(G.cyl, mat(0x18141e, { roughness: .6 }), .32, .03, .32, -RW / 2, RH + .05, 0, g); M(G.cyl, mat(0xff3d7f), .205, .05, .205, -RW / 2, RH + .1, 0, g);
  M(G.sph, mat(0xff5fb4, { roughness: .7 }), .17, .12, .2, RW / 2, RH + .1, 0, g); M(G.cyl, mat(0xff5fb4, { roughness: .7 }), .38, .03, .3, RW / 2, RH + .03, 0, g);
  for (let i = 0; i < 8; i++) { const a = i / 8 * TAU; M(G.sphLo, mat(FEST[i % FEST.length]), .045, .045, .045, RW / 2 + Math.sin(a) * .3, RH + .06, Math.cos(a) * .24, g); }
  // sign
  const sign = signTex(['FREE CLOSET'], 512, 128, { bg: '#ff3d7f', border: '#ffd23f', cols: ['#fff36e', '#7dfcff', '#ffffff', '#b8ff6b'] });
  const signM = new THREE.MeshStandardMaterial({ map: sign, emissiveMap: sign, emissive: 0xffffff, emissiveIntensity: 0, roughness: .8 }); nm.push([signM, 0, .7]);
  for (const s of [-1, 1]) M(G.cylLo, pipe, .02, .6, .02, s * 1.0, RH + .3, 0, g);
  M(G.box, mat(0x8a4a2a), 2.2, .55, .05, 0, RH + .62, 0, g);
  keep(M(new THREE.PlaneGeometry(2.1, .5), signM, 1, 1, 1, 0, RH + .62, .03, g)); keep(M(new THREE.PlaneGeometry(2.1, .5).rotateY(PI), signM, 1, 1, 1, 0, RH + .62, -.03, g));
  strings.push(lightString(g, sagPts(V(-1.1, RH + .9, .04), V(1.1, RH + .9, .04), 10, .1), FEST, .04, 3));
  // standing mirror
  const mir = grp(g, 2.05, 0, .1); mir.rotation.y = -.5;
  M(G.torus, mat(0xffc93c, { roughness: .25, metalness: .8 }), .36, .72, 1.4, 0, 1.05, 0, mir);
  M(new THREE.CircleGeometry(1, 28), new THREE.MeshStandardMaterial({ map: mirrorTex(), roughness: .05, metalness: .3, emissive: 0x6688aa, emissiveIntensity: .1 }), .35, .7, 1, 0, 1.05, .02, mir);
  for (const s of [-1, 1]) seg(G.cylLo, mat(0xffc93c, { metalness: .8, roughness: .25 }), V(s * .3, 0, -.2), V(s * .36, 1.05, 0), .025, mir);
  for (let i = 0; i < 9; i++) { const a = PI * .15 + i / 8 * PI * .7; M(G.sphLo, mat(FEST[i % FEST.length]), .05, .05, .05, Math.cos(a) * .37, 1.05 + Math.sin(a) * .74, .03, mir); }
  // crate with feather boas
  M(G.box, mat(0xb07a45, { roughness: .9 }), .7, .4, .5, -2.05, .2, .2, g);
  const boa = (col, y, ph) => M(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([V(-2.35, y, .2), V(-2.1, y + .15, .35), V(-1.9, y + .05, .05), V(-1.7, .1, .55)].map(p => p.add(V(0, 0, ph)))), 16, .08, 6), new THREE.MeshStandardMaterial({ map: furTex(col), roughness: 1 }), 1, 1, 1, 0, 0, 0, g);
  boa('#ff5fb4', .42, 0); boa('#7dfcff', .45, -.1); boa('#ffd23f', .4, .1);
  const obs = [[-1.0, 0, .55], [0, 0, .55], [1.0, 0, .55], [2.05, .1, .4], [-2.05, .2, .45]];
  return finish(g, {
    nm, strings, extras: { obs },
    update(dt, t) { hung.forEach((h, i) => { h.rotation.z = .025 * Math.sin(t * 1.3 + i * 1.7); }); },
  });
}

// ============================================================ 9. RANGER OUTPOST
function shadeTex() {
  const [c, x] = cnv(256, 256); x.fillStyle = '#d6c088'; x.fillRect(0, 0, 256, 256);
  x.fillStyle = '#5b6634'; for (let i = 0; i < 8; i += 2) x.fillRect(i * 32, 0, 32, 256);
  return ctex(c);
}
function campChair(parent, x, z, ry, col) {
  const c = grp(parent, x, 0, z); c.rotation.y = ry;
  const fr = mat(0x2a2a2a, { roughness: .4, metalness: .6 }), fab = mat(col, { roughness: .85, side: THREE.DoubleSide });
  for (const s of [-1, 1]) { seg(G.cylLo, fr, V(s * .28, 0, .28), V(s * .28, .9, -.28), .018, c); seg(G.cylLo, fr, V(s * .28, 0, -.28), V(s * .28, .5, .28), .018, c); M(G.cylLo, fr, .018, .3, .018, s * .3, .62, 0, c).rotation.x = PI / 2; }
  M(G.box, fab, .56, .03, .5, 0, .45, 0, c).rotation.x = -.1; M(G.box, fab, .56, .5, .03, 0, .72, -.28, c).rotation.x = -.25;
  M(G.cyl, mat(0x2ec4ff), .04, .14, .04, .32, .65, .05, c);
  return c;
}
export function buildRangerOutpost() {
  seedFrom('outpost');
  const g = new THREE.Group(), nm = [], sprites = [], strings = [];
  const pole = mat(0x9aa0a6, { roughness: .35, metalness: .75 }), olive = mat(0x5b6634, { roughness: .6 }), khaki = mat(0xd6c088, { roughness: .8 });
  const PX = 2.6, PZ = 2.0, PH = 2.9;
  for (const [sx, sz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) { M(G.cylLo, pole, .06, PH + (sz < 0 ? .3 : 0), .06, sx * PX, (PH + (sz < 0 ? .3 : 0)) / 2, sz * PZ, g); seg(G.cylLo, mat(0xdddddd), V(sx * PX, PH, sz * PZ), V(sx * (PX + .9), 0, sz * (PZ + .9)), .008, g); M(G.cone, mat(0xff7a1f), .05, .2, .05, sx * (PX + .9), .08, sz * (PZ + .9), g); }
  // sagging shade cloth
  const sg = new THREE.PlaneGeometry(PX * 2 + .3, PZ * 2 + .3, 12, 10); sg.rotateX(-PI / 2); const sp = sg.attributes.position;
  for (let i = 0; i < sp.count; i++) { const x = sp.getX(i), z = sp.getZ(i); const u = x / (PX + .15), v = z / (PZ + .15); sp.setY(i, PH + .15 - z * .075 - .22 * (1 - u * u) * (1 - v * v)); }
  sg.computeVertexNormals(); const st = shadeTex(); st.wrapS = st.wrapT = THREE.RepeatWrapping; st.repeat.set(2, 1);
  M(sg, new THREE.MeshStandardMaterial({ map: st, side: THREE.DoubleSide, roughness: .9 }), 1, 1, 1, 0, 0, 0, g);
  // scalloped valance along the front
  const vs = []; for (let i = 0; i < 14; i++) { const x = -PX - .1 + (i + .5) * (PX * 2 + .2) / 14; vs.push([new THREE.CircleGeometry(.2, 10, PI, PI), mtx(x, PH, PZ + .16)]); }
  M(mergeList(vs), mat(0xff7a1f, { side: THREE.DoubleSide, roughness: .8 }), 1, 1, 1, 0, 0, 0, g);
  strings.push(lightString(g, sagPts(V(-PX, PH - .05, PZ), V(PX, PH - .05, PZ), 16, .25), [0xfff2b0, 0xffd23f, 0xff7a1f], .05, 3.2));
  strings.push(lightString(g, sagPts(V(-PX, PH + .2, -PZ), V(-PX, PH - .05, PZ), 12, .2), [0xfff2b0, 0xffd23f], .05, 3.2));
  // desk with a skirt, radio, logbook, water jug, lantern
  const dz = -.4;
  M(G.box, mat(0xeae4d4, { roughness: .6 }), 2.0, .05, .8, 0, .76, dz, g);
  const skirt = (() => { const [c, x] = cnv(512, 160); x.fillStyle = '#5b6634'; x.fillRect(0, 0, 512, 160); x.fillStyle = '#ff7a1f'; x.fillRect(0, 0, 512, 10); rangerBadge(x, 80, 82, 55); x.fillStyle = '#f2c14e'; x.font = '900 46px "Trebuchet MS", sans-serif'; x.textBaseline = 'middle'; x.fillText('ASK A RANGER', 150, 84); return ctex(c); })();
  keep(M(new THREE.PlaneGeometry(2.0, .7), new THREE.MeshStandardMaterial({ map: skirt, roughness: .85 }), 1, 1, 1, 0, .4, dz + .41, g));
  for (const s of [-1, 1]) M(G.box, olive, .03, .7, .78, s * .99, .4, dz, g);
  M(G.box, mat(0x22261a, { roughness: .5 }), .35, .2, .18, -.55, .89, dz - .1, g); M(G.cylLo, mat(0x111111), .01, .45, .01, -.43, 1.15, dz - .15, g);
  const radioLed = ownNeon(0x30ff70, 2); noSh(M(G.box, radioLed, .04, .04, .01, -.62, .92, dz - .005, g));
  M(G.box, mat(0x2f6fb6), .32, .03, .24, .15, .8, dz + .05, g).rotation.y = .2; M(G.box, mat(0xffffff), .3, .032, .22, .15, .8, dz + .05, g).rotation.y = .2;
  M(G.cyl, mat(0x2ec4ff, { transparent: true, opacity: .75, roughness: .2 }), .14, .4, .14, .65, .99, dz - .15, g); M(G.cyl, mat(0x1d5fa8), .06, .06, .06, .65, 1.22, dz - .15, g);
  const lan = ownNeon(0xffc46a, .4); nm.push([lan, .4, 3]); M(G.cyl, mat(0x222222, { metalness: .6, roughness: .4 }), .08, .03, .08, .9, .8, dz + .2, g); noSh(M(G.cyl, lan, .07, .18, .07, .9, .9, dz + .2, g)); M(G.torus, mat(0x222222), .05, .05, 1, .9, 1.04, dz + .2, g);
  const lanSp = glowSprite(0xffc46a, 2.5); lanSp.position.set(.9, .95, dz + .2); g.add(lanSp); sprites.push([lanSp, .8]);
  // chairs, cooler, first-aid box
  campChair(g, -.4, dz - .85, PI + .2, 0x5b6634); campChair(g, 1.7, .9, -.9, 0xff7a1f);
  M(G.box, mat(0x2ec4ff, { roughness: .4 }), .7, .4, .4, -1.75, .2, -.9, g); M(G.box, mat(0xffffff, { roughness: .4 }), .72, .07, .42, -1.75, .43, -.9, g);
  M(G.box, mat(0x3f7d3a, { roughness: .6 }), .5, .35, .35, -1.8, .18, .5, g); M(G.box, mat(0xffffff), .3, .08, .36, -1.8, .2, .5, g); M(G.box, mat(0xffffff), .08, .25, .36, -1.8, .2, .5, g);
  // antenna mast with guy wires, dish and a blinking beacon
  const ax = 3.4, az = -1.8, AH = 7.2;
  M(G.cylLo, pole, .05, AH, .05, ax, AH / 2, az, g); for (let i = 0; i < 6; i++) M(G.box, olive, .18, .03, .18, ax, 1 + i * 1.05, az, g);
  for (let i = 0; i < 3; i++) { const a = i / 3 * TAU + .4; seg(G.cylLo, mat(0xdddddd), V(ax, AH * .75, az), V(ax + Math.sin(a) * 2.4, 0, az + Math.cos(a) * 2.4), .006, g); }
  const dish = M(new THREE.ConeGeometry(.42, .16, 16, 1, true), mat(0xeeeeee, { side: THREE.DoubleSide, roughness: .4 }), 1, 1, 1, ax, AH * .7, az + .25, g); dish.rotation.x = -PI / 2 + .4; M(G.cylLo, mat(0x222222), .015, .35, .015, ax, AH * .7 + .06, az + .4, g).rotation.x = -PI / 2 + .4;
  M(G.cylLo, mat(0x111111), .015, 1.6, .015, ax, AH + .8, az, g);
  const beaconM = ownNeon(0xff2030, 2); noSh(M(G.sph, beaconM, .08, .08, .08, ax, AH + 1.62, az, g));
  const beacon = glowSprite(0xff2030, 2); beacon.position.set(ax, AH + 1.62, az); g.add(beacon);
  // flag
  M(G.cylLo, pole, .03, 2.0, .03, -PX, PH + 1.0, -PZ, g); const wave = wavingFlag(g, 1.1, .7, flagTex(), -PX + .02, PH + 1.65, -PZ);
  // sign out front on two posts
  const sgn = signTex(['RANGER', 'OUTPOST'], 512, 256, { bg: '#5b6634', border: '#ff7a1f', cols: ['#f2c14e', '#ffe9b0'] });
  const sgM = new THREE.MeshStandardMaterial({ map: sgn, emissiveMap: sgn, emissive: 0xffffff, emissiveIntensity: 0, roughness: .8 }); nm.push([sgM, 0, .6]);
  const sx0 = -1.6, sz0 = PZ + 1.4;
  for (const s of [-1, 1]) M(G.box, mat(0x6a4a2a), .1, 1.9, .1, sx0 + s * .7, .95, sz0, g);
  M(G.box, mat(0x6a4a2a), 1.6, .82, .06, sx0, 1.45, sz0 - .04, g); keep(M(new THREE.PlaneGeometry(1.5, .75), sgM, 1, 1, 1, sx0, 1.45, sz0 - .005, g));
  const sgSp = glowSprite(0xffd98a, 2.4); sgSp.position.set(sx0, 2.0, sz0 + .2); g.add(sgSp); sprites.push([sgSp, .5]);
  const obs = [[PX, PZ, .2], [-PX, PZ, .2], [PX, -PZ, .2], [-PX, -PZ, .2], [0, dz, .9], [ax, az, .3], [sx0, sz0, .8], [-1.75, -.9, .4]];
  return finish(g, {
    nm, sprites, strings, extras: { obs, spot: V(.6, 0, 1.0) },
    update(dt, t, ctx, night) {
      wave(t); const on = (t * .8 % 1) < .5; beaconM.emissiveIntensity = on ? 4 : .2; beacon.material.opacity = on ? .3 + .7 * night : 0;
      radioLed.emissiveIntensity = (t * 3 % 1) < .5 ? 2.5 : .3;
    },
  });
}

// ============================================================ 10. WEAPON PICKUP
function mosaicTex(col) {
  const [c, x] = cnv(256, 256); x.fillStyle = '#1b1530'; x.fillRect(0, 0, 256, 256);
  const pal = [hex(col), '#ffd23f', '#ff3d7f', '#2ec4ff', '#ffffff', '#b15cff'];
  for (let j = 0; j < 16; j++) for (let i = 0; i < 16; i++) { if (rnd() < .15) continue; x.fillStyle = (Math.abs(j - 8) + Math.abs((i % 8) - 4)) % 4 === 0 ? pal[0] : pick(pal); x.fillRect(i * 16 + 2, j * 16 + 2, 12, 12); }
  x.fillStyle = hex(col); x.fillRect(0, 0, 256, 12); x.fillRect(0, 244, 256, 12);
  return ctex(c);
}
export function buildWeaponPickup(color = 0x2ec4ff) {
  seedFrom('pickup' + color);
  const g = new THREE.Group(), nm = [], sprites = [];
  const gold = mat(0xffc93c, { roughness: .3, metalness: .7 });
  const mt = mosaicTex(color); const pm = new THREE.MeshStandardMaterial({ map: mt, roughness: .5, emissiveMap: mt, emissive: 0xffffff, emissiveIntensity: .05 }); nm.push([pm, .05, .5]);
  M(new THREE.CylinderGeometry(.62, .7, .14, 6), gold, 1, 1, 1, 0, .07, 0, g);
  M(new THREE.CylinderGeometry(.42, .52, .8, 6), pm, 1, 1, 1, 0, .54, 0, g);
  M(new THREE.CylinderGeometry(.56, .46, .14, 6), gold, 1, 1, 1, 0, 1.0, 0, g);
  const ringM = ownNeon(color, 2.4); noSh(M(new THREE.TorusGeometry(1, .05, 6, 40), ringM, .48, .48, 1, 0, 1.08, 0, g)).rotation.x = PI / 2;
  noSh(M(new THREE.TorusGeometry(1, .04, 6, 6), ringM, .63, .63, 1, 0, .15, 0, g)).rotation.x = PI / 2;
  // light column and halo
  const colM = new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(1.5), map: (() => { const [c, x] = cnv(8, 128); const gr = x.createLinearGradient(0, 0, 0, 128); gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(1, 'rgba(255,255,255,1)'); x.fillStyle = gr; x.fillRect(0, 0, 8, 128); return new THREE.CanvasTexture(c); })(), transparent: true, opacity: .45, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const col = keep(noSh(M(new THREE.CylinderGeometry(.38, .45, 2.2, 20, 1, true), colM, 1, 1, 1, 0, 2.18, 0, g))); col.receiveShadow = false;
  const halo = grp(g, 0, 1.55, 0);
  const haloM = ownNeon(color, 2.6);
  noSh(M(new THREE.TorusGeometry(1, .03, 6, 48), haloM, .62, .62, 1, 0, 0, 0, halo)).rotation.x = PI / 2;
  for (let i = 0; i < 6; i++) { const a = i / 6 * TAU; noSh(M(G.oct, neon(i % 2 ? 0xffd23f : 0xff3d7f, 2.2), .06, .1, .06, Math.cos(a) * .62, 0, Math.sin(a) * .62, halo)); }
  const mount = new THREE.Object3D(); mount.name = 'gunMount'; mount.position.set(0, 1.55, 0); g.add(mount);
  const sp = glowSprite(color, 3.2); sp.position.set(0, 1.5, 0); g.add(sp); sprites.push([sp, .7]);
  const gsp = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 2.6).rotateX(-PI / 2), new THREE.MeshBasicMaterial({ map: A().glowMap, color: new THREE.Color(color), transparent: true, opacity: .5, blending: THREE.AdditiveBlending, depthWrite: false }));
  gsp.position.y = .03; keep(noSh(gsp)); g.add(gsp);
  return finish(g, {
    nm, sprites, extras: { mount, obs: [[0, 0, .6]] },
    update(dt, t, ctx, night) {
      mount.rotation.y += dt * 1.1; mount.position.y = 1.55 + .07 * Math.sin(t * 2);
      halo.rotation.y = -t * .6; halo.rotation.z = .25 * Math.sin(t * .8); halo.position.y = 1.55 + .05 * Math.sin(t * 2 + 1);
      const p = .8 + .2 * Math.sin(t * 3); ringM.emissiveIntensity = (1.4 + 1.6 * night) * p; haloM.emissiveIntensity = 1.5 + 1.5 * night;
      colM.opacity = .18 + .3 * night; gsp.material.opacity = .25 + .45 * night;
    },
  });
}

// ============================================================ 11. CAMP DECOR
export const CAMP_NAMES = [
  'Camp Sparkle Pony Rescue', 'The Lost Sock Embassy', 'Dusty Llama Lounge', 'Camp Snack Attack', 'Glitter & Grit',
  'The Thirsty Cactus', 'Bureau of Unnecessary Hugs', 'Camp Nap Forever', 'The Very Serious Disco', 'Camp Wobbly Yurt',
  'Dept. of Dance Emergencies', 'Pancake Temple', 'Camp Feather Boa Constrictor', 'The Moist Towelette Society',
];
function persianTex(seed) {
  seedFrom('rug' + seed);
  const W = 256, H = 384, [c, x] = cnv(W, H);
  const pals = [['#8e1b2c', '#1d2d5c', '#e8b04a', '#f2e3c6', '#2a7a6a'], ['#1d2d5c', '#b3263a', '#f2c14e', '#efe4cc', '#6a2a6a'], ['#2a5a3a', '#c94f2a', '#f2d36e', '#f6ecd6', '#1d2d5c']];
  const [bg, b2, gold, cream, acc] = pals[seed % pals.length];
  x.fillStyle = bg; x.fillRect(0, 0, W, H);
  const border = (inset, col, w) => { x.strokeStyle = col; x.lineWidth = w; x.strokeRect(inset, inset, W - inset * 2, H - inset * 2); };
  border(8, b2, 14); border(18, gold, 4); border(30, cream, 3);
  for (let i = 0; i < 18; i++) { x.fillStyle = i % 2 ? gold : acc; const y = 26 + i * (H - 52) / 18; for (const xx of [14, W - 14]) { x.beginPath(); x.moveTo(xx, y); x.lineTo(xx + 5, y + 8); x.lineTo(xx, y + 16); x.lineTo(xx - 5, y + 8); x.fill(); } }
  // central medallion
  x.save(); x.translate(W / 2, H / 2);
  for (const [r, col, n] of [[100, b2, 16], [80, gold, 12], [62, acc, 12], [44, cream, 8], [26, bg, 8], [12, gold, 6]]) { x.fillStyle = col; x.beginPath(); for (let i = 0; i < n * 2; i++) { const a = i / (n * 2) * TAU, rr = i % 2 ? r * .82 : r; x.lineTo(Math.cos(a) * rr, Math.sin(a) * rr * 1.3); } x.fill(); }
  x.restore();
  for (const [cx, cy] of [[60, 70], [W - 60, 70], [60, H - 70], [W - 60, H - 70]]) { x.fillStyle = gold; x.beginPath(); x.arc(cx, cy, 22, 0, TAU); x.fill(); x.fillStyle = acc; x.beginPath(); x.arc(cx, cy, 12, 0, TAU); x.fill(); }
  for (let i = 0; i < 900; i++) { x.fillStyle = `rgba(${rnd() < .5 ? '255,255,255' : '0,0,0'},.06)`; x.fillRect(rnd() * W, rnd() * H, 2, 2); }
  return ctex(c);
}
function tapestryTex(seed) {
  seedFrom('tap' + seed);
  const W = 256, H = 384, [c, x] = cnv(W, H);
  const pals = [['#2a0e5c', '#ff3d7f', '#ffd23f', '#2ec4ff', '#ff8a3d'], ['#0d3b4a', '#ffd23f', '#ff5a1f', '#7dfcff', '#ff9ad5'], ['#5a0e2a', '#ffb12e', '#7dff6b', '#ffffff', '#b15cff']];
  const p = pals[seed % pals.length]; x.fillStyle = p[0]; x.fillRect(0, 0, W, H);
  x.save(); x.translate(W / 2, H * .45);
  for (let ring = 7; ring >= 1; ring--) { const n = 6 + ring * 2, r = ring * 16; x.fillStyle = p[1 + ring % 4]; for (let i = 0; i < n; i++) { const a = i / n * TAU; x.save(); x.rotate(a); x.beginPath(); x.ellipse(0, -r, 7 + ring, 16 + ring * 2, 0, 0, TAU); x.fill(); x.restore(); } }
  x.fillStyle = p[2]; x.beginPath(); x.arc(0, 0, 14, 0, TAU); x.fill(); x.restore();
  x.fillStyle = p[3]; for (let i = 0; i < 8; i++) { x.beginPath(); x.moveTo(i * 32, H - 40); x.lineTo(i * 32 + 16, H - 10); x.lineTo(i * 32 + 32, H - 40); x.fill(); }
  x.fillStyle = p[2]; x.fillRect(0, 0, W, 14);
  return ctex(c);
}
export function buildCampDecor(kind = 'couch', opts = {}) {
  const variant = typeof opts === 'number' ? opts : (opts.seed ?? 0);
  seedFrom('decor-' + kind + variant);
  const g = new THREE.Group(), nm = [], sprites = [], strings = []; let obs = [], own = null;
  if (kind === 'couch') {
    const col = pick([0x8e1b5c, 0x1d6f8a, 0xc9a227, 0x5a2a8a, 0xb3263a]);
    const vel = mat(col, { roughness: .95 }), wood = mat(0x4a2a14, { roughness: .6 });
    M(G.box, vel, 2.2, .35, .9, 0, .38, 0, g); M(G.box, vel, 2.2, .7, .25, 0, .75, -.35, g);
    for (const s of [-1, 1]) { M(G.box, vel, .25, .45, .9, s * 1.1, .6, 0, g); M(G.cyl, vel, .14, .9, .14, s * 1.1, .83, 0, g).rotation.x = PI / 2; }
    for (const s of [-1, 1]) M(G.box, mat(new THREE.Color(col).multiplyScalar(1.25).getHex(), { roughness: .95 }), 1.0, .15, .75, s * .51, .6, .05, g);
    for (const [sx, sz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) M(G.cone, wood, .05, .2, .05, sx * 1.05, .1, sz * .38, g).rotation.x = PI;
    for (let i = 0; i < 3; i++) { const p = M(G.box, mat(pick(FEST), { roughness: .9 }), .4, .38, .14, -.65 + i * .65, .88, -.15, g); p.rotation.set(-.25, (rnd() - .5) * .5, (rnd() - .5) * .4); }
    M(G.box, mat(0xffffff, { roughness: 1, map: furTex('#f2eee4') }), .9, .04, .6, .55, .76, .05, g).rotation.z = .08;
    obs = [[0, 0, 1.1]];
  } else if (kind === 'rug') {
    const tx = persianTex(variant); keep(M(new THREE.PlaneGeometry(2.4, 3.6).rotateX(-PI / 2), new THREE.MeshStandardMaterial({ map: tx, roughness: 1 }), 1, 1, 1, 0, .015, 0, g)).castShadow = false;
    const fr = []; for (let i = 0; i < 24; i++) for (const s of [-1, 1]) fr.push([G.box, mtx(-1.15 + i * .1, .012, s * 1.85, 0, 0, 0, .03, .01, .12)]);
    noSh(M(mergeList(fr), mat(0xf2e3c6), 1, 1, 1, 0, 0, 0, g));
  } else if (kind === 'banner') {
    const wood = mat(0x6a4a2a, { roughness: .8 });
    for (const s of [-1, 1]) { M(G.cylLo, wood, .06, 3.6, .06, s * 1.0, 1.8, 0, g); noSh(M(G.sph, neon(0xffd23f, 1.6), .09, .09, .09, s * 1.0, 3.66, 0, g)); }
    M(G.cylLo, wood, .04, 2.2, .04, 0, 3.45, 0, g).rotation.z = PI / 2;
    const tx = tapestryTex(variant);
    const geo = new THREE.PlaneGeometry(1.7, 2.5, 8, 10); geo.translate(0, -1.25, 0); const base = geo.attributes.position.array.slice();
    const bm = new THREE.MeshStandardMaterial({ map: tx, side: THREE.DoubleSide, roughness: .9, emissiveMap: tx, emissive: 0xffffff, emissiveIntensity: 0 }); nm.push([bm, 0, .35]);
    keep(M(geo, bm, 1, 1, 1, 0, 3.42, 0, g));
    const tas = []; for (let i = 0; i < 9; i++) tas.push([G.cone, mtx(-.8 + i * .2, .85, 0, PI, 0, 0, .04, .18, .04)]); M(mergeList(tas), mat(0xffd23f), 1, 1, 1, 0, 0, 0, g);
    own = (dt, t) => { const p = geo.attributes.position.array; for (let i = 0; i < p.length; i += 3) { const d = -base[i + 1] / 2.5; p[i + 2] = base[i + 2] + d * .12 * Math.sin(t * 1.8 + base[i] * 1.5 + base[i + 1]); } geo.attributes.position.needsUpdate = true; };
    obs = [[-1, 0, .15], [1, 0, .15]];
  } else if (kind === 'lightpole') {
    const c0 = pick(FEST), c1 = pick(FEST.filter(c => c !== c0));
    M(G.cylLo, mat(0x2a2a2a, { roughness: .4, metalness: .6 }), .06, 4, .06, 0, 2, 0, g); M(G.cyl, mat(0x2a2a2a), .3, .1, .3, 0, .05, 0, g);
    const pts = []; for (let i = 0; i <= 80; i++) { const u = i / 80; pts.push(V(Math.cos(u * TAU * 7) * .1, .3 + u * 3.5, Math.sin(u * TAU * 7) * .1)); }
    const sm = ownNeon(c0, 1.6); nm.push([sm, 1.2, 2.6]);
    noSh(M(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 160, .025, 4), sm, 1, 1, 1, 0, 0, 0, g));
    const orbM = ownNeon(c1, 1.2); nm.push([orbM, 1.0, 3.0]); const orb = keep(noSh(M(G.ico, orbM, .32, .32, .32, 0, 4.25, 0, g)));
    M(G.torus, mat(0xffc93c, { metalness: .7, roughness: .3 }), .38, .38, 1.2, 0, 4.25, 0, g).rotation.x = PI / 2;
    const sp = glowSprite(c1, 3.5); sp.position.set(0, 4.25, 0); g.add(sp); sprites.push([sp, .8]);
    own = (dt, t, ctx, night) => { orbM.emissiveIntensity = (1 + 2 * night) * (.75 + .25 * Math.sin(t * 2.2)); orb.rotation.y = t * .7; };
    obs = [[0, 0, .25]];
  } else if (kind === 'bikepile') {
    const tire = mat(0x1a1a1a, { roughness: .8 }), tg = new THREE.TorusGeometry(.33, .035, 6, 20);
    const frames = new Map(), wheels = [], furs = [];
    const bikes = 6;
    for (let b = 0; b < bikes; b++) {
      const col = FEST[b % FEST.length]; const x0 = R(-1.1, 1.1), y0 = b < 3 ? .35 : .55 + R(0, .2), z0 = R(-.5, .5), ry = R(0, PI), rz = b < 3 ? R(-.15, .15) : R(-.6, .6);
      const bm = new THREE.Matrix4().compose(V(x0, y0, z0), new THREE.Quaternion().setFromEuler(new THREE.Euler(R(-.2, .2), ry, rz)), V(1, 1, 1));
      const add = (geo, m) => [geo, m.premultiply(bm)];
      wheels.push(add(tg, mtx(-.5, 0, 0)), add(tg, mtx(.5, 0, 0)));
      const fr = [], bar = (a, b2) => { const o = new THREE.Object3D(); placeSeg(o, a, b2, .025); o.updateMatrix(); fr.push(add(G.cylLo, o.matrix.clone())); };
      bar(V(-.5, 0, 0), V(-.05, .35, 0)); bar(V(-.05, .35, 0), V(.38, .35, 0)); bar(V(.38, .35, 0), V(.5, 0, 0)); bar(V(-.05, .35, 0), V(.05, 0, 0)); bar(V(.05, 0, 0), V(-.5, 0, 0)); bar(V(.05, 0, 0), V(.38, .35, 0)); bar(V(.38, .35, 0), V(.42, .55, 0)); bar(V(.32, .58, -.25), V(.32, .58, .25)); bar(V(-.1, .35, 0), V(-.12, .5, 0));
      fr.push(add(G.box, mtx(-.12, .53, 0, 0, 0, 0, .25, .06, .12)));
      if (!frames.has(col)) frames.set(col, []); frames.get(col).push(...fr);
      if (b % 2 === 0) furs.push(add(G.box, mtx(.15, .38, 0, 0, 0, 0, .5, .14, .14)));
    }
    M(mergeList(wheels), tire, 1, 1, 1, 0, 0, 0, g);
    for (const [col, parts] of frames) M(mergeList(parts), mat(col, { roughness: .4, metalness: .4 }), 1, 1, 1, 0, 0, 0, g);
    M(mergeList(furs), new THREE.MeshStandardMaterial({ map: furTex('#ff5fb4'), roughness: 1 }), 1, 1, 1, 0, 0, 0, g);
    const lp = []; for (let i = 0; i < 22; i++) lp.push(V(R(-1.2, 1.2), R(.4, .95), R(-.55, .55)));
    lp.sort((a, b) => a.x - b.x); strings.push(lightString(g, lp, FEST, .04, 3.4, true, .8));
    obs = [[0, 0, 1.3]];
  } else if (kind === 'sign') {
    const name = opts.name || CAMP_NAMES[variant % CAMP_NAMES.length];
    const words = name.split(' '); const mid = Math.ceil(words.length / 2); const lines = name.length > 16 ? [words.slice(0, mid).join(' '), words.slice(mid).join(' ')] : [name];
    const tx = signTex(lines, 512, 256, { bg: pick(['#c98d4e', '#2a0e5c', '#0d3b4a', '#8e1b2c']), border: pick(['#ffd23f', '#ff3d7f', '#7dfcff']), deco: true });
    const sm = new THREE.MeshStandardMaterial({ map: tx, emissiveMap: tx, emissive: 0xffffff, emissiveIntensity: 0, roughness: .85 }); nm.push([sm, 0, .55]);
    const wood = mat(0x6a4a2a, { roughness: .85 });
    for (const s of [-1, 1]) M(G.box, wood, .12, 2.6, .12, s * 1.15, 1.3, 0, g);
    M(G.box, wood, 2.5, 1.3, .08, 0, 2.0, -.05, g); keep(M(new THREE.PlaneGeometry(2.4, 1.2), sm, 1, 1, 1, 0, 2.0, -.005, g));
    keep(M(new THREE.PlaneGeometry(2.4, 1.2).rotateY(PI), sm, 1, 1, 1, 0, 2.0, -.095, g));
    strings.push(lightString(g, sagPts(V(-1.2, 2.72, .02), V(1.2, 2.72, .02), 12, .08), FEST, .045, 3.2));
    noSh(M(G.cone, neon(0xffd23f, 1.6), .14, .3, .14, -1.15, 2.75, 0, g)); noSh(M(G.cone, neon(0xff3d7f, 1.6), .14, .3, .14, 1.15, 2.75, 0, g));
    g.userData.campName = name;
    obs = [[-1.15, 0, .15], [1.15, 0, .15]];
  } else if (kind === 'lounge') {
    M(G.cyl, mat(0x6a4a2a, { roughness: .8 }), 2.0, .15, 2.0, 0, .075, 0, g);
    keep(M(new THREE.CircleGeometry(1.9, 32).rotateX(-PI / 2), new THREE.MeshStandardMaterial({ map: persianTex(variant + 1), roughness: 1 }), 1, 1, 1, 0, .155, 0, g)).castShadow = false;
    const cols = [0xff3d7f, 0xffd23f, 0x2ec4ff, 0xb15cff, 0xff6b2b, 0x3ddc97, 0xff9ad5, 0x7dfcff];
    const byCol = new Map();
    for (let i = 0; i < 8; i++) { const a = i / 8 * TAU, c = cols[i]; if (!byCol.has(c)) byCol.set(c, []); byCol.get(c).push([G.sph, mtx(Math.sin(a) * 1.45, .3, Math.cos(a) * 1.45, 0, a, 0, .6, .2, .42)]); byCol.get(c).push([G.sph, mtx(Math.sin(a) * 1.75, .55, Math.cos(a) * 1.75, -.3 * Math.cos(a) * 0, a, 0, .5, .32, .16)]); }
    for (const [c, parts] of byCol) M(mergeList(parts), mat(c, { roughness: .95 }), 1, 1, 1, 0, 0, 0, g);
    M(G.cyl, mat(0x4a2a14, { roughness: .6 }), .45, .35, .45, 0, .33, 0, g); M(G.cyl, mat(0xffc93c, { metalness: .7, roughness: .3 }), .48, .04, .48, 0, .52, 0, g);
    const lan = ownNeon(0xffb35a, .5); nm.push([lan, .5, 3]); noSh(M(G.oct, lan, .13, .2, .13, 0, .72, 0, g));
    const sp = glowSprite(0xffb35a, 3); sp.position.set(0, .75, 0); g.add(sp); sprites.push([sp, .8]);
    obs = [];
  }
  return finish(g, { nm, sprites, strings, extras: { obs, kind }, update: own });
}
