// weapons.js — artsy NON-LETHAL festival blasters for "Phoenix in the Dusty City"
// Unlimited ammo; hits stun / confuse / blind / slow / trap / knock back Rangers temporarily. Nobody gets hurt.
//
// export initWeapons(api)                 api: { glowMap? }
// export WEAPONS, START_WEAPON
// export buildGun(id) -> { g, muzzle, update(dt, t, firing, heat) }   (origin = grip, barrel +Z, meters)
// export createWeaponSystem(scene, camera) -> { fire, beam, update, muzzleFlash, splat, clear, stats }
// export weaponSound(id, audioCtx, destination, kind)
// export hitEffectSprite(effect) -> THREE.Sprite   (sprite.userData.update(dt, t) animates it)
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
function defaultApi() { return { glowMap: makeGlowMap() }; }
const A = () => API || (API = defaultApi());
export function initWeapons(api) { const d = defaultApi(); API = Object.assign(d, api || {}); if (!API.glowMap) API.glowMap = d.glowMap; }

const _mcache = {};
function mat(c, o) { const k = c + '|' + (o ? JSON.stringify(o, (k2, v) => (v && v.isTexture) ? v.uuid : v) : ''); return _mcache[k] || (_mcache[k] = new THREE.MeshStandardMaterial(Object.assign({ color: c, roughness: .55, metalness: 0 }, o || {}))); }
function neon(c, k = 2, o) { const col = new THREE.Color(c); return new THREE.MeshStandardMaterial(Object.assign({ color: col.clone().multiplyScalar(.3), emissive: col, emissiveIntensity: k, roughness: .35 }, o || {})); }
const INK = () => mat(0x0b0b10, { roughness: .6 });

// ============================================================ small utils
const R = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[(Math.random() * arr.length) | 0];
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
function cnv(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; }
function ctex(c, rep) { const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; if (rep) t.wrapS = t.wrapT = THREE.RepeatWrapping; return t; }
const _tcache = {};
const tex = (k, f) => _tcache[k] || (_tcache[k] = f());
const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _v4 = new THREE.Vector3();
const _q1 = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _m1 = new THREE.Matrix4(), _e1 = new THREE.Euler(), _c1 = new THREE.Color();
const _UP = new THREE.Vector3(0, 1, 0), _Z = new THREE.Vector3(0, 0, 1), _X = new THREE.Vector3(1, 0, 0), _ONE = new THREE.Vector3(1, 1, 1);
const _s1 = new THREE.Vector3();

// geometry helpers (real sizes, cylinders along +Z)
function add(p, o, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) { o.position.set(x, y, z); o.rotation.set(rx, ry, rz); o.castShadow = true; o.receiveShadow = true; p.add(o); return o; }
const mesh = (geo, m) => new THREE.Mesh(geo, m);
const boxG = (w, h, d) => new THREE.BoxGeometry(w, h, d);
function cylZ(r1, r2, len, seg = 20, open = false) { const g = new THREE.CylinderGeometry(r2, r1, len, seg, 1, open); g.rotateX(PI / 2); return g; } // r1 at -Z end, r2 at +Z end
function capZ(r, len, seg = 16) { const g = new THREE.CapsuleGeometry(r, len, 6, seg); const p = g.attributes.position, uv = g.attributes.uv; for (let i = 0; i < p.count; i++) uv.setY(i, (p.getY(i) + len / 2 + r) / (len + 2 * r) * (len + 2 * r) / (TAU * r)); g.rotateX(PI / 2); return g; }
const sphG = (r, w = 20, h = 14) => new THREE.SphereGeometry(r, w, h);
function latheZ(pts, seg = 24) { const g = new THREE.LatheGeometry(pts.map(p => new THREE.Vector2(p[0], p[1])), seg); g.rotateX(PI / 2); return g; } // profile [radius, along]
// black inverted-hull outline (comic ink), works for convex-ish shapes
const _outlineMat = new THREE.MeshBasicMaterial({ color: 0x050508, side: THREE.BackSide });
function outline(m, w = .007) {
  const g = m.geometry; if (!g.boundingBox) g.computeBoundingBox(); const bb = g.boundingBox;
  const sx = bb.max.x - bb.min.x, sy = bb.max.y - bb.min.y, sz = bb.max.z - bb.min.z;
  const o = new THREE.Mesh(g, _outlineMat);
  o.scale.set((sx + 2 * w) / Math.max(sx, 1e-4), (sy + 2 * w) / Math.max(sy, 1e-4), (sz + 2 * w) / Math.max(sz, 1e-4));
  bb.getCenter(_v1); o.position.set(_v1.x * (1 - o.scale.x), _v1.y * (1 - o.scale.y), _v1.z * (1 - o.scale.z));
  m.add(o); return m;
}
function gripParts(g, m, opts = {}) {
  const grip = add(g, mesh(boxG(.034, .12, .05), m), 0, -.045, -.008, -.28);
  const tg = add(g, mesh(new THREE.TorusGeometry(.024, .0045, 6, 16, PI), opts.guard || mat(0x222228, { metalness: .6, roughness: .35 })), 0, .0, .035, 0, PI / 2, PI);
  tg.scale.set(1, 1, 1);
  add(g, mesh(boxG(.006, .022, .006), opts.guard || mat(0x222228, { metalness: .6, roughness: .35 })), 0, .006, .03, -.3);
  return grip;
}

// ============================================================ painted textures
function texPollock() {
  return tex('pollock', () => {
    const [c, x] = cnv(512, 512); x.fillStyle = '#d9c9a6'; x.fillRect(0, 0, 512, 512);
    const cols = ['#111111', '#111111', '#f4efe2', '#e2a72e', '#2a8a8f', '#c4372a', '#6b4a2a', '#f4efe2'];
    x.lineCap = 'round';
    for (let i = 0; i < 70; i++) {
      x.strokeStyle = pick(cols); x.lineWidth = R(1, i < 20 ? 7 : 3.5); x.beginPath();
      let px = R(-50, 560), py = R(-50, 560); x.moveTo(px, py);
      for (let k = 0; k < 4; k++) { const nx = px + R(-260, 260), ny = py + R(-260, 260); x.bezierCurveTo(px + R(-200, 200), py + R(-200, 200), nx + R(-200, 200), ny + R(-200, 200), nx, ny); px = nx; py = ny; }
      x.stroke();
    }
    for (let i = 0; i < 500; i++) { x.fillStyle = pick(cols); x.beginPath(); x.arc(R(0, 512), R(0, 512), Math.pow(Math.random(), 3) * 7 + .5, 0, TAU); x.fill(); }
    return ctex(c, true);
  });
}
function texStarry() {
  return tex('starry', () => {
    const [c, x] = cnv(512, 512); x.fillStyle = '#16307a'; x.fillRect(0, 0, 512, 512);
    const blues = ['#1d3f9e', '#2c5ec4', '#4f86d9', '#0f2366', '#6fa6e8', '#9cc6f0', '#2648a8'];
    x.lineCap = 'round';
    const swirl = (cx, cy, rad, n, cols) => {
      for (let i = 0; i < n; i++) {
        const r = R(rad * .15, rad), a = R(0, TAU), len = R(.25, .6);
        x.strokeStyle = pick(cols); x.lineWidth = R(3, 7); x.beginPath(); x.arc(cx, cy, r, a, a + len); x.stroke();
      }
    };
    for (let i = 0; i < 1400; i++) { // dashed background brush strokes flowing
      const px = R(0, 512), py = R(0, 512), a = Math.sin(px * .02) * .8 + Math.cos(py * .015) * .6;
      x.strokeStyle = pick(blues); x.lineWidth = R(2.5, 5); x.beginPath(); x.moveTo(px, py); x.lineTo(px + Math.cos(a) * 14, py + Math.sin(a) * 14); x.stroke();
    }
    swirl(250, 250, 150, 380, blues.concat(['#cfe3f7', '#e8f1fb']));
    swirl(110, 120, 70, 120, ['#cfe3f7', '#8fb7ea', '#ffffff']);
    for (let s = 0; s < 11; s++) {
      const sx = R(20, 492), sy = R(20, 492), rr = R(16, 34);
      for (let k = 0; k < 4; k++) { x.strokeStyle = k % 2 ? '#fff6b0' : '#f2c94c'; x.lineWidth = 4; x.beginPath(); x.arc(sx, sy, rr * (1 - k * .2), 0, TAU); x.stroke(); }
      x.fillStyle = '#ffe56a'; x.beginPath(); x.arc(sx, sy, rr * .35, 0, TAU); x.fill();
    }
    x.fillStyle = '#ffd23f'; x.beginPath(); x.arc(440, 80, 40, 0, TAU); x.fill(); x.fillStyle = '#16307a'; x.beginPath(); x.arc(458, 70, 34, 0, TAU); x.fill();
    return ctex(c, true);
  });
}
function texCypress() {
  return tex('cypress', () => {
    const [c, x] = cnv(256, 256); x.fillStyle = '#10301d'; x.fillRect(0, 0, 256, 256);
    x.lineCap = 'round';
    for (let i = 0; i < 500; i++) { const px = R(0, 256), py = R(0, 256); x.strokeStyle = pick(['#1c4a2b', '#2f6b35', '#0a1f14', '#3c7d3a', '#5a8f3a', '#26402a']); x.lineWidth = R(3, 6); x.beginPath(); x.moveTo(px, py); x.quadraticCurveTo(px + R(-10, 10), py - 10, px + R(-6, 6), py - R(16, 30)); x.stroke(); }
    return ctex(c, true);
  });
}
function texDots(bg, dot, n = 90, rmin = 5, rmax = 18, key) {
  return tex('dots' + (key || bg + dot), () => {
    const [c, x] = cnv(256, 256); x.fillStyle = bg; x.fillRect(0, 0, 256, 256); x.fillStyle = dot;
    const placed = [];
    for (let i = 0; i < n * 6 && placed.length < n; i++) {
      const r = R(rmin, rmax), px = R(0, 256), py = R(0, 256);
      if (placed.some(p => Math.hypot(p[0] - px, p[1] - py) < p[2] + r + 3)) continue;
      placed.push([px, py, r]);
      for (const ox of [-256, 0, 256]) for (const oy of [-256, 0, 256]) { x.beginPath(); x.arc(px + ox, py + oy, r, 0, TAU); x.fill(); }
    }
    return ctex(c, true);
  });
}
function texHalftone(bg, dot, key, step = 14) {
  return tex('ht' + key, () => {
    const [c, x] = cnv(256, 256); x.fillStyle = bg; x.fillRect(0, 0, 256, 256); x.fillStyle = dot;
    for (let j = 0, y = 0; y < 270; y += step * .87, j++) for (let i = 0; i < 22; i++) { x.beginPath(); x.arc(i * step + (j % 2) * step / 2, y, step * .3, 0, TAU); x.fill(); }
    return ctex(c, true);
  });
}
function texClock(melt) {
  return tex('clock' + (melt ? 'm' : ''), () => {
    const [c, x] = cnv(256, 256); x.clearRect(0, 0, 256, 256);
    x.fillStyle = '#c99a3b'; x.beginPath(); x.arc(128, 128, 126, 0, TAU); x.fill();
    x.fillStyle = '#f6edd2'; x.beginPath(); x.arc(128, 128, 112, 0, TAU); x.fill();
    x.fillStyle = '#1a1a1a'; x.font = 'bold 26px Georgia, serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
    const rn = ['XII', 'I', 'II', 'III', 'IIII', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI'];
    for (let i = 0; i < 12; i++) { const a = i / 12 * TAU - PI / 2; x.save(); x.translate(128 + Math.cos(a) * 88, 128 + Math.sin(a) * 88); x.rotate(a + PI / 2); x.fillText(rn[i], 0, 0); x.restore(); }
    for (let i = 0; i < 60; i++) { const a = i / 60 * TAU; x.fillRect(128 + Math.cos(a) * 106 - 1, 128 + Math.sin(a) * 106 - 1, 2, 2); }
    if (!melt) { x.strokeStyle = '#1a1a1a'; x.lineCap = 'round'; x.lineWidth = 7; x.beginPath(); x.moveTo(128, 128); x.lineTo(128 + 40, 128 - 34); x.stroke(); x.lineWidth = 4; x.beginPath(); x.moveTo(128, 128); x.lineTo(128 - 12, 128 - 82); x.stroke(); }
    x.fillStyle = '#1a1a1a'; x.beginPath(); x.arc(128, 128, 7, 0, TAU); x.fill();
    return ctex(c);
  });
}
function texGlitter(base) {
  return tex('glit' + base, () => {
    const [c, x] = cnv(256, 256); x.fillStyle = base; x.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 2600; i++) { x.fillStyle = pick(['#ffffff', '#ffd6f5', '#ffe98a', '#a8f0ff', '#ff7ad9', '#c58bff']); x.globalAlpha = R(.3, 1); const s = R(1, 3.2); x.fillRect(R(0, 256), R(0, 256), s, s); }
    x.globalAlpha = 1; return ctex(c, true);
  });
}
function texSky() {
  return tex('sky', () => {
    const [c, x] = cnv(512, 256); const gr = x.createLinearGradient(0, 0, 0, 256); gr.addColorStop(0, '#3f86d6'); gr.addColorStop(1, '#a6d3f5');
    x.fillStyle = gr; x.fillRect(0, 0, 512, 256);
    for (let k = 0; k < 9; k++) {
      const cx = R(0, 512), cy = R(30, 226), w = R(50, 100);
      for (let i = 0; i < 9; i++) { const px = cx + R(-w, w) * .8, py = cy + R(-12, 10), r = R(14, 30); const g2 = x.createRadialGradient(px, py - r * .3, r * .1, px, py, r); g2.addColorStop(0, '#ffffff'); g2.addColorStop(.75, '#f2f6fb'); g2.addColorStop(1, 'rgba(225,235,248,0)'); x.fillStyle = g2; x.beginPath(); x.arc(px, py, r, 0, TAU); x.fill(); }
    }
    return ctex(c, true);
  });
}
function texPlaque() {
  return tex('plaque', () => {
    const [c, x] = cnv(512, 96); x.fillStyle = '#efe6cf'; x.fillRect(0, 0, 512, 96);
    x.fillStyle = '#1b1b1b'; x.font = 'italic 46px "Brush Script MT", "Snell Roundhand", cursive'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText("Ceci n'est pas une pipe.", 256, 50); return ctex(c);
  });
}
function texHaring() {
  return tex('haring', () => {
    const [c, x] = cnv(512, 256); x.fillStyle = '#fbfbf4'; x.fillRect(0, 0, 512, 256);
    x.lineCap = 'round'; x.lineJoin = 'round';
    const fig = (cx, cy, s, col, pose) => {
      const P = [[0, -38], [0, 8]], arms = pose ? [[-26, -40], [26, -40]] : [[-30, -4], [28, -34]], legs = pose ? [[-24, 44], [22, 40]] : [[-14, 46], [26, 34]];
      const segs = [[P[0], P[1]], [[0, -24], arms[0]], [[0, -24], arms[1]], [P[1], legs[0]], [P[1], legs[1]]];
      for (const pass of [0, 1]) {
        x.strokeStyle = pass ? col : '#111'; x.lineWidth = (pass ? 13 : 23) * s; x.fillStyle = pass ? col : '#111';
        for (const [a, b] of segs) { x.beginPath(); x.moveTo(cx + a[0] * s, cy + a[1] * s); x.lineTo(cx + b[0] * s, cy + b[1] * s); x.stroke(); }
        x.beginPath(); x.arc(cx, cy - 54 * s, (pass ? 13 : 18) * s, 0, TAU); x.fill();
      }
      x.strokeStyle = '#111'; x.lineWidth = 4 * s; // motion lines
      for (let k = 0; k < 3; k++) { const a = -PI / 2 + (k - 1) * .5; x.beginPath(); x.moveTo(cx + Math.cos(a) * 26 * s, cy - 54 * s + Math.sin(a) * 26 * s); x.lineTo(cx + Math.cos(a) * 38 * s, cy - 54 * s + Math.sin(a) * 38 * s); x.stroke(); }
    };
    const cols = ['#ff2a2a', '#1f6bff', '#ffd400', '#13c95a', '#ff4fb4'];
    for (let i = 0; i < 6; i++) fig(45 + i * 85, 140 + (i % 2) * 8, .95, cols[i % 5], i % 2);
    return ctex(c, true);
  });
}
function texKandinsky() {
  return tex('kand', () => {
    const [c, x] = cnv(512, 256); const cs = 128;
    const bgs = ['#e8c547', '#2d4f9e', '#c43b3b', '#3b8a5a', '#f08a3c', '#6b3fa0', '#1c1c2a', '#e86fa8'];
    const rings = ['#ffdf3a', '#e52e2e', '#2a5bd7', '#111', '#f7f3e8', '#3fbf6a', '#ff8a2a', '#9b59d0'];
    for (let j = 0; j < 2; j++) for (let i = 0; i < 4; i++) {
      x.fillStyle = bgs[(i + j * 4) % 8]; x.fillRect(i * cs, j * cs, cs, cs);
      let r = 56; let k = i * 3 + j;
      while (r > 6) { x.fillStyle = rings[k++ % 8]; x.beginPath(); x.arc(i * cs + 64 + R(-4, 4), j * cs + 64 + R(-4, 4), r, 0, TAU); x.fill(); r -= R(8, 14); }
    }
    return ctex(c, true);
  });
}
function texFirework() {
  return tex('fwpaper', () => {
    const [c, x] = cnv(256, 256); x.fillStyle = '#d4202c'; x.fillRect(0, 0, 256, 256);
    x.fillStyle = '#ffcc33'; for (let i = 0; i < 4; i++) x.fillRect(0, i * 64 + 6, 256, 7);
    x.fillStyle = '#ffe9a0'; x.font = 'bold 30px sans-serif'; x.textAlign = 'center';
    const star = (cx, cy, r) => { x.beginPath(); for (let k = 0; k < 10; k++) { const a = k / 10 * TAU - PI / 2, rr = k % 2 ? r * .45 : r; x.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); } x.closePath(); x.fill(); };
    for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) star(i * 64 + 32 + (j % 2) * 16, j * 64 + 40, 11);
    return ctex(c, true);
  });
}
function texRainbow() {
  return tex('rainbow', () => {
    const [c, x] = cnv(256, 64); const cols = ['#ff3b5c', '#ff9f1c', '#ffe03b', '#3ddc84', '#29b6ff', '#8f5bff', '#ff5bd1'];
    for (let i = 0; i < 14; i++) { x.fillStyle = cols[i % 7]; x.beginPath(); x.moveTo(i * 22 - 30, 64); x.lineTo(i * 22 - 8, 64); x.lineTo(i * 22 + 30, 0); x.lineTo(i * 22 + 8, 0); x.fill(); }
    return ctex(c, true);
  });
}
function comicTex(word, bg, fg) {
  return tex('comic' + word + bg, () => {
    const [c, x] = cnv(512, 512);
    // jagged burst
    x.beginPath(); const n = 22;
    for (let i = 0; i < n * 2; i++) { const a = i / (n * 2) * TAU, r = i % 2 ? R(150, 180) : R(225, 250); x.lineTo(256 + Math.cos(a) * r, 256 + Math.sin(a) * r * .82); }
    x.closePath(); x.fillStyle = '#111'; x.fill(); x.save(); x.translate(256, 256); x.scale(.93, .93); x.translate(-256, -256); x.fillStyle = bg; x.fill(); x.restore();
    // halftone in burst
    x.save(); x.clip(); x.fillStyle = 'rgba(255,255,255,.35)'; for (let yy = 0; yy < 512; yy += 18) for (let xx = (yy / 18 % 2) * 9; xx < 512; xx += 18) { x.beginPath(); x.arc(xx, yy, 4, 0, TAU); x.fill(); } x.restore();
    x.font = 'italic 900 ' + (word.length > 4 ? 120 : 150) + 'px Impact, "Arial Black", sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.save(); x.translate(256, 262); x.rotate(-.12);
    x.lineJoin = 'round'; x.lineWidth = 26; x.strokeStyle = '#111'; x.strokeText(word, 6, 8); x.fillStyle = '#111'; x.fillText(word, 10, 12);
    x.lineWidth = 16; x.strokeText(word, 0, 0); x.fillStyle = fg; x.fillText(word, 0, 0);
    x.restore();
    return ctex(c);
  });
}

