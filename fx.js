// fx.js — global look for "Phoenix in the Dusty City"
// Patches three.js shader chunks once, for every material:
//  - height fog: thick near the playa floor, thin up high (great for skydiving), with warm in-scatter toward the sun
//  - stylized rim light: a soft sky-colored edge on characters, cars and art, masked off flat ground
// All values live in shared uniform objects (FX), updated once per frame by the game.
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.170.0/+esm';

export const FX = {
  fxSunDir: { value: new THREE.Vector3(0, 1, 0) },   // normalized, world space
  fxSunFog: { value: new THREE.Color(0, 0, 0) },     // in-scatter color toward the sun
  fxFalloff: { value: 0.012 },                       // height fog falloff per meter
  fxHeightAmt: { value: 1 },                         // 0 = plain distance fog, 1 = full height fog
  fxRim: { value: new THREE.Color(0, 0, 0) },        // rim light color * strength
  fxRimPow: { value: 3.0 },
};

let installed = false;
export function installFX() {
  if (installed) return; installed = true;
  const C = THREE.ShaderChunk;

  C.fog_pars_vertex = `
#ifdef USE_FOG
  varying float vFogDepth;
  varying vec3 vFogRay;
#endif`;
  // world-space ray from camera to vertex: (mvPosition * viewMatrix) == inverse(view) rotation for orthonormal views
  C.fog_vertex = `
#ifdef USE_FOG
  vFogDepth = - mvPosition.z;
  vFogRay = ( vec4( mvPosition.xyz, 0.0 ) * viewMatrix ).xyz;
#endif`;
  C.fog_pars_fragment = `
#ifdef USE_FOG
  uniform vec3 fogColor;
  varying float vFogDepth;
  varying vec3 vFogRay;
  uniform vec3 fxSunDir;
  uniform vec3 fxSunFog;
  uniform float fxFalloff;
  uniform float fxHeightAmt;
  #ifdef FOG_EXP2
    uniform float fogDensity;
  #else
    uniform float fogNear;
    uniform float fogFar;
  #endif
#endif`;
  C.fog_fragment = `
#ifdef USE_FOG
  float fxDist = length( vFogRay );
  float fxDens = 1.0;
  if ( fxFalloff > 0.0 ) {
    float camH = max( cameraPosition.y, 0.0 );
    float ry = vFogRay.y;
    float a = exp( - fxFalloff * camH );
    fxDens = abs( ry ) > 0.05 ? ( a - exp( - fxFalloff * max( camH + ry, 0.0 ) ) ) / ( fxFalloff * ry ) : a;
    fxDens = mix( 1.0, clamp( fxDens, 0.0, 1.0 ), fxHeightAmt );
  }
  #ifdef FOG_EXP2
    float fogFactor = 1.0 - exp( - fogDensity * fogDensity * fxDist * fxDist * fxDens );
  #else
    float fogFactor = smoothstep( fogNear, fogFar, fxDist * fxDens );
  #endif
  float fxSun = fxDist > 0.0 ? max( dot( vFogRay / fxDist, fxSunDir ), 0.0 ) : 0.0;
  vec3 fxFogCol = fogColor + fxSunFog * ( pow( fxSun, 6.0 ) * 0.7 + pow( fxSun, 40.0 ) * 0.8 );
  gl_FragColor.rgb = mix( gl_FragColor.rgb, fxFogCol, fogFactor );
#endif`;

  // rim light, added to indirect diffuse so it is shaded by AO and tinted by albedo
  C.lights_fragment_end = C.lights_fragment_end + `
#ifndef FX_NO_RIM
  {
    vec3 fxUp = normalize( ( viewMatrix * vec4( 0.0, 1.0, 0.0, 0.0 ) ).xyz );
    float fxUpness = dot( geometryNormal, fxUp );
    float fxF = pow( 1.0 - saturate( dot( geometryNormal, geometryViewDir ) ), fxRimPow );
    reflectedLight.indirectDiffuse += fxRim * fxF * smoothstep( 0.85, 0.35, fxUpness ) * ( 0.35 + 0.65 * diffuseColor.rgb );
  }
#endif`;
  C.lights_pars_begin = C.lights_pars_begin + `
uniform vec3 fxRim;
uniform float fxRimPow;`;

  // every material gets the shared uniforms
  const base = THREE.Material.prototype.onBeforeCompile;
  THREE.Material.prototype.onBeforeCompile = function fxHook(shader) { fxUniforms(shader); };
  void base;
}

export function fxUniforms(shader) {
  for (const k in FX) shader.uniforms[k] = FX[k];
}

// Materials with their own onBeforeCompile miss the prototype hook; wrap them (call before their first compile).
export function fxWrapScene(root) {
  const seen = new Set();
  root.traverse(o => {
    const mats = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
    for (const m of mats) {
      if (seen.has(m)) continue; seen.add(m);
      if (Object.prototype.hasOwnProperty.call(m, 'onBeforeCompile') && !m.userData.fxWrapped) {
        const f = m.onBeforeCompile; m.userData.fxWrapped = true;
        m.onBeforeCompile = function (sh, r) { fxUniforms(sh); f.call(this, sh, r); };
        m.needsUpdate = true;
      }
    }
  });
}

