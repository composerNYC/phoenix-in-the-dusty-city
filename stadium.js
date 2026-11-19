// stadium.js — the Stone Stadium: a stone colosseum next to the Man where two teams of living stones
// play soccer with a huge carved stone ball. Everything here is in the stadium's LOCAL frame:
// x runs the length of the pitch (goals at x = ±PITCH.hx), z runs across it.
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.170.0/+esm';
import { mergeGeometries } from 'https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/utils/BufferGeometryUtils.js/+esm';

export const PITCH = { hx: 32, hz: 20, goalHalf: 7, goalH: 5.2, goalDepth: 3.2 };
export const FOOT = { hx: 48, hz: 35 };          // outer footprint, used to keep other art out
export const BALL_R = 1.5;                        // the HUGE stone ball (3 m across)

export const TEAMS = [
  { name: 'Lava Rocks', short: 'LAVA', glow: 0xff6a1f, css: '#ff8a3d',
    stones: [['Red Jasper', 0x9b3b2a], ['Sandstone', 0xc98a55], ['Amber', 0xc7801e], ['Terracotta', 0xb5562f], ['Pumice', 0xd9b48c]] },
  { name: 'Granite Giants', short: 'GRANITE', glow: 0x3fd8ff, css: '#5fd8ff',
    stones: [['Granite', 0x8d8d8f], ['Basalt', 0x3a3c40], ['Jade', 0x4f8f6a], ['Slate', 0x52607a], ['Marble', 0xe8e4dc]] },
];
// roles: 0 keeper, 1-2 defenders, 3-4 forwards. Homes are in "attack" coords (own goal at fx = -hx).
const HOMES = [[-29, 0], [-17, -8], [-17, 8], [-4, -7], [-4, 7]];

function rng(seed) { let a = seed | 0; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
// lumpy boulder: icosahedron with per-vertex jitter (vertices keyed by position so it stays closed)
function rockGeo(seed, detail = 1, jag = 0.18) {
  const r = rng(seed), g = new THREE.IcosahedronGeometry(1, detail), p = g.attributes.position, m = new Map();
  for (let i = 0; i < p.count; i++) {
    const k = p.getX(i).toFixed(3) + ',' + p.getY(i).toFixed(3) + ',' + p.getZ(i).toFixed(3);
    let s = m.get(k); if (s === undefined) { s = 1 + (r() - 0.5) * 2 * jag; m.set(k, s); }
    p.setXYZ(i, p.getX(i) * s, p.getY(i) * s, p.getZ(i) * s);
  }
  g.computeVertexNormals(); return g;
}
const stoneMat = (col, rough = 0.9) => new THREE.MeshStandardMaterial({ color: col, roughness: rough, metalness: 0, flatShading: true });

function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
}

// ------------------------------------------------------------------ stone players
function buildBaller(team, idx, ROCKS) {
  const [stoneName, col] = team.stones[idx];
  const m = stoneMat(col, stoneName === 'Marble' ? 0.45 : stoneName === 'Basalt' ? 0.75 : 0.92);
  const dark = stoneMat(new THREE.Color(col).multiplyScalar(0.72).getHex(), 0.95);
  const glow = new THREE.MeshStandardMaterial({ color: 0x111111, emissive: team.glow, emissiveIntensity: 2.4 });
  const R = (i) => ROCKS[(idx * 3 + i) % ROCKS.length];
  const mesh = (geo, mat, sx, sy, sz, x, y, z) => { const o = new THREE.Mesh(geo, mat); o.scale.set(sx, sy, sz); o.position.set(x, y, z); o.castShadow = true; return o; };
  const g = new THREE.Group(), body = new THREE.Group(); g.add(body);
  body.add(mesh(R(0), m, 1.05, 1.25, 0.82, 0, 2.4, 0));            // chest boulder
  body.add(mesh(R(1), dark, 0.78, 0.48, 0.58, 0, 1.38, 0));        // hips
  const band = new THREE.Mesh(new THREE.TorusGeometry(1, 0.09, 6, 22), glow);
  band.rotation.x = Math.PI / 2; band.scale.set(0.98, 0.78, 1); band.position.y = 1.95; body.add(band);
  // glowing rune on the chest (team mark)
  { const rune = mesh(new THREE.BoxGeometry(1, 1, 1), glow, 0.36, 0.36, 0.06, 0, 2.6, 0.8); rune.rotation.z = Math.PI / 4; body.add(rune); }
  const head = new THREE.Group(); head.position.y = 3.85; body.add(head);
  head.add(mesh(R(2), m, 0.58, 0.52, 0.52, 0, 0, 0));
  for (const s of [-1, 1]) head.add(mesh(new THREE.BoxGeometry(1, 1, 1), glow, 0.16, 0.09, 0.06, s * 0.21, 0.05, 0.47));
  if (idx === 0) head.add(mesh(R(3), dark, 0.62, 0.16, 0.58, 0, 0.42, 0)); // keeper's flat-stone cap
  const limb = (side, y, isLeg) => {
    const piv = new THREE.Group(); piv.position.set(side * (isLeg ? 0.5 : 1.18), y, 0); body.add(piv);
    if (isLeg) {
      piv.add(mesh(R(3), m, 0.42, 0.55, 0.42, 0, -0.42, 0), mesh(R(4), dark, 0.36, 0.48, 0.36, 0, -0.95, 0.02));
      const foot = mesh(new THREE.BoxGeometry(1, 1, 1), dark, 0.55, 0.26, 0.82, 0, -1.25, 0.14); piv.add(foot);
    } else {
      piv.add(mesh(R(5), m, 0.38, 0.55, 0.38, 0, -0.5, 0), mesh(R(6), dark, 0.33, 0.48, 0.33, 0, -1.3, 0), mesh(R(7), m, 0.34, 0.32, 0.34, 0, -1.85, 0));
      piv.rotation.z = side * 0.18;
    }
    return piv;
  };
  const armL = limb(-1, 3.05, false), armR = limb(1, 3.05, false), legL = limb(-1, 1.3, true), legR = limb(1, 1.3, true);
  const s = idx === 0 ? 1.12 : 0.9 + ((idx * 37) % 10) / 40;
  g.scale.setScalar(s);
  return { g, body, head, armL, armR, legL, legR, scale: s, name: stoneName, team, idx,
    pos: new THREE.Vector3(), vel: new THREE.Vector3(), face: 0, ph: Math.random() * 6, kickT: 0, cool: 0, aimZ: 0, side: 1 };
}