// ============================================================ weapon definitions
export const START_WEAPON = 'splatter';
export const WEAPONS = [
  { id: 'splatter', name: 'Splatter Blaster', artist: 'Jackson Pollock', blurb: 'Action painting, now with extra action — drip, flick and splat Rangers into a happy daze.', color: 0xffb627, auto: true, rate: 9, spread: .04, pellets: 1, speed: 44, gravity: 7, range: 40, heatPerShot: 0, coolRate: 1, recoil: .012, shake: .07, zoom: .8, effect: 'stun', effectDur: 1.4, aoe: 0, hold: 'pistol', proj: 'blob' },
  { id: 'starry', name: 'Starry Night Rifle', artist: 'Vincent van Gogh', blurb: 'Fires swirling stars so dreamy the target has to sit down and think about the sky for a while.', color: 0xffd84a, auto: false, rate: 1.3, spread: 0, pellets: 1, speed: 95, gravity: 0, range: 130, heatPerShot: 0, coolRate: 1, recoil: .055, shake: .35, zoom: .45, effect: 'stun', effectDur: 6, aoe: 0, hold: 'rifle', proj: 'star' },
  { id: 'dots', name: 'Dot Repeater', artist: 'Yayoi Kusama', blurb: 'Infinity polka dots per second. Rangers lose track of which way is the porta-potty.', color: 0xff2d55, auto: true, rate: 16, spread: .055, pellets: 1, speed: 56, gravity: 2, range: 45, heatPerShot: .03, coolRate: .45, recoil: .006, shake: .05, zoom: .8, effect: 'confuse', effectDur: 3, aoe: 0, hold: 'pistol', proj: 'dot' },
  { id: 'pow', name: 'POW! Launcher', artist: 'Roy Lichtenstein', blurb: 'Lobs a Ben-Day shell that goes POW! in four colors and blows everyone back a panel.', color: 0xffe600, auto: false, rate: .9, spread: .01, pellets: 1, speed: 26, gravity: 14, range: 60, heatPerShot: 0, coolRate: 1, recoil: .09, shake: .6, zoom: .75, effect: 'knockback', effectDur: 1.6, aoe: 4.5, hold: 'rifle', proj: 'shell' },
  { id: 'clock', name: 'Melting Clock Cannon', artist: 'Salvador Dalí', blurb: 'The persistence of memory, weaponised: a golden orb that makes time go all droopy.', color: 0xe6b84a, auto: false, rate: .6, spread: 0, pellets: 1, speed: 12, gravity: 0, range: 45, heatPerShot: 0, coolRate: 1, recoil: .06, shake: .4, zoom: .75, effect: 'slow', effectDur: 6, aoe: 5, hold: 'rifle', proj: 'orb' },
  { id: 'glitter', name: 'Glitter Shotgun', artist: 'Studio 54 Disco Ball', blurb: 'A fabulous cone of glitter. They will be finding it in their boots until next year.', color: 0xff6ad5, auto: false, rate: 1.6, spread: .13, pellets: 12, speed: 48, gravity: 4, range: 22, heatPerShot: 0, coolRate: 1, recoil: .07, shake: .45, zoom: .8, effect: 'blind', effectDur: 3.5, aoe: 0, hold: 'rifle', proj: 'glitter' },
  { id: 'bubble', name: 'Bubble Gun', artist: 'René Magritte', blurb: "Ceci n'est pas une prison: a bubble that floats a Ranger gently into the clouds.", color: 0x8fd0ff, auto: false, rate: 2, spread: .02, pellets: 1, speed: 13, gravity: -.6, range: 35, heatPerShot: 0, coolRate: 1, recoil: .02, shake: .1, zoom: .8, effect: 'trap', effectDur: 4.5, aoe: 0, hold: 'pistol', proj: 'bubble' },
  { id: 'neon', name: 'Neon Beam', artist: 'Keith Haring × Wassily Kandinsky', blurb: 'A dancing ribbon of pure neon line-art. Hold to paint, watch the heat.', color: 0x39ff88, auto: true, rate: 12, spread: 0, pellets: 1, speed: Infinity, gravity: 0, range: 35, heatPerShot: .018, coolRate: .35, recoil: .002, shake: .06, zoom: .7, effect: 'stun', effectDur: .9, aoe: 0, hold: 'rifle', proj: 'beam', beam: true },
  { id: 'firework', name: 'Firework Launcher', artist: 'Cai Guo-Qiang', blurb: 'Heat-seeking celebration rockets. Every hit is a finale.', color: 0xff4422, auto: false, rate: 1.2, spread: .02, pellets: 1, speed: 18, gravity: 0, range: 70, heatPerShot: .22, coolRate: .4, recoil: .05, shake: .35, zoom: .75, effect: 'stun', effectDur: 3, aoe: 3.5, hold: 'rifle', proj: 'rocket' },
  { id: 'confetti', name: 'Confetti Minigun', artist: 'Party Maximalism', blurb: 'Six spinning barrels of birthday. Wind it up and make it rain.', color: 0x22e0ff, auto: true, rate: 22, spread: .08, pellets: 1, speed: 38, gravity: 5, range: 30, heatPerShot: .012, coolRate: .3, recoil: .004, shake: .12, zoom: .8, effect: 'stun', effectDur: .7, aoe: 0, hold: 'rifle', proj: 'flake', spinup: .45 },
];
const DEF = {}; WEAPONS.forEach((w, i) => { w.index = i; w.spinup = w.spinup || 0; w.beam = !!w.beam; DEF[w.id] = w; });

const PAL = {
  pollock: [0x111111, 0xf3eee0, 0xe8a92c, 0x2a9196, 0xc8332a, 0x111111],
  kusama: [0xff1f3d, 0xffffff, 0xffd400, 0xff1f3d, 0xff4fa3],
  glitter: [0xff5fd2, 0xffd84a, 0xd8f4ff, 0x9a6bff, 0x5ff3ff, 0xffffff],
  firework: [0xff3344, 0xffd23a, 0x3cff9a, 0x3aa8ff, 0xff5ff0, 0xffffff, 0xff8a1f],
  confetti: [0xff3b5c, 0xff9f1c, 0xffe03b, 0x3ddc84, 0x29b6ff, 0x8f5bff, 0xff5bd1, 0xffffff],
  pop: [0xff2a2a, 0xffe600, 0x1f6bff],
};

// ============================================================ gun models
const BUILD = {};

BUILD.splatter = (g, an) => {
  const pt = texPollock();
  const body = mat(0xffffff, { map: pt, roughness: .45 });
  const grip = gripParts(g, mat(0xffffff, { map: pt, roughness: .7 }));
  add(g, mesh(capZ(.045, .2), body), 0, .07, .08);
  add(g, mesh(cylZ(.05, .05, .02, 24), mat(0x111111, { roughness: .3 })), 0, .07, .2); // collar
  add(g, mesh(cylZ(.022, .036, .14, 24), mat(0x161616, { roughness: .25 })), 0, .07, .28);
  add(g, mesh(new THREE.TorusGeometry(.036, .007, 8, 24), mat(0xe8a92c, { roughness: .3 })), 0, .07, .35);
  // paint can magazine
  const can = add(g, new THREE.Group(), 0, .15, .03);
  add(can, mesh(new THREE.CylinderGeometry(.042, .042, .075, 24), mat(0xc9ccd2, { metalness: .8, roughness: .3 })));
  add(can, mesh(new THREE.CylinderGeometry(.043, .043, .045, 24, 1, true), mat(0xffffff, { map: tex('canlabel', () => { const [c, x] = cnv(256, 64); x.fillStyle = '#2a9196'; x.fillRect(0, 0, 256, 64); x.fillStyle = '#f3eee0'; x.font = 'bold 30px sans-serif'; x.fillText('ENAMEL', 60, 44); x.fillStyle = '#e8a92c'; x.fillRect(0, 0, 256, 8); return ctex(c); }), side: THREE.DoubleSide })), 0, -.005);
  add(can, mesh(new THREE.TorusGeometry(.034, .004, 6, 20, PI), mat(0x888888, { metalness: .9, roughness: .3 })), 0, .04, 0, 0, 0, 0);
  // paint overflowing the rim
  const drip = mat(0x111111, { roughness: .15 });
  add(can, mesh(new THREE.CylinderGeometry(.044, .044, .01, 24), drip), 0, .04);
  for (let i = 0; i < 6; i++) { const a = i / 6 * TAU + .3, l = R(.02, .05); const d = add(can, mesh(capZ(.0055, l, 6), i % 2 ? drip : mat(0xf3eee0, { roughness: .15 })), Math.cos(a) * .044, .036 - l / 2, Math.sin(a) * .044, PI / 2); }
  // hose
  add(g, mesh(new THREE.TorusGeometry(.07, .008, 8, 20, PI * .7), mat(0xe8a92c, { roughness: .4 })), 0, .13, .14, 0, PI / 2, PI * .15);
  // splats stuck on body
  const cols = PAL.pollock;
  for (let i = 0; i < 16; i++) {
    const a = R(-PI * .9, PI * .9), z = R(-.03, .2), m = mat(pick(cols), { roughness: .15 });
    const s = add(g, mesh(sphG(.012, 8, 6), m), Math.sin(a) * .046, .07 + Math.cos(a) * .046, z); s.scale.set(R(.6, 1.6), R(.6, 1.4), R(.4, .7)); s.lookAt(0, .07, z); s.scale.z = .35;
  }
  // animated nozzle drip
  const dm = mat(0xc8332a, { roughness: .1 });
  const dr = add(g, mesh(sphG(.011, 10, 8), dm), 0, .045, .335);
  an.push((dt, t, firing) => { const u = (t * .7) % 1; dr.position.y = .05 - u * u * .08; dr.scale.set(1 - u * .3, 1 + u * 1.4, 1 - u * .3); dr.visible = u < .92; can.rotation.z = Math.sin(t * 9) * (firing ? .05 : .01); });
  return [.36, .07];
};

BUILD.starry = (g, an) => {
  const st = texStarry();
  const sky = mat(0xffffff, { map: st, roughness: .5 });
  gripParts(g, mat(0x1d2f6e, { roughness: .6 }));
  // receiver
  const rec = add(g, mesh(boxG(.062, .085, .3), sky), 0, .065, .06);
  add(g, mesh(boxG(.064, .012, .3), mat(0xf2c94c, { metalness: .6, roughness: .3 })), 0, .108, .06);
  // cypress stock: flame shaped, pointing back
  const cy = latheZ([[0, 0], [.035, .03], [.05, .1], [.045, .2], [.03, .28], [.012, .33], [0, .36]], 16);
  const stock = add(g, mesh(cy, mat(0xffffff, { map: texCypress(), roughness: .8 })), 0, .045, -.06, 0, PI, 0); stock.scale.set(1, 1.25, 1);
  // barrel with swirl rings
  add(g, mesh(cylZ(.02, .016, .5, 18), mat(0x1a2f78, { metalness: .5, roughness: .35 })), 0, .07, .45);
  const rings = new THREE.Group(); add(g, rings, 0, .07, 0);
  const ringM = neon(0xffd23f, 2.2), ringW = neon(0xbfe0ff, 1.6);
  for (let i = 0; i < 6; i++) { const r = add(rings, mesh(new THREE.TorusGeometry(.028 - i * .0012, .0045, 6, 24), i % 2 ? ringW : ringM), 0, 0, .3 + i * .07, R(-.3, .3), R(-.3, .3)); r.userData.sp = (i % 2 ? -1 : 1) * R(2, 4); }
  // spiral swirl tube near the muzzle
  const pts = []; for (let i = 0; i <= 60; i++) { const a = i / 60 * TAU * 2.5, r = .045 - i / 60 * .02; pts.push(new THREE.Vector3(Math.cos(a) * r, Math.sin(a) * r, .55 + i / 60 * .14)); }
  const sw = add(g, mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 80, .004, 5), neon(0xfff2a8, 2.6)), 0, .07, 0);
  // muzzle star
  const star = add(g, mesh(new THREE.IcosahedronGeometry(.022, 1), neon(0xffe066, 3.2)), 0, .07, .72);
  const halo = add(g, mesh(new THREE.TorusGeometry(.04, .004, 6, 28), neon(0xfff6b0, 2)), 0, .07, .72);
  // scope
  add(g, mesh(cylZ(.022, .022, .22, 20), mat(0x0f2366, { metalness: .5, roughness: .3 })), 0, .14, .07);
  add(g, mesh(cylZ(.028, .022, .04, 20), mat(0xf2c94c, { metalness: .7, roughness: .3 })), 0, .14, .19);
  add(g, mesh(new THREE.CircleGeometry(.024, 20), neon(0xffe680, 1.8)), 0, .14, .211);
  add(g, mesh(boxG(.012, .03, .02), mat(0x0f2366)), 0, .118, .03); add(g, mesh(boxG(.012, .03, .02), mat(0x0f2366)), 0, .118, .12);
  // crescent moon ornament on scope
  const moon = add(g, mesh(new THREE.TorusGeometry(.028, .007, 8, 24, PI * 1.25), neon(0xffcc33, 2.4)), 0, .19, .07, 0, PI / 2, -.4);
  // orbiting little star
  const orb = add(g, mesh(new THREE.OctahedronGeometry(.012), neon(0xffffff, 3)), 0, .07, .5);
  an.push((dt, t, firing) => {
    rings.children.forEach(r => r.rotation.z += r.userData.sp * dt * (firing ? 4 : 1));
    sw.rotation.z = t * 3; star.rotation.set(t, t * 1.3, 0); halo.scale.setScalar(1 + Math.sin(t * 4) * .15);
    orb.position.set(Math.cos(t * 3) * .07, .07 + Math.sin(t * 3) * .07, .5 + Math.sin(t * 1.5) * .08); orb.rotation.y = t * 5;
  });
  return [.74, .07];
};

BUILD.dots = (g, an) => {
  const red = mat(0xffffff, { map: texDots('#e8142f', '#ffffff', 60, 6, 16, 'kred'), roughness: .35 });
  const white = mat(0xffffff, { map: texDots('#ffffff', '#e8142f', 70, 4, 10, 'kwhite'), roughness: .35 });
  const yel = mat(0xffffff, { map: texDots('#ffcf1a', '#111111', 70, 5, 13, 'kyel'), roughness: .45 });
  gripParts(g, white);
  add(g, mesh(capZ(.048, .14), red), 0, .075, .06);
  add(g, mesh(cylZ(.024, .026, .16, 20), white), 0, .075, .2);
  for (let i = 0; i < 3; i++) add(g, mesh(sphG(.032, 18, 12), red), 0, .075, .17 + i * .06).scale.set(1, 1, .55);
  // muzzle flower of dots
  const flower = add(g, new THREE.Group(), 0, .075, .335);
  for (let i = 0; i < 8; i++) { const a = i / 8 * TAU; add(flower, mesh(sphG(.012, 10, 8), i % 2 ? mat(0xffffff, { roughness: .3 }) : mat(0xe8142f, { roughness: .3 })), Math.cos(a) * .034, Math.sin(a) * .034, 0); }
  add(flower, mesh(sphG(.016, 12, 10), neon(0xff4f7a, 2.2)));
  // Kusama pumpkin hopper (ribbed, yellow with black dots)
  const pg = sphG(.06, 32, 20); const p = pg.attributes.position;
  for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i); const a = Math.atan2(z, x); const k = 1 - .1 * Math.pow(Math.abs(Math.sin(a * 4)), .6); p.setXYZ(i, x * k, y * .78, z * k); }
  pg.computeVertexNormals();
  const pump = add(g, new THREE.Group(), 0, .16, .05);
  add(pump, mesh(pg, yel));
  add(pump, mesh(new THREE.CylinderGeometry(.008, .012, .035, 8), mat(0x2f6b1f, { roughness: .7 })), 0, .055, 0, 0, 0, .25);
  // glowing infinity dots dotted on the body
  const glowDots = [];
  for (let i = 0; i < 14; i++) {
    const a = R(-PI, PI), z = R(-.04, .14); const m = neon(pick([0xff4fa3, 0xffd400, 0xffffff, 0x4fc3ff]), 1.5);
    const d = add(g, mesh(sphG(.007, 8, 6), m), Math.sin(a) * .05, .075 + Math.cos(a) * .05, z); glowDots.push(d);
  }
  an.push((dt, t, firing) => {
    pump.rotation.y += dt * (firing ? 9 : .6);
    glowDots.forEach((d, i) => d.material.emissiveIntensity = 1 + Math.max(0, Math.sin(t * 5 + i * 1.7)) * 2.5);
    flower.rotation.z = t * (firing ? 10 : 1);
  });
  return [.35, .075];
};