// ---------------------------------------------------------------- sky
// Stylized physical-ish sky: zenith/horizon gradient, sunset fan toward the sun, a pink "belt" opposite,
// layered sun glow, moon, and a procedural Milky Way at night.
export const SKY_FRAG = `
uniform vec3 top, horizon, below, sunCol;
uniform vec3 sunDir, moonDir;
uniform float sunVis, moonVis, uDusk, uNight, uDust, uTime;
varying vec3 vDir;
float h31(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float vnoise(vec3 x){ vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(h31(i), h31(i + vec3(1,0,0)), f.x), mix(h31(i + vec3(0,1,0)), h31(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(h31(i + vec3(0,0,1)), h31(i + vec3(1,0,1)), f.x), mix(h31(i + vec3(0,1,1)), h31(i + vec3(1,1,1)), f.x), f.y), f.z); }
float fbm(vec3 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++){ s += a * vnoise(p); p *= 2.03; a *= 0.5; } return s; }
void main(){
  vec3 d = normalize(vDir); float h = d.y;
  vec3 sd3 = normalize(sunDir);
  float sd = max(dot(d, sd3), 0.0);
  float t = pow(clamp(h, 0.0, 1.0), 0.42);
  vec3 c = mix(horizon, top, t);
  // dusk: warm fan toward the sun along the horizon, violet + pink belt on the far side
  vec2 ah = normalize(d.xz + 1e-5), sh = normalize(sd3.xz + 1e-5);
  float az = dot(ah, sh) * 0.5 + 0.5;
  float band = exp(-max(h, 0.0) * 5.0);
  c += uDusk * band * (az * az * az * vec3(1.0, 0.38, 0.1) * 1.1 + (1.0 - az) * vec3(0.30, 0.14, 0.34) * 0.45);
  c += uDusk * (1.0 - az) * exp(-abs(h - 0.1) * 14.0) * vec3(0.55, 0.26, 0.42) * 0.55;
  c = mix(c, below, smoothstep(0.0, -0.06, h));
  // sun glow layers + disc
  c += sunCol * (pow(sd, 3.0) * 0.14 + pow(sd, 24.0) * 0.35 + pow(sd, 300.0) * 1.4) * sunVis;
  c += sunCol * smoothstep(0.99955, 0.9997, sd) * 30.0 * sunVis * step(-0.02, h);
  // moon
  float md = max(dot(d, normalize(moonDir)), 0.0);
  c += vec3(0.75, 0.8, 1.0) * (smoothstep(0.99965, 0.99978, md) * 4.0 + pow(md, 200.0) * 0.25 + pow(md, 12.0) * 0.04) * moonVis;
  // Milky Way: a dusty band across the sky
  if (uNight > 0.01) {
    vec3 n = normalize(vec3(0.35, 0.45, 0.82));
    float off = dot(d, n);
    float core = exp(-off * off * 28.0);
    float neb = fbm(d * 6.0) * 0.65 + fbm(d * 18.0) * 0.35;
    float lanes = smoothstep(0.35, 0.75, fbm(d * 9.0 + 3.1));
    vec3 mw = mix(vec3(0.42, 0.45, 0.75), vec3(0.95, 0.78, 0.62), neb) * core * (neb * 1.25 - lanes * 0.45);
    float stars = pow(h31(floor(d * 900.0)), 60.0) * 2.5 * (0.6 + core);
    float fade = smoothstep(-0.02, 0.25, h);
    c += (max(mw, 0.0) * 0.32 + vec3(stars)) * uNight * (1.0 - uDust) * fade;
  }
  gl_FragColor = vec4(c, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

// ---------------------------------------------------------------- color grade
export const GRADE_FRAG = `
uniform sampler2D tDiffuse; uniform float uTime, uVig, uWarm, uSat, uDream, uContrast, uCA, uHurt, uAlert;
uniform vec3 uShadowTint, uHighTint;
varying vec2 vUv;
void main(){
  vec2 uv = vUv + uDream * vec2(sin(vUv.y * 14. + uTime * 2.) * .006, sin(vUv.x * 11. + uTime * 1.7) * .008 * (1. - vUv.y));
  vec2 cd = (uv - .5);
  float ca = uCA * dot(cd, cd);
  vec3 c;
  c.r = texture2D(tDiffuse, uv - cd * ca).r;
  c.g = texture2D(tDiffuse, uv).g;
  c.b = texture2D(tDiffuse, uv + cd * ca).b;
  float l = dot(c, vec3(.2126, .7152, .0722));
  c = mix(vec3(l), c, uSat);
  // split toning: cool shadows, warm highlights
  c *= mix(uShadowTint, uHighTint, smoothstep(0.05, 0.75, l));
  // gentle S-curve
  c = mix(c, c * c * (3. - 2. * c), uContrast);
  c *= mix(vec3(1.), vec3(1.06, 1., .9), uWarm);
  c = mix(c, vec3(dot(c, vec3(.35, .5, .15))) * vec3(1.25, 1., .62), uDream * .45);
  vec2 d = vUv - .5;
  c *= 1. - dot(d, d) * (uVig + uDream * 1.4);
  // wanted-level edge pulse (red/blue ranger lights)
  float edge = smoothstep(0.18, 0.5, length(d));
  c += edge * uAlert * mix(vec3(.9, .1, .15), vec3(.1, .3, 1.), step(0., sin(uTime * 9.))) * .22;
  c = mix(c, c * vec3(1.2, .55, .5), uHurt * edge);
  float n = fract(sin(dot(vUv * vec2(1271., 311.) + uTime, vec2(12.9898, 78.233))) * 43758.5453);
  c += (n - .5) * .018;
  gl_FragColor = vec4(clamp(c, 0., 1.), 1.);
}`;