// ------------------------------------------------------------------ the big stone ball
function buildBall() {
  const g = new THREE.Group();
  const core = new THREE.Mesh(rockGeo(4242, 3, 0.025), stoneMat(0xd8cfbf, 0.8)); core.scale.setScalar(BALL_R); core.castShadow = true; g.add(core);
  // twelve carved dark pentagons on the icosahedron's vertex directions = a soccer ball made of stone
  const ico = new THREE.IcosahedronGeometry(1, 0).attributes.position, seen = new Set(), dark = stoneMat(0x2c2a28, 0.85);
  const pent = new THREE.CylinderGeometry(BALL_R * 0.36, BALL_R * 0.4, 0.16, 5);
  for (let i = 0; i < ico.count; i++) {
    const v = new THREE.Vector3(ico.getX(i), ico.getY(i), ico.getZ(i)).normalize(), k = v.toArray().map(n => n.toFixed(2)).join();
    if (seen.has(k)) continue; seen.add(k);
    const p = new THREE.Mesh(pent, dark); p.position.copy(v).multiplyScalar(BALL_R * 0.985);
    p.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), v); g.add(p);
  }
  return g;
}

// ------------------------------------------------------------------ build
export function buildStadium(opts = {}) {
  const neon = opts.neon || ((c, i = 1) => new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(1 + i) }));
  const glowMap = opts.glowMap;
  const root = new THREE.Group(); root.name = 'stoneStadium';
  const obstacles = [];                       // [lx, lz, r] in local coords
  const statics = new Map();                  // material -> geometries (merged at the end)
  const addStatic = (geo, mat) => { if (!statics.has(mat)) statics.set(mat, []); statics.get(mat).push(geo); };
  const box = (mat, w, h, d, x, y, z, ry = 0) => { const g = new THREE.BoxGeometry(w, h, d); if (ry) g.rotateY(ry); g.translate(x, y, z); addStatic(g, mat); };

  const stoneA = stoneMat(0xb89a74, 0.95), stoneB = stoneMat(0x9a7f5f, 0.95), stoneC = stoneMat(0x7d6850, 0.95), crown = stoneMat(0xa89c8c, 0.9);

  // packed-sandstone floor inside the bowl, then the pitch
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(FOOT.hx * 2 - 2, FOOT.hz * 2 - 2),
    new THREE.MeshStandardMaterial({ color: 0xc9b08a, roughness: 1, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }));
  floor.rotation.x = -Math.PI / 2; floor.position.y = 0.03; floor.receiveShadow = true; root.add(floor);
  const PX = 16; // pixels per meter
  const pitchTex = canvasTex((PITCH.hx * 2 + 4) * PX, (PITCH.hz * 2 + 4) * PX, (x, w, h) => {
    const m = (v) => v * PX, cx = w / 2, cy = h / 2;
    for (let i = 0; i < 17; i++) { x.fillStyle = i % 2 ? '#3e8a38' : '#4b9a42'; x.fillRect(i * w / 17, 0, w / 17 + 1, h); }
    x.strokeStyle = 'rgba(255,255,255,.92)'; x.lineWidth = 4;
    x.strokeRect(m(2), m(2), m(PITCH.hx * 2), m(PITCH.hz * 2));
    x.beginPath(); x.moveTo(cx, m(2)); x.lineTo(cx, h - m(2)); x.stroke();
    x.beginPath(); x.arc(cx, cy, m(6), 0, Math.PI * 2); x.stroke();
    x.fillStyle = '#fff'; x.beginPath(); x.arc(cx, cy, 6, 0, Math.PI * 2); x.fill();
    for (const s of [-1, 1]) {
      const gx = cx + s * m(PITCH.hx);
      x.strokeRect(Math.min(gx, gx - s * m(10)), cy - m(12), m(10), m(24));
      x.strokeRect(Math.min(gx, gx - s * m(4)), cy - m(7.5), m(4), m(15));
      x.beginPath(); x.arc(gx - s * m(7.5), cy, 5, 0, Math.PI * 2); x.fill();
    }
    // the Man, painted at center
    x.strokeStyle = 'rgba(255,214,120,.55)'; x.lineWidth = 5; x.beginPath();
    x.moveTo(cx, cy - m(3)); x.lineTo(cx, cy + m(1.2)); x.moveTo(cx - m(2), cy - m(2.4)); x.lineTo(cx, cy - m(1)); x.lineTo(cx + m(2), cy - m(2.4));
    x.moveTo(cx - m(1.4), cy + m(3.2)); x.lineTo(cx, cy + m(1.2)); x.lineTo(cx + m(1.4), cy + m(3.2)); x.stroke();
  });
  const pitch = new THREE.Mesh(new THREE.PlaneGeometry(PITCH.hx * 2 + 4, PITCH.hz * 2 + 4),
    new THREE.MeshStandardMaterial({ map: pitchTex, roughness: 0.95, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
  pitch.rotation.x = -Math.PI / 2; pitch.position.y = 0.06; pitch.receiveShadow = true; root.add(pitch);

  // tiered stone stands: long sides (|z| > 23) and ends (|x| > 36). Corners stay open as entrances.
  const TIERS = 5, tierH = (i) => 0.9 + i * 1.25;
  for (const s of [-1, 1]) {
    for (let i = 0; i < TIERS; i++) {
      const h = tierH(i), z0 = 23 + i * 2, mat = i % 2 ? stoneB : stoneA;
      box(mat, 60, h, 2, 0, h / 2, s * (z0 + 1));
      const x0 = 36 + i * 2;
      box(mat, 2, h, 32, s * (x0 + 1), h / 2, 0);
    }
    box(stoneC, 62, 8.6, 1.4, 0, 4.3, s * 33.7);   // back walls
    box(stoneC, 1.4, 8.6, 34, s * 46.7, 4.3, 0);
    for (let x = -28; x <= 28; x += 2.6) for (let z = 24; z <= 33.5; z += 2.6) obstacles.push([x, s * z, 1.9]);
    for (let z = -15; z <= 15; z += 2.6) for (let x = 37; x <= 46.5; x += 2.6) obstacles.push([s * x, z, 1.9]);
  }
  // neon strips along the tier fronts: orange on the Lava half, cyan on the Granite half
  const nOr = neon(TEAMS[0].glow, 1.1), nCy = neon(TEAMS[1].glow, 1.1);
  for (const s of [-1, 1]) for (let i = 0; i < TIERS; i += 2) {
    const h = tierH(i), z0 = 23 + i * 2;
    box(nOr, 29.6, 0.12, 0.12, -15, h + 0.02, s * (z0 - 0.02));
    box(nCy, 29.6, 0.12, 0.12, 15, h + 0.02, s * (z0 - 0.02));
    box(s < 0 ? nOr : nCy, 0.12, 0.12, 31.6, s * (36 + i * 2 - 0.02), h + 0.02, 0);
  }
  // Stonehenge crown: trilithons along the rim
  // chunky trilithons (two uprights + a lintel), like Stonehenge, spaced around the rim
  for (const s of [-1, 1]) {
    for (const x of [-26, -13, 13, 26]) { box(crown, 2.2, 6.2, 1.9, x - 2.6, 8.6 + 3.1, s * 33.7); box(crown, 2.2, 6.2, 1.9, x + 2.6, 8.6 + 3.1, s * 33.7); box(crown, 8.4, 1.5, 2.2, x, 15.45, s * 33.7, (s * x % 3) * 0.02); }
    for (const z of [-11, 11]) { box(crown, 1.9, 6.2, 2.2, s * 46.7, 8.6 + 3.1, z - 2.6); box(crown, 1.9, 6.2, 2.2, s * 46.7, 8.6 + 3.1, z + 2.6); box(crown, 2.2, 1.5, 8.4, s * 46.7, 15.45, z); }
    // buttresses on the outside walls so the stadium reads as stone from the playa
    for (let x = -27; x <= 27; x += 6) box(stoneB, 1.8, 8.2, 1.1, x, 4.1, s * 34.9);
    for (let z = -14; z <= 14; z += 7) box(stoneB, 1.1, 8.2, 1.8, s * 47.9, 4.1, z);
  }
  // pitch boards with playa slogans (the ball bounces off these)
  const boardTex = canvasTex(1024, 64, (x, w, h) => {
    x.fillStyle = '#16111f'; x.fillRect(0, 0, w, h);
    const words = ['STONE CUP', 'DUST IS LOVE', 'LEAVE NO TRACE', 'GIFT EVERYTHING', 'ROCK ON'];
    x.font = '800 34px system-ui,sans-serif'; x.textBaseline = 'middle'; let px = 16;
    words.forEach((wd, i) => { x.fillStyle = i % 2 ? '#5fd8ff' : '#ff8a3d'; x.fillText(wd, px, h / 2 + 2); px += x.measureText(wd).width + 40; });
  });
  boardTex.wrapS = THREE.RepeatWrapping;
  const boardMat = new THREE.MeshBasicMaterial({ map: boardTex, toneMapped: false });
  const boardMatX = boardMat.clone(); boardMatX.map = boardTex.clone(); boardMatX.map.repeat.set(2.5, 1); boardMatX.map.wrapS = THREE.RepeatWrapping; boardMatX.map.needsUpdate = true;
  boardMat.map.repeat.set(4.5, 1);
  for (const s of [-1, 1]) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(PITCH.hx * 2 + 1, 0.9, 0.25), [stoneC, stoneC, stoneC, stoneC, boardMat, boardMat]);
    b.position.set(0, 0.45, s * (PITCH.hz + 0.6)); root.add(b);
    for (const t of [-1, 1]) {
      const e = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.9, PITCH.hz - PITCH.goalHalf), [boardMatX, boardMatX, stoneC, stoneC, stoneC, stoneC]);
      e.position.set(s * (PITCH.hx + 0.6), 0.45, t * (PITCH.goalHalf + (PITCH.hz - PITCH.goalHalf) / 2)); root.add(e);
    }
  }
  // goals: marble posts, crossbar and a rope net
  const netTex = canvasTex(128, 128, (x, w, h) => { x.clearRect(0, 0, w, h); x.strokeStyle = 'rgba(255,255,255,.85)'; x.lineWidth = 3; for (let i = 0; i <= 8; i++) { x.beginPath(); x.moveTo(i * 16, 0); x.lineTo(i * 16, h); x.stroke(); x.beginPath(); x.moveTo(0, i * 16); x.lineTo(w, i * 16); x.stroke(); } });
  netTex.wrapS = netTex.wrapT = THREE.RepeatWrapping;
  const netMat = new THREE.MeshStandardMaterial({ map: netTex, transparent: true, alphaTest: 0.3, side: THREE.DoubleSide, roughness: 1 });
  const marble = stoneMat(0xf1ece2, 0.5);
  for (const s of [-1, 1]) {
    const gx = s * PITCH.hx, D = PITCH.goalDepth, Hh = PITCH.goalH, W = PITCH.goalHalf;
    for (const t of [-1, 1]) {
      box(marble, 0.5, Hh, 0.5, gx, Hh / 2, t * W);
      obstacles.push([gx, t * W, 0.5]);
      const side = new THREE.Mesh(new THREE.PlaneGeometry(D, Hh), netMat); side.position.set(gx + s * D / 2, Hh / 2, t * W); root.add(side);
      side.material.map.repeat.set(2, 3);
    }
    box(marble, 0.5, 0.5, W * 2 + 0.5, gx, Hh, 0);
    const back = new THREE.Mesh(new THREE.PlaneGeometry(W * 2, Hh), netMat); back.rotation.y = Math.PI / 2; back.position.set(gx + s * D, Hh / 2, 0); root.add(back);
    const top = new THREE.Mesh(new THREE.PlaneGeometry(D, W * 2), netMat); top.rotation.x = -Math.PI / 2; top.position.set(gx + s * D / 2, Hh, 0); root.add(top);
    for (let z = -W; z <= W; z += 2.2) obstacles.push([gx + s * (D + 0.3), z, 0.6]);
  }
  // floodlight obelisks in the open corners
  const lampHeads = [];
  const headMat = new THREE.MeshStandardMaterial({ color: 0x222222, emissive: 0xfff1d6, emissiveIntensity: 0.4 });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const x = sx * 41, z = sz * 29.5;
    const ob = new THREE.CylinderGeometry(0.8, 1.7, 21, 4); ob.rotateY(Math.PI / 4); ob.translate(x, 10.5, z); addStatic(ob, stoneC);
    box(stoneB, 4, 0.6, 4, x, 0.3, z);
    obstacles.push([x, z, 2.2]);
    const head = new THREE.Mesh(new THREE.BoxGeometry(4.2, 2.2, 0.8), headMat);
    head.position.set(x, 22, z); head.lookAt(0, 0, 0); root.add(head); lampHeads.push(head);
    if (glowMap) { const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowMap, color: 0xfff1d6, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: false })); sp.scale.setScalar(16); sp.position.set(x * 0.97, 22, z * 0.97); root.add(sp); head.userData.sprite = sp; }
  }
  // scoreboards above both ends, plus a "STONE CUP" banner
  const sbCanvas = document.createElement('canvas'); sbCanvas.width = 768; sbCanvas.height = 256;
  const sbTex = new THREE.CanvasTexture(sbCanvas); sbTex.colorSpace = THREE.SRGBColorSpace;
  const sbMat = new THREE.MeshBasicMaterial({ map: sbTex, toneMapped: false });
  for (const s of [-1, 1]) {
    box(stoneC, 1.2, 8, 20, s * 47.2, 19, 0);
    const sb = new THREE.Mesh(new THREE.PlaneGeometry(18, 6), sbMat); sb.position.set(s * 46.5, 19, 0); sb.rotation.y = -s * Math.PI / 2; root.add(sb);
    const so = sb.clone(); so.position.x = s * 47.85; so.rotation.y = s * Math.PI / 2; root.add(so);
  }
  const bannerTex = canvasTex(1024, 160, (x, w, h) => {
    x.fillStyle = '#100c18'; x.fillRect(0, 0, w, h);
    x.font = '900 104px system-ui,sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
    const gr = x.createLinearGradient(0, 0, w, 0); gr.addColorStop(0, '#ff8a3d'); gr.addColorStop(0.5, '#ffe9b0'); gr.addColorStop(1, '#5fd8ff');
    x.fillStyle = gr; x.fillText('THE STONE CUP', w / 2, h / 2 + 6);
  });
  for (const s of [-1, 1]) {
    const bn = new THREE.Mesh(new THREE.PlaneGeometry(28, 4.4), new THREE.MeshBasicMaterial({ map: bannerTex, toneMapped: false }));
    bn.position.set(0, 17.6, s * 33.6); bn.rotation.y = s > 0 ? Math.PI : 0; root.add(bn);
    const bo = bn.clone(); bo.position.z = s * 34.65; bo.rotation.y = s > 0 ? 0 : Math.PI; root.add(bo);
    box(stoneC, 29, 5, 0.8, 0, 17.6, s * 34.2);
  }

  // merge all static stone by material (one draw call each)
  for (const [mat, geos] of statics) {
    const merged = mergeGeometries(geos.map(g => g.index ? g.toNonIndexed() : g), false);
    const m = new THREE.Mesh(merged, mat); m.castShadow = mat !== nOr && mat !== nCy; m.receiveShadow = true; root.add(m);
  }

  // ---------------------------------------------------------------- pebble fans in the stands
  const fanSpots = [], fr = rng(99);
  for (const s of [-1, 1]) for (let i = 0; i < TIERS; i++) {
    const h = tierH(i), z0 = 23 + i * 2;
    for (let x = -28.5; x <= 28.5; x += 1.5) if (fr() < 0.62) fanSpots.push([x + (fr() - 0.5) * 0.5, h, s * (z0 + 1), x < 0 ? 0 : 1]);
    const x0 = 36 + i * 2;
    for (let z = -14.5; z <= 14.5; z += 1.5) if (fr() < 0.62) fanSpots.push([s * (x0 + 1), h, z + (fr() - 0.5) * 0.5, s < 0 ? 0 : 1]);
  }
  const fanGeo = rockGeo(7, 0, 0.2);
  const fans = new THREE.InstancedMesh(fanGeo, new THREE.MeshStandardMaterial({ roughness: 0.9, flatShading: true }), fanSpots.length);
  const fanEyes = new THREE.InstancedMesh(new THREE.BoxGeometry(0.42, 0.08, 0.05), new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }), fanSpots.length);
  const allStones = [...TEAMS[0].stones, ...TEAMS[1].stones].map(s => s[1]);
  const _c = new THREE.Color(), _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _sv = new THREE.Vector3(), _pv = new THREE.Vector3(), _e = new THREE.Euler();
  const fanPh = fanSpots.map(() => fr() * 6.28), fanSz = fanSpots.map(() => 0.42 + fr() * 0.2);
  fanSpots.forEach((f, i) => {
    fans.setColorAt(i, _c.setHex(allStones[(fr() * allStones.length) | 0]));
    fanEyes.setColorAt(i, _c.setHex(TEAMS[f[3]].glow).multiplyScalar(2.2));
  });
  fans.castShadow = false; root.add(fans, fanEyes);
  const fanFace = (f) => Math.atan2(-f[0], -f[2]);
  function updateFans(t, excite) {
    for (let i = 0; i < fanSpots.length; i++) {
      const f = fanSpots[i], s = fanSz[i];
      const cheer = excite[f[3]];
      const hop = Math.max(0, Math.sin(t * (3 + cheer * 6) + fanPh[i])) * (0.06 + cheer * 0.55);
      const y = f[1] + s * 1.25 + hop, ry = fanFace(f);
      _q.setFromEuler(_e.set(0, ry, 0)); _m4.compose(_pv.set(f[0], y, f[2]), _q, _sv.set(s, s * 1.3, s)); fans.setMatrixAt(i, _m4);
      const ex = f[0] + Math.sin(ry) * s * 0.92, ez = f[2] + Math.cos(ry) * s * 0.92;
      _m4.compose(_pv.set(ex, y + s * 0.35, ez), _q, _sv.set(s * 1.1, 1, 1)); fanEyes.setMatrixAt(i, _m4);
    }
    fans.instanceMatrix.needsUpdate = true; fanEyes.instanceMatrix.needsUpdate = true;
  }

  // ---------------------------------------------------------------- players + ball
  const ROCKS = []; for (let i = 0; i < 9; i++) ROCKS.push(rockGeo(1000 + i * 17, 1, 0.2));
  const players = [];
  TEAMS.forEach((team, ti) => { for (let i = 0; i < 5; i++) { const p = buildBaller(team, i, ROCKS); p.ti = ti; p.dir = ti === 0 ? 1 : -1; root.add(p.g); players.push(p); } });
  const ball = { g: buildBall(), p: new THREE.Vector3(0, BALL_R, 0), v: new THREE.Vector3(), vy: 0 };
  root.add(ball.g);

  const night = { light: new THREE.PointLight(0xfff0d8, 0, 120, 1.1) };
  night.light.position.set(0, 26, 0); root.add(night.light);

  const S = {
    root, obstacles, players, ball, TEAMS,
    score: [0, 0], phase: 'kickoff', timer: 2.5, kickoffTeam: 0, lastTouch: null, excite: [0, 0], clock: 0, half: 1, msg: '',
    playerCool: 0, chaser: [null, null],
  };

  function drawBoard(t) {
    const x = sbCanvas.getContext('2d'), w = sbCanvas.width, h = sbCanvas.height;
    x.fillStyle = '#0d0a14'; x.fillRect(0, 0, w, h);
    x.strokeStyle = '#3a2f4a'; x.lineWidth = 6; x.strokeRect(6, 6, w - 12, h - 12);
    x.textBaseline = 'middle'; x.font = '800 44px system-ui,sans-serif';
    x.textAlign = 'left'; x.fillStyle = TEAMS[0].css; x.fillText(TEAMS[0].short, 34, 70);
    x.textAlign = 'right'; x.fillStyle = TEAMS[1].css; x.fillText(TEAMS[1].short, w - 34, 70);
    x.textAlign = 'center'; x.fillStyle = '#fff6e0'; x.font = '900 110px system-ui,sans-serif'; x.fillText(`${S.score[0]} : ${S.score[1]}`, w / 2, 112);
    x.font = '700 34px system-ui,sans-serif'; x.fillStyle = S.phase === 'goal' ? '#ffe36b' : '#bfb3d6';
    const mins = Math.floor(S.clock / 60), secs = Math.floor(S.clock % 60);
    x.fillText(S.phase === 'goal' ? S.msg : `THE STONE CUP · ${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`, w / 2, 206);
    sbTex.needsUpdate = true;
  }
  drawBoard(0);

  // positions for kickoff
  function lineUp(snap) {
    for (const p of players) {
      const [hx, hz] = HOMES[p.idx];
      let fx = hx, fz = hz;
      if (p.idx >= 3) fx = p.ti === S.kickoffTeam ? -1.2 : -8;   // kicking team stands at the ball
      if (p.idx === 3 && p.ti === S.kickoffTeam) { fx = -BALL_R - 1.0; fz = 0; }
      p.home = [fx, fz];
      if (snap) { p.pos.set(fx * p.dir, 0, fz * p.dir); p.vel.set(0, 0, 0); p.face = p.dir > 0 ? Math.PI / 2 : -Math.PI / 2; }
    }
  }
  function resetBall() { ball.p.set(0, BALL_R, 0); ball.v.set(0, 0, 0); ball.vy = 0; }
  lineUp(true); resetBall();

  const _a = new THREE.Vector3(), _g = new THREE.Vector3(), _b = new THREE.Vector3(), _axis = new THREE.Vector3(), _rq = new THREE.Quaternion();
  const clampP = (v, mx, mz) => { v.x = Math.max(-mx, Math.min(mx, v.x)); v.z = Math.max(-mz, Math.min(mz, v.z)); };

  function kick(p, dirX, dirZ, speed, loft) {
    const l = Math.hypot(dirX, dirZ) || 1;
    ball.v.set(dirX / l * speed, 0, dirZ / l * speed); if (loft) ball.vy = loft;
    p.kickT = 0.38; p.cool = 0.75; S.lastTouch = p;
    // a hard shot at goal: the other keeper guesses wrong about half the time
    if (speed > 13 && p.idx !== 0) { const gk = players.find(q => q.ti !== p.ti && q.idx === 0); if (gk && Math.random() < 0.55) { gk.beaten = 1.4; gk.diveZ = -Math.sign(dirZ || 1) * (PITCH.goalHalf + 1); } }
    if (opts.onKick) opts.onKick(Math.min(1, speed / 18), ball.p);
  }

  function steerTo(p, tx, tz, maxSp, dt) {
    _a.set(tx - p.pos.x, 0, tz - p.pos.z); const d = _a.length();
    const want = d > 0.3 ? Math.min(maxSp, d * 2.2) : 0;
    if (d > 0.001) _a.multiplyScalar(want / d); else _a.set(0, 0, 0);
    p.vel.x += (_a.x - p.vel.x) * Math.min(1, dt * 5); p.vel.z += (_a.z - p.vel.z) * Math.min(1, dt * 5);
  }

  function aiPlayer(p, dt, playing) {
    const own = -PITCH.hx * p.dir, tgtX = PITCH.hx * p.dir;
    const b = ball.p;
    if (!playing) { steerTo(p, p.home[0] * p.dir, p.home[1] * p.dir, 5, dt); return; }
    const ballF = b.x * p.dir; // ball position in this team's attacking frame
    if (p.idx === 0) {
      if (p.beaten > 0) { p.beaten -= dt; steerTo(p, own + p.dir * 1.2, p.diveZ, 7, dt); return; }
      // keeper: guard the line, rush the ball when it comes close
      const dOwn = Math.hypot(b.x - own, b.z);
      if (dOwn < 7.5 && p.cool <= 0 && (p.react = (p.react || 0) + dt) > 0.35) {
        steerTo(p, b.x - p.dir * (BALL_R + 0.8), b.z, 7, dt);
        if (Math.hypot(b.x - p.pos.x, b.z - p.pos.z) < BALL_R + 1.7) kick(p, p.dir, (Math.random() - 0.5) * 1.4, 16 + Math.random() * 4, 4 + Math.random() * 3);
      } else { if (dOwn >= 7.5) p.react = 0; steerTo(p, own + p.dir * 1.8, Math.max(-PITCH.goalHalf + 1.5, Math.min(PITCH.goalHalf - 1.5, b.z * 0.45)), 3.6, dt); }
      return;
    }
    if (S.chaser[p.ti] === p) {
      // go around behind the ball, then strike toward the goal (or a teammate)
      if (p.aimZ === undefined || p.cool > 0.6) p.aimZ = (Math.random() - 0.5) * (PITCH.goalHalf * 1.4);
      _g.set(tgtX - b.x, 0, p.aimZ - b.z).normalize();
      const behindX = b.x - _g.x * (BALL_R + 1.1), behindZ = b.z - _g.z * (BALL_R + 1.1);
      const toBallX = b.x - p.pos.x, toBallZ = b.z - p.pos.z, dB = Math.hypot(toBallX, toBallZ);
      const ahead = (p.pos.x - b.x) * _g.x + (p.pos.z - b.z) * _g.z; // >0 = wrong side of the ball
      let tx = behindX, tz = behindZ;
      if (ahead > -0.4 && dB < BALL_R + 5) { const side = ((p.pos.x - b.x) * -_g.z + (p.pos.z - b.z) * _g.x) >= 0 ? 1 : -1; tx = b.x - _g.z * side * (BALL_R + 2.4) - _g.x * 1.5; tz = b.z + _g.x * side * (BALL_R + 2.4) - _g.z * 1.5; }
      steerTo(p, tx, tz, 7.2, dt);
      const pinned = Math.abs(b.z) > PITCH.hz - BALL_R - 1.6 || Math.abs(b.x) > PITCH.hx - BALL_R - 1.6;
      if (p.cool <= 0 && dB < BALL_R + 1.8 && ((toBallX * _g.x + toBallZ * _g.z) / Math.max(dB, 0.01) > 0.35 || pinned)) {
        const distGoal = Math.hypot(tgtX - b.x, b.z);
        // pass to a teammate further upfield sometimes
        let mate = null;
        if (distGoal > 18 && Math.random() < 0.35) for (const q of players) if (q.ti === p.ti && q !== p && q.idx > 0 && q.pos.x * p.dir > b.x * p.dir + 4) { mate = q; break; }
        if (mate) kick(p, mate.pos.x + mate.vel.x * 0.6 - b.x, mate.pos.z + mate.vel.z * 0.6 - b.z, 10 + Math.random() * 3, 0);
        else if (distGoal < 30) kick(p, _g.x, _g.z, 16 + Math.random() * 5, Math.random() < 0.35 ? 3 + Math.random() * 4 : 0);
        else kick(p, _g.x + (Math.random() - 0.5) * 0.3, _g.z + (Math.random() - 0.5) * 0.3, 8 + Math.random() * 3, 0);
      }
      return;
    }
    // support: hold a formation spot that slides with the ball
    const [hx, hz] = HOMES[p.idx];
    let fx = hx + (Math.max(-26, Math.min(26, ballF)) + 6) * (p.idx >= 3 ? 0.62 : 0.5);
    if (p.idx < 3) fx = Math.min(fx, ballF - 3);
    const fz = hz * 0.9 + b.z * p.dir * 0.3;
    steerTo(p, fx * p.dir, fz * p.dir, 5.6, dt);
  }

  function animate(p, dt, t) {
    const sp = Math.hypot(p.vel.x, p.vel.z);
    if (sp > 0.4) { const f = Math.atan2(p.vel.x, p.vel.z); let d = f - p.face; d = Math.atan2(Math.sin(d), Math.cos(d)); p.face += d * Math.min(1, dt * 7); }
    else { const f = Math.atan2(ball.p.x - p.pos.x, ball.p.z - p.pos.z); let d = f - p.face; d = Math.atan2(Math.sin(d), Math.cos(d)); p.face += d * Math.min(1, dt * 3); }
    p.ph += sp * dt * 1.7;
    const sw = Math.min(1, sp / 6) * 0.8, s = Math.sin(p.ph);
    let lift = Math.abs(s) * 0.16 * Math.min(1, sp / 4);
    p.legL.rotation.x = s * sw; p.legR.rotation.x = -s * sw;
    p.armL.rotation.x = -s * sw * 0.7; p.armR.rotation.x = s * sw * 0.7;
    p.armL.rotation.z = -0.18; p.armR.rotation.z = 0.18;
    p.body.rotation.x = Math.min(0.28, sp * 0.035); p.head.rotation.x = 0;
    if (p.kickT > 0) { const k = 1 - p.kickT / 0.38; p.legR.rotation.x = -1.5 * Math.sin(k * Math.PI) + 0.4 * Math.sin(k * Math.PI * 2); p.armL.rotation.x = -0.8 * Math.sin(k * Math.PI); }
    if (S.phase === 'goal') {
      const scorer = S.goalTeam;
      if (p.ti === scorer) { lift = Math.abs(Math.sin(t * 6 + p.idx)) * 1.1; p.armL.rotation.z = -2.6; p.armR.rotation.z = 2.6; }
      else { p.head.rotation.x = 0.45; p.body.rotation.x = 0.2; }
    }
    p.body.position.y = lift;
    p.g.position.set(p.pos.x, 0.06, p.pos.z); p.g.rotation.y = p.face;
  }

  S.update = function (dt, ctx = {}) {
    dt = Math.min(dt, 0.05);
    const t = ctx.t || performance.now() * 0.001;
    const playing = S.phase === 'play';
    S.excite[0] = Math.max(0, S.excite[0] - dt * 0.25); S.excite[1] = Math.max(0, S.excite[1] - dt * 0.25);
    if (S.phase === 'kickoff') { S.timer -= dt; if (S.timer <= 0) { S.phase = 'play'; const k = players.find(p => p.ti === S.kickoffTeam && p.idx === 3); kick(k, 1 * k.dir, (Math.random() - 0.5) * 0.8, 7, 0); } }
    if (S.phase === 'goal') { S.timer -= dt; if (S.timer <= 0) { S.phase = 'kickoff'; S.timer = 2.2; lineUp(false); resetBall(); drawBoard(t); } }
    if (playing) { S.clock += dt; if (Math.floor(S.clock) !== Math.floor(S.clock - dt)) drawBoard(t); }

    // choose a chaser per team (with a little stickiness)
    for (let ti = 0; ti < 2; ti++) {
      let best = null, bd = 1e9;
      for (const p of players) { if (p.ti !== ti || p.idx === 0) continue; const d = Math.hypot(p.pos.x - ball.p.x, p.pos.z - ball.p.z) - (S.chaser[ti] === p ? 2.5 : 0); if (d < bd) { bd = d; best = p; } }
      S.chaser[ti] = best;
    }
    for (const p of players) { p.cool -= dt; p.kickT = Math.max(0, p.kickT - dt); aiPlayer(p, dt, playing); }
    // integrate + separate players (from each other, from the ball, from Phoenix)
    const pl = ctx.player;
    for (const p of players) {
      p.pos.x += p.vel.x * dt; p.pos.z += p.vel.z * dt;
      for (const q of players) { if (q === p) continue; _b.set(p.pos.x - q.pos.x, 0, p.pos.z - q.pos.z); const d = _b.length(), md = 2.1 * (p.scale + q.scale) / 2; if (d < md && d > 0.001) { _b.multiplyScalar((md - d) / d * 0.5); p.pos.add(_b); } }
      _b.set(p.pos.x - ball.p.x, 0, p.pos.z - ball.p.z); let d = _b.length(); const mb = BALL_R + 0.85 * p.scale;
      if (d < mb && d > 0.001) { _b.multiplyScalar((mb - d) / d); p.pos.add(_b); ball.v.x -= _b.x * 2; ball.v.z -= _b.z * 2; }
      if (pl && pl.onFoot) { _b.set(p.pos.x - pl.x, 0, p.pos.z - pl.z); d = _b.length(); if (d < 1.6 && d > 0.001) { _b.multiplyScalar((1.6 - d) / d * 0.5); p.pos.add(_b); } }
      clampP(p.pos, PITCH.hx + 2.5, PITCH.hz - 0.2);
    }

    // Phoenix can play too: run into the ball to kick it
    S.playerCool -= dt;
    if (pl && pl.onFoot && S.phase !== 'goal') {
      const dx = ball.p.x - pl.x, dz = ball.p.z - pl.z, d = Math.hypot(dx, dz);
      if (d < BALL_R + 0.75 && S.playerCool <= 0) {
        const ps = Math.hypot(pl.vx, pl.vz);
        let kx = dx / d, kz = dz / d;
        if (ps > 0.5) { kx = kx * 0.4 + pl.vx / ps * 0.6; kz = kz * 0.4 + pl.vz / ps * 0.6; }
        const l = Math.hypot(kx, kz) || 1, power = 7 + ps * 1.4;
        ball.v.set(kx / l * power, 0, kz / l * power); if (ps > 6) ball.vy = 3;
        S.playerCool = 0.35; S.lastTouch = 'phoenix'; if (S.phase === 'kickoff') { S.phase = 'play'; }
        if (opts.onPlayerKick) opts.onPlayerKick(Math.min(1, power / 18));
      }
    }

    // ball physics
    const b = ball.p, v = ball.v;
    b.x += v.x * dt; b.z += v.z * dt;
    ball.vy -= 22 * dt; b.y += ball.vy * dt;
    if (b.y < BALL_R) { if (ball.vy < -4 && opts.onKick) opts.onKick(Math.min(1, -ball.vy / 14) * 0.6, b); b.y = BALL_R; ball.vy = ball.vy < -2 ? -ball.vy * 0.38 : 0; }
    const fr = Math.exp(-(b.y > BALL_R + 0.05 ? 0.12 : 0.5) * dt); v.x *= fr; v.z *= fr;
    if (Math.abs(b.z) > PITCH.hz - BALL_R) { b.z = Math.sign(b.z) * (PITCH.hz - BALL_R); v.z *= -0.6; }
    const inMouth = Math.abs(b.z) < PITCH.goalHalf - BALL_R * 0.55 && b.y - BALL_R < PITCH.goalH - 0.4;
    if (Math.abs(b.x) > PITCH.hx - BALL_R && !inMouth) {
      if (Math.abs(b.x) < PITCH.hx + 0.5) { b.x = Math.sign(b.x) * (PITCH.hx - BALL_R); v.x *= -0.6; }
    }
    if (inMouth && Math.abs(b.x) > PITCH.hx + BALL_R * 0.6 && S.phase === 'play') {
      const team = b.x > 0 ? 0 : 1; S.score[team]++; S.phase = 'goal'; S.timer = 5; S.goalTeam = team; S.excite[team] = 1;
      const who = S.lastTouch === 'phoenix' ? 'Phoenix' : S.lastTouch && S.lastTouch.ti === team ? S.lastTouch.name : 'an own goal';
      S.msg = who === 'an own goal' ? `GOAL! ${TEAMS[team].short} (own goal!)` : `GOAL! ${who.toUpperCase()}`;
      drawBoard(t);
      if (opts.onGoal) opts.onGoal({ team: TEAMS[team], scorer: who, score: S.score.slice(), byPhoenix: S.lastTouch === 'phoenix' });
    }
    if (Math.abs(b.x) > PITCH.hx + PITCH.goalDepth - BALL_R) { b.x = Math.sign(b.x) * (PITCH.hx + PITCH.goalDepth - BALL_R); v.x *= -0.2; v.z *= 0.5; }
    if (Math.abs(b.x) > PITCH.hx && Math.abs(b.z) > PITCH.goalHalf - BALL_R) { b.z = Math.sign(b.z) * (PITCH.goalHalf - BALL_R); v.z *= -0.4; }
    // roll the stone
    const sp = Math.hypot(v.x, v.z);
    if (sp > 0.01) { _axis.set(v.z, 0, -v.x).normalize(); _rq.setFromAxisAngle(_axis, sp * dt / BALL_R); ball.g.quaternion.premultiply(_rq); }
    ball.g.position.set(b.x, b.y + 0.06, b.z);

    for (const p of players) animate(p, dt, t);
    if (ctx.near !== false) updateFans(t, S.excite);
    // floodlights come up at night
    const n = ctx.night || 0;
    headMat.emissiveIntensity = 0.4 + n * 2.5; night.light.intensity = n * 140;
    for (const h of lampHeads) if (h.userData.sprite) h.userData.sprite.material.opacity = n * 0.6;
  };
  S.excitePhoenix = function () { S.excite[0] = S.excite[1] = 1; };
  S.inPitch = (lx, lz, m = 0) => Math.abs(lx) < PITCH.hx + m && Math.abs(lz) < PITCH.hz + m;
  S.inBowl = (lx, lz) => Math.abs(lx) < 36 && Math.abs(lz) < 23;
  updateFans(0, S.excite);
  return S;
}