BUILD.pow = (g, an) => {
  const yel = mat(0xffffff, { map: texHalftone('#ffe600', '#ff3b2f', 'yr'), roughness: .5 });
  const blu = mat(0xffffff, { map: texHalftone('#2a6bff', '#9fd0ff', 'bb', 12), roughness: .5 });
  const red = mat(0xff2a2a, { roughness: .45 }), ink = INK(), wht = mat(0xffffff, { roughness: .5 });
  outline(gripParts(g, blu), .006);
  outline(add(g, mesh(boxG(.034, .1, .045), blu), 0, .01, .3, -.2), .006); // foregrip
  const tube = outline(add(g, mesh(cylZ(.066, .066, .56, 28), yel), 0, .1, .2), .008);
  outline(add(g, mesh(cylZ(.072, .072, .05, 28), red), 0, .1, -.06), .007);
  outline(add(g, mesh(cylZ(.072, .095, .09, 28, false), red), 0, .1, .51), .008);
  add(g, mesh(new THREE.CircleGeometry(.075, 28), ink), 0, .1, .556);
  for (const z of [.1, .3]) outline(add(g, mesh(cylZ(.07, .07, .025, 28), wht), 0, .1, z), .006);
  // shoulder rest
  outline(add(g, mesh(boxG(.05, .1, .14), blu), 0, .05, -.15), .007);
  // comic POW sign fin on top
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(.22, .22), new THREE.MeshStandardMaterial({ map: comicTex('POW!', '#ffe600', '#ff2a2a'), transparent: true, alphaTest: .4, side: THREE.DoubleSide, roughness: .6, emissive: 0xffffff, emissiveMap: comicTex('POW!', '#ffe600', '#ff2a2a'), emissiveIntensity: .25 }));
  sign.material.side = THREE.FrontSide; add(g, sign, .001, .23, .18, 0, PI / 2, 0); const sign2 = sign.clone(); add(g, sign2, -.001, .23, .18, 0, -PI / 2, 0);
  // ! sight
  outline(add(g, mesh(boxG(.014, .04, .014), red), 0, .19, .42), .005); outline(add(g, mesh(sphG(.009, 10, 8), red), 0, .16, .42), .004);
  // speed-line bands
  for (let i = 0; i < 3; i++) add(g, mesh(boxG(.004, .012, .16), ink), .067, .1 + (i - 1) * .025, .26);
  an.push((dt, t, firing) => { for (const s of [sign, sign2]) { s.rotation.z = Math.sin(t * 3) * .06; s.scale.setScalar(1 + Math.max(0, Math.sin(t * 6)) * .05); } });
  return [.57, .1];
};

BUILD.clock = (g, an) => {
  const gold = mat(0xe0a83a, { metalness: .9, roughness: .28 });
  const dgold = mat(0xa8741c, { metalness: .9, roughness: .4 });
  const wood = mat(0x7a4a26, { roughness: .7 });
  gripParts(g, wood);
  // bulbous body
  add(g, mesh(latheZ([[0, -.14], [.045, -.12], [.065, -.04], [.06, .06], [.04, .12], [.034, .16]], 28), gold), 0, .08, 0);
  // bell barrel
  add(g, mesh(latheZ([[.03, .14], [.032, .4], [.045, .5], [.075, .58], [.07, .585], [.04, .5], [.026, .4], [.026, .14]], 28), gold), 0, .08, 0);
  add(g, mesh(new THREE.TorusGeometry(.073, .006, 8, 28), neon(0xffc94a, 1.8)), 0, .08, .584);
  add(g, mesh(new THREE.CircleGeometry(.045, 24), neon(0xffb43a, 1.4)), 0, .08, .5);
  // the melting clock draped over the barrel
  const Rb = .036, pg = new THREE.PlaneGeometry(.2, .2, 28, 28), P = pg.attributes.position;
  for (let i = 0; i < P.count; i++) {
    const u = P.getX(i), v = P.getY(i); const th = u / Rb; let x, y;
    const lean = 1 + .5 * clamp((-v + .1) / .2, 0, 1);
    if (Math.abs(th) < PI / 2) { x = Math.sin(th) * Rb; y = Math.cos(th) * Rb; }
    else { const s = Math.sign(th), over = (Math.abs(th) - PI / 2) * Rb; x = s * (Rb + over * .12); y = -over * 1.5 * lean; }
    P.setXYZ(i, x, y, -v + Math.sin(u * 30) * .004);
  }
  pg.computeVertexNormals();
  const clockM = new THREE.MeshStandardMaterial({ map: texClock(true), transparent: true, alphaTest: .5, side: THREE.DoubleSide, roughness: .5 });
  const drape = add(g, mesh(pg, clockM), 0, .08 + .004, .32); drape.scale.set(1.03, 1, 1);
  // crutch supporting the drape
  add(g, mesh(new THREE.CylinderGeometry(.005, .005, .14, 6), wood), .05, .0, .36, 0, 0, .15);
  add(g, mesh(new THREE.TorusGeometry(.016, .004, 6, 12, PI), wood), .039, .072, .36, 0, PI / 2, PI);
  // pocket watch drum on the side (ticking hands)
  const pw = add(g, new THREE.Group(), 0, .19, -.04, 0, PI / 2, 0);
  add(pw, mesh(new THREE.CylinderGeometry(.05, .05, .018, 28), dgold), 0, 0, 0, PI / 2);
  add(pw, mesh(new THREE.CylinderGeometry(.008, .012, .04, 8), dgold), 0, -.06, 0);
  const hands = [];
  for (const s of [1, -1]) {
    const f = add(pw, new THREE.Group(), 0, 0, s * .0095, 0, s > 0 ? 0 : PI, 0);
    add(f, mesh(new THREE.CircleGeometry(.045, 28), new THREE.MeshStandardMaterial({ map: texClock(true), roughness: .4 })));
    const h1 = add(f, mesh(boxG(.004, .036, .002), INK()), 0, 0, .002), h2 = add(f, mesh(boxG(.003, .026, .002), INK()), 0, 0, .002);
    h1.geometry.translate(0, .016, 0); h2.geometry.translate(0, .011, 0); hands.push(h1, h2);
  }
  const hand1 = { rotation: { set z(v) { hands[0].rotation.z = v; hands[2].rotation.z = -v; } } }, hand2 = { rotation: { set z(v) { hands[1].rotation.z = v; hands[3].rotation.z = -v; } } };
  add(pw, mesh(new THREE.TorusGeometry(.012, .003, 6, 12), gold), 0, .058, 0, 0, PI / 2, 0);
  // ants (Dalí's favourite)
  for (let i = 0; i < 3; i++) { const a = add(g, new THREE.Group(), R(-.015, .015), .08 + Rb + .002, .27 + i * .025, 0, R(0, TAU)); add(a, mesh(sphG(.0035, 6, 4), INK()), 0, 0, .004); add(a, mesh(sphG(.0028, 6, 4), INK()), 0, 0, -.002); }
  // stock: long gold teardrop with elephant-leg spindles
  add(g, mesh(latheZ([[0, 0], [.04, .04], [.035, .2], [.012, .26], [0, .27]], 20), dgold), 0, .06, -.1, 0, PI, 0);
  for (const s of [-1, 1]) add(g, mesh(new THREE.CylinderGeometry(.003, .004, .2, 6), INK()), s * .02, -.05, -.22, .4);
  an.push((dt, t, firing) => { hand1.rotation.z = -t * (firing ? 14 : .8); hand2.rotation.z = -t * (firing ? 1.4 : .07); drape.scale.y = 1 + Math.sin(t * 1.3) * .06; });
  return [.59, .08];
};

BUILD.glitter = (g, an) => {
  const gt = texGlitter('#c2187f');
  const pink = new THREE.MeshStandardMaterial({ color: 0xffffff, map: gt, metalness: .75, roughness: .28, emissive: 0xffffff, emissiveMap: gt, emissiveIntensity: .35 });
  const purp = new THREE.MeshStandardMaterial({ color: 0xffffff, map: texGlitter('#5b22b0'), metalness: .75, roughness: .3, emissive: 0xffffff, emissiveMap: texGlitter('#5b22b0'), emissiveIntensity: .3 });
  const chrome = mat(0xf0f0ff, { metalness: 1, roughness: .12 });
  gripParts(g, purp, { guard: chrome });
  add(g, mesh(boxG(.06, .07, .22), pink), 0, .07, .04);
  for (const s of [-1, 1]) add(g, mesh(cylZ(.021, .021, .44, 18), chrome), s * .021, .085, .36);
  for (const s of [-1, 1]) add(g, mesh(new THREE.TorusGeometry(.022, .004, 6, 18), neon(0xff7ad9, 2)), s * .021, .085, .58);
  add(g, mesh(boxG(.07, .045, .15), purp), 0, .045, .32); // pump
  for (const z of [.26, .38]) add(g, mesh(boxG(.074, .05, .012), mat(0xffd84a, { metalness: 1, roughness: .2 })), 0, .045, z);
  // stock
  const sg = latheZ([[.0, 0], [.035, .02], [.04, .2], [.05, .24], [0, .25]], 4); const stock = add(g, mesh(sg, pink), 0, .05, -.06, 0, PI, PI / 4); stock.scale.set(.8, 1.3, 1);
  // disco ball
  const disco = new THREE.MeshStandardMaterial({ color: 0xdfe6ff, metalness: 1, roughness: .08, flatShading: true, emissive: 0x6655aa, emissiveIntensity: .25 });
  const ball = add(g, mesh(new THREE.IcosahedronGeometry(.05, 2), disco), 0, .15, .06);
  add(g, mesh(new THREE.CylinderGeometry(.004, .004, .03, 6), chrome), 0, .11, .06);
  // sparkle stars
  const sp = []; const starG = (() => { const s = new THREE.Shape(); for (let i = 0; i < 8; i++) { const a = i / 8 * TAU, r = i % 2 ? .004 : .016; s.lineTo(Math.cos(a) * r, Math.sin(a) * r); } return new THREE.ShapeGeometry(s); })();
  for (let i = 0; i < 6; i++) { const m = neon(0xffffff, 3, { side: THREE.DoubleSide }); const s = add(g, mesh(starG, m), R(-.06, .06), R(.05, .2), R(-.05, .55)); s.userData.ph = R(0, TAU); sp.push(s); }
  an.push((dt, t, firing) => {
    ball.rotation.y += dt * (firing ? 8 : 1.2);
    pink.emissiveIntensity = .3 + Math.max(0, Math.sin(t * 13)) * .25;
    sp.forEach(s => { const k = Math.max(0, Math.sin(t * 4 + s.userData.ph)); s.scale.setScalar(.2 + k * 1.1); s.rotation.z = t * 2 + s.userData.ph; });
  });
  return [.6, .085];
};

// shared iridescent bubble material (works for Mesh and InstancedMesh)
let _bubbleMat = null;
function bubbleMat() {
  if (_bubbleMat) return _bubbleMat;
  _bubbleMat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 } }, transparent: true, depthWrite: false,
    vertexShader: `varying vec3 vN; varying vec3 vV; varying vec3 vP;
      void main(){ vec4 p = vec4(position,1.);
        #ifdef USE_INSTANCING
        p = instanceMatrix * p; vec3 n = mat3(instanceMatrix) * normal;
        #else
        vec3 n = normal;
        #endif
        vec4 w = modelMatrix * p; vP = position; vN = normalize(mat3(modelMatrix) * n); vV = normalize(cameraPosition - w.xyz);
        gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: `uniform float uTime; varying vec3 vN; varying vec3 vV; varying vec3 vP;
      void main(){ vec3 n = normalize(vN); float f = 1. - abs(dot(n, normalize(vV)));
        float ph = f*6. + vP.y*3. + uTime*.8;
        vec3 ir = .5 + .5*cos(6.2831*(vec3(0.,.33,.67) + ph));
        float spec = pow(max(dot(n, normalize(vec3(.4,.8,.3))),0.), 60.);
        float a = .14 + pow(f, 1.8)*.85 + spec;
        vec3 col = mix(vec3(.85,.95,1.), ir, .9) * (.7 + f*1.3) + spec*3.;
        gl_FragColor = vec4(col, clamp(a,0.,1.));
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  return _bubbleMat;
}

BUILD.bubble = (g, an) => {
  const sky = mat(0xffffff, { map: texSky(), roughness: .6 });
  const ink = mat(0x141416, { roughness: .45 }), briar = mat(0x5a2e16, { roughness: .35, metalness: .1 });
  gripParts(g, mat(0x2a2a30, { roughness: .5 }));
  add(g, mesh(capZ(.05, .12), sky), 0, .072, .04);
  // the pipe: black stem forward, upright briar bowl at the front (bubbles come out of the bowl)
  add(g, mesh(cylZ(.011, .015, .16, 14), ink), 0, .072, .19);
  add(g, mesh(new THREE.TorusGeometry(.016, .004, 6, 16), mat(0xd9b45a, { metalness: .9, roughness: .3 })), 0, .072, .27);
  add(g, mesh(cylZ(.015, .019, .04, 14), briar), 0, .07, .29);
  const bowlG = new THREE.LatheGeometry([[0, -.045], [.026, -.045], [.036, -.03], [.04, .0], [.039, .035], [.035, .04], [.029, .04], [.029, -.032], [0, -.032]].map(p => new THREE.Vector2(p[0], p[1])), 24);
  add(g, mesh(bowlG, briar), 0, .085, .325, -.12);
  add(g, mesh(new THREE.CircleGeometry(.029, 20), mat(0x1a0d06, { roughness: .9 })), 0, .118, .329, -PI / 2 - .12);
  // bubble film forming on the bowl
  const bub = add(g, mesh(sphG(1, 24, 16), bubbleMat()), 0, .13, .33); bub.castShadow = false;
  // red tie on the grip (the man in the bowler hat)
  const tie = new THREE.Shape(); tie.moveTo(0, 0); tie.lineTo(.008, -.008); tie.lineTo(.012, -.05); tie.lineTo(0, -.062); tie.lineTo(-.012, -.05); tie.lineTo(-.008, -.008); tie.closePath();
  add(g, mesh(new THREE.ExtrudeGeometry(tie, { depth: .004, bevelEnabled: false }), mat(0xc81e2a, { roughness: .5 })), 0, -.005, .018, -.28);
  // bowler hat
  const hat = add(g, new THREE.Group(), 0, .122, .0);
  const brim = new THREE.LatheGeometry([[.03, .004], [.068, .006], [.074, .012], [.07, .0], [.03, -.002]].map(p => new THREE.Vector2(p[0], p[1])), 28);
  add(hat, mesh(brim, ink));
  const crown = add(hat, mesh(new THREE.SphereGeometry(.046, 24, 14, 0, TAU, 0, PI / 2), ink)); crown.scale.y = 1.3;
  add(hat, mesh(new THREE.CylinderGeometry(.047, .047, .014, 24, 1, true), mat(0x3a1c10, { roughness: .6 })), 0, .008);
  // green apple pommel + leaf
  const apple = add(g, mesh(sphG(.03, 18, 14), mat(0x6fc23a, { roughness: .35 })), 0, -.12, -.04); apple.scale.y = .9;
  add(g, mesh(new THREE.CylinderGeometry(.002, .002, .02, 5), mat(0x4a2c14)), 0, -.15, -.04, PI);
  const leaf = new THREE.Mesh(new THREE.SphereGeometry(.012, 8, 6), mat(0x2e8a2a, { roughness: .5 })); leaf.scale.set(1.6, .2, .7); add(g, leaf, .012, -.148, -.035, 0, 0, .4);
  // plaque
  for (const s of [-1, 1]) add(g, mesh(new THREE.PlaneGeometry(.13, .024), mat(0xffffff, { map: texPlaque(), roughness: .7 })), s * .0475, .062, .07, 0, s * PI / 2, 0);
  // little cloud puffs drifting on top
  for (let i = 0; i < 5; i++) add(g, mesh(sphG(.016 + (i % 2) * .006, 10, 8), mat(0xffffff, { roughness: .9 })), (i % 2 ? 1 : -1) * .012, .115 + (i % 2) * .008, .1 + i * .016);
  an.push((dt, t, firing) => { const u = (t * .6) % 1; bub.scale.setScalar(.01 + u * .04); bub.position.y = .13 + u * .04; bub.position.z = .33 + u * .03; hat.rotation.y = Math.sin(t * 1.5) * .2; hat.position.y = .122 + Math.max(0, Math.sin(t * 2)) * .004; });
  return [.36, .125];
};

BUILD.neon = (g, an) => {
  const har = mat(0xffffff, { map: texHaring(), roughness: .5 });
  const kan = mat(0xffffff, { map: texKandinsky(), roughness: .55 });
  const yel = mat(0xffd400, { roughness: .45 }), red = mat(0xff2a2a, { roughness: .45 }), blu = mat(0x1f5bff, { roughness: .45 });
  outline(gripParts(g, red), .005);
  outline(add(g, mesh(boxG(.07, .1, .3), mat(0xfbfbf4, { roughness: .5 })), 0, .075, .07), .007);
  for (const s of [-1, 1]) add(g, mesh(new THREE.PlaneGeometry(.29, .095), har), s * .0362, .075, .07, 0, s * PI / 2, 0);
  add(g, mesh(new THREE.PlaneGeometry(.06, .2), kan), 0, .1255, .02, -PI / 2, 0, 0);
  // stock: open yellow frame
  outline(add(g, mesh(boxG(.03, .025, .2), yel), 0, .1, -.15), .005); outline(add(g, mesh(boxG(.03, .022, .2), yel), 0, .02, -.15, .25), .005); outline(add(g, mesh(boxG(.034, .11, .03), blu), 0, .055, -.26), .005);
  // coils (heat glow)
  const coilM = neon(0xff3a8a, 1); const coils = [];
  for (let i = 0; i < 4; i++) coils.push(add(g, mesh(new THREE.TorusGeometry(.03, .007, 8, 24), coilM), 0, .075, .25 + i * .03));
  add(g, mesh(cylZ(.016, .016, .2, 12), mat(0x222, { metalness: .7, roughness: .3 })), 0, .075, .3);
  // Kandinsky concentric emitter discs
  const disc = add(g, new THREE.Group(), 0, .075, .42);
  const kc = [0x1f5bff, 0xffd400, 0xff2a2a, 0x111111, 0x2ecf6a, 0xffffff];
  kc.forEach((c, i) => { const m = c === 0xffffff ? neon(0xffffff, 2.5) : mat(c, { roughness: .4 }); outline(add(disc, mesh(cylZ(.075 - i * .012, .075 - i * .012, .02, 32), m), 0, 0, i * .012), .003); });
  const lens = add(disc, mesh(sphG(.014, 14, 10), neon(0x39ff88, 3)), 0, 0, .08);
  // Haring radiant lines around emitter
  const rad = add(g, new THREE.Group(), 0, .075, .44);
  for (let i = 0; i < 10; i++) { const a = i / 10 * TAU; const d = add(rad, mesh(boxG(.007, .03, .007), INK()), Math.cos(a) * .1, Math.sin(a) * .1, 0, 0, 0, a - PI / 2); }
  // top handle
  outline(add(g, mesh(boxG(.02, .02, .16), blu), 0, .155, .07), .005); outline(add(g, mesh(boxG(.02, .04, .02), blu), 0, .135, .0), .004); outline(add(g, mesh(boxG(.02, .04, .02), blu), 0, .135, .14), .004);
  const hc = new THREE.Color();
  an.push((dt, t, firing, heat) => {
    hc.setHSL((t * .25) % 1, 1, .55); lens.material.emissive.copy(hc); lens.material.emissiveIntensity = firing ? 5 : 2.5;
    coilM.emissive.setRGB(1, .2 + heat * .7, .5 - heat * .3); coilM.emissiveIntensity = .6 + heat * 4 + (firing ? 1 : 0);
    disc.rotation.z += dt * (firing ? 6 : .5); rad.rotation.z = Math.sin(t * 2) * .2; rad.scale.setScalar(1 + (firing ? Math.sin(t * 30) * .08 : 0));
  });
  return [.51, .075];
};

BUILD.firework = (g, an) => {
  const paper = mat(0xffffff, { map: texFirework(), roughness: .7 });
  const gold = mat(0xffc93a, { metalness: .9, roughness: .3 });
  gripParts(g, mat(0x2a2a2e, { roughness: .5 }));
  add(g, mesh(boxG(.034, .1, .045), mat(0x2a2a2e)), 0, .0, .3, -.2);
  const cl = add(g, new THREE.Group(), 0, .13, .16);
  const noseCols = [0x3aa8ff, 0x3cff9a, 0xffd23a, 0xff5ff0];
  for (let i = 0; i < 4; i++) {
    const a = i / 4 * TAU + PI / 4, x = Math.cos(a) * .042, y = Math.sin(a) * .042;
    add(cl, mesh(cylZ(.034, .034, .56, 18, true), mat(0xffffff, { map: texFirework(), roughness: .7, side: THREE.DoubleSide })), x, y, .1);
    add(cl, mesh(new THREE.TorusGeometry(.034, .004, 6, 18), gold), x, y, .38);
    const nose = add(cl, mesh(new THREE.ConeGeometry(.024, .06, 14), mat(noseCols[i], { roughness: .3, emissive: noseCols[i], emissiveIntensity: .25 })), x, y, .35, PI / 2);
    add(cl, mesh(cylZ(.024, .024, .05, 12), mat(0xf5f0e0)), x, y, .3);
    add(cl, mesh(cylZ(.02, .036, .05, 18, true), mat(0x1a1a1a, { roughness: .9, side: THREE.DoubleSide })), x, y, -.2);
  }
  for (const z of [-.08, .16]) add(cl, mesh(cylZ(.085, .085, .03, 28), gold), 0, 0, z);
  add(cl, mesh(cylZ(.03, .03, .5, 12), mat(0x1a1a1a)), 0, 0, .08);
  // fuse with spark
  const fp = []; for (let i = 0; i <= 12; i++) fp.push(new THREE.Vector3(Math.sin(i * .9) * .012, .09 + i * .007, -.15 - i * .006));
  add(g, mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(fp), 24, .003, 5), mat(0xd9c38f, { roughness: .9 })), 0, .13, 0);
  const spark = add(g, mesh(new THREE.IcosahedronGeometry(.008, 0), neon(0xffb43a, 4)), 0, .13 + .09 + .084, -.15 - .072);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: A().glowMap, color: 0xffa23a, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true })); glow.scale.setScalar(.07); spark.add(glow);
  // shoulder pad
  add(g, mesh(boxG(.06, .08, .1), mat(0xd4202c, { roughness: .6 })), 0, .07, -.12);
  an.push((dt, t, firing) => { cl.rotation.z += dt * (firing ? 10 : .4); const f = .6 + Math.random() * .8; spark.scale.setScalar(f); glow.scale.setScalar(.05 + Math.random() * .06); });
  return [.54, .13];
};

BUILD.confetti = (g, an, st) => {
  const stripes = mat(0xffffff, { map: texRainbow(), roughness: .4 });
  const gold = mat(0xffd23a, { metalness: .9, roughness: .25 });
  const dark = mat(0x23233a, { roughness: .4, metalness: .3 });
  gripParts(g, dark);
  add(g, mesh(boxG(.034, .1, .045), dark), 0, -.0, .32, -.25);
  add(g, mesh(boxG(.09, .1, .22), stripes), 0, .075, .03);
  add(g, mesh(cylZ(.05, .05, .08, 24), dark), 0, .075, .17);
  const motorM = neon(0xff4fd8, 1); add(g, mesh(new THREE.TorusGeometry(.05, .008, 8, 24), motorM), 0, .075, .14);
  const bar = add(g, new THREE.Group(), 0, .075, .2);
  PAL.confetti.slice(0, 6).forEach((c, i) => { const a = i / 6 * TAU; add(bar, mesh(cylZ(.012, .012, .5, 10), mat(c, { roughness: .3, emissive: c, emissiveIntensity: .3 })), Math.cos(a) * .03, Math.sin(a) * .03, .27); });
  for (const z of [.12, .32, .5]) add(bar, mesh(new THREE.TorusGeometry(.044, .007, 8, 24), gold), 0, 0, z);
  add(bar, mesh(cylZ(.015, .015, .5, 10), dark), 0, 0, .27);
  // clear hopper full of confetti
  const hop = add(g, new THREE.Group(), 0, .17, -.01);
  const glass = new THREE.MeshStandardMaterial({ color: 0xd8f6ff, transparent: true, opacity: .28, roughness: .05, metalness: .1, depthWrite: false });
  add(hop, mesh(boxG(.1, .09, .14), glass)).castShadow = false;
  const fl = new THREE.InstancedMesh(new THREE.PlaneGeometry(.014, .009), new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, roughness: .5 }), 70);
  for (let i = 0; i < 70; i++) { _m1.compose(_v1.set(R(-.045, .045), R(-.04, .02), R(-.065, .065)), _q1.setFromEuler(_e1.set(R(0, TAU), R(0, TAU), 0)), _ONE); fl.setMatrixAt(i, _m1); fl.setColorAt(i, _c1.set(pick(PAL.confetti))); }
  hop.add(fl);
  add(hop, mesh(boxG(.104, .01, .144), gold), 0, .048);
  // carry handle
  add(g, mesh(new THREE.TorusGeometry(.05, .007, 8, 16, PI), dark), 0, .24, .03, 0, PI / 2, 0);
  st.spin = 0;
  an.push((dt, t, firing, heat) => {
    st.spin += ((firing ? 1 : 0) - st.spin) * Math.min(1, dt * (firing ? 2.4 : 1.2));
    bar.rotation.z += dt * (st.spin * 40 + .3);
    motorM.emissiveIntensity = .5 + heat * 4 + st.spin * 1.5;
    if (firing) { fl.position.set(R(-.003, .003), R(-.003, .003), 0); hop.rotation.z = Math.sin(t * 40) * .02; }
  });
  return [.76, .075];
};

export function buildGun(id) {
  A(); const def = DEF[id] || DEF[START_WEAPON];
  const g = new THREE.Group(); g.name = 'gun_' + def.id;
  const an = [], st = {};
  const [mz, my] = BUILD[def.id](g, an, st);
  const muzzle = new THREE.Object3D(); muzzle.name = 'muzzle'; muzzle.position.set(0, my, mz);
  g.add(muzzle);
  g.traverse(o => { if (o.isMesh) { o.castShadow = o.material !== _outlineMat && !o.material.transparent; o.receiveShadow = true; } });
  return {
    g, muzzle, def, state: st,
    update(dt, t, firing = false, heat = 0) { for (let i = 0; i < an.length; i++) an[i](dt, t, firing, heat); },
  };
}

// ============================================================ particle shaders / atlas
function atlasTex() {
  return tex('atlas', () => {
    const [c, x] = cnv(256, 256); const S = 64;
    const cell = (i, f) => { x.save(); x.translate((i % 4) * S, ((i / 4) | 0) * S); f(); x.restore(); };
    x.fillStyle = '#fff'; x.strokeStyle = '#fff';
    cell(0, () => { const g = x.createRadialGradient(32, 32, 0, 32, 32, 31); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(.3, 'rgba(255,255,255,.6)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, S, S); });
    cell(1, () => { const g = x.createRadialGradient(32, 32, 0, 32, 32, 12); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, S, S); x.fillStyle = '#fff'; x.beginPath(); for (let k = 0; k < 8; k++) { const a = k / 8 * TAU, r = k % 2 ? 3 : 30; x.lineTo(32 + Math.cos(a) * r, 32 + Math.sin(a) * r); } x.fill(); });
    cell(2, () => { x.beginPath(); x.arc(32, 32, 28, 0, TAU); x.fill(); });
    cell(3, () => { x.lineWidth = 6; x.beginPath(); x.arc(32, 32, 25, 0, TAU); x.stroke(); });
    cell(4, () => { x.beginPath(); for (let k = 0; k < 10; k++) { const a = k / 10 * TAU - PI / 2, r = k % 2 ? 12 : 29; x.lineTo(32 + Math.cos(a) * r, 32 + Math.sin(a) * r); } x.fill(); });
    cell(5, () => { for (let k = 0; k < 7; k++) { const g = x.createRadialGradient(0, 0, 0, 0, 0, 1); x.save(); const px = 32 + R(-10, 10), py = 32 + R(-10, 10), r = R(12, 20); x.translate(px, py); x.scale(r, r); g.addColorStop(0, 'rgba(255,255,255,.55)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.beginPath(); x.arc(0, 0, 1, 0, TAU); x.fill(); x.restore(); } });
    cell(6, () => { x.lineWidth = 5; x.lineCap = 'round'; x.beginPath(); for (let k = 0; k < 40; k++) { const a = k / 40 * TAU * 1.6, r = 4 + k * .65; x.lineTo(32 + Math.cos(a) * r, 32 + Math.sin(a) * r); } x.stroke(); });
    cell(7, () => { x.fillRect(16, 22, 32, 20); });
    return new THREE.CanvasTexture(c);
  });
}
const SH_ATLAS = { glow: 0, sparkle: 1, disc: 2, ring: 3, star: 4, smoke: 5, swirl: 6, square: 7 };
const PTS_VS = `attribute vec3 color; attribute float size; attribute float alpha; attribute float shape;
  uniform float uPx; uniform float uLight; varying vec3 vCol; varying float vA; varying vec2 vTile;
  void main(){ vec4 mv = modelViewMatrix * vec4(position,1.); gl_Position = projectionMatrix * mv;
    gl_PointSize = alpha > 0. ? clamp(size * uPx / max(-mv.z, .05), 0., 256.) : 0.;
    vCol = color * uLight; vA = alpha; vTile = vec2(mod(shape,4.), floor(shape/4.)); }`;
const PTS_FS = `uniform sampler2D uMap; varying vec3 vCol; varying float vA; varying vec2 vTile;
  void main(){ vec2 uv = vec2((vTile.x + gl_PointCoord.x) * .25, 1. - (vTile.y + gl_PointCoord.y) * .25);
    vec4 t = texture2D(uMap, uv); float a = t.a * vA; if (a < .01) discard;
    gl_FragColor = vec4(vCol * t.rgb, a);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;
const _bufSize = new THREE.Vector2();
class Pts {
  constructor(cap, additive) {
    this.cap = cap; this.n = 0; this.cur = 0; this.hi = 0;
    this.pos = new Float32Array(cap * 3); this.col = new Float32Array(cap * 3); this.size = new Float32Array(cap); this.alpha = new Float32Array(cap); this.shape = new Float32Array(cap);
    this.vel = new Float32Array(cap * 3); this.age = new Float32Array(cap); this.life = new Float32Array(cap); this.drag = new Float32Array(cap); this.grav = new Float32Array(cap);
    this.s0 = new Float32Array(cap); this.s1 = new Float32Array(cap); this.a0 = new Float32Array(cap); this.flick = new Uint8Array(cap);
    const geo = new THREE.BufferGeometry();
    const at = (name, arr, n) => { const a = new THREE.BufferAttribute(arr, n); a.setUsage(THREE.DynamicDrawUsage); geo.setAttribute(name, a); return a; };
    this.aPos = at('position', this.pos, 3); this.aCol = at('color', this.col, 3); this.aSize = at('size', this.size, 1); this.aAlpha = at('alpha', this.alpha, 1); this.aShape = at('shape', this.shape, 1);
    geo.setDrawRange(0, 0);
    const mat = new THREE.ShaderMaterial({ uniforms: { uMap: { value: atlasTex() }, uPx: { value: 500 }, uLight: { value: 1 } }, vertexShader: PTS_VS, fragmentShader: PTS_FS, transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending });
    this.obj = new THREE.Points(geo, mat); this.obj.frustumCulled = false; this.obj.renderOrder = additive ? 3 : 2;
    this.obj.onBeforeRender = (r, s, cam) => { r.getDrawingBufferSize(_bufSize); mat.uniforms.uPx.value = _bufSize.y * .5 * cam.projectionMatrix.elements[5]; };
  }
  spawn(x, y, z, vx, vy, vz, color, size, life, shape = 0, grav = 0, drag = 0, grow = 1, bright = 1, alpha = 1, flick = 0) {
    const i = this.cur; this.cur = (this.cur + 1) % this.cap; if (i + 1 > this.hi) this.hi = i + 1;
    const i3 = i * 3; this.pos[i3] = x; this.pos[i3 + 1] = y; this.pos[i3 + 2] = z; this.vel[i3] = vx; this.vel[i3 + 1] = vy; this.vel[i3 + 2] = vz;
    _c1.set(color); this.col[i3] = _c1.r * bright; this.col[i3 + 1] = _c1.g * bright; this.col[i3 + 2] = _c1.b * bright;
    this.size[i] = size; this.s0[i] = size; this.s1[i] = size * grow; this.age[i] = 0; this.life[i] = life; this.shape[i] = shape; this.grav[i] = grav; this.drag[i] = drag; this.alpha[i] = alpha; this.a0[i] = alpha; this.flick[i] = flick;
  }
  update(dt) {
    let any = 0;
    for (let i = 0; i < this.hi; i++) {
      if (this.life[i] <= 0) continue;
      const age = this.age[i] += dt, L = this.life[i];
      if (age >= L) { this.life[i] = 0; this.alpha[i] = 0; continue; }
      any++;
      const i3 = i * 3, d = Math.max(0, 1 - this.drag[i] * dt);
      this.vel[i3] *= d; this.vel[i3 + 1] = this.vel[i3 + 1] * d - this.grav[i] * dt; this.vel[i3 + 2] *= d;
      this.pos[i3] += this.vel[i3] * dt; this.pos[i3 + 1] += this.vel[i3 + 1] * dt; this.pos[i3 + 2] += this.vel[i3 + 2] * dt;
      const u = age / L;
      this.size[i] = this.s0[i] + (this.s1[i] - this.s0[i]) * u;
      let a = this.a0[i] * (u < .7 ? 1 : 1 - (u - .7) / .3);
      if (this.flick[i]) a *= Math.random() < .35 ? .15 : 1;
      this.alpha[i] = a;
    }
    this.n = any;
    if (!any) { this.hi = 0; this.cur = 0; }
    const geo = this.obj.geometry; geo.setDrawRange(0, this.hi); this.obj.visible = this.hi > 0;
    if (this.hi) for (const a of [this.aPos, this.aCol, this.aSize, this.aAlpha, this.aShape]) { a.clearUpdateRanges(); a.addUpdateRange(0, this.hi * a.itemSize); a.needsUpdate = true; }
  }
  clear() { this.life.fill(0); this.alpha.fill(0); this.hi = 0; this.cur = 0; }
}

// halos: rewritten every frame from live projectiles
class Halo {
  constructor(cap) {
    this.cap = cap; this.n = 0;
    this.pos = new Float32Array(cap * 3); this.col = new Float32Array(cap * 3); this.size = new Float32Array(cap); this.alpha = new Float32Array(cap); this.shape = new Float32Array(cap);
    const geo = new THREE.BufferGeometry(); this.attrs = [];
    for (const [n, a, k] of [['position', this.pos, 3], ['color', this.col, 3], ['size', this.size, 1], ['alpha', this.alpha, 1], ['shape', this.shape, 1]]) { const b = new THREE.BufferAttribute(a, k); b.setUsage(THREE.DynamicDrawUsage); geo.setAttribute(n, b); this.attrs.push(b); }
    const mat = new THREE.ShaderMaterial({ uniforms: { uMap: { value: atlasTex() }, uPx: { value: 500 }, uLight: { value: 1 } }, vertexShader: PTS_VS, fragmentShader: PTS_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    this.obj = new THREE.Points(geo, mat); this.obj.frustumCulled = false; this.obj.renderOrder = 4;
    this.obj.onBeforeRender = (r, s, cam) => { r.getDrawingBufferSize(_bufSize); mat.uniforms.uPx.value = _bufSize.y * .5 * cam.projectionMatrix.elements[5]; };
  }
  begin() { this.n = 0; }
  put(x, y, z, r, g, b, size, shape = 0, alpha = 1) {
    if (this.n >= this.cap) return; const i = this.n++, i3 = i * 3;
    this.pos[i3] = x; this.pos[i3 + 1] = y; this.pos[i3 + 2] = z; this.col[i3] = r; this.col[i3 + 1] = g; this.col[i3 + 2] = b; this.size[i] = size; this.shape[i] = shape; this.alpha[i] = alpha;
  }
  end() { this.obj.geometry.setDrawRange(0, this.n); this.obj.visible = this.n > 0; if (this.n) for (const a of this.attrs) { a.clearUpdateRanges(); a.addUpdateRange(0, this.n * a.itemSize); a.needsUpdate = true; } }
}

// ============================================================ decals (ground splats)
function decalAtlas() {
  return tex('decalAtlas', () => {
    const [c, x] = cnv(512, 512); x.fillStyle = '#fff'; x.strokeStyle = '#fff';
    // 0: Pollock splatter (white mask)
    x.save(); x.beginPath(); x.rect(0, 0, 256, 256); x.clip();
    x.beginPath(); x.arc(128, 128, 46, 0, TAU); x.fill();
    for (let i = 0; i < 26; i++) { const a = R(0, TAU), r = R(40, 110); x.lineCap = 'round'; x.lineWidth = R(3, 10); x.beginPath(); x.moveTo(128, 128); x.quadraticCurveTo(128 + Math.cos(a + R(-.4, .4)) * r * .6, 128 + Math.sin(a + R(-.4, .4)) * r * .6, 128 + Math.cos(a) * r, 128 + Math.sin(a) * r); x.stroke(); x.beginPath(); x.arc(128 + Math.cos(a) * r, 128 + Math.sin(a) * r, R(3, 9), 0, TAU); x.fill(); }
    for (let i = 0; i < 70; i++) { const a = R(0, TAU), r = R(50, 124); x.beginPath(); x.arc(128 + Math.cos(a) * r, 128 + Math.sin(a) * r, R(1, 5), 0, TAU); x.fill(); }
    x.restore();
    // 1: polka dot cluster
    x.save(); x.translate(256, 0);
    x.beginPath(); x.arc(128, 128, 50, 0, TAU); x.fill();
    for (let i = 0; i < 22; i++) { const a = R(0, TAU), r = R(60, 115); x.beginPath(); x.arc(128 + Math.cos(a) * r, 128 + Math.sin(a) * r, R(5, 14) * (1.3 - r / 130), 0, TAU); x.fill(); }
    x.restore();
    // 2: glitter speckle
    x.save(); x.translate(0, 256);
    for (let i = 0; i < 900; i++) { const a = R(0, TAU), r = Math.pow(Math.random(), .7) * 118; x.globalAlpha = R(.4, 1); const s = R(1.5, 4); x.fillRect(128 + Math.cos(a) * r, 128 + Math.sin(a) * r, s, s); }
    x.globalAlpha = 1; x.restore();
    // 3: melted clock puddle
    x.save(); x.translate(256, 256);
    x.beginPath(); for (let k = 0; k <= 40; k++) { const a = k / 40 * TAU, r = 92 + Math.sin(a * 3) * 10 + (Math.sin(a) > .3 ? Math.pow(Math.sin(a), 6) * 30 : 0); x.lineTo(128 + Math.cos(a) * r * 1.15, 128 + Math.sin(a) * r * .85); } x.fill();
    x.globalCompositeOperation = 'destination-out'; x.lineWidth = 5;
    x.beginPath(); x.ellipse(128, 128, 84, 64, 0, 0, TAU); x.stroke();
    for (let i = 0; i < 12; i++) { const a = i / 12 * TAU; x.fillRect(128 + Math.cos(a) * 66 * 1.12 - 3, 128 + Math.sin(a) * 50 - 5, 6, 10); }
    x.lineWidth = 6; x.beginPath(); x.moveTo(128, 128); x.lineTo(160, 96); x.moveTo(128, 128); x.lineTo(118, 80); x.stroke();
    x.restore();
    const t = new THREE.CanvasTexture(c); t.anisotropy = 4; return t;
  });
}
const DECAL_STYLE = { paint: 0, dots: 1, glitter: 2, clock: 3 };

// ============================================================ comic & effect sprites
function effectTex(effect) {
  return tex('fx_' + effect, () => {
    const [c, x] = cnv(256, 256); x.lineJoin = 'round'; x.lineCap = 'round';
    const star = (cx, cy, r, fill) => { x.beginPath(); for (let k = 0; k < 10; k++) { const a = k / 10 * TAU - PI / 2, rr = k % 2 ? r * .45 : r; x.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); } x.closePath(); x.lineWidth = 8; x.strokeStyle = '#111'; x.stroke(); x.fillStyle = fill; x.fill(); };
    const txt = (s, cx, cy, size, fill) => { x.font = '900 ' + size + 'px "Arial Black", Impact, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.lineWidth = size * .18; x.strokeStyle = '#111'; x.strokeText(s, cx, cy); x.fillStyle = fill; x.fillText(s, cx, cy); };
    if (effect === 'stun') { x.lineWidth = 6; x.strokeStyle = 'rgba(255,255,255,.7)'; x.beginPath(); x.ellipse(128, 128, 100, 38, 0, 0, TAU); x.stroke(); for (let i = 0; i < 5; i++) { const a = i / 5 * TAU; star(128 + Math.cos(a) * 100, 128 + Math.sin(a) * 38, i % 2 ? 26 : 32, i % 2 ? '#fff27a' : '#ffcf1a'); } }
    else if (effect === 'confuse') { x.lineWidth = 10; x.strokeStyle = '#ff4fd8'; x.beginPath(); for (let k = 0; k < 60; k++) { const a = k / 60 * TAU * 2.2, r = 10 + k * 1.6; x.lineTo(128 + Math.cos(a) * r, 128 + Math.sin(a) * r * .5 + 30); } x.stroke(); txt('?', 92, 92, 120, '#ff3b5c'); txt('?', 175, 110, 80, '#3fd0ff'); }
    else if (effect === 'blind') { for (let i = 0; i < 9; i++) { const px = R(30, 226), py = R(30, 226), r = R(12, 30); x.fillStyle = pick(['#fff', '#ffe98a', '#ff9ae8', '#a8f0ff']); x.beginPath(); for (let k = 0; k < 8; k++) { const a = k / 8 * TAU, rr = k % 2 ? r * .2 : r; x.lineTo(px + Math.cos(a) * rr, py + Math.sin(a) * rr); } x.fill(); } x.fillStyle = '#111'; x.fillRect(48, 112, 160, 10); x.beginPath(); x.ellipse(88, 128, 36, 24, 0, 0, TAU); x.ellipse(168, 128, 36, 24, 0, 0, TAU); x.fill(); x.fillStyle = '#ff5fd2'; x.beginPath(); x.ellipse(80, 122, 10, 6, 0, 0, TAU); x.ellipse(160, 122, 10, 6, 0, 0, TAU); x.fill(); }
    else if (effect === 'slow') { x.fillStyle = '#f6edd2'; x.strokeStyle = '#111'; x.lineWidth = 7; x.beginPath(); x.moveTo(60, 70); x.bezierCurveTo(60, 20, 190, 20, 190, 80); x.bezierCurveTo(190, 120, 170, 150, 175, 210); x.bezierCurveTo(176, 230, 150, 230, 150, 205); x.bezierCurveTo(148, 160, 110, 170, 80, 150); x.bezierCurveTo(56, 135, 60, 110, 60, 70); x.fill(); x.stroke(); x.lineWidth = 6; x.beginPath(); x.moveTo(124, 80); x.lineTo(124, 46); x.moveTo(124, 80); x.lineTo(150, 96); x.stroke(); txt('z', 210, 60, 50, '#8fd0ff'); txt('Z', 226, 26, 40, '#8fd0ff'); }
    else if (effect === 'knockback') { x.beginPath(); for (let k = 0; k < 24; k++) { const a = k / 24 * TAU, r = k % 2 ? 70 : 115; x.lineTo(128 + Math.cos(a) * r, 128 + Math.sin(a) * r); } x.closePath(); x.fillStyle = '#ffe600'; x.fill(); x.lineWidth = 8; x.strokeStyle = '#111'; x.stroke(); txt('!', 128, 134, 130, '#ff2a2a'); }
    else if (effect === 'trap') { const g = x.createRadialGradient(108, 100, 10, 128, 128, 110); g.addColorStop(0, 'rgba(255,255,255,.1)'); g.addColorStop(.8, 'rgba(160,220,255,.35)'); g.addColorStop(1, 'rgba(255,190,255,.9)'); x.fillStyle = g; x.beginPath(); x.arc(128, 128, 110, 0, TAU); x.fill(); x.fillStyle = 'rgba(255,255,255,.9)'; x.beginPath(); x.ellipse(90, 82, 26, 14, -.6, 0, TAU); x.fill(); x.fillStyle = '#141416'; x.beginPath(); x.ellipse(128, 150, 50, 10, 0, 0, TAU); x.fill(); x.beginPath(); x.ellipse(128, 132, 32, 34, 0, PI, TAU); x.fill(); }
    else txt('!', 128, 128, 120, '#fff');
    return ctex(c);
  });
}
export function hitEffectSprite(effect) {
  const m = new THREE.SpriteMaterial({ map: effectTex(effect), transparent: true, depthWrite: false, depthTest: true });
  const s = new THREE.Sprite(m); s.scale.setScalar(1.1); s.renderOrder = 5; s.userData.effect = effect;
  const ph = Math.random() * TAU;
  s.userData.update = (dt, t) => {
    if (effect === 'stun') { m.rotation = 0; s.scale.set(.95 + Math.sin(t * 6 + ph) * .05, .95, 1); }
    else if (effect === 'confuse') { m.rotation = Math.sin(t * 3 + ph) * .35; }
    else if (effect === 'blind') { s.scale.setScalar(.85 + Math.abs(Math.sin(t * 8 + ph)) * .2); }
    else if (effect === 'slow') { m.rotation = Math.sin(t * 1.2 + ph) * .15; }
    else if (effect === 'knockback') { s.scale.setScalar(.8 + Math.abs(Math.sin(t * 10)) * .25); }
    else if (effect === 'trap') { m.rotation = t * .5; }
  };
  return s;
}

// ============================================================ projectile visuals
function starGeo() {
  const s = new THREE.Shape(); for (let k = 0; k < 10; k++) { const a = k / 10 * TAU + PI / 2, r = k % 2 ? .45 : 1; if (k) s.lineTo(Math.cos(a) * r, Math.sin(a) * r); else s.moveTo(Math.cos(a) * r, Math.sin(a) * r); }
  const g = new THREE.ExtrudeGeometry(s, { depth: .35, bevelEnabled: true, bevelSize: .12, bevelThickness: .12, bevelSegments: 1 }); g.center(); return g;
}
function rocketGeo() {
  const parts = [new THREE.CylinderGeometry(.045, .045, .3, 10), new THREE.ConeGeometry(.045, .12, 10), new THREE.BoxGeometry(.14, .08, .008), new THREE.BoxGeometry(.008, .08, .14)];
  parts[1].translate(0, .21, 0); parts[2].translate(0, -.12, 0); parts[3].translate(0, -.12, 0);
  const pos = [], nor = []; for (const p of parts) { const q = p.index ? p.toNonIndexed() : p; pos.push(...q.attributes.position.array); nor.push(...q.attributes.normal.array); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g.rotateX(PI / 2); return g;
}
// emissive = instance color * k (so instanced projectiles glow per-instance)
function glowInst(m, k) {
  m.onBeforeCompile = (sh) => { sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\n#ifdef USE_INSTANCING_COLOR\n totalEmissiveRadiance += vColor.rgb * ${k.toFixed(3)};\n#endif`); };
  m.customProgramCacheKey = () => 'glowInst' + k; return m;
}

// ============================================================ the weapon system
const MAX_PROJ = 400;
export function createWeaponSystem(scene, camera) {
  A();
  const root = new THREE.Group(); root.name = 'weapons-fx'; scene.add(root);
  // ---- instanced projectile kinds
  const KIND = {};
  const mkKind = (name, geo, m, cap, opt = {}) => {
    const im = new THREE.InstancedMesh(geo, m, cap); im.instanceMatrix.setUsage(THREE.DynamicDrawUsage); im.count = 0; im.frustumCulled = false; im.castShadow = !!opt.shadow;
    im.setColorAt(0, _c1.set(0xffffff)); im.instanceColor.setUsage(THREE.DynamicDrawUsage); im.visible = false; root.add(im);
    KIND[name] = Object.assign({ name, im, n: 0, cap }, opt); return KIND[name];
  };
  mkKind('blob', new THREE.IcosahedronGeometry(1, 2), glowInst(new THREE.MeshStandardMaterial({ roughness: .18, metalness: 0 }), .25), 220, { halo: 0, scale: .1 });
  mkKind('star', starGeo(), new THREE.MeshBasicMaterial({ color: 0xffffff }), 40, { halo: 1.1, haloCol: [1.5, 1.15, .3], scale: .22 });
  mkKind('dot', new THREE.SphereGeometry(1, 14, 10), glowInst(new THREE.MeshStandardMaterial({ roughness: .3 }), .55), 300, { halo: .22, scale: .085 });
  mkKind('shell', new THREE.SphereGeometry(1, 20, 14), new THREE.MeshStandardMaterial({ map: texHalftone('#ffe600', '#ff3b2f', 'yr'), roughness: .4, emissive: 0xffffff, emissiveMap: texHalftone('#ffe600', '#ff3b2f', 'yr'), emissiveIntensity: .35 }), 24, { halo: .9, haloCol: [1, .7, .1], scale: .14 });
  mkKind('orb', new THREE.SphereGeometry(1, 24, 16), new THREE.MeshStandardMaterial({ map: texClock(false), metalness: .3, roughness: .35, emissive: 0xffdd88, emissiveMap: texClock(false), emissiveIntensity: .9 }), 20, { halo: .8, haloCol: [1.1, .7, .2], scale: .2 });
  mkKind('glitter', new THREE.OctahedronGeometry(1), new THREE.MeshBasicMaterial({ color: 0xffffff }), 320, { halo: .35, scale: .045, haloShape: 1 });
  mkKind('bubble', new THREE.SphereGeometry(1, 24, 16), bubbleMat(), 40, { halo: 0, scale: .28 });
  mkKind('rocket', rocketGeo(), glowInst(new THREE.MeshStandardMaterial({ roughness: .35, metalness: .2 }), .3), 40, { halo: .9, haloCol: [2.4, 1.3, .4], scale: 1 });
  mkKind('flake', new THREE.PlaneGeometry(1, .62), glowInst(new THREE.MeshStandardMaterial({ roughness: .45, side: THREE.DoubleSide }), .35), 400, { halo: 0, scale: .1 });

  const halo = new Halo(MAX_PROJ + 16); root.add(halo.obj);
  const fxAdd = new Pts(3600, true), fxNorm = new Pts(1600, false); root.add(fxAdd.obj, fxNorm.obj);

  // ---- confetti flakes FX (impact flutter)
  const FLK = 700;
  const flkMesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, .62), glowInst(new THREE.MeshStandardMaterial({ roughness: .45, side: THREE.DoubleSide }), .25), FLK);
  flkMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); flkMesh.count = 0; flkMesh.frustumCulled = false; flkMesh.setColorAt(0, _c1.set(0xffffff)); flkMesh.instanceColor.setUsage(THREE.DynamicDrawUsage); root.add(flkMesh);
  const flk = Array.from({ length: FLK }, () => ({ life: 0, age: 0, p: new THREE.Vector3(), v: new THREE.Vector3(), rot: new THREE.Euler(), spin: new THREE.Vector3(), c: new THREE.Color(), s: .06, landed: false }));
  let flkCur = 0;
  const spawnFlake = (x, y, z, vx, vy, vz, color, life = R(2.5, 4)) => { const f = flk[flkCur]; flkCur = (flkCur + 1) % FLK; f.life = life; f.age = 0; f.p.set(x, y, z); f.v.set(vx, vy, vz); f.rot.set(R(0, TAU), R(0, TAU), R(0, TAU)); f.spin.set(R(-12, 12), R(-12, 12), R(-12, 12)); f.c.set(color); f.s = R(.05, .08); f.landed = false; };

  // ---- decals
  const DEC = 320;
  const decGeo = new THREE.PlaneGeometry(1, 1); decGeo.rotateX(-PI / 2);
  const decBirth = new Float32Array(DEC).fill(-1e5), decTile = new Float32Array(DEC);
  decGeo.setAttribute('iBirth', new THREE.InstancedBufferAttribute(decBirth, 1)); decGeo.setAttribute('iTile', new THREE.InstancedBufferAttribute(decTile, 1));
  const decU = { uTime: { value: 0 } };
  const decMat = new THREE.MeshStandardMaterial({ map: decalAtlas(), transparent: true, depthWrite: false, roughness: .55, metalness: 0, envMapIntensity: .5, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });
  decMat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = decU.uTime;
    sh.vertexShader = 'attribute float iBirth; attribute float iTile; uniform float uTime; varying float vFade; varying float vGl;\n' + sh.vertexShader.replace('#include <uv_vertex>', `#include <uv_vertex>
      vMapUv = (vMapUv + vec2(mod(iTile,2.), 1. - floor(iTile/2.))) * .5;
      float age = uTime - iBirth; vFade = smoothstep(0., .08, age) * (1. - smoothstep(30., 40., age)); vGl = step(1.5, iTile) * step(iTile, 2.5);`);
    sh.fragmentShader = 'uniform float uTime; varying float vFade; varying float vGl;\n' + sh.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>\n diffuseColor.a *= vFade;`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\n totalEmissiveRadiance += diffuseColor.rgb * vGl * (.25 + .9*step(.93, fract(sin(dot(floor(vMapUv*180.), vec2(12.9898,78.233)))*43758.5453 + uTime*.7)));`);
  };
  decMat.customProgramCacheKey = () => 'weaponDecal';
  const decMesh = new THREE.InstancedMesh(decGeo, decMat, DEC); decMesh.frustumCulled = false; decMesh.receiveShadow = true; decMesh.renderOrder = 1;
  decMesh.setColorAt(0, _c1.set(0xffffff));
  _m1.makeScale(0, 0, 0); for (let i = 0; i < DEC; i++) decMesh.setMatrixAt(i, _m1);
  decMesh.count = 0; root.add(decMesh);
  let decCur = 0;
  function splat(point, normalUp = true, color = 0xffffff, style = 'paint', size = 0) {
    const i = decCur; decCur = (decCur + 1) % DEC; if (decMesh.count < DEC) decMesh.count = Math.max(decMesh.count, i + 1);
    const tile = typeof style === 'number' ? style : (DECAL_STYLE[style] || 0);
    const s = size || (tile === 3 ? R(1.2, 1.6) : tile === 2 ? R(.4, .8) : R(.5, 1.1));
    if (normalUp && normalUp.isVector3) _q1.setFromUnitVectors(_UP, normalUp); else _q1.identity();
    _q2.setFromAxisAngle(_UP, R(0, TAU)); _q1.multiply(_q2);
    _v1.copy(point); if (normalUp && normalUp.isVector3) _v1.addScaledVector(normalUp, .02); else _v1.y += .025 + (i % 7) * .002;
    _m1.compose(_v1, _q1, _s1.set(s, 1, s * R(.8, 1.2))); decMesh.setMatrixAt(i, _m1); decMesh.setColorAt(i, _c1.set(color));
    decBirth[i] = time; decTile[i] = tile;
    decMesh.instanceMatrix.needsUpdate = true; decMesh.instanceColor.needsUpdate = true; decGeo.attributes.iBirth.needsUpdate = true; decGeo.attributes.iTile.needsUpdate = true;
  }

  // ---- POW sprites
  const powTex = [comicTex('POW!', '#ffe600', '#ff2a2a'), comicTex('BAM!', '#ff3b8a', '#ffe600'), comicTex('WHAM!', '#2ab0ff', '#ffe600'), comicTex('ZAP!', '#ffe600', '#1f6bff')];
  const pows = Array.from({ length: 6 }, () => { const m = new THREE.SpriteMaterial({ map: powTex[0], transparent: true, depthWrite: false }); const s = new THREE.Sprite(m); s.visible = false; s.renderOrder = 6; root.add(s); return { s, m, life: 0, age: 0, size: 3 }; });
  let powCur = 0;
  // ---- shockwave rings (flat)
  const rings = Array.from({ length: 8 }, () => { const m = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false, side: THREE.DoubleSide }); const o = new THREE.Mesh(new THREE.RingGeometry(.85, 1, 48).rotateX(-PI / 2), m); o.visible = false; o.renderOrder = 3; root.add(o); return { o, m, life: 0, age: 0, r: 1, col: new THREE.Color() }; });
  let ringCur = 0;
  const spawnRing = (p, r, color, life = .45, bright = 2) => { const k = rings[ringCur]; ringCur = (ringCur + 1) % rings.length; k.o.position.copy(p); k.o.position.y += .08; k.r = r; k.life = life; k.age = 0; k.col.set(color).multiplyScalar(Math.min(bright, 1.3)); k.o.visible = true; };
  // ---- slowed-time bubbles (Dalí)
  const timeMat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uA: { value: 1 } }, transparent: true, depthWrite: false, side: THREE.DoubleSide,
    vertexShader: `varying vec3 vN; varying vec3 vV; varying vec3 vP; void main(){ vec4 w = modelMatrix*vec4(position,1.); vP = position; vN = normalize(mat3(modelMatrix)*normal); vV = normalize(cameraPosition-w.xyz); gl_Position = projectionMatrix*viewMatrix*w; }`,
    fragmentShader: `uniform float uTime; uniform float uA; varying vec3 vN; varying vec3 vV; varying vec3 vP;
      void main(){ float f = 1. - abs(dot(normalize(vN), normalize(vV)));
        float a = atan(vP.z, vP.x); float ticks = step(.92, fract(a/6.2831*12.)) * smoothstep(.25,.0,abs(vP.y));
        float hand = smoothstep(.06,.0,abs(fract((a + uTime*1.2)/6.2831) - .5)) * smoothstep(.5,.0,abs(vP.y));
        float bands = .5 + .5*sin(vP.y*18. - uTime*2.);
        vec3 gold = vec3(1.6,1.05,.35); vec3 col = gold*(pow(f,2.)*1.2 + ticks*2. + hand*1.5) + vec3(.4,.25,.9)*bands*.15;
        float al = (pow(f,2.2)*.65 + ticks*.8 + hand*.5 + .05) * uA;
        gl_FragColor = vec4(col, clamp(al,0.,1.));
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const tbs = Array.from({ length: 4 }, () => { const m = timeMat.clone(); const o = new THREE.Mesh(new THREE.SphereGeometry(1, 40, 24), m); o.visible = false; o.renderOrder = 4; root.add(o); return { o, m, life: 0, age: 0, r: 4, p: new THREE.Vector3() }; });
  let tbCur = 0;
  // ---- trap bubbles (Magritte) — follow target.pos by reference
  const hatMat = mat(0x141416, { roughness: .45 });
  const traps = Array.from({ length: 8 }, () => {
    const g = new THREE.Group(); g.visible = false; root.add(g);
    const b = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 20), bubbleMat()); b.renderOrder = 5; g.add(b);
    const hat = new THREE.Group(); hat.add(new THREE.Mesh(new THREE.CylinderGeometry(.3, .3, .03, 24), hatMat)); const cr = new THREE.Mesh(new THREE.SphereGeometry(.19, 20, 12, 0, TAU, 0, PI / 2), hatMat); cr.scale.y = 1.25; hat.add(cr); g.add(hat);
    return { g, b, hat, life: 0, age: 0, ref: null, pos: null, h: 1.8, r: .5, fixed: new THREE.Vector3() };
  });
  let trapCur = 0;
  // ---- muzzle flashes
  const flashes = Array.from({ length: 4 }, () => { const m = new THREE.SpriteMaterial({ map: A().glowMap, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }); const s = new THREE.Sprite(m); s.visible = false; s.renderOrder = 6; root.add(s); return { s, m, life: 0, age: 0, size: .4 }; });
  let flashCur = 0;
  // ---- neon beam
  const beamGeo = new THREE.BufferGeometry(); {
    const N = 96, pos = [], idx = [];
    for (let s = 0; s < 2; s++) for (let i = 0; i <= N; i++) { pos.push(-.5, s, i / N, .5, s, i / N); }
    for (let s = 0; s < 2; s++) for (let i = 0; i < N; i++) { const o = s * (N + 1) * 2 + i * 2; idx.push(o, o + 1, o + 2, o + 1, o + 3, o + 2); }
    beamGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); beamGeo.setIndex(idx);
  }
  const beamU = { uTime: { value: 0 }, uO: { value: new THREE.Vector3() }, uD: { value: new THREE.Vector3(0, 0, 1) }, uLen: { value: 10 }, uW: { value: .16 }, uA: { value: 0 } };
  const beamMesh = new THREE.Mesh(beamGeo, new THREE.ShaderMaterial({
    uniforms: beamU, transparent: true, depthWrite: false, side: THREE.DoubleSide,
    vertexShader: `uniform float uTime, uLen, uW; uniform vec3 uO, uD; varying vec2 vUv; varying float vS; varying float vL;
      void main(){ float z = position.z; float s = position.y; vS = s; vUv = vec2(position.x + .5, z); vL = z*uLen;
        vec3 c = uO + uD*(z*uLen); vec3 toCam = normalize(cameraPosition - c); vec3 side = normalize(cross(uD, toCam)); vec3 up2 = normalize(cross(side, uD));
        float taper = smoothstep(0., .6, z*uLen) ;
        float w = uW * (s < .5 ? (1. + .25*sin(vL*2. - uTime*25.)) : .35);
        vec3 off;
        if (s < .5) off = side * (sin(vL*1.3 - uTime*14.)*.06*taper);
        else { float a = vL*2.2 - uTime*18.; off = (side*cos(a) + up2*sin(a)) * .16 * taper; }
        vec3 p = c + off + side * position.x * w;
        gl_Position = projectionMatrix * viewMatrix * vec4(p,1.); }`,
    fragmentShader: `uniform float uTime, uA; varying vec2 vUv; varying float vS; varying float vL;
      vec3 pal(float k){ k = fract(k); return k < .25 ? vec3(1.,.12,.15) : k < .5 ? vec3(1.,.85,.05) : k < .75 ? vec3(.1,.4,1.) : vec3(.15,1.,.45); }
      void main(){ float x = abs(vUv.x - .5)*2.;
        float cyc = vL*.3 - uTime*1.6;
        vec3 col; float a;
        if (vS < .5) {
          float edge = smoothstep(.66,.74,x);
          float core2 = 1. - smoothstep(.0,.16,x); vec3 body = pal(cyc) * 1.15; col = mix(body, vec3(2.6), core2*.75); col = mix(col, vec3(.02), edge);
          a = 1. - smoothstep(.95,1.,x);
        } else { col = pal(cyc + .5) * 1.6; a = 1. - smoothstep(.6,1.,x); }
        float fade = smoothstep(0., .05, vUv.y) ;
        gl_FragColor = vec4(col, a*uA*fade);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  }));
  beamMesh.frustumCulled = false; beamMesh.visible = false; beamMesh.renderOrder = 5; root.add(beamMesh);
  const beamS = { on: false, a: 0, id: 'neon', o: new THREE.Vector3(), d: new THREE.Vector3(0, 0, 1), tick: 0, len: 10, hit: new THREE.Vector3(), hitTarget: null, pulse: 0 };

  // ---- projectile pool
  const P = Array.from({ length: MAX_PROJ }, () => ({ alive: false, def: null, kind: null, p: new THREE.Vector3(), prev: new THREE.Vector3(), v: new THREE.Vector3(), age: 0, life: 0, col: new THREE.Color(), size: 1, spin: new THREE.Vector3(), seed: 0, target: null, trailT: 0 }));
  let pCur = 0, alive = 0;
  const stats = { shots: 0, live: 0 };
  let time = 0;

  // ---- hits (pooled; valid until the next update())
  const hitPool = Array.from({ length: 160 }, () => ({ ref: null, weapon: null, point: new THREE.Vector3(), effect: '', effectDur: 0, direct: false, dir: new THREE.Vector3() }));
  const hits = []; let hitN = 0;
  function pushHit(t, def, point, direct, dir, dur) {
    if (hitN >= hitPool.length) return; const h = hitPool[hitN++];
    h.ref = t.ref; h.weapon = def; h.point.copy(point); h.effect = def.effect; h.effectDur = dur == null ? def.effectDur : dur; h.direct = direct; h.dir.copy(dir); hits.push(h);
  }

  function randCone(dir, spread, out) {
    if (!spread) return out.copy(dir);
    _v3.set(Math.abs(dir.y) < .95 ? 0 : 1, Math.abs(dir.y) < .95 ? 1 : 0, 0); const u = _v4.crossVectors(dir, _v3).normalize(); const v = _v3.crossVectors(dir, u);
    const a = Math.random() * TAU, r = Math.tan(spread * Math.sqrt(Math.random()));
    return out.copy(dir).addScaledVector(u, Math.cos(a) * r).addScaledVector(v, Math.sin(a) * r).normalize();
  }

  function fire(id, origin, dir, opts) {
    const def = DEF[id]; if (!def) return;
    stats.shots++;
    if (def.beam) { beam(id, origin, dir, true); beamS.pulse = .12; return; }
    const kind = KIND[def.proj];
    for (let k = 0; k < def.pellets; k++) {
      let pr = P[pCur], tries = 0; while (pr.alive && tries++ < MAX_PROJ) { pCur = (pCur + 1) % MAX_PROJ; pr = P[pCur]; }
      pCur = (pCur + 1) % MAX_PROJ;
      if (!pr.alive) alive++;
      pr.alive = true; pr.def = def; pr.kind = kind; pr.age = 0; pr.trailT = 0; pr.seed = Math.random() * 100;
      randCone(dir, def.spread, _v1);
      pr.p.copy(origin); pr.prev.copy(origin);
      const sp = def.speed * (def.id === 'glitter' ? R(.8, 1.1) : def.id === 'confetti' ? R(.85, 1.1) : 1);
      pr.v.copy(_v1).multiplyScalar(sp);
      pr.life = def.range / Math.max(def.speed, 1) * (def.id === 'firework' ? 1.6 : 1);
      pr.spin.set(R(-8, 8), R(-8, 8), R(-8, 8)); pr.size = 1;
      pr.target = (opts && opts.homingTarget) || null;
      switch (def.id) {
        case 'splatter': pr.col.set(pick(PAL.pollock)); pr.size = R(.8, 1.3); break;
        case 'starry': pr.col.setRGB(3.2, 2.5, .7); break;
        case 'dots': pr.col.set(pick(PAL.kusama)); pr.size = R(.8, 1.25); break;
        case 'pow': pr.col.set(0xffffff); break;
        case 'clock': pr.col.set(0xffffff); break;
        case 'glitter': pr.col.set(pick(PAL.glitter)).multiplyScalar(1.25); pr.size = R(.7, 1.3); break;
        case 'bubble': pr.col.set(0xffffff); pr.size = R(.9, 1.1); break;
        case 'firework': pr.col.set(pick([0xd4202c, 0x2a6bff, 0xffc93a, 0x2ecf6a])); pr.v.multiplyScalar(.8); pr.v.y += 1.5; break;
        case 'confetti': pr.col.set(pick(PAL.confetti)); pr.size = R(.7, 1.2); break;
      }
    }
  }

  function beam(id, origin, dir, on) {
    beamS.id = id; beamS.on = !!on; if (on) { beamS.o.copy(origin); beamS.d.copy(dir).normalize(); }
  }

  function muzzleFlash(mz, id) {
    const def = DEF[id] || DEF[START_WEAPON];
    mz.updateWorldMatrix(true, false); mz.getWorldPosition(_v1); _v2.set(0, 0, 1).transformDirection(mz.matrixWorld);
    const f = flashes[flashCur]; flashCur = (flashCur + 1) % flashes.length;
    f.s.position.copy(_v1); f.life = def.id === 'pow' || def.id === 'firework' ? .12 : .07; f.age = 0; f.size = { splatter: .25, starry: .5, dots: .18, pow: .6, clock: .45, glitter: .45, bubble: .2, neon: .3, firework: .5, confetti: .2 }[def.id];
    f.m.color.set(def.color).multiplyScalar(def.id === 'bubble' ? .6 : 1.4); f.s.visible = true; f.m.rotation = Math.random() * TAU;
    const x = _v1.x, y = _v1.y, z = _v1.z, dx = _v2.x, dy = _v2.y, dz = _v2.z;
    const cone = (n, spd, sp, cb) => { for (let i = 0; i < n; i++) { randCone(_v2, sp, _v3); const s = spd * R(.5, 1); cb(_v3.x * s, _v3.y * s, _v3.z * s); } };
    switch (def.id) {
      case 'splatter': cone(4, 4, .5, (a, b, c) => fxNorm.spawn(x, y, z, a, b, c, pick(PAL.pollock), R(.02, .045), R(.25, .4), 2, 9, 1)); break;
      case 'starry': cone(10, 5, .7, (a, b, c) => fxAdd.spawn(x, y, z, a, b, c, pick([0xffe066, 0xffffff, 0x8fc0ff]), R(.05, .12), R(.2, .4), 1, 0, 3, .4, 3)); break;
      case 'dots': cone(2, 3, .6, (a, b, c) => fxNorm.spawn(x, y, z, a, b, c, pick(PAL.kusama), R(.02, .035), .2, 2, 0, 3)); break;
      case 'pow': cone(8, 3, .9, (a, b, c) => fxNorm.spawn(x, y, z, a, b, c, 0xffffff, R(.12, .25), R(.4, .7), 5, -1, 3, 2.5, 1, .8)); fxAdd.spawn(x, y, z, 0, 0, 0, 0xffe600, .5, .12, 4, 0, 0, 1.5, 3); break;
      case 'clock': cone(8, 2, 1, (a, b, c) => fxAdd.spawn(x, y, z, a, b, c, 0xffc94a, R(.05, .1), R(.3, .6), 6, 0, 2, 1, 2.5)); break;
      case 'glitter': cone(14, 9, .35, (a, b, c) => fxAdd.spawn(x, y, z, a, b, c, pick(PAL.glitter), R(.05, .1), R(.2, .45), 1, 2, 3, 1, 2, 1, 1)); cone(30, 7, .3, (a, b, c) => fxNorm.spawn(x, y, z, a, b, c, pick(PAL.glitter), R(.05, .1), R(.6, 1.2), 7, 1.5, 3, .8, 1, 1, 1)); break;
      case 'bubble': cone(4, 1.2, 1, (a, b, c) => fxAdd.spawn(x, y, z, a, b, c, 0xbfe8ff, R(.03, .06), R(.4, .7), 3, -.5, 1, 1, 1, .7)); break;
      case 'neon': cone(2, 3, .6, (a, b, c) => fxAdd.spawn(x, y, z, a, b, c, pick(PAL.pop), .04, .15, 1, 0, 2, 1, 3)); break;
      case 'firework': cone(10, 3, .6, (a, b, c) => fxNorm.spawn(x - dx * .5, y - dy * .5, z - dz * .5, -a * .6, -b * .6 + .5, -c * .6, 0xcfc8bc, R(.1, .18), R(.5, .9), 5, -.5, 2, 2.5, 1, .5)); cone(8, 5, .5, (a, b, c) => fxAdd.spawn(x, y, z, a, b, c, 0xffb040, .05, .25, 1, 3, 1, 1, 3)); break;
      case 'confetti': for (let i = 0; i < 2; i++) { randCone(_v2, .5, _v3); spawnFlake(x, y, z, _v3.x * 3, _v3.y * 3, _v3.z * 3, pick(PAL.confetti), R(.8, 1.5)); } break;
    }
  }

  // ---------------- impacts
  function impactFX(def, p, target, gh) {
    const x = p.x, y = p.y, z = p.z;
    switch (def.id) {
      case 'splatter': {
        for (let i = 0; i < 14; i++) fxNorm.spawn(x, y, z, R(-3, 3), R(1, 5), R(-3, 3), pick(PAL.pollock), R(.06, .13), R(.4, .8), 2, 12, .5);
        const gx = target ? target.pos.x + R(-.6, .6) : x, gz = target ? target.pos.z + R(-.6, .6) : z;
        _v1.set(gx, gh(gx, gz), gz); splat(_v1, true, pick(PAL.pollock), 'paint', R(.6, 1.1)); splat(_v1, true, pick(PAL.pollock), 'paint', R(.35, .7));
        break;
      }
      case 'starry':
        for (let i = 0; i < 40; i++) { const a = R(0, TAU), e = R(-.8, .8), s = R(2, 6); fxAdd.spawn(x, y, z, Math.cos(a) * s - Math.sin(a) * s * .6, e * s, Math.sin(a) * s + Math.cos(a) * s * .6, pick([0xffe066, 0xffffff, 0x8fc0ff, 0x3f6fe0, 0xffd23f]), R(.08, .2), R(.5, 1), pick([1, 4, 6]), -.5, 2.5, .4, 3); }
        for (let i = 0; i < 18; i++) { const a = R(0, TAU), s = R(1.5, 4); fxNorm.spawn(x, y, z, Math.cos(a) * s - Math.sin(a) * s * .8, R(-1, 2), Math.sin(a) * s + Math.cos(a) * s * .8, pick([0x1d4fd8, 0x2a6bff, 0xffc81a, 0x0f2a8a, 0xffe14d, 0x7fb2ff]), R(.25, .5), R(.6, 1.1), 6, -.3, 2, 1.6); }
        fxAdd.spawn(x, y, z, 0, 0, 0, 0xffd84a, 1.6, .3, 0, 0, 0, 1.6, 2); fxAdd.spawn(x, y, z, 0, 0, 0, 0xffd23f, .5, .5, 3, 0, 0, 6, 2.5);
        break;
      case 'dots': {
        for (let i = 0; i < 8; i++) fxNorm.spawn(x, y, z, R(-2.5, 2.5), R(.5, 3.5), R(-2.5, 2.5), pick(PAL.kusama), R(.07, .13), R(.4, .7), 2, 9, .5);
        if (Math.random() < .5) { const gx = target ? target.pos.x + R(-.5, .5) : x, gz = target ? target.pos.z + R(-.5, .5) : z; _v1.set(gx, gh(gx, gz), gz); splat(_v1, true, pick([0xff1f3d, 0xffffff, 0xffd400]), 'dots', R(.35, .7)); }
        break;
      }
      case 'pow': {
        const pw = pows[powCur]; powCur = (powCur + 1) % pows.length; pw.m.map = pick(powTex); pw.s.position.set(x, Math.max(y, gh(x, z) + 1.4) + .6, z); pw.life = 1.3; pw.age = 0; pw.size = 3.4; pw.s.visible = true; pw.m.rotation = R(-.25, .25);
        for (let i = 0; i < 26; i++) { const a = R(0, TAU), s = R(3, 9); fxNorm.spawn(x, y + .3, z, Math.cos(a) * s, R(1, 6), Math.sin(a) * s, pick(PAL.pop), R(.12, .3), R(.5, .9), 2, 9, 2); }
        for (let i = 0; i < 10; i++) { const a = R(0, TAU), s = R(1, 3); fxNorm.spawn(x, y + .3, z, Math.cos(a) * s, R(.5, 2), Math.sin(a) * s, 0xffffff, R(.6, 1.1), R(.8, 1.3), 5, -.4, 2, 2.2, 1, .75); }
        fxAdd.spawn(x, y + .3, z, 0, 0, 0, 0xffe600, 4, .18, 0, 0, 0, 1.5, 2.5);
        _v1.set(x, gh(x, z), z); spawnRing(_v1, def.aoe, 0xffe600, .4, 2); splat(_v1, true, 0xff2a2a, 'dots', def.aoe * .55);
        break;
      }
      case 'clock': {
        const tb = tbs[tbCur]; tbCur = (tbCur + 1) % tbs.length; tb.p.set(x, Math.max(y, gh(x, z) + .5), z); tb.life = 3.6; tb.age = 0; tb.r = def.aoe; tb.o.visible = true;
        for (let i = 0; i < 30; i++) { const a = R(0, TAU), s = R(1, 4); fxAdd.spawn(x, y, z, Math.cos(a) * s, R(-1, 2), Math.sin(a) * s, pick([0xffc94a, 0xffe9a0, 0xb07bff]), R(.06, .14), R(.6, 1.2), pick([1, 6]), 0, 1.5, .5, 2.5); }
        _v1.set(x, gh(x, z), z); splat(_v1, true, 0xf1d27a, 'clock', R(1.4, 1.9)); spawnRing(_v1, def.aoe, 0xffc94a, .5, 1.5);
        break;
      }
      case 'glitter': {
        for (let i = 0; i < 4; i++) fxAdd.spawn(x, y, z, R(-2, 2), R(0, 3), R(-2, 2), pick(PAL.glitter), R(.06, .14), R(.4, .9), 1, 3, 1, .5, 2.5, 1, 1);
        for (let i = 0; i < 8; i++) fxNorm.spawn(x + R(-.3, .3), y + R(-.3, .3), z + R(-.3, .3), R(-1.5, 1.5), R(-.2, 1.5), R(-1.5, 1.5), pick(PAL.glitter), R(.07, .13), R(1.2, 2.2), 7, .6, 2.5, .8, 1, 1, 1);
        if (Math.random() < .6) { const gx = target ? target.pos.x + R(-.6, .6) : x, gz = target ? target.pos.z + R(-.6, .6) : z; _v1.set(gx, gh(gx, gz), gz); splat(_v1, true, pick(PAL.glitter), 'glitter', R(.5, .9)); }
        break;
      }
      case 'bubble': {
        for (let i = 0; i < 14; i++) { const a = R(0, TAU), e = R(-1, 1); fxAdd.spawn(x, y, z, Math.cos(a) * 2, e * 2, Math.sin(a) * 2, pick([0xbfe8ff, 0xffc8f0, 0xffffff]), R(.03, .06), R(.2, .4), 2, 4, 2, 1, 1.6); }
        fxAdd.spawn(x, y, z, 0, 0, 0, 0xbfe8ff, .3, .2, 3, 0, 0, 4, 1.4);
        break;
      }
      case 'firework': fireworkBurst(x, Math.max(y, gh(x, z) + .8), z, def); break;
      case 'confetti': {
        for (let i = 0; i < 6; i++) spawnFlake(x, y, z, R(-2.5, 2.5), R(.5, 3), R(-2.5, 2.5), pick(PAL.confetti));
        fxAdd.spawn(x, y, z, 0, 0, 0, 0xffffff, .2, .1, 1, 0, 0, 1, 2);
        break;
      }
    }
  }
  function fireworkBurst(x, y, z, def) {
    const c1 = pick(PAL.firework), c2 = pick(PAL.firework);
    for (let i = 0; i < 110; i++) {
      _v1.set(R(-1, 1), R(-1, 1), R(-1, 1)).normalize(); const s = R(6, 10);
      fxAdd.spawn(x, y, z, _v1.x * s, _v1.y * s, _v1.z * s, i % 3 ? c1 : c2, R(.1, .2), R(1.1, 1.8), i % 4 ? 0 : 1, 3, 1.9, .5, 3, 1, i % 5 === 0 ? 1 : 0);
    }
    // a ring of stars in a random plane
    _v2.set(R(-1, 1), R(.5, 1), R(-1, 1)).normalize(); _v3.crossVectors(_v2, _X).normalize(); _v4.crossVectors(_v2, _v3);
    for (let i = 0; i < 28; i++) { const a = i / 28 * TAU, s = 9; fxAdd.spawn(x, y, z, (_v3.x * Math.cos(a) + _v4.x * Math.sin(a)) * s, (_v3.y * Math.cos(a) + _v4.y * Math.sin(a)) * s, (_v3.z * Math.cos(a) + _v4.z * Math.sin(a)) * s, 0xffffff, .16, 1.2, 4, 2, 2, .6, 3); }
    for (let i = 0; i < 50; i++) { _v1.set(R(-1, 1), R(-1, 1), R(-1, 1)).normalize(); const s = R(5, 9); fxNorm.spawn(x, y, z, _v1.x * s, _v1.y * s, _v1.z * s, i % 2 ? c1 : c2, R(.14, .24), R(.9, 1.4), 4, 3, 1.9, .6, 1); }
    fxAdd.spawn(x, y, z, 0, 0, 0, 0xfff2c0, 4, .2, 0, 0, 0, 1.4, 2.2);
    for (let i = 0; i < 6; i++) fxNorm.spawn(x, y, z, R(-1, 1), R(-.2, .8), R(-1, 1), 0xb8b0a4, R(.6, 1), R(1.2, 2), 5, -.2, 1, 2.5, 1, .45);
  }
  function aoeHits(def, p, ctx, skip) {
    const T = ctx.targets; if (!T) return;
    for (let i = 0; i < T.length; i++) {
      const t = T[i]; if (t === skip) continue;
      const cy = clamp(p.y, t.pos.y, t.pos.y + t.h);
      const dx = t.pos.x - p.x, dz = t.pos.z - p.z, dy = cy - p.y; const d = Math.sqrt(dx * dx + dz * dz + dy * dy) - t.r;
      if (d > def.aoe) continue;
      _v1.set(dx, 0, dz); if (_v1.lengthSq() < 1e-6) _v1.set(0, 0, 1); _v1.normalize();
      _v2.set(t.pos.x, cy, t.pos.z);
      pushHit(t, def, _v2, false, _v1, def.effectDur * (1 - .4 * clamp(d / def.aoe, 0, 1)));
    }
  }
  function trapOn(t, def) {
    // refresh existing bubble on same target
    let k = traps.find(q => q.life > 0 && q.ref === t.ref && t.ref != null);
    if (k) { k.life = k.age + def.effectDur; return; }
    k = traps[trapCur]; trapCur = (trapCur + 1) % traps.length;
    k.ref = t.ref; k.pos = t.pos; k.h = t.h; k.r = Math.max(t.r * 1.5, t.h * .58); k.life = def.effectDur; k.age = 0; k.g.visible = true; k.fixed.copy(t.pos);
  }
  // swept segment vs vertical cylinder: returns param s in [0,1] or -1
  function sweep(a, b, t, rad) {
    const dx = b.x - a.x, dz = b.z - a.z, fx = a.x - t.pos.x, fz = a.z - t.pos.z, R2 = (t.r + rad) * (t.r + rad);
    const A2 = dx * dx + dz * dz, B = 2 * (fx * dx + fz * dz), C = fx * fx + fz * fz - R2;
    let s0, s1;
    if (A2 < 1e-10) { if (C > 0) return -1; s0 = 0; s1 = 1; }
    else { const disc = B * B - 4 * A2 * C; if (disc < 0) return -1; const sq = Math.sqrt(disc); s0 = (-B - sq) / (2 * A2); s1 = (-B + sq) / (2 * A2); }
    if (s1 < 0 || s0 > 1) return -1; s0 = Math.max(0, s0); s1 = Math.min(1, s1);
    // y range
    const y0 = t.pos.y - rad, y1 = t.pos.y + t.h + rad, dy = b.y - a.y;
    let e0, e1;
    if (Math.abs(dy) < 1e-8) { if (a.y < y0 || a.y > y1) return -1; e0 = 0; e1 = 1; }
    else { e0 = (y0 - a.y) / dy; e1 = (y1 - a.y) / dy; if (e0 > e1) { const tmp = e0; e0 = e1; e1 = tmp; } }
    const lo = Math.max(s0, e0), hi = Math.min(s1, e1);
    return lo <= hi ? lo : -1;
  }

  function killProj(pr) { if (pr.alive) { pr.alive = false; alive--; } }

  // ---------------- update
  let frame = 0;
  const flatGround = () => 0;
  function update(dt, ctx = {}) {
    dt = Math.min(dt, 1 / 20); time += dt; frame++;
    hits.length = 0; hitN = 0;
    const gh = ctx.groundHeight || flatGround, T = ctx.targets || [], solid = ctx.solid;
    decU.uTime.value = time; bubbleMat().uniforms.uTime.value = time;
    fxNorm.obj.material.uniforms.uLight.value = .12 + .88 * clamp(ctx.light == null ? 1 : ctx.light, 0, 1);
    for (const k in KIND) KIND[k].n = 0;
    halo.begin();
    for (let i = 0; i < MAX_PROJ; i++) {
      const pr = P[i]; if (!pr.alive) continue;
      const def = pr.def; pr.age += dt;
      // behaviours
      if (def.id === 'firework') {
        if (!pr.target && T.length && frame % 4 === i % 4 && pr.age > .12) { // auto-acquire nearest target in a forward cone
          let best = null, bd = 1e9; _v1.copy(pr.v).normalize();
          for (const t of T) { _v2.set(t.pos.x - pr.p.x, t.pos.y + t.h * .6 - pr.p.y, t.pos.z - pr.p.z); const d = _v2.length(); if (d > 45 || d < .5) continue; if (_v2.dot(_v1) / d < .8) continue; if (d < bd) { bd = d; best = t; } }
          if (best) pr.target = best;
        }
        const spd = Math.min(34, pr.v.length() + 28 * dt);
        if (pr.target && pr.target.pos) {
          const tp = pr.target.pos; _v1.set(tp.x - pr.p.x, tp.y + (pr.target.h || 1.6) * .6 - pr.p.y, tp.z - pr.p.z).normalize(); _v2.copy(pr.v).normalize();
          _v2.lerp(_v1, Math.min(1, dt * 4.5)).normalize(); pr.v.copy(_v2).multiplyScalar(spd);
        } else { pr.v.setLength(spd); pr.v.x += Math.sin(pr.age * 18 + pr.seed) * dt * 3; }
      } else if (def.id === 'bubble') {
        pr.v.multiplyScalar(1 - .5 * dt); pr.v.x += Math.sin(pr.age * 3 + pr.seed) * dt * .8; pr.v.z += Math.cos(pr.age * 2.6 + pr.seed) * dt * .8;
      } else if (def.id === 'confetti') {
        pr.v.multiplyScalar(1 - .6 * dt);
      }
      pr.v.y -= def.gravity * dt;
      pr.prev.copy(pr.p); pr.p.addScaledVector(pr.v, dt);
      // trails
      const x = pr.p.x, y = pr.p.y, z = pr.p.z;
      switch (def.id) {
        case 'starry': for (let k = 0; k < 3; k++) { const a = pr.age * 40 + k * 2.1; _v1.copy(pr.v).normalize(); _v2.set(-_v1.z, 0, _v1.x).normalize(); _v3.crossVectors(_v1, _v2); const r = .22; fxAdd.spawn(x + (_v2.x * Math.cos(a) + _v3.x * Math.sin(a)) * r - _v1.x * k * .4, y + (_v2.y * Math.cos(a) + _v3.y * Math.sin(a)) * r - _v1.y * k * .4, z + (_v2.z * Math.cos(a) + _v3.z * Math.sin(a)) * r - _v1.z * k * .4, 0, 0, 0, k ? (k === 1 ? 0x6fa6ff : 0xffffff) : 0xffd23f, R(.08, .14), R(.35, .6), k === 2 ? 1 : 0, 0, 0, .2, 2.6); } if (frame % 2 === 0) { _v1.copy(pr.v).normalize(); fxNorm.spawn(x - _v1.x * .3 + R(-.12, .12), y - _v1.y * .3 + R(-.12, .12), z - _v1.z * .3 + R(-.12, .12), R(-.3, .3), R(-.3, .3), R(-.3, .3), pick([0x1d4fd8, 0x2a6bff, 0xffc81a, 0x0f2a8a, 0xffe14d]), R(.18, .3), R(.5, .8), 6, 0, 1, 1.4); } break;
        case 'splatter': pr.trailT += dt; if (pr.trailT > .09) { pr.trailT = 0; fxNorm.spawn(x, y, z, pr.v.x * .1, -.5, pr.v.z * .1, pr.col.getHex(), R(.04, .07), .6, 2, 10, 0); const g0 = gh(x, z); if (y - g0 < 3 && Math.random() < .35) { _v1.set(x + R(-.2, .2), g0, z + R(-.2, .2)); splat(_v1, true, pr.col.getHex(), 'paint', R(.12, .25)); } } break;
        case 'glitter': fxNorm.spawn(x, y, z, R(-.5, .5), R(-.5, .5), R(-.5, .5), pick(PAL.glitter), R(.06, .11), R(.3, .6), 7, 1, 1.5, 1, 1, 1, 1); break;
        case 'dots': if (frame % 3 === 0) fxNorm.spawn(x, y, z, 0, 0, 0, pr.col.getHex(), .08, .2, 2, 0, 0, .2); break;
        case 'pow': pr.trailT += dt; if (pr.trailT > .03) { pr.trailT = 0; fxNorm.spawn(x, y, z, R(-.3, .3), R(0, .4), R(-.3, .3), 0xffffff, R(.15, .25), R(.4, .7), 5, -.3, 1, 3, 1, .7); } break;
        case 'clock': if (frame % 2 === 0) fxAdd.spawn(x + R(-.15, .15), y + R(-.15, .15), z + R(-.15, .15), 0, R(-.8, -.2), 0, pick([0xffc94a, 0xffe9a0]), R(.06, .12), R(.6, 1), 6, 1, .5, .3, 2.4); break;
        case 'firework': fxAdd.spawn(x - pr.v.x * .012, y - pr.v.y * .012, z - pr.v.z * .012, R(-1, 1) - pr.v.x * .1, R(-1, 1) - pr.v.y * .1, R(-1, 1) - pr.v.z * .1, pick([0xffb040, 0xffe080, 0xff6a20]), R(.05, .1), R(.2, .45), 1, 2, 1, .5, 3, 1, 1); if (frame % 2 === 0) fxNorm.spawn(x, y, z, R(-.2, .2), R(.1, .5), R(-.2, .2), 0xc8c0b4, R(.12, .2), R(.6, 1), 5, -.2, .5, 3, 1, .4); break;
      }
      // collisions
      let hitT = null, s = -1; const rad = def.id === 'bubble' ? .2 : def.id === 'orb' ? .2 : .06;
      for (let k = 0; k < T.length; k++) { const ss = sweep(pr.prev, pr.p, T[k], rad); if (ss >= 0 && (s < 0 || ss < s)) { s = ss; hitT = T[k]; } }
      let impact = false, gHit = false;
      if (hitT) { _v4.lerpVectors(pr.prev, pr.p, s); impact = true; }
      else {
        const g0 = gh(x, z);
        if (y <= g0) { // refine ground hit
          let lo = 0, hi = 1; for (let it = 0; it < 5; it++) { const m = (lo + hi) / 2; _v1.lerpVectors(pr.prev, pr.p, m); if (_v1.y <= gh(_v1.x, _v1.z)) hi = m; else lo = m; }
          _v4.lerpVectors(pr.prev, pr.p, hi); _v4.y = gh(_v4.x, _v4.z); impact = true; gHit = true;
        } else if (solid && solid(x, y, z)) { _v4.copy(pr.prev); impact = true; }
      }
      if (impact) {
        _v3.copy(pr.v).normalize();
        if (hitT) {
          if (def.id === 'bubble') trapOn(hitT, def);
          pushHit(hitT, def, _v4, true, _v3);
        }
        if (def.aoe > 0) aoeHits(def, _v4, ctx, hitT);
        impactFX(def, _v4, hitT, gh);
        if (gHit && (def.id === 'glitter' || def.id === 'dots') ) { /* extra small splats handled in impactFX */ }
        killProj(pr); continue;
      }
      if (pr.age >= pr.life) {
        // airburst weapons explode at end of flight
        if (def.id === 'firework' || def.id === 'pow' || def.id === 'clock') { _v4.copy(pr.p); if (def.aoe > 0) aoeHits(def, _v4, ctx, null); impactFX(def, _v4, null, gh); }
        else if (def.id === 'bubble') impactFX(def, pr.p, null, gh);
        killProj(pr); continue;
      }
      // instance write
      const K = pr.kind; if (K.n >= K.cap) continue;
      const fadeIn = Math.min(1, pr.age * 20 + .3), sc = K.scale * pr.size * fadeIn;
      switch (def.id) {
        case 'splatter': { _v1.copy(pr.v).normalize(); _q1.setFromUnitVectors(_Z, _v1); const st = 1 + Math.min(pr.v.length() * .03, 1.4); const wob = 1 + Math.sin(pr.age * 40 + pr.seed) * .12; _s1.set(sc * wob, sc / wob, sc * st); break; }
        case 'starry': _q1.setFromEuler(_e1.set(0, pr.age * 3, pr.age * 14)); _s1.setScalar(sc); break;
        case 'rocket': case 'firework': break;
        case 'pow': _q1.setFromEuler(_e1.set(pr.age * 9, pr.age * 4, 0)); _s1.setScalar(sc); break;
        case 'clock': { _q1.setFromEuler(_e1.set(0, -pr.age * 2, 0)); const w = Math.sin(pr.age * 6) * .12; _s1.set(sc * (1 + w), sc * (1 - w), sc); break; }
        case 'bubble': { _q1.identity(); const w = Math.sin(pr.age * 7 + pr.seed) * .08; _s1.set(sc * (1 + w), sc * (1 - w), sc * (1 + w * .5)); break; }
        case 'confetti': _q1.setFromEuler(_e1.set(pr.spin.x * pr.age, pr.spin.y * pr.age, pr.spin.z * pr.age)); _s1.setScalar(sc); break;
        default: _q1.setFromEuler(_e1.set(pr.spin.x * pr.age, pr.spin.y * pr.age, pr.spin.z * pr.age)); _s1.setScalar(sc);
      }
      if (def.id === 'firework') { _v1.copy(pr.v).normalize(); _q1.setFromUnitVectors(_Z, _v1); _q2.setFromAxisAngle(_Z, pr.age * 12); _q1.multiply(_q2); _s1.setScalar(fadeIn); }
      _m1.compose(pr.p, _q1, _s1); K.im.setMatrixAt(K.n, _m1);
      _c1.copy(pr.col); if (def.id === 'glitter') _c1.multiplyScalar(.8 + (Math.sin(pr.age * 50 + pr.seed * 7) > .5 ? 1.2 : 0)); K.im.setColorAt(K.n, _c1); K.n++;
      if (K.halo) { const hc = K.haloCol; if (hc) halo.put(x, y, z, hc[0], hc[1], hc[2], K.halo, 0, .9); else halo.put(x, y, z, pr.col.r * .7, pr.col.g * .7, pr.col.b * .7, K.halo * pr.size, K.haloShape || 0, .8); }
    }
    stats.live = alive;
    for (const k in KIND) { const K = KIND[k]; K.im.count = K.n; K.im.visible = K.n > 0; if (K.n) { K.im.instanceMatrix.clearUpdateRanges(); K.im.instanceMatrix.addUpdateRange(0, K.n * 16); K.im.instanceMatrix.needsUpdate = true; K.im.instanceColor.clearUpdateRanges(); K.im.instanceColor.addUpdateRange(0, K.n * 3); K.im.instanceColor.needsUpdate = true; } }

    // ---- beam
    updateBeam(dt, ctx, gh, T, solid);
    halo.end();

    // ---- particles
    fxAdd.update(dt); fxNorm.update(dt);
    // flakes
    let fn = 0;
    for (let i = 0; i < FLK; i++) {
      const f = flk[i]; if (f.life <= 0) continue; f.age += dt; if (f.age >= f.life) { f.life = 0; continue; }
      if (!f.landed) {
        f.v.multiplyScalar(1 - 2.2 * dt); f.v.y -= 3 * dt; f.v.x += Math.sin(f.age * 7 + i) * dt * 1.5; f.p.addScaledVector(f.v, dt);
        f.rot.x += f.spin.x * dt; f.rot.y += f.spin.y * dt; f.rot.z += f.spin.z * dt;
        const g0 = gh(f.p.x, f.p.z); if (f.p.y < g0 + .01) { f.p.y = g0 + .012 + (i % 5) * .001; f.landed = true; f.rot.set(-PI / 2, 0, f.rot.z); }
      }
      const shrink = f.age > f.life - .4 ? (f.life - f.age) / .4 : 1;
      _q1.setFromEuler(f.rot); _m1.compose(f.p, _q1, _s1.set(f.s * shrink, f.s * shrink, f.s * shrink)); flkMesh.setMatrixAt(fn, _m1); flkMesh.setColorAt(fn, f.c); fn++;
    }
    flkMesh.count = fn; flkMesh.visible = fn > 0; if (fn) { flkMesh.instanceMatrix.clearUpdateRanges(); flkMesh.instanceMatrix.addUpdateRange(0, fn * 16); flkMesh.instanceMatrix.needsUpdate = true; flkMesh.instanceColor.clearUpdateRanges(); flkMesh.instanceColor.addUpdateRange(0, fn * 3); flkMesh.instanceColor.needsUpdate = true; }
    decMesh.visible = decMesh.count > 0;

    // ---- pooled one-shots
    for (const pw of pows) if (pw.life > 0) {
      pw.age += dt; if (pw.age >= pw.life) { pw.life = 0; pw.s.visible = false; continue; }
      const u = pw.age; const pop = u < .22 ? (1 - Math.pow(1 - u / .22, 3)) * (1 + Math.sin(u / .22 * PI) * .25) : 1 + (u - .22) * .15;
      pw.s.scale.setScalar(pw.size * pop); pw.m.opacity = u > pw.life - .3 ? (pw.life - u) / .3 : 1; pw.s.position.y += dt * .4;
    }
    for (const k of rings) if (k.life > 0) {
      k.age += dt; if (k.age >= k.life) { k.life = 0; k.o.visible = false; continue; }
      const u = k.age / k.life, e = 1 - Math.pow(1 - u, 3); k.o.scale.setScalar(Math.max(.01, k.r * e)); k.m.color.copy(k.col); k.m.opacity = (1 - u) * .85;
    }
    for (const tb of tbs) if (tb.life > 0) {
      tb.age += dt; if (tb.age >= tb.life) { tb.life = 0; tb.o.visible = false; continue; }
      const u = tb.age, L = tb.life; const grow = u < .35 ? 1 - Math.pow(1 - u / .35, 3) : 1; const melt = u > L - 1 ? (u - (L - 1)) : 0;
      tb.o.scale.set(tb.r * grow * (1 + melt * .3), tb.r * grow * (1 - melt * .85) * (1 + Math.sin(u * 3) * .03), tb.r * grow * (1 + melt * .3));
      tb.o.position.set(tb.p.x, tb.p.y - tb.r * .25 - melt * tb.r * .5, tb.p.z); tb.m.uniforms.uTime.value = time; tb.m.uniforms.uA.value = 1 - melt;
      if (frame % 3 === 0) { const a = R(0, TAU), r = tb.r * R(.3, .95); fxAdd.spawn(tb.p.x + Math.cos(a) * r, tb.p.y + R(-1, 2), tb.p.z + Math.sin(a) * r, 0, -.15, 0, pick([0xffc94a, 0xb07bff, 0xffffff]), R(.08, .14), 1.5, pick([1, 6]), 0, 0, 1, 2); }
    }
    for (const k of traps) if (k.life > 0) {
      k.age += dt; const pos = k.pos || k.fixed;
      if (k.age >= k.life) { k.life = 0; k.g.visible = false; for (let i = 0; i < 24; i++) { const a = R(0, TAU), e = R(-1, 1); fxAdd.spawn(k.g.position.x, k.g.position.y, k.g.position.z, Math.cos(a) * 4, e * 3, Math.sin(a) * 4, pick([0xbfe8ff, 0xffc8f0, 0xffffff]), R(.04, .09), R(.3, .5), 2, 6, 2, 1, 1.8); } k.ref = null; k.pos = null; continue; }
      const grow = Math.min(1, k.age / .25), w = Math.sin(k.age * 5) * .04;
      k.g.position.set(pos.x, pos.y + k.h * .5, pos.z); k.b.scale.set(k.r * grow * (1 + w), k.r * grow * (1 - w), k.r * grow * (1 + w));
      k.hat.position.set(Math.sin(k.age * 1.3) * .1, k.r * grow + .12 + Math.sin(k.age * 2) * .05, 0); k.hat.rotation.set(Math.sin(k.age * 1.7) * .2, k.age * .8, Math.cos(k.age * 1.5) * .15); k.hat.scale.setScalar(grow);
    }
    for (const f of flashes) if (f.life > 0) { f.age += dt; if (f.age >= f.life) { f.life = 0; f.s.visible = false; continue; } const u = f.age / f.life; f.s.scale.setScalar(f.size * (1 + u)); f.m.opacity = 1 - u; }
    return hits;
  }

  function rayHit(o, d, range, T, gh, solid) {
    // returns distance; sets beamS.hitTarget
    let best = range; beamS.hitTarget = null;
    for (let i = 0; i < T.length; i++) {
      const t = T[i]; const fx = o.x - t.pos.x, fz = o.z - t.pos.z; const a = d.x * d.x + d.z * d.z, b = 2 * (fx * d.x + fz * d.z), c = fx * fx + fz * fz - t.r * t.r;
      let s;
      if (a < 1e-8) { if (c > 0) continue; s = 0; } else { const disc = b * b - 4 * a * c; if (disc < 0) continue; s = (-b - Math.sqrt(disc)) / (2 * a); if (s < 0) s = c <= 0 ? 0 : -1; }
      if (s < 0 || s >= best) continue;
      const y = o.y + d.y * s; if (y < t.pos.y || y > t.pos.y + t.h) continue;
      best = s; beamS.hitTarget = t;
    }
    // ground / solid march
    const step = .4; for (let s = step; s < best; s += step) { const x = o.x + d.x * s, y = o.y + d.y * s, z = o.z + d.z * s; if (y <= gh(x, z) || (solid && solid(x, y, z))) { let lo = s - step, hi = s; for (let k = 0; k < 4; k++) { const m = (lo + hi) / 2; const yy = o.y + d.y * m, xx = o.x + d.x * m, zz = o.z + d.z * m; if (yy <= gh(xx, zz) || (solid && solid(xx, yy, zz))) hi = m; else lo = m; } beamS.hitTarget = null; return hi; } }
    return best;
  }
  function updateBeam(dt, ctx, gh, T, solid) {
    if (beamS.pulse > 0) { beamS.pulse -= dt; if (beamS.pulse <= 0) beamS.on = false; }
    beamS.a += ((beamS.on ? 1 : 0) - beamS.a) * Math.min(1, dt * (beamS.on ? 25 : 10));
    if (beamS.a < .02) { beamMesh.visible = false; beamS.tick = 0; return; }
    const def = DEF[beamS.id] || DEF.neon;
    const len = rayHit(beamS.o, beamS.d, def.range, T, gh, solid); beamS.len = len;
    beamS.hit.copy(beamS.o).addScaledVector(beamS.d, len);
    beamU.uO.value.copy(beamS.o); beamU.uD.value.copy(beamS.d); beamU.uLen.value = len; beamU.uTime.value = time; beamU.uA.value = beamS.a; beamU.uW.value = .2;
    beamMesh.visible = true;
    if (beamS.on) {
      beamS.tick += dt; const per = 1 / def.rate;
      while (beamS.tick >= per) { beamS.tick -= per; if (beamS.hitTarget) pushHit(beamS.hitTarget, def, beamS.hit, true, beamS.d); }
      const h = beamS.hit; const hu = (time * .4) % 1;
      for (let i = 0; i < 3; i++) fxAdd.spawn(h.x, h.y, h.z, R(-3, 3), R(0, 4), R(-3, 3), pick(PAL.pop), R(.04, .08), R(.15, .35), 1, 6, 1, 1, 3);
      if (frame % 5 === 0) fxAdd.spawn(h.x, h.y, h.z, 0, 0, 0, pick([0xff2a2a, 0xffd400, 0x1f6bff, 0x39ff88]), .2, .35, 3, 0, 0, 5, 2.5);
      halo.put(h.x, h.y, h.z, 1.2, 1.2, 1.2, .55, 0, .9);
      _c1.setHSL(hu, 1, .5); halo.put(beamS.o.x, beamS.o.y, beamS.o.z, _c1.r * 1.5, _c1.g * 1.5, _c1.b * 1.5, .22, 0, 1);
      if (!beamS.hitTarget && frame % 6 === 0) { const g0 = gh(h.x, h.z); if (h.y - g0 < .3) { _v1.set(h.x, g0, h.z); splat(_v1, true, pick([0xff2a2a, 0xffd400, 0x1f6bff, 0x39ff88]), 'dots', R(.15, .3)); } }
    }
  }

  function clear() {
    for (const pr of P) pr.alive = false; alive = 0;
    fxAdd.clear(); fxNorm.clear(); for (const f of flk) f.life = 0;
    _m1.makeScale(0, 0, 0); for (let i = 0; i < DEC; i++) { decMesh.setMatrixAt(i, _m1); decBirth[i] = -1e5; } decMesh.count = 0; decMesh.instanceMatrix.needsUpdate = true; decCur = 0;
    for (const a of [pows, rings, tbs, flashes]) for (const k of a) { k.life = 0; (k.s || k.o).visible = false; }
    for (const k of traps) { k.life = 0; k.g.visible = false; k.ref = null; k.pos = null; }
    beamS.on = false; beamS.a = 0; beamMesh.visible = false;
  }

  return { fire, beam, update, muzzleFlash, splat, clear, stats, root, get liveProjectiles() { return alive; } };
}

// ============================================================ sound (WebAudio synth, no files)
const _noiseBufs = new WeakMap();
function noiseBuf(ac) { let b = _noiseBufs.get(ac); if (b) return b; b = ac.createBuffer(1, ac.sampleRate * 1.5, ac.sampleRate); const d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; _noiseBufs.set(ac, b); return b; }
export function weaponSound(id, ac, dest, kind = 'fire') {
  if (!ac) return 0; dest = dest || ac.destination; const t0 = ac.currentTime + .005;
  const env = (g, a, peak, d, t = t0) => { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + d); };
  const osc = (type, f0, f1, a, d, peak, t = t0, detune = 0) => { const o = ac.createOscillator(), g = ac.createGain(); o.type = type; o.frequency.setValueAtTime(f0, t); if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(f1, 1), t + a + d); o.detune.value = detune; env(g, a, peak, d, t); o.connect(g).connect(dest); o.start(t); o.stop(t + a + d + .05); return o; };
  const noise = (ftype, f0, f1, q, a, d, peak, t = t0) => { const s = ac.createBufferSource(); s.buffer = noiseBuf(ac); const f = ac.createBiquadFilter(), g = ac.createGain(); f.type = ftype; f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(Math.max(f1, 1), t + a + d); f.Q.value = q; env(g, a, peak, d, t); s.connect(f).connect(g).connect(dest); s.start(t, Math.random()); s.stop(t + a + d + .05); };
  const pent = [0, 2, 4, 7, 9, 12, 14, 16];
  const note = (base, i) => base * Math.pow(2, pent[i % pent.length] / 12);
  if (kind === 'pickup') { const b = 440 * Math.pow(2, ((DEF[id] ? DEF[id].index : 0) % 5) / 12); [0, 2, 4, 5].forEach((k, i) => osc('triangle', note(b, k), note(b, k), .005, .18, .22, t0 + i * .07)); osc('sine', b * 4, b * 4, .005, .3, .05, t0 + .28); return .5; }
  if (kind === 'spinup') { osc('sawtooth', 60, 340, .05, .45, .08); noise('bandpass', 400, 2400, 2, .05, .45, .08); return .5; }
  if (kind === 'overheat') { noise('highpass', 3000, 800, .7, .01, .7, .25); osc('square', 880, 880, .005, .08, .06); osc('square', 660, 660, .005, .08, .06, t0 + .12); osc('sine', 300, 90, .01, .5, .12); return .8; }
  if (kind === 'impact') {
    switch (id) {
      case 'splatter': noise('lowpass', 1800, 300, 1, .005, .14, .35); osc('sine', 180, 60, .005, .1, .25); return .2;
      case 'starry': [0, 4, 7, 11].forEach((k, i) => osc('sine', 880 * Math.pow(2, k / 12), 880 * Math.pow(2, k / 12), .005, .5, .07, t0 + i * .03)); noise('highpass', 6000, 3000, .5, .01, .3, .08); return .6;
      case 'dots': osc('sine', note(1200, (Math.random() * 8) | 0), 600, .002, .06, .12); return .1;
      case 'pow': osc('sine', 120, 35, .005, .45, .7); noise('lowpass', 2500, 120, .7, .005, .6, .6); return .7;
      case 'clock': osc('sine', 520, 260, .005, 1.2, .2); osc('sine', 1040, 400, .005, .9, .07); osc('triangle', 130, 65, .01, 1.2, .2); return 1.3;
      case 'glitter': for (let i = 0; i < 4; i++) osc('sine', R(2500, 5000), R(2500, 5000), .002, .1, .04, t0 + i * .025); return .2;
      case 'bubble': osc('sine', 600, 1800, .002, .05, .25); noise('bandpass', 3000, 3000, 3, .002, .04, .15); return .1;
      case 'neon': noise('bandpass', 3000, 1500, 4, .002, .06, .08); return .1;
      case 'firework': osc('sine', 90, 30, .005, .7, .7); noise('lowpass', 4000, 200, .6, .005, .9, .6); for (let i = 0; i < 10; i++) noise('highpass', 5000, 4000, 1, .001, .02, .12, t0 + .25 + Math.random() * .7); return 1.2;
      case 'confetti': noise('bandpass', 5000, 2000, 1.5, .002, .05, .07); return .1;
    }
    noise('lowpass', 1500, 200, 1, .005, .15, .3); return .2;
  }
  // fire
  switch (id) {
    case 'splatter': noise('bandpass', 1400, 350, 2.2, .004, .09, .45); osc('sine', 220, 90, .004, .07, .25); return .12;
    case 'starry': osc('sawtooth', 1400, 180, .005, .35, .12); noise('bandpass', 4000, 800, 1, .005, .45, .25); [0, 4, 7].forEach((k, i) => osc('triangle', 660 * Math.pow(2, k / 12), 660 * Math.pow(2, k / 12), .005, .6, .08, t0 + .04 * i)); osc('sine', 90, 45, .005, .25, .35); return .7;
    case 'dots': osc('sine', note(800, (Math.random() * 8) | 0), 300, .002, .05, .18); return .07;
    case 'pow': osc('sine', 160, 50, .005, .25, .55); noise('lowpass', 1200, 200, 1, .005, .2, .35); osc('square', 900, 300, .005, .08, .05); return .3;
    case 'clock': osc('triangle', 300, 300, .002, .05, .2); osc('triangle', 220, 220, .002, .05, .2, t0 + .13); osc('sine', 500, 120, .01, .8, .15, t0 + .02, 30); osc('sine', 500, 125, .01, .8, .15, t0 + .02, -30); return .9;
    case 'glitter': noise('highpass', 2500, 6000, .8, .003, .22, .45); osc('sine', 120, 50, .005, .15, .4); for (let i = 0; i < 5; i++) osc('sine', R(3000, 6000), R(3000, 6000), .002, .12, .05, t0 + .05 + i * .03); return .3;
    case 'bubble': osc('sine', 260, 900, .01, .14, .22); osc('sine', 520, 1300, .01, .1, .06, t0 + .03); return .2;
    case 'neon': { const o = osc('sawtooth', 110, 110, .005, .11, .07); osc('square', 220 + Math.random() * 30, 230, .005, .1, .03); noise('bandpass', 2500, 2500, 6, .005, .1, .03); return .12; }
    case 'firework': noise('bandpass', 1200, 5000, 3, .01, .5, .3); osc('sine', 700, 2400, .01, .6, .08); osc('sine', 80, 40, .005, .15, .4); return .7;
    case 'confetti': noise('bandpass', 3000, 1200, 1.2, .002, .04, .25); osc('square', 140, 90, .002, .03, .06); return .05;
  }
  return 0;
}
