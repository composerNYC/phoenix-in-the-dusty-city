// Phoenix in the Dusty City — game engine (three.js r170)
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.170.0/+esm';
import { GLTFLoader } from 'https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/loaders/GLTFLoader.js/+esm';
import { clone as cloneSkinned } from 'https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/utils/SkeletonUtils.js/+esm';
import { EffectComposer } from 'https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/postprocessing/EffectComposer.js/+esm';
import { RenderPass } from 'https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/postprocessing/RenderPass.js/+esm';
import { UnrealBloomPass } from 'https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/postprocessing/UnrealBloomPass.js/+esm';
import { OutputPass } from 'https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/postprocessing/OutputPass.js/+esm';
import { ShaderPass } from 'https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/postprocessing/ShaderPass.js/+esm';
import { mergeGeometries } from 'https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/utils/BufferGeometryUtils.js/+esm';
import { installFX, FX, fxUniforms, fxWrapScene, SKY_FRAG, GRADE_FRAG } from './fx.js?v=7';
import { buildStadium, FOOT as STAD_FOOT, PITCH as STAD_PITCH } from './stadium.js?v=7';
installFX();

const $ = s => document.querySelector(s);

// ================= helpers =================
function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
const rnd=mulberry32(1986);
const R=(a,b)=>a+(b-a)*rnd();
const pick=a=>a[Math.floor(rnd()*a.length)];
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const lerp=(a,b,t)=>a+(b-a)*t;
const TAU=Math.PI*2;
const lerpAngle=(a,b,t)=>{const d=((b-a+Math.PI)%TAU+TAU)%TAU-Math.PI;return a+d*t;};
const d2=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);

// ================= city layout =================
// Clock-face city: 12:00 points at the Temple, camps fill 2:00–10:00 in rings around the Man.
const ESP=260;
const STREETS=[['Esplanade',260],['Aether',290],['Bazaar',320],['Cosmos',350],['Dune',380],['Ember',410],['Fable',440]];
const FENCE_R=700, FENCE_IN=FENCE_R*Math.cos(Math.PI/5);
function clockPos(h,r){const t=h/12*TAU;return new THREE.Vector3(Math.sin(t)*r,0,-Math.cos(t)*r);}
function clockOf(x,z){let t=Math.atan2(x,-z);if(t<0)t+=TAU;return t/TAU*12;}
function fmtClock(h){const m=Math.round(h*4)*15;let hh=Math.floor(m/60)%12;const mm=m%60;if(hh===0)hh=12;return hh+':'+String(mm).padStart(2,'0');}
const MAN=new THREE.Vector3(0,0,0);
const TEMPLE=clockPos(12,190);
const CAMP=clockPos(7.25,366);
const CENTER=clockPos(6,286);
// the Stone Stadium sits right next to the Man at 1:30, its long side facing him
const STADIUM={pos:clockPos(1.6,112),rot:0,S:null};STADIUM.rot=Math.atan2(-STADIUM.pos.x,-STADIUM.pos.z);
function stadLocal(x,z){const dx=x-STADIUM.pos.x,dz=z-STADIUM.pos.z,c=Math.cos(STADIUM.rot),s=Math.sin(STADIUM.rot);return{x:dx*c-dz*s,z:dx*s+dz*c};}
function stadWorld(lx,lz){const c=Math.cos(STADIUM.rot),s=Math.sin(STADIUM.rot);return{x:STADIUM.pos.x+lx*c+lz*s,z:STADIUM.pos.z-lx*s+lz*c};}
function stadFree(p,m){m=m||10;if(!inStadium(p,m))return p;const l=stadLocal(p.x,p.z);const ex=STAD_FOOT.hx+m-Math.abs(l.x),ez=STAD_FOOT.hz+m-Math.abs(l.z);if(ex<ez)l.x=Math.sign(l.x||1)*(STAD_FOOT.hx+m+2);else l.z=Math.sign(l.z||1)*(STAD_FOOT.hz+m+2);const w=stadWorld(l.x,l.z);p.x=w.x;p.z=w.z;return p;}
function inStadium(p,m){const l=stadLocal(p.x,p.z);m=m||0;return Math.abs(l.x)<STAD_FOOT.hx+m&&Math.abs(l.z)<STAD_FOOT.hz+m;}
function address(x,z){
  const r=Math.hypot(x,z),h=clockOf(x,z);
  if(r<32)return 'At the Man';
  if(inStadium({x,z},-2))return 'The Stone Stadium';
  if(d2({x,z},TEMPLE)<30)return 'At the Temple';
  for(const c of soundCamps)if(d2({x,z},c.pos)<28)return cap(c.name)+' · '+fmtClock(h);
  const inArc=h>=1.85&&h<=10.15;
  if(inArc&&r>=ESP-10&&r<=450){let best=STREETS[0],bd=1e9;for(const s of STREETS){const d=Math.abs(r-s[1]);if(d<bd){bd=d;best=s;}}return fmtClock(h)+' & '+best[0];}
  if(inArc&&r<ESP)return 'Inner playa · '+fmtClock(h);
  if(inArc)return 'Outer playa · '+fmtClock(h);
  return 'Deep playa · '+fmtClock(h);
}

// ================= renderer, post-processing =================
const canvas=$('#game');
const renderer=new THREE.WebGLRenderer({canvas,antialias:false,powerPreference:'high-performance'});
renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.5));
renderer.shadowMap.enabled=true;
renderer.shadowMap.type=THREE.PCFSoftShadowMap;
renderer.toneMapping=THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure=.9;
const scene=new THREE.Scene();
scene.fog=new THREE.Fog(0xc7d3d8,200,1600);
scene.background=new THREE.Color(0x0b0d1a);
const camera=new THREE.PerspectiveCamera(60,1,.3,9000);

const rt=new THREE.WebGLRenderTarget(1,1,{type:THREE.HalfFloatType,samples:4});
const composer=new EffectComposer(renderer,rt);
composer.addPass(new RenderPass(scene,camera));
// guard against NaN/Inf from lights very close to surfaces, which would smear black through the bloom
composer.addPass(new ShaderPass({uniforms:{tDiffuse:{value:null}},vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',fragmentShader:'uniform sampler2D tDiffuse;varying vec2 vUv;void main(){vec4 c=texture2D(tDiffuse,vUv);if(any(isnan(c.rgb))||any(isinf(c.rgb)))c.rgb=vec3(0.);gl_FragColor=vec4(clamp(c.rgb,0.,40.),1.);}'}));
const bloom=new UnrealBloomPass(new THREE.Vector2(1,1),.4,.55,1.1);
composer.addPass(bloom);
composer.addPass(new OutputPass());
const grade=new ShaderPass({
  uniforms:{tDiffuse:{value:null},uTime:{value:0},uVig:{value:1.0},uWarm:{value:.6},uSat:{value:1.16},uDream:{value:0},uContrast:{value:.18},uCA:{value:.012},uHurt:{value:0},uAlert:{value:0},uShadowTint:{value:new THREE.Color(.94,.98,1.06)},uHighTint:{value:new THREE.Color(1.05,1.0,.94)}},
  vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
  fragmentShader:GRADE_FRAG
});
composer.addPass(grade);
function resize(){const w=window.innerWidth,h=window.innerHeight;renderer.setSize(w,h,false);composer.setSize(w,h);bloom.setSize(w,h);camera.aspect=w/h;camera.updateProjectionMatrix();}
window.addEventListener('resize',resize);resize();

// ================= sky, light, environment =================
// art-directed gradient sky: deep desert blue overhead, hazy horizon, sun and moon discs
const SKY={uDusk:{value:0},uNight:{value:0},uDust:{value:0},uTime:{value:0},top:{value:new THREE.Color()},horizon:{value:new THREE.Color()},below:{value:new THREE.Color()},sunDir:{value:new THREE.Vector3(0,1,0)},sunCol:{value:new THREE.Color()},sunVis:{value:1},moonDir:{value:new THREE.Vector3(0,1,0)},moonVis:{value:0}};
const skyMat=new THREE.ShaderMaterial({uniforms:SKY,side:THREE.BackSide,depthWrite:false,fog:false,
  vertexShader:'varying vec3 vDir;void main(){vDir=normalize(position);vec4 p=projectionMatrix*modelViewMatrix*vec4(position,1.);gl_Position=p.xyww;}',
  fragmentShader:SKY_FRAG});
const sky=new THREE.Mesh(new THREE.SphereGeometry(4500,32,16),skyMat);sky.renderOrder=-1;sky.frustumCulled=false;scene.add(sky);
const envScene=new THREE.Scene();const envSky=new THREE.Mesh(sky.geometry,skyMat);envScene.add(envSky);
const pmrem=new THREE.PMREMGenerator(renderer);let envRT=null,envTimer=0;
function refreshEnv(){const n=pmrem.fromScene(envScene,0,1,6000);if(envRT)envRT.dispose();envRT=n;scene.environment=envRT.texture;}
const dustDome=new THREE.Mesh(new THREE.SphereGeometry(4300,24,12),new THREE.MeshBasicMaterial({color:0xc9b088,side:THREE.BackSide,transparent:true,opacity:0,fog:false,depthWrite:false}));
dustDome.renderOrder=1;scene.add(dustDome);

const hemi=new THREE.HemisphereLight(0xdfefff,0xb59a74,.5);scene.add(hemi);
const sun=new THREE.DirectionalLight(0xfff1d6,3);
sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);
Object.assign(sun.shadow.camera,{left:-75,right:75,top:75,bottom:-75,near:1,far:800});
sun.shadow.bias=-.0004;sun.shadow.normalBias=.04;
scene.add(sun);scene.add(sun.target);
const headlight=new THREE.PointLight(0xffe2b8,0,45,2);scene.add(headlight);

// ================= materials =================
const matCache={};
function mat(color,extra){const k=color+'|'+(extra?JSON.stringify(extra):'');if(!matCache[k])matCache[k]=new THREE.MeshStandardMaterial(Object.assign({color,roughness:.85,metalness:0},extra||{}));return matCache[k];}
const neonMats=[];const neonCache={};
function neon(color,k){k=k||1;const key=color+'|'+k;if(!neonCache[key]){const c=new THREE.Color(color);const m=new THREE.MeshStandardMaterial({color:c.clone().multiplyScalar(.25),emissive:c,emissiveIntensity:1,roughness:.35});m.userData.k=k;neonMats.push(m);neonCache[key]=m;}return neonCache[key];}
const NEONS=[0xff4fa8,0x46f1ff,0xb4ff39,0xffd23f,0x9b6bff,0xff6b35,0x2ee59d];
const COSTUME=[0xff4fa8,0x46f1ff,0xffd23f,0x8a5cff,0xff6b35,0x2ee59d,0xf2efe8,0x2a2a30,0xd7263d,0xc0c4c8,0x9b5de5,0xf4a261,0x6b4f3a];
const FABRIC=[0xc8463a,0xe0a03a,0x3a74b0,0x6c4a9e,0x2f8e70,0xe9e1cf,0xb83a72,0x48525e,0xd8c9a8];
const WOOD=0xa97c4a;
const domeMat=new THREE.MeshStandardMaterial({color:0xece6da,roughness:.7,flatShading:true});
const strutMat=new THREE.LineBasicMaterial({color:0x6d6458});
const mirrorMat=new THREE.MeshStandardMaterial({color:0xffffff,roughness:.04,metalness:1,flatShading:true});
const chromeMat=new THREE.MeshStandardMaterial({color:0xdddddd,roughness:.15,metalness:1});
const aluMat=new THREE.MeshStandardMaterial({color:0xc9ccd0,roughness:.35,metalness:.85,side:THREE.DoubleSide});
const glowMap=(()=>{const c=document.createElement('canvas');c.width=c.height=64;const g=c.getContext('2d');const gr=g.createRadialGradient(32,32,0,32,32,32);gr.addColorStop(0,'rgba(255,255,255,1)');gr.addColorStop(.25,'rgba(255,255,255,.75)');gr.addColorStop(1,'rgba(255,255,255,0)');g.fillStyle=gr;g.fillRect(0,0,64,64);return new THREE.CanvasTexture(c);})();

// ================= geometry =================
const G={
  box:new THREE.BoxGeometry(1,1,1),
  cyl:new THREE.CylinderGeometry(1,1,1,12),
  hex:new THREE.CylinderGeometry(1,1,1,6),
  cone6:new THREE.ConeGeometry(1,1,6),
  cone4:new THREE.ConeGeometry(1,1,4),
  sph:new THREE.SphereGeometry(1,20,14),
  geo:new THREE.IcosahedronGeometry(1,2),
};
G.hemi=(()=>{const g=new THREE.IcosahedronGeometry(1,2);const p=g.attributes.position;for(let i=0;i<p.count;i++)if(p.getY(i)<0)p.setY(i,0);g.computeVertexNormals();return g;})();
G.hemiEdges=new THREE.EdgesGeometry(G.hemi,1);
function M(geo,m,sx,sy,sz,x,y,z){const o=new THREE.Mesh(geo,m);o.scale.set(sx,sy,sz);o.position.set(x||0,y||0,z||0);return o;}

// ================= collision =================
const obstacles=[];
function collide(p,r,ignoreRamps){
  let hit=false;const list=ogReady?obstaclesNear(p.x,p.z):obstacles;
  for(let i=0;i<list.length;i++){const o=list[i];if(ignoreRamps&&o.ramp)continue;const dx=p.x-o.x,dz=p.z-o.z,rr=o.r+r;if(Math.abs(dx)>rr||Math.abs(dz)>rr)continue;const dd=dx*dx+dz*dz;if(dd<rr*rr){const d=Math.sqrt(dd)||.001;p.x=o.x+dx/d*rr;p.z=o.z+dz/d*rr;hit=true;}}
  for(let i=0;i<dynObs.length;i++){const o=dynObs[i];const dx=p.x-o.x,dz=p.z-o.z,rr=o.r+r;if(Math.abs(dx)>rr||Math.abs(dz)>rr)continue;const dd=dx*dx+dz*dz;if(dd<rr*rr){const d=Math.sqrt(dd)||.001;p.x=o.x+dx/d*rr;p.z=o.z+dz/d*rr;hit=true;}}
  for(let i=0;i<5;i++){const m=(i*72+36)/360*TAU;const nx=Math.sin(m),nz=-Math.cos(m);const d=p.x*nx+p.z*nz;const lim=FENCE_IN-4-r;if(d>lim){p.x-=nx*(d-lim);p.z-=nz*(d-lim);hit='fence';}}
  return hit;
}

// static objects are merged into one mesh per material to keep draw calls low
const staticRoot=new THREE.Group();
function place(b,x,z,rot,parent){
  rot=rot||0;b.g.position.set(x,0,z);b.g.rotation.y=rot;(parent||staticRoot).add(b.g);
  const c=Math.cos(rot),s=Math.sin(rot);
  for(const o of (b.obs||[]))obstacles.push({x:x+o[0]*c+o[1]*s,z:z-o[0]*s+o[1]*c,r:o[2]});
  return b.g;
}
function floatAttr(a){const n=a.count,s=a.itemSize,out=new Float32Array(n*s);for(let i=0;i<n;i++){out[i*s]=a.getX(i);if(s>1)out[i*s+1]=a.getY(i);if(s>2)out[i*s+2]=a.getZ(i);}return new THREE.BufferAttribute(out,s);}
function bakeStatic(root){
  root.updateMatrixWorld(true);
  const buckets=new Map();const keep=[];
  root.traverse(o=>{
    if(o.isInstancedMesh||o.isPoints||o.isSprite||o.isSkinnedMesh||(o.isMesh&&Array.isArray(o.material))){keep.push(o);return;}
    if(!(o.isMesh||o.isLineSegments))return;
    {let q=o.parent;while(q&&q!==root){if(keep.includes(q))return;q=q.parent;}}
    const src=o.geometry.index?o.geometry.toNonIndexed():o.geometry;
    const g=new THREE.BufferGeometry();
    g.setAttribute('position',floatAttr(src.attributes.position));
    if(!o.isLineSegments){if(src.attributes.normal)g.setAttribute('normal',floatAttr(src.attributes.normal));else{g.computeVertexNormals();}}
    const useUv=!!(o.material.map||o.material.normalMap||o.material.roughnessMap||o.material.emissiveMap||o.material.alphaMap);
    if(useUv&&src.attributes.uv)g.setAttribute('uv',floatAttr(src.attributes.uv));
    g.applyMatrix4(o.matrixWorld);
    const key=o.material.uuid+(o.isLineSegments?'L':'M');
    if(!buckets.has(key))buckets.set(key,{mat:o.material,line:o.isLineSegments,pos:[],nor:[],uv:[],useUv});
    const b=buckets.get(key);b.pos.push(g.attributes.position.array);
    if(!b.line)b.nor.push(g.attributes.normal.array);
    if(b.useUv)b.uv.push(g.attributes.uv?g.attributes.uv.array:new Float32Array(g.attributes.position.count*2));
  });
  const cat=arrs=>{let n=0;for(const a of arrs)n+=a.length;const out=new Float32Array(n);let off=0;for(const a of arrs){out.set(a,off);off+=a.length;}return out;};
  for(const b of buckets.values()){
    const geo=new THREE.BufferGeometry();
    geo.setAttribute('position',new THREE.BufferAttribute(cat(b.pos),3));
    if(b.line){scene.add(new THREE.LineSegments(geo,b.mat));continue;}
    geo.setAttribute('normal',new THREE.BufferAttribute(cat(b.nor),3));
    if(b.useUv)geo.setAttribute('uv',new THREE.BufferAttribute(cat(b.uv),2));
    const m=new THREE.Mesh(geo,b.mat);m.castShadow=true;m.receiveShadow=true;m.frustumCulled=false;scene.add(m);
  }
  for(const o of keep)scene.attach(o);
}
function shadowAll(g){g.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;}});return g;}

// ================= asset loading =================
const loader=new GLTFLoader();
// models ship as base64 inside .json so the artifact host can serve them
async function loadGLB(name){const r=await fetch(`assets/${name}.json`);if(!r.ok)throw new Error('Missing model '+name);const j=await r.json();const bin=Uint8Array.from(atob(j.glb),c=>c.charCodeAt(0));return loader.parseAsync(bin.buffer,'');}
const TEMPL={},CARS={},CLIPS={};
const CHAR_FILES={rogue:'anims_full',barbarian:'barbarian',knight:'knight',mage:'mage',hooded:'rogue_hooded'};
const CAR_LEN={truck:5.4,van:5.2,delivery:7.4,suv:4.9,sedan:4.7};
async function loadAssets(onProgress){
  let done=0;const total=Object.keys(CHAR_FILES).length+Object.keys(CAR_LEN).length;
  const tick=()=>onProgress(++done/total);
  await Promise.all([
    ...Object.entries(CHAR_FILES).map(async([k,f])=>{
      const g=await loadGLB(f);const s=g.scene;
      s.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;if(o.material.map)o.material.map.anisotropy=4;o.material.roughness=.75;}});
      s.updateMatrixWorld(true);const box=new THREE.Box3().setFromObject(s);
      TEMPL[k]={scene:s,scale:1.8/(box.max.y-box.min.y)};
      for(const a of g.animations)CLIPS[a.name]=a;
      tick();
    }),
    ...Object.keys(CAR_LEN).map(async f=>{
      const g=await loadGLB('car_'+f);const s=g.scene;
      s.traverse(o=>{if(o.isMesh){o.material.roughness=.55;o.material.metalness=.1;}});
      s.updateMatrixWorld(true);const box=new THREE.Box3().setFromObject(s);const size=box.getSize(new THREE.Vector3());
      const alongX=size.x>size.z;const len=alongX?size.x:size.z;
      CARS[f]={scene:s,scale:CAR_LEN[f]/len,alongX,minY:box.min.y,width:(alongX?size.z:size.x)*CAR_LEN[f]/len};
      tick();
    }),
  ]);
}
function carModel(f){const c=CARS[f];const g=new THREE.Group();const s=c.scene.clone(true);s.scale.setScalar(c.scale);s.position.y=-c.minY*c.scale;if(c.alongX)s.rotation.y=Math.PI/2;g.add(s);shadowAll(g);return g;}

// ================= Picasso masks =================
const MASK_N=8;
function drawCubistMask(g,ox,oy,S,seed){
  const r=mulberry32(seed*7919+13);const RR=(a,b)=>a+(b-a)*r();const pk=a=>a[Math.floor(r()*a.length)];
  const PAL=['#f2c14e','#e4572e','#29335c','#f3a712','#8fbf6a','#4f86c6','#f4efe6','#d7263d','#2e294e','#ffb5c2','#2ec4b6','#ff9f1c'];
  const X=v=>ox+v*S,Y=v=>oy+v*S;g.save();g.lineJoin='round';g.lineCap='round';
  // face outline: a lopsided oval
  g.beginPath();const pts=[];for(let i=0;i<14;i++){const a=i/14*Math.PI*2;const rx=.4+RR(-.04,.05),ry=.46+RR(-.04,.04);pts.push([.5+Math.cos(a)*rx*(Math.cos(a)>0?RR(.9,1.1):1),.5+Math.sin(a)*ry]);}
  pts.forEach((p,i)=>i?g.lineTo(X(p[0]),Y(p[1])):g.moveTo(X(p[0]),Y(p[1])));g.closePath();g.save();g.clip();
  const c1=pk(PAL),c2=pk(PAL),c3=pk(PAL);g.fillStyle=c1;g.fillRect(X(0),Y(0),S,S);
  const sx=RR(.38,.6);g.fillStyle=c2;g.beginPath();g.moveTo(X(sx+RR(-.15,.15)),Y(0));g.lineTo(X(1),Y(0));g.lineTo(X(1),Y(1));g.lineTo(X(sx+RR(-.15,.15)),Y(1));g.fill();
  g.fillStyle=c3;g.globalAlpha=.85;g.beginPath();g.moveTo(X(RR(0,.3)),Y(RR(.55,.75)));g.lineTo(X(RR(.4,.7)),Y(RR(.6,.8)));g.lineTo(X(RR(.2,.5)),Y(1));g.lineTo(X(0),Y(1));g.fill();g.globalAlpha=1;
  g.restore();g.strokeStyle='#111';g.lineWidth=S*.045;g.stroke();
  // eyes: one frontal almond, one profile shape, at different heights
  const eye=(cx,cy,w,h,kind)=>{g.beginPath();if(kind===0){g.moveTo(X(cx-w),Y(cy));g.quadraticCurveTo(X(cx),Y(cy-h*1.6),X(cx+w),Y(cy));g.quadraticCurveTo(X(cx),Y(cy+h*1.6),X(cx-w),Y(cy));}else if(kind===1){g.ellipse(X(cx),Y(cy),w*S,h*S,RR(-.5,.5),0,Math.PI*2);}else{g.moveTo(X(cx-w),Y(cy+h));g.lineTo(X(cx+w),Y(cy));g.lineTo(X(cx-w*.6),Y(cy-h));g.closePath();}
    g.fillStyle='#ffffff';g.fill();g.lineWidth=S*.03;g.stroke();g.beginPath();g.arc(X(cx+RR(-w*.3,w*.3)),Y(cy),S*h*.6,0,Math.PI*2);g.fillStyle=pk(['#111','#1d3557','#3a0ca3']);g.fill();};
  eye(RR(.28,.36),RR(.36,.44),RR(.08,.11),RR(.045,.06),0);eye(RR(.62,.72),RR(.3,.5),RR(.07,.1),RR(.05,.08),Math.floor(r()*3));
  // long profile nose
  g.beginPath();const nx=RR(.45,.55);g.moveTo(X(nx),Y(.3));g.lineTo(X(nx+RR(.08,.16)),Y(.62));g.lineTo(X(nx-RR(0,.05)),Y(.66));g.fillStyle=pk(PAL);g.fill();g.lineWidth=S*.03;g.stroke();
  // mouth and brows
  g.beginPath();const my=RR(.74,.8),mx=RR(.42,.56);g.moveTo(X(mx-.12),Y(my));g.quadraticCurveTo(X(mx),Y(my+RR(-.06,.06)),X(mx+.12),Y(my-RR(0,.04)));g.lineWidth=S*.035;g.stroke();
  g.beginPath();g.moveTo(X(.2),Y(RR(.26,.3)));g.lineTo(X(.42),Y(RR(.22,.3)));g.moveTo(X(.58),Y(RR(.2,.32)));g.lineTo(X(.82),Y(RR(.24,.34)));g.lineWidth=S*.03;g.stroke();
  g.restore();
}
const maskAtlas=(()=>{const c=document.createElement('canvas');c.width=1024;c.height=512;const g=c.getContext('2d');for(let i=0;i<MASK_N;i++)drawCubistMask(g,(i%4)*256,Math.floor(i/4)*256,256,i+1);const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=4;return t;})();
const maskMats=[];
function maskMaterial(i){if(!maskMats[i]){const c=document.createElement('canvas');c.width=c.height=256;drawCubistMask(c.getContext('2d'),0,0,256,i+1);const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;maskMats[i]=new THREE.MeshStandardMaterial({map:t,alphaTest:.5,side:THREE.DoubleSide,roughness:.55});}return maskMats[i];}
const headBoxes={};
function attachMask(g,m,kind,idx){
  const head=m.getObjectByName('head');if(!head)return;
  let hb=headBoxes[kind];
  if(!hb){let hm=null;m.traverse(x=>{if(x.isMesh&&/Head/.test(x.name)&&!hm)hm=x;});if(!hm)return;hb=headBoxes[kind]=new THREE.Box3().setFromObject(hm);}
  const w=(hb.max.x-hb.min.x)*.82,h=w*1.12;
  const geo=new THREE.PlaneGeometry(w,h,6,6);const pa=geo.attributes.position;for(let i=0;i<pa.count;i++){const x=pa.getX(i)/w;pa.setZ(i,-x*x*w*.55);}geo.computeVertexNormals();
  const mk=new THREE.Mesh(geo,maskMaterial(idx));mk.position.set(0,(hb.min.y+hb.max.y)/2+h*.04,hb.max.z+.015);mk.castShadow=true;g.add(mk);head.attach(mk);
}

// ================= characters =================
const tintCache={};
function tintMat(base,color){const k=base.uuid+color;if(!tintCache[k]){const m=base.clone();m.color.set(color);tintCache[k]=m;}return tintCache[k];}
const TINTS=[0xff8cc6,0x8cf3ff,0xffe68c,0xc3a8ff,0xffab7a,0x9effcf,0xffffff,0xa9b0ff,0xff8080,0xd8d8d8,0xfff2c0];
const SKIN_TONES=[0xffffff,0xf0d0b8,0xd9a982,0xb07a52,0x8a5a3a,0x6a432b];
const KINDS=['rogue','barbarian','knight','mage','hooded'];
const NAMES=['Sparkle Pony','Dusty','Captain Glitter','Moonbeam','Professor Flapjack','Lady Wombat','Tumbleweed','Kaleido','Biscuit','Zephyr','Mothra','Pickles','Sunshine','Disco Stu','Feather','Gravity','Noodle','Wildflower','Sir Reginald','Turbo','Juniper','Velvet','Cosmo','Snack Pack'];
function makeCharacter(o){
  o=o||{};
  const kind=o.kind||pick(KINDS);const t=TEMPL[kind];
  const g=new THREE.Group();const m=cloneSkinned(t.scene);m.scale.setScalar(t.scale);g.add(m);
  const body=o.body!=null?o.body:pick(TINTS),cape=o.cape!=null?o.cape:pick(TINTS),hat=o.hat!=null?o.hat:pick(TINTS),skin=o.skin!=null?o.skin:pick(SKIN_TONES);
  m.traverse(x=>{
    if(!x.isMesh)return;x.frustumCulled=false;
    const n=x.name;
    if(/Body|Leg/.test(n))x.material=tintMat(x.material,body);
    else if(/Cape/.test(n))x.material=tintMat(x.material,cape);
    else if(/Hat|Helmet/.test(n))x.material=tintMat(x.material,hat);
    else if(/Head|Arm/.test(n)&&skin!==0xffffff)x.material=tintMat(x.material,skin);
  });
  g.updateMatrixWorld(true);
  const hips=m.getObjectByName('hips'),chest=m.getObjectByName('chest');
  if(o.mask!==false&&(o.mask!=null||rnd()<.38))attachMask(g,m,kind,o.mask!=null?o.mask:Math.floor(rnd()*MASK_N));
  if(o.neon!==false&&hips){
    const hp=new THREE.Vector3();hips.getWorldPosition(hp);
    const belt=new THREE.Mesh(new THREE.TorusGeometry(.36,.025,6,24),neon(o.neon||pick(NEONS)));
    belt.rotation.x=Math.PI/2;belt.position.set(0,hp.y+.02,0);g.add(belt);hips.attach(belt);
  }
  const wings=o.wings&&chest?attachWings(g,chest):null;
  const mixer=new THREE.AnimationMixer(m);
  const c={g,model:m,mixer,actions:{},cur:null,lock:0,acc:0,kind,wings};
  return c;
}
function attachWings(g,chest){
  const cp=new THREE.Vector3();chest.getWorldPosition(cp);
  const wings=new THREE.Group();wings.position.set(0,cp.y+.28,-.36);wings.rotation.x=-.2;
  const shape=new THREE.Shape();shape.moveTo(0,0);shape.quadraticCurveTo(.12,.35,0,1);shape.quadraticCurveTo(-.12,.35,0,0);
  const fg=new THREE.ShapeGeometry(shape,8);
  const cols=[0xffd23f,0xffa02e,0xff6b35,0xff3b2e,0xd7263d];
  for(const s of[-1,1])for(let i=0;i<5;i++){
    const f=new THREE.Mesh(fg,neon(cols[i],.8));f.material.side=THREE.DoubleSide;
    const len=.95-i*.1;f.scale.set(1.2,len,1);f.position.set(s*.12,0,0);
    f.rotation.z=-s*(.35+i*.3);f.rotation.y=s*.45;wings.add(f);
  }
  g.add(wings);chest.attach(wings);return wings;
}
function play(c,name,fade,ts){
  fade=fade==null?.22:fade;ts=ts||1;
  if(c.cur===name){c.actions[name].setEffectiveTimeScale(ts);return;}
  let a=c.actions[name];
  if(!a){const clip=CLIPS[name];if(!clip)return;a=c.mixer.clipAction(clip);c.actions[name]=a;a.time=rnd()*clip.duration;}
  if(name==='Jump_Full_Short'||name==='Interact'||name==='PickUp'){a.setLoop(THREE.LoopOnce,1);a.clampWhenFinished=true;a.reset();}
  a.enabled=true;a.setEffectiveTimeScale(ts);a.setEffectiveWeight(1);a.fadeIn(fade).play();
  if(c.cur&&c.actions[c.cur])c.actions[c.cur].fadeOut(fade);
  c.cur=name;
}
const ANIM={idle:'Idle',dance:'Cheer',ride:'Sit_Chair_Idle',sit:'Sit_Floor_Idle',lie:'Lie_Idle'};
function animPerson(c,mode,dt,speed){
  if(c.lock>0){c.lock-=dt;c.mixer.update(dt);return;}
  if(mode==='walk'){if(speed>.3){if(speed>3)play(c,'Running_A',.2,clamp(speed/6.5,.8,1.75));else play(c,'Walking_A',.2,clamp(speed/1.6,.6,1.6));}else play(c,'Idle');}
  else play(c,ANIM[mode]||'Idle');
  c.mixer.update(dt);
}
function oneShot(c,name,dur){play(c,name,.12);c.lock=dur;}
// split clips into lower body (legs, hips) and upper body (spine up) so Phoenix can run and aim at once
const UPPER_RE=/^(spine|chest|head|upperarm|lowerarm|wrist|hand|handslot)/;
function partClip(name,upper){
  const key=name+(upper?'__up':'__low');if(CLIPS[key])return key;const c=CLIPS[name];if(!c)return null;
  const tr=c.tracks.filter(t=>UPPER_RE.test(t.name.split('.')[0])===upper);
  CLIPS[key]=new THREE.AnimationClip(key,c.duration,tr);return key;
}
function playUpper(c,name,fade){
  const key=partClip(name,true);if(!key)return;c.up=c.up||{actions:{},cur:null};const U=c.up;fade=fade==null?.15:fade;
  if(U.cur===key)return;let a=U.actions[key];if(!a){a=c.mixer.clipAction(CLIPS[key]);U.actions[key]=a;}
  a.reset();a.enabled=true;a.setEffectiveWeight(1);a.fadeIn(fade).play();if(U.cur&&U.actions[U.cur])U.actions[U.cur].fadeOut(fade);U.cur=key;
}
function stopUpper(c){const U=c.up;if(!U||!U.cur)return;U.actions[U.cur].fadeOut(.2);U.cur=null;if(c.cur&&c.cur.endsWith('__low')){const full=c.cur.replace('__low','');c.cur=null;play(c,full,.2);}}
const _am=new THREE.Vector3();
function animArmed(dt,spd){
  const c=player;const rifle=W.def&&W.def.hold==='rifle';
  let legs='Idle';
  if(spd>.3){const fwdX=Math.sin(P.heading),fwdZ=Math.cos(P.heading);const f=(P.vel.x*fwdX+P.vel.z*fwdZ)/spd,sd=(P.vel.x*fwdZ-P.vel.z*fwdX)/spd;
    if(f>.5)legs=spd>7?'Running_A':'Walking_A';else if(f<-.5)legs='Walking_Backwards';else legs=sd>0?'Running_Strafe_Left':'Running_Strafe_Right';}
  if(!P.onGround)legs='Jump_Idle';
  const lk=partClip(legs,false);if(lk)play(c,lk,.18,legs==='Walking_Backwards'?clamp(spd/2,.7,1.6):clamp(spd/6.5,.8,1.6));
  const firing=mouse.l&&!W.over;
  playUpper(c,firing?(rifle?'2H_Ranged_Shooting':'1H_Ranged_Shooting'):(rifle?'2H_Ranged_Aiming':'1H_Ranged_Aiming'));
  c.mixer.update(dt);
  // bend the spine toward where the camera aims
  const ch=c.model.getObjectByName('chest');if(ch){ch.rotation.x+=clamp((camPitch-.25)*.9,-.6,.7);}
}

// ================= structures =================
function hexayurt(){const g=new THREE.Group();const r=R(2.4,3.4);g.add(M(G.hex,mat(0xe4e7ea,{roughness:.45,metalness:.3}),r,2.4,r,0,1.2,0),M(G.cone6,mat(0xd3d8dc,{roughness:.5,metalness:.3}),r,1.3,r,0,3.05,0));return{g,obs:[[0,0,r]]};}
function tent(){const g=new THREE.Group();const c=pick(FABRIC);const t=M(G.cone4,mat(c,{roughness:.9}),2,2.2,2.6,0,1.1,0);t.rotation.y=Math.PI/4;g.add(t);return{g,obs:[[0,0,1.9]]};}
function dome(r){const g=new THREE.Group();r=r||R(3.5,6);g.add(M(G.hemi,domeMat,r,r,r));const e=new THREE.LineSegments(G.hemiEdges,strutMat);e.scale.set(r*1.005,r*1.005,r*1.005);g.add(e);return{g,obs:[[0,0,r*.92]]};}
function shade(w,d){const g=new THREE.Group();w=w||R(6,10);d=d||R(5,8);const pm=mat(0x8c9095,{metalness:.8,roughness:.4});for(const sx of[-1,1])for(const sz of[-1,1])g.add(M(G.cyl,pm,.07,2.7,.07,sx*w/2,1.35,sz*d/2));const top=M(new THREE.PlaneGeometry(1,1,6,6),aluMat,w+.6,d+.6,1,0,2.7,0);top.rotation.x=-Math.PI/2;const p=top.geometry.attributes.position;for(let i=0;i<p.count;i++){const x=p.getX(i),y=p.getY(i);p.setZ(i,-(1-4*x*x)*(1-4*y*y)*.06);}top.geometry.computeVertexNormals();g.add(top);return{g,obs:[[w/2,d/2,.3],[-w/2,d/2,.3],[w/2,-d/2,.3],[-w/2,-d/2,.3]]};}
function parkedCar(){const f=pick(['delivery','delivery','van','suv','sedan','truck']);const g=carModel(f);return{g,obs:[[0,-CAR_LEN[f]*.28,1.4],[0,CAR_LEN[f]*.28,1.4]]};}
function flag(){const g=new THREE.Group();const h=R(5,8);g.add(M(G.cyl,mat(0x77787a,{metalness:.7,roughness:.4}),.05,h,.05,0,h/2,0));const fl=M(new THREE.PlaneGeometry(1.4,.9,4,1),mat(pick(COSTUME),{side:THREE.DoubleSide}),1,1,1,.72,h-.55,0);g.add(fl,M(G.sph,neon(pick(NEONS)),.16,.16,.16,0,h+.1,0));return{g,obs:[]};}
function maskPost(){const g=new THREE.Group();const h=R(3,4.6);g.add(M(G.cyl,mat(0x5b4632),.07,h,.07,0,h/2,0));const n=rnd()<.4?2:1;for(let k=0;k<n;k++){const sz=R(1.1,1.6);const mk=new THREE.Mesh(new THREE.PlaneGeometry(sz,sz*1.1),maskMaterial(Math.floor(rnd()*MASK_N)));mk.position.set(0,h-k*1.5+.1,.09);mk.rotation.z=R(-.15,.15);g.add(mk);const back=mk.clone();back.rotation.y=Math.PI;back.position.z=-.09;g.add(back);}return{g,obs:[[0,0,.25]]};}
function potty(){const g=new THREE.Group();g.add(M(G.box,mat(0x2c6fd1,{roughness:.5}),1.3,2.3,1.3,0,1.15,0),M(G.box,mat(0xf2f2f2,{roughness:.5}),1.4,.12,1.4,0,2.36,0));return{g,obs:[[0,0,.9]]};}
function lampPost(dyn){const g=new THREE.Group();const w=mat(0x5b4632);g.add(M(G.cyl,w,.07,3.4,.07,0,1.7,0),M(G.box,w,.9,.07,.07,.4,3.35,0));if(!dyn)g.add(M(G.box,neon(0xffb35a),.22,.32,.22,.8,3.05,0));return{g,obs:[[0,0,.3]]};}

const bulbPos=[],bulbCol=[];
function strand(a,b,n,palette){const sag=R(.4,1);for(let i=0;i<=n;i++){const t=i/n;const c=new THREE.Color(pick(palette));bulbPos.push(lerp(a.x,b.x,t),lerp(a.y,b.y,t)-Math.sin(t*Math.PI)*sag,lerp(a.z,b.z,t));bulbCol.push(c.r,c.g,c.b);}}
const WARM=[0xffc46b,0xffb347,0xffe1a8];const RAINBOW=[0xff4fa8,0x46f1ff,0xb4ff39,0xffd23f,0x9b6bff,0xff6b35];
const camSitters=[];

function fillBlock(h0,h1,r0,r1){
  const rm=(r0+r1)/2;
  const arcLen=(h1-h0)/12*TAU*rm;const n=Math.max(2,Math.floor(arcLen/18));
  const slots=[];
  for(let i=0;i<n;i++){const h=lerp(h0,h1,(i+.5)/n)+R(-.03,.03);for(const rr of [r0+6,r1-6]){if(rnd()<.85)slots.push([h,rr+R(-1.5,1.5)]);}}
  const pts=[];
  for(const [h,r] of slots){
    const p=clockPos(h,r);const face=-h/12*TAU+R(-.2,.2);
    const t=rnd();let b;
    if(t<.2)b=hexayurt();else if(t<.34)b=tent();else if(t<.52)b=dome(R(3,5.5));else if(t<.7){b=shade(R(5,7),R(4,6));if(rnd()<.5)camSitters.push(p.clone());}else b=parkedCar();
    place(b,p.x,p.z,face+(b.g.children[0]&&b.g.children[0].type==='Group'&&t>=.7?Math.PI/2:0));pts.push(p);
    if(rnd()<.35){const f=clockPos(h+R(-.05,.05),r+R(-4,4));place(flag(),f.x,f.z,R(0,TAU));}
    if(PR&&PR.buildCampDecor&&rnd()<.42){const kd=pick(['couch','rug','banner','lightpole','bikepile','sign','lounge','couch','rug','lightpole']);const off=r<rm?5.5:-5.5;const f=clockPos(h+R(-.03,.03),r+off);const d=PR.buildCampDecor(kd,Math.floor(rnd()*1e6));place({g:d.g,obs:d.obs||[]},f.x,f.z,-h/12*TAU+(r<rm?Math.PI:0)+R(-.4,.4));}
    if(rnd()<.3){const f=clockPos(h+R(-.04,.04),r+(r<rm?-4.5:4.5));place(maskPost(),f.x,f.z,-h/12*TAU+(r<rm?Math.PI:0));}
  }
  const pal=rnd()<.5?WARM:RAINBOW;
  for(let i=0;i+1<pts.length;i+=2){const a=pts[i].clone(),b=pts[i+1].clone();a.y=3.4;b.y=3.4;strand(a,b,14,pal);}
  if(rnd()<.6){const a=clockPos(h0+.02,rm),b=clockPos(h1-.02,rm);a.y=3.2;b.y=3.2;strand(a,b,24,pal);}
}
function pottyBank(h,r){for(let i=0;i<9;i++){const p=clockPos(h,r+i*1.5-6);place(potty(),p.x,p.z,-h/12*TAU+Math.PI/2);}}

// deep playa art
function artRing(){const g=new THREE.Group();const t=new THREE.Mesh(new THREE.TorusGeometry(7,.5,12,64),neon(pick(NEONS)));t.position.y=7.6;g.add(t);const t2=new THREE.Mesh(new THREE.TorusGeometry(5.6,.22,8,64),neon(pick(NEONS)));t2.position.y=7.6;g.add(t2);g.add(M(G.box,mat(0x3a332c),2.4,.6,2.4,0,.3,0));return{g,obs:[[0,0,1.2]]};}
function artTotem(){const g=new THREE.Group();let y=0;const n=4+Math.floor(rnd()*4);for(let i=0;i<n;i++){const h=R(1.5,3),w=R(1.4,2.6);g.add(M(rnd()<.5?G.box:G.hex,mat(pick(COSTUME),{roughness:.5}),w,h,w,0,y+h/2,0));y+=h;}g.add(M(G.sph,neon(pick(NEONS),.6),1.1,1.1,1.1,0,y+1,0));return{g,obs:[[0,0,1.8]]};}
function artMirror(){const g=new THREE.Group();const m=M(G.box,mirrorMat,6,6,6,0,4.6,0);m.rotation.set(.62,.78,0);g.add(m);return{g,obs:[[0,0,4.6]]};}
function artLotus(){const g=new THREE.Group();const c=pick([0xff4fa8,0x9b6bff,0x46f1ff]);for(let i=0;i<10;i++){const a=i/10*TAU;const p=M(G.cone4,neon(c,.3),1.5,7,.5,Math.cos(a)*1.8,3.5,Math.sin(a)*1.8);p.rotation.order='YZX';p.rotation.y=-a;p.rotation.z=.45;g.add(p);}g.add(M(G.sph,chromeMat,1.3,1.3,1.3,0,1.4,0));return{g,obs:[[0,0,3]]};}
function artSpire(){const g=new THREE.Group();const h=R(18,30);g.add(M(G.cone6,mat(0x6e4b2e),2.2,h,2.2,0,h/2,0));for(let y=3;y<h-3;y+=3.2){const t=new THREE.Mesh(new THREE.TorusGeometry(2.2*(1-y/h)+.15,.1,6,24),neon(pick(NEONS)));t.rotation.x=Math.PI/2;t.position.y=y;g.add(t);}return{g,obs:[[0,0,2]]};}
function artArch(){const g=new THREE.Group();const m=mat(0xa82f25,{roughness:.6});g.add(M(G.box,m,1.2,10,1.2,-5,5,0),M(G.box,m,1.2,10,1.2,5,5,0),M(G.box,m,15,1.1,1.8,0,10.3,0),M(G.box,m,12,.7,1,0,8.3,0),M(G.box,neon(0xffb35a),13,.12,.12,0,7.85,0));return{g,obs:[[-5,0,1],[5,0,1]]};}
function artCubes(){const g=new THREE.Group();for(let i=0;i<14;i++){const s=R(1,2.6);const b=M(G.box,rnd()<.3?neon(pick(NEONS),.45):rnd()<.3?chromeMat:mat(pick(COSTUME),{roughness:.4}),s,s,s,R(-3,3),R(0,6)+s/2,R(-3,3));b.rotation.set(R(0,1),R(0,TAU),R(0,1));g.add(b);}return{g,obs:[[0,0,4]]};}
function artGym(){const g=new THREE.Group();const e=new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.IcosahedronGeometry(7,1)),new THREE.LineBasicMaterial({color:new THREE.Color(pick([0xff4fa8,0x46f1ff,0xb4ff39])).multiplyScalar(2.2)}));e.position.y=2.5;g.add(e);return{g,obs:[]};}
const ARTS=[artRing,artTotem,artMirror,artLotus,artSpire,artArch,artCubes,artGym];

// ================= ground: cracked playa =================
function drawLayout(ctx,S,mode){
  const k=S/1600,cx=S/2,cy=S/2;const P=v=>[cx+v.x*k,cy+v.z*k];
  if(mode==='ground'){
    ctx.fillStyle='#cdb895';ctx.fillRect(0,0,S,S);
    for(let i=0;i<900;i++){const x=rnd()*S,y=rnd()*S,r=R(20,120);const gr=ctx.createRadialGradient(x,y,0,x,y,r);const l=rnd()<.5;gr.addColorStop(0,l?'rgba(240,232,214,.10)':'rgba(140,118,88,.08)');gr.addColorStop(1,'rgba(0,0,0,0)');ctx.fillStyle=gr;ctx.fillRect(x-r,y-r,r*2,r*2);}
    for(let i=0;i<60000;i++){ctx.fillStyle=rnd()<.5?'rgba(255,248,230,.07)':'rgba(90,70,40,.05)';ctx.fillRect(rnd()*S,rnd()*S,1+rnd()*2,1+rnd()*2);}
  }else{ctx.fillStyle='#2a211a';ctx.fillRect(0,0,S,S);}
  ctx.beginPath();for(let i=0;i<=5;i++){const q=P(clockPos(i*2.4,FENCE_R));i?ctx.lineTo(q[0],q[1]):ctx.moveTo(q[0],q[1]);}
  if(mode==='map'){ctx.fillStyle='#3a2f25';ctx.fill();}
  ctx.strokeStyle=mode==='ground'?'rgba(70,52,34,.45)':'rgba(234,220,192,.4)';ctx.lineWidth=Math.max(1,2*k);ctx.stroke();
  const road=mode==='ground'?'rgba(226,216,196,.55)':'rgba(234,220,192,.5)';
  ctx.strokeStyle=road;ctx.lineWidth=Math.max(1.2,9*k);
  for(const s of STREETS){ctx.beginPath();ctx.arc(cx,cy,s[1]*k,2/12*TAU-Math.PI/2,10/12*TAU-Math.PI/2);ctx.stroke();}
  for(let h=2;h<=10.001;h+=.5){const a=P(clockPos(h,ESP)),b=P(clockPos(h,440));ctx.beginPath();ctx.moveTo(a[0],a[1]);ctx.lineTo(b[0],b[1]);ctx.stroke();}
  ctx.lineWidth=Math.max(1,7*k);
  for(const h of [12,3,6,9]){const a=P(clockPos(h,30)),b=P(clockPos(h,h===12?175:ESP));ctx.beginPath();ctx.moveTo(a[0],a[1]);ctx.lineTo(b[0],b[1]);ctx.stroke();}
  ctx.fillStyle=road;ctx.beginPath();ctx.arc(cx,cy,28*k,0,TAU);ctx.fill();
  if(mode==='ground'){ // tire tracks
    ctx.strokeStyle='rgba(120,100,72,.10)';ctx.lineWidth=1.2;
    for(let i=0;i<220;i++){let p=clockPos(R(0,12),R(30,600));let a=R(0,TAU);ctx.beginPath();let q=P(p);ctx.moveTo(q[0],q[1]);for(let j=0;j<12;j++){a+=R(-.25,.25);p.x+=Math.cos(a)*14;p.z+=Math.sin(a)*14;q=P(p);ctx.lineTo(q[0],q[1]);}ctx.stroke();}
  }
  if(mode==='map'){
    ctx.fillStyle='rgba(234,220,192,.22)';ctx.beginPath();ctx.arc(...P(CENTER),22*k,0,TAU);ctx.fill();
    ctx.font=`600 ${Math.round(S/60)}px 'Martian Mono', monospace`;
    ctx.fillStyle='rgba(234,220,192,.7)';ctx.textAlign='center';ctx.textBaseline='middle';
    for(const h of [2,3,4,5,6,7,8,9,10]){const q=P(clockPos(h,470));ctx.fillText(h+':00',q[0],q[1]);}
  }
}
function crackTextures(N,cells){
  const seeds=[];for(let j=0;j<cells;j++)for(let i=0;i<cells;i++)seeds.push([(i+R(.15,.85))/cells,(j+R(.15,.85))/cells]);
  const h=new Float32Array(N*N);
  for(let y=0;y<N;y++)for(let x=0;x<N;x++){
    const u=x/N,v=y/N;const ci=Math.floor(u*cells),cj=Math.floor(v*cells);let f1=9,f2=9;
    for(let dj=-1;dj<=1;dj++)for(let di=-1;di<=1;di++){
      const ii=(ci+di+cells)%cells,jj=(cj+dj+cells)%cells;const s=seeds[jj*cells+ii];
      let sx=s[0]+Math.floor((ci+di)/cells)*1,sy=s[1]+Math.floor((cj+dj)/cells)*1;
      if(ci+di<0)sx=s[0]-1;else if(ci+di>=cells)sx=s[0]+1;else sx=s[0];
      if(cj+dj<0)sy=s[1]-1;else if(cj+dj>=cells)sy=s[1]+1;else sy=s[1];
      const d=Math.hypot(u-sx,v-sy)*cells;if(d<f1){f2=f1;f1=d;}else if(d<f2)f2=d;
    }
    const e=f2-f1;const crack=Math.min(1,e/.022);
    h[y*N+x]=crack*crack*(3-2*crack)*.55+(1-f1)*.06+Math.random()*.035;
  }
  const nd=new Uint8Array(N*N*4),ad=new Uint8Array(N*N*4);const str=6;
  for(let y=0;y<N;y++)for(let x=0;x<N;x++){
    const hx=h[y*N+(x+1)%N]-h[y*N+(x-1+N)%N],hy=h[((y+1)%N)*N+x]-h[((y-1+N)%N)*N+x];
    let nx=-hx*str,ny=-hy*str,nz=1;const l=Math.hypot(nx,ny,nz);nx/=l;ny/=l;nz/=l;
    const i=(y*N+x)*4;nd[i]=(nx*.5+.5)*255;nd[i+1]=(ny*.5+.5)*255;nd[i+2]=(nz*.5+.5)*255;nd[i+3]=255;
    const a=Math.round(clamp(.45+h[y*N+x]*.7,0,1)*255);ad[i]=ad[i+1]=ad[i+2]=a;ad[i+3]=255;
  }
  const mk=d=>{const t=new THREE.DataTexture(d,N,N,THREE.RGBAFormat);t.wrapS=t.wrapT=THREE.RepeatWrapping;t.magFilter=THREE.LinearFilter;t.minFilter=THREE.LinearMipmapLinearFilter;t.generateMipmaps=true;t.anisotropy=8;t.needsUpdate=true;return t;};
  return{normal:mk(nd),ao:mk(ad)};
}

// ================= world state (filled in by buildWorld) =================
let man,manWood,manNeon,temple,templeWood,bulbs,stars,mountMat,beacon,dustPts,dustGeo,dustPos,mapCanvas,crowd;
const portals=[];const vehicles=[],artCars=[],npcs=[],cyclists=[],pickups=[],crowdPeople=[],cars=[],artSpots=[];
let beacon2;
let manFire,templeFire,fireworks,player,ranger,rangerDriver;
const DUSTN=2600;
const P={pos:null,vel:new THREE.Vector3(),vy:0,heading:Math.PI,onGround:true,vehicle:null,sitting:false};
const spawnPt=clockPos(6.4,452);
const GIFT_ITEMS=['friendship bracelet','frozen popsicle','grilled cheese','sticker','tiny disco ball','hand-drawn postcard','pickle on a stick','glow necklace','fresh-pressed lemonade','foot massage coupon'];
const ART_NAMES={fish:'Disco Fish',galleon:'the Dust Galleon',snail:'Neon Snail',octo:'Octopus Rex'};

function buildWorld(){
  // ground
  const gc=document.createElement('canvas');gc.width=gc.height=2048;drawLayout(gc.getContext('2d'),2048,'ground');
  const gt=new THREE.CanvasTexture(gc);gt.colorSpace=THREE.SRGBColorSpace;gt.anisotropy=8;
  const TL=new THREE.TextureLoader();const tw=t=>{t.wrapS=t.wrapT=THREE.RepeatWrapping;t.anisotropy=8;t.repeat.set(1600/5.5,1600/5.5);return t;};
  const mudN=tw(TL.load('assets/tex/ground_cracked_mud_nor.jpg')),mudA=tw(TL.load('assets/tex/ground_cracked_mud_arm.jpg')),mudD=tw(TL.load('assets/tex/ground_cracked_mud_diff.jpg'));mudD.colorSpace=THREE.SRGBColorSpace;
  const groundMat=new THREE.MeshStandardMaterial({map:gt,normalMap:mudN,normalScale:new THREE.Vector2(.9,.9),aoMap:mudA,aoMapIntensity:.6,roughness:.95,metalness:0});
  const mudU={value:mudD};
  groundMat.onBeforeCompile=sh=>{
    sh.vertexShader=sh.vertexShader.replace('#include <common>','#include <common>\nvarying vec2 vGW;').replace('#include <begin_vertex>','#include <begin_vertex>\nvGW=(modelMatrix*vec4(transformed,1.)).xz;');
    sh.uniforms.uMud=mudU;
    sh.fragmentShader=sh.fragmentShader.replace('#include <common>',`#include <common>
varying vec2 vGW;uniform sampler2D uMud;
float gh(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float gn(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(gh(i),gh(i+vec2(1,0)),f.x),mix(gh(i+vec2(0,1)),gh(i+vec2(1,1)),f.x),f.y);}
float gfbm(vec2 p){return gn(p)*.5+gn(p*2.1)*.3+gn(p*4.3)*.2;}`)
    .replace('#include <map_fragment>',`#include <map_fragment>
  float gDist=length(vViewPosition);
  float macro=gfbm(vGW*.012);float meso=gfbm(vGW*.09+7.);float micro=gn(vGW*1.7);
  diffuseColor.rgb*=.86+macro*.22+meso*.08;
  diffuseColor.rgb=mix(diffuseColor.rgb,diffuseColor.rgb*vec3(1.05,1.0,.93),smoothstep(.45,.75,meso));
  diffuseColor.rgb*=1.-(1.-smoothstep(.0,.25,micro))*.05*(1.-smoothstep(10.,60.,gDist));
  {vec3 md=texture2D(uMud,vGW/5.5).rgb;float ml=dot(md,vec3(.3,.59,.11))/.36;diffuseColor.rgb*=mix(1.,clamp(ml,.45,1.35),.85*(1.-smoothstep(25.,160.,gDist)));}`)
    .replace('#include <normal_fragment_maps>',THREE.ShaderChunk.normal_fragment_maps.replace('mapN.xy *= normalScale;','mapN.xy *= normalScale*mix(1.,.12,smoothstep(12.,140.,gDist))*(.75+meso*.5);'))
    .replace('#include <aomap_fragment>',THREE.ShaderChunk.aomap_fragment.replace('float ambientOcclusion = ( texture2D( aoMap, vAoMapUv ).r - 1.0 ) * aoMapIntensity + 1.0;','float ambientOcclusion = ( texture2D( aoMap, vAoMapUv ).r - 1.0 ) * aoMapIntensity*mix(1.,.2,smoothstep(12.,140.,gDist)) + 1.0;'));
  };
  const gg=new THREE.PlaneGeometry(1600,1600);
  const ground=new THREE.Mesh(gg,groundMat);ground.rotation.x=-Math.PI/2;ground.receiveShadow=true;scene.add(ground);
  const farTex=(()=>{const cv=document.createElement('canvas');cv.width=cv.height=512;const x=cv.getContext('2d');x.fillStyle='#c1ae8e';x.fillRect(0,0,512,512);
    const rr=mulberry32(77);
    for(let i=0;i<260;i++){const px=rr()*512,py=rr()*512,r=8+rr()*60,l=rr()<.5;const g=x.createRadialGradient(px,py,0,px,py,r);const c=l?'rgba(222,206,178,':'rgba(150,130,100,';g.addColorStop(0,c+(.18+rr()*.22)+')');g.addColorStop(1,c+'0)');x.fillStyle=g;for(const ox of[-512,0,512])for(const oy of[-512,0,512]){x.save();x.translate(ox,oy);x.fillRect(px-r,py-r,r*2,r*2);x.restore();}}
    x.lineWidth=1.5;for(let i=0;i<18;i++){x.strokeStyle=`rgba(120,100,75,${.15+rr()*.2})`;x.beginPath();let px=rr()*512,py=rr()*512,a=rr()*6.28;x.moveTo(px,py);for(let k=0;k<30;k++){a+=(rr()-.5)*.3;px+=Math.cos(a)*12;py+=Math.sin(a)*12;x.lineTo(px,py);}x.stroke();}
    const t=new THREE.CanvasTexture(cv);t.wrapS=t.wrapT=THREE.RepeatWrapping;t.repeat.set(70,70);t.anisotropy=8;t.colorSpace=THREE.SRGBColorSpace;return t;})();
  const farMat=new THREE.MeshStandardMaterial({color:0xffffff,map:farTex,roughness:1});
  const far=new THREE.Mesh(new THREE.RingGeometry(790,6500,64,1),farMat);far.rotation.x=-Math.PI/2;far.position.y=-.3;scene.add(far);
  mapCanvas=document.createElement('canvas');mapCanvas.width=mapCanvas.height=1024;drawLayout(mapCanvas.getContext('2d'),1024,'map');

  // stars
  const sg=new THREE.BufferGeometry();const sa=[];for(let i=0;i<2200;i++){const t=rnd()*TAU,p=Math.acos(R(.04,1));sa.push(Math.sin(p)*Math.cos(t)*4000,Math.cos(p)*4000,Math.sin(p)*Math.sin(t)*4000);}sg.setAttribute('position',new THREE.Float32BufferAttribute(sa,3));
  stars=new THREE.Points(sg,new THREE.PointsMaterial({color:0xffffff,size:2,sizeAttenuation:false,transparent:true,opacity:0,fog:false,depthWrite:false}));stars.renderOrder=2;scene.add(stars);

  // mountain ridge: one continuous silhouette around the basin
  {const N=360,pos=[],col=[],idx=[];const hs=[];for(let i=0;i<=N;i++){const a=i/N*TAU;let h=0;for(let o=1;o<=5;o++)h+=Math.sin(a*o*3.1+o*1.7)*Math.cos(a*o*1.3+o)*(1/o);hs.push(150+Math.abs(h)*260+Math.sin(a*23)*18);}
    for(let i=0;i<=N;i++){const a=i/N*TAU,h=hs[i];const r1=3000,r2=3300+Math.sin(a*7)*150;
      pos.push(Math.cos(a)*r1,-20,Math.sin(a)*r1, Math.cos(a)*r2,h,Math.sin(a)*r2, Math.cos(a)*(r2+400),-20,Math.sin(a)*(r2+400));
      col.push(.62,.62,.62, 1,1,1, .8,.8,.8);}
    for(let i=0;i<N;i++){const a=i*3,b=(i+1)*3;idx.push(a,b,a+1, b,b+1,a+1, a+1,b+1,a+2, b+1,b+2,a+2);}
    const mg=new THREE.BufferGeometry();mg.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));mg.setAttribute('color',new THREE.Float32BufferAttribute(col,3));mg.setIndex(idx);
    mountMat=new THREE.MeshBasicMaterial({color:0x8a8fa5,vertexColors:true,fog:false,side:THREE.DoubleSide});scene.add(new THREE.Mesh(mg,mountMat));}

  // city blocks
  for(let ri=0;ri<STREETS.length-1;ri++){
    const r0=STREETS[ri][1]+5,r1=STREETS[ri+1][1]-5;
    for(let h=2;h<10;h+=.5){
      if(ri===0&&h>=5.5&&h<6.5)continue;
      if(ri===3&&h===7)continue;
      if(ri===STREETS.length-2&&(h===3||h===5||h===7.5||h===9)){pottyBank(h+.25,(r0+r1)/2);continue;}
      fillBlock(h+.02,h+.48,r0,r1);
    }
  }
  // lamp posts along the promenades
  for(const h of [12,3,6,9]){const end=h===12?170:ESP-6;for(let r=40;r<end;r+=16){const s=clockPos(h+.06,r);const rot=-h/12*TAU;const dyn=h===6;place(lampPost(dyn),s.x,s.z,rot);const lx=s.x+Math.cos(rot)*.8,lz=s.z-Math.sin(rot)*.8;const c=new THREE.Color(0xffb35a).multiplyScalar(1.6);
    if(dyn){const m=new THREE.MeshStandardMaterial({color:0x3a2a1a,emissive:0xffb35a,emissiveIntensity:0,roughness:.4});const l=M(G.box,m,.22,.32,.22,lx,3.05,lz);scene.add(l);lamps.push({mesh:l,mat:m,lit:false,on:null,pos:new THREE.Vector3(lx,0,lz),bi:bulbPos.length/3,c});}
    bulbPos.push(lx,3.05,lz);bulbCol.push(c.r,c.g,c.b);}}
  // Center Camp
  {const g=new THREE.Group();const obs=[];const n=18,r=22;const pm=mat(0x7a5b3c);for(let i=0;i<n;i++){const a=i/n*TAU;g.add(M(G.cyl,pm,.25,7,.25,Math.cos(a)*r,3.5,Math.sin(a)*r));obs.push([Math.cos(a)*r,Math.sin(a)*r,.5]);}g.add(M(G.cyl,pm,.6,12,.6,0,6,0));obs.push([0,0,1]);g.add(M(new THREE.ConeGeometry(1,1,36,1,true),mat(0xeee2c8,{side:THREE.DoubleSide,roughness:.9}),25,6,25,0,10,0));for(let i=0;i<n;i++){const a=i/n*TAU;strand(new THREE.Vector3(CENTER.x+Math.cos(a)*r,6.8,CENTER.z+Math.sin(a)*r),new THREE.Vector3(CENTER.x,11.5,CENTER.z),10,WARM);}place({g,obs},CENTER.x,CENTER.z,0);}
  buildCamp();
  // deep playa art
  for(let i=0;i<46;i++){
    let p,tries=0;
    do{const deep=rnd()<.35;const h=deep?R(-1.7,1.7):R(0,12);const r=deep?R(240,560):R(55,235);p=clockPos(h,r);tries++;}
    while(tries<40&&(Math.abs(p.x)<14&&p.z<0&&p.z>-200||d2(p,TEMPLE)<40||inStadium(p,14)||artSpots.some(q=>d2(p,q)<30)));
    artSpots.push(p);const fn=ARTS[i%ARTS.length];const rr=R(0,TAU);place(fn(),p.x,p.z,rr);if(fn===artRing)portals.push({x:p.x,z:p.z,rot:rr,s:Math.sin(rr),c:Math.cos(rr)});
  }
  // trash fence
  for(let i=0;i<5;i++){const a=clockPos(i*2.4,FENCE_R),b=clockPos((i+1)*2.4,FENCE_R);const n=Math.floor(d2(a,b)/12);for(let j=0;j<n;j++){const t=j/n;staticRoot.add(M(G.box,mat(0x5a4632),.15,1.3,.15,lerp(a.x,b.x,t),.65,lerp(a.z,b.z,t)));}const len=d2(a,b);const f=M(G.box,mat(0x7a5a3a,{transparent:true,opacity:.55}),len,1.1,.04,(a.x+b.x)/2,.7,(a.z+b.z)/2);f.rotation.y=-Math.atan2(b.z-a.z,b.x-a.x);staticRoot.add(f);}

  buildStoneStadium();
  buildMan();buildTemple();buildSoundCamps();buildRamps();buildAirport();
  bakeStatic(staticRoot);buildClouds();

  const bg=new THREE.BufferGeometry();bg.setAttribute('position',new THREE.Float32BufferAttribute(bulbPos,3));bg.setAttribute('color',new THREE.Float32BufferAttribute(bulbCol,3));
  bulbs=new THREE.Points(bg,new THREE.PointsMaterial({size:.55,map:glowMap,vertexColors:true,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending}));scene.add(bulbs);

  buildVehicles();buildPeople();buildPickups();buildParticles();buildJobs();initPoofs();buildDevils();initPuffs();initTrail();buildDali();buildMasters();buildArtistCars();buildObstacleGrid();buildCrowd();
  initMotes();initDropFx();buildPads();buildManhunt();initArms();initLaserField();for(const v of artCars)addCarBeams(v);detachCarLights();initLightPool();initFlares();initSkyFlares();
  beacon=new THREE.Mesh(new THREE.CylinderGeometry(1.4,1.4,260,20,1,true),new THREE.MeshBasicMaterial({color:new THREE.Color(0x46f1ff).multiplyScalar(1.5),transparent:true,opacity:.3,depthWrite:false,blending:THREE.AdditiveBlending,side:THREE.DoubleSide,fog:false}));
  beacon.position.y=130;scene.add(beacon);
  beacon2=new THREE.Mesh(beacon.geometry,new THREE.MeshBasicMaterial({color:new THREE.Color(0xffb35a).multiplyScalar(1.5),transparent:true,opacity:.3,depthWrite:false,blending:THREE.AdditiveBlending,side:THREE.DoubleSide,fog:false}));beacon2.position.y=130;beacon2.visible=false;scene.add(beacon2);
}

function buildCamp(){
  const signTex=(()=>{const c=document.createElement('canvas');c.width=512;c.height=128;const g=c.getContext('2d');g.fillStyle='#1a1124';g.fillRect(0,0,512,128);g.strokeStyle='#ff4fa8';g.lineWidth=8;g.strokeRect(6,6,500,116);g.fillStyle='#ffe9f5';g.font='800 50px Rubik, system-ui, sans-serif';g.textAlign='center';g.textBaseline='middle';g.fillText('CAMP LOST UNICORN',256,66);const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;return t;})();
  const face=-7.25/12*TAU;
  const g=new THREE.Group();const obs=[];
  const cols=[0xff3b3b,0xff9a2e,0xffe53b,0x3bd36b,0x3b9dff,0x9b6bff];
  cols.forEach((c,i)=>{const t=new THREE.Mesh(new THREE.TorusGeometry(9-i*.7,.32,10,48,Math.PI),neon(c,.7));t.position.set(0,0,-6);g.add(t);});
  obs.push([8.5,-6,.6],[-8.5,-6,.6]);
  const wm=mat(0xf8f4fb,{roughness:.4});const u=new THREE.Group();
  u.add(M(G.box,wm,1.6,1.6,3.6,0,2.6,0),M(G.box,wm,1,1.8,1,0,3.8,1.6),M(G.box,wm,.9,.8,1.6,0,4.6,2.3),M(G.cone6,neon(0xffd23f),.18,1.6,.18,0,5.6,2.2));
  for(const x of[-.5,.5])for(const z of[-1.3,1.3])u.add(M(G.box,wm,.35,1.9,.35,x,.95,z));
  cols.forEach((c,i)=>u.add(M(G.box,neon(c),.2,.35,.6,0,4.9-i*.28,1.2-i*.12)));
  u.position.set(6,0,4);u.rotation.y=-.6;g.add(u);obs.push([6,4,2]);
  g.add(M(G.cyl,mat(0x2c6fd1,{roughness:.4}),1.6,3.2,1.6,-6,1.6,4),M(G.cyl,mat(0xf2f2f2),1.65,.2,1.65,-6,3.2,4));obs.push([-6,4,1.9]);
  const d1=dome(5.5);d1.g.position.set(0,0,10);g.add(d1.g);obs.push([0,10,5]);
  const s=shade(9,6);s.g.position.set(-2,0,-1);g.add(s.g);for(const o of s.obs)obs.push([o[0]-2,o[1]-1,o[2]]);
  const rv=carModel('delivery');rv.position.set(-9,0,11);rv.rotation.y=.3;g.add(rv);obs.push([-9,11,2.6],[-8,8,2],[-10,14,2]);
  place({g,obs},CAMP.x,CAMP.z,face);
  strand(clockPos(7.05,358).setY(3.5),clockPos(7.45,358).setY(3.5),26,RAINBOW);
  strand(clockPos(7.05,374).setY(3.5),clockPos(7.45,374).setY(3.5),26,RAINBOW);
  const sign=new THREE.Mesh(new THREE.PlaneGeometry(6,1.5),new THREE.MeshBasicMaterial({map:signTex,side:THREE.DoubleSide}));
  const sp=clockPos(7.25,352);sign.position.set(sp.x,4.2,sp.z);sign.rotation.y=face+Math.PI;scene.add(sign);
  for(const o of[-2.6,2.6]){const c=Math.cos(face),s2=Math.sin(face);staticRoot.add(M(G.box,mat(0x5b4632),.2,4,.2,sp.x+o*c,2,sp.z-o*s2));}
  for(let i=0;i<3;i++)camSitters.push(CAMP.clone().add(new THREE.Vector3(R(-3,3),0,R(-3,3))));
}

function buildMan(){
  manWood=new THREE.MeshStandardMaterial({color:WOOD,roughness:.8});manNeon=neon(0x46f1ff);
  man=new THREE.Group();
  const base=new THREE.Mesh(new THREE.CylinderGeometry(.62,1,1,4),manWood);base.scale.set(17,10,17);base.position.y=5;base.rotation.y=Math.PI/4;man.add(base);
  for(let i=0;i<4;i++){const a=i/4*TAU+Math.PI/4;const st=M(G.box,manWood,4,.4,6,Math.cos(a)*15,.2,Math.sin(a)*15);st.rotation.y=-a;man.add(st);}
  const fig=new THREE.Group();fig.position.y=10;man.add(fig);man.userData.fig=fig;
  const L=(x0,y0,x1,y1,w)=>{const len=Math.hypot(x1-x0,y1-y0);const b=M(G.box,manWood,w,len,w,(x0+x1)/2,(y0+y1)/2,0);b.rotation.z=-Math.atan2(x1-x0,y1-y0);fig.add(b);for(const zz of[w*.55,-w*.55]){const n=M(G.box,manNeon,w*.22,len,w*.22,(x0+x1)/2,(y0+y1)/2,zz);n.rotation.z=b.rotation.z;fig.add(n);}};
  L(-4,0,-1.2,16,1.4);L(4,0,1.2,16,1.4);L(0,15,0,28,3.2);L(-1.6,26,-8,36,1.1);L(1.6,26,8,36,1.1);
  fig.add(M(new THREE.OctahedronGeometry(1),manWood,2.4,3.4,2.4,0,31.5,0),M(new THREE.OctahedronGeometry(1),manNeon,2.5,3.5,.4,0,31.5,1.1));
  shadowAll(man);scene.add(man);obstacles.push({x:0,z:0,r:13,ramp:true},{x:-2.8,z:0,r:.9},{x:2.8,z:0,r:.9});
}
function buildTemple(){
  templeWood=new THREE.MeshStandardMaterial({color:0xd8b37a,roughness:.75});const w=templeWood;
  temple=new THREE.Group();temple.add(M(G.box,w,30,.8,30,0,.4,0));
  const tobs=[];
  for(let i=0;i<12;i++){const a=i/12*TAU;const x=Math.cos(a)*13,z=Math.sin(a)*13;temple.add(M(G.box,w,.9,9,.9,x,4.9,z));tobs.push([x,z,.8]);
    const arch=new THREE.Mesh(new THREE.TorusGeometry(3.3,.18,6,20,Math.PI),w);arch.position.set(Math.cos(a+TAU/24)*12.6,6.2,Math.sin(a+TAU/24)*12.6);arch.rotation.y=-(a+TAU/24)+Math.PI/2;temple.add(arch);}
  const ring=new THREE.Mesh(new THREE.TorusGeometry(13,.45,6,36),w);ring.rotation.x=Math.PI/2;ring.position.y=9.4;temple.add(ring);
  let y=.8,s=10;for(let i=0;i<4;i++){const h=4.5-i*.6;temple.add(M(G.box,w,s,h,s,0,y+h/2,0));const roof=M(G.cone4,w,s*.95,2.6,s*.95,0,y+h+1.3,0);roof.rotation.y=Math.PI/4;temple.add(roof);for(let k=0;k<8;k++){const a=k/8*TAU;temple.add(M(G.box,w,.25,h*.9,.25,Math.cos(a)*s*.56,y+h/2,Math.sin(a)*s*.56));}y+=h+2.4;s*=.72;}
  temple.add(M(G.cone6,w,.8,10,.8,0,y+5,0),M(G.sph,neon(0xffb35a),.7,.7,.7,0,y+10.5,0));
  temple.position.copy(TEMPLE);
  for(const o of tobs)obstacles.push({x:TEMPLE.x+o[0],z:TEMPLE.z+o[1],r:o[2]});
  obstacles.push({x:TEMPLE.x,z:TEMPLE.z,r:7});
  shadowAll(temple);scene.add(temple);
}

// ================= vehicles =================
function buildBike(color){
  const g=new THREE.Group();const fm=new THREE.MeshStandardMaterial({color,metalness:.6,roughness:.35});const tm=mat(0x1b1b1b,{roughness:.9});
  for(const z of[-.55,.55]){const w=new THREE.Mesh(new THREE.TorusGeometry(.33,.045,8,24),tm);w.rotation.y=Math.PI/2;w.position.set(0,.36,z);g.add(w);const el=new THREE.Mesh(new THREE.TorusGeometry(.25,.018,6,24),neon(pick(NEONS)));el.rotation.y=Math.PI/2;el.position.set(0,.36,z);g.add(el);}
  const bar=(y0,z0,y1,z1)=>{const len=Math.hypot(y1-y0,z1-z0);const b=M(G.cyl,fm,.03,len,.03,0,(y0+y1)/2,(z0+z1)/2);b.rotation.x=Math.atan2(z1-z0,y1-y0);g.add(b);};
  bar(.36,-.55,.8,-.05);bar(.36,.55,.95,.45);bar(.8,-.05,.95,.45);bar(.36,-.05,.8,-.05);bar(.36,-.05,.36,-.55);
  g.add(M(G.box,tm,.22,.06,.32,0,.86,-.1),M(G.cyl,chromeMat,.025,.62,.025,0,1.0,.45));g.children[g.children.length-1].rotation.z=Math.PI/2;
  if(rnd()<.6)g.add(M(G.box,mat(0x6b4f3a),.36,.25,.28,0,.75,.62));
  shadowAll(g);return g;
}
function chassis(g,len,wid){g.add(M(G.box,mat(0x26221f,{roughness:.6,metalness:.4}),wid,.9,len,0,1.15,0));for(const z of[-len*.35,len*.35])for(const x of[-wid/2-.1,wid/2+.1]){const w=M(G.cyl,mat(0x161616,{roughness:.9}),.75,.5,.75,x,.75,z);w.rotation.z=Math.PI/2;g.add(w);}}
function buildArtCar(type){
  const g=new THREE.Group();let deck=2,seat=[0,2,3],dancers=[];const anims=[];let lasers=null;
  if(type==='fish'){
    chassis(g,10,4.4);
    const scale=new THREE.MeshStandardMaterial({color:0x2d7fd1,metalness:.75,roughness:.25,flatShading:true});
    g.add(M(G.geo,scale,2.6,2.4,5.4,0,3.9,0));
    const tailPiv=new THREE.Group();tailPiv.position.set(0,4.2,-5);g.add(tailPiv);const tail=M(G.cone4,scale,2.4,3,.3,0,0,-1.2);tail.rotation.x=-Math.PI/2;tailPiv.add(tail);anims.push({o:tailPiv,k:'wag'});
    for(let i=-3;i<=3;i++){const t=new THREE.Mesh(new THREE.TorusGeometry(2.45*Math.cos(i/4.2),.08,6,36),neon(i%2?0x46f1ff:0xff4fa8));t.position.set(0,3.9,i*1.3);g.add(t);}
    for(const x of[-1.9,1.9])g.add(M(G.sph,mat(0xffffff,{roughness:.2}),.55,.55,.55,x,4.6,3.9),M(G.sph,mat(0x111111,{roughness:.1}),.3,.3,.3,x*1.12,4.65,4.2));
    const ball=M(new THREE.IcosahedronGeometry(1,2),mirrorMat,.9,.9,.9,0,8,-.6);g.add(M(G.box,mat(0x4a3b2e),3.6,.2,4.5,0,6.25,-.6),ball,M(G.cyl,chromeMat,.05,1.2,.05,0,7,-.6));anims.push({o:ball,k:'spin'});
    lasers=makeLasers(4,[0x46f1ff,0xff4fa8],90);lasers.position.set(0,8,-.6);g.add(lasers);
    deck=6.35;seat=[0,deck,1.2];dancers=[[-1,deck,-1.8],[1.1,deck,-2.2],[0,deck,-.8]];
  }else if(type==='galleon'){
    chassis(g,12,5);
    const hull=mat(0x5a3a22,{roughness:.7});
    g.add(M(G.box,hull,4.8,2.4,11,0,2.8,0));const bow=M(G.cone4,hull,2.4,3.4,1.2,0,2.8,7.1);bow.rotation.x=Math.PI/2;bow.rotation.y=Math.PI/4;g.add(bow);
    const sail=mat(0xf2ead8,{side:THREE.DoubleSide,roughness:.95});
    g.add(M(G.box,mat(0x7a5532),4.6,.15,10.6,0,4.05,0),M(G.cyl,mat(0x4a301a),.18,13,.18,0,10.5,0),M(G.box,sail,5.5,4.2,.08,0,11,0),M(G.box,sail,4,3,.08,0,15.2,0));
    for(const x of[-2.35,2.35])g.add(M(G.box,neon(0xff4fa8),.08,.08,10.6,x,4.7,0));
    g.add(M(G.box,neon(0xffd23f),.06,12.5,.06,0,10.5,.2));
    deck=4.15;seat=[0,deck,3.8];dancers=[[-1.4,deck,-2],[1.3,deck,-3.4],[0,deck,0],[1.5,deck,1.5]];
  }else if(type==='snail'){
    chassis(g,9,4);
    g.add(M(G.box,mat(0x5fbf6a,{roughness:.4}),3.4,1.2,9.4,0,2.2,0));
    const shell=new THREE.Group();shell.position.set(0,4.6,-1.4);g.add(shell);
    const shMat=new THREE.MeshStandardMaterial({color:0xe0782f,metalness:.25,roughness:.3});const shMat2=new THREE.MeshStandardMaterial({color:0xc94f7a,metalness:.25,roughness:.3});
    for(let i=0;i<26;i++){const t=i/25,ang=t*TAU*1.75,r=3.1*Math.exp(-t*1.6),sz=1.7*Math.exp(-t*1.55)+.12;const b2=M(G.sph,i%2?shMat2:shMat,sz,sz,sz*.9,0,Math.sin(ang)*r,Math.cos(ang)*r);shell.add(b2);if(i%2===0)shell.add(M(G.sph,neon(0xff4fa8,.8),sz*.25,sz*.25,sz*.25,sz*.92,Math.sin(ang)*r,Math.cos(ang)*r),M(G.sph,neon(0xff4fa8,.8),sz*.25,sz*.25,sz*.25,-sz*.92,Math.sin(ang)*r,Math.cos(ang)*r));}
    anims.push({o:shell,k:'shell'});
    for(const x of[-.7,.7]){const s=M(G.cyl,mat(0x5fbf6a),.12,2.4,.12,x,3.9,4.2);s.rotation.x=.4;g.add(s,M(G.sph,neon(0xb4ff39),.32,.32,.32,x,5,4.7));}
    g.add(M(G.box,mat(0x4a3b2e),3,.2,3.4,0,2.9,2.4));
    deck=3;seat=[0,deck,2.6];dancers=[[-.8,deck,1.4],[.9,deck,3.2]];
  }else{
    chassis(g,10,5);
    g.add(M(G.hemi,new THREE.MeshStandardMaterial({color:0x7a3fbf,roughness:.3,metalness:.4}),3.6,4.2,3.6,0,2,-1.5));
    for(const x of[-1.2,1.2])g.add(M(G.sph,mat(0xfff6c8,{roughness:.2}),.6,.7,.4,x,4.2,1.7),M(G.sph,mat(0x111111,{roughness:.1}),.3,.35,.2,x,4.2,2.05));
    for(let i=0;i<8;i++){const a=i/8*TAU;const t=M(G.cone6,mat(0x8f4fd8,{roughness:.4}),.5,4.4,.5,Math.cos(a)*3.4,2.1,Math.sin(a)*3.4-1.5);t.rotation.z=Math.cos(a);t.rotation.x=-Math.sin(a);g.add(t);anims.push({o:t,k:'wiggle',bx:t.rotation.x,bz:t.rotation.z,ph:a});g.add(M(G.sph,neon(0xff6b35),.35,.35,.35,Math.cos(a)*5.2,1,Math.sin(a)*5.2-1.5));}
    g.add(M(G.box,mat(0x4a3b2e),4.6,.2,3.4,0,1.75,3.1));
    deck=1.85;seat=[0,deck,3.4];dancers=[[-1.6,deck,2.6],[1.7,deck,2.8]];
  }
  g.add(M(G.box,mat(0x111111,{roughness:.5}),.9,1.4,.9,-1.6,deck+.7,seat[2]-1.4),M(G.box,mat(0x111111,{roughness:.5}),.9,1.4,.9,1.6,deck+.7,seat[2]-1.4));
  const poofers={fish:[[-1.3,6.35,-2.4],[1.3,6.35,-2.4]],galleon:[[-1.9,4.2,-4.9],[1.9,4.2,-4.9]],snail:[[-1.1,3,-4.1],[1.1,3,-4.1]],octo:[[-2.1,1.85,4.3],[2.1,1.85,4.3]]}[type];
  for(const p of poofers){g.add(M(G.cyl,chromeMat,.17,1.1,.17,p[0],p[1]+.55,p[2]),M(G.cyl,mat(0x222222),.22,.12,.22,p[0],p[1]+.06,p[2]));p[1]+=1.15;}
  const spot=new THREE.PointLight(type==='fish'?0x46f1ff:type==='galleon'?0xff4fa8:type==='snail'?0xb4ff39:0xff6b35,0,28,2);spot.position.set(0,deck+3,0);g.add(spot);
  shadowAll(g);
  return{g,deck,seat,dancers,spot,poofers,anims,lasers};
}
function addBike(x,z,h){const b=buildBike(pick(COSTUME));b.position.set(x,0,z);b.rotation.y=h;scene.add(b);const v={kind:'bike',name:'bike',g:b,pos:b.position,heading:h,speed:0,max:14,boostMax:20,acc:10,turn:2.6,r:.6,seat:[0,.18,-.18]};vehicles.push(v);return v;}
function addArt(type,x,z){const a=buildArtCar(type);a.g.position.set(x,0,z);scene.add(a.g);const v={kind:'art',name:ART_NAMES[type],g:a.g,pos:a.g.position,heading:R(0,TAU),speed:0,max:8,boostMax:30,acc:6,turn:1,r:5,seat:a.seat,deck:a.deck,crew:[],target:null,wait:0,spot:a.spot,poofers:a.poofers,anims:a.anims,lasers:a.lasers,station:artCars.length%STATIONS.length,nextPoof:R(4,12)};
  for(const d of a.dancers){const p=makeCharacter({});p.g.position.set(d[0],d[1],d[2]);p.g.rotation.y=R(0,TAU);a.g.add(p.g);v.crew.push(p);}
  vehicles.push(v);artCars.push(v);return v;}
function buildRangerTruck(){
  const g=carModel('truck');
  g.traverse(o=>{if(o.isMesh){o.material=o.material.clone();o.material.color.set(0xf4f0e6);}});
  const lb=new THREE.Mesh(G.box,new THREE.MeshStandardMaterial({color:0x553300,emissive:0xffa21a,emissiveIntensity:3}));lb.scale.set(1.5,.18,.3);lb.position.set(0,2.35,.2);g.add(lb);g.userData.lb=lb;
  return g;
}
function buildVehicles(){
  addArt('fish',40,-80);addArt('galleon',-90,40);addArt('snail',110,60);addArt('octo',-60,-150);
  addBike(spawnPt.x+2.5,spawnPt.z+1,0);
  for(let i=0;i<34;i++){let p;const r=rnd();if(r<.2)p=stadFree(clockPos(R(0,12),R(19,24)));else if(r<.3)p=CENTER.clone().add(new THREE.Vector3(R(-25,25),0,R(-25,25)));else if(r<.4)p=TEMPLE.clone().add(new THREE.Vector3(R(-22,22),0,R(-22,22)));else p=clockPos(R(2,10),pick(STREETS)[1]+R(-5,5));addBike(p.x,p.z,R(0,TAU));}
  ranger={g:buildRangerTruck(),active:false,leaving:0,heading:0,speed:0};
  ranger.pos=ranger.g.position;ranger.g.visible=false;scene.add(ranger.g);
}

// ================= people =================
const wantMap=(()=>{const c=document.createElement('canvas');c.width=c.height=64;const g=c.getContext('2d');const gr=g.createRadialGradient(32,32,4,32,32,32);gr.addColorStop(0,'rgba(255,79,168,.95)');gr.addColorStop(.6,'rgba(255,79,168,.55)');gr.addColorStop(1,'rgba(255,79,168,0)');g.fillStyle=gr;g.fillRect(0,0,64,64);g.fillStyle='#fff';g.fillRect(20,28,24,16);g.fillRect(18,22,28,7);g.fillStyle='#ff4fa8';g.fillRect(30,22,4,22);const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;return t;})();
function setWant(n,on){n.wants=on;if(on&&!n.sprite){n.sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:wantMap,depthWrite:false,transparent:true}));n.sprite.scale.set(1.1,1.1,1.1);n.sprite.position.y=2.6;n.p.g.add(n.sprite);}if(n.sprite)n.sprite.visible=on;}
function wantCount(){return npcs.filter(n=>n.wants).length;}
function blockSpot(){const h=R(2.1,9.9),r=pick([ESP-6,290,320,350,380,410,440])+R(-3,3);return clockPos(h,r);}
function buildPeople(){
  for(let i=0;i<72;i++){
    const p=makeCharacter({});
    let home,sitter=false;
    if(i>=4&&i<26&&camSitters.length){home=camSitters[i%camSitters.length].clone().add(new THREE.Vector3(R(-2,2),0,R(-2,2)));sitter=true;}
    else home=rnd()<.7?blockSpot():stadFree(clockPos(R(0,12),R(40,230)));
    p.g.position.copy(home);p.g.rotation.y=R(0,TAU);scene.add(p.g);
    npcs.push({p,pos:p.g.position,home:home.clone(),target:home.clone(),speed:R(1.1,1.8),wait:R(0,4),name:NAMES[i%NAMES.length],wants:false,sprite:null,happy:0,sitter,skip:0});
  }
  npcs.slice(0,4).forEach((n,i)=>{const p=clockPos(6.6+i*.25,R(445,455));n.home.copy(p);n.target.copy(p);n.p.g.position.copy(p);});
  for(let i=0;i<14;i++)setWant(npcs[i<4?i:4+Math.floor(rnd()*(npcs.length-4))],true);
  for(let i=0;i<14;i++){const b=buildBike(pick(COSTUME));const rider=makeCharacter({});rider.g.position.set(0,.18,-.18);b.add(rider.g);scene.add(b);cyclists.push({g:b,rider,r:pick(STREETS)[1]+R(-2,2),h:R(2.2,9.8),dir:rnd()<.5?1:-1,speed:R(4,7)});}
  crowd=new THREE.Group();
  for(let i=0;i<50;i++){const p=makeCharacter({});const a=R(0,TAU),r=R(44,64);p.g.position.set(Math.cos(a)*r,0,Math.sin(a)*r);p.g.rotation.y=Math.atan2(-p.g.position.x,-p.g.position.z);crowd.add(p.g);crowdPeople.push(p);}
  crowd.visible=false;scene.add(crowd);
  player=makeCharacter({mask:false,kind:'mage',body:0xff8a4a,cape:0xff3b2e,hat:0xffc94a,skin:0xf0d0b8,neon:0xffd23f,wings:true});
  scene.add(player.g);P.pos=player.g.position;P.pos.copy(spawnPt);
  rangerDriver=makeCharacter({mask:false,kind:'rogue',body:0xe8d6a0,cape:0xc9b57c,hat:0xc9b57c,neon:false});rangerDriver.g.position.set(-.45,.5,-.2);ranger.g.add(rangerDriver.g);
}

// ================= pickups =================
function buildPickups(){
  const giftMats=[neon(0xff4fa8),neon(0x46f1ff),neon(0xffd23f)];
  const add=kind=>{
    const g=new THREE.Group();
    if(kind==='gift'){g.add(M(G.box,pick(giftMats),.55,.55,.55),M(G.box,mat(0xffffff,{roughness:.3}),.6,.12,.6),M(G.box,mat(0xffffff,{roughness:.3}),.12,.6,.6));}
    else{g.add(M(G.cyl,new THREE.MeshStandardMaterial({color:0x9fd8ff,transparent:true,opacity:.75,roughness:.05,metalness:0,emissive:0x1a5a8a,emissiveIntensity:.6}),.18,.6,.18),M(G.cyl,mat(0x2c6fd1),.1,.12,.1,0,.36,0));}
    const halo=new THREE.Sprite(new THREE.SpriteMaterial({map:glowMap,color:kind==='gift'?0xff8fcf:0x8fd6ff,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,opacity:.6}));halo.scale.set(2.2,2.2,2.2);g.add(halo);
    shadowAll(g);scene.add(g);const pk={kind,g,active:true,respawn:0};respot(pk);pickups.push(pk);
  };
  for(let i=0;i<34;i++)add('gift');
  pickups[0].g.position.copy(clockPos(6.45,460)).setY(1.1);pickups[1].g.position.copy(clockPos(6.2,448)).setY(1.1);
}
function respot(pk){let p;const r=rnd();if(r<.55)p=clockPos(R(2,10),pick(STREETS)[1]+R(-3,3));else if(r<.7)p=clockPos(R(5.8,7.2),R(440,470));else p=stadFree(clockPos(R(0,12),R(40,240)));collide(p,.8);p.y=1.1;pk.g.position.copy(p);pk.g.visible=true;pk.active=true;}

// ================= particles =================
function makeFire(cx,cz,radius,height,count){
  const pos=new Float32Array(count*3),col=new Float32Array(count*3),life=new Float32Array(count),vel=new Float32Array(count);
  const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.BufferAttribute(pos,3));geo.setAttribute('color',new THREE.BufferAttribute(col,3));
  const pts=new THREE.Points(geo,new THREE.PointsMaterial({size:5,map:glowMap,vertexColors:true,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending}));pts.frustumCulled=false;scene.add(pts);
  const light=new THREE.PointLight(0xff7a2a,0,0,2);light.position.set(cx,height*.35,cz);scene.add(light);
  const f={intensity:0,update(dt){
    if(f.intensity<=0&&!f.alive){light.intensity=0;return;}
    let alive=0;
    for(let i=0;i<count;i++){
      life[i]-=dt*vel[i]/height;
      if(life[i]<=0){if(rnd()<f.intensity){const a=R(0,TAU),rr=Math.sqrt(rnd())*radius;pos[i*3]=cx+Math.cos(a)*rr;pos[i*3+1]=R(0,height*.25);pos[i*3+2]=cz+Math.sin(a)*rr;vel[i]=R(8,18);life[i]=1;}else{life[i]=0;col[i*3]=col[i*3+1]=col[i*3+2]=0;continue;}}
      alive++;
      pos[i*3+1]+=vel[i]*dt;pos[i*3]+=(cx-pos[i*3])*dt*.6+Math.sin(pos[i*3+1]*.3+i)*dt*2;pos[i*3+2]+=(cz-pos[i*3+2])*dt*.6;
      const l=life[i],k=f.intensity*1.6;col[i*3]=Math.min(1,l*1.6)*k;col[i*3+1]=Math.max(0,l*l*.55)*k;col[i*3+2]=Math.max(0,l-.85)*.6*k;
    }
    f.alive=alive>0;
    geo.attributes.position.needsUpdate=true;geo.attributes.color.needsUpdate=true;
    light.intensity=f.intensity*14000*(.85+Math.sin(performance.now()*.013)*.15);
  }};
  return f;
}
const FW=1800;const fwPos=new Float32Array(FW*3),fwCol=new Float32Array(FW*3),fwVel=new Float32Array(FW*3),fwLife=new Float32Array(FW),fwBase=new Float32Array(FW*3);let fwCursor=0,fwGeo;
function buildParticles(){
  manFire=makeFire(0,0,13,70,1300);templeFire=makeFire(TEMPLE.x,TEMPLE.z,15,55,1100);
  fwGeo=new THREE.BufferGeometry();fwGeo.setAttribute('position',new THREE.BufferAttribute(fwPos,3));fwGeo.setAttribute('color',new THREE.BufferAttribute(fwCol,3));
  fireworks=new THREE.Points(fwGeo,new THREE.PointsMaterial({size:2.4,map:glowMap,vertexColors:true,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending}));fireworks.frustumCulled=false;scene.add(fireworks);
  dustPos=new Float32Array(DUSTN*3);for(let i=0;i<DUSTN*3;i++)dustPos[i]=R(-45,45);
  dustGeo=new THREE.BufferGeometry();dustGeo.setAttribute('position',new THREE.BufferAttribute(dustPos,3));
  dustPts=new THREE.Points(dustGeo,new THREE.PointsMaterial({color:0xd8c39c,size:.6,map:glowMap,transparent:true,opacity:0,depthWrite:false}));dustPts.frustumCulled=false;scene.add(dustPts);
}
function burst(x,y,z,color){const c=new THREE.Color(color).multiplyScalar(3);for(let k=0;k<150;k++){const i=fwCursor;fwCursor=(fwCursor+1)%FW;const t=R(0,TAU),p=Math.acos(R(-1,1)),s=R(10,19);fwPos[i*3]=x;fwPos[i*3+1]=y;fwPos[i*3+2]=z;fwVel[i*3]=Math.sin(p)*Math.cos(t)*s;fwVel[i*3+1]=Math.cos(p)*s;fwVel[i*3+2]=Math.sin(p)*Math.sin(t)*s;fwLife[i]=R(1.2,1.9);fwBase[i*3]=c.r;fwBase[i*3+1]=c.g;fwBase[i*3+2]=c.b;}sfx.boom();}
function updateFireworks(dt){for(let i=0;i<FW;i++){if(fwLife[i]<=0){fwCol[i*3]=fwCol[i*3+1]=fwCol[i*3+2]=0;continue;}fwLife[i]-=dt;fwVel[i*3+1]-=7*dt;for(let j=0;j<3;j++){fwVel[i*3+j]*=1-dt*.8;fwPos[i*3+j]+=fwVel[i*3+j]*dt;}const l=Math.min(1,fwLife[i]);for(let j=0;j<3;j++)fwCol[i*3+j]=fwBase[i*3+j]*l;}fwGeo.attributes.position.needsUpdate=true;fwGeo.attributes.color.needsUpdate=true;}

// ================= audio =================
const audio={ctx:null,musicLevel:0};
const sfx={
  tone(f,d,type,vol,t0){const a=audio;if(!a.ctx)return;const t=(t0||a.ctx.currentTime);const o=a.ctx.createOscillator(),g=a.ctx.createGain();o.type=type||'sine';o.frequency.value=f;g.gain.setValueAtTime(vol||.15,t);g.gain.exponentialRampToValueAtTime(.0001,t+d);o.connect(g);g.connect(a.sfx);o.start(t);o.stop(t+d+.02);},
  chime(){const t=audio.ctx&&audio.ctx.currentTime;if(!t)return;this.tone(880,.35,'sine',.15,t);this.tone(1320,.5,'sine',.12,t+.09);this.tone(1760,.6,'sine',.08,t+.18);},
  pick(){this.tone(660,.12,'triangle',.12);},
  ranger(){const a=audio;if(!a.ctx)return;const t=a.ctx.currentTime;const o=a.ctx.createOscillator(),g=a.ctx.createGain();o.type='sawtooth';o.frequency.setValueAtTime(500,t);o.frequency.linearRampToValueAtTime(900,t+.25);o.frequency.linearRampToValueAtTime(500,t+.5);g.gain.setValueAtTime(.06,t);g.gain.linearRampToValueAtTime(0,t+.55);o.connect(g);g.connect(a.sfx);o.start(t);o.stop(t+.6);},
  boom(){const a=audio;if(!a.ctx)return;const t=a.ctx.currentTime;const s=a.ctx.createBufferSource();s.buffer=a.noise;const f=a.ctx.createBiquadFilter();f.type='lowpass';f.frequency.value=300;const g=a.ctx.createGain();g.gain.setValueAtTime(.35,t);g.gain.exponentialRampToValueAtTime(.001,t+1.2);s.connect(f);f.connect(g);g.connect(a.sfx);s.start(t,R(0,1),1.3);},
};
const STATIONS=[
  {name:'Playa FM',genre:'Deep house, all day long',bpm:122},
  {name:'Dust Devil Radio',genre:'Warehouse techno',bpm:132},
  {name:'Sunrise Set',genre:'Melodic downtempo',bpm:96},
  {name:'Funk Camp',genre:'Disco and boogie',bpm:114},
];
audio.station=0;
function initAudio(){
  if(audio.ctx)return;
  try{
    const AC=window.AudioContext||window.webkitAudioContext;const ctx=new AC();audio.ctx=ctx;
    const master=ctx.createGain();master.connect(ctx.destination);audio.master=master;
    audio.sfx=ctx.createGain();audio.sfx.connect(master);
    const buf=ctx.createBuffer(1,ctx.sampleRate*2,ctx.sampleRate);const d=buf.getChannelData(0);for(let i=0;i<d.length;i++)d[i]=Math.random()*2-1;audio.noise=buf;
    const wn=ctx.createBufferSource();wn.buffer=buf;wn.loop=true;const bp=ctx.createBiquadFilter();bp.type='bandpass';bp.frequency.value=450;bp.Q.value=.6;
    const lfo=ctx.createOscillator();lfo.frequency.value=.11;const lg=ctx.createGain();lg.gain.value=220;lfo.connect(lg);lg.connect(bp.frequency);lfo.start();
    audio.wind=ctx.createGain();audio.wind.gain.value=.04;wn.connect(bp);bp.connect(audio.wind);audio.wind.connect(master);wn.start();
    audio.music=ctx.createGain();audio.music.gain.value=0;audio.lp=ctx.createBiquadFilter();audio.lp.type='lowpass';audio.lp.frequency.value=500;
    audio.musicVol=ctx.createGain();
    audio.music.connect(audio.lp);audio.lp.connect(audio.musicVol);audio.musicVol.connect(master);
    const cn=ctx.createBufferSource();cn.buffer=buf;cn.loop=true;const cbp=ctx.createBiquadFilter();cbp.type='bandpass';cbp.frequency.value=700;cbp.Q.value=1.4;const cmod=ctx.createOscillator();cmod.frequency.value=3.1;const cmg=ctx.createGain();cmg.gain.value=180;cmod.connect(cmg);cmg.connect(cbp.frequency);cmod.start();audio.crowdG=ctx.createGain();audio.crowdG.gain.value=0;cn.connect(cbp);cbp.connect(audio.crowdG);audio.crowdG.connect(master);cn.start();
    const eLP=ctx.createBiquadFilter();eLP.type='lowpass';eLP.frequency.value=240;const eG=ctx.createGain();eG.gain.value=0;const e1=ctx.createOscillator(),e2=ctx.createOscillator();e1.type='sawtooth';e2.type='sawtooth';e1.frequency.value=40;e2.frequency.value=60.6;e1.connect(eLP);e2.connect(eLP);eLP.connect(eG);eG.connect(master);e1.start();e2.start();audio.engine={g:eG,o1:e1,o2:e2};
    const dl=ctx.createDelay(1);dl.delayTime.value=.33;const fb=ctx.createGain();fb.gain.value=.36;const wet=ctx.createGain();wet.gain.value=.32;
    dl.connect(fb);fb.connect(dl);dl.connect(wet);wet.connect(audio.music);audio.send=dl;
    applySettings();
    let next=ctx.currentTime+.1,n=0,cur=-1,stepDur=.12;
    const hz=m=>440*Math.pow(2,(m-69)/12);
    const voice=(t,f,type,dur,vol,cut,o2)=>{o2=o2||{};const o=ctx.createOscillator(),g=ctx.createGain();o.type=type;o.frequency.value=f;if(o2.detune)o.detune.value=o2.detune;let node=o;
      if(cut){const fl=ctx.createBiquadFilter();fl.type='lowpass';fl.Q.value=o2.q||1;fl.frequency.setValueAtTime(cut,t);fl.frequency.exponentialRampToValueAtTime(Math.max(80,cut*(o2.fall||.3)),t+dur);o.connect(fl);node=fl;}
      const att=o2.att||.004;g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(vol,t+att);g.gain.exponentialRampToValueAtTime(.0001,t+Math.max(dur,att+.02));
      node.connect(g);g.connect(audio.music);if(o2.send)g.connect(audio.send);o.start(t);o.stop(t+dur+.06);};
    const noiseHit=(t,type,f,dur,vol)=>{const s=ctx.createBufferSource();s.buffer=buf;const fl=ctx.createBiquadFilter();fl.type=type;fl.frequency.value=f;const g=ctx.createGain();g.gain.setValueAtTime(vol,t);g.gain.exponentialRampToValueAtTime(.0001,t+dur);s.connect(fl);fl.connect(g);g.connect(audio.music);s.start(t,Math.random(),dur+.05);};
    const kick=(t,v)=>{const o=ctx.createOscillator(),g=ctx.createGain();o.frequency.setValueAtTime(150,t);o.frequency.exponentialRampToValueAtTime(42,t+.13);g.gain.setValueAtTime(v,t);g.gain.exponentialRampToValueAtTime(.001,t+.32);o.connect(g);g.connect(audio.music);o.start(t);o.stop(t+.35);};
    const CH={house:[[45,57,60,64],[41,53,57,60],[48,55,60,64],[43,55,59,62]],techno:[[38,50,53,57],[38,50,53,57],[41,53,56,60],[36,48,51,55]],chill:[[50,57,62,65,69],[46,53,58,62,65],[43,50,55,58,62],[45,52,57,60,64]],funk:[[40,52,55,59,62],[45,57,60,64,67],[38,50,54,57,60],[43,55,59,62,66]]};
    const PAT=[
      (s,bar,t,n)=>{const ch=CH.house[bar];if(s%4===0)kick(t,.9);if(s%4===2)noiseHit(t,'highpass',7000,.07,.22);if(s%8===4)noiseHit(t,'bandpass',1600,.14,.28);
        if(s%4!==0)voice(t,hz(ch[0]-12),'sawtooth',.12,.16,900);if(s%3===0)voice(t,hz(ch[1+(n%3)]+12),'square',.09,.045,2600,{send:true});
        if(s===0&&bar%2===0)for(const m of ch.slice(1))voice(t,hz(m),'triangle',stepDur*14,.025,1500,{att:.3,fall:.8,send:true});},
      (s,bar,t,n)=>{const ch=CH.techno[bar];if(s%4===0)kick(t,1);if(s%4!==0)voice(t,hz(ch[0]-24),'sine',.1,.22,0);
        noiseHit(t,'highpass',9000,.03,s%2?.05:.09);if(s%4===2)noiseHit(t,'highpass',6000,.18,.12);if(s%8===4)noiseHit(t,'bandpass',2200,.08,.1);
        const acid=[0,0,12,0,3,0,15,0,0,7,0,12,0,3,10,0][s];const cut=500+2200*(.5+.5*Math.sin(n*.035));voice(t,hz(ch[0]+acid),'sawtooth',.11,.065,cut,{q:14,fall:.22,send:s%4===3});},
      (s,bar,t,n)=>{const ch=CH.chill[bar];if(s===0||s===10)kick(t,.6);if(s===8)noiseHit(t,'bandpass',1800,.25,.16);if(s%2===1)noiseHit(t,'highpass',8000,.04,.04);
        if(s===0){for(const m of ch.slice(1))voice(t,hz(m),'triangle',stepDur*16,.03,1800,{att:.7,fall:.9,send:true,detune:(Math.random()-.5)*14});voice(t,hz(ch[0]-12),'sine',stepDur*7,.18,0,{att:.05});}
        if(s%2===0){const arp=ch[1+((n>>1)%4)]+12;voice(t,hz(arp),'sine',.35,.055,0,{send:true});}},
      (s,bar,t,n)=>{const ch=CH.funk[bar];if(s===0||s===7||s===10)kick(t,.85);if(s===4||s===12)noiseHit(t,'bandpass',1500,.16,.3);if(s%4===2)noiseHit(t,'highpass',6500,.16,.13);else if(s%2===1)noiseHit(t,'highpass',9000,.03,.05);
        const bl=[0,null,12,0,null,0,12,null,0,null,7,0,12,null,10,12][s];if(bl!==null)voice(t,hz(ch[0]-12+bl),'square',.1,.09,1300,{fall:.4});
        if(s===3||s===6||s===11||s===14)for(const m of ch.slice(1,4))voice(t,hz(m+12),'sawtooth',.09,.028,3200,{fall:.3,send:s===14});},
    ];
    setInterval(()=>{
      const st=audio.station;
      if(audio.musicLevel<.005||st<0){next=Math.max(next,ctx.currentTime+.05);cur=-1;return;}
      if(st!==cur){cur=st;n=0;next=Math.max(next,ctx.currentTime+.05);}
      stepDur=60/STATIONS[st].bpm/4;
      while(next<ctx.currentTime+.15){PAT[st](n%16,Math.floor(n/16)%4,next,n);next+=stepDur;n++;}
    },25);
  }catch(e){audio.ctx=null;}
}

// ================= input =================
const keys={};let jumpLatch=false;
let camYaw=Math.PI*1.1,camPitch=.28,camDist=7.5,lastLook=0,dragging=false;
window.addEventListener('keydown',e=>{
  if(e.target.tagName!=='BUTTON'&&['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code))e.preventDefault();
  if(e.code==='Tab'&&state.started)e.preventDefault();
  if(e.repeat)return;keys[e.code]=true;if(e.code==='Space')jumpLatch=true;handleKey(e.code);
});
function handleKey(code){const e={code};
  if(!$('#pause').hidden){if(e.code==='Escape'||e.code==='KeyP')closePause();return;}
  if(!$('#phone').hidden){if(e.code==='Escape'||e.code==='Tab')closePhone();return;}
  if(!state.started||state.paused)return;
  if(e.code==='Escape'||e.code==='KeyP'){openPause();return;}
  if(e.code==='Tab'){openPhone();return;}
  if(e.code==='KeyQ'){if(P.vehicle&&P.vehicle.kind==='art')cycleRadio();else if(state.weapon)holster();else if(state.weapons&&state.weapons.length)equip(state.lastWeapon&&state.weapons.includes(state.lastWeapon)?state.lastWeapon:state.weapons[0]);}
  if(/^Digit[0-9]$/.test(e.code)){const n=(+e.code.slice(5)+9)%10;slotWeapon(n);}
  if(e.code==='KeyB'){if(!P.ride&&!(state.wanted>=1))startDrop(false);else if(state.wanted>=1)toast('The drop plane won’t pick you up while the Rangers are after you.');}
  if(e.code==='KeyF'){if(P.vehicle&&P.vehicle.kind==='art')poof(P.vehicle);}
  if(e.code==='KeyH')horn();
  if(e.code==='KeyG')danceParty();
  if(e.code==='KeyX')meltTime();
  if(e.code==='KeyV')toggleFly();
  if(e.code==='KeyJ'){if(state.job&&state.job.id==='shuttle')endJob(false,'Shuttle run ended.',0);else startJob('shuttle');}
  if(e.code==='KeyE'){if(P.hidden)leaveHide();else interact();}
  if(e.code==='KeyM')toggleMap();
  if(e.code==='KeyK'){document.body.classList.toggle('photo');if(document.body.classList.contains('photo'))toast('Photo mode. Press K to bring the HUD back.');}
  if(e.code==='KeyC'&&!P.vehicle){P.sitting=!P.sitting;}
  if(e.code==='KeyT'){let nt=state.time+1,ev=false;for(const at of [MB-.08,TB-.08])if(state.time<at&&nt>at){nt=at;ev=true;}state.time=nt;toast(ev?'Skipping stops here. Something big is about to happen.':'An hour drifts by.');}
}
window.addEventListener('keyup',e=>{keys[e.code]=false;});
window.addEventListener('blur',()=>{for(const k in keys)keys[k]=false;mouse.l=mouse.r=false;});
canvas.addEventListener('contextmenu',e=>e.preventDefault());
window.addEventListener('mousedown',e=>{if(document.pointerLockElement!==canvas)return;if(e.button===0){mouse.l=true;W.trigger=true;}if(e.button===2)mouse.r=true;});
window.addEventListener('mouseup',e=>{if(e.button===0)mouse.l=false;if(e.button===2)mouse.r=false;});
canvas.addEventListener('mousedown',()=>{dragging=true;if(state.started&&!state.paused&&document.pointerLockElement!==canvas&&canvas.requestPointerLock){try{const p=canvas.requestPointerLock();if(p&&p.catch)p.catch(()=>{});}catch(_){}}});
window.addEventListener('mouseup',()=>{dragging=false;});
window.addEventListener('mousemove',e=>{if(document.pointerLockElement===canvas||dragging){if(P.ride&&P.ride.drop&&drop.active){const D=drop.active;D.stickX=clamp((D.stickX||0)+e.movementX*.006*settings.sens,-1,1);D.stickY=clamp((D.stickY||0)+e.movementY*.006*settings.sens*(settings.invert?-1:1),-1,1);return;}camYaw-=e.movementX*.0032*settings.sens;camPitch=clamp(camPitch+e.movementY*.0028*settings.sens*(W.aiming?.55:1)*(settings.invert?-1:1),armed()?-.55:.02,1.25);if(W.aiming)camYaw+=e.movementX*.0032*settings.sens*.45;lastLook=performance.now();}});
let wheelAcc=0;canvas.addEventListener('wheel',e=>{e.preventDefault();if(armed()){wheelAcc+=e.deltaY;if(Math.abs(wheelAcc)>40){cycleWeapon(Math.sign(wheelAcc));wheelAcc=0;}return;}camDist=clamp(camDist+e.deltaY*.01,3.5,40);},{passive:false});
const down=(...c)=>c.some(k=>keys[k]);

// ================= game state =================
const HOUR=36;
const MB=23,TB=46; // Man burns Sat 11 PM, Temple burns Sun 10 PM
// mostly night: daylight hours fly by, night hours linger
function hourLen(h){return h>6.8&&h<18.2?12:55;}
const DAYS=['SAT','SUN','MON','TUE','WED','THU','FRI'];
const state={gallery:{admired:{},done:false},unlocks:{},dream:{stage:0,got:0},meltPower:false,sunriseDay:-1,karma:0,outfit:'phoenix',stats:{walked:0,driven:0,poofs:0,fares:0,jobs:0,rangers:0},jobsDone:{},lampDay:-1,job:null,waypoint:null,time:18.4,dust:0,dustTarget:0,nextStorm:20.6,stormEnd:0,goggles:false,wanted:0,weapons:[],weapon:null,glider:'parachute',gifts:[],given:0,heat:0,quest:0,sawMan:false,sawTemple:false,manBurnt:false,templeBurnt:false,paused:true,started:false,mapOpen:false};

function toast(msg){const el=document.createElement('div');el.className='toast';el.textContent=msg;const box=$('#toasts');box.appendChild(el);while(box.children.length>3)box.removeChild(box.firstChild);setTimeout(()=>el.remove(),4200);}
let modalCb=null;
let modalCb2=null;
function modal(title,body,btn,cb,btn2,cb2){state.paused=true;$('#mtitle').textContent=title;$('#mbody').textContent=body;$('#mbtn').textContent=btn;$('#mbtn2').hidden=!btn2;if(btn2)$('#mbtn2').textContent=btn2;$('#modal').hidden=false;modalCb=cb;modalCb2=cb2||null;releaseLock();setTimeout(()=>$('#mbtn').focus(),50);}
function closeModal(which){$('#modal').hidden=true;state.paused=false;const cb=which===2?modalCb2:modalCb;modalCb=modalCb2=null;if(cb)cb();canvas.focus();}
$('#mbtn').addEventListener('click',()=>closeModal(1));$('#mbtn2').addEventListener('click',()=>closeModal(2));

function focusPos(){return P.vehicle?P.vehicle.pos:P.pos;}
function nearest(list,from,filter){let best=null,bd=1e9;for(const x of list){if(filter&&!filter(x))continue;const p=x.pos||x.g.position;const d=d2(p,from);if(d<bd){bd=d;best=x;}}return best?{item:best,d:bd}:null;}

function enterVehicle(v){
  P.vehicle=v;P.sitting=false;v.driven=true;v.wait=0;
  if(v.kind==='art')toast(`The driver of ${v.name} waves Phoenix up and hands over the wheel. Art cars crawl at 5 mph.`);
  else toast('Phoenix hops on a bike. Hold Shift to pedal hard.');
  camYaw=v.heading+Math.PI;
}
function exitVehicle(){
  const v=P.vehicle;if(!v)return;P.vehicle=null;v.driven=false;v.speed=0;v.wait=12;if(v.kind==='bike'){v.air=false;v.crashed=0;v.flip=v.spin=v.pitch=0;v.pos.y=groundHeight(v.pos.x,v.pos.z);v.g.rotation.set(0,v.heading,0);}player.g.rotation.order='XYZ';
  const side=new THREE.Vector3(Math.cos(v.heading),0,-Math.sin(v.heading)).multiplyScalar(v.r+1.2);
  P.pos.set(v.pos.x+side.x,0,v.pos.z+side.z);collide(P.pos,.45);P.vy=0;P.heading=v.heading;
  player.g.rotation.set(0,v.heading,0);
}
function interact(){
  if(P.flying||P.sky||P.ride)return;
  if(P.vehicle){exitVehicle();return;}
  {const h=nearHide();if(h&&!h.occ){enterHide(h);return;}}
  {const k=nearRack();if(k){useRack(k);return;}}
  if(airport.plane&&!airport.busy&&d2(airport.plane.g.position,P.pos)<9){boardPlane();return;}
  if(lightLamp())return;
  if(interactDali())return;
  {const mp=nearPiece();if(mp){admire(mp);return;}}
  const J=state.job;
  if(J&&J.id==='rescue'&&!J.following&&d2(J.who.g.position,P.pos)<3.6){J.following=true;J.search=null;oneShot(player,'Interact',.8);toast(`${J.name}: "Oh thank goodness. Lead the way!"`);sfx.chime();return;}
  for(const k in GIVERS){const gv=GIVERS[k];if(d2(gv.pos,P.pos)<3.6){talkTo(gv);return;}}
  const near=nearest(npcs,P.pos,n=>n.wants);
  if(near&&near.d<3.6){
    if(state.gifts.length){const item=state.gifts.shift();state.given++;setWant(near.item,false);near.item.happy=4;oneShot(player,'Interact',1.1);
      player.g.rotation.y=P.heading=Math.atan2(near.item.pos.x-P.pos.x,near.item.pos.z-P.pos.z);
      toast(`Phoenix gives ${near.item.name} a ${item}. No strings attached.`);sfx.chime();addKarma(10,'gift');
      setTimeout(()=>{const c=npcs.filter(n=>!n.wants&&!n.sitter);if(wantCount()<12&&c.length)setWant(pick(c),true);},40000);}
    else toast(`${near.item.name} would love a gift. Find a glowing box first.`);
    return;
  }
  const v=nearest(vehicles,P.pos,x=>!x.driven);
  if(v&&v.d<v.item.r+2.2){enterVehicle(v.item);return;}
  highFive();
}
function toggleMap(){state.mapOpen=!state.mapOpen;$('#mm').classList.toggle('big',state.mapOpen);sizeMinimap();}

// ================= quests =================
function timeUntil(t){const h=t-state.time;if(h<=0)return'now';const hh=Math.floor(h),mm=Math.floor((h-hh)*60);return(hh?hh+'h ':'')+mm+'m';}
const QUESTS=[
  {title:'Land in the Stone Stadium',text:()=>P.ride&&P.ride.drop?'The Stone Cup is on, right next to the Man! Fly the plane over the stone stadium (follow the beacon), jump with Space and land on the pitch.':P.sky?'Steer into the stadium and land on the pitch!':'Missed the stadium? Press B to call the drop plane and try again, or just walk in through a corner gate.',
    target:()=>STADIUM.pos,done:()=>state.stadiumLanded||(!P.sky&&!P.ride&&!P.flying&&P.onGround&&STADIUM.S&&(()=>{const l=stadLocal(P.pos.x,P.pos.z);return STADIUM.S.inBowl(l.x,l.z);})()),
    reward(){addKarma(25);toast('Welcome to the Stone Cup! The Lava Rocks and the Granite Giants are mid-match. Run into the ball to join in.');}},
  {title:'Find your camp',text:()=>'Welcome home, Phoenix. Camp Lost Unicorn is at 7:15 & Dune, look for the rainbow. Follow the cyan beacon.',target:()=>CAMP,done:()=>d2(focusPos(),CAMP)<16,
    reward(){addKarma(15);state.goggles=true;toast('"Phoenix! You made it!" Your campmates hand you a pair of dust goggles.');}},
  {title:'Gift economy',text:()=>`Give 3 gifts to burners with a pink gift bubble (${Math.min(state.given,3)}/3). Glowing boxes on the playa are free for the taking.`,
    target:()=>{const f=focusPos();if(state.gifts.length){const n=nearest(npcs,f,x=>x.wants);return n&&n.item.pos;}const g=nearest(pickups,f,x=>x.active&&x.kind==='gift');return g&&g.item.g.position;},
    done:()=>state.given>=3,reward(){addKarma(20);toast('Gifting complete. Someone gives Phoenix a hug and a sticker that says DUST IS LOVE.');}},
  {title:'Hitch an art car',text:()=>P.vehicle&&P.vehicle.kind==='art'?`Drive ${P.vehicle.name} to the Temple at 12:00. Stay near 5 mph.`:'Climb aboard an art car with E and ride it out to the Temple at 12:00.',
    target:()=>P.vehicle&&P.vehicle.kind==='art'?TEMPLE:(nearest(artCars,focusPos())||{item:{pos:TEMPLE}}).item.pos,
    done:()=>P.vehicle&&P.vehicle.kind==='art'&&d2(P.vehicle.pos,TEMPLE)<45,reward(){addKarma(20);toast('You reach the Temple. People are writing names on its walls.');}},
  {title:'The Man burns',text:()=>state.time<MB?`Be at the Man by Saturday 11:00 PM, ${timeUntil(MB)} from now. Press T to skip ahead.`:'The Man is burning. Get close.',
    target:()=>MAN,done:()=>state.sawMan,skip:()=>state.time>MB+.4&&!state.sawMan,
    reward(){addKarma(50);toast('Phoenix watched the Man burn with seventy thousand friends.');},missed(){toast('You missed the Man burn. The Temple burns Sunday night.');}},
  {title:'Temple burn',text:()=>state.time<TB?`Sunday 10:00 PM the Temple burns, ${timeUntil(TB)} from now. It is the quiet one.`:'The Temple is burning. Be there.',
    target:()=>TEMPLE,done:()=>state.sawTemple,skip:()=>state.time>TB+.4&&!state.sawTemple,
    reward(){addKarma(50);toast('The Temple burns in silence. Phoenix rises from the ashes.');setTimeout(weekSummary,6000);},missed(){toast('The Temple burned without you. There is always next year.');setTimeout(weekSummary,4000);}},
  {title:'Leave no trace',text:()=>'Free roam. Explore the deep playa, gift, dance on art cars. Pick up any MOOP you see.',target:()=>null,done:()=>false},
];
function weekSummary(){
  const st=state.stats;const jobs=Object.values(state.jobsDone).reduce((a,b)=>a+b,0);
  const lines=[`Good vibes: ${state.karma}`,`Gifts given: ${state.given}`,`Side jobs finished: ${jobs}`,`Shuttle fares: ${st.fares}`,`Flame cannon blasts: ${st.poofs}`,`Distance: ${((st.walked+st.driven)/1000).toFixed(1)} km`,`Ranger chats: ${st.rangers}`,`The Man burn: ${state.sawMan?'there':'missed'} · The Temple burn: ${state.sawTemple?'there':'missed'}`];
  const title=state.karma>=320?'Legend of the playa':state.karma>=150?'Welcome home, for real':'First-timer, no more';
  modal(`Your week: ${title}`,lines.join('\n')+'\n\nThe city packs up, but the playa stays open for you. Keep exploring, finish side jobs and unlock every outfit.','Keep exploring',()=>saveGame());
}
function updateQuest(){
  const q=QUESTS[state.quest];if(!q)return;
  if(q.done()){if(q.reward)q.reward();sfx.chime();state.quest++;}
  else if(q.skip&&q.skip()){if(q.missed)q.missed();state.quest++;}
}

// ================= settings & saving =================
const SETTINGS_KEY='phoenix-dusty-city-settings-v1',SAVE_KEY='phoenix-dusty-city-save-v1';
const settings={vol:.8,music:.8,sens:1,invert:false,gfx:'high'};
try{Object.assign(settings,JSON.parse(localStorage.getItem(SETTINGS_KEY)||'{}'));}catch(_){}
let VIEW=200,prCap=1.5;
function saveSettings(){try{localStorage.setItem(SETTINGS_KEY,JSON.stringify(settings));}catch(_){}}
function applySettings(){
  if(audio.master)audio.master.gain.value=.9*settings.vol;
  if(audio.musicVol)audio.musicVol.gain.value=settings.music;
  const q=settings.gfx;
  sun.castShadow=q!=='low';
  const ms=q==='high'?2048:1024;
  const sb=q==='high'?95:75;Object.assign(sun.shadow.camera,{left:-sb,right:sb,top:sb,bottom:-sb});sun.shadow.camera.updateProjectionMatrix();if(motes)motes.visible=q!=='low';
  if(sun.shadow.mapSize.x!==ms){sun.shadow.mapSize.set(ms,ms);if(sun.shadow.map){sun.shadow.map.dispose();sun.shadow.map=null;}}
  bloom.enabled=q!=='low';
  setCrowdCount();prCap=q==='high'?1.5:q==='medium'?1:.75;VIEW=q==='low'?120:q==='medium'?160:200;
  const cap=Math.min(window.devicePixelRatio||1,prCap);if(pr>cap){pr=cap;renderer.setPixelRatio(pr);composer.setPixelRatio(pr);resize();}
}
function saveGame(){
  if(!state.started)return;
  try{localStorage.setItem(SAVE_KEY,JSON.stringify({v:1,qv:2,time:state.time,quest:state.quest,gifts:state.gifts,given:state.given,goggles:state.goggles,wanted:state.wanted,weapons:state.weapons,weapon:state.weapon,landed:state.landed!==false,glider:state.glider,gliders:state.gliders,sawMan:state.sawMan,sawTemple:state.sawTemple,karma:state.karma,outfit:state.outfit,stats:state.stats,jobsDone:state.jobsDone,lampDay:state.lampDay,dream:{stage:state.dream.stage,got:dali.clocks.filter(c=>c.got).map(c=>c.i)},meltPower:state.meltPower,gallery:state.gallery,unlocks:state.unlocks,x:P.pos.x,z:P.pos.z,heading:P.heading}));}catch(_){}
}
function loadSave(){try{const d=JSON.parse(localStorage.getItem(SAVE_KEY)||'null');return d&&d.v===1?d:null;}catch(_){return null;}}
function clearSave(){try{localStorage.removeItem(SAVE_KEY);}catch(_){}}
function applySave(d){state.landed=d.landed!==false;
  Object.assign(state,{time:d.time,quest:(d.quest||0)+(d.qv>=2?0:1),gifts:d.gifts||[],given:d.given||0,goggles:!!d.goggles,wanted:d.wanted||0,weapons:d.weapons||[],weapon:d.weapon||null,glider:d.glider||'parachute',gliders:d.gliders||['parachute'],sawMan:!!d.sawMan,sawTemple:!!d.sawTemple,karma:d.karma||0,lampDay:d.lampDay??-1});
  Object.assign(state.stats,d.stats||{});state.meltPower=!!d.meltPower;if(d.gallery)state.gallery=d.gallery;if(d.unlocks)state.unlocks=d.unlocks;if(d.dream){state.dream.stage=d.dream.stage||0;for(const c of dali.clocks)if((d.dream.got||[]).includes(c.i)){c.got=true;if(c.b.clock)c.b.clock.visible=false;}}Object.assign(state.jobsDone,d.jobsDone||{});
  state.manBurnt=state.time>=MB;state.templeBurnt=state.time>=TB;state.nextStorm=state.time+R(1.5,4);
  if(typeof d.x==='number'){P.pos.set(d.x,0,d.z);P.heading=d.heading||0;}
  if(d.outfit&&d.outfit!=='phoenix')wearOutfit(d.outfit,true);
}
window.addEventListener('visibilitychange',()=>{if(document.hidden)saveGame();});
window.addEventListener('pagehide',saveGame);

// ================= good vibes & outfits =================
const OUTFITS=[
  {id:'phoenix',name:'Phoenix Fire',need:0,o:{kind:'mage',body:0xff8a4a,cape:0xff3b2e,hat:0xffc94a,neon:0xffd23f}},
  {id:'knight',name:'Chrome Knight',need:40,o:{kind:'knight',body:0xeef3f8,cape:0x46f1ff,hat:0xffffff,neon:0x46f1ff}},
  {id:'barb',name:'Pink Fur Barbarian',need:90,o:{kind:'barbarian',body:0xff8cc6,cape:0xff4fa8,hat:0xffb0dc,neon:0xff4fa8}},
  {id:'wander',name:'Dust Wanderer',need:150,o:{kind:'hooded',body:0xe6d2b0,cape:0xc9a878,hat:0xe6d2b0,neon:0xb4ff39}},
  {id:'disco',name:'Disco Wizard',need:220,o:{kind:'mage',body:0xd8d8ff,cape:0x9b6bff,hat:0xc0c4ff,neon:0x9b6bff}},
  {id:'gold',name:'Golden Phoenix',need:320,o:{kind:'mage',body:0xffd36b,cape:0xffb020,hat:0xffe9a0,neon:0xffd23f}},
  {id:'starry',name:'Starry Night Wizard',need:0,unlock:'gallery',o:{kind:'mage',body:0x2a5bd7,cape:0xffd23f,hat:0x1d3a8a,neon:0xffd23f}},
  {id:'harlequin',name:'Rose Period Harlequin',need:0,unlock:'gallery',o:{kind:'hooded',body:0xff8cc6,cape:0x46f1ff,hat:0xffb0dc,neon:0xff4fa8}},
];
function wearOutfit(id,quiet){
  const o=OUTFITS.find(x=>x.id===id);if(!o)return;
  const old=player;const np=makeCharacter(Object.assign({},o.o,{skin:0xf0d0b8,wings:true,mask:false}));
  np.g.position.copy(old.g.position);np.g.rotation.copy(old.g.rotation);
  scene.remove(old.g);scene.add(np.g);player=np;P.pos=np.g.position;state.outfit=id;
  if(state.job&&state.job.iceMesh){player.g.add(state.job.iceMesh);}
  if(!quiet)toast(`Phoenix changes into the ${o.name} outfit.`);
}
function addKarma(n,why){
  if(!n)return;const before=state.karma;state.karma+=n;
  floatText(`+${n} good vibes${why?' · '+why:''}`);
  for(const o of OUTFITS)if(before<o.need&&state.karma>=o.need)setTimeout(()=>toast(`New outfit unlocked: ${o.name}. Open your phone (Tab) to wear it.`),900);
}
function floatText(msg){const el=document.createElement('div');el.className='toast';el.style.color='var(--amber)';el.textContent=msg;const box=$('#toasts');box.appendChild(el);while(box.children.length>4)box.removeChild(box.firstChild);setTimeout(()=>el.remove(),2600);}

// ================= radio, flame cannons, horn =================
let radioTimer=0;
function showRadio(st){
  const el=$('#radio');if(st<0){$('#rname').textContent='Radio off';$('#rgenre').textContent='';}
  else{$('#rname').textContent=STATIONS[st].name;$('#rgenre').textContent=STATIONS[st].genre;}
  el.classList.add('on');clearTimeout(radioTimer);radioTimer=setTimeout(()=>el.classList.remove('on'),2600);
}
function cycleRadio(){
  const v=P.vehicle;if(!v||v.kind!=='art'){toast('The radio is on the art cars. Climb aboard one first.');return;}
  v.station=v.station>=STATIONS.length-1?-1:v.station+1;showRadio(v.station);
}
const POOF_N=1200;const poofPos=new Float32Array(POOF_N*3),poofVel=new Float32Array(POOF_N*3),poofLife=new Float32Array(POOF_N),poofCol=new Float32Array(POOF_N*3);let poofCursor=0,poofGeo,poofLight,poofFlash=0;
function initPoofs(){
  poofGeo=new THREE.BufferGeometry();poofGeo.setAttribute('position',new THREE.BufferAttribute(poofPos,3));poofGeo.setAttribute('color',new THREE.BufferAttribute(poofCol,3));
  const pts=new THREE.Points(poofGeo,new THREE.PointsMaterial({size:1.5,map:glowMap,vertexColors:true,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending}));pts.frustumCulled=false;scene.add(pts);
  poofLight=new THREE.PointLight(0xff8a2a,0,0,2);scene.add(poofLight);
}
const _pp=new THREE.Vector3();
function poof(v){
  if(!v.poofers)return;const now=performance.now();if(v.lastPoof&&now-v.lastPoof<350)return;v.lastPoof=now;
  for(const p of v.poofers){
    _pp.set(p[0],p[1],p[2]);v.g.localToWorld(_pp);
    for(let k=0;k<70;k++){const i=poofCursor;poofCursor=(poofCursor+1)%POOF_N;poofPos[i*3]=_pp.x;poofPos[i*3+1]=_pp.y;poofPos[i*3+2]=_pp.z;poofVel[i*3]=R(-1.5,1.5);poofVel[i*3+1]=R(12,24);poofVel[i*3+2]=R(-1.5,1.5);poofLife[i]=R(.55,.95);}
    poofLight.position.copy(_pp);poofLight.position.y+=3;
  }
  poofFlash=1;sfx.whoosh(d2(v.pos,focusPos()));
  for(const n of npcs)if(n.p.g.visible&&d2(n.pos,v.pos)<35)n.happy=Math.max(n.happy,2.5);
  for(let i=0;i<crowdN;i++){if((cX[i]-v.pos.x)**2+(cZ[i]-v.pos.z)**2<900)crowdCheer(i,3);}
  if(v===P.vehicle)state.stats.poofs++;
}
function updatePoofs(dt){
  for(let i=0;i<POOF_N;i++){
    if(poofLife[i]<=0){poofCol[i*3]=poofCol[i*3+1]=poofCol[i*3+2]=0;continue;}
    poofLife[i]-=dt;const l=Math.max(0,poofLife[i]);
    poofVel[i*3+1]*=1-dt*1.5;poofPos[i*3]+=poofVel[i*3]*dt+Math.sin(i+poofPos[i*3+1])*dt;poofPos[i*3+1]+=poofVel[i*3+1]*dt;poofPos[i*3+2]+=poofVel[i*3+2]*dt;
    poofCol[i*3]=1.6*Math.min(1,l*1.8);poofCol[i*3+1]=.85*l*l;poofCol[i*3+2]=.2*Math.max(0,l-.6);
  }
  poofGeo.attributes.position.needsUpdate=true;poofGeo.attributes.color.needsUpdate=true;
  poofFlash=Math.max(0,poofFlash-dt*3);poofLight.intensity=poofFlash*1800;
}
function horn(){
  const v=P.vehicle;
  if(v&&v.kind==='art'){sfx.horn();}
  else if(v){sfx.bell();}
  else{sfx.woo();oneShot(player,'Cheer',1.4);}
  const f=focusPos();for(const n of npcs)if(n.p.g.visible&&d2(n.pos,f)<18){n.happy=Math.max(n.happy,2);}
  for(let i=0;i<crowdN;i++){if((cX[i]-f.x)**2+(cZ[i]-f.z)**2<324)crowdCheer(i,2.5);}
}
Object.assign(sfx,{
  flare(dist){const a=audio;if(!a.ctx)return;const vol=clamp(1-dist/350,0,1)*.08;if(vol<=0)return;const t=a.ctx.currentTime;const s2=a.ctx.createBufferSource();s2.buffer=a.noise;const f=a.ctx.createBiquadFilter();f.type='bandpass';f.frequency.setValueAtTime(900,t);f.frequency.exponentialRampToValueAtTime(3500,t+.6);const g=a.ctx.createGain();g.gain.setValueAtTime(vol,t);g.gain.exponentialRampToValueAtTime(.0001,t+.8);s2.connect(f);f.connect(g);g.connect(a.sfx);s2.start(t,R(0,1),.85);},
  ring(dist){const vol=clamp(1-dist/90,0,1)*.09;if(vol<=0)return;const t=audio.ctx&&audio.ctx.currentTime;if(!t)return;for(let k=0;k<2;k++)for(let j=0;j<10;j++){this.tone(1180,.035,'square',vol,t+k*.45+j*.04);this.tone(1480,.035,'square',vol*.6,t+k*.45+j*.04+.02);}},
  boing(){const a=audio;if(!a.ctx)return;const t=a.ctx.currentTime;const o=a.ctx.createOscillator(),g=a.ctx.createGain();o.type='sine';o.frequency.setValueAtTime(140,t);o.frequency.exponentialRampToValueAtTime(520,t+.25);o.frequency.exponentialRampToValueAtTime(300,t+.5);g.gain.setValueAtTime(.25,t);g.gain.exponentialRampToValueAtTime(.001,t+.55);o.connect(g);g.connect(a.sfx);o.start(t);o.stop(t+.6);},
  warp(up){const a=audio;if(!a.ctx)return;const t=a.ctx.currentTime;const o=a.ctx.createOscillator(),g=a.ctx.createGain();o.type='sine';o.frequency.setValueAtTime(up?220:880,t);o.frequency.exponentialRampToValueAtTime(up?880:110,t+.9);g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(.18,t+.1);g.gain.exponentialRampToValueAtTime(.0001,t+1);o.connect(g);g.connect(a.sfx);o.start(t);o.stop(t+1.05);},
  hop(){this.tone(320,.12,'triangle',.08);},
  thud(){const a=audio;if(!a.ctx)return;const t=a.ctx.currentTime;const o=a.ctx.createOscillator(),g=a.ctx.createGain();o.frequency.setValueAtTime(120,t);o.frequency.exponentialRampToValueAtTime(40,t+.15);g.gain.setValueAtTime(.25,t);g.gain.exponentialRampToValueAtTime(.001,t+.2);o.connect(g);g.connect(a.sfx);o.start(t);o.stop(t+.22);},
  crash(){this.thud();const a=audio;if(!a.ctx)return;const t=a.ctx.currentTime;const s=a.ctx.createBufferSource();s.buffer=a.noise;const f=a.ctx.createBiquadFilter();f.type='lowpass';f.frequency.value=1200;const g=a.ctx.createGain();g.gain.setValueAtTime(.3,t);g.gain.exponentialRampToValueAtTime(.001,t+.5);s.connect(f);f.connect(g);g.connect(a.sfx);s.start(t,R(0,1),.55);},
  clap(){const a=audio;if(!a.ctx)return;const t=a.ctx.currentTime;const s=a.ctx.createBufferSource();s.buffer=a.noise;const f=a.ctx.createBiquadFilter();f.type='bandpass';f.frequency.value=1800;const g=a.ctx.createGain();g.gain.setValueAtTime(.3,t);g.gain.exponentialRampToValueAtTime(.001,t+.12);s.connect(f);f.connect(g);g.connect(a.sfx);s.start(t,R(0,1),.15);},
  step(){const a=audio;if(!a.ctx)return;const t=a.ctx.currentTime;const s=a.ctx.createBufferSource();s.buffer=a.noise;const f=a.ctx.createBiquadFilter();f.type='lowpass';f.frequency.value=R(600,1000);const g=a.ctx.createGain();g.gain.setValueAtTime(.05,t);g.gain.exponentialRampToValueAtTime(.0001,t+.09);s.connect(f);f.connect(g);g.connect(a.sfx);s.start(t,R(0,1.8),.1);},
  whoosh(dist){const a=audio;if(!a.ctx)return;const t=a.ctx.currentTime;const vol=clamp(1-dist/150,0,1)*.5;if(vol<=0)return;const s=a.ctx.createBufferSource();s.buffer=a.noise;const f=a.ctx.createBiquadFilter();f.type='bandpass';f.Q.value=.8;f.frequency.setValueAtTime(300,t);f.frequency.exponentialRampToValueAtTime(1800,t+.25);f.frequency.exponentialRampToValueAtTime(400,t+.9);const g=a.ctx.createGain();g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(vol,t+.05);g.gain.exponentialRampToValueAtTime(.0001,t+1);s.connect(f);f.connect(g);g.connect(a.sfx);s.start(t,R(0,1),1.1);},
  horn(){const t=audio.ctx&&audio.ctx.currentTime;if(!t)return;[523,659,784,659,1046].forEach((f,i)=>{this.tone(f,.16,'square',.07,t+i*.13);this.tone(f*1.005,.16,'sawtooth',.04,t+i*.13);});},
  bell(){const t=audio.ctx&&audio.ctx.currentTime;if(!t)return;for(const o of[0,.16]){this.tone(2100,.5,'sine',.12,t+o);this.tone(2650,.35,'sine',.06,t+o);}},
  woo(){const a=audio;if(!a.ctx)return;const t=a.ctx.currentTime;const o=a.ctx.createOscillator(),g=a.ctx.createGain();o.type='triangle';o.frequency.setValueAtTime(420,t);o.frequency.exponentialRampToValueAtTime(900,t+.35);o.frequency.exponentialRampToValueAtTime(600,t+.6);g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(.12,t+.05);g.gain.exponentialRampToValueAtTime(.0001,t+.65);o.connect(g);g.connect(a.sfx);o.start(t);o.stop(t+.7);},
  fail(){const t=audio.ctx&&audio.ctx.currentTime;if(!t)return;this.tone(330,.25,'triangle',.12,t);this.tone(247,.4,'triangle',.12,t+.18);},
  tick(){this.tone(1400,.04,'square',.03);},
});

// ================= UI: pause, phone, pointer lock =================
let releasingLock=false;
function releaseLock(){if(document.pointerLockElement){releasingLock=true;document.exitPointerLock();}}
function uiOpen(){return !$('#pause').hidden||!$('#phone').hidden||!$('#modal').hidden;}
document.addEventListener('pointerlockchange',()=>{if(!document.pointerLockElement){if(!releasingLock&&state.started&&!state.paused&&!uiOpen())openPause();releasingLock=false;}});
function openPause(){
  if(!state.started||uiOpen())return;
  state.paused=true;releaseLock();saveGame();
  $('#setVol').value=settings.vol;$('#setMusic').value=settings.music;$('#setSens').value=settings.sens;$('#setInv').checked=settings.invert;$('#setGfx').value=settings.gfx;
  $('#pNew').textContent='Start a new week';$('#pause').hidden=false;setTimeout(()=>$('#pResume').focus(),30);
}
function closePause(){$('#pause').hidden=true;state.paused=false;canvas.focus();}
$('#pResume').addEventListener('click',closePause);
$('#pNew').addEventListener('click',e=>{const b=e.currentTarget;if(b.dataset.armed){clearSave();location.reload();}else{b.dataset.armed='1';b.textContent='Click again to erase progress';setTimeout(()=>{delete b.dataset.armed;b.textContent='Start a new week';},3000);}});
for(const [id,key,num] of [['setVol','vol',1],['setMusic','music',1],['setSens','sens',1],['setInv','invert',0],['setGfx','gfx',0]]){
  $('#'+id).addEventListener('input',e=>{const el=e.currentTarget;settings[key]=el.type==='checkbox'?el.checked:num?parseFloat(el.value):el.value;saveSettings();applySettings();});
}
let phoneTab='jobs';
function openPhone(){if(!state.started||uiOpen())return;state.paused=true;releaseLock();renderPhone();$('#phone').hidden=false;}
function closePhone(){$('#phone').hidden=true;state.paused=false;canvas.focus();}
$('#phClose').addEventListener('click',closePhone);
for(const [id,tab] of [['tabJobs','jobs'],['tabWear','wear'],['tabStats','stats']])$('#'+id).addEventListener('click',()=>{phoneTab=tab;renderPhone();});
function esc(s){return String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));}
function hex(c){return '#'+c.toString(16).padStart(6,'0');}
function renderPhone(){
  $('#phClock').textContent=fmtTime(state.time);
  for(const [id,tab] of [['tabJobs','jobs'],['tabWear','wear'],['tabStats','stats']])$('#'+id).setAttribute('aria-selected',String(phoneTab===tab));
  const b=$('#phBody');let h='';
  if(phoneTab==='jobs'){
    const q=QUESTS[state.quest];
    h+=`<div class="ph-card"><span class="meta">Drop plane</span><h4>Jump again</h4><p>Call the drop plane and skydive anywhere in the city. Also on B, or step on a glowing launch pad.</p><button data-act="drop">Call the plane</button></div>`;
    h+=`<div class="ph-card"><span class="meta">Main objective</span><h4>${esc(q.title)}</h4><p>${esc(q.text())}</p></div>`;
    if(state.job){const J=state.job;h+=`<div class="ph-card on"><span class="meta">In progress</span><h4>${esc(JOB_INFO[J.id].title)}</h4><p>${esc(jobText(J))}</p><button data-act="abandon">Drop this job</button></div>`;}
    if(masters.pieces.length){const gp=galleryProgress();h+=`<div class="ph-card${state.gallery.done?'':' on'}"><span class="meta">Gallery Walk${state.gallery.done?' · complete':''}</span><h4>Admire the masters</h4><p>Walk up to art by Monet, Van Gogh, Picasso and Dalí and press E to admire it. ${gp.n} of 8 pieces, ${gp.artists} of 4 artists. Finishing unlocks two outfits.</p></div>`;}
    h+='<h5>Side jobs</h5>';
    for(const id of Object.keys(JOB_INFO)){const j=JOB_INFO[id];const done=state.jobsDone[id]||0;const g=Object.values(GIVERS).find(x=>x.job===id);
      h+=`<div class="ph-card"><span class="meta">${esc(j.where)}${done?` · done ${done}×`:''}</span><h4>${esc(j.title)}</h4><p>${esc(j.blurb)}</p>`;
      if(id==='shuttle')h+=`<button data-act="shuttle" ${P.vehicle&&P.vehicle.kind==='art'&&!state.job?'':'disabled'}>${P.vehicle&&P.vehicle.kind==='art'?'Start shuttle run':'Drive an art car to start'}</button>`;
      else if(g)h+=`<button data-act="way" data-id="${id}">Set waypoint</button>`;
      h+='</div>';}
  }else if(phoneTab==='wear'){
    if(PR&&PR.GLIDERS){h+='<h5>Gliders</h5>';const have=state.gliders||['parachute'];for(const gl of PR.GLIDERS){const ok=have.includes(gl.id);const on=state.glider===gl.id;h+=`<div class="ph-card${on?' on':''}"><span class="meta">${ok?(on?'Flying this one':'Unlocked'):'Unlocks as you skydive'}</span><h4>${esc(gl.name)}</h4><p>${esc(gl.blurb)}</p>${ok&&!on?`<button data-act="glider" data-id="${gl.id}">Fly this</button>`:''}</div>`;}h+='<h5>Outfits</h5>';}
    h+=`<div class="ph-card"><span class="meta">Good vibes</span><h4>${state.karma}</h4><p>Earn good vibes by gifting, finishing side jobs and being there for the burns. They unlock outfits.</p></div>`;
    for(const o of OUTFITS){const ok=state.karma>=o.need&&(!o.unlock||state.unlocks[o.unlock]);const on=state.outfit===o.id;
      h+=`<div class="ph-card${on?' on':''}"><span class="meta">${ok?(on?'Wearing now':'Unlocked'):o.unlock?'Finish the Gallery Walk':`Needs ${o.need} good vibes`}</span><h4>${esc(o.name)}</h4><div class="swatch"><i style="background:${hex(o.o.body)}"></i><i style="background:${hex(o.o.cape)}"></i><i style="background:${hex(o.o.hat)}"></i><i style="background:${hex(o.o.neon)}"></i></div><button data-act="wear" data-id="${o.id}" ${ok&&!on?'':'disabled'}>${on?'Wearing':'Wear'}</button></div>`;}
  }else{
    const st=state.stats;const km=x=>(x/1000).toFixed(2)+' km';
    const rows=[['Good vibes',state.karma],['Gifts given',state.given],['Walked',km(st.walked)],['Ridden and driven',km(st.driven)],['Flame cannon blasts',st.poofs],['Shuttle fares',st.fares],['Side jobs finished',st.jobs],['Saw the Man burn',state.sawMan?'Yes':'Not yet'],['Saw the Temple burn',state.sawTemple?'Yes':'Not yet'],['Ranger chats',st.rangers],['Bike stunts landed',st.stunts||0],['High fives',st.fives||0],['Surreal conversations',st.surreal||0],['Soft clocks',dali.clocks.filter(c=>c.got).length+' of 7'],['Skydives',st.skydives||0],['Masterpieces admired',Object.keys(state.gallery.admired).length],['Paint shots fired',st.shots||0],['Rangers splashed',st.stunned||0],['Clean getaways',st.escapes||0],['Favorite gun',(()=>{const u=st.gunUse||{};const k=Object.keys(u).sort((a,b)=>u[b]-u[a])[0];return k&&WP?WDEF(k).name:'None yet';})()]];
    h+='<div class="ph-card">'+rows.map(r=>`<div class="stat"><span>${r[0]}</span><b>${r[1]}</b></div>`).join('')+'</div>';
  }
  b.innerHTML=h;
}
$('#phBody').addEventListener('click',e=>{
  const btn=e.target.closest('button');if(!btn||btn.disabled)return;const act=btn.dataset.act,id=btn.dataset.id;
  if(act==='abandon'){endJob(false,'You drop the job. No hard feelings.',0);}
  else if(act==='shuttle'){closePhone();startJob('shuttle');return;}
  else if(act==='way'){const g=Object.values(GIVERS).find(x=>x.job===id);state.waypoint=g.pos.clone();toast(`Waypoint set: ${g.name}.`);closePhone();return;}
  else if(act==='wear'){wearOutfit(id);}
  else if(act==='glider'){state.glider=id;floatText('Glider: '+id);saveGame();}
  else if(act==='drop'){closePhone();if(state.wanted>=1)toast('The drop plane won’t pick you up while the Rangers are after you.');else startDrop(false);return;}
  renderPhone();
});

// ================= side jobs =================
const giverMap=(()=>{const c=document.createElement('canvas');c.width=c.height=64;const g=c.getContext('2d');const gr=g.createRadialGradient(32,32,4,32,32,32);gr.addColorStop(0,'rgba(255,179,90,.95)');gr.addColorStop(.6,'rgba(255,179,90,.5)');gr.addColorStop(1,'rgba(255,179,90,0)');g.fillStyle=gr;g.fillRect(0,0,64,64);g.fillStyle='#1a0e04';g.fillRect(28,14,8,24);g.fillRect(28,42,8,8);const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;return t;})();
const GIVERS={
  ice:{name:'the Ice Depot',job:'ice',pos:clockPos(5.72,262),outfit:{kind:'knight',body:0x8cf3ff,cape:0x46f1ff,hat:0xffffff}},
  lamp:{name:'the Lamplighters',job:'lamp',pos:clockPos(6.14,248),outfit:{kind:'mage',body:0xfff2c0,cape:0xffd36b,hat:0xffe68c},hours:[16.9,20.3]},
  moop:{name:'the Earth Guardians',job:'moop',pos:clockPos(3,251),outfit:{kind:'hooded',body:0x9effcf,cape:0x2ee59d,hat:0x9effcf}},
  race:{name:'the Gravity Optional crew',job:'race',pos:clockPos(4.62,198),outfit:{kind:'barbarian',body:0xffd23f,cape:0xff6b35,hat:0xffe68c}},
  bike:{name:'Moonbeam',job:'bike',pos:clockPos(9,251),outfit:{kind:'rogue',body:0xc3a8ff,cape:0x9b6bff,hat:0xc3a8ff}},
};
const JOB_INFO={
  ice:{title:'Ice Run',blurb:'Carry a bag of ice to a camp before it melts. Bikes are fastest.',where:'Ice Depot · 6:00 & Esplanade',offer:'"Our ice delivery bike broke. Can you run a bag of ice to a camp across town? It melts in about two and a half minutes out here."'},
  shuttle:{title:'Art Car Shuttle',blurb:'Pick up burners waving on the playa and drop them where they want to go. Three fares per shift, and keep it near 5 mph.',where:'Press J while driving an art car'},
  lamp:{title:'Lamplighter',blurb:'Light the lanterns along the 6:00 promenade before dark. Evenings only, 5 to 8 PM.',where:'Lamplighters · 6:00 promenade',offer:'"Every evening we walk the promenade and light the lanterns by hand. Grab a wick and light the 6:00 route with us?"'},
  moop:{title:'MOOP Sweep',blurb:'Pick up stray trash on the open playa before the wind scatters it.',where:'Earth Guardians · 3:00 & Esplanade',offer:'"MOOP means Matter Out Of Place. A gust scattered a camp’s trash out past the Man. Help us sweep it up before it spreads?"'},
  bike:{title:'Lost Bike',blurb:'Moonbeam lost a purple bike with fairy lights somewhere on the deep playa.',where:'Moonbeam · 9:00 & Esplanade',offer:'"I parked my bike at some art last night and now I can’t remember which art. It’s purple with fairy lights. Can you look?"'},
  race:{title:'Dust Derby',blurb:'Ride a bike through ten checkpoint gates around the bike park before the clock runs out. Ramps encouraged.',where:'Gravity Optional · bike park, 4:30',offer:'"Dust Derby! Grab a bike and hit all ten gates in order. Ninety seconds on the clock. Air time is faster, trust us."'},
  rescue:{title:'Whiteout Rescue',blurb:'During dust storms, someone may get lost. Find them and lead them back to safety.',where:'Starts on its own in a dust storm'},
};
const lamps=[];let moopGroup=null;
function buildJobs(){
  for(const k of Object.keys(GIVERS)){
    const gv=GIVERS[k];const c=makeCharacter(Object.assign({neon:0xffb35a,mask:false},gv.outfit));
    c.g.position.copy(gv.pos);c.g.rotation.y=Math.atan2(-gv.pos.x,-gv.pos.z);scene.add(c.g);
    const sp=new THREE.Sprite(new THREE.SpriteMaterial({map:giverMap,depthWrite:false,transparent:true}));sp.scale.set(1.2,1.2,1.2);sp.position.y=2.8;c.g.add(sp);
    gv.c=c;gv.sprite=sp;obstacles.push({x:gv.pos.x,z:gv.pos.z,r:.45});
  }
  moopGroup=new THREE.Group();scene.add(moopGroup);
}
function giverOpen(gv){if(!gv.hours)return true;const h=state.time%24;return h>=gv.hours[0]&&h<=gv.hours[1]&&state.lampDay!==Math.floor((state.time-7)/24);}
function talkTo(gv){
  const info=JOB_INFO[gv.job];
  if(state.job){toast(`${cap(gv.name)}: "Finish what you’re doing first. We’ll be here."`);return;}
  if(!giverOpen(gv)){toast(gv.job==='lamp'?'The Lamplighters gather at 5 PM. Come back this evening.':'Not right now.');return;}
  modal(info.title,info.offer,'I’m in',()=>startJob(gv.job),'Not now',null);
}
function cap(s){return s.charAt(0).toUpperCase()+s.slice(1);}
const fmtSec=s=>{s=Math.max(0,Math.ceil(s));return Math.floor(s/60)+':'+String(s%60).padStart(2,'0');};
function landmarks(){return[{name:'the Temple',pos:TEMPLE},{name:'Center Camp',pos:CENTER},{name:'the Man',pos:clockPos(6,36)},{name:'Camp Lost Unicorn',pos:CAMP},{name:'the 3:00 plaza',pos:clockPos(3,262)},{name:'the 9:00 plaza',pos:clockPos(9,262)},...artSpots.slice(0,14).map(p=>({name:`the art at ${address(p.x,p.z).replace('Inner playa · ','').replace('Deep playa · ','')}`,pos:p}))];}
function startJob(id){
  if(state.job){toast('Finish or drop your current job first. Open your phone with Tab.');return;}
  const J={id,t:0};const f=focusPos();
  if(id==='ice'){let p,tries=0;do{p=blockSpot();tries++;}while(tries<50&&(d2(p,f)<130||d2(p,f)>330));J.dest=p;J.addr=address(p.x,p.z);J.timer=150;
    J.iceMesh=M(G.box,new THREE.MeshStandardMaterial({color:0xcfefff,transparent:true,opacity:.85,roughness:.1,emissive:0x2a6a9a,emissiveIntensity:.4}),.35,.35,.35,.32,1.05,.32);player.g.add(J.iceMesh);
    toast(`A bag of ice for a camp at ${J.addr}. Go!`);}
  else if(id==='shuttle'){if(!P.vehicle||P.vehicle.kind!=='art'){toast('Climb aboard an art car first.');return;}J.car=P.vehicle;J.fares=0;state.job=J;newFare(J);sfx.chime();return;}
  else if(id==='lamp'){for(const l of lamps)l.lit=false;J.left=lamps.length;toast(`Light all ${lamps.length} lanterns on the 6:00 promenade. Walk up to each and press E.`);}
  else if(id==='moop'){J.center=clockPos(R(10.6,13.4),R(80,210));J.items=[];J.got=0;J.timer=170;
    const kinds=[()=>M(G.cyl,chromeMat,.12,.03,.12),()=>M(new THREE.PlaneGeometry(.12,.45),mat(pick([0xff4fa8,0x46f1ff,0xffd23f]),{side:THREE.DoubleSide}),1,1,1),()=>M(G.box,mat(pick([0xd7263d,0x2c6fd1,0xf2efe8]),{roughness:.4}),.14,.22,.14)];
    for(let i=0;i<12;i++){const g=new THREE.Group();const a=R(0,TAU),r=Math.sqrt(rnd())*38;g.position.set(J.center.x+Math.cos(a)*r,.12,J.center.z+Math.sin(a)*r);collide(g.position,.6);g.add(pick(kinds)());
      const sp=new THREE.Sprite(new THREE.SpriteMaterial({map:glowMap,color:0xfff2c0,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,opacity:.8}));sp.scale.set(.9,.9,.9);g.add(sp);moopGroup.add(g);J.items.push(g);}
    toast('Trash is scattered on the open playa past the Man. Grab all 12 pieces.');}
  else if(id==='bike'){const a=R(-2.2,2.2),r=R(150,300);const p=clockPos(a<0?a+12:a,r);collide(p,1);J.bike=addBike(p.x,p.z,R(0,TAU));J.bike.lost=true;
    J.bike.g.traverse(o=>{if(o.isMesh&&o.material.metalness>.5&&o.material.color)o.material=new THREE.MeshStandardMaterial({color:0x8a3dff,metalness:.6,roughness:.35});});
    for(let i=0;i<14;i++)J.bike.g.add(M(G.sph,neon(pick([0xff4fa8,0xffd23f,0x46f1ff,0xb4ff39]),1.4),.05,.05,.05,R(-.1,.1),R(.4,1),R(-.6,.6)));
    J.search=new THREE.Vector3(p.x+R(-35,35),0,p.z+R(-35,35));J.radius=60;J.found=false;toast('Search the marked circle on your map for a purple bike with fairy lights.');}
  else if(id==='race'){J.gates=[];J.k=0;J.timer=95;const c=parkPos;const base=Math.atan2(-c.x,-c.z);
    for(let i=0;i<10;i++){const a=base+Math.PI+i/10*TAU*1.0;const r=i%3===1?32:70+R(-10,15);const gp=new THREE.Vector3(c.x+Math.sin(a)*r,0,c.z+Math.cos(a)*r);collide(gp,4);
      const g=new THREE.Group();const m=neon(i===0?0xffd23f:0xff6b35,1.2);g.add(M(G.box,mat(0x2a2a30),.4,5,.4,-3.5,2.5,0),M(G.box,mat(0x2a2a30),.4,5,.4,3.5,2.5,0),M(G.box,m,7.4,.35,.35,0,5,0));
      const lbl=makeBubble(String(i+1));lbl.position.y=6.2;lbl.scale.set(2.4,.6,1);g.add(lbl);g.position.copy(gp);g.rotation.y=a+Math.PI/2;scene.add(g);J.gates.push(g);}
    toast('Dust Derby! Get on a bike and ride through gate 1. The clock is running.');}
  else if(id==='rescue'){let p,tries=0;do{const a=R(0,TAU),r=R(70,130);p=new THREE.Vector3(f.x+Math.cos(a)*r,0,f.z+Math.sin(a)*r);collide(p,.5);tries++;}while(tries<20&&Math.hypot(p.x,p.z)>FENCE_IN-30);
    J.who=makeCharacter({});J.who.g.position.copy(p);scene.add(J.who.g);J.name=pick(NAMES);J.following=false;
    J.search=new THREE.Vector3(p.x+R(-20,20),0,p.z+R(-20,20));J.radius=38;
    toast(`A voice in the dust: "Hello? I can’t see anything!" Someone is lost in the whiteout.`);}
  state.job=J;sfx.chime();
}
function newFare(J){
  const c=J.car;let p,tries=0;
  do{p=rnd()<.5?stadFree(clockPos(R(0,12),R(60,240))):clockPos(R(2.2,9.8),pick(STREETS)[1]);tries++;}while(tries<60&&(d2(p,c.pos)<70||d2(p,c.pos)>240));
  J.pick=p;J.stage='pickup';
  J.pass=makeCharacter({});J.pass.g.position.copy(p);J.pass.g.rotation.y=Math.atan2(c.pos.x-p.x,c.pos.z-p.z);scene.add(J.pass.g);
  toast(`Fare ${J.fares+1} of 3: someone is waving at ${address(p.x,p.z)}.`);
}
function jobTarget(){
  const J=state.job;if(!J)return state.waypoint||null;const f=focusPos();
  switch(J.id){
    case 'ice':return J.dest;
    case 'shuttle':return J.stage==='pickup'?J.pick:J.dest.pos;
    case 'lamp':{let b=null,bd=1e9;for(const l of lamps)if(!l.lit){const d=d2(l.pos,f);if(d<bd){bd=d;b=l.pos;}}return b;}
    case 'moop':{let b=null,bd=1e9;for(const it of J.items){if(!it.visible)continue;const d=d2(it.position,f);if(d<bd){bd=d;b=it.position;}}return bd<60?b:J.center;}
    case 'race':return J.gates[J.k]?J.gates[J.k].position:null;
    case 'bike':return J.found?GIVERS.bike.pos:null;
    case 'rescue':return J.following?safeSpot():null;
  }
  return null;
}
function safeSpot(){const f=focusPos();return d2(f,CENTER)<d2(f,CAMP)?CENTER:CAMP;}
function jobText(J){
  switch(J.id){
    case 'ice':return `Deliver ice to ${J.addr}. ${fmtSec(J.timer)} before it melts.`;
    case 'shuttle':return J.stage==='pickup'?`Pick up the burner waving at ${address(J.pick.x,J.pick.z)}. Fare ${J.fares+1} of 3.`:`Take them to ${J.dest.name}. Slow to a crawl to let them off.`;
    case 'lamp':return `Light the lanterns on the 6:00 promenade. ${J.left} left.`;
    case 'moop':return `Pick up MOOP on the open playa: ${J.got} of 12. ${fmtSec(J.timer)} left.`;
    case 'race':return `Ride through gate ${J.k+1} of 10${P.vehicle&&P.vehicle.kind==='bike'?'':' (you need a bike)'}. ${fmtSec(J.timer)} left.`;
    case 'bike':return J.found?'Ride the bike back to Moonbeam at 9:00 & Esplanade.':'Search the circle on your map for a purple bike with fairy lights.';
    case 'rescue':return J.following?`${J.name} is right behind you. Lead them to ${safeSpot()===CENTER?'Center Camp':'your camp'}.`:'Search the circle on your map for the lost burner, then press E next to them.';
  }
  return '';
}
function endJob(ok,msg,karma){
  const J=state.job;if(!J)return;
  if(J.iceMesh&&J.iceMesh.parent)J.iceMesh.parent.remove(J.iceMesh);
  if(J.pass&&J.pass.g.parent)J.pass.g.parent.remove(J.pass.g);
  if(J.who&&J.who.g.parent){const w=J.who.g;setTimeout(()=>{if(w.parent)w.parent.remove(w);},8000);}
  if(J.items)for(const it of J.items)moopGroup.remove(it);
  if(J.gates)for(const g of J.gates)scene.remove(g);
  if(J.bike&&!ok){if(P.vehicle===J.bike)exitVehicle();scene.remove(J.bike.g);const i=vehicles.indexOf(J.bike);if(i>=0)vehicles.splice(i,1);}
  if(J.bike&&ok)J.bike.lost=false;
  if(J.id==='lamp'&&ok)state.lampDay=Math.floor((state.time-7)/24);
  state.job=null;
  if(ok){state.jobsDone[J.id]=(state.jobsDone[J.id]||0)+1;state.stats.jobs++;sfx.chime();}else sfx.fail();
  toast(msg);if(karma)addKarma(karma,JOB_INFO[J.id].title);
}
function updateJob(dt){
  const J=state.job;
  for(const k in GIVERS){const gv=GIVERS[k];const d=d2(gv.pos,focusPos());gv.c.g.visible=d<VIEW;gv.sprite.visible=giverOpen(gv)&&!(J&&J.id===gv.job);if(d<90)animPerson(gv.c,'idle',dt,0);}
  for(const it of moopGroup.children)it.rotation.y+=dt*2;
  if(state.waypoint&&d2(state.waypoint,focusPos())<15){state.waypoint=null;}
  if(!J)return;J.t+=dt;const f=focusPos();
  switch(J.id){
    case 'ice':J.timer-=dt;
      if(d2(f,J.dest)<10){endJob(true,'Ice delivered! The camp cheers and pours Phoenix a cold drink.',25);}
      else if(J.timer<=0)endJob(false,'The ice melted into a sad little puddle. The Ice Depot always has more.',0);
      else if(J.timer<20&&Math.floor(J.timer)!==Math.floor(J.timer+dt))sfx.tick();
      break;
    case 'shuttle':updateShuttle(J,dt);break;
    case 'lamp':{const h=state.time%24;if(h>20.6)endJob(false,'Too late, the Lamplighters finished the route without you.',5);break;}
    case 'moop':J.timer-=dt;
      for(const it of J.items){if(!it.visible)continue;if(d2(it.position,f)<(P.vehicle?P.vehicle.r+.8:1.7)){it.visible=false;J.got++;sfx.pick();if(!P.vehicle)oneShot(player,'PickUp',.6);}}
      if(J.got>=12)endJob(true,'The playa is clean again. The Earth Guardians give you a glitter-free high five.',30);
      else if(J.timer<=0)endJob(false,`The wind scattered the rest. You picked up ${J.got} of 12.`,J.got*2);
      break;
    case 'race':{J.timer-=dt;const g=J.gates[J.k];
      for(let i=0;i<J.gates.length;i++)J.gates[i].visible=i>=J.k&&i<J.k+3;
      if(g&&P.vehicle&&P.vehicle.kind==='bike'&&d2(P.vehicle.pos,g.position)<5.5){J.k++;sfx.chime();if(J.k>=J.gates.length){const bonus=Math.round(J.timer/3);endJob(true,`Finished the Dust Derby with ${fmtSec(J.timer)} to spare!`,35+bonus);stuntText('Derby champion',`${fmtSec(J.timer)} left on the clock`);}else floatText(`Gate ${J.k} of 10`);}
      else if(J.timer<=0)endJob(false,`Time! You made it through ${J.k} of 10 gates.`,J.k*2);
      else if(J.timer<10&&Math.floor(J.timer)!==Math.floor(J.timer+dt))sfx.tick();
      break;}
    case 'bike':
      if(!J.found&&P.vehicle===J.bike){J.found=true;sfx.chime();toast('Fairy lights! This is Moonbeam’s bike. Ride it back to 9:00 & Esplanade.');}
      if(J.found&&P.vehicle===J.bike&&d2(J.bike.pos,GIVERS.bike.pos)<8){exitVehicle();endJob(true,'Moonbeam squeals, hugs the bike, then hugs you.',30);}
      break;
    case 'rescue':{
      const w=J.who;const wp=w.g.position;const d=d2(wp,f);
      if(J.following){
        if(d>3){const sp=Math.min(8,(d-2.5)*2.2);wp.x+=(f.x-wp.x)/d*sp*dt;wp.z+=(f.z-wp.z)/d*sp*dt;collide(wp,.4);w.g.rotation.y=Math.atan2(f.x-wp.x,f.z-wp.z);animPerson(w,'walk',dt,sp);}
        else animPerson(w,'idle',dt,0);
        if(d>60){wp.set(f.x-2,0,f.z-2);}
        const s=safeSpot();if(d2(wp,s)<(s===CENTER?26:16))endJob(true,`${J.name} is safe and gets a hug from the Center Camp volunteers. "I owe you one, Phoenix."`,40);
      }else{animPerson(w,'sit',dt,0);if(state.dust<.05&&J.t>30)endJob(false,'The storm cleared and they found their own way home.',0);}
      break;}
  }
}
function updateShuttle(J,dt){
  const c=J.car;
  if(P.vehicle!==c){if(!J.warn){J.warn=15;toast('Get back on the art car within 15 seconds or the shuttle run ends.');}J.warn-=dt;if(J.warn<=0)endJob(false,'The shuttle run ended.',0);return;}
  J.warn=0;const mph=Math.abs(c.speed)*.6;
  if(J.stage==='pickup'){
    animPerson(J.pass,'dance',dt,0);
    if(d2(c.pos,J.pick)<11&&mph<3){
      scene.remove(J.pass.g);J.pass.g.position.set(1.3,c.deck,c.seat[2]-1.6);J.pass.g.rotation.y=0;c.g.add(J.pass.g);
      const opts=landmarks().filter(l=>d2(l.pos,c.pos)>110&&d2(l.pos,c.pos)<380);J.dest=opts.length?pick(opts):{name:'the Temple',pos:TEMPLE};J.stage='ride';J.rough=false;
      toast(`"Woo! Take me to ${J.dest.name}, please!"`);sfx.chime();
    }
  }else{
    animPerson(J.pass,'dance',dt,0);if(state.wanted>=1)J.rough=true;
    if(d2(c.pos,J.dest.pos)<20&&mph<3){
      c.g.remove(J.pass.g);const pg=J.pass.g;const side=new THREE.Vector3(Math.cos(c.heading),0,-Math.sin(c.heading)).multiplyScalar(c.r+1.5);pg.position.set(c.pos.x+side.x,0,c.pos.z+side.z);scene.add(pg);
      const passenger=J.pass;setTimeout(()=>{if(pg.parent)pg.parent.remove(pg);},7000);J.pass=null;void passenger;
      J.fares++;state.stats.fares++;addKarma(J.rough?12:17,J.rough?'fare':'smooth ride');
      if(J.fares>=3)endJob(true,'Shift complete. The art car crew salutes you with a flame cannon blast.',20);
      else newFare(J);
    }
  }
}
function updateLamps(){
  if(!lamps.length)return;const h=state.time%24;const lampJob=state.job&&state.job.id==='lamp';
  if(h>7&&h<16)for(const l of lamps)l.lit=false;
  const auto=(h>20.6||h<6.5)&&!lampJob;let dirty=false;const col=bulbs.geometry.attributes.color;
  for(const l of lamps){const on=l.lit||auto;if(on!==l.on){l.on=on;l.mat.emissiveIntensity=on?2.2:0;col.setXYZ(l.bi,on?l.c.r:0,on?l.c.g:0,on?l.c.b:0);dirty=true;}}
  if(dirty)col.needsUpdate=true;
}
function lightLamp(){
  const J=state.job;if(!J||J.id!=='lamp')return false;
  for(const l of lamps)if(!l.lit&&d2(l.pos,P.pos)<3.2){l.lit=true;J.left--;oneShot(player,'Interact',.8);sfx.chime();
    if(J.left<=0)endJob(true,'The promenade glows from the Man to Center Camp. The Lamplighters sing you a little song.',30);else floatText(`Lantern lit · ${J.left} to go`);return true;}
  return false;
}

// ================= sound camps, lasers, searchlights =================
const soundCamps=[];
function makeLasers(n,colors,len){
  const g=new THREE.Group();const geo=new THREE.CylinderGeometry(.045,.045,len,5,1,true);geo.rotateX(Math.PI/2);geo.translate(0,0,len/2);
  const beams=[];for(let i=0;i<n;i++){const m=new THREE.MeshBasicMaterial({color:new THREE.Color(colors[i%colors.length]).multiplyScalar(4),transparent:true,opacity:.55,blending:THREE.AdditiveBlending,depthWrite:false});const b=new THREE.Mesh(geo,m);b.frustumCulled=false;g.add(b);beams.push({b,ph:i/n*TAU,sp:R(.4,1.1)});}
  g.userData.beams=beams;g.visible=false;return g;
}
function updateLasers(g,t,on){g.visible=on;if(!on)return;for(const L of g.userData.beams){L.b.rotation.y=Math.sin(t*L.sp+L.ph)*1.1;L.b.rotation.x=-.15-Math.abs(Math.sin(t*L.sp*.7+L.ph*2))*.45;}}
function makeSearchlight(){const geo=new THREE.CylinderGeometry(.6,9,420,20,1,true);geo.translate(0,210,0);const m=new THREE.MeshBasicMaterial({color:new THREE.Color(0xbfd6ff).multiplyScalar(.9),transparent:true,opacity:.07,blending:THREE.AdditiveBlending,depthWrite:false,side:THREE.DoubleSide,fog:false});const b=new THREE.Mesh(geo,m);b.frustumCulled=false;b.visible=false;return b;}
function buildSoundCamps(){
  const defs=[
    {name:'Subsonic Dust',pos:clockPos(2.15,236),station:1,colors:[0x46f1ff,0x9b6bff,0x46f1ff],hours:[19,7]},
    {name:'Disco Oasis',pos:clockPos(9.85,236),station:3,colors:[0xff4fa8,0xffd23f,0xff6b35],hours:[19,7]},
    {name:'the Sunrise Bus',pos:clockPos(12.7,430),station:2,colors:[0xffb35a,0xff4fa8,0xb4ff39],hours:[22,9.5],bus:true},
  ];
  for(const d of defs){
    const rot=Math.atan2(-d.pos.x,-d.pos.z);const g=new THREE.Group();const obs=[];
    const blk=mat(0x18181b,{roughness:.6}),cone=mat(0x2a2a30,{roughness:.4,metalness:.3}),truss=mat(0x9a9ea3,{metalness:.8,roughness:.35});
    if(d.bus){
      g.add(M(G.box,mat(0xf1ece0,{roughness:.5}),3,3.2,12,0,2.1,-3),M(G.box,mat(0xc8463a,{roughness:.5}),3.02,.6,12.02,0,1.2,-3),M(G.box,mat(0x22262c,{roughness:.2}),3.04,1,10,0,2.9,-3.4));
      for(const z of[-7,1])for(const x of[-1.4,1.4]){const w=M(G.cyl,mat(0x161616),.6,.4,.6,x,.6,z);w.rotation.z=Math.PI/2;g.add(w);}
      g.add(M(G.box,mat(0x4a3b2e),3,.15,11,0,3.8,-3));obs.push([0,-6,2],[0,-1,2],[0,2,2]);
      for(const x of[-1,1])for(const yy of[4.6,5.9]){g.add(M(G.box,blk,1.1,1.2,1,x,yy,1.6));const c=M(G.cyl,cone,.35,.1,.35,x,yy,2.12);c.rotation.x=Math.PI/2;g.add(c);}
      g.add(M(G.box,neon(0xffb35a,.8),3.1,.08,.08,0,3.85,3));
    }else{
      g.add(M(G.box,mat(0x3a2f25),14,1,6,0,.5,-3));obs.push([-5,-3,3],[0,-3,3],[5,-3,3]);
      g.add(M(G.box,blk,3,1.2,1.1,0,1.6,-1.4),M(G.box,neon(d.colors[0],.8),3.02,.12,1.12,0,2.25,-1.4));
      for(const x of[-6.2,6.2]){for(let k=0;k<2;k++){const y=.8+k*1.7;g.add(M(G.box,blk,1.7,1.7,1.5,x,y,0));for(const cy of[-.38,.38]){const c=M(G.cyl,cone,.42,.12,.42,x,y+cy,.78);c.rotation.x=Math.PI/2;g.add(c);}}obs.push([x,0,1.2]);}
      for(const x of[-7,7])for(const z of[-5.5,1.2])g.add(M(G.box,truss,.3,7.5,.3,x,3.75,z));
      g.add(M(G.box,truss,14.3,.3,.3,0,7.5,1.2),M(G.box,truss,14.3,.3,.3,0,7.5,-5.5),M(G.box,truss,.3,.3,7,-7,7.5,-2.2),M(G.box,truss,.3,.3,7,7,7.5,-2.2));
      g.add(M(G.box,neon(d.colors[1],.9),14,.1,.1,0,7.2,1.35),M(G.box,neon(d.colors[2],.9),14,.1,.1,0,6.6,1.35));
    }
    place({g,obs},d.pos.x,d.pos.z,rot);
    const c=Object.assign({},d,{rot,dancers:[],on:false});
    const lz=new THREE.Vector3(0,d.bus?6.5:7.2,d.bus?1.6:-1).applyAxisAngle(new THREE.Vector3(0,1,0),rot).add(d.pos);
    c.lasers=makeLasers(d.bus?5:8,d.colors,140);c.lasers.position.copy(lz);c.lasers.rotation.y=rot;scene.add(c.lasers);
    c.search=makeSearchlight();c.search.position.copy(d.pos);scene.add(c.search);
    for(let i=0;i<(d.bus?14:20);i++){const p=makeCharacter({});const lx=R(-8,8),lzz=R(5,17);const w=new THREE.Vector3(lx,0,lzz).applyAxisAngle(new THREE.Vector3(0,1,0),rot).add(d.pos);p.g.position.copy(w);p.g.rotation.y=rot+Math.PI+R(-.4,.4);p.g.visible=false;scene.add(p.g);c.dancers.push(p);}
    const dj=makeCharacter({neon:d.colors[0]});dj.g.position.copy(new THREE.Vector3(0,d.bus?3.9:1,d.bus?-2:-2.4).applyAxisAngle(new THREE.Vector3(0,1,0),rot).add(d.pos));dj.g.rotation.y=rot;scene.add(dj.g);c.dj=dj;
    soundCamps.push(c);
  }
}
function campOn(c){const h=state.time%24;return c.hours[0]>c.hours[1]?(h>=c.hours[0]||h<c.hours[1]):(h>=c.hours[0]&&h<c.hours[1]);}
function updateSoundCamps(dt){
  const f=focusPos();const t=performance.now()*.001;
  for(const c of soundCamps){
    c.on=campOn(c);const d=d2(c.pos,f);
    updateLasers(c.lasers,t,c.on&&night>.4&&state.dust<.5&&d<600);
    c.search.visible=c.on&&night>.5&&state.dust<.4;if(c.search.visible){c.search.rotation.z=Math.sin(t*.23+c.rot)*.45;c.search.rotation.x=Math.cos(t*.17+c.rot)*.35;}
    const near=d<150;
    c.dj.g.visible=d<VIEW;if(near)animPerson(c.dj,c.on?'dance':'idle',dt,0);
    for(let i=0;i<c.dancers.length;i++){const p=c.dancers[i];const vis=(c.on||i<3)&&d<VIEW;p.g.visible=vis;if(vis&&near&&(i+frameNo)%2===0)animPerson(p,c.on?'dance':'sit',dt*2,0);}
    if(c.bus&&c.on&&d<45){const h=state.time%24,day=Math.floor((state.time-4)/24);if(h>5.3&&h<6.6&&state.sunriseDay!==day){state.sunriseDay=day;addKarma(20,'sunrise at the bus');toast('The sun breaks over the mountains while the Sunrise Bus plays its last track. Everyone hugs.');}}
  }
}

// ================= dust devils & dust puffs =================
const devils=[];
function buildDevils(){
  for(let k=0;k<3;k++){
    const N=600,pos=new Float32Array(N*3);for(let i=0;i<N;i++){const t=rnd(),a=rnd()*TAU,r=.4+t*t*7+R(-.3,.3);pos[i*3]=Math.cos(a)*r;pos[i*3+1]=t*38;pos[i*3+2]=Math.sin(a)*r;}
    const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.BufferAttribute(pos,3));
    const pts=new THREE.Points(geo,new THREE.PointsMaterial({color:0xcbb38c,size:1.3,map:glowMap,transparent:true,opacity:.45,depthWrite:false}));
    const g=new THREE.Group();g.add(pts);g.visible=false;scene.add(g);
    devils.push({g,pts,life:0,next:R(20,120),dir:R(0,TAU),hit:0});
  }
}
function updateDevils(dt){
  const h=state.time%24;const f=focusPos();
  for(const d of devils){
    if(d.life<=0){d.g.visible=false;d.next-=dt;if(d.next<=0&&h>10&&h<18&&state.dust<.2){const a=R(0,TAU),r=R(60,160);d.g.position.set(f.x+Math.cos(a)*r,0,f.z+Math.sin(a)*r);if(Math.hypot(d.g.position.x,d.g.position.z)<FENCE_IN-20){d.life=R(30,70);d.dir=R(0,TAU);d.g.visible=true;d.g.scale.setScalar(.1);}d.next=R(40,120);}continue;}
    d.life-=dt;const grow=Math.min(1,d.life/4,(70-d.life)/4+.2);d.g.scale.setScalar(clamp(grow,.1,1));
    d.dir+=R(-.6,.6)*dt;d.g.position.x+=Math.sin(d.dir)*5*dt;d.g.position.z+=Math.cos(d.dir)*5*dt;
    d.pts.rotation.y+=dt*4;d.g.rotation.z=Math.sin(performance.now()*.0013)*.08;
    if(d2(d.g.position,f)<6){d.hit+=dt;if(d.hit>.1&&d.hit<.15)toast('Caught in a dust devil! Spit out the playa and keep moving.');}
  }
}
const PUFF_N=500;const puffPos=new Float32Array(PUFF_N*3),puffA=new Float32Array(PUFF_N),puffS=new Float32Array(PUFF_N),puffLife=new Float32Array(PUFF_N),puffVel=new Float32Array(PUFF_N*3);let puffCursor=0,puffGeo,puffMat,puffTimer=0;
function initPuffs(){
  puffGeo=new THREE.BufferGeometry();puffGeo.setAttribute('position',new THREE.BufferAttribute(puffPos,3));puffGeo.setAttribute('alpha',new THREE.BufferAttribute(puffA,1));puffGeo.setAttribute('size',new THREE.BufferAttribute(puffS,1));
  puffMat=new THREE.ShaderMaterial({uniforms:{map:{value:glowMap},col:{value:new THREE.Color(0xcdb894)},scale:{value:600}},transparent:true,depthWrite:false,
    vertexShader:'attribute float alpha;attribute float size;uniform float scale;varying float vA;void main(){vA=alpha;vec4 mv=modelViewMatrix*vec4(position,1.);gl_PointSize=size*scale/max(.5,-mv.z);gl_Position=projectionMatrix*mv;}',
    fragmentShader:'uniform sampler2D map;uniform vec3 col;varying float vA;void main(){float a=texture2D(map,gl_PointCoord).a*vA;if(a<.01)discard;gl_FragColor=vec4(col,a);}'});
  const pts=new THREE.Points(puffGeo,puffMat);pts.frustumCulled=false;scene.add(pts);
}
function emitPuff(x,z,size,alpha){const i=puffCursor;puffCursor=(puffCursor+1)%PUFF_N;puffPos[i*3]=x+R(-.3,.3);puffPos[i*3+1]=.2;puffPos[i*3+2]=z+R(-.3,.3);puffVel[i*3]=R(-.4,.4)+.6;puffVel[i*3+1]=R(.2,.6);puffVel[i*3+2]=R(-.4,.4)+.2;puffLife[i]=1;puffS[i]=size;puffA[i]=alpha;}
function updatePuffs(dt){
  puffTimer-=dt;
  if(puffTimer<=0){puffTimer=.06;
    const v=P.vehicle;
    if(v&&Math.abs(v.speed)>2){const bx=-Math.sin(v.heading),bz=-Math.cos(v.heading);if(v.kind==='art'){for(const sx of[-1,1]){const px=Math.cos(v.heading)*sx*2.2,pz=-Math.sin(v.heading)*sx*2.2;emitPuff(v.pos.x+bx*4+px,v.pos.z+bz*4+pz,1.4+Math.abs(v.speed)*.08,.32);}}else emitPuff(v.pos.x+bx*.6,v.pos.z+bz*.6,.6+Math.abs(v.speed)*.04,.28);}
    else if(!v&&P.onGround&&Math.hypot(P.vel.x,P.vel.z)>5.5)emitPuff(P.pos.x,P.pos.z,.55,.22);
    for(const c of artCars)if(!c.driven&&c.speed>2&&d2(c.pos,focusPos())<80){const bx=-Math.sin(c.heading),bz=-Math.cos(c.heading);emitPuff(c.pos.x+bx*4,c.pos.z+bz*4,1.3,.22);}
    if(ranger.active&&ranger.speed>3){const bx=-Math.sin(ranger.heading),bz=-Math.cos(ranger.heading);emitPuff(ranger.pos.x+bx*2.5,ranger.pos.z+bz*2.5,1.6,.35);}
  }
  for(let i=0;i<PUFF_N;i++){if(puffLife[i]<=0){puffA[i]=0;continue;}puffLife[i]-=dt*.7;const l=Math.max(0,puffLife[i]);puffPos[i*3]+=puffVel[i*3]*dt;puffPos[i*3+1]+=puffVel[i*3+1]*dt;puffPos[i*3+2]+=puffVel[i*3+2]*dt;puffS[i]+=dt*1.6;puffA[i]*=l>0?Math.pow(.25,dt):0;}
  puffGeo.attributes.position.needsUpdate=true;puffGeo.attributes.alpha.needsUpdate=true;puffGeo.attributes.size.needsUpdate=true;
  puffMat.uniforms.col.value.setRGB(lerp(.1,.62,1-night),lerp(.09,.53,1-night),lerp(.09,.4,1-night));
  puffMat.uniforms.scale.value=renderer.domElement.height*.5/Math.tan(camera.fov*Math.PI/360);
}

// ================= touch controls =================
const touch={on:false,jx:0,jy:0,run:false,jump:false};
const isTouch=(('ontouchstart' in window)||navigator.maxTouchPoints>0)&&window.matchMedia&&window.matchMedia('(pointer: coarse)').matches;
if(isTouch){let hadSettings=false;try{hadSettings=!!localStorage.getItem(SETTINGS_KEY);}catch(_){}if(!hadSettings)settings.gfx='low';$('.fine').firstChild.nodeValue='Touch controls are on. Turn your phone sideways. ';}
function setupTouch(){
  if(touch.on)return;touch.on=true;document.body.classList.add('touch');$('#touchUI').hidden=false;
  const joy=$('#joy'),knob=$('#joyKnob');let jid=null,cx=0,cy=0;const R0=50;
  const move=t=>{let dx=t.clientX-cx,dy=t.clientY-cy;const l=Math.hypot(dx,dy);if(l>R0){dx*=R0/l;dy*=R0/l;}touch.jx=dx/R0;touch.jy=dy/R0;knob.style.transform=`translate(${dx}px,${dy}px)`;};
  joy.addEventListener('touchstart',e=>{e.preventDefault();const t=e.changedTouches[0];jid=t.identifier;const r=joy.getBoundingClientRect();cx=r.left+r.width/2;cy=r.top+r.height/2;move(t);},{passive:false});
  joy.addEventListener('touchmove',e=>{e.preventDefault();for(const t of e.changedTouches)if(t.identifier===jid)move(t);},{passive:false});
  const end=e=>{for(const t of e.changedTouches)if(t.identifier===jid){jid=null;touch.jx=touch.jy=0;knob.style.transform='';}};
  joy.addEventListener('touchend',end);joy.addEventListener('touchcancel',end);
  let lid=null,lx=0,ly=0;
  canvas.addEventListener('touchstart',e=>{const t=e.changedTouches[0];if(lid===null){lid=t.identifier;lx=t.clientX;ly=t.clientY;}},{passive:true});
  canvas.addEventListener('touchmove',e=>{e.preventDefault();for(const t of e.changedTouches)if(t.identifier===lid){if(P.ride&&P.ride.drop&&drop.active){const D=drop.active;D.stickX=clamp((D.stickX||0)+(t.clientX-lx)*.012*settings.sens,-1,1);D.stickY=clamp((D.stickY||0)+(t.clientY-ly)*.012*settings.sens*(settings.invert?-1:1),-1,1);lx=t.clientX;ly=t.clientY;continue;}camYaw-=(t.clientX-lx)*.007*settings.sens;camPitch=clamp(camPitch+(t.clientY-ly)*.005*settings.sens*(settings.invert?-1:1),armed()?-.55:.02,1.25);lx=t.clientX;ly=t.clientY;lastLook=performance.now();}},{passive:false});
  const lend=e=>{for(const t of e.changedTouches)if(t.identifier===lid)lid=null;};canvas.addEventListener('touchend',lend);canvas.addEventListener('touchcancel',lend);
  for(const b of document.querySelectorAll('#touchUI [data-k]')){
    b.addEventListener('touchstart',e=>{e.preventDefault();const k=b.dataset.k;if(k==='Run'){touch.run=!touch.run;b.classList.toggle('on',touch.run);return;}if(k==='Space'){touch.jump=true;return;}if(k==='Fire'){mouse.l=true;W.trigger=true;return;}if(k==='Aim'){mouse.r=!mouse.r;b.classList.toggle('on',mouse.r);return;}if(k==='Swap'){cycleWeapon(1);return;}handleKey(k);},{passive:false});
    if(b.dataset.k==='Fire'){const up=()=>{mouse.l=false;};b.addEventListener('touchend',up);b.addEventListener('touchcancel',up);}
    b.addEventListener('click',()=>{const k=b.dataset.k;if(k!=='Run'&&k!=='Space'&&k!=='Fire'&&k!=='Aim'&&k!=='Swap')handleKey(k);});
  }
  if(window.innerHeight>window.innerWidth)setTimeout(()=>toast('Turn your phone sideways for the best view.'),1500);
}
function updateTouchUI(){if(!touch.on)return;for(const b of document.querySelectorAll('#touchUI .gun'))b.hidden=!armed();const art=!!(P.vehicle&&P.vehicle.kind==='art');for(const b of document.querySelectorAll('#touchUI .art'))b.hidden=!art;$('#tRun').hidden=art;}

// ================= burner chatter =================
const LINES=['Happy burn!','Welcome home!','Nice wings!','Want a hug?','Hydrate!','Love your hat!','Seen my camp?','Dust is love','Free pickles at 4:30!','Best week ever','Is it Tuesday?','Phoenix! Woo!','Sunscreen?','Ride safe!','Radical inclusion!','Got a light?'];
const bubbles=[];let chatTimer=4;
function makeBubble(text){const c=document.createElement('canvas');c.width=512;c.height=128;const g=c.getContext('2d');g.font='700 44px Rubik, system-ui, sans-serif';const w=Math.min(500,g.measureText(text).width+48);g.fillStyle='rgba(20,15,11,.82)';const x=(512-w)/2;g.beginPath();g.roundRect?g.roundRect(x,14,w,84,24):g.rect(x,14,w,84);g.fill();g.beginPath();g.moveTo(246,96);g.lineTo(266,96);g.lineTo(256,118);g.fill();g.fillStyle='#eadcc0';g.textAlign='center';g.textBaseline='middle';g.fillText(text,256,58);const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;const sp=new THREE.Sprite(new THREE.SpriteMaterial({map:t,depthWrite:false,transparent:true}));sp.scale.set(3.2,.8,1);sp.position.y=2.9;return sp;}
function updateChatter(dt){
  chatTimer-=dt;
  for(let i=bubbles.length-1;i>=0;i--){const b=bubbles[i];b.life-=dt;b.sp.material.opacity=Math.min(1,b.life*2);if(b.life<=0){b.sp.parent&&b.sp.parent.remove(b.sp);if(b.holder)scene.remove(b.holder);b.sp.material.map.dispose();b.sp.material.dispose();bubbles.splice(i,1);}}
  if(chatTimer>0||P.vehicle&&P.vehicle.kind==='art')return;chatTimer=R(3.5,7);
  const f=focusPos();const cands=npcs.filter(n=>n.p.g.visible&&!n.wants&&d2(n.pos,f)<9&&d2(n.pos,f)>1.5&&!bubbles.some(b=>b.n===n));
  if(!cands.length)return;const n=pick(cands);const sp=makeBubble(state.outfit!=='phoenix'&&rnd()<.3?'Love the outfit!':pick(LINES));n.p.g.add(sp);bubbles.push({sp,n,life:2.8});
}

// ================= obstacle grid (fast collision) =================
const OG=new Map(),OGS=10;let ogReady=false;
const ogKey=(ix,iz)=>(ix+500)*1000+(iz+500);
function buildObstacleGrid(){
  OG.clear();
  for(const o of obstacles){const m=o.r+5;const x0=Math.floor((o.x-m)/OGS),x1=Math.floor((o.x+m)/OGS),z0=Math.floor((o.z-m)/OGS),z1=Math.floor((o.z+m)/OGS);
    for(let ix=x0;ix<=x1;ix++)for(let iz=z0;iz<=z1;iz++){const k=ogKey(ix,iz);let l=OG.get(k);if(!l){l=[];OG.set(k,l);}l.push(o);}}
  ogReady=true;
}
function obstaclesNear(x,z){return OG.get(ogKey(Math.floor(x/OGS),Math.floor(z/OGS)))||EMPTY;}
const EMPTY=[];

// ================= ramps & ground height =================
const ramps=[];
function addRamp(x,z,rot,len,h,w,parent){
  const sh=new THREE.Shape();sh.moveTo(0,0);sh.lineTo(len,0);sh.lineTo(len,h);for(let i=12;i>=0;i--){const u=i/12*len;sh.lineTo(u,h*Math.pow(u/len,1.25));}
  const geo=new THREE.ExtrudeGeometry(sh,{depth:w,bevelEnabled:false,curveSegments:2});geo.rotateY(-Math.PI/2);geo.translate(w/2,0,0);
  const g=new THREE.Group();g.add(new THREE.Mesh(geo,mat(0xc49a63,{roughness:.75})));
  g.add(M(G.box,neon(pick([0xff4fa8,0x46f1ff,0xffd23f,0xb4ff39]),.9),w,.08,.08,0,h+.02,len-.04));
  for(const sx of[-1,1])g.add(M(G.box,mat(0x7a5532),.12,h*.98,.12,sx*(w/2-.06),h/2,len-.06));
  const stripe=M(G.box,mat(0xf2efe8,{roughness:.6}),.25,.02,len*.9,0,0,len*.5);stripe.visible=false;g.add(stripe);
  place({g,obs:[]},x,z,rot,parent);
  ramps.push({x,z,rot,len,h,w,s:Math.sin(rot),c:Math.cos(rot),cx:x+Math.sin(rot)*len/2,cz:z+Math.cos(rot)*len/2,rad:Math.hypot(len/2,w/2)+.5});
  // art cars, rangers and the crowd treat ramps as solid
  for(let u=len*.25;u<len;u+=Math.max(1.2,len/6))obstacles.push({x:x+Math.sin(rot)*u,z:z+Math.cos(rot)*u,r:w/2*.9,ramp:true});
}
function groundHeight(x,z){
  let best=0;
  {const d=Math.max(Math.abs(x),Math.abs(z));if(d<12.05)best=d<=7.4?10:10*(12.05-d)/4.65;}
  for(let i=0;i<ramps.length;i++){const r=ramps[i];const dx=x-r.cx,dz=z-r.cz;if(dx*dx+dz*dz>r.rad*r.rad)continue;
    const ex=x-r.x,ez=z-r.z;const u=ex*r.s+ez*r.c,v=ex*r.c-ez*r.s;
    if(u>=0&&u<=r.len&&Math.abs(v)<=r.w/2){const h=r.h*Math.pow(u/r.len,1.25);if(h>best)best=h;}}
  return best;
}
function buildRamps(){
  // Gravity Optional bike park on the inner playa at 4:30
  const park=clockPos(4.5,170);const face=Math.atan2(-park.x,-park.z);
  const at=(fx,fz)=>({x:park.x+Math.sin(face)*fz+Math.cos(face)*fx,z:park.z+Math.cos(face)*fz-Math.sin(face)*fx});
  let p=at(0,-30);addRamp(p.x,p.z,face,16,5.5,5);
  p=at(0,14);addRamp(p.x,p.z,face+Math.PI,12,3.2,5);
  for(const [fx,fz,r] of [[-18,-8,.5],[18,-8,-.5],[-14,24,2.6],[14,24,-2.6]]){p=at(fx,fz);addRamp(p.x,p.z,face+r,5,1.4,2.8);}
  for(const [fx,fz,r] of [[-26,8,1.57],[26,8,-1.57]]){p=at(fx,fz);addRamp(p.x,p.z,face+r,8,2.6,3.6);}
  parkPos.copy(park);
  for(let k=0;k<4;k++){const a=k*Math.PI/2;addRamp(Math.sin(a)*27.6,Math.cos(a)*27.6,a+Math.PI,20.3,10,5.5);}
  for(const pt of portals){const side=rnd()<.5?1:-1;const rx=pt.x-pt.s*side*16,rz=pt.z-pt.c*side*16;addRamp(rx,rz,pt.rot+(side<0?Math.PI:0),6,2.2,3.2);}
  // kickers scattered across the open playa and the Esplanade
  let n=0,tries=0;
  while(n<30&&tries<400){tries++;const esp=rnd()<.35;const h=esp?R(2.2,9.8):R(0,12);const r=esp?R(244,252):R(50,235);const q=clockPos(h,r);
    if(d2(q,park)<55||Math.hypot(q.x,q.z)<30||d2(q,TEMPLE)<35||artSpots.some(a=>d2(a,q)<14)||soundCamps.some(c=>d2(c.pos,q)<35))continue;
    const rot=esp?(-h/12*TAU+Math.PI/2*(rnd()<.5?1:-1)):R(0,TAU);const big=rnd()<.3;addRamp(q.x,q.z,rot,big?7:4.5,big?2.4:1.2,big?3.4:2.6);n++;}
}
const parkPos=new THREE.Vector3();

// ================= stunts =================
const wrapA=a=>((a+Math.PI)%TAU+TAU)%TAU-Math.PI;
let stuntTimer=0;
function stuntText(big,small){const el=$('#stunt');$('#stuntBig').textContent=big;$('#stuntSmall').textContent=small;el.classList.add('on');clearTimeout(stuntTimer);stuntTimer=setTimeout(()=>el.classList.remove('on'),2200);}
function bikePhysics(v,dt,thr,steer,boost,jump){
  if(v.air===undefined){v.air=false;v.vy=0;v.pitch=0;v.flip=0;v.spin=0;v.moveDir=v.heading;v.airT=0;v.lastSlope=0;v.crashed=0;v.g.rotation.order='YXZ';}
  if(v.crashed>0){v.crashed-=dt;v.speed*=Math.pow(.05,dt);v.pos.x+=Math.sin(v.moveDir)*v.speed*dt;v.pos.z+=Math.cos(v.moveDir)*v.speed*dt;collide(v.pos,.6);
    if(v.crashed<=0){v.g.rotation.z=0;v.pitch=0;}return;}
  const max=boost?v.boostMax:v.max;
  if(!v.air){
    if(thr>0)v.speed=v.speed<max?Math.min(max,v.speed+v.acc*(boost?1.6:1)*dt*thr):lerp(v.speed,max,dt*1.5);
    else if(thr<0)v.speed=Math.max(-v.max*.4,v.speed+v.acc*1.6*dt*thr);
    else v.speed*=Math.pow(.45,dt);
    v.heading+=steer*v.turn*dt*clamp(v.speed/3,-1,1);v.moveDir=v.heading;
    if(jump&&Math.abs(v.speed)>1){v.air=true;v.vy=5.2+Math.max(0,v.lastSlope)*v.speed;v.airT=0;v.flip=0;v.spin=0;v.flipArm=v.spinArm=false;sfx.hop();}
  }else{
    if(Math.abs(thr)<.2)v.flipArm=true;if(Math.abs(steer)<.2)v.spinArm=true;
    if(v.spinArm){v.spin+=steer*5.2*dt;v.heading+=steer*5.2*dt;}if(v.flipArm)v.flip+=thr*6.2*dt;v.airT+=dt;
  }
  const ox=v.pos.x,oz=v.pos.z;
  v.pos.x+=Math.sin(v.moveDir)*v.speed*dt;v.pos.z+=Math.cos(v.moveDir)*v.speed*dt;
  let gh=groundHeight(v.pos.x,v.pos.z);
  if(!v.air&&gh-v.pos.y>.6){v.pos.x=ox;v.pos.z=oz;v.speed*=-.25;gh=groundHeight(ox,oz);sfx.thud();}
  const hit=collide(v.pos,v.r*.8,true);if(hit){v.speed*=.5;if(hit==='fence')fenceMsg();}
  if(!v.air){
    const bx=v.pos.x-Math.sin(v.moveDir)*.7,bz=v.pos.z-Math.cos(v.moveDir)*.7;const slope=(gh-groundHeight(bx,bz))/.7;
    if(gh<v.pos.y-.15&&v.speed>3){v.air=true;v.vy=Math.max(0,v.lastSlope)*v.speed*1.05+.8;v.airT=0;v.flip=0;v.spin=0;v.flipArm=v.spinArm=false;}
    else{v.pos.y=gh;v.lastSlope=lerp(v.lastSlope,slope,Math.min(1,dt*20));v.pitch=lerp(v.pitch,Math.atan(slope),Math.min(1,dt*14));}
  }
  if(v.air){
    v.vy-=15*dt;v.pos.y+=v.vy*dt;v.pitch=lerp(v.pitch,Math.atan2(v.vy,Math.max(4,v.speed))*.6,dt*3);
    if(v.pos.y<=gh&&v.vy<0)landBike(v,gh);
  }
  if(v.air)for(const pt of portals){const ex=v.pos.x-pt.x,ez=v.pos.z-pt.z;if(ex*ex+ez*ez>400)continue;const nz=ex*pt.s+ez*pt.c,lx=ex*pt.c-ez*pt.s;const side=nz>0;if(pt.side!==undefined&&pt.side!==side&&Math.hypot(lx,v.pos.y+.8-7.6)<6.4&&v.pos.y>1.6){v.portal=true;}pt.side=side;}
  v.g.rotation.x=-v.pitch+v.flip;v.g.rotation.y=v.heading;
  if(!v.air)v.g.rotation.z=lerp(v.g.rotation.z,-steer*clamp(v.speed/10,0,1)*.25,dt*6);
}
function landBike(v,gh){
  v.pos.y=gh;v.air=false;v.vy=0;const fsign=Math.sign(v.flip);
  const fl=Math.abs(wrapA(v.flip)),sp=Math.abs(wrapA(v.heading-v.moveDir));
  const flips=Math.round(Math.abs(v.flip)/TAU),halfSpins=Math.round(Math.abs(v.spin)/Math.PI);
  if(fl>.8||(sp>1.1&&sp<2.2)){crashBike(v);return;}
  if(sp>=2.2){v.heading=wrapA(v.heading);v.moveDir=v.heading;v.speed*=.6;}else{v.heading=v.moveDir+wrapA(v.heading-v.moveDir)*.3;}
  v.flip=0;v.spin=0;v.pitch=0;
  const names=[];if(v.portal){names.push('Portal jump');}if(v.lipBounce){names.push('Lip launch');v.lipBounce=false;}
  if(flips)names.push((flips>1?flips+'x ':'')+(fsign>0?'Frontflip':'Backflip'));
  if(halfSpins>=2)names.push(halfSpins*180+'');else if(halfSpins===1)names.push('180');
  const air=v.airT;
  const pts=Math.round(air*3)+flips*12+Math.floor(halfSpins/2)*6+(halfSpins%2)*2+(v.portal?15:0);v.portal=false;
  if(air>.9||names.length){
    const title=names.length?names.join(' + '):air>1.6?'Huge air':'Big air';
    stuntText(flips>=2||halfSpins>=4?'Insane stunt bonus':'Stunt bonus',`${title} · ${air.toFixed(1)}s in the air`);
    addKarma(Math.max(2,pts),'stunt');state.stats.stunts=(state.stats.stunts||0)+1;
    for(let i=0;i<crowdN;i++){const dx=cX[i]-v.pos.x,dz=cZ[i]-v.pos.z;if(dx*dx+dz*dz<400)crowdCheer(i,3);}
    sfx.chime();
  }else sfx.thud();
  for(let i=0;i<10;i++)emitPuff(v.pos.x+R(-1,1),v.pos.z+R(-1,1),1,.35);
}
function crashBike(v){
  v.portal=false;v.crashed=2.4;v.flip=0;v.spin=0;v.pitch=0;v.g.rotation.x=0;v.g.rotation.z=1.45;v.speed*=.35;v.moveDir=v.heading;
  oneShot(player,'Lie_Idle',2.3);sfx.crash();
  toast(pick(['Wipeout! The playa is soft. Mostly.','Faceplant. A passerby gives it a 7 out of 10.','Crash! Your goggles survived. Your dignity did not.','Bailed! Somebody yells "Do it again!"']));
  for(let i=0;i<14;i++)emitPuff(v.pos.x+R(-1.5,1.5),v.pos.z+R(-1.5,1.5),1.4,.4);
}

// ================= instanced crowd =================
const CROWD_MAX=1500;let crowdN=0,crowdMesh=null,crowdUni=null;
const cX=new Float32Array(CROWD_MAX),cZ=new Float32Array(CROWD_MAX),cH=new Float32Array(CROWD_MAX),cTX=new Float32Array(CROWD_MAX),cTZ=new Float32Array(CROWD_MAX),cSp=new Float32Array(CROWD_MAX),cWait=new Float32Array(CROWD_MAX),cMode=new Uint8Array(CROWD_MAX),cKind=new Uint8Array(CROWD_MAX),cCheer=new Float32Array(CROWD_MAX),cFived=new Uint8Array(CROWD_MAX),cScale=new Float32Array(CROWD_MAX);
let cAnim=null;
function crowdGeometry(headT,hatT){
  const HEADP=[5,10,11,12,13],HATP=[6,7,8,9,14,15,16,-1];const keepHead=HEADP[headT],keepHat=headT===0?HATP[hatT]:-99,keepMask=headT===0;
  const parts=[];const m4=new THREE.Matrix4(),q=new THREE.Quaternion(),e=new THREE.Euler(),v=new THREE.Vector3(),sc=new THREE.Vector3();
  const add=(geo,part,pcol,px,py,pz,rx,ry,rz,sx,sy,sz)=>{e.set(rx||0,ry||0,rz||0);q.setFromEuler(e);m4.compose(v.set(px,py,pz),q,sc.set(sx||1,sy||1,sz||1));if(part===17){if(!keepMask)return;}else if(((part===5||(part>=10&&part<=13))&&part!==keepHead)||(((part>=6&&part<=9)||part>=14)&&part!==keepHat))return;const g=geo.clone();g.applyMatrix4(m4);parts.push({g,part,pcol});};
  const sph=new THREE.SphereGeometry(1,9,7),cyl=new THREE.CylinderGeometry(1,1,1,10),box=new THREE.BoxGeometry(1,1,1),cone=new THREE.ConeGeometry(1,1,8),tor=new THREE.TorusGeometry(1,.12,4,14);
  // body
  add(cyl,0,1,0,.93,0,0,0,0,.27,.52,.24);add(cyl,0,3,0,.64,0,0,0,0,.25,.16,.22);add(tor,0,4,0,.72,0,Math.PI/2,0,0,.27,.27,.27);
  for(const s of[-1,1]){const lp=s<0?1:2;add(box,lp,2,s*.11,.34,0,0,0,0,.13,.56,.15);add(box,lp,3,s*.11,.04,.03,0,0,0,.15,.08,.22);
    const ap=s<0?3:4;add(box,ap,1,s*.34,.95,0,0,0,0,.1,.46,.1);add(sph,ap,0,s*.34,.69,0,0,0,0,.07,.07,.07);}
  // head variants: 5 normal, 10 eyeball, 11 melting clock, 12 fish, 13 lobster
  add(sph,5,0,0,1.47,0,0,0,0,.3,.3,.3);for(const s of[-1,1])add(sph,5,3,s*.1,1.5,.27,0,0,0,.045,.045,.03);add(box,5,3,0,1.52,.24,0,0,0,.42,.08,.1);
  add(sph,10,5,0,1.5,0,0,0,0,.36,.36,.36);add(cyl,10,6,0,1.52,.33,Math.PI/2,0,0,.15,.03,.15);add(cyl,10,3,0,1.52,.355,Math.PI/2,0,0,.075,.02,.075);
  add(cyl,11,7,0,1.52,0,Math.PI/2,0,0,.4,.1,.4);add(cyl,11,8,0,1.52,.02,Math.PI/2,0,0,.34,.11,.34);add(box,11,3,0,1.6,.08,0,0,0,.03,.2,.02);add(box,11,3,.07,1.52,.08,0,0,.9,.03,.15,.02);
  add(sph,12,10,0,1.5,.05,0,0,0,.28,.32,.48);add(cone,12,10,0,1.62,-.42,-.6,0,0,.18,.3,.06);for(const s of[-1,1])add(sph,12,5,s*.2,1.56,.22,0,0,0,.08,.08,.08);
  add(sph,13,9,0,1.5,.04,0,0,0,.26,.3,.44);for(const s of[-1,1]){add(cyl,13,9,s*.1,1.85,.15,-.5,0,s*.3,.012,.6,.012);add(cone,13,9,s*.45,1.2,.25,Math.PI/2,0,s*.4,.12,.32,.08);}
  // hats (only with the normal head): 6 wizard, 7 cowboy, 8 fur, 9 top hat, 14 horns, 15 Dalí mustache, 16 flower crown
  add(cone,6,2,0,1.95,0,0,0,0,.3,.62,.3);add(cyl,6,2,0,1.68,0,0,0,0,.42,.03,.42);
  add(cyl,7,2,0,1.7,0,0,0,0,.46,.03,.46);add(cyl,7,2,0,1.82,0,0,0,0,.2,.22,.24);
  add(sph,8,2,0,1.72,0,0,0,0,.36,.28,.36);
  add(cyl,9,3,0,1.92,0,0,0,0,.2,.42,.2);add(cyl,9,3,0,1.72,0,0,0,0,.32,.03,.32);
  for(const s of[-1,1])add(cone,14,8,s*.2,1.78,0,0,0,-s*.6,.06,.34,.06);
  for(const s of[-1,1]){add(cone,15,3,s*.17,1.42,.3,0,0,-s*1.25,.035,.32,.035);add(cone,15,3,s*.33,1.56,.3,0,0,-s*.2,.02,.2,.02);}
  for(let i=0;i<7;i++){const a=i/7*TAU;add(sph,16,4,Math.cos(a)*.27,1.7,Math.sin(a)*.27,0,0,0,.07,.07,.07);}
  add(new THREE.PlaneGeometry(.64,.7,6,6),17,1,0,1.47,.33,0,0,0,1,1,1);
  // merge
  let nv=0,ni=0;for(const p of parts){nv+=p.g.attributes.position.count;ni+=p.g.index?p.g.index.count:p.g.attributes.position.count;}
  const pos=new Float32Array(nv*3),nor=new Float32Array(nv*3),part=new Float32Array(nv),pcol=new Float32Array(nv),muv=new Float32Array(nv*2),idx=new Uint32Array(ni);let vo=0,io=0;
  for(const p of parts){const g=p.g,pa=g.attributes.position,na=g.attributes.normal;
    for(let i=0;i<pa.count;i++){let x=pa.getX(i),y=pa.getY(i),z=pa.getZ(i);
      if(p.part===11&&y<1.5){const d=1.5-y;y-=d*d*1.6;z+=d*.15;} // melt the clock face downward
      if(p.part===17){z-=x*x*1.1;const ua=g.attributes.uv;muv[(vo+i)*2]=ua.getX(i);muv[(vo+i)*2+1]=ua.getY(i);}
      pos[(vo+i)*3]=x;pos[(vo+i)*3+1]=y;pos[(vo+i)*3+2]=z;nor[(vo+i)*3]=na.getX(i);nor[(vo+i)*3+1]=na.getY(i);nor[(vo+i)*3+2]=na.getZ(i);part[vo+i]=p.part;pcol[vo+i]=p.pcol;}
    if(g.index)for(let j=0;j<g.index.count;j++)idx[io++]=g.index.getX(j)+vo;else for(let j=0;j<pa.count;j++)idx[io++]=j+vo;
    vo+=pa.count;}
  const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.BufferAttribute(pos,3));geo.setAttribute('normal',new THREE.BufferAttribute(nor,3));
  const ppA=new Float32Array(nv*2);for(let i=0;i<nv;i++){ppA[i*2]=part[i];ppA[i*2+1]=pcol[i];}geo.setAttribute('pp',new THREE.BufferAttribute(ppA,2));geo.setAttribute('muv',new THREE.BufferAttribute(muv,2));geo.setIndex(new THREE.BufferAttribute(idx,1));
  return geo;
}
const CROWD_VS_DECL=`attribute vec2 pp;attribute vec2 muv;attribute vec2 aMP;attribute vec4 aAnim;attribute vec2 aType;attribute vec3 aSkin;attribute vec3 aBody;attribute vec3 aAccent;attribute vec3 aGlow;uniform float uTime;`;
const CROWD_PAT=`
vec3 crowdPat(vec3 base,vec3 acc,vec3 o,float id){
  if(id<1.5){float a=atan(o.x,o.z);float s=sin(a*3.+o.y*22.+sin(o.y*9.+a*2.)*2.5);return s>.35?vec3(.95,.72,.08):s>-.3?vec3(.04,.12,.5):vec3(.25,.45,.8);}
  if(id<2.5){vec3 q=floor(o*vec3(22.,26.,22.));float h=fract(sin(dot(q,vec3(12.9,78.2,37.7)))*43758.5);return h<.25?vec3(.62,.48,.75):h<.5?vec3(.45,.65,.45):h<.75?vec3(.92,.55,.6):vec3(.48,.66,.88);}
  if(id<3.5){float a=atan(o.x,o.z)*1.6;float v=o.y*7.;float d=mod(floor(a+v)+floor(a-v),2.);return d>.5?base:acc;}
  return fract(o.y*13.)<.5?vec3(.02,.04,.18):vec3(.88);
}`;
const CROWD_VS_BODY=`
  float part=pp.x;float pcol=pp.y;float aMask=aMP.x;float aPat=aMP.y;
  vec3 p=position;float ph=uTime*aAnim.z+aAnim.x;float s=sin(ph);float md=aAnim.y;
  float headPart=aType.y<.5?5.:aType.y<1.5?10.:aType.y<2.5?11.:aType.y<3.5?12.:13.;
  float hatPart=aType.x<.5?6.:aType.x<1.5?7.:aType.x<2.5?8.:aType.x<3.5?9.:aType.x<4.5?14.:aType.x<5.5?15.:aType.x<6.5?16.:-1.;
  bool isHead=part>4.5&&part<5.5||(part>9.5&&part<13.5);bool isHat=(part>5.5&&part<9.5)||part>13.5;
  if((isHead&&abs(part-headPart)>.1)||(isHat&&part<16.5&&(abs(part-hatPart)>.1||aType.y>.5))||(part>16.5&&aMask<0.))p=vec3(0.,-20.,0.);
  else{
    if(part>.5&&part<2.5){float sd=part<1.5?1.:-1.;float a=md<.5?s*.65*sd:md<1.5?s*.25*sd:md>2.5?-1.45:0.;vec3 q=p-vec3(0.,.62,0.);p=vec3(q.x,q.y*cos(a)-q.z*sin(a),q.y*sin(a)+q.z*cos(a))+vec3(0.,.62,0.);}
    if(part>2.5&&part<4.5){float sd=part<3.5?-1.:1.;vec3 pv=vec3(sd*.34,1.18,0.);vec3 q=p-pv;
      if(md>.5&&md<1.5){float a=sd*(2.35+.4*sin(ph*2.));q=vec3(q.x*cos(a)-q.y*sin(a),q.x*sin(a)+q.y*cos(a),q.z);}
      else{float a=md<.5?-s*.55*sd:md>2.5?-.6:sin(ph*.5)*.05;q=vec3(q.x,q.y*cos(a)-q.z*sin(a),q.y*sin(a)+q.z*cos(a));}
      p=q+pv;}
    p.y+=md<.5?abs(cos(ph))*.05:md<1.5?abs(s)*.13:md>2.5?-.42:0.;
  }
  vec3 transformed=p;`;
function patchCrowdShader(shader,isDepth){
  fxUniforms(shader);
  shader.uniforms.uTime=crowdUni.uTime;shader.uniforms.uGlow=crowdUni.uGlow;
  shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\n'+CROWD_VS_DECL+(isDepth?'':'varying vec3 vCC;varying float vGA;varying vec2 vMUv;varying float vMI;varying float vIsM;varying vec3 vObj;varying float vPat;varying float vBody;varying vec3 vAcc;'))
    .replace('#include <begin_vertex>',CROWD_VS_BODY+(isDepth?'':`
  vCC=pcol<.5?aSkin:pcol<1.5?aBody:pcol<2.5?aAccent:pcol<3.5?vec3(.03):pcol<4.5?aGlow:pcol<5.5?vec3(.85):pcol<6.5?vec3(.05,.2,.75):pcol<7.5?vec3(.75,.48,.08):pcol<8.5?vec3(.86,.8,.62):pcol<9.5?vec3(.7,.05,.02):vec3(.45,.55,.65);
  vGA=pcol>3.5&&pcol<4.5?1.:0.;vMUv=muv;vMI=aMask;vIsM=part>16.5?1.:0.;vObj=position;vPat=aPat;vBody=(pcol>.5&&pcol<1.5&&part<16.5)?1.:0.;vAcc=aAccent;`));
  if(!isDepth)shader.uniforms.uMaskAtlas={value:maskAtlas};
  if(!isDepth)shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying vec3 vCC;varying float vGA;uniform float uGlow;uniform sampler2D uMaskAtlas;varying vec2 vMUv;varying float vMI;varying float vIsM;varying vec3 vObj;varying float vPat;varying float vBody;varying vec3 vAcc;'+CROWD_PAT)
    .replace('vec4 diffuseColor = vec4( diffuse, opacity );','vec4 diffuseColor = vec4( vCC, opacity );float maskGlow=0.;if(vIsM>.5){vec4 mk=texture2D(uMaskAtlas,vec2((vMUv.x+mod(vMI,4.))/4.,(vMUv.y+(1.-floor(vMI/4.)))/2.));if(mk.a<.5)discard;diffuseColor.rgb=mk.rgb;maskGlow=step(.9,min(mk.r,min(mk.g,mk.b)));}else if(vBody>.5&&vPat>.5){diffuseColor.rgb=crowdPat(vCC,vAcc,vObj,vPat);}')
    .replace('#include <emissivemap_fragment>','#include <emissivemap_fragment>\ntotalEmissiveRadiance+=vCC*vGA*uGlow+diffuseColor.rgb*maskGlow*uGlow*.35;');
}
const SKIN_LIN=[0xffe0c8,0xf0c8a8,0xd9a982,0xb07a52,0x8a5a3a,0x6a432b].map(c=>new THREE.Color(c));
const COST_LIN=[0xff4fa8,0x46f1ff,0xffd23f,0x8a5cff,0xff6b35,0x2ee59d,0xf2efe8,0x2a2a30,0xd7263d,0xc0c4c8,0x9b5de5,0xf4a261,0x6b4f3a,0xffffff,0x1d58b8,0xe8c890].map(c=>new THREE.Color(c));
const GLOW_LIN=NEONS.map(c=>new THREE.Color(c));
const crowdMeshes=[];const cMesh=new Uint8Array(CROWD_MAX),cLocal=new Uint16Array(CROWD_MAX);
function buildCrowd(){
  crowdUni={uTime:{value:0},uGlow:{value:1}};
  const combos=[];for(let i=0;i<CROWD_MAX;i++){const r=rnd();const head=r<.07?1:r<.13?2:r<.17?3:r<.21?4:0;const hat=head?7:Math.min(7,Math.floor(rnd()*8.6));const key=head*10+hat;let c=combos.find(x=>x.key===key);if(!c){c={key,head,hat,members:[]};combos.push(c);}c.members.push(i);}
  const m=new THREE.MeshStandardMaterial({color:0xffffff,roughness:.72});m.onBeforeCompile=sh=>patchCrowdShader(sh,false);
  const dm=new THREE.MeshDepthMaterial({depthPacking:THREE.RGBADepthPacking});dm.onBeforeCompile=sh=>patchCrowdShader(sh,true);
  const ia=(arr,n)=>new THREE.InstancedBufferAttribute(arr,n);
  combos.forEach((c,mi)=>{
    const n=c.members.length;const geo=crowdGeometry(c.head,c.hat);
    const aMP=new Float32Array(n*2);const aAnim=new Float32Array(n*4),aType=new Float32Array(n*2),aSkin=new Float32Array(n*3),aBody=new Float32Array(n*3),aAcc=new Float32Array(n*3),aGlow=new Float32Array(n*3);
    c.members.forEach((i,li)=>{aType[li*2]=c.hat;aType[li*2+1]=c.head;pick(SKIN_LIN).toArray(aSkin,li*3);pick(COST_LIN).toArray(aBody,li*3);pick(COST_LIN).toArray(aAcc,li*3);pick(GLOW_LIN).toArray(aGlow,li*3);aMP[li*2]=c.head===0&&rnd()<.4?Math.floor(rnd()*MASK_N):-1;const pr=rnd();aMP[li*2+1]=pr<.14?4:pr<.24?3:pr<.37?1:pr<.48?2:0;aAnim[li*4]=rnd()*TAU;aAnim[li*4+1]=2;aAnim[li*4+2]=1.4;cMesh[i]=mi;cLocal[i]=li;cScale[i]=R(.88,1.12);});
    const an=ia(aAnim,4);an.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('aAnim',an);geo.setAttribute('aType',ia(aType,2));geo.setAttribute('aSkin',ia(aSkin,3));geo.setAttribute('aBody',ia(aBody,3));geo.setAttribute('aAccent',ia(aAcc,3));geo.setAttribute('aGlow',ia(aGlow,3));geo.setAttribute('aMP',ia(aMP,2));
    const im=new THREE.InstancedMesh(geo,m,n);im.customDepthMaterial=dm;im.castShadow=true;im.frustumCulled=false;im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);im.userData={anim:an,cap:n};
    scene.add(im);crowdMeshes.push(im);
  });
  crowdMesh=crowdMeshes[0];crowdN=CROWD_MAX;
  for(let i=0;i<CROWD_MAX;i++){const k=rnd();cKind[i]=k<.55?0:k<.8?1:2;const p=crowdSpot(i,true);cX[i]=p.x;cZ[i]=p.z;cH[i]=R(0,TAU);cTX[i]=p.x;cTZ[i]=p.z;cSp[i]=R(1,1.7);cWait[i]=R(0,8);cMode[i]=255;setCrowdMode(i,2);}
  setCrowdCount();
}
let crowdFrac=1;
function crowdActive(i){return cLocal[i]<crowdMeshes[cMesh[i]].count;}
function setCrowdCount(){if(!crowdMeshes.length)return;for(const im of crowdMeshes)im.castShadow=settings.gfx==='high';crowdFrac=settings.gfx==='low'?.3:settings.gfx==='medium'?.6:1;for(const im of crowdMeshes)im.count=Math.ceil(im.userData.cap*crowdFrac);}
function setCrowdMode(i,m){if(cMode[i]===m)return;cMode[i]=m;const an=crowdMeshes[cMesh[i]].userData.anim,o=cLocal[i]*4;an.array[o+1]=m;an.array[o+2]=m===0?2.2+cSp[i]*1.6:m===1?12.8:m===3?1:1.4;an.needsUpdate=true;}
function crowdCheer(i,t){cCheer[i]=Math.max(cCheer[i],t);cWait[i]=Math.max(cWait[i],t);setCrowdMode(i,1);}
const _cp=new THREE.Vector3();
function crowdSpot(i,init){
  const h=state.time%24,nightNow=h>19.5||h<6;const k=cKind[i];
  if(state.time>MB-.9&&state.time<MB+.6&&rnd()<.75){const a=R(0,TAU),r=R(36,85);return _cp.set(Math.cos(a)*r,0,Math.sin(a)*r);}
  if(state.time>TB-.4&&state.time<TB+.8&&rnd()<.6){const a=R(0,TAU),r=R(30,60);return _cp.set(TEMPLE.x+Math.cos(a)*r,0,TEMPLE.z+Math.sin(a)*r);}
  if(nightNow&&(k===2||rnd()<.25)&&soundCamps.length){const c=pick(soundCamps);const p=new THREE.Vector3(R(-12,12),0,R(4,24)).applyAxisAngle(_up,c.rot).add(c.pos);return _cp.copy(p);}
  if(k===1&&artSpots.length){const a=pick(artSpots);return _cp.set(a.x+R(-12,12),0,a.z+R(-12,12));}
  if(!init&&rnd()<.7){const h0=clockOf(cX[i],cZ[i]);const r0=Math.hypot(cX[i],cZ[i]);if(r0>240&&r0<460&&h0>1.9&&h0<10.1){const s=STREETS.reduce((a,b)=>Math.abs(b[1]-r0)<Math.abs(a[1]-r0)?b:a);return clockPos(clamp(h0+R(-.35,.35),2.05,9.95),s[1]+R(-3,3)).clone();}}
  if(rnd()<.12)return clockPos(R(5.6,6.4),R(262,310)).clone();
  return clockPos(R(2.05,9.95),pick(STREETS)[1]+R(-3,3)).clone();
}
const _up=new THREE.Vector3(0,1,0);
function updateCrowd(dt){
  if(!crowdMesh)return;crowdUni.uTime.value=performance.now()*.001;crowdUni.uGlow.value=.3+night*2.2;
  const f=focusPos();const n=crowdN;const nightNow=night>.5;let cnt=0;
  const pv=P.vehicle;const pr2=pv?(pv.r+1.2)*(pv.r+1.2):1.1;
  for(let i=0;i<n;i++){
    if(!crowdActive(i))continue;
    let x=cX[i],z=cZ[i];
    if(cCheer[i]>0){cCheer[i]-=dt;if(cCheer[i]<=0&&cMode[i]===1&&!(nightNow&&nearMusic(x,z)))setCrowdMode(i,2);}
    if(cWait[i]>0){cWait[i]-=dt;}
    else{
      const dx=cTX[i]-x,dz=cTZ[i]-z,d=Math.hypot(dx,dz);
      if(d<.8){const music=nightNow&&nearMusic(x,z);cWait[i]=music?R(20,70):R(3,16);setCrowdMode(i,music?1:rnd()<.18?3:2);const p=crowdSpot(i,false);cTX[i]=p.x;cTZ[i]=p.z;}
      else{if(cMode[i]!==0)setCrowdMode(i,0);const sp=cSp[i];x+=dx/d*sp*dt;z+=dz/d*sp*dt;cH[i]=lerpAngle(cH[i],Math.atan2(dx,dz),Math.min(1,dt*5));
        if((i+frameNo)%3===0){_cp.set(x,0,z);collide(_cp,.35);x=_cp.x;z=_cp.z;}}
    }
    const ddx=x-f.x,ddz=z-f.z,dd=ddx*ddx+ddz*ddz;if(dd<900)cnt++;
    if(dd<pr2&&dd>1e-4&&f.y<3){const l=Math.sqrt(dd),t=Math.sqrt(pr2);x=f.x+ddx/l*t;z=f.z+ddz/l*t;}
    cX[i]=x;cZ[i]=z;
    const el=crowdMeshes[cMesh[i]].instanceMatrix.array;const c=Math.cos(cH[i])*cScale[i],s=Math.sin(cH[i])*cScale[i],sc=cScale[i],o=cLocal[i]*16;
    el[o]=c;el[o+1]=0;el[o+2]=-s;el[o+3]=0;el[o+4]=0;el[o+5]=sc;el[o+6]=0;el[o+7]=0;el[o+8]=s;el[o+9]=0;el[o+10]=c;el[o+11]=0;el[o+12]=x;el[o+13]=0;el[o+14]=z;el[o+15]=1;
  }
  for(const im of crowdMeshes)im.instanceMatrix.needsUpdate=true;crowdNear=cnt;
}
let crowdNear=0;
function nearMusic(x,z){for(const c of soundCamps)if(c.on&&(x-c.pos.x)**2+(z-c.pos.z)**2<900)return true;for(const v of artCars)if(v.station>=0&&(x-v.pos.x)**2+(z-v.pos.z)**2<400)return true;return false;}
function nearestCrowd(x,z,max){let b=-1,bd=max*max;for(let i=0;i<crowdN;i++){if(!crowdActive(i))continue;const d=(cX[i]-x)**2+(cZ[i]-z)**2;if(d<bd){bd=d;b=i;}}return b;}
function crowdBurnGather(){ // when a burn starts, pull far-away burners to the ring so the crowd is huge
  const f=focusPos();const at=state.time<30?MAN:TEMPLE;
  for(let i=0;i<crowdN;i++){if(!crowdActive(i)||rnd()>.7)continue;const far=(cX[i]-f.x)**2+(cZ[i]-f.z)**2>140*140;const a=R(0,TAU),r=R(state.time<30?36:30,state.time<30?90:62);const tx=at.x+Math.cos(a)*r,tz=at.z+Math.sin(a)*r;
    if(far){cX[i]=tx+R(-3,3);cZ[i]=tz+R(-3,3);cH[i]=Math.atan2(at.x-cX[i],at.z-cZ[i]);cWait[i]=R(200,400);setCrowdMode(i,state.time<30?1:2);}else{cTX[i]=tx;cTZ[i]=tz;cWait[i]=0;}}
}
let lastGather=-1;
function crowdEvents(){const t=state.time;const k=t>MB-.85&&t<MB+.5?1:t>TB-.4&&t<TB+.8?2:0;if(k&&lastGather!==k){lastGather=k;crowdBurnGather();}if(!k)lastGather=0;}
function highFive(){
  const i=nearestCrowd(P.pos.x,P.pos.z,2.4);if(i<0)return false;
  cH[i]=Math.atan2(P.pos.x-cX[i],P.pos.z-cZ[i]);crowdCheer(i,3);oneShot(player,'Interact',.7);P.heading=Math.atan2(cX[i]-P.pos.x,cZ[i]-P.pos.z);player.g.rotation.y=P.heading;
  sfx.clap();
  if(!cFived[i]){cFived[i]=1;state.stats.fives=(state.stats.fives||0)+1;addKarma(2,'high five');}
  const holder=new THREE.Object3D();holder.position.set(cX[i],0,cZ[i]);scene.add(holder);const sp=makeBubble(pick(['Up high!','Yesss!','Woo!','Happy burn!','Dust buddies!','Nice wings!','Hug?','Phoenix!!']));holder.add(sp);bubbles.push({sp,n:null,life:2.4,holder});
  return true;
}
function danceParty(){
  if(P.vehicle)return;P.dancing=!P.dancing;P.sitting=false;
  if(P.dancing){toast('Phoenix busts out a move. Burners nearby join in.');for(let i=0;i<crowdN;i++){if(crowdActive(i)&&(cX[i]-P.pos.x)**2+(cZ[i]-P.pos.z)**2<196)crowdCheer(i,R(5,9));}for(const n of npcs)if(d2(n.pos,P.pos)<14)n.happy=6;}
}

// ================= the Dream: Dalí's playa =================
let D=null;
const dali={all:[],elephants:[],giraffes:[],eyes:[],spirits:[],walkers:[],clocks:[],lips:[],phone:null,venus:null,dyn:[]};
const dynObs=[];
async function loadDali(){try{D=await import('./dali.js');D.initDali({neon,mat,glowMap});}catch(e){console.warn('Dali module failed to load',e);D=null;}}
const SURREAL_LINES={
  clockhead:['I am running late. Or melting. Same thing.','What time is it? Soft o’clock.','Never wind me before noon.'],
  drawerman:['Check my second drawer. No, the other one.','I keep my feelings in the bottom drawer.','Want a drawer? I have plenty.'],
  lobsterhead:['Hello? Is it me you’re calling?','Lobsters are the telephones of the sea.','Pinch me, I’m dreaming.'],
  eyehead:['I see you. I see everything.','Don’t blink. I never do.','Your aura is very orange today.'],
  mustache:['My mustache is an antenna to the dream.','Wax on. Wax forever.','I am not a man. I am a mustache with a man attached.'],
  stilts:['The view is better from up here, darling.','The elephants taught me everything.','Mind my ankles.'],
  fishhead:['I am not lost. The ocean is.','Glub. That means hello.','Have you seen my bicycle? It swims.'],
  burningcoat:['I am not on fire. I am on inspiration.','Warm, isn’t it?','Sit by me, I’m cozy.'],
};
const CLOCK_SPOTS=[[1.1,205,'tree'],[10.6,120,'plinth'],[3.0,235,'tree'],[9.0,235,'plinth'],[6.0,232,'tree'],[12.5,360,'tree'],[4.9,205,'plinth']];
function placeDyn(b,x,z,rot){b.g.position.set(x,0,z);b.g.rotation.y=rot||0;scene.add(b.g);dali.all.push(b);return b;}
function buildDali(){
  if(!D)return;
  const T=(fn,...a)=>{try{return fn?fn(...a):null;}catch(e){console.warn('dali build',e);return null;}};
  // giant elephants striding over the city
  [[540,.0,1],[600,2.1,-1],[160,4.2,1]].forEach(([r,a,dir])=>{const b=T(D.buildSpaceElephant,{});if(!b)return;placeDyn(b,0,0,0);b.path={r,a,dir,speed:1.7};dali.elephants.push(b);for(const o of b.obs||[]){const d={x:0,z:0,r:o[2],lx:o[0],lz:o[1],b};dynObs.push(d);}});
  for(let i=0;i<2;i++){const b=T(D.buildBurningGiraffe);if(!b)continue;const p=clockPos(R(10.5,13.5),R(260,520));placeDyn(b,p.x,p.z,R(0,TAU));b.wander={target:null,speed:1.3};dali.giraffes.push(b);for(const o of b.obs||[])dynObs.push({x:0,z:0,r:o[2],lx:o[0],lz:o[1],b});}
  // the seven soft clocks
  CLOCK_SPOTS.forEach(([h,r,kind],i)=>{const p=clockPos(h,r);const b=T(kind==='tree'?D.buildClockTree:D.buildClockPlinth);if(!b)return;place(b,p.x,p.z,R(0,TAU),scene);dali.all.push(b);dali.clocks.push({b,pos:p,i,got:false});});
  // lobster telephone, out past the Temple
  {const p=clockPos(11.55,330);const b=T(D.buildLobsterPhone);if(b){place(b,p.x,p.z,Math.atan2(-p.x,-p.z),scene);dali.all.push(b);dali.phone={b,pos:p};}}
  // lips sofas double as bounce pads
  for(const p of [clockPos(6,236),clockPos(4.5,120),clockPos(12.9,250),clockPos(8.2,150)]){const b=T(D.buildLipsSofa);if(!b)continue;b.g.position.copy(p);b.g.rotation.y=Math.atan2(-p.x,-p.z);scene.add(b.g);dali.all.push(b);dali.lips.push({b,pos:p.clone(),rot:b.g.rotation.y});}
  {const p=clockPos(8.8,175);const b=T(D.buildDrawerVenus);if(b){place(b,p.x,p.z,Math.atan2(-p.x,-p.z),scene);dali.all.push(b);dali.venus={b,pos:p,ready:0};}}
  {const p=clockPos(1.9,300);const b=T(D.buildSoftFace);if(b){place(b,p.x,p.z,R(0,TAU),scene);dali.all.push(b);}}
  {const p=clockPos(3.6,165);const b=T(D.buildSwanPool);if(b){place(b,p.x,p.z,0,scene);dali.all.push(b);}}
  for(const [h,r] of [[11.2,215],[2.6,180],[7.6,120]]){const p=clockPos(h,r);const b=T(D.buildAntSwarm,90,2.5);if(b){b.g.position.copy(p);scene.add(b.g);dali.all.push(b);}}
  if(D.buildFriedEggTree){const p=clockPos(10.1,200);const b=T(D.buildFriedEggTree);if(b){place(b,p.x,p.z,R(0,TAU),scene);dali.all.push(b);}}
  if(D.buildBreadHead){const p=clockPos(5.3,180);const b=T(D.buildBreadHead);if(b){place(b,p.x,p.z,R(0,TAU),scene);dali.all.push(b);}}
  // floating eyes watch you everywhere
  for(let i=0;i<12;i++){const b=T(D.buildFloatingEye);if(!b)continue;const p=i<6&&artSpots[i*5]?artSpots[i*5].clone().add(new THREE.Vector3(R(-8,8),0,R(-8,8))):clockPos(R(2,10),R(250,450));placeDyn(b,p.x,p.z,0);dali.eyes.push(b);}
  for(let i=0;i<7;i++){const b=T(D.buildMustacheSpirit);if(!b)continue;placeDyn(b,0,20,0);b.fly={a:R(0,TAU),r:R(120,420),h:R(14,34),sp:R(.03,.07)*(rnd()<.5?1:-1),wob:R(0,TAU)};dali.spirits.push(b);}
  // surreal walkers mingle with the crowd
  const types=D.SURREAL_TYPES||Object.keys(SURREAL_LINES);
  for(let i=0;i<26;i++){const type=types[i%types.length];const b=T(D.buildSurrealWalker,type);if(!b)continue;const p=rnd()<.6?blockSpot():stadFree(clockPos(R(0,12),R(60,240)));placeDyn(b,p.x,p.z,R(0,TAU));b.walk={type,target:p.clone(),wait:R(0,6),speed:type==='stilts'?1.6:R(.9,1.4),talked:false};b.pos=b.g.position;dali.walkers.push(b);}
}
function dreamCtx(speed){return {night,playerPos:P.pos,speed};}
const _dv=new THREE.Vector3();
function updateDali(dt){
  if(!D)return;const t=performance.now()*.001;const f=focusPos();
  for(const b of dali.elephants){const p=b.path;p.a+=p.dir*p.speed/p.r*dt;b.g.position.set(Math.sin(p.a)*p.r,0,-Math.cos(p.a)*p.r);b.g.rotation.y=Math.atan2(Math.cos(p.a)*p.dir,Math.sin(p.a)*p.dir);b.update&&b.update(dt,t,dreamCtx(p.speed));}
  for(const b of dali.giraffes){const w=b.wander;if(!w.target||d2(b.g.position,w.target)<6)w.target=clockPos(R(10.3,13.7),R(220,540));const want=Math.atan2(w.target.x-b.g.position.x,w.target.z-b.g.position.z);b.g.rotation.y=lerpAngle(b.g.rotation.y,want,dt*.4);b.g.position.x+=Math.sin(b.g.rotation.y)*w.speed*dt;b.g.position.z+=Math.cos(b.g.rotation.y)*w.speed*dt;if(d2(b.g.position,f)<300)b.update&&b.update(dt,t,dreamCtx(w.speed));}
  for(const b of dali.spirits){const q=b.fly;q.a+=q.sp*dt;const x=Math.sin(q.a)*q.r,z=-Math.cos(q.a)*q.r*.8+Math.sin(q.a*2)*40;b.g.position.set(x,q.h+Math.sin(t+q.wob)*3,z);b.g.rotation.y=Math.atan2(Math.cos(q.a)*q.sp,Math.sin(q.a)*q.sp);if(d2(b.g.position,f)<400)b.update&&b.update(dt,t,dreamCtx(5));}
  for(const b of dali.eyes){if(d2(b.g.position,f)<260)b.update&&b.update(dt,t,dreamCtx(0));}
  for(const w of dali.walkers){const g=w.g,W=w.walk;const d=d2(g.position,f);g.visible=d<Math.min(VIEW,150);let sp=0;
    if(W.wait>0){W.wait-=dt;if(d<10)g.rotation.y=lerpAngle(g.rotation.y,Math.atan2(f.x-g.position.x,f.z-g.position.z),dt*2);}
    else{const dx=W.target.x-g.position.x,dz=W.target.z-g.position.z,dd=Math.hypot(dx,dz);if(dd<1){W.wait=R(3,12);W.target=rnd()<.6?blockSpot():stadFree(clockPos(R(0,12),R(60,240)));}else{sp=W.speed;g.position.x+=dx/dd*sp*dt;g.position.z+=dz/dd*sp*dt;g.rotation.y=lerpAngle(g.rotation.y,Math.atan2(dx,dz),dt*3);if((frameNo+dali.walkers.indexOf(w))%4===0)collide(g.position,.5);}}
    if(g.visible&&d<110)w.update&&w.update(dt,t,dreamCtx(sp));}
  for(const b of dali.all){if(b.update&&!dali.elephants.includes(b)&&!dali.giraffes.includes(b)&&!dali.spirits.includes(b)&&!dali.eyes.includes(b)&&!dali.walkers.includes(b)){const gp=b.g.getWorldPosition(_dv);if(d2(gp,f)<220)b.update(dt,t,dreamCtx(0));}}
  // dynamic collision circles follow the giants' feet
  for(const o of dynObs){const g=o.b.g;const c=Math.cos(g.rotation.y),s=Math.sin(g.rotation.y);o.x=g.position.x+o.lx*c+o.lz*s;o.z=g.position.z-o.lx*s+o.lz*c;}
  // lobster phone rings when you wander close
  if(dali.phone&&dali.phone.b.setRinging){const ring=state.dream.stage===0&&d2(dali.phone.pos,f)<70||state.dream.stage===1&&dali.clocks.every(c=>c.got)&&d2(dali.phone.pos,f)<90;dali.phone.b.setRinging(ring);if(ring){dali.ringT=(dali.ringT||0)-dt;if(dali.ringT<=0){dali.ringT=2.2;sfx.ring(d2(dali.phone.pos,f));}}}
  // lips bounce pads
  for(const L of dali.lips){const dx=f.x-L.pos.x,dz=f.z-L.pos.z;if(dx*dx+dz*dz>9.5)continue;
    const v=P.vehicle;if(v&&v.kind==='bike'&&!v.air&&!v.crashed){v.air=true;v.vy=17;v.airT=0;v.flip=0;v.spin=0;v.flipArm=v.spinArm=false;v.lipBounce=true;sfx.boing();}
    else if(!v&&P.onGround&&P.vy<=0){P.vy=15;P.onGround=false;sfx.boing();floatText('Boing!');}}
  // drawer Venus refills its drawers every game hour
}
function interactDali(){
  if(!D)return false;const f=P.pos;
  if(dali.phone&&d2(dali.phone.pos,f)<6){answerPhone();return true;}
  if(dali.venus&&d2(dali.venus.pos,f)<5){if(state.time<dali.venus.ready){toast('The drawers are empty. Venus is restocking. Try again in an hour.');}else{dali.venus.ready=state.time+1;const item=pick(['soft pocket watch','tiny crutch','single ant (friendly)','drawer knob','dream sticker','melted crayon','mustache wax']);state.gifts.push(item);oneShot(player,'Interact',.8);sfx.chime();toast(`You open one of Venus’s drawers and find a ${item}. A gift to give away.`);}return true;}
  if(state.dream.stage===1)for(const c of dali.clocks){if(!c.got&&d2(c.pos,f)<5){collectClock(c);return true;}}
  let best=null,bd=3.2;for(const w of dali.walkers){const d=d2(w.g.position,f);if(d<bd){bd=d;best=w;}}
  if(best){const W=best.walk;W.wait=Math.max(W.wait,4);best.g.rotation.y=Math.atan2(f.x-best.g.position.x,f.z-best.g.position.z);const sp=makeBubble(pick(SURREAL_LINES[W.type]||['...']));sp.position.y=(best.height||2.4)+.6;sp.scale.set(4.6,1.15,1);best.g.add(sp);bubbles.push({sp,n:null,life:3.6});oneShot(player,'Interact',.7);if(!W.talked){W.talked=true;addKarma(3,'surreal chat');state.stats.surreal=(state.stats.surreal||0)+1;}return true;}
  return false;
}
function daliPrompt(){
  if(!D||P.vehicle)return '';const f=P.pos;
  if(dali.phone&&d2(dali.phone.pos,f)<6)return '<kbd>E</kbd>Answer the lobster';
  if(dali.venus&&d2(dali.venus.pos,f)<5)return '<kbd>E</kbd>Open a drawer';
  if(state.dream.stage===1)for(const c of dali.clocks)if(!c.got&&d2(c.pos,f)<5)return '<kbd>E</kbd>Take the soft clock';
  for(const w of dali.walkers)if(d2(w.g.position,f)<3.2)return `<kbd>E</kbd>Talk to the ${({clockhead:'clockhead',drawerman:'drawer man',lobsterhead:'lobster-head',eyehead:'eye-head',mustache:'mustache',stilts:'stilt walker',fishhead:'fish-head',burningcoat:'burning coat'})[w.walk.type]||'dreamer'}`;
  return '';
}
function answerPhone(){
  const st=state.dream.stage;sfx.chime();
  if(st===0){modal('The lobster is calling','You lift the lobster to your ear. A velvet voice with an enormous mustache purrs: "Phoenix. Time on this playa has gone soft. Seven clocks are melting across the city. Gather them before they drip away, and I will teach you to bend the hours."','Collect the clocks',()=>{state.dream.stage=1;toast('The Dream: find the seven melting clocks. They show as purple marks on your map.');},'Hang up',null);}
  else if(st===1&&dali.clocks.every(c=>c.got)){modal('The Dream, complete','"Magnificent. Hold the hours loosely, and they will stretch for you." Warmth pours through the lobster and into your hands. You can now melt time: press X for slow motion. It is very good for bike stunts.','Melt it',()=>{state.dream.stage=2;state.meltPower=true;addKarma(60,'the Dream');stuntText('Time bender','Press X to melt time');for(const b of dali.eyes)b.g.scale.setScalar(1.2);});}
  else if(st===1){const n=dali.clocks.filter(c=>c.got).length;toast(`"${7-n} clocks still melting out there, Phoenix. Look near the art, the plazas and the edges of the city."`);}
  else toast('"Sweet dreams, Phoenix." The lobster clicks its claws and hangs up.');
}
function collectClock(c){
  c.got=true;state.dream.got=(state.dream.got||0)+1;oneShot(player,'PickUp',.7);sfx.chime();
  if(c.b.clock)c.b.clock.visible=false;
  const n=dali.clocks.filter(x=>x.got).length;
  if(n>=7)toast('All seven clocks gathered. The lobster telephone is ringing out past the Temple.');else floatText(`Soft clock ${n} of 7`);
  addKarma(5,'soft clock');
}
function dreamText(){const s=state.dream;if(s.stage===0)return null;if(s.stage===1){const n=dali.clocks.filter(c=>c.got).length;return n>=7?'All clocks found. Answer the lobster telephone out past the Temple at 11:30.':`Find the melting clocks: ${n} of 7. They are purple on your map.`;}return null;}

// ================= clouds =================
let cloudMesh=null;
function cloudTexture(){const c=document.createElement('canvas');c.width=c.height=256;const g=c.getContext('2d');
  for(let i=0;i<22;i++){const x=R(60,196),y=R(80,180),r=R(30,70);const gr=g.createRadialGradient(x,y,0,x,y,r);gr.addColorStop(0,'rgba(255,255,255,.55)');gr.addColorStop(1,'rgba(255,255,255,0)');g.fillStyle=gr;g.fillRect(0,0,256,256);}
  return new THREE.CanvasTexture(c);}
function buildClouds(){
  const N=460;const base=new THREE.PlaneGeometry(1,1);const geo=new THREE.InstancedBufferGeometry();geo.index=base.index;geo.setAttribute('position',base.attributes.position);geo.setAttribute('uv',base.attributes.uv);
  const off=new Float32Array(N*3),sc=new Float32Array(N),rot=new Float32Array(N),sh=new Float32Array(N);let i=0;
  while(i<N){const cx=R(-3400,3400),cz=R(-3400,3400),cy=R(560,760);const k=4+Math.floor(rnd()*8);for(let j=0;j<k&&i<N;j++,i++){off[i*3]=cx+R(-160,160);off[i*3+1]=cy+R(-30,40);off[i*3+2]=cz+R(-110,110);sc[i]=R(110,240);rot[i]=R(0,TAU);sh[i]=R(.8,1);}}
  const ia=(a,n)=>new THREE.InstancedBufferAttribute(a,n);geo.setAttribute('aOff',ia(off,3));geo.setAttribute('aScale',ia(sc,1));geo.setAttribute('aRot',ia(rot,1));geo.setAttribute('aShade',ia(sh,1));geo.instanceCount=N;
  const m=new THREE.ShaderMaterial({uniforms:{map:{value:cloudTexture()},uColor:{value:new THREE.Color(1,1,1)},uShadow:{value:new THREE.Color(.7,.74,.82)},uOpacity:{value:.9}},transparent:true,depthWrite:false,
    vertexShader:'attribute vec3 aOff;attribute float aScale;attribute float aRot;attribute float aShade;varying vec2 vUv;varying float vFade;varying float vShade;void main(){vUv=uv;vShade=aShade;vec4 mv=viewMatrix*vec4(aOff,1.);float c=cos(aRot),s=sin(aRot);mv.xy+=vec2(position.x*c-position.y*s,position.x*s+position.y*c)*aScale;float d=-mv.z;vFade=smoothstep(25.,180.,d)*(1.-smoothstep(3800.,5600.,d));gl_Position=projectionMatrix*mv;}',
    fragmentShader:'uniform sampler2D map;uniform vec3 uColor;uniform vec3 uShadow;uniform float uOpacity;varying vec2 vUv;varying float vFade;varying float vShade;void main(){vec4 t=texture2D(map,vUv);float a=t.a*vFade*uOpacity;if(a<.01)discard;vec3 col=mix(uShadow,uColor,clamp(vUv.y*1.3-.1,0.,1.)*vShade);gl_FragColor=vec4(col,min(a,1.));\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n}'});
  cloudMesh=new THREE.Mesh(geo,m);cloudMesh.frustumCulled=false;cloudMesh.renderOrder=3;scene.add(cloudMesh);
}
const CLD={day:new THREE.Color(1.05,1.05,1.08),dayS:new THREE.Color(.68,.72,.82),dusk:new THREE.Color(1.15,.7,.5),duskS:new THREE.Color(.45,.35,.5),night:new THREE.Color(.1,.11,.17),nightS:new THREE.Color(.04,.045,.08)};
function updateClouds(day,dusk,dust){if(!cloudMesh)return;const u=cloudMesh.material.uniforms;u.uColor.value.copy(CLD.night).lerp(CLD.day,day).lerp(CLD.dusk,dusk*.7);u.uShadow.value.copy(CLD.nightS).lerp(CLD.dayS,day).lerp(CLD.duskS,dusk*.7);u.uOpacity.value=(.55+day*.35)*(1-dust*.8);}

// ================= airplane, airport =================
function buildPlane(){
  const g=new THREE.Group();const white=mat(0xf2f0ea,{roughness:.35,metalness:.25}),red=mat(0xc8463a,{roughness:.4}),dark=mat(0x22262c,{roughness:.15,metalness:.3}),blk=mat(0x161616);
  const f=M(G.cyl,white,1.3,13,1.3,0,2.4,0);f.rotation.x=Math.PI/2;g.add(f);
  const nose=M(G.cone6,white,1.3,2.6,1.3,0,2.4,7.8);nose.rotation.x=Math.PI/2;g.add(nose);
  const tail=M(G.cone6,white,1.3,3.4,1.3,0,2.6,-8.2);tail.rotation.x=-Math.PI/2;g.add(tail);
  for(const sx of[-1,1]){g.add(M(G.box,red,.06,.4,12.4,sx*1.28,2.5,0));for(let k=0;k<5;k++)g.add(M(G.box,dark,.06,.5,.7,sx*1.27,3,-3.6+k*1.6));}
  g.add(M(G.box,white,18,.24,2.7,0,3.75,1),M(G.box,red,.6,.26,2.72,-8.7,3.75,1),M(G.box,red,.6,.26,2.72,8.7,3.75,1));
  for(const sx of[-1,1]){const st=M(G.cyl,dark,.06,3.2,.06,sx*2.8,2.8,1.2);st.rotation.z=sx*1.1;g.add(st);}
  g.add(M(G.box,red,.22,2.8,2.4,0,4.3,-7.6),M(G.box,white,6,.16,1.5,0,2.9,-7.8));
  g.add(M(G.box,dark,1.6,.9,1.6,0,3.3,5.4));
  const door=M(G.box,blk,.08,1.7,1.3,-1.33,2.3,-2.2);g.add(door);
  for(const [x,z] of[[-1.7,2.6],[1.7,2.6],[0,6.6]]){const w=M(G.cyl,blk,.42,.3,.42,x,.42,z);w.rotation.z=Math.PI/2;g.add(w,M(G.box,dark,.1,1.2,.1,x,1,z));}
  const prop=new THREE.Group();prop.position.set(0,2.4,9.25);prop.add(M(G.sph,red,.3,.3,.3),M(G.box,dark,.22,3.4,.08),M(G.box,dark,3.4,.22,.08));g.add(prop);
  shadowAll(g);return{g,prop};
}
const airport={};
function buildAirport(){
  const h=4.8;const a=h/12*TAU;const dir=new THREE.Vector3(Math.sin(a),0,-Math.cos(a));
  const c=document.createElement('canvas');c.width=64;c.height=512;const x=c.getContext('2d');x.fillStyle='#7d776c';x.fillRect(0,0,64,512);x.fillStyle='#f2efe8';for(let y=10;y<512;y+=48)x.fillRect(29,y,6,26);x.fillRect(3,0,4,512);x.fillRect(57,0,4,512);
  const tex=new THREE.CanvasTexture(c);tex.colorSpace=THREE.SRGBColorSpace;tex.anisotropy=8;
  const run=new THREE.Mesh(new THREE.PlaneGeometry(22,190),new THREE.MeshStandardMaterial({map:tex,roughness:.9}));run.rotation.x=-Math.PI/2;run.rotation.z=-a;
  const mid=dir.clone().multiplyScalar(560);run.position.set(mid.x,.04,mid.z);run.receiveShadow=true;scene.add(run);
  airport.dir=dir;airport.heading=Math.atan2(dir.x,dir.z);airport.park=dir.clone().multiplyScalar(478);
  const pl=buildPlane();pl.g.position.copy(airport.park);pl.g.rotation.order='YXZ';pl.g.rotation.y=airport.heading;scene.add(pl.g);airport.plane=pl;
  const amb=buildPlane();amb.g.visible=false;amb.g.rotation.order='YXZ';scene.add(amb.g);ambientSky.plane=amb;
  // windsock, hangar shade and sign
  const side=new THREE.Vector3(dir.z,0,-dir.x);const ws=airport.park.clone().addScaledVector(side,16);
  const wg=new THREE.Group();wg.add(M(G.cyl,mat(0x9a9ea3,{metalness:.7}),.07,6,.07,0,3,0));const sock=M(G.cone6,mat(0xff6b35,{roughness:.8}),.45,2.4,.45,0,5.6,1.2);sock.rotation.x=Math.PI/2;wg.add(sock);place({g:wg,obs:[[0,0,.3]]},ws.x,ws.z,R(0,TAU));
  const hp=airport.park.clone().addScaledVector(side,-22);const hs=shade(14,10);place(hs,hp.x,hp.z,airport.heading);
  const signTex=(()=>{const c2=document.createElement('canvas');c2.width=512;c2.height=128;const g2=c2.getContext('2d');g2.fillStyle='#14202c';g2.fillRect(0,0,512,128);g2.strokeStyle='#46f1ff';g2.lineWidth=8;g2.strokeRect(6,6,500,116);g2.fillStyle='#eaf6ff';g2.font='800 46px Rubik, system-ui, sans-serif';g2.textAlign='center';g2.textBaseline='middle';g2.fillText('PLAYA AIRPORT',256,50);g2.font='600 26px Rubik, system-ui, sans-serif';g2.fillText('jump plane · skydives all day',256,94);const t=new THREE.CanvasTexture(c2);t.colorSpace=THREE.SRGBColorSpace;return t;})();
  const sign=new THREE.Mesh(new THREE.PlaneGeometry(6,1.5),new THREE.MeshBasicMaterial({map:signTex,side:THREE.DoubleSide}));const sp=airport.park.clone().addScaledVector(dir,-14).addScaledVector(side,-8);sign.position.set(sp.x,3.6,sp.z);sign.rotation.y=airport.heading+Math.PI;scene.add(sign);
  airport.pilotPos=airport.park.clone().addScaledVector(side,-4.5).addScaledVector(dir,-3);
}

// ================= flight: only Phoenix can fly =================
const _fv=new THREE.Vector3();
P.fv=new THREE.Vector3();
let flyHint=false,trailT=0,flyCheerT=0;
function toggleFly(){
  if(P.ride)return;
  if(P.flying){P.flying=false;P.vy=Math.min(0,P.fv.y);P.onGround=false;floatText('Wings folded');return;}
  if(P.sky){if(P.sky.canopy)scene.remove(P.sky.canopy);P.fv.copy(P.sky.vel);P.sky=null;}
  else if(P.vehicle)exitVehicle();
  P.flying=true;P.sitting=false;P.dancing=false;if(P.fv.lengthSq()<1)P.fv.set(0,7,0);sfx.whoosh(0);
  if(!flyHint){flyHint=true;toast('Phoenix spreads his wings. Space to rise, C to dive, Shift to blaze across the sky. V to land.');}
  for(let i=0;i<crowdN;i++){if((cX[i]-P.pos.x)**2+(cZ[i]-P.pos.z)**2<900)crowdCheer(i,3);}
}
const TR_N=700;const trPos=new Float32Array(TR_N*3),trCol=new Float32Array(TR_N*3),trLife=new Float32Array(TR_N),trVel=new Float32Array(TR_N*3);let trCur=0,trGeo=null;
function initTrail(){trGeo=new THREE.BufferGeometry();trGeo.setAttribute('position',new THREE.BufferAttribute(trPos,3));trGeo.setAttribute('color',new THREE.BufferAttribute(trCol,3));const pts=new THREE.Points(trGeo,new THREE.PointsMaterial({size:.45,map:glowMap,vertexColors:true,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending}));pts.frustumCulled=false;scene.add(pts);}
function emitTrail(x,y,z,k){if(!trGeo)return;const i=trCur;trCur=(trCur+1)%TR_N;trPos[i*3]=x+R(-.25,.25);trPos[i*3+1]=y+R(-.25,.25);trPos[i*3+2]=z+R(-.25,.25);trVel[i*3]=R(-.6,.6);trVel[i*3+1]=R(.2,1.4);trVel[i*3+2]=R(-.6,.6);trLife[i]=R(.5,.9)*k;}
function updateTrail(dt){if(!trGeo)return;for(let i=0;i<TR_N;i++){if(trLife[i]<=0){trCol[i*3]=trCol[i*3+1]=trCol[i*3+2]=0;continue;}trLife[i]-=dt;const l=Math.max(0,trLife[i]);for(let j=0;j<3;j++)trPos[i*3+j]+=trVel[i*3+j]*dt;trCol[i*3]=2.2*Math.min(1,l*2);trCol[i*3+1]=1.3*l*l;trCol[i*3+2]=.3*Math.max(0,l-.5);}trGeo.attributes.position.needsUpdate=true;trGeo.attributes.color.needsUpdate=true;}
function updateFlight(dt,inp){
  const cp=Math.cos(camPitch),sp=Math.sin(camPitch);
  const fx=-Math.sin(camYaw)*cp,fy=-sp*.9,fz=-Math.cos(camYaw)*cp,rx=Math.cos(camYaw),rz=-Math.sin(camYaw);
  let ix=0,iy=0,iz=0;const fwdA=(inp.fwd?1:0)-(inp.back?1:0)-touch.jy,sideA=(inp.right?1:0)-(inp.left?1:0)+touch.jx;
  ix+=fx*fwdA+rx*sideA;iy+=fy*fwdA;iz+=fz*fwdA+rz*sideA;
  if(keys.Space||touch.jump)iy+=1;if(keys.KeyC||keys.ControlLeft)iy-=1;
  const len=Math.hypot(ix,iy,iz);const top=inp.boost?46:19;
  if(len>.05)_fv.set(ix/len,iy/len,iz/len).multiplyScalar(top*Math.min(1,len));else _fv.set(0,Math.sin(performance.now()*.002)*.4,0);
  P.fv.lerp(_fv,Math.min(1,dt*(inp.boost?1.6:2.4)));
  P.pos.addScaledVector(P.fv,dt);P.pos.y=Math.min(P.pos.y,2600);
  if(P.pos.y<4)collide(P.pos,.45,true);
  const gh=groundHeight(P.pos.x,P.pos.z);
  if(P.pos.y<=gh){P.pos.y=gh;if(P.fv.y<=0&&!(keys.Space||touch.jump)){P.flying=false;P.vy=0;P.onGround=true;P.fv.set(0,0,0);oneShot(player,'Jump_Land',.5);for(let i=0;i<8;i++)emitPuff(P.pos.x+R(-1,1),P.pos.z+R(-1,1),1,.3);return;}P.fv.y=Math.max(0,P.fv.y);}
  const hs=Math.hypot(P.fv.x,P.fv.z);
  if(hs>1)P.heading=lerpAngle(P.heading,Math.atan2(P.fv.x,P.fv.z),Math.min(1,dt*6));
  player.g.rotation.order='YXZ';player.g.rotation.y=P.heading;
  player.g.rotation.x=lerp(player.g.rotation.x,clamp(hs/46,0,1)*1.3-clamp(P.fv.y/40,-.4,.4)*.5,Math.min(1,dt*4));
  player.g.rotation.z=lerp(player.g.rotation.z,-sideA*.35,Math.min(1,dt*4));
  play(player,'Jump_Idle',.25);player.mixer.update(dt);
  if(player.wings){const t=performance.now()*.001;player.wings.rotation.x=-.2+Math.sin(t*(inp.boost?20:11))*.32;player.wings.scale.setScalar(lerp(player.wings.scale.x,1.35,dt*3));}
  trailT-=dt;if(trailT<=0){trailT=inp.boost?.008:.02;for(const s2 of[-1,1]){const bx=P.pos.x-Math.sin(P.heading)*.6+Math.cos(P.heading)*s2*.7,bz=P.pos.z-Math.cos(P.heading)*.6-Math.sin(P.heading)*s2*.7;emitTrail(bx,P.pos.y+1.5,bz,inp.boost?1.5:1);}}
  flyCheerT-=dt;if(flyCheerT<=0&&P.pos.y<30){flyCheerT=.6;for(let i=0;i<crowdN;i++){if((cX[i]-P.pos.x)**2+(cZ[i]-P.pos.z)**2<400)crowdCheer(i,2.5);}}
}
function resetPose(){player.g.rotation.x=lerp(player.g.rotation.x,0,.3);player.g.rotation.z=lerp(player.g.rotation.z,0,.3);if(player.wings){player.wings.scale.setScalar(lerp(player.wings.scale.x,1,.1));player.wings.rotation.x=lerp(player.wings.rotation.x,-.2,.1);}}

// ================= jump plane & skydiving =================
function makeCanopy(){
  const g=new THREE.Group();const cols=[0xff3b3b,0xff9a2e,0xffe53b,0x3bd36b,0x3b9dff,0x9b6bff,0xff4fa8];const sh=pick([0,1,2,3]);
  for(let i=0;i<7;i++){const a=(i-3)/3*.75;const cell=M(G.box,mat(cols[(i+sh)%7],{roughness:.7,side:THREE.DoubleSide}),1.3,.35,3.4,Math.sin(a)*4.6,Math.cos(a)*4.6,0);cell.rotation.z=-a;g.add(cell);}
  const lp=[];for(let i=0;i<7;i+=2){const a=(i-3)/3*.75;lp.push(0,0,0,Math.sin(a)*4.6,Math.cos(a)*4.6-.2,1.4,0,0,0,Math.sin(a)*4.6,Math.cos(a)*4.6-.2,-1.4);}
  const lg=new THREE.BufferGeometry();lg.setAttribute('position',new THREE.Float32BufferAttribute(lp,3));g.add(new THREE.LineSegments(lg,new THREE.LineBasicMaterial({color:0x333333})));
  shadowAll(g);return g;
}
function boardPlane(){
  if(P.ride||airport.busy)return;if(P.vehicle)exitVehicle();P.flying=false;P.sky=null;
  const pl=airport.plane;airport.busy=true;
  P.ride={t:0,speed:0,vy:0,heading:airport.heading,pos:pl.g.position,bank:0};player.g.visible=false;
  toast('Phoenix climbs aboard. The jump plane heads for the clouds. Press Space to jump when you are ready.');sfx.chime();
}
const _door=new THREE.Vector3();
function updatePlaneRide(dt,inp){
  const R2=P.ride,pl=airport.plane;R2.t+=dt;
  R2.speed=Math.min(55,R2.speed+(R2.speed<30?14:7)*dt);
  if(R2.speed>28){R2.vy=lerp(R2.vy,R2.pos.y<1650?38:0,dt*.6);}
  if(R2.pos.y>70){const toC=Math.atan2(-R2.pos.x,-R2.pos.z),dist=Math.hypot(R2.pos.x,R2.pos.z);const want=dist>360?toC:toC-Math.PI/2;const nh=lerpAngle(R2.heading,want,Math.min(1,dt*.25));R2.bank=lerp(R2.bank,clamp((nh-R2.heading)/dt*1.6,-.45,.45),dt*2);R2.heading=nh;}
  R2.pos.x+=Math.sin(R2.heading)*R2.speed*dt;R2.pos.z+=Math.cos(R2.heading)*R2.speed*dt;R2.pos.y=Math.max(0,R2.pos.y+R2.vy*dt);
  pl.g.rotation.y=R2.heading;pl.g.rotation.x=-Math.atan2(R2.vy,R2.speed)*.35;pl.g.rotation.z=-R2.bank;pl.prop.rotation.z+=dt*40;
  _door.set(-1.3,2.3,-2.2);pl.g.localToWorld(_door);P.pos.copy(_door);
  if(inp.jumpEdge&&R2.pos.y>220)jumpOut();
  else if(inp.jumpEdge)floatText('Not high enough yet. Hang on.');
}
function jumpOut(){
  const R2=P.ride;P.ride=null;player.g.visible=true;
  P.sky={vel:new THREE.Vector3(Math.sin(R2.heading)*R2.speed*.4-Math.cos(R2.heading)*3,-2,Math.cos(R2.heading)*R2.speed*.4+Math.sin(R2.heading)*3),heading:R2.heading-Math.PI/2,canopy:null,t:0,top:P.pos.y};
  airport.auto={t:0,heading:R2.heading,speed:R2.speed,vy:R2.vy};
  stuntText('Geronimo!',`Jumping from ${Math.round(P.pos.y)} m`);sfx.whoosh(0);camDist=Math.max(camDist,9);
}
function updatePlaneAuto(dt){
  const A=airport.auto;if(!A)return;const pl=airport.plane;A.t+=dt;
  pl.g.position.x+=Math.sin(A.heading)*A.speed*dt;pl.g.position.z+=Math.cos(A.heading)*A.speed*dt;pl.prop.rotation.z+=dt*40;A.heading+=.05*dt;pl.g.rotation.y=A.heading;
  if(A.t>45){airport.auto=null;airport.busy=false;pl.g.position.copy(airport.park);pl.g.rotation.set(0,airport.heading,0);}
}
function updateSkydive(dt,inp){
  const S=P.sky,v=S.vel;S.t+=dt;const gh=groundHeight(P.pos.x,P.pos.z);const agl=P.pos.y-gh;S.top=Math.max(S.top,P.pos.y);
  const turn=(inp.left?1:0)-(inp.right?1:0)-touch.jx;
  const look=camYaw+Math.PI;const steer=inp.fwd||touch.jy<-.5;
  // first mission: hands off the controls and the skydive drifts toward the Stone Stadium
  let asH=null,asD=0;if(state.quest===0&&STADIUM.S&&!steer&&!turn&&!inp.back){const dx=STADIUM.pos.x-P.pos.x,dz=STADIUM.pos.z-P.pos.z;asD=Math.hypot(dx,dz);if(asD<420&&asD>2)asH=Math.atan2(dx,dz);}
  if(!S.canopy){
    if(asH!==null)S.heading=lerpAngle(S.heading,asH,Math.min(1,dt*2));
    if(steer)S.heading=lerpAngle(S.heading,look,Math.min(1,dt*2.2));
    S.heading+=turn*1.5*dt;const dive=steer&&camPitch>.55;const track=steer?(dive?16:30):inp.back?-4:asH!==null?clamp(asD*.35,0,30):4;const term=dive?82:steer?58:52;
    v.y-=9.8*dt;if(v.y<-term)v.y=lerp(v.y,-term,Math.min(1,dt*2));
    v.x=lerp(v.x,Math.sin(S.heading)*track,Math.min(1,dt*.9));v.z=lerp(v.z,Math.cos(S.heading)*track,Math.min(1,dt*.9));
    player.g.rotation.order='YXZ';player.g.rotation.y=S.heading;
    const pose=v.y>0?.2:dive?1.05:steer?1.3:1.5;
    player.g.rotation.x=lerp(player.g.rotation.x,pose,Math.min(1,dt*3));player.g.rotation.z=lerp(player.g.rotation.z,-turn*.45+Math.sin(S.t*7)*.03,dt*3);
    const rising=v.y>0;
    if(!rising&&((inp.jumpEdge&&agl>25)||agl<110))openChute();
  }else{
    if(steer)S.heading=lerpAngle(S.heading,look,Math.min(1,dt*1.2));else if(asH!==null)S.heading=lerpAngle(S.heading,asH,Math.min(1,dt*1.5));
    S.heading+=turn*1.1*dt;const glide=steer?15:inp.back?4:asH!==null?clamp(asD*.3,0,15):10,desc=steer?7.5:inp.back?2.4:4.8;
    v.x=lerp(v.x,Math.sin(S.heading)*glide,Math.min(1,dt*1.2));v.z=lerp(v.z,Math.cos(S.heading)*glide,Math.min(1,dt*1.2));v.y=lerp(v.y,-desc,Math.min(1,dt*1.5));
    player.g.rotation.y=S.heading;player.g.rotation.x=lerp(player.g.rotation.x,.08,Math.min(1,dt*3));player.g.rotation.z=lerp(player.g.rotation.z,-turn*.25,dt*2);
    S.canopy.position.set(P.pos.x,P.pos.y+1.75,P.pos.z);S.canopy.rotation.set(Math.sin(S.t*1.3)*.05,S.heading,-turn*.3);
    if(S.gl&&S.gl.update)S.gl.update(dt,S.t,{night,speed:glide});
  }
  play(player,'Jump_Idle',.3);player.mixer.update(dt);
  P.pos.addScaledVector(v,dt);if(P.pos.y<6)collide(P.pos,.45,true);
  if(P.pos.y<=groundHeight(P.pos.x,P.pos.z))landSkydive();
}
function openChute(){const S=P.sky;if(S.canopy)return;
  const kind=state.glider||'parachute';
  if(PR&&PR.buildGlider){const gl=PR.buildGlider(kind);shadowAll(gl.g);S.canopy=new THREE.Group();S.canopy.add(gl.g);S.gl=gl;}
  else S.canopy=makeCanopy();
  scene.add(S.canopy);S.freefall=S.t;S.vel.y*=.25;sfx.whoosh(0);floatText(kind==='parachute'?'Canopy open':'Glider out');}
// ================= the Stone Stadium =================
const stadDyn=[];
function buildStoneStadium(){
  let S;try{S=buildStadium({neon,glowMap,
    onKick(power,lp){const w=stadWorld(lp.x,lp.z);const d=d2(w,P.pos);if(d>90||!audio.ctx)return;const v=Math.min(.32,power*.4)*(1-d/90);sfx.tone(55+R(0,25),.22,'triangle',v);sfx.tone(110+R(0,30),.08,'square',v*.25);},
    onPlayerKick(power){sfx.tone(70,.22,'triangle',.3);sfx.tone(150,.1,'square',.08);},
    onGoal(e){const near=d2(P.pos,STADIUM.pos)<160;if(near){toast(e.byPhoenix?`GOAL by PHOENIX for the ${e.team.name}! ${e.score[0]} : ${e.score[1]}`:`GOAL! ${e.scorer} scores for the ${e.team.name}. ${e.score[0]} : ${e.score[1]}`);sfx.chime();for(let i=0;i<6;i++)setTimeout(()=>sfx.tone(392+i*98,.3,'sawtooth',.06),i*90);}
      if(e.byPhoenix){addKarma(15,'stone cup goal');stuntText('GOOOAL!','Phoenix scores in the Stone Cup');}},
  });}catch(e){console.warn('stadium failed',e);return;}
  S.root.position.set(STADIUM.pos.x,0,STADIUM.pos.z);S.root.rotation.y=STADIUM.rot;scene.add(S.root);
  const c=Math.cos(STADIUM.rot),sn=Math.sin(STADIUM.rot);
  for(const [lx,lz,r] of S.obstacles)obstacles.push({x:STADIUM.pos.x+lx*c+lz*sn,z:STADIUM.pos.z-lx*sn+lz*c,r,stadium:true});
  // players + ball push Phoenix around (they move, so they live in dynObs with a proxy object)
  const mk=(r)=>{const o={x:0,z:0,r,lx:0,lz:0,b:{g:{position:new THREE.Vector3(),rotation:{y:0}}}};dynObs.push(o);stadDyn.push(o);return o;};
  for(const p of S.players)p.obs=mk(.95*p.scale);S.ball.obs=mk(1.5);
  STADIUM.S=S;
}
let stadAcc=0;
function updateStadium(dt){
  const S=STADIUM.S;if(!S)return;
  const d=d2(focusPos(),STADIUM.pos);const near=d<420||(P.ride&&P.ride.drop)||P.sky;
  S.root.visible=d<1400;
  if(!near){stadAcc+=dt;if(stadAcc<.25)return;dt=stadAcc;stadAcc=0;}
  const l=stadLocal(P.pos.x,P.pos.z);const c=Math.cos(STADIUM.rot),sn=Math.sin(STADIUM.rot);
  const onFoot=!P.vehicle&&!P.sky&&!P.ride&&!P.flying&&!P.hidden&&P.pos.y<1.5&&S.inPitch(l.x,l.z,3);
  const lvx=P.vel.x*c-P.vel.z*sn,lvz=P.vel.x*sn+P.vel.z*c;
  S.update(dt,{t:performance.now()*.001,night,near,player:{x:l.x,z:l.z,vx:lvx,vz:lvz,onFoot}});
  for(const p of S.players){const w=stadWorld(p.pos.x,p.pos.z);p.obs.b.g.position.set(w.x,0,w.z);p.obs.x=w.x;p.obs.z=w.z;}
  {const w=stadWorld(S.ball.p.x,S.ball.p.z);S.ball.obs.b.g.position.set(w.x,0,w.z);S.ball.obs.x=w.x;S.ball.obs.z=w.z;}
}
function landSkydive(){
  const S=P.sky;P.sky=null;if(S.canopy)setTimeout(()=>scene.remove(S.canopy),2500),S.canopy.position.y=P.pos.y+.2,S.canopy.rotation.x=1.3;
  P.pos.y=groundHeight(P.pos.x,P.pos.z);P.vy=0;P.onGround=true;P.vel.set(0,0,0);player.g.rotation.x=0;player.g.rotation.z=0;oneShot(player,'Jump_Land',.6);
  W.shake=Math.max(W.shake,S.canopy?.35:1.2);
  const dMan=Math.hypot(P.pos.x,P.pos.z),dCamp=d2(P.pos,CAMP);const ff=(S.freefall||S.t).toFixed(0);
  state.stats.skydives=(state.stats.skydives||0)+1;
  if(S.drop)onDropLanded(S.first);
  unlockGlider();
  if(STADIUM.S){const l=stadLocal(P.pos.x,P.pos.z);if(STADIUM.S.inBowl(l.x,l.z)){state.stadiumLanded=true;STADIUM.S.excitePhoenix();const onPitch=STADIUM.S.inPitch(l.x,l.z);stuntText(onPitch?'Pitch landing!':'Stadium landing!',onPitch?'The stones go wild. Run into the ball to play.':'You made it into the Stone Cup.');addKarma(onPitch?20:10,'stadium landing');for(let i=0;i<4;i++)setTimeout(()=>sfx.tone(520+i*130,.25,'triangle',.1),i*110);for(let i=0;i<10;i++)emitPuff(P.pos.x+R(-1.5,1.5),P.pos.z+R(-1.5,1.5),1.2,.35);return;}}
  if(!S.canopy){stuntText('Phoenix rises','No parachute? No problem. Ashes to wings.');for(let k=0;k<3;k++)setTimeout(()=>{for(const pv of[P.pos])for(let i=0;i<40;i++)emitTrail(pv.x+R(-2,2),pv.y+R(0,3),pv.z+R(-2,2),2);},k*120);addKarma(5,'skydive');return;}
  if(dMan<45){stuntText('Bullseye on the Man',`${ff}s of freefall from ${Math.round(S.top)} m`);addKarma(30,'bullseye landing');}
  else if(dCamp<25){stuntText('Landed at camp',`${ff}s of freefall. Your campmates applaud.`);addKarma(20,'home landing');}
  else{stuntText('Touchdown',`${ff}s of freefall from ${Math.round(S.top)} m`);addKarma(10,'skydive');}
  for(let i=0;i<10;i++)emitPuff(P.pos.x+R(-1.5,1.5),P.pos.z+R(-1.5,1.5),1.2,.35);
  for(let i=0;i<crowdN;i++){if((cX[i]-P.pos.x)**2+(cZ[i]-P.pos.z)**2<900)crowdCheer(i,4);}
}
function airUpdate(dt,inp){
  if(P.ride&&P.ride.drop)updateDropRide(dt,inp);else if(P.ride)updatePlaneRide(dt,inp);else if(P.sky)updateSkydive(dt,inp);else updateFlight(dt,inp);
}


// ================= prop compaction: merge a prop's static meshes by material =================
// Moving parts are found by running the prop's update a few times and seeing which nodes change.
const _cm=new THREE.Matrix4();
function compactProp(b,keep){
  const g=b.g;keep=keep||[];const moving=new Set(keep.filter(Boolean));
  const snap=new Map();g.traverse(o=>{o.updateMatrix();snap.set(o,[o.matrix.clone(),o.visible,o.material]);});
  if(b.update){try{b.update(.37,1.3,{night:1,speed:5});b.update(.41,2.9,{night:0,speed:0});b.update(.2,4.4,{night:.5,speed:2});}catch(_){}}
  if(b.setOccupied){try{b.setOccupied(true);b.setOccupied(false);}catch(_){}}
  g.traverse(o=>{o.updateMatrix();const m=snap.get(o);if(m&&(!m[0].equals(o.matrix)||m[1]!==o.visible||m[2]!==o.material))moving.add(o);if(o.isSprite||o.isPoints||o.isLine||o.isSkinnedMesh||o.isInstancedMesh)moving.add(o);});
  const isMoving=o=>{for(let q=o;q&&q!==g;q=q.parent)if(moving.has(q))return true;return false;};
  g.updateMatrixWorld(true);const inv=new THREE.Matrix4().copy(g.matrixWorld).invert();
  const buckets=new Map();const victims=[];
  g.traverse(o=>{if(!o.isMesh||isMoving(o)||Array.isArray(o.material)||o.material.transparent||o.morphTargetInfluences)return;
    const src=o.geometry;if(!src.attributes.position||!src.attributes.normal)return;
    const geo=new THREE.BufferGeometry();geo.setAttribute('position',src.attributes.position.clone());geo.setAttribute('normal',src.attributes.normal.clone());
    if(src.attributes.uv)geo.setAttribute('uv',src.attributes.uv.clone());else geo.setAttribute('uv',new THREE.BufferAttribute(new Float32Array(src.attributes.position.count*2),2));
    if(src.index)geo.setIndex(src.index.clone());
    let ng=geo.index?geo.toNonIndexed():geo;
    ng.applyMatrix4(_cm.copy(inv).multiply(o.matrixWorld));
    const k=o.material.uuid;if(!buckets.has(k))buckets.set(k,{m:o.material,geos:[],cast:o.castShadow});buckets.get(k).geos.push(ng);victims.push(o);});
  if(victims.length<4)return b;
  for(const o of victims)o.parent.remove(o);
  for(const bk of buckets.values()){const mg=mergeGeometries(bk.geos,false);if(!mg)continue;const mesh=new THREE.Mesh(mg,bk.m);mesh.castShadow=true;mesh.receiveShadow=true;g.add(mesh);}
  return b;
}
// ================= air motes: sunlit dust drifting around the camera =================
let motes=null;const MOTE_N=900,motePos=new Float32Array(MOTE_N*3),moteV=new Float32Array(MOTE_N*3);
function initMotes(){
  const g=new THREE.BufferGeometry();for(let i=0;i<MOTE_N;i++){motePos[i*3]=R(-30,30);motePos[i*3+1]=R(0,14);motePos[i*3+2]=R(-30,30);moteV[i*3]=R(.2,.9);moteV[i*3+1]=R(-.08,.12);moteV[i*3+2]=R(-.2,.4);}
  g.setAttribute('position',new THREE.BufferAttribute(motePos,3));
  motes=new THREE.Points(g,new THREE.PointsMaterial({size:.07,map:glowMap,color:0xfff0d8,transparent:true,opacity:.5,depthWrite:false,blending:THREE.AdditiveBlending}));
  motes.frustumCulled=false;scene.add(motes);
}
function updateMotes(dt){
  if(!motes||!motes.visible)return;const c=camera.position;const t=performance.now()*.001;
  for(let i=0;i<MOTE_N;i++){let x=motePos[i*3]+moteV[i*3]*dt+Math.sin(t*.7+i)*dt*.3,y=motePos[i*3+1]+moteV[i*3+1]*dt,z=motePos[i*3+2]+moteV[i*3+2]*dt;
    if(x>30)x-=60;else if(x<-30)x+=60;if(z>30)z-=60;else if(z<-30)z+=60;if(y>14)y-=14;else if(y<0)y+=14;motePos[i*3]=x;motePos[i*3+1]=y;motePos[i*3+2]=z;}
  motes.position.set(Math.floor(c.x/60)*60,Math.max(0,c.y-7),Math.floor(c.z/60)*60);
  // wrap the cloud so it always surrounds the camera
  const ox=c.x-motes.position.x,oz=c.z-motes.position.z;for(let i=0;i<MOTE_N;i++){const dx=motePos[i*3]-ox,dz=motePos[i*3+2]-oz;if(dx>30)motePos[i*3]-=60;else if(dx<-30)motePos[i*3]+=60;if(dz>30)motePos[i*3+2]-=60;else if(dz<-30)motePos[i*3+2]+=60;}
  motes.geometry.attributes.position.needsUpdate=true;
  const day=1-night;motes.material.opacity=(.18+day*.45+state.dust*.4)*(c.y<60?1:0);motes.material.color.setRGB(1,.92+day*.05,.8+day*.1);
}
// ================= THE DROP: every new week starts in the sky =================
let PR=null;
async function loadProps(){try{PR=await import('./props.js?v=7');if(PR.initProps)PR.initProps({neon,mat,glowMap});}catch(e){console.warn('props.js failed to load',e);PR=null;}}
const drop={active:null,plane:null,leaving:null};
const _dd=new THREE.Vector3(),_plV=new THREE.Vector3();
function dropPlaneModel(){
  if(drop.plane)return drop.plane;let pl;
  if(PR&&PR.buildArtPlane){const b=PR.buildArtPlane();shadowAll(b.g);pl={g:b.g,door:b.door||null,update:b.update||(()=>{})};}
  else{const b=buildPlane();b.g.scale.setScalar(1.7);pl={g:b.g,door:null,update:dt=>{b.prop.rotation.z+=dt*40;}};}
  pl.g.rotation.order='YXZ';pl.g.visible=false;scene.add(pl.g);drop.plane=pl;return pl;
}
function clearAir(){
  if(P.vehicle)exitVehicle();P.flying=false;
  if(P.sky){if(P.sky.canopy)scene.remove(P.sky.canopy);P.sky=null;}
  if(P.ride&&!P.ride.drop){airport.busy=false;}
  P.ride=null;player.g.visible=true;if(drop.active){drop.active=null;drop.leaving={t:0};}const tc=$('#titlecard');if(tc)tc.hidden=true;
}
function startDrop(first){
  if(P.ride&&P.ride.drop)return;
  if(first)state.landed=false;
  clearAir();if(P.hidden)leaveHide&&leaveHide(true);
  const pl=dropPlaneModel();
  const a=R(0,TAU),off=R(-220,220);
  const dir=new THREE.Vector3(Math.cos(a),0,Math.sin(a)),side=new THREE.Vector3(-dir.z,0,dir.x);
  const toStad=state.quest===0;
  const start=toStad?new THREE.Vector3(STADIUM.pos.x,0,STADIUM.pos.z).addScaledVector(dir,-1400):side.clone().multiplyScalar(off).addScaledVector(dir,-650);start.y=first?300:280;
  const D={t:0,dir,side,start:start.clone(),pos:start.clone(),speed:110,vy:0,bank:0,heading:Math.atan2(dir.x,dir.z),first,len:2500,divers:0,nextDiver:2};
  drop.active=D;drop.leaving=null;
  pl.g.visible=true;pl.g.position.copy(start);pl.g.rotation.set(0,D.heading,0);
  P.ride={drop:true,pos:pl.g.position,heading:D.heading,speed:D.speed,vy:0,bank:0,t:0};player.g.visible=false;
  camYaw=D.heading+Math.PI;camPitch=.2;
  if(state.weapon&&W.gun)W.gun.g.visible=false;
  sfx.chime();
  if(first)showTitleCard();
  toast(first?(touch.on?'You are flying the drop plane. Steer with the stick, tap Jump over a spot you like.':'You are flying the drop plane! A/D to steer (click the screen to steer with the mouse). W faster, S slower. Space to jump.'):'Fly the drop plane anywhere. Space to jump.');
}
function updateDropRide(dt,inp){
  // arcade flight with a chase camera. The plane always flies forward along its nose.
  // Steering: A/D (or joystick) and the mouse, which acts as a self-centering flight stick
  // (move right = bank right). Altitude: mouse forward/back (stick Y). W faster, S slower.
  const D=drop.active,pl=drop.plane;D.t+=dt;P.ride.t=D.t;
  const sx=D.stickX||0,sy=D.stickY||0;
  const decay=Math.exp(-dt*2.2);D.stickX=sx*decay;D.stickY=sy*decay;
  let turn=clamp((inp.left?1:0)-(inp.right?1:0)-touch.jx-sx,-1,1);
  const r0=Math.hypot(D.pos.x,D.pos.z);
  if(r0>1600){const toC=Math.atan2(-D.pos.x,-D.pos.z);turn=clamp(wrapA(toC-D.heading)*2,-1,1);if(!D.warned){D.warned=true;toast('Edge of the desert. Turning back toward the city.');}}else if(r0<1400)D.warned=false;
  D.bank=lerp(D.bank||0,turn*.7,Math.min(1,dt*3.5));
  D.heading=wrapA(D.heading+D.bank*1.6*dt);
  const thr=(inp.fwd?1:0)-(inp.back?1:0)-touch.jy;
  const want=inp.boost?230:thr>.3?170:thr<-.3?60:110;D.speed=lerp(D.speed,want,Math.min(1,dt*1.1));
  const vyT=clamp(sy*1.6,-1,1)*60; // stick forward (mouse up) = nose down
  D.vy=lerp(D.vy||0,vyT,Math.min(1,dt*2.5));D.pos.y=clamp(D.pos.y+D.vy*dt,120,1000);if(D.pos.y<=120&&D.vy<0||D.pos.y>=1000&&D.vy>0)D.vy=0;
  D.dir.set(Math.sin(D.heading),0,Math.cos(D.heading));
  D.pos.addScaledVector(D.dir,D.speed*dt);P.ride.heading=D.heading;P.ride.speed=D.speed;
  _plV.copy(D.dir).multiplyScalar(D.speed);_plV.y=D.vy;
  pl.g.position.copy(D.pos); // the model must follow the simulated position (it never did before)
  pl.g.rotation.y=D.heading;pl.g.rotation.z=-D.bank;pl.g.rotation.x=-Math.atan2(D.vy,D.speed)*.8;
  pl.update(dt,performance.now()*.001,{night});
  pl.g.updateMatrixWorld(true);
  if(pl.door){pl.door.getWorldPosition(_dd);}else{_dd.set(0,2,-9);pl.g.localToWorld(_dd);}
  P.pos.copy(_dd);
  // chase camera: always behind the plane's real heading, slightly above
  camYaw=lerpAngle(camYaw,D.heading+Math.PI,Math.min(1,dt*6));
  camPitch=lerp(camPitch,.2-D.vy*.0015,Math.min(1,dt*3));
  const r=Math.hypot(D.pos.x,D.pos.z);
  D.nextDiver-=dt;if(D.nextDiver<=0&&r<560&&D.divers<10){D.nextDiver=R(1.2,3.5);D.divers++;spawnDiver(_dd,D.heading+Math.PI);}
  if(inp.jumpEdge&&D.t>.8)dropJump();
}
function dropJump(){
  const D=drop.active;P.ride=null;player.g.visible=true;drop.leaving={t:0,speed:D.speed};
  P.sky={vel:new THREE.Vector3(D.dir.x*Math.min(D.speed,90)*.35,-3,D.dir.z*Math.min(D.speed,90)*.35),heading:D.heading,canopy:null,t:0,top:P.pos.y,drop:true,first:D.first};
  drop.active=null;
  stuntText(D.first?'':'Geronimo!',`Jumping from ${Math.round(P.pos.y)} m`);sfx.whoosh(0);camDist=Math.max(camDist,9);camPitch=.5;
}
function updateDropPlane(dt){
  const L=drop.leaving;if(!L||!drop.plane)return;L.t+=dt;const pl=drop.plane;
  pl.g.rotation.z*=Math.max(0,1-dt*2);pl.g.rotation.x*=Math.max(0,1-dt*2);pl.g.position.addScaledVector(_dd.set(Math.sin(pl.g.rotation.y),0,Math.cos(pl.g.rotation.y)),(L.speed||85)*dt);pl.update(dt,performance.now()*.001,{night});
  if(L.t>40){pl.g.visible=false;drop.leaving=null;}
}
function showTitleCard(){
  const el=$('#titlecard');if(!el)return;el.hidden=false;el.classList.remove('out');void el.offsetWidth;el.classList.add('in');
  setTimeout(()=>{el.classList.add('out');},5200);setTimeout(()=>{el.hidden=true;el.classList.remove('in','out');},7000);
}
// landing marker + speed lines
let landRing=null,slMesh=null;const SL_N=120,slP=new Float32Array(SL_N*6),slW=[];
function initDropFx(){
  landRing=new THREE.Mesh(new THREE.RingGeometry(2.2,3,48),new THREE.MeshBasicMaterial({color:new THREE.Color(0x46f1ff).multiplyScalar(2),transparent:true,opacity:.75,depthWrite:false,side:THREE.DoubleSide,fog:false}));
  landRing.rotation.x=-Math.PI/2;landRing.visible=false;landRing.renderOrder=3;scene.add(landRing);
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(slP,3));
  slMesh=new THREE.LineSegments(g,new THREE.LineBasicMaterial({color:0xffffff,transparent:true,opacity:0,depthWrite:false,blending:THREE.AdditiveBlending,fog:false}));
  slMesh.frustumCulled=false;slMesh.visible=false;scene.add(slMesh);
  for(let i=0;i<SL_N;i++)slW.push(new THREE.Vector3(1e6,1e6,1e6));
}
function updateDropFx(dt){
  if(!landRing)return;
  const S=P.sky;
  if(S&&S.vel.y<0){const gh=groundHeight(P.pos.x,P.pos.z);const tf=clamp((P.pos.y-gh)/Math.max(4,-S.vel.y),0,25);
    landRing.visible=true;landRing.position.set(P.pos.x+S.vel.x*tf*.6,gh+.15,P.pos.z+S.vel.z*tf*.6);const sc=1+clamp((P.pos.y-gh)/250,0,3);landRing.scale.setScalar(sc);landRing.material.opacity=.45+.3*Math.sin(performance.now()*.008);}
  else if(P.ride&&P.ride.drop&&drop.active){const D=drop.active;const ahead=Math.min(P.pos.y*.18,120);const lx=P.pos.x+D.dir.x*ahead,lz=P.pos.z+D.dir.z*ahead;landRing.visible=true;landRing.position.set(lx,groundHeight(lx,lz)+.15,lz);landRing.scale.setScalar(2+P.pos.y/150);landRing.material.opacity=.45+.3*Math.sin(performance.now()*.008);}
  else landRing.visible=false;
  const v=S?S.vel:(P.flying?P.fv:(P.ride&&P.ride.drop?_plV:null));const sp=v?v.length():0;const k=v===_plV?clamp(.25+(sp-110)/120,.25,.8):clamp((sp-22)/40,0,1);
  if(k<=0){slMesh.visible=false;return;}
  slMesh.visible=true;slMesh.material.opacity=k*.5;const c=camera.position;
  for(let i=0;i<SL_N;i++){const w=slW[i];
    const isp=1/Math.max(sp,1),ah=(w.x-c.x)*v.x*isp+(w.y-c.y)*v.y*isp+(w.z-c.z)*v.z*isp;
    if(ah<-3||w.distanceToSquared(c)>48*48){w.set(c.x+R(-16,16),c.y+R(-10,10),c.z+R(-16,16)).addScaledVector(v,R(12,42)*isp);}
    const o=i*6,ln=.045;slP[o]=w.x;slP[o+1]=w.y;slP[o+2]=w.z;slP[o+3]=w.x-v.x*ln;slP[o+4]=w.y-v.y*ln;slP[o+5]=w.z-v.z*ln;}
  slMesh.geometry.attributes.position.needsUpdate=true;
}
// launch pads: step on one to rocket back into the sky
const pads=[];
function buildPads(){
  const spots=[clockPos(3,262),clockPos(9,262),clockPos(6,300),clockPos(7.25,392),clockPos(12,120),clockPos(1.5,420),clockPos(10.5,420),clockPos(4.5,200),clockPos(7.5,200)];
  for(const p of spots){collide(p,3);let b;
    if(PR&&PR.buildLaunchPad)b=compactProp(PR.buildLaunchPad());
    else{const g=new THREE.Group();g.add(M(G.cyl,mat(0x2a2a30,{roughness:.5,metalness:.4}),2.6,.3,2.6,0,.15,0));for(let k=0;k<3;k++){const t=new THREE.Mesh(new THREE.TorusGeometry(2.2-k*.6,.08,8,48),neon(0x46f1ff,.8));t.rotation.x=Math.PI/2;t.position.y=.35+k*.02;g.add(t);}b={g,update:()=>{}};}
    b.g.position.set(p.x,0,p.z);scene.add(b.g);pads.push({b,pos:new THREE.Vector3(p.x,0,p.z),cool:0});}
}
function updatePads(dt){
  const t=performance.now()*.001;
  for(const pd of pads){const d=d2(pd.pos,P.pos);pd.b.g.visible=d<320;if(d<250&&pd.b.update)pd.b.update(dt,t,{night});pd.cool-=dt;
    if(pd.cool<=0&&d<2.6&&!P.vehicle&&!P.sky&&!P.ride&&!P.flying&&P.pos.y<1.5){pd.cool=3;launchUp();}}
}
function launchUp(){
  P.sky={vel:new THREE.Vector3(0,72,0),heading:P.heading,canopy:null,t:0,top:P.pos.y,launch:true};
  P.onGround=false;sfx.whoosh(0);stuntText('Launch!','Steer with the mouse and W. Space opens your glider.');camDist=Math.max(camDist,9);
  for(let i=0;i<12;i++)emitPuff(P.pos.x+R(-1.5,1.5),P.pos.z+R(-1.5,1.5),1.4,.4);
}

// ================= ARMED: artsy guns, unlimited ammo, nobody gets hurt =================
let WP=null;
async function loadWeapons(){try{WP=await import('./weapons.js?v=7');if(WP.initWeapons)WP.initWeapons({glowMap});}catch(e){console.warn('weapons.js failed to load',e);WP=null;}}
const W={sys:null,guns:{},gun:null,def:null,heat:0,over:false,aiming:false,zoom:1,shake:0,nextShot:0,beamOn:false,hitT:0,spin:0,pickups:[]};
const mouse={l:false,r:false};
const WDEF=id=>WP&&WP.WEAPONS.find(w=>w.id===id);
const _wa=new THREE.Vector3(),_wb=new THREE.Vector3(),_wc=new THREE.Vector3(),_wq=new THREE.Quaternion();
function initArms(){
  if(!WP)return;W.sys=WP.createWeaponSystem(scene,camera);
  if(!state.weapons)state.weapons=[];
  buildWeaponPickups();renderHotbar();
}
function gunFor(id){
  if(W.guns[id])return W.guns[id];
  const gun=WP.buildGun(id);gun.g.traverse(o=>{if(o.isMesh){o.castShadow=true;}});W.guns[id]=gun;return gun;
}
function handBone(){return player.model.getObjectByName('handslotr')||player.model.getObjectByName('handr');}
function equip(id,quiet){
  if(!WP||!state.weapons.includes(id))return;
  if(W.gun)W.gun.g.visible=false;
  state.weapon=id;W.def=WDEF(id);W.heat=0;W.over=false;
  const gun=gunFor(id);if(gun.g.parent!==scene)scene.add(gun.g);gun.g.scale.setScalar(1.55);
  gun.g.visible=!P.vehicle&&!P.ride&&!P.hidden;W.gun=gun;
  if(!quiet){floatText(W.def.name);if(audio.ctx)WP.weaponSound(id,audio.ctx,audio.sfx,'pickup');}
  renderHotbar();
}
const GUN_ROT=new THREE.Euler(0,0,0);
function holster(){if(W.gun)W.gun.g.visible=false;state.weapon=null;W.def=null;W.aiming=false;renderHotbar();}
function giveWeapon(id,why){
  if(!WP)return;const def=WDEF(id);if(!def)return;
  const isNew=!state.weapons.includes(id);if(isNew)state.weapons.push(id);
  equip(id,true);if(audio.ctx)WP.weaponSound(id,audio.ctx,audio.sfx,'pickup');
  if(isNew){stuntText(def.name,def.blurb);if(state.weapons.length===1)setTimeout(()=>toast(touch.on?'Hold Fire to shoot, tap Aim to zoom, Swap to change guns. Ammo never runs out. Splash a Ranger and they’ll be stunned for a bit.':'Left mouse to fire, right mouse to aim. 1–0 or the mouse wheel switch guns, Q puts it away. Ammo never runs out. Splash a Ranger and they’ll be stunned for a bit.'),2200);}
  renderHotbar();saveGame();
}
function cycleWeapon(dir){if(!WP||!state.weapons.length)return;const ids=WP.WEAPONS.map(w=>w.id).filter(id=>state.weapons.includes(id));let i=ids.indexOf(state.weapon);i=(i+dir+ids.length)%ids.length;equip(ids[i]);}
function slotWeapon(n){if(!WP)return;const id=WP.WEAPONS[n]&&WP.WEAPONS[n].id;if(id&&state.weapons.includes(id))equip(id);else if(id)floatText('Not found yet: '+WDEF(id).name);}
function armed(){return !!(W.def&&W.gun&&!P.vehicle&&!P.ride&&!P.hidden&&!P.flying&&!(P.sky&&!P.sky.canopy));}
// camera ray -> world aim point
const _ap1=new THREE.Vector3(),_ap2=new THREE.Vector3();
function aimPoint(out){
  camera.getWorldDirection(_ap1);const o=camera.position;const range=W.def?W.def.range:120;
  // skip the stretch between camera and player
  let best=range;
  const tg=weaponTargets();for(const t of tg){_ap2.copy(t.pos).sub(o);const along=_ap2.dot(_ap1);if(along<2||along>best)continue;
    const cx=o.x+_ap1.x*along-t.pos.x,cz=o.z+_ap1.z*along-t.pos.z,cy=o.y+_ap1.y*along-t.pos.y;if(cx*cx+cz*cz<t.r*t.r*1.4&&cy>-.2&&cy<t.h+.2)best=along;}
  if(_ap1.y<-.001){const tg2=(o.y-0)/-_ap1.y;if(tg2<best)best=Math.max(2,tg2);}
  return out.copy(o).addScaledVector(_ap1,best);
}
let _targets=[],_targetsFrame=-1;
function weaponTargets(){
  if(_targetsFrame===frameNo)return _targets;_targetsFrame=frameNo;_targets.length=0;const f=P.pos;
  for(const r of RG.list)if(r.g.visible&&d2(r.pos,f)<160)_targets.push({pos:r.pos,r:.55,h:1.9,ref:r});
  for(const n of npcs){const g=n.p.g;if(g.visible&&d2(g.position,f)<90)_targets.push({pos:g.position,r:.5,h:1.8,ref:n});}
  return _targets;
}
function updateArms(dt){
  if(!W.sys)return;
  const on=armed();if(W.gun)W.gun.g.visible=on;
  W.aiming=on&&mouse.r;W.zoom=W.aiming&&W.def?W.def.zoom:1;
  if(W.def){W.heat=Math.max(0,W.heat-W.def.coolRate*dt*(W.over?1.4:1));if(W.over&&W.heat<=.05){W.over=false;}}
  if(W.kick>0){const rec=Math.min(W.kick,W.kick*Math.min(1,dt*7)+dt*.02);W.kick-=rec;camPitch=clamp(camPitch+rec,-.55,1.25);}
  W.nextShot-=dt;W.shake=Math.max(0,W.shake-dt*3);W.hitT-=dt;
  // the gun rides in Phoenix's hand and always points at the crosshair
  if(on&&W.gun){const hb=handBone();if(hb){hb.getWorldPosition(_wb);W.gun.g.position.copy(_wb);aimPoint(_wc);W.gun.g.lookAt(_wc);W.gun.g.updateMatrixWorld(true);}}
  const firing=on&&mouse.l&&!W.over&&state.started&&!state.paused;
  if(W.gun&&W.gun.update)W.gun.update(dt,performance.now()*.001,firing,W.heat);
  const def=W.def;
  if(def&&def.speed===Infinity){
    if(firing){W.gun.muzzle.getWorldPosition(_wb);aimPoint(_wc);_wa.copy(_wc).sub(_wb).normalize();W.sys.beam(def.id,_wb,_wa,true);W.heat+=def.heatPerShot*def.rate*dt;W.beamOn=true;W.shake=Math.max(W.shake,def.shake*.5);
      if(W.nextShot<=0){W.nextShot=1/def.rate;if(audio.ctx)WP.weaponSound(def.id,audio.ctx,audio.sfx,'fire');}}
    else if(W.beamOn){W.sys.beam(def.id,_wb,_wa,false);W.beamOn=false;}
  }else if(def&&firing&&W.nextShot<=0&&(def.auto||W.trigger)){
    W.trigger=false;W.nextShot=1/def.rate;
    W.gun.muzzle.getWorldPosition(_wb);aimPoint(_wc);_wa.copy(_wc).sub(_wb).normalize();
    let homing=null;if(def.id==='firework'){let bd=1e9;for(const t of weaponTargets()){if(!(t.ref&&t.ref.isRanger))continue;_wc.copy(t.pos).sub(camera.position);const al=_wc.dot(camera.getWorldDirection(_wq.__v||(_wq.__v=new THREE.Vector3())));if(al<0)continue;const dd=_wc.length();const ang=al/dd;if(ang>.9&&dd<bd){bd=dd;homing={pos:t.pos};}}}
    W.sys.fire(def.id,_wb,_wa,homing?{homingTarget:homing}:undefined);W.sys.muzzleFlash(W.gun.muzzle,def.id);
    W.heat+=def.heatPerShot;if(W.heat>=1){W.heat=1;W.over=true;if(audio.ctx)WP.weaponSound(def.id,audio.ctx,audio.sfx,'overheat');floatText('Overheated!');}
    {const k=def.recoil*(W.aiming?.5:1);camPitch=clamp(camPitch-k,-.55,1.25);W.kick=(W.kick||0)+k;}camYaw+=R(-1,1)*def.recoil*.3;W.shake=Math.max(W.shake,def.shake);
    if(audio.ctx)WP.weaponSound(def.id,audio.ctx,audio.sfx,'fire');
    state.stats.shots=(state.stats.shots||0)+1;state.stats.gunUse=state.stats.gunUse||{};state.stats.gunUse[def.id]=(state.stats.gunUse[def.id]||0)+1;
    // burners nearby react
    if(frameNo%3===0)for(let i=0;i<crowdN;i++){if((cX[i]-P.pos.x)**2+(cZ[i]-P.pos.z)**2<200)crowdCheer(i,1.5);}
  }
  const hits=W.sys.update(dt,{targets:weaponTargets(),groundHeight,solid:null,light:clamp(1-night,.12,1)});
  if(hits&&hits.length)for(const h of hits)onWeaponHit(h);
  updateWeaponPickups(dt);updateCrosshair();
}
function onWeaponHit(h){
  const ref=h.ref;
  if(ref&&ref.isRanger){rangerHit(ref,h);if(h.direct||h.effect!=='paint'){W.hitT=.18;}}
  else if(ref&&ref.p){ref.happy=Math.max(ref.happy||0,2.5);}
  if(h.direct&&audio.ctx&&h.point&&h.point.distanceTo(P.pos)<60)WP.weaponSound(h.weapon.id,audio.ctx,audio.sfx,'impact');
}
// pickups around the city
function buildWeaponPickups(){
  if(!WP)return;const ids=WP.WEAPONS.map(w=>w.id).filter(id=>id!==WP.START_WEAPON);
  const spots=[];
  for(let i=0;i<artSpots.length&&spots.length<ids.length*2;i+=2){const p=artSpots[i].clone();p.x+=6;p.z+=6;spots.push(p);}
  spots.forEach((p,i)=>{collide(p,1.5);const id=ids[i%ids.length];const def=WDEF(id);
    let b;if(PR&&PR.buildWeaponPickup)b=compactProp(PR.buildWeaponPickup(def.color));else{const g=new THREE.Group();g.add(M(G.cyl,mat(0x2a2a30),.6,1,.6,0,.5,0));const mount=new THREE.Object3D();mount.position.y=1.6;g.add(mount);b={g,mount,update:()=>{}};}
    const gun=compactProp(WP.buildGun(id));gun.g.scale.setScalar(1.4);b.mount.add(gun.g);
    b.g.position.set(p.x,0,p.z);scene.add(b.g);W.pickups.push({id,b,gun,pos:new THREE.Vector3(p.x,0,p.z),taken:false,respawn:0});});
}
function updateWeaponPickups(dt){
  const t=performance.now()*.001;
  for(const pk of W.pickups){const d=d2(pk.pos,P.pos);const near=d<200;pk.b.g.visible=d<260;
    if(near){pk.b.update&&pk.b.update(dt,t,{night});if(pk.b.mount){pk.b.mount.rotation.y+=dt*1.2;pk.b.mount.position.y=1.6+Math.sin(t*2+pk.pos.x)*.08;}}
    if(pk.taken){pk.respawn-=dt;if(pk.respawn<=0){pk.taken=false;pk.gun.g.visible=true;}continue;}
    if(d<2.2&&!P.vehicle&&P.pos.y<3){pk.taken=true;pk.respawn=90;pk.gun.g.visible=false;giveWeapon(pk.id);}}
}
// HUD: crosshair, heat, hotbar
function updateCrosshair(){
  const ch=$('#crosshair');if(!ch)return;const on=armed()&&state.started;ch.hidden=!on;if(!on)return;
  const def=W.def;const moving=Math.hypot(P.vel.x,P.vel.z)>1;const spread=(def.spread*(W.aiming?.4:1)*(moving?1.6:1))*500+6;
  ch.style.setProperty('--sp',spread.toFixed(1)+'px');ch.style.setProperty('--heat',W.heat.toFixed(3));ch.classList.toggle('hit',W.hitT>0);ch.classList.toggle('over',W.over);ch.style.setProperty('--wc','#'+def.color.toString(16).padStart(6,'0'));
}
function renderHotbar(){
  const hb=$('#hotbar');if(!hb||!WP)return;
  hb.innerHTML=WP.WEAPONS.map((w,i)=>{const own=state.weapons&&state.weapons.includes(w.id);return `<div class="slot${own?'':' empty'}${state.weapon===w.id?' on':''}" style="--wc:#${w.color.toString(16).padStart(6,'0')}"><b>${(i+1)%10}</b><span>${own?esc(w.name):'?'}</span></div>`;}).join('');
  hb.hidden=!state.weapons||!state.weapons.length;
}

// ================= THE MANHUNT: the Dusty City Rangers are looking for Phoenix =================
// Word got around that a fiery bird-person has been seen flying over the city. The Rangers would very much
// like to "have a chat". Wanted level 0–5 stars. Hide, blend into crowds, change costumes, or ride out a dust storm.
const _UPV=new THREE.Vector3(0,1,0);
const RG={list:[],drones:[],towers:[],blimp:null,outpost:null,outpostSpot:null,hides:[],racks:[],spawnT:3,seenT:0,searchT:0,lastSeen:new THREE.Vector3(),everSeen:false,disguise:0,chaseMsgT:0,iconTex:{}};
const RANGER_LINES=['Phoenix! Hold up, we just want to talk!','Bird-person spotted! Moving in.','Copy that, flaming feathers at my twelve.','Sir! Ma’am! Wings! Please stop!','Dispatch, I have eyes on the Phoenix.','Nobody flies over the Man on my shift!'];
const LOST_LINES=['Lost visual. Anyone see where the bird went?','Dispatch, Phoenix is gone. Again.','Checking the porta-potties… every single one.','Was that a costume change? Ugh.'];
function iconSprite(ch,col){
  const key=ch+col;let t=RG.iconTex[key];
  if(!t){const c=document.createElement('canvas');c.width=c.height=128;const g=c.getContext('2d');g.fillStyle='rgba(20,15,11,.85)';g.beginPath();g.arc(64,64,52,0,TAU);g.fill();g.lineWidth=8;g.strokeStyle=col;g.stroke();g.fillStyle=col;g.font='900 78px Rubik, system-ui, sans-serif';g.textAlign='center';g.textBaseline='middle';g.fillText(ch,64,70);t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;RG.iconTex[key]=t;}
  const sp=new THREE.Sprite(new THREE.SpriteMaterial({map:t,depthWrite:false,depthTest:false,transparent:true}));sp.scale.set(.8,.8,.8);sp.position.y=2.55;sp.renderOrder=5;return sp;
}
function makeRanger(){
  const officer=rnd()<.25;
  const c=makeCharacter({mask:false,kind:officer?'knight':'rogue',body:0xd9c690,cape:0xb39a5e,hat:officer?0x8a7a4a:0xc9b57c,neon:0xffa21a});
  // khaki vest stripe + radio antenna so they read as Rangers from far away
  const vest=new THREE.Mesh(new THREE.TorusGeometry(.33,.05,6,20),neon(0xffa21a,.6));vest.rotation.x=Math.PI/2;vest.position.y=1.15;c.g.add(vest);
  const ant=M(G.cyl,mat(0x222222),.012,.5,.012,.18,2.05,-.12);c.g.add(ant);
  const q=iconSprite('?','#ffd23f'),ex=iconSprite('!','#ff3b2e');q.visible=ex.visible=false;c.g.add(q,ex);
  scene.add(c.g);
  const r={isRanger:true,c,g:c.g,pos:c.g.position,heading:R(0,TAU),st:'patrol',stT:0,sus:0,target:new THREE.Vector3(),fx:null,fxT:0,fxIcon:null,speed:0,q,ex,radioT:R(2,8),bob:0,lift:0,vy:0,officer};
  RG.list.push(r);return r;
}
function rangerSpawnPoint(minD,maxD){
  const f=P.pos;let best=null;
  for(let k=0;k<12;k++){const a=camYaw+R(-1.3,1.3);const d=R(minD,maxD);const p=new THREE.Vector3(f.x+Math.sin(a)*d,0,f.z+Math.cos(a)*d);// behind-ish the camera means out of view
    if(Math.hypot(p.x,p.z)>FENCE_IN-12)continue;collide(p,.6);best=p;break;}
  return best||new THREE.Vector3(f.x+R(-90,90),0,f.z+R(-90,90));
}
function buildManhunt(){
  for(let i=0;i<6;i++){const r=makeRanger();r.pos.copy(rangerSpawnPoint(60,160));newPatrol(r);}
  // outpost
  const op=clockPos(4.3,300);collide(op,6);
  if(PR&&PR.buildRangerOutpost){const b=compactProp(PR.buildRangerOutpost());b.g.position.set(op.x,0,op.z);b.g.rotation.y=-4.3/12*TAU+Math.PI;scene.add(b.g);RG.outpost=b;
    if(b.obs)for(const o of b.obs){const c=Math.cos(b.g.rotation.y),s2=Math.sin(b.g.rotation.y);obstacles.push({x:op.x+o[0]*c+o[1]*s2,z:op.z-o[0]*s2+o[1]*c,r:o[2]});}
    RG.outpostSpot=b.spot?b.g.localToWorld(b.spot.clone()):op.clone();}
  else RG.outpostSpot=op.clone();
  RG.outpostSpot.y=0;
  // searchlight towers around the city
  if(PR&&PR.buildSearchTower)for(const [h,r] of [[2.5,470],[5,480],[7,480],[9.5,470],[12,250],[3,150],[9,150]]){const p=clockPos(h,r);collide(p,3);const b0=PR.buildSearchTower();const b=compactProp(b0,[b0.head,b0.beam]);b.g.position.set(p.x,0,p.z);scene.add(b.g);
    if(b.obs)for(const o of b.obs)obstacles.push({x:p.x+o[0],z:p.z+o[1],r:o[2]});RG.towers.push({b,pos:new THREE.Vector3(p.x,0,p.z),ph:R(0,TAU),sp:R(.25,.45),aim:new THREE.Vector3()});}
  // porta-potty hiding spots: one decorated porta in every camp district, plus the static banks
  if(PR&&PR.buildPorta)for(let i=0;i<22;i++){const h=2.3+i*(7.4/22),r=pick(STREETS)[1]+R(-2,2);const p=clockPos(h,r);collide(p,1.2);const b0=PR.buildPorta();const b=compactProp(b0,[b0.door]);b.g.position.set(p.x,0,p.z);b.g.rotation.y=-h/12*TAU+(rnd()<.5?0:Math.PI);scene.add(b.g);obstacles.push({x:p.x,z:p.z,r:.9});
    const front=new THREE.Vector3(0,0,1.4).applyAxisAngle(_UPV,b.g.rotation.y).add(b.g.position);RG.hides.push({b,pos:new THREE.Vector3(p.x,0,p.z),front,door:0,want:0,occ:false});}
  // free costume racks: change your look, lose the heat
  if(PR&&PR.buildCostumeRack)for(const [h,r] of [[2.5,305],[4,335],[5.5,395],[6.5,305],[8,335],[9.5,395],[7.25,350],[3,425],[9,425]]){const p=clockPos(h,r);collide(p,2);const b=compactProp(PR.buildCostumeRack());b.g.position.set(p.x,0,p.z);b.g.rotation.y=-h/12*TAU+Math.PI;scene.add(b.g);
    if(b.obs)for(const o of b.obs){const c=Math.cos(b.g.rotation.y),s2=Math.sin(b.g.rotation.y);obstacles.push({x:p.x+o[0]*c+o[1]*s2,z:p.z-o[0]*s2+o[1]*c,r:o[2]});}RG.racks.push({b,pos:new THREE.Vector3(p.x,0,p.z),cool:0});}
}
function newPatrol(r){const f=P.pos;const a=R(0,TAU),d=R(15,70);r.target.set(r.pos.x+Math.sin(a)*d,0,r.pos.z+Math.cos(a)*d);if(rnd()<.35)r.target.set(f.x+R(-60,60),0,f.z+R(-60,60));if(Math.hypot(r.target.x,r.target.z)>FENCE_IN-15)r.target.multiplyScalar(.8);}
function wantedStars(){return Math.floor(state.wanted||0);}
function setWanted(v){const before=wantedStars();state.wanted=clamp(v,0,5.99);const after=wantedStars();
  if(after>before){sfx.ranger();if(after>=2&&before<2)toast('More Rangers are joining the search.');if(after===3)toast('Ranger drones are up. Stay under cover.');if(after===5)toast('The Ranger blimp is out. They really want that chat.');}
}
// can this ranger see Phoenix right now? returns detection rate (0 = not seen)
function playerVisibility(){
  if(P.hidden)return 0;let v=1;
  if(P.flying||P.sky)v*=2.5;
  if(P.vehicle)v*=P.vehicle.kind==='art'?.6:1.2;
  if(!P.vehicle&&!P.flying&&!P.sky){const crowd=crowdAround(P.pos.x,P.pos.z,6);if(crowd>=5)v*=P.dancing?.12:.35;else if(crowd>=2)v*=.7;}
  if(RG.disguise>0)v*=.45;
  if(P.sitting)v*=.6;
  return v;
}
function crowdAround(x,z,rad){let n=0;const r2=rad*rad;for(let i=0;i<crowdN;i+=2){if(!crowdActive(i))continue;if((cX[i]-x)**2+(cZ[i]-z)**2<r2)n+=2;}for(const q of npcs){const g=q.p.g.position;if((g.x-x)**2+(g.z-z)**2<r2)n++;}return n;}
function lineClear(a,b){
  const dx=b.x-a.x,dz=b.z-a.z,len=Math.hypot(dx,dz);if(b.y>9)return true;
  for(let t=2;t<len-1.5;t+=1.5){const x=a.x+dx*t/len,z=a.z+dz*t/len;for(const o of obstaclesNear(x,z)){if(o.ramp||o.r<.7)continue;if((x-o.x)**2+(z-o.z)**2<o.r*o.r)return false;}}
  return true;
}
function viewDist(){const base=lerp(28,48,1-night);return lerp(base,9,state.dust);}
function updateManhunt(dt){
  if(!RG.list.length)return;
  RG.grace=Math.max(0,(RG.grace||0)-dt);
  const f=P.vehicle?P.vehicle.pos:P.pos;const vis=RG.grace>0||P.ride?0:playerVisibility();const st=wantedStars();const vd=viewDist();
  RG.disguise=Math.max(0,RG.disguise-dt);
  let seenNow=false,seer=null;
  // keep the right number of rangers near Phoenix
  const want=6+st*2;RG.spawnT-=dt;
  if(RG.spawnT<=0){RG.spawnT=st?2.5:6;
    let far=null;for(const r of RG.list){if(d2(r.pos,f)>230&&r.st!=='chase'){far=r;break;}}
    if(far){far.pos.copy(rangerSpawnPoint(st?55:80,st?120:170));far.st=st?'search':'patrol';far.stT=0;far.sus=0;if(st)far.target.copy(RG.lastSeen).add(_wa.set(R(-12,12),0,R(-12,12)));else newPatrol(far);}
    else if(RG.list.length<want&&RG.list.length<18){const r=makeRanger();r.pos.copy(rangerSpawnPoint(st?55:80,st?120:170));r.st=st?'search':'patrol';if(st)r.target.copy(RG.lastSeen);else newPatrol(r);}}
  const t=performance.now()*.001;
  for(const r of RG.list){
    const d=d2(r.pos,f);const near=d<220;r.g.visible=d<260;
    // status effects from the guns
    if(r.fx){r.fxT-=dt;if(r.fxT<=0){r.fx=null;if(r.fxIcon){r.g.remove(r.fxIcon);r.fxIcon=null;}r.lift=0;}}
    if(r.fxIcon&&r.fxIcon.userData.update)r.fxIcon.userData.update(dt,t);
    const fx=r.fx;
    if(fx==='stun'||fx==='knockback'){r.speed=0;if(near){play(r.c,r.fxT>.6?'Lie_Idle':'Sit_Floor_Idle',.2);r.c.mixer.update(dt);}r.q.visible=r.ex.visible=false;r.g.position.y=lerp(r.g.position.y,0,dt*6);continue;}
    if(fx==='trap'){r.speed=0;r.lift=Math.min(3.2,r.lift+dt*1.6);r.g.position.y=r.lift+Math.sin(t*2+r.heading)*.15;r.g.rotation.y+=dt*.8;if(near){play(r.c,'Jump_Idle',.2);r.c.mixer.update(dt);}r.q.visible=r.ex.visible=false;continue;}
    if(r.g.position.y>0){r.vy-=20*dt;r.g.position.y=Math.max(0,r.g.position.y+r.vy*dt);if(r.g.position.y===0)r.vy=0;}
    // perception
    let sees=0;const blind=fx==='blind'||fx==='confuse';
    if(!blind&&vis>0&&d<vd*(P.flying||P.sky?3:1)){
      const ang=Math.atan2(f.x-r.pos.x,f.z-r.pos.z);const da=Math.abs(((ang-r.heading+Math.PI)%TAU+TAU)%TAU-Math.PI);
      if((da<1.0||d<5)&&lineClear(r.pos,f))sees=vis*(1.4-d/(vd*1.6))*(r.st==='chase'||r.st==='search'?2:1)*(st?1.6:1);}
    if(sees>0){r.sus=Math.min(1.2,r.sus+dt*sees*1.15);}else r.sus=Math.max(0,r.sus-dt*.25);
    if(r.sus>=1){seenNow=true;seer=r;if(r.st!=='chase'){r.st='chase';r.stT=0;if(rnd()<.6)rangerSay(r,pick(RANGER_LINES));}}
    else if(r.sus>.25&&r.st==='patrol'){r.st='notice';r.stT=0;}
    // behaviour
    r.stT+=dt;let tx=r.target.x,tz=r.target.z,spd=0;
    if(fx==='confuse'){if(r.stT>1.2){r.stT=0;r.target.set(r.pos.x+R(-8,8),0,r.pos.z+R(-8,8));}spd=2.5;}
    else if(r.st==='chase'){tx=f.x;tz=f.z;spd=7+st*.65;if(sees<=0&&r.sus<.6){r.st='search';r.stT=0;r.target.copy(RG.lastSeen);}}
    else if(r.st==='notice'){tx=f.x;tz=f.z;spd=0;if(r.sus<.1){r.st='patrol';newPatrol(r);}}
    else if(r.st==='search'){spd=4.2+st*.3;if(d2(r.pos,r.target)<2.5){r.target.set(RG.lastSeen.x+R(-18,18),0,RG.lastSeen.z+R(-18,18));}if(r.stT>30&&!st){r.st='patrol';newPatrol(r);}}
    else{spd=1.6;if(d2(r.pos,r.target)<2||r.stT>25){r.stT=0;newPatrol(r);}}
    if(fx==='slow')spd*=.3;if(fx==='blind')spd=Math.min(spd,2);
    if(r.hold){spd=0;tx=r.pos.x+Math.sin(r.heading);tz=r.pos.z+Math.cos(r.heading);}
    const wantH=Math.atan2(tx-r.pos.x,tz-r.pos.z);r.heading=lerpAngle(r.heading,wantH,Math.min(1,dt*(r.st==='chase'?7:3)));
    r.speed=lerp(r.speed,spd,Math.min(1,dt*4));
    r.pos.x+=Math.sin(r.heading)*r.speed*dt;r.pos.z+=Math.cos(r.heading)*r.speed*dt;
    if(collide(r.pos,.4,true)&&r.st!=='chase')r.target.set(r.pos.x+R(-20,20),0,r.pos.z+R(-20,20));
    r.g.rotation.y=r.heading;
    if(near){if(d>90&&frameNo%3)continue;animPerson(r.c,r.speed>.3?'walk':(r.st==='notice'?'idle':'idle'),dt*(d>90?3:1),r.speed);}
    r.q.visible=r.st==='notice'||(r.st==='search'&&Math.sin(t*4)>0);r.ex.visible=r.st==='chase';
    r.radioT-=dt;
    // caught!
    if(r.st==='chase'&&!fx&&d<(P.vehicle?P.vehicle.r+1.2:1.25)&&!P.flying&&!P.sky&&!P.ride&&f.y<2.5)caught(r);
  }
  // drones, towers, blimp
  updateDrones(dt,f,vis,st,(seen,who)=>{if(seen){seenNow=true;seer=seer||who;}});
  // wanted level bookkeeping
  if(seenNow){RG.lastSeen.copy(f);RG.seenT=0;RG.everSeen=true;if(st===0)setWanted(1);
    if(P.flying||P.sky)setWanted(state.wanted+dt*.25);
    if(RG.chaseMsgT<=0&&st===0){RG.chaseMsgT=20;toast('A Ranger spotted you! Break line of sight, hide in a porta-potty, blend into a dancing crowd, or grab a new costume.');}
    for(const r of RG.list){if(r.st!=='chase'&&!r.fx&&d2(r.pos,f)<60&&r.st!=='search'){r.st='search';r.stT=0;r.target.copy(f);}}
  }else if(st>0){RG.seenT+=dt;const need=7+st*3;if(RG.seenT>need){RG.seenT=0;setWanted(state.wanted-1);if(wantedStars()===0){toast(pick(LOST_LINES).replace(/^/,'Ranger radio: "')+'"');floatText('You got away');addKarma(5,'clean getaway');state.stats.escapes=(state.stats.escapes||0)+1;for(const r of RG.list){if(r.st!=='patrol'){r.st='patrol';newPatrol(r);}}}}}
  RG.chaseMsgT-=dt;
  grade.uniforms.uAlert.value=lerp(grade.uniforms.uAlert.value,st>0&&RG.seenT<1.5?Math.min(1,.4+st*.15):0,Math.min(1,dt*3));
  updateHides(dt);updateRacks(dt);
}
function rangerSay(r,line){if(r.radioT>0)return;r.radioT=R(6,12);if(d2(r.pos,P.pos)<60){const b=makeBubble(line);b.position.y=3.2;r.g.add(b);setTimeout(()=>{r.g.remove(b);b.material.map.dispose();b.material.dispose();},3200);}sfx.ranger();}
function rangerHit(r,h){
  const e=h.effect||'stun';const dur=(h.effectDur||3)*(h.direct?1:.7);
  const was=!!r.fx;
  if(r.fx&&r.fxIcon){r.g.remove(r.fxIcon);r.fxIcon=null;}
  r.fx=e;r.fxT=Math.max(r.fxT||0,dur);r.st='search';r.sus=Math.max(r.sus,.6);
  if(WP&&WP.hitEffectSprite){r.fxIcon=WP.hitEffectSprite(e);r.fxIcon.position.y=2.4;r.g.add(r.fxIcon);}
  if(e==='knockback'&&h.dir){r.pos.addScaledVector(_wa.set(h.dir.x,0,h.dir.z).normalize(),4);r.vy=6;r.g.position.y=.01;collide(r.pos,.4,true);}
  if(e==='trap')r.lift=Math.max(r.lift,.2);
  state.stats.stunned=(state.stats.stunned||0)+(h.direct?1:0);state.stats.hits=(state.stats.hits||0)+1;
  RG.lastSeen.copy(P.pos);RG.seenT=0;if(h.direct&&!was)setWanted(Math.max(1,state.wanted+.25));
  if(h.direct&&rnd()<.3)rangerSay(r,pick(['Hey! That’s glitter! That never comes out!','Paint?! I just washed this vest!','Ooh, pretty… I mean, stop!','I can’t see! Is it art? Is this art?']));
}
let caughtLock=false;
function caught(r){
  if(caughtLock)return;caughtLock=true;sfx.ranger();state.stats.rangers++;
  modal('Ranger chat',pick([
    'A Ranger in a dusty khaki vest catches up, completely out of breath. "Phoenix. Buddy. You cannot keep flying over the burn perimeter. People think you’re a firework." They walk you to the outpost for a cup of tea and a long talk about airspace.',
    '"Gotcha!" The Ranger grins and taps your shoulder. "Tag, you’re talked-to." Twenty minutes later you know far more about playa safety than you ever wanted to.',
    'The Ranger doesn’t even look mad. "Look, the wings are amazing. But the glitter cannon? We’re finding sparkles in the porta-potties." You’re escorted to the outpost for a friendly chat.']),'Fair enough',()=>{
    if(P.vehicle)exitVehicle();if(state.job&&state.job.id==='shuttle')endJob(false,'The Rangers hand the art car back to its crew.',0);
    const sp=RG.outpostSpot||CAMP;P.pos.set(sp.x+R(-2,2),0,sp.z+R(-2,2));P.vel.set(0,0,0);
    state.wanted=0;RG.seenT=0;addKarma(-5,'ranger chat');
    for(const q of RG.list){q.st='patrol';q.sus=0;q.pos.copy(rangerSpawnPoint(80,170));newPatrol(q);}
    caughtLock=false;});
}
// drones, searchlight towers and the blimp
const _drv=new THREE.Vector3();
function updateDrones(dt,f,vis,st,report){
  const t=performance.now()*.001;const wantDrones=st>=3||(st>=2&&night>.5)?Math.min(4,st-1):0;
  if(PR&&PR.buildRangerDrone)while(RG.drones.length<wantDrones){const b=PR.buildRangerDrone();scene.add(b.g);const p=rangerSpawnPoint(70,120);b.g.position.set(p.x,28,p.z);RG.drones.push({b,pos:b.g.position,ph:R(0,TAU),r:R(10,22)});}
  for(let i=RG.drones.length-1;i>=0;i--){const dr=RG.drones[i];
    if(i>=wantDrones){dr.pos.y+=dt*15;if(dr.pos.y>120){scene.remove(dr.b.g);RG.drones.splice(i,1);}continue;}
    const c=RG.lastSeen;const a=t*.6+dr.ph;_drv.set(c.x+Math.cos(a)*dr.r,24+Math.sin(t+dr.ph)*2,c.z+Math.sin(a*1.3)*dr.r);
    dr.pos.lerp(_drv,Math.min(1,dt*.8));dr.b.update&&dr.b.update(dt,t,{night});
    if(dr.b.cone){dr.b.cone.scale.set(1,dr.pos.y,1);}
    if(vis>0&&Math.hypot(f.x-dr.pos.x,f.z-dr.pos.z)<6.5&&f.y<dr.pos.y)report(true,dr);
  }
  for(const tw of RG.towers){const d=d2(tw.pos,f);const act=night>.4||st>=2;tw.b.g.visible=d<900;if(!tw.b.g.visible)continue;tw.b.update&&tw.b.update(dt,t,{night});
    if(tw.b.beam)tw.b.beam.visible=act;if(!act)continue;
    // sweep, and lock on to Phoenix if wanted and close
    const sweep=t*tw.sp+tw.ph;const R0=st>0&&d<140?d:60+Math.sin(sweep*.7)*35;
    _drv.set(tw.pos.x+Math.sin(sweep)*R0,0,tw.pos.z+Math.cos(sweep)*R0);if(st>0&&d<140)_drv.lerp(RG.lastSeen,.8);
    tw.aim.lerp(_drv,Math.min(1,dt*1.5));
    if(tw.b.head){const hp=new THREE.Vector3();tw.b.head.getWorldPosition(hp);const dx=tw.aim.x-hp.x,dz=tw.aim.z-hp.z,dy=-hp.y;const hd=Math.hypot(dx,dz);tw.b.head.rotation.y=Math.atan2(dx,dz)-tw.b.g.rotation.y;tw.b.head.rotation.x=-Math.atan2(dy,hd);if(tw.b.beam)tw.b.beam.scale.z=Math.hypot(hd,dy);}
    if(vis>0&&Math.hypot(f.x-tw.aim.x,f.z-tw.aim.z)<5&&f.y<20&&!P.hidden)report(true,tw);
  }
  if(st>=5&&!RG.blimp&&PR&&PR.buildRangerBlimp){const b=PR.buildRangerBlimp();scene.add(b.g);b.g.position.set(f.x+200,90,f.z);RG.blimp={b,pos:b.g.position};}
  if(RG.blimp){const B=RG.blimp;const tgt=st>=4?RG.lastSeen:_drv.set(B.pos.x+300,0,B.pos.z);_drv.set(tgt.x,st>=4?85:140,tgt.z);B.pos.lerp(_drv,Math.min(1,dt*.15));B.b.g.rotation.y=lerpAngle(B.b.g.rotation.y,Math.atan2(tgt.x-B.pos.x,tgt.z-B.pos.z),dt*.3);B.b.update&&B.b.update(dt,t,{night});
    if(B.b.head)B.b.head.rotation.x=Math.PI/2;if(B.b.beam){B.b.beam.scale.z=B.pos.y;}
    if(vis>0&&st>=4&&Math.hypot(f.x-B.pos.x,f.z-B.pos.z)<9)report(true,B);
    if(st<4&&B.pos.y>130){scene.remove(B.b.g);RG.blimp=null;}}
}
// hiding in porta-potties
function nearHide(){let best=null,bd=2.6;for(const h of RG.hides){const d=d2(h.front,P.pos);if(d<bd){bd=d;best=h;}}return best;}
function enterHide(h){
  P.hidden=h;h.occ=true;h.want=1;if(h.b.setOccupied)h.b.setOccupied(true);player.g.visible=false;if(W.gun)W.gun.g.visible=false;
  P.vel.set(0,0,0);P.pos.copy(h.pos);sfx.chime();
  const watched=RG.list.some(r=>r.st==='chase'&&d2(r.pos,h.pos)<12);
  if(watched){RG.lastSeen.copy(h.pos);for(const r of RG.list)if(r.st==='chase'){r.st='search';r.target.copy(h.front);r.stT=0;}h.suspect=true;floatText('They saw you go in…');}
  else{h.suspect=false;floatText('Hidden. Press E to step out.');}
  setTimeout(()=>{h.want=0;},700);
}
function leaveHide(quiet){const h=P.hidden;if(!h)return;P.hidden=null;h.occ=false;h.want=1;if(h.b.setOccupied)h.b.setOccupied(false);setTimeout(()=>{h.want=0;},900);
  P.pos.copy(h.front);player.g.visible=true;P.heading=Math.atan2(h.front.x-h.pos.x,h.front.z-h.pos.z);if(!quiet)sfx.chime();}
function updateHides(dt){
  for(const h of RG.hides){const dh=d2(h.pos,P.pos);h.b.g.visible=dh<(night>.5?260:200);h.door=lerp(h.door,h.want,Math.min(1,dt*8));if(h.b.door)h.b.door.rotation.y=-1.9*h.door;}
  const h=P.hidden;if(!h)return;
  // a suspicious ranger knocks and opens the door
  if(h.suspect)for(const r of RG.list){if(!r.fx&&d2(r.pos,h.front)<1.6){h.want=1;leaveHide(true);caught(r);return;}}
  if(wantedStars()>0&&!h.suspect){RG.seenT+=dt*.8;}
}
function updateRacks(dt){for(const k of RG.racks){k.cool-=dt;const d=d2(k.pos,P.pos);k.b.g.visible=d<240;if(d<200&&k.b.update)k.b.update(dt,performance.now()*.001,{night});}}
function nearRack(){for(const k of RG.racks)if(d2(k.pos,P.pos)<3.4)return k;return null;}
function useRack(k){
  if(k.cool>0){floatText('The closet is being restocked.');return;}k.cool=40;
  const ids=OUTFITS.filter(o=>o.id!==state.outfit&&(!o.unlock||state.unlocks[o.unlock])).map(o=>o.id);if(ids.length)wearOutfit(pick(ids));
  RG.disguise=60;const seen=RG.list.some(r=>r.st==='chase'&&r.sus>=1);
  if(wantedStars()>0&&!seen){setWanted(state.wanted-1);floatText('New look. One star off.');}else floatText('New look!');
  oneShot(player,'Interact',.9);sfx.chime();
}

function unlockGlider(){const order=['parachute','phoenix','butterfly','balloon'];state.gliders=state.gliders||['parachute'];const next=order.find(x=>!state.gliders.includes(x));const n=state.stats.skydives||0;if(next&&n>=order.indexOf(next)*2-1){state.gliders.push(next);state.glider=next;const gl=PR&&PR.GLIDERS&&PR.GLIDERS.find(x=>x.id===next);setTimeout(()=>stuntText('New glider: '+(gl?gl.name:next),'Equipped. Change it in the phone wardrobe (Tab).'),2600);}}
function onDropLanded(first){state.landed=true;
  RG.grace=first?50:20;for(const r of RG.list){if(d2(r.pos,P.pos)<70&&r.st!=='chase'){r.pos.copy(rangerSpawnPoint(90,170));newPatrol(r);}}
  if(WP&&!state.weapons.includes(WP.START_WEAPON)){setTimeout(()=>giveWeapon(WP.START_WEAPON),3800);}
  if(first)setTimeout(()=>toast('Welcome home, Phoenix. Word is the Rangers are looking for a fiery bird-person. Keep your head down and press B any time to call the drop plane back.'),3200);
}
// ================= ambient skydivers =================
const ambientSky={plane:null,t:25,active:null,divers:[]};
function updateAmbientSky(dt){
  const h=state.time%24;const A=ambientSky;
  if(!A.active){A.t-=dt;if(A.t<=0&&state.dust<.2&&!(h>4&&h<6.5)){const a=R(0,TAU);const start=new THREE.Vector3(Math.cos(a)*2600,R(850,1000),Math.sin(a)*2600);const head=Math.atan2(-start.x,-start.z)+R(-.25,.25);A.active={pos:start,head,drops:0,t:0};A.plane.g.visible=true;}}
  else{const F=A.active;F.t+=dt;const pl=A.plane;F.pos.x+=Math.sin(F.head)*60*dt;F.pos.z+=Math.cos(F.head)*60*dt;pl.g.position.copy(F.pos);pl.g.rotation.y=F.head;pl.prop.rotation.z+=dt*40;
    const r=Math.hypot(F.pos.x,F.pos.z);if(r<380&&F.drops<7&&F.t>(F.lastDrop||0)+.9){F.lastDrop=F.t;F.drops++;spawnDiver(F.pos,F.head);}
    if(F.t>95){A.active=null;pl.g.visible=false;A.t=R(55,120);}}
  for(let i=A.divers.length-1;i>=0;i--){const d=A.divers[i];d.t+=dt;const p=d.c.g.position;const gh=groundHeight(p.x,p.z);
    if(d.landed){d.landed-=dt;if(d.near)animPerson(d.c,'dance',dt,0);if(d.landed<=0){scene.remove(d.c.g);if(d.canopy)scene.remove(d.canopy);A.divers.splice(i,1);}continue;}
    if(!d.canopy){d.v.y=Math.max(d.v.y-9.8*dt,-52);if(p.y-gh<150){d.canopy=makeCanopy();scene.add(d.canopy);d.c.g.rotation.x=0;}}
    else{d.v.y=lerp(d.v.y,-5.5,dt*1.5);const tx=d.target.x-p.x,tz=d.target.z-p.z,tl=Math.hypot(tx,tz)||1;d.v.x=lerp(d.v.x,tx/tl*7,dt*.5);d.v.z=lerp(d.v.z,tz/tl*7,dt*.5);d.c.g.rotation.y=Math.atan2(d.v.x,d.v.z);d.canopy.position.set(p.x,p.y+1.9,p.z);d.canopy.rotation.y=d.c.g.rotation.y;}
    p.addScaledVector(d.v,dt);if(d.flare&&(frameNo&1))emitSpark(p.x,p.y+.6,p.z,d.flare,1,1.6);
    d.near=p.distanceTo(focusPos())<350;
    if(d.near){play(d.c,'Jump_Idle',.3);d.c.mixer.update(dt);}
    if(p.y<=gh){p.y=gh;d.landed=10;d.c.g.rotation.x=0;if(d.canopy){d.canopy.position.y=gh+.3;d.canopy.rotation.x=1.3;}play(d.c,'Cheer');}
  }
}
function spawnDiver(pos,head){const c=makeCharacter({});c.g.position.set(pos.x+R(-2,2),pos.y-2,pos.z+R(-2,2));c.g.rotation.order='YXZ';c.g.rotation.set(1.45,head,0);scene.add(c.g);
  const target=stadFree(clockPos(R(0,12),R(40,230)));ambientSky.divers.push({c,v:new THREE.Vector3(Math.sin(head)*20,-3,Math.cos(head)*20),t:0,canopy:null,target,landed:0,near:false,flare:night>.4?pick(FLARE_COLS):null});}

// ================= the masters: Monet, Van Gogh, Picasso, Dalí =================
let MS=null,AC=null,AC2=null;
const masters={pieces:[]};
async function loadMasters(){
  try{MS=await import('./masters.js');if(MS.initMasters)MS.initMasters({neon,mat,glowMap});}catch(e){console.warn('masters.js failed to load',e);MS=null;}
  try{AC=await import('./artcars.js');if(AC.initArtCars)AC.initArtCars({neon,mat,glowMap});}catch(e){console.warn('artcars.js failed to load',e);AC=null;}
  try{AC2=await import('./artcars2.js');if(AC2.initArtCars2)AC2.initArtCars2({neon,mat,glowMap});}catch(e){AC2=null;}
}
const ARTIST_NAME={monet:'Claude Monet',vangogh:'Vincent van Gogh',picasso:'Pablo Picasso',dali:'Salvador Dalí'};
const ARTIST_COL={monet:'#c9a4ff',vangogh:'#ffd23f',picasso:'#4f86c6',dali:'#ff6b35'};
const DISTRICTS={monet:{h:3.0,r:[95,225],spread:1.15},vangogh:{h:9.0,r:[95,225],spread:1.15},picasso:{h:1.1,r:[250,430],spread:1.5},dali:{h:10.9,r:[255,440],spread:1.4}};
const ART_BLURBS={
  monet:'Monet painted the same pond, haystacks and cathedral again and again to catch how light changed by the hour. Impressionism got its name from his 1872 painting "Impression, Sunrise".',
  vangogh:'Van Gogh painted around 900 paintings in about a decade, most in his last two years. He painted "The Starry Night" in 1889 from memory, looking out of his window at Saint-Rémy.',
  picasso:'Picasso co-invented Cubism, showing a face from several angles at once. African and Iberian masks shaped his breakthrough, and he moved through Blue, Rose and Cubist periods.',
  dali:'Dalí called his soft watches "the camembert of time". He painted dreams with photographic precision so the impossible would feel real.',
};
const PIECE_NOTES={
  monet_pond:'Monet built his own water garden at Giverny and painted it about 250 times.',
  monet_haystacks:'The Haystacks series (1890–91) shows the same stacks at dawn, noon, sunset and in snow.',
  vg_starry:'"The Starry Night" (1889) swirls with eleven stars, a crescent moon and a flame-like cypress.',
  vg_sunflowers:'Van Gogh painted sunflowers to decorate a room for his friend Paul Gauguin in Arles.',
  vg_cafe:'"Café Terrace at Night" (1888) was his first painting with a starry sky, painted on the spot.',
  pic_bull:'Picasso’s "Guernica" (1937) protested the bombing of a Basque town. The bull and horse are its central figures.',
  pic_weeping:'"The Weeping Woman" (1937) uses fractured, acidic colors to show grief.',
  pic_harlequin:'In his Rose Period Picasso painted circus performers and harlequins in warm pinks.',
  dali_hand_egg:'"Metamorphosis of Narcissus" (1937) pairs a kneeling figure with a hand holding an egg that sprouts a flower.',
  dali_spindly_horse:'In "The Temptation of St Anthony" (1946), animals walk on impossibly long, thin legs.',
};
function buildMasters(){
  if(!MS||!MS.MASTER_PIECES)return;
  const occ=[{x:0,z:0,r:48},{x:STADIUM.pos.x,z:STADIUM.pos.z,r:66},{x:TEMPLE.x,z:TEMPLE.z,r:40},{x:parkPos.x,z:parkPos.z,r:60}];
  for(const a of artSpots)occ.push({x:a.x,z:a.z,r:9});
  for(const c of soundCamps)occ.push({x:c.pos.x,z:c.pos.z,r:30});
  for(const r of ramps)occ.push({x:r.cx,z:r.cz,r:r.rad});
  for(const b of dali.all)if(!dali.walkers.includes(b)&&!dali.elephants.includes(b)&&!dali.spirits.includes(b)&&!dali.giraffes.includes(b))occ.push({x:b.g.position.x,z:b.g.position.z,r:9});
  if(airport.park)occ.push({x:airport.park.x,z:airport.park.z,r:70});
  for(const def of MS.MASTER_PIECES){
    const SC=1.6;const Dd=DISTRICTS[def.artist]||DISTRICTS.dali;const fr=(def.footprint||8)*SC;let p=null;
    for(let t=0;t<120;t++){const q=clockPos(Dd.h+R(-Dd.spread,Dd.spread),R(Dd.r[0],Dd.r[1]));if(Math.hypot(q.x,q.z)>FENCE_IN-30)continue;const hq=clockOf(q.x,q.z),rq=Math.hypot(q.x,q.z);if(hq>1.9&&hq<10.1&&rq>ESP-12&&rq<455)continue;if(occ.every(o=>Math.hypot(o.x-q.x,o.z-q.z)>o.r+fr+3)){p=q;break;}}
    if(!p)continue;let b;try{b=def.build();}catch(e){console.warn('piece',def.id,e);continue;}
    b.g.scale.setScalar(SC);b.obs=(b.obs||[]).map(o=>[o[0]*SC,o[1]*SC,o[2]*SC]);
    place(b,p.x,p.z,Math.atan2(-p.x,-p.z),scene);occ.push({x:p.x,z:p.z,r:fr});
    masters.pieces.push({b,def,pos:p.clone(),r:fr});
  }
}
function updateMasters(dt){
  if(!masters.pieces.length)return;const f=focusPos();const t=performance.now()*.001;const ctx={night,playerPos:P.pos};
  for(let i=0;i<masters.pieces.length;i++){const m=masters.pieces[i];if(!m.b.update)continue;const d=d2(m.pos,f);m.acc=(m.acc||0)+dt;if(d<240||(d<900&&(frameNo+i)%6===0)){m.b.update(m.acc,t,ctx);m.acc=0;}}
}
function nearPiece(){let best=null,bd=1e9;for(const m of masters.pieces){const d=d2(m.pos,P.pos)-m.r;if(d<5&&d<bd){bd=d;best=m;}}return best;}
function admire(m){
  const id=m.def.id;const first=!state.gallery.admired[id];state.gallery.admired[id]=m.def.artist;
  oneShot(player,'Cheer',1.2);sfx.chime();
  const note=PIECE_NOTES[id]?PIECE_NOTES[id]+'\n\n':'';
  modal(`${m.def.title||'Untitled'}`,`After ${ARTIST_NAME[m.def.artist]||'the masters'}\n\n${note}${ART_BLURBS[m.def.artist]||''}`,'Keep exploring',()=>{
    if(first){addKarma(4,'admired art');checkGallery();}
  });
}
function galleryProgress(){const a=Object.values(state.gallery.admired);return{n:a.length,artists:new Set(a).size};}
function checkGallery(){
  const g=galleryProgress();
  if(!state.gallery.done&&g.n>=8&&g.artists>=4){state.gallery.done=true;state.unlocks.gallery=true;addKarma(40,'Gallery Walk');stuntText('Art critic','You admired the masters. New outfits in your wardrobe.');}
  else if(!state.gallery.done)floatText(`Gallery Walk: ${g.n} of 8 pieces, ${g.artists} of 4 artists`);
}
// artist art cars join the fleet
function addModuleArtCar(def,x,z){
  let a;try{a=def.build();}catch(e){console.warn('art car',def.type,e);return null;}
  a.g.position.set(x,0,z);scene.add(a.g);
  const v={kind:'art',name:def.name,g:a.g,pos:a.g.position,heading:R(0,TAU),speed:0,max:8,boostMax:30,acc:6,turn:1,r:5,seat:a.seat||[0,a.deck||2,3],deck:a.deck||2,crew:[],target:null,wait:0,spot:a.spot||null,poofers:a.poofers||null,anims:a.anims||[],lasers:a.lasers||null,station:artCars.length%STATIONS.length,nextPoof:R(4,12),modUpdate:a.update||null,artist:def.artist};
  for(const d of (a.dancers||[])){const p=makeCharacter({});p.g.position.set(d[0],d[1],d[2]);p.g.rotation.y=R(0,TAU);a.g.add(p.g);v.crew.push(p);}
  vehicles.push(v);artCars.push(v);return v;
}
function buildArtistCars(){
  if(!AC||!AC.ART_CAR_TYPES)return;
  const copies=settings.gfx==='low'?1:2;const types=[...AC.ART_CAR_TYPES,...((AC2&&AC2.ART_CAR_TYPES_2)||[])];
  for(let c=0;c<copies;c++)types.forEach((def,i)=>{const p=clockPos(i/types.length*12+R(-.3,.3)+c*.4,R(60,250));collide(p,6);addModuleArtCar(def,p.x,p.z);});
}

// ================= night spectacle: laser field, flares, light pool =================
// one instanced mesh draws every laser beam in the city
const LZ={mesh:null,beams:[],max:700};
const _lzO=new THREE.Vector3(),_lzD=new THREE.Vector3(),_lzQ=new THREE.Quaternion(),_lzS=new THREE.Vector3(),_lzM=new THREE.Matrix4(),_lzZ=new THREE.Vector3(0,0,1),_lzC=new THREE.Color();
const LASER_COLS=[0x39ff6a,0x46f1ff,0xff2fd6,0x7a5cff,0xff3b3b,0xffd23f,0x2ee59d];
function initLaserField(){
  const geo=new THREE.CylinderGeometry(1,1,1,5,1,true);geo.rotateX(Math.PI/2);geo.translate(0,0,.5);
  const m=new THREE.MeshBasicMaterial({color:0xffffff,transparent:true,opacity:.5,blending:THREE.AdditiveBlending,depthWrite:false,side:THREE.DoubleSide});
  LZ.mesh=new THREE.InstancedMesh(geo,m,LZ.max);LZ.mesh.frustumCulled=false;LZ.mesh.count=0;LZ.mesh.renderOrder=4;
  LZ.mesh.instanceColor=new THREE.InstancedBufferAttribute(new Float32Array(LZ.max*3),3);scene.add(LZ.mesh);
  // laser canopy: beams from the Esplanade and deep playa camps converge above the Man
  for(let i=0;i<40;i++){const h=2+i/39*8;const o=clockPos(h,R(248,262));LZ.beams.push({kind:'canopy',ox:o.x,oy:R(5,9),oz:o.z,ph:R(0,TAU),sp:R(.15,.35),col:LASER_COLS[i%LASER_COLS.length],w:.07});}
  for(let i=0;i<14;i++){const o=clockPos(R(10.4,13.6),R(300,500));LZ.beams.push({kind:'canopy',ox:o.x,oy:R(6,12),oz:o.z,ph:R(0,TAU),sp:R(.15,.35),col:LASER_COLS[(i+3)%LASER_COLS.length],w:.08});}
  // a rotating crown fan from the Man's head (until he burns)
  for(let i=0;i<18;i++)LZ.beams.push({kind:'crown',i,col:i%2?0x46f1ff:0xff2fd6,w:.06});
  // sky lances sweeping from camps all over the city
  for(let i=0;i<30;i++){const o=clockPos(R(2,10),R(270,445));LZ.beams.push({kind:'lance',ox:o.x,oy:4,oz:o.z,ph:R(0,TAU),sp:R(.2,.6),col:pick(LASER_COLS),w:.09,len:R(350,700)});}
}
function addCarBeams(v){for(let k=0;k<2;k++)LZ.beams.push({kind:'car',v,k,ph:R(0,TAU),sp:R(.6,1.4),col:pick(LASER_COLS),w:.05,len:R(160,320)});}
function updateLaserField(t){
  if(!LZ.mesh)return;const show=night>.35&&state.dust<.55;LZ.mesh.visible=show;if(!show)return;
  const f=focusPos();let n=0;const beat=.75+.25*Math.max(0,Math.sin(t*12.8));const glow=clamp((night-.35)*2.2,0,1)*(1-state.dust);
  const manTop=man.userData.fig.rotation.x<.2;
  for(const b of LZ.beams){
    if(n>=LZ.max)break;let len=b.len||0;
    if(b.kind==='canopy'){_lzO.set(b.ox,b.oy,b.oz);const a=t*b.sp+b.ph;_lzD.set(Math.cos(a)*22,state.manBurnt?60+Math.sin(a*1.3)*20:44+Math.sin(a*1.7)*8,Math.sin(a)*22).sub(_lzO);len=_lzD.length()*1.25;_lzD.normalize();}
    else if(b.kind==='crown'){if(!manTop||state.manBurnt)continue;_lzO.set(0,42,0);const a=b.i/18*TAU+t*.35;const el=-.08+Math.sin(t*.7+b.i)*.1;_lzD.set(Math.cos(a)*Math.cos(el),Math.sin(el),Math.sin(a)*Math.cos(el));len=380;}
    else if(b.kind==='lance'){_lzO.set(b.ox,b.oy,b.oz);const a=t*b.sp+b.ph;_lzD.set(Math.sin(a)*.55,1,Math.cos(a*1.3)*.55).normalize();}
    else if(b.kind==='car'){const v=b.v;if(!v.g.visible||d2(v.pos,f)>650)continue;_lzO.set(0,v.deck+(v.lzY||4),0);v.g.localToWorld(_lzO);const a=t*b.sp+b.ph+b.k*Math.PI;_lzD.set(Math.sin(a+v.heading),.35+.3*Math.sin(t*.9+b.ph),Math.cos(a+v.heading)).normalize();}
    _lzQ.setFromUnitVectors(_lzZ,_lzD);_lzS.set(b.w,b.w,len);_lzM.compose(_lzO,_lzQ,_lzS);LZ.mesh.setMatrixAt(n,_lzM);
    _lzC.setHex(b.col).multiplyScalar(3.2*glow*(b.kind==='lance'?beat:1));LZ.mesh.setColorAt(n,_lzC);n++;
  }
  LZ.mesh.count=n;LZ.mesh.instanceMatrix.needsUpdate=true;LZ.mesh.instanceColor.needsUpdate=true;
}

// starburst lens flares on bright lights
const FL={pts:null,pos:null,col:null,max:900,n:0,static:[]};
function flareTexture(){const c=document.createElement('canvas');c.width=c.height=128;const g=c.getContext('2d');const gr=g.createRadialGradient(64,64,0,64,64,64);gr.addColorStop(0,'rgba(255,255,255,1)');gr.addColorStop(.12,'rgba(255,255,255,.7)');gr.addColorStop(.35,'rgba(255,255,255,.12)');gr.addColorStop(1,'rgba(255,255,255,0)');g.fillStyle=gr;g.fillRect(0,0,128,128);
  g.globalCompositeOperation='lighter';for(const [a,l,w] of [[0,64,2.2],[Math.PI/2,52,1.8],[Math.PI/4,30,1.2],[-Math.PI/4,30,1.2]]){g.save();g.translate(64,64);g.rotate(a);const lg=g.createLinearGradient(-l,0,l,0);lg.addColorStop(0,'rgba(255,255,255,0)');lg.addColorStop(.5,'rgba(255,255,255,.9)');lg.addColorStop(1,'rgba(255,255,255,0)');g.fillStyle=lg;g.fillRect(-l,-w,l*2,w*2);g.restore();}
  const t=new THREE.CanvasTexture(c);return t;}
function initFlares(){
  FL.pos=new Float32Array(FL.max*3);FL.col=new Float32Array(FL.max*3);
  const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.BufferAttribute(FL.pos,3));geo.setAttribute('color',new THREE.BufferAttribute(FL.col,3));
  FL.pts=new THREE.Points(geo,new THREE.PointsMaterial({size:5,map:flareTexture(),vertexColors:true,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending}));FL.pts.frustumCulled=false;FL.pts.renderOrder=5;scene.add(FL.pts);
  const add=(x,y,z,c,s)=>FL.static.push([x,y,z,new THREE.Color(c),s||1]);
  for(const l of lamps)add(l.pos.x,3.05,l.pos.z,0xffb35a,.6);
  for(const h of [12,3,9])for(let r=40;r<(h===12?170:ESP-6);r+=32){const p=clockPos(h+.06,r);add(p.x+Math.cos(-h/12*TAU)*.8,3.05,p.z-Math.sin(-h/12*TAU)*.8,0xffb35a,.6);}
  for(const b of LZ.beams)if(b.kind==='canopy'||b.kind==='lance')add(b.ox,b.oy,b.oz,b.col,.8);
  for(const c of soundCamps)for(let k=0;k<4;k++){const p=new THREE.Vector3(-6+k*4,7.4,1.2).applyAxisAngle(_up,c.rot).add(c.pos);add(p.x,p.y,p.z,c.colors[k%c.colors.length],1.2);}
  add(TEMPLE.x,40,TEMPLE.z,0xffc06b,2.5);
}
function pushFlare(x,y,z,c,k){if(FL.n>=FL.max)return;const i=FL.n++;FL.pos[i*3]=x;FL.pos[i*3+1]=y;FL.pos[i*3+2]=z;FL.col[i*3]=c.r*k;FL.col[i*3+1]=c.g*k;FL.col[i*3+2]=c.b*k;}
const _flC=new THREE.Color();
function updateFlares(t){
  if(!FL.pts)return;FL.n=0;const g=clamp((night-.3)*2,0,1)*(1-state.dust*.8);FL.pts.visible=g>.02;if(!FL.pts.visible)return;
  const tw=.85+.15*Math.sin(t*9);
  for(const s of FL.static)pushFlare(s[0],s[1],s[2],s[3],s[4]*g*tw);
  if(!state.manBurnt)pushFlare(0,42,0,_flC.setHex(0x46f1ff),2.2*g);
  const f=focusPos();
  for(const v of artCars){if(!v.g.visible||d2(v.pos,f)>500)continue;_flC.setHex(v.flareCol||0xff4fa8);pushFlare(v.pos.x,v.deck+3.2,v.pos.z,_flC,1.6*g);}
  for(const F of skyFlares.list)pushFlare(F.p.x,F.p.y,F.p.z,F.c,(F.chute?2.6:1.6)*g*(.8+.2*Math.sin(t*23+F.ph)));
  for(const d of ambientSky.divers)if(d.flare&&!d.landed)pushFlare(d.c.g.position.x,d.c.g.position.y+.8,d.c.g.position.z,d.flare,1.4*g);
  FL.pts.geometry.setDrawRange(0,FL.n);FL.pts.geometry.attributes.position.needsUpdate=true;FL.pts.geometry.attributes.color.needsUpdate=true;
}

// pyrotechnic sky flares that rise, pop and drift down under tiny parachutes
const skyFlares={list:[],t:2};
const SF_N=1600;const sfPos=new Float32Array(SF_N*3),sfCol=new Float32Array(SF_N*3),sfLife=new Float32Array(SF_N),sfVel=new Float32Array(SF_N*3),sfBase=new Float32Array(SF_N*3);let sfCur=0,sfGeo=null;
const FLARE_COLS=[0xff2a2a,0xff2fd6,0x39ff6a,0xffffff,0xffb020,0x46f1ff].map(c=>new THREE.Color(c));
function initSkyFlares(){sfGeo=new THREE.BufferGeometry();sfGeo.setAttribute('position',new THREE.BufferAttribute(sfPos,3));sfGeo.setAttribute('color',new THREE.BufferAttribute(sfCol,3));const p=new THREE.Points(sfGeo,new THREE.PointsMaterial({size:.9,map:glowMap,vertexColors:true,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending}));p.frustumCulled=false;scene.add(p);}
function emitSpark(x,y,z,c,vy,life){const i=sfCur;sfCur=(sfCur+1)%SF_N;sfPos[i*3]=x;sfPos[i*3+1]=y;sfPos[i*3+2]=z;sfVel[i*3]=R(-.8,.8);sfVel[i*3+1]=vy+R(-.5,.5);sfVel[i*3+2]=R(-.8,.8);sfLife[i]=life;sfBase[i*3]=c.r;sfBase[i*3+1]=c.g;sfBase[i*3+2]=c.b;}
function launchFlare(){
  const f=focusPos();const a=R(0,TAU),r=R(40,320);let o=new THREE.Vector3(f.x+Math.cos(a)*r,1,f.z+Math.sin(a)*r);if(Math.hypot(o.x,o.z)>FENCE_IN-20)o=clockPos(R(2,10),R(260,440)).setY(1);
  const c=pick(FLARE_COLS);skyFlares.list.push({p:o,v:new THREE.Vector3(R(-6,6),R(38,58),R(-6,6)),c,chute:false,life:R(12,18),ph:R(0,TAU)});sfx.flare(d2(o,f));
}
function updateSkyFlares(dt){
  if(!sfGeo)return;const S=skyFlares;
  if(night>.45&&state.dust<.4){S.t-=dt;if(S.t<=0){S.t=R(.6,2.2);launchFlare();if(rnd()<.25)setTimeout(launchFlare,300);}}
  for(let i=S.list.length-1;i>=0;i--){const F=S.list[i];F.life-=dt;
    if(!F.chute){F.v.y-=22*dt;if(F.v.y<=2){F.chute=true;for(let k=0;k<40;k++)emitSpark(F.p.x,F.p.y,F.p.z,F.c,R(-4,6),R(.4,1));}}
    else{F.v.set(Math.sin(F.life*.7+F.ph)*1.5,-2.6,Math.cos(F.life*.5+F.ph)*1.5);}
    F.p.addScaledVector(F.v,dt);emitSpark(F.p.x,F.p.y,F.p.z,F.chute?_flC.setRGB(.5,.45,.45):F.c,F.chute?.3:-2,F.chute?2.2:.7);
    if(F.life<=0||F.p.y<2)S.list.splice(i,1);}
  for(let i=0;i<SF_N;i++){if(sfLife[i]<=0){sfCol[i*3]=sfCol[i*3+1]=sfCol[i*3+2]=0;continue;}sfLife[i]-=dt;const l=Math.max(0,sfLife[i]);for(let j=0;j<3;j++){sfPos[i*3+j]+=sfVel[i*3+j]*dt;sfCol[i*3+j]=sfBase[i*3+j]*Math.min(1,l)*1.8;}}
  sfGeo.attributes.position.needsUpdate=true;sfGeo.attributes.color.needsUpdate=true;
}

// a small pool of real lights follows the nearest art cars (dozens of lights would stall the GPU)
const LP={lights:[]};
function initLightPool(){for(let i=0;i<5;i++){const l=new THREE.PointLight(0xffffff,0,32,2);scene.add(l);LP.lights.push(l);}}
function updateLightPool(){
  const f=focusPos();const near=artCars.filter(v=>v.g.visible).map(v=>[d2(v.pos,f),v]).sort((a,b)=>a[0]-b[0]).slice(0,LP.lights.length);
  LP.lights.forEach((l,i)=>{const e=near[i];if(!e||night<.3){l.intensity=0;return;}const v=e[1];l.position.set(v.pos.x,v.deck+3,v.pos.z);l.color.setHex(v.flareCol||0xff4fa8);l.intensity=night*75;});
}
function detachCarLights(){for(const v of artCars){if(v.spot&&v.spot.parent){v.flareCol=v.spot.color.getHex();v.spot.parent.remove(v.spot);}v.spot=null;if(!v.flareCol)v.flareCol=pick(LASER_COLS);}}

// ================= melting time (bullet time) =================
const melt={active:0,cool:0,scale:1};
function meltTime(){
  if(!state.meltPower){toast('Time feels oddly firm. Someone in a dream might teach you to bend it.');return;}
  if(melt.cool>0){toast(`Time is still re-solidifying. ${Math.ceil(melt.cool)}s.`);return;}
  melt.active=8;melt.cool=26;sfx.warp();stuntText('Time melts','The world slows. You do not.');
}
function updateMelt(rdt){
  if(melt.active>0){melt.active-=rdt;if(melt.active<=0)sfx.warp(true);}
  if(melt.cool>0)melt.cool-=rdt;
  const target=melt.active>0?.33:1;melt.scale=lerp(melt.scale,target,Math.min(1,rdt*4));
  grade.uniforms.uDream.value=lerp(grade.uniforms.uDream.value,melt.active>0?1:0,Math.min(1,rdt*3));
}
// ================= environment =================
const C={topDay:new THREE.Color(0x1552c4),topDusk:new THREE.Color(0x2c3a86),topNight:new THREE.Color(0x03040d),hazeDay:new THREE.Color(0xbcd5ea),hazeDusk:new THREE.Color(0xf2945a),hazeNight:new THREE.Color(0x0b0d1c),rimDay:new THREE.Color(.42,.45,.52),rimDusk:new THREE.Color(.9,.5,.28),rimNight:new THREE.Color(.22,.16,.42),sunFogDay:new THREE.Color(.55,.48,.36),sunFogDusk:new THREE.Color(1.3,.62,.25),dust:new THREE.Color(0xcab08a),dustNight:new THREE.Color(0x261f19),hemiDay:new THREE.Color(0xdfefff),hemiNight:new THREE.Color(0x34406e),hemiDusk:new THREE.Color(0xffb48a),mountDay:new THREE.Color(0x7d8399),mountNight:new THREE.Color(0x0c0e1a),sunWarm:new THREE.Color(0xffb27a),sunNoon:new THREE.Color(0xfff3e0),moon:new THREE.Color(0x9fb4ff)};
const tmpC=new THREE.Color(),tmpC2=new THREE.Color(),fogC=new THREE.Color();
const sunDir=new THREE.Vector3();
let night=0,lastEnvElev=99;
function envUpdate(dt){
  const h=state.time%24;const ang=(h-6)/12*Math.PI;const elev=Math.sin(ang);
  const day=clamp(elev*3+.35,0,1);night=1-day;
  const dusk=clamp(1-Math.abs(elev+.02)*4.5,0,1);
  if(state.started){
    if(state.time>=state.nextStorm&&state.dustTarget===0){state.dustTarget=1;state.stormEnd=state.time+R(.5,.9);if(!state.job&&state.quest>=2)setTimeout(()=>{if(!state.job&&state.dust>.3)startJob('rescue');},9000);toast(state.goggles?'Dust storm rolling in. Goggles on.':'Whiteout! A dust storm is rolling in. You need goggles.');}
    if(state.dustTarget===1&&state.time>=state.stormEnd){state.dustTarget=0;state.nextStorm=state.time+R(4,9);}
  }
  state.dust+=(state.dustTarget-state.dust)*Math.min(1,dt*.35);const dust=state.dust;
  sunDir.set(Math.cos(ang)*.85,Math.sin(ang),.42).normalize();
  SKY.sunDir.value.copy(sunDir);SKY.sunVis.value=clamp(elev*8+.4,0,1)*(1-dust);
  SKY.moonDir.value.set(-sunDir.x*.6,.75,-.35).normalize();SKY.moonVis.value=clamp(night*1.4-.3,0,1)*(1-dust);
  SKY.sunCol.value.copy(C.sunWarm).lerp(C.sunNoon,clamp(elev*2.5,0,1)).multiplyScalar(day*.9+.1);
  tmpC.copy(C.hazeNight).lerp(C.hazeDay,day).lerp(C.hazeDusk,dusk*.75);
  SKY.top.value.copy(C.topNight).lerp(C.topDay,day).lerp(C.topDusk,dusk*.5);
  tmpC2.copy(C.dustNight).lerp(C.dust,day);
  fogC.copy(tmpC).lerp(tmpC2,dust);
  SKY.horizon.value.copy(fogC);SKY.below.value.copy(fogC);SKY.top.value.lerp(tmpC2,dust*.95);
  SKY.uDusk.value=dusk*(1-dust);SKY.uNight.value=night;SKY.uDust.value=dust;SKY.uTime.value=(performance.now()*.001)%1000;
  if(elev>-.05)FX.fxSunDir.value.copy(sunDir);else FX.fxSunDir.value.set(-sunDir.x*.6,.75,-.35).normalize();
  FX.fxSunFog.value.copy(C.sunFogDay).multiplyScalar(day).lerp(C.sunFogDusk,dusk).multiplyScalar(1-dust*.6);
  FX.fxRim.value.copy(C.rimNight).lerp(C.rimDay,day).lerp(C.rimDusk,dusk*.8).multiplyScalar(1-dust*.5);
  FX.fxFalloff.value=lerp(.011,.0025,dust);
  scene.fog.color.copy(fogC);
  scene.fog.far=lerp(lerp(700,2300,day),state.goggles?80:28,dust);scene.fog.near=lerp(lerp(20,160,day),.5,dust);updateClouds(day,dusk,dust);
  dustDome.material.color.copy(tmpC2);dustDome.material.opacity=Math.min(1,dust*1.15);
  const f=focusPos()||spawnPt;
  // sun by day, moon by night: one shadow-casting light
  if(elev>-.05){sun.position.set(f.x+sunDir.x*300,f.y+Math.max(.06,sunDir.y)*300,f.z+sunDir.z*300);sun.color.copy(C.sunWarm).lerp(C.sunNoon,clamp(elev*2.5,0,1));sun.intensity=clamp(elev*7,0,1)*2.7*(1-dust*.75);}
  else{const md=new THREE.Vector3(-sunDir.x*.6,.75,-.35).normalize();sun.position.set(f.x+md.x*300,f.y+md.y*300,f.z+md.z*300);sun.color.copy(C.moon);sun.intensity=.45*(1-dust*.7);}
  sun.target.position.copy(f);
  hemi.intensity=.2+day*.5+dusk*.3;hemi.color.copy(C.hemiNight).lerp(C.hemiDay,day).lerp(C.hemiDusk,dusk*.6);
  hemi.groundColor.setRGB(lerp(.06,.6,day),lerp(.05,.5,day),lerp(.06,.38,day));
  scene.environmentIntensity=lerp(.12,.75,day)*(1-dust*.4);
  envTimer-=dt;if(envTimer<=0||Math.abs(elev-lastEnvElev)>.08){envTimer=3;lastEnvElev=elev;refreshEnv();}
  const ni=lerp(.7,2.3,night);for(const m of neonMats)m.emissiveIntensity=ni*m.userData.k;
  if(bulbs){bulbs.material.opacity=.15+night*.85;bulbs.material.color.setScalar(1+night*2.2);}
  if(stars)stars.material.opacity=clamp(night*1.4-.45,0,1)*(1-dust);
  if(mountMat)mountMat.color.copy(C.mountNight).lerp(C.mountDay,day).lerp(fogC,clamp(.25+dust*1.3,0,1));
  if(beacon)beacon.material.opacity=(.14+night*.3)*(1-dust*.5);
  if(dustPts)dustPts.material.opacity=dust*.85;
  headlight.intensity=P.vehicle?night*90:night*25;headlight.position.set(f.x,(P.vehicle?6:3)+f.y,f.z);
  for(const v of artCars)if(v.spot)v.spot.intensity=night*120;
  renderer.toneMappingExposure=lerp(1.05,.85,day);
  bloom.strength=lerp(.55,.2,day);bloom.threshold=lerp(.95,2.6,day);bloom.radius=lerp(.45,.35,day);
  grade.uniforms.uWarm.value=lerp(.15,.6,day)+dusk*.3;grade.uniforms.uTime.value=(performance.now()*.001)%100;
}

// ================= main update =================
const _v=new THREE.Vector3();
let hudTimer=0,mphShown=0,lastFenceMsg=0,frameNo=0,saveTimer=15,stepT=0,prevJump=false;
function update(dt,rdt){rdt=rdt||dt;
  state.time+=dt/hourLen(state.time%24);frameNo++;
  envUpdate(dt);
  const fwd=down('KeyW','ArrowUp'),back=down('KeyS','ArrowDown'),left=down('KeyA','ArrowLeft'),right=down('KeyD','ArrowRight'),boost=down('ShiftLeft','ShiftRight')||touch.run;
  let speeding=false;const jumpNow=!!(keys.Space||touch.jump);const jumpEdge=(jumpNow&&!prevJump)||jumpLatch;prevJump=jumpNow;jumpLatch=false;
  if(P.ride||P.sky||P.flying){touch.jump=false;airUpdate(dt,{fwd,back,left,right,boost,jumpEdge});mphShown=0;}
  else if(P.vehicle){touch.jump=false;
    const v=P.vehicle;const thr=clamp((fwd?1:0)-(back?1:0)-touch.jy,-1,1),steer=clamp((left?1:0)-(right?1:0)-touch.jx,-1,1);
    if(v.kind==='bike'){bikePhysics(v,dt,thr,steer,boost,jumpEdge);}
    else{
    const max=boost?v.boostMax:v.max;
    if(thr>0)v.speed=v.speed<max?Math.min(max,v.speed+v.acc*(boost?1.6:1)*dt*thr):lerp(v.speed,max,dt*1.5);
    else if(thr<0)v.speed=Math.max(-v.max*.4,v.speed+v.acc*1.6*dt*thr);
    else v.speed*=Math.pow(.35,dt);
    v.heading+=steer*v.turn*dt*clamp(v.speed/3,-1,1);
    v.pos.x+=Math.sin(v.heading)*v.speed*dt;v.pos.z+=Math.cos(v.heading)*v.speed*dt;
    const hit=collide(v.pos,v.r*.8);if(hit){v.speed*=.5;if(hit==='fence')fenceMsg();}
    v.g.rotation.y=v.heading;
    }
    const s=v.seat,c=Math.cos(v.heading),sn=Math.sin(v.heading);
    if(v.crashed>0){P.pos.set(v.pos.x+c*1.3,v.pos.y,v.pos.z-sn*1.3);player.g.rotation.set(0,v.heading,0);}
    else{P.pos.set(v.pos.x+s[0]*c+s[2]*sn,v.pos.y+s[1],v.pos.z-s[0]*sn+s[2]*c);player.g.rotation.order='YXZ';player.g.rotation.set(v.kind==='bike'?v.g.rotation.x:0,v.heading,v.kind==='bike'?v.g.rotation.z:0);}
    animPerson(player,v.kind==='bike'?'ride':(night>.4?'dance':'idle'),dt,Math.abs(v.speed));
    mphShown=Math.abs(v.speed)*.6;
    if(v.kind==='art'&&mphShown>5.6)speeding=true;
    if(v.kind==='bike'&&v.air&&performance.now()-lastLook>1400){}
    if(performance.now()-lastLook>1400)camYaw=lerpAngle(camYaw,v.heading+Math.PI,dt*2.2);
  }else{
    player.g.rotation.z=0;if(player.g.rotation.x)player.g.rotation.x=Math.abs(player.g.rotation.x)<.02?0:lerp(player.g.rotation.x,0,Math.min(1,dt*8));if(player.wings&&player.wings.scale.x>1.01)resetPose();
    const fx=-Math.sin(camYaw),fz=-Math.cos(camYaw),rx=Math.cos(camYaw),rz=-Math.sin(camYaw);
    let ix=0,iz=0;if(fwd){ix+=fx;iz+=fz;}if(back){ix-=fx;iz-=fz;}if(right){ix+=rx;iz+=rz;}if(left){ix-=rx;iz-=rz;}
    ix+=fx*-touch.jy+rx*touch.jx;iz+=fz*-touch.jy+rz*touch.jx;
    const len=Math.hypot(ix,iz);if(len>.05)P.sitting=false;
    const sp=(boost?11:6.2)*Math.min(1,len);
    const tvx=len>.05&&player.lock<=0?ix/len*sp:0,tvz=len>.05&&player.lock<=0?iz/len*sp:0;
    P.vel.x=lerp(P.vel.x,tvx,Math.min(1,dt*10));P.vel.z=lerp(P.vel.z,tvz,Math.min(1,dt*10));
    const pox=P.pos.x,poz=P.pos.z;P.pos.x+=P.vel.x*dt;P.pos.z+=P.vel.z*dt;
    if(groundHeight(P.pos.x,P.pos.z)-P.pos.y>.7){P.pos.x=pox;P.pos.z=poz;}
    if(collide(P.pos,.45,true)==='fence')fenceMsg();
    if(len>.05)P.dancing=false;
    if((keys.Space||touch.jump)&&P.onGround){touch.jump=false;P.vy=6.5;P.onGround=false;P.sitting=false;oneShot(player,'Jump_Full_Short',.75);}
    P.vy-=20*dt;P.pos.y+=P.vy*dt;const ghp=groundHeight(P.pos.x,P.pos.z);if(P.pos.y<=ghp){P.pos.y=ghp;P.vy=0;P.onGround=true;}else if(P.pos.y>ghp+.25)P.onGround=false;
    const spd=Math.hypot(P.vel.x,P.vel.z);
    const arm=armed()&&!P.sitting&&!P.dancing;
    if(arm)P.heading=lerpAngle(P.heading,camYaw+Math.PI,Math.min(1,dt*14));
    else if(spd>.3)P.heading=lerpAngle(P.heading,Math.atan2(P.vel.x,P.vel.z),Math.min(1,dt*10));
    player.g.rotation.y=P.heading;
    if(arm)animArmed(dt,spd);else{stopUpper(player);animPerson(player,P.sitting?'sit':P.dancing?'dance':'walk',dt,spd);}
    if(spd>.6&&P.onGround){stepT-=dt*spd;if(stepT<=0){stepT=1.7;sfx.step();}}
    mphShown=0;
  }
  if(speeding){setWanted(state.wanted+dt*.33);RG.lastSeen.copy(focusPos());RG.seenT=0;}
  updateRanger(dt);updateManhunt(dt);updateArms(dt);
  updateArtCars(dt);updateNPCs(dt);updateCyclists(dt);updatePickups(dt);updateBurns(dt);updateFireworks(dt);updateDust(dt);updatePoofs(dt);updateJob(dt);updateLamps();updateSoundCamps(dt);updateDevils(dt);updatePuffs(dt);updateChatter(dt);updateCrowd(dt);crowdEvents();updateDali(dt);updateStadium(dt);updateAmbientSky(dt);updatePlaneAuto(dt);updateDropPlane(dt);updateDropFx(dt);updatePads(dt);updateMotes(dt);updateTrail(dt);updateMasters(dt);{const tt=performance.now()*.001;updateLaserField(tt);updateFlares(tt);}updateSkyFlares(dt);updateLightPool();
  updateQuest();
  const tgt=QUESTS[state.quest]&&QUESTS[state.quest].target();
  beacon.visible=!!tgt;if(tgt){beacon.position.x=tgt.x;beacon.position.z=tgt.z;}
  const t2=jobTarget();beacon2.visible=!!t2;if(t2){beacon2.position.x=t2.x;beacon2.position.z=t2.z;}
  if(P.vehicle)state.stats.driven+=Math.abs(P.vehicle.speed)*dt;else state.stats.walked+=Math.hypot(P.vel.x,P.vel.z)*dt;
  saveTimer-=dt;if(saveTimer<=0){saveTimer=15;saveGame();}
  if(audio.ctx){
    let lvl=0,st=-1;if(P.vehicle&&P.vehicle.kind==='art'){lvl=1;st=P.vehicle.station;}else{const f=focusPos();for(const v of artCars){if(v.station<0)continue;const l=Math.pow(clamp(1-d2(v.pos,f)/110,0,1),1.6);if(l>lvl){lvl=l;st=v.station;}}for(const c of soundCamps){if(!c.on)continue;const l=Math.pow(clamp(1-d2(c.pos,f)/190,0,1),1.3);if(l>lvl){lvl=l;st=c.station;}}}
    if(st<0)lvl=0;else audio.station=st;
    audio.musicLevel=lvl;const t=audio.ctx.currentTime;
    audio.music.gain.setTargetAtTime(lvl*.55,t,.15);audio.lp.frequency.setTargetAtTime(350+lvl*lvl*14000,t,.2);
    {const fs=P.sky?P.sky.vel.length():P.flying?P.fv.length():P.ride&&P.ride.drop?40:0;audio.wind.gain.setTargetAtTime(.035+state.dust*.32+clamp(fs/70,0,1)*.4,t,.3);}audio.crowdG.gain.setTargetAtTime(Math.min(.07,crowdNear*.0018),t,.5);
    if(P.ride||ambientSky.active){const dd=P.ride?0:ambientSky.plane.g.position.distanceTo(camera.position);const lv=P.ride?.09:clamp(1-dd/1500,0,1)*.05;audio.engine.g.gain.setTargetAtTime(lv,t,.3);audio.engine.o1.frequency.setTargetAtTime(95,t,.3);audio.engine.o2.frequency.setTargetAtTime(143,t,.3);}else{
    const ev=P.vehicle&&P.vehicle.kind==='art'?Math.abs(P.vehicle.speed):-1;const rv=ranger.active?clamp(1-d2(ranger.pos,focusPos())/90,0,1):0;
    audio.engine.g.gain.setTargetAtTime(ev>=0?.05+ev*.007:rv*.06,t,.2);const ef=ev>=0?38+ev*1.5:45+ranger.speed*2;audio.engine.o1.frequency.setTargetAtTime(ef,t,.2);audio.engine.o2.frequency.setTargetAtTime(ef*1.51,t,.2);}
  }
  updateTension(dt);
  hudTimer-=dt;if(hudTimer<=0){hudTimer=.1;updateHUD();updateTouchUI();}
}
// chase score: a pulsing bass + ticking hi-hat that grows with the wanted level
let TN=null;
function updateTension(dt){
  const a=audio;if(!a.ctx)return;const ctx=a.ctx;
  if(!TN){TN={g:ctx.createGain(),b:ctx.createOscillator(),b2:ctx.createOscillator(),lfo:ctx.createOscillator(),lg:ctx.createGain(),f:ctx.createBiquadFilter(),t:0,tick:0};
    TN.g.gain.value=0;TN.b.type='sawtooth';TN.b.frequency.value=55;TN.b2.type='square';TN.b2.frequency.value=82.4;TN.f.type='lowpass';TN.f.frequency.value=380;
    TN.lfo.frequency.value=2;TN.lg.gain.value=.5;TN.lfo.connect(TN.lg);
    const pulse=ctx.createGain();pulse.gain.value=.5;TN.lg.connect(pulse.gain);
    TN.b.connect(TN.f);TN.b2.connect(TN.f);TN.f.connect(pulse);pulse.connect(TN.g);TN.g.connect(a.sfx);TN.b.start();TN.b2.start();TN.lfo.start();}
  const st=wantedStars();const seen=st>0&&RG.seenT<2;const lvl=st===0?0:(seen?.05+st*.022:.03+st*.01);const t=ctx.currentTime;
  TN.g.gain.setTargetAtTime(lvl,t,.6);TN.lfo.frequency.setTargetAtTime(seen?2+st*.5:1.2,t,.5);TN.f.frequency.setTargetAtTime(seen?420+st*160:300,t,.5);
  if(st>0){TN.tick-=dt;if(TN.tick<=0){TN.tick=seen?.25:.5;const o=ctx.createBufferSource();if(!TN.nb){const n=ctx.createBuffer(1,2205,44100);const d=n.getChannelData(0);for(let i=0;i<d.length;i++)d[i]=(Math.random()*2-1)*(1-i/d.length);TN.nb=n;}o.buffer=TN.nb;const hp=ctx.createBiquadFilter();hp.type='highpass';hp.frequency.value=7000;const gg=ctx.createGain();gg.gain.value=lvl*.9;o.connect(hp);hp.connect(gg);gg.connect(a.sfx);o.start();}}
}
function fenceMsg(){if(performance.now()-lastFenceMsg>6000){lastFenceMsg=performance.now();toast('That is the trash fence. Nothing out there but more dust.');}}
function updateRanger(dt){
  const stars=(P.vehicle||state.wanted>=2)&&!P.hidden?Math.floor(state.wanted):0;const f=focusPos();
  if(stars>0&&!ranger.active){
    ranger.active=true;ranger.leaving=0;ranger.g.visible=true;
    const v=P.vehicle;const back=v?v.heading+Math.PI+R(-.6,.6):R(0,TAU);
    ranger.pos.set(f.x+Math.sin(back)*130,0,f.z+Math.cos(back)*130);collide(ranger.pos,2);ranger.heading=back+Math.PI;ranger.speed=0;
    toast(P.vehicle?'A Ranger truck is coming. Slow down or lose them.':'A Ranger truck joins the search.');sfx.ranger();
  }
  if(!ranger.active)return;
  ranger.g.userData.lb.material.emissiveIntensity=(Math.sin(performance.now()*.02)>0)?6:.3;
  animPerson(rangerDriver,'ride',dt,0);
  let tx=f.x,tz=f.z;
  if(stars===0){ranger.leaving+=dt;tx=ranger.pos.x+Math.sin(ranger.heading)*50;tz=ranger.pos.z+Math.cos(ranger.heading)*50;if(ranger.leaving>14){ranger.active=false;ranger.g.visible=false;return;}}
  const want=Math.atan2(tx-ranger.pos.x,tz-ranger.pos.z);ranger.heading=lerpAngle(ranger.heading,want,Math.min(1,dt*2.2));
  const max=stars===0?10:13+stars*5;ranger.speed=lerp(ranger.speed,max,dt*.8);
  ranger.pos.x+=Math.sin(ranger.heading)*ranger.speed*dt;ranger.pos.z+=Math.cos(ranger.heading)*ranger.speed*dt;
  if(collide(ranger.pos,1.8))ranger.speed*=.7;
  ranger.g.rotation.y=ranger.heading;
  if(stars>0&&d2(ranger.pos,f)<(P.vehicle?P.vehicle.r+3:3.5)){
    sfx.ranger();
    if(!P.vehicle){caught(null);return;}
    modal('Ranger chat','A Ranger in khaki pulls alongside, calm as anything. "Hey Phoenix. Art cars roll at 5 mph out here, there are people walking everywhere in the dark. Let’s take a breather and hand the wheel back."','Fair enough',()=>{state.stats.rangers++;if(state.job&&state.job.id==='shuttle')endJob(false,'The Ranger hands the art car back to its crew. Shuttle run over.',0);if(P.vehicle)exitVehicle();state.wanted=0;RG.seenT=0;const sp=RG.outpostSpot;if(sp&&!P.vehicle){P.pos.set(sp.x,0,sp.z);}});
  }
}
function updateArtCars(dt){
  const f=focusPos()||spawnPt;
  for(const v of artCars){
    const dc=d2(v.pos,f);const near=dc<160;v.g.visible=dc<720||v.driven;
    for(const c of v.crew){c.g.visible=dc<190;if(near)animPerson(c,night>.35?'dance':'idle',dt,0);}
    if(near){const t=performance.now()*.001;for(const a of v.anims){if(a.k==='spin')a.o.rotation.y+=dt*1.6;else if(a.k==='wag')a.o.rotation.y=Math.sin(t*3+v.pos.x)*.4;else if(a.k==='shell')a.o.rotation.x=Math.sin(t*1.2)*.08;else if(a.k==='wiggle'){a.o.rotation.x=a.bx+Math.sin(t*2.2+a.ph)*.18;a.o.rotation.z=a.bz+Math.cos(t*1.7+a.ph)*.18;}}}
    if(v.lasers)updateLasers(v.lasers,performance.now()*.001,near&&night>.45&&state.dust<.5);
    if(v.modUpdate&&near)v.modUpdate(dt,performance.now()*.001,{night,speed:Math.abs(v.speed)});
    if(!v.driven&&night>.5&&near){v.nextPoof-=dt;if(v.nextPoof<=0){v.nextPoof=R(5,14);poof(v);}}
    if(v.driven)continue;
    if(v.wait>0){v.wait-=dt;v.speed*=Math.pow(.3,dt);}
    else{
      if(!v.target||d2(v.pos,v.target)<12||inStadium(v.target,12)){const r=rnd();v.target=r<.55?stadFree(clockPos(R(0,12),R(50,250))):r<.8?clockPos(R(10.3,13.7),R(260,520)):stadFree(clockPos(R(2,10),R(246,252)));}
      let want=Math.atan2(v.target.x-v.pos.x,v.target.z-v.pos.z);if(inStadium(v.pos,14)){want=Math.atan2(v.pos.x-STADIUM.pos.x,v.pos.z-STADIUM.pos.z);if(inStadium(v.target,12))v.target=null;}v.heading=lerpAngle(v.heading,want,Math.min(1,dt*(inStadium(v.pos,14)?1.2:.5)));v.speed=lerp(v.speed,4.5,dt);
    }
    v.pos.x+=Math.sin(v.heading)*v.speed*dt;v.pos.z+=Math.cos(v.heading)*v.speed*dt;
    if(collide(v.pos,v.r*.8))v.target=null;
    v.g.rotation.y=v.heading;
  }
}
function updateNPCs(dt){
  const f=focusPos();const t=performance.now()*.004;
  for(const n of npcs){
    const g=n.p.g;const d=d2(g.position,f);
    const vis=d<VIEW;g.visible=vis;if(!vis)continue;
    // far NPCs animate at a lower rate
    let adt=dt;if(d>90){n.skip+=dt;if(frameNo%4)continue;adt=n.skip;}n.skip=0;
    if(n.sprite&&n.wants)n.sprite.position.y=2.6+Math.sin(t+g.position.x)*.12;
    if(n.happy>0){n.happy-=adt;animPerson(n.p,'dance',adt,0);continue;}
    if(n.sitter){animPerson(n.p,night>.5&&artCars.some(v=>d2(v.pos,g.position)<25)?'dance':'sit',adt,0);continue;}
    if(d>140){animPerson(n.p,'idle',adt,0);continue;}
    if(night>.4&&(artCars.some(v=>d2(v.pos,g.position)<20)||soundCamps.some(c=>c.on&&d2(c.pos,g.position)<30))){animPerson(n.p,'dance',adt,0);continue;}
    if(n.wait>0){n.wait-=adt;animPerson(n.p,'idle',adt,0);
      if(n.wants&&d<12)g.rotation.y=lerpAngle(g.rotation.y,Math.atan2(f.x-g.position.x,f.z-g.position.z),adt*3);
      continue;}
    const dx=n.target.x-g.position.x,dz=n.target.z-g.position.z,dist=Math.hypot(dx,dz);
    if(dist<.6){n.wait=R(2,9);n.target.copy(n.home).add(_v.set(R(-14,14),0,R(-14,14)));continue;}
    g.position.x+=dx/dist*n.speed*adt;g.position.z+=dz/dist*n.speed*adt;
    if(P.vehicle&&d<P.vehicle.r+1.5){const ax=g.position.x-f.x,az=g.position.z-f.z,al=Math.hypot(ax,az)||1;g.position.x=f.x+ax/al*(P.vehicle.r+1.5);g.position.z=f.z+az/al*(P.vehicle.r+1.5);}
    g.rotation.y=lerpAngle(g.rotation.y,Math.atan2(dx,dz),Math.min(1,adt*6));
    animPerson(n.p,'walk',adt,n.speed);
  }
}
function updateCyclists(dt){
  const f=focusPos();
  for(const c of cyclists){
    c.h+=c.dir*c.speed*dt/(c.r*TAU/12);if(c.h>9.95||c.h<2.05)c.dir*=-1;c.h=clamp(c.h,2.05,9.95);
    const p=clockPos(c.h,c.r);c.g.position.set(p.x,0,p.z);
    const t=c.h/12*TAU;c.g.rotation.y=Math.atan2(Math.cos(t)*c.dir,Math.sin(t)*c.dir);
    const d=d2(p,f);c.g.visible=d<200;if(d<120)animPerson(c.rider,'ride',dt,c.speed);
  }
}
function updatePickups(dt){
  const f=focusPos();const t=performance.now()*.002;
  for(const pk of pickups){
    if(!pk.active){pk.respawn-=dt;if(pk.respawn<=0)respot(pk);continue;}
    pk.g.rotation.y+=dt*1.5;pk.g.position.y=1.1+Math.sin(t+pk.g.position.x)*.15;
    if(f.y<4&&d2(pk.g.position,f)<(P.vehicle?P.vehicle.r+1:1.8)){
      pk.active=false;pk.g.visible=false;pk.respawn=pk.kind==='gift'?45:60;
      if(!P.vehicle)oneShot(player,'PickUp',.7);
      if(pk.kind==='gift'){const item=pick(GIFT_ITEMS);state.gifts.push(item);toast(`Found a gift to give away: ${item}.`);}
      sfx.pick();
    }
  }
}
let fwTimer=0;
function updateBurns(dt){
  const t=state.time,f=focusPos();
  if(t>MB-.45&&t<MB+.05){fwTimer-=dt;if(fwTimer<=0){fwTimer=R(.12,.45);burst(R(-40,40),R(70,120),R(-40,40),pick([0xff4fa8,0x46f1ff,0xffd23f,0xb4ff39,0xffffff,0xff6b35]));}}
  crowd.visible=(t>MB-.8&&t<MB+2.5)||(t>TB-.4&&t<TB+1.5);
  if(crowd.visible){const at=t<30?MAN:TEMPLE;if(crowd.position.distanceTo(at)>1)crowd.position.copy(at);const near=d2(at,f)<200;if(near)for(let i=0;i<crowdPeople.length;i++){if((i+frameNo)%2)continue;animPerson(crowdPeople[i],t<30?'dance':'idle',dt*2,0);}}
  manFire.intensity=t<MB?0:t<MB+.4?(t-MB)/.4:t<MB+2?lerp(1,.35,(t-MB-.4)/1.6):Math.max(.12,lerp(.35,.12,(t-MB-2)/3));
  if(t>=MB&&!state.manBurnt){state.manBurnt=true;toast('The Man is burning.');}
  if(t>=MB&&t<MB+.4&&d2(f,MAN)<170)state.sawMan=true;
  if(t>=MB){const k=clamp((t-MB)/.45,0,1);manWood.color.setHex(WOOD).lerp(tmpC.setHex(0x1a120c),k);manNeon.emissiveIntensity*=1-k;const c=clamp((t-MB-.3)/.18,0,1);const fig=man.userData.fig;fig.rotation.x=c*1.35;fig.position.y=10-c*8;fig.position.z=c*6;}
  manFire.update(dt);
  if(manFire.intensity>.25){const fp=focusPos();const dd=Math.hypot(fp.x,fp.z);if(dd<22&&!(P.vehicle&&P.vehicle.kind==='art')){const k=22/Math.max(dd,.1);fp.x*=k;fp.z*=k;if(fp.y>0){fp.y=groundHeight(fp.x,fp.z);}if(!state.hotWarn||performance.now()-state.hotWarn>5000){state.hotWarn=performance.now();toast('Too hot! The heat pushes you back from the fire.');}}}
  templeFire.intensity=t<TB?0:t<TB+.3?(t-TB)/.3:t<TB+1.6?1:Math.max(.1,lerp(1,.1,(t-TB-1.6)/2));
  if(t>=TB&&!state.templeBurnt){state.templeBurnt=true;toast('The Temple is burning. The crowd is silent.');}
  if(t>=TB&&t<TB+.4&&d2(f,TEMPLE)<160)state.sawTemple=true;
  if(t>=TB){const k=clamp((t-TB)/.6,0,1);templeWood.color.setHex(0xd8b37a).lerp(tmpC.setHex(0x1a120c),k);const c=clamp((t-TB-.9)/.3,0,1);temple.scale.y=1-c*.85;}
  templeFire.update(dt);
}
function updateDust(dt){
  if(state.dust<.02){dustPts.visible=false;return;}
  dustPts.visible=true;const f=camera.position;
  for(let i=0;i<DUSTN;i++){let x=dustPos[i*3]+dt*(18+(i%7)),y=dustPos[i*3+1]+Math.sin(i+performance.now()*.001)*dt,z=dustPos[i*3+2]+dt*6;
    if(x>45)x-=90;if(z>45)z-=90;dustPos[i*3]=x;dustPos[i*3+1]=y;dustPos[i*3+2]=z;}
  dustPts.position.set(f.x,f.y,f.z);dustGeo.attributes.position.needsUpdate=true;
}

// ================= camera =================
function updateCamera(dt,cinematic){
  if(cinematic){const a=performance.now()*.00004+2.25;camera.position.set(Math.sin(a)*150,28,Math.cos(a)*150+20);camera.lookAt(0,20,-30);camera.fov=55;camera.updateProjectionMatrix();return;}
  const f=focusPos();const v=P.vehicle;
  const dist=P.ride?(P.ride.drop?24:26):P.sky?Math.max(camDist,9):P.flying?Math.max(camDist,8):v?(v.kind==='art'?Math.max(camDist,16):Math.max(camDist,6.5)):camDist;
  if(P.ride&&!P.ride.drop&&performance.now()-lastLook>1400)camYaw=lerpAngle(camYaw,P.ride.heading+Math.PI,dt*1.5);
  const arm=armed();const sh=arm?(W.aiming?.7:.85):0;const shx=Math.cos(camYaw)*sh,shz=-Math.sin(camYaw)*sh;
  const ty=(v?(v.kind==='art'?v.deck+2.5:2):1.6)+(v&&v.kind==='art'?0:f.y)+(arm?.35:0);
  // pull the camera in when a tent, dome or car is between it and the player
  let dd=arm?(W.aiming?2.8:clamp(dist,5,6.5)):dist;const ux=Math.sin(camYaw)*Math.cos(camPitch),uz=Math.cos(camYaw)*Math.cos(camPitch),uy=Math.sin(camPitch);
  if((!v||v.kind==='bike')&&f.y<4&&!P.ride){for(let t=1.2;t<dist;t+=.5){const x=f.x+ux*t,z=f.z+uz*t,y=ty+uy*t;if(y>3.3)break;let hit=false;for(const o of obstaclesNear(x,z)){if(o.ramp)continue;if(Math.abs(x-o.x)>o.r+.3||Math.abs(z-o.z)>o.r+.3)continue;if((x-o.x)**2+(z-o.z)**2<(o.r+.3)**2){hit=true;break;}}if(hit){dd=Math.max(2.8,t-.6);break;}}}
  const cx=f.x+ux*dd+shx,cz=f.z+uz*dd+shz,cy=Math.max(.6,ty+uy*dd+(arm?0:(dist-dd)*.35));
  camera.position.lerp(_v.set(cx,cy,cz),P.ride&&P.ride.drop?1:Math.min(1,dt*(arm?18:9)));
  camera.lookAt(f.x+shx,ty,f.z+shz);
  if(W.shake>0){camera.rotation.x+=R(-1,1)*W.shake*.012;camera.rotation.y+=R(-1,1)*W.shake*.012;}
  const spd=P.sky?P.sky.vel.length()*.5:P.flying?P.fv.length()*.6:v?Math.abs(v.speed):Math.hypot(P.vel.x,P.vel.z);
  const fov=(W.aiming?60*W.zoom:60)+clamp(spd/26,0,1)*12;if(Math.abs(camera.fov-fov)>.05){camera.fov=lerp(camera.fov,fov,dt*3);camera.updateProjectionMatrix();}
}

// ================= HUD =================
const badgeSvg='<svg viewBox="0 0 20 22"><path d="M10 1.5 L18 4.5 V11 C18 16 14 19.5 10 20.5 C6 19.5 2 16 2 11 V4.5 Z"/></svg>';
const starSvg='<svg viewBox="0 0 24 24"><path d="M12 2.5l2.9 6.1 6.6.8-4.9 4.5 1.3 6.6L12 17.2 6.1 20.5l1.3-6.6L2.5 9.4l6.6-.8z"/></svg>';
$('#badges').innerHTML=[0,1,2,3,4].map(()=>`<span>${starSvg}</span>`).join('');
function fmtTime(t){const day=DAYS[Math.floor(t/24)%7];let h=Math.floor(t%24);const m=Math.floor((t%1)*60);const ap=h>=12?'PM':'AM';h=h%12||12;return`${day} ${h}:${String(m).padStart(2,'0')} ${ap}`;}
function updateHUD(){
  $('#clock').textContent=fmtTime(state.time);
  const f=focusPos();$('#where').textContent=address(f.x,f.z);
  const q=QUESTS[state.quest];
  $('#qstep').textContent=state.quest<6?`Objective ${state.quest+1} of 6`:'Free roam';
  $('#qtitle').textContent=q.title;$('#qtext').textContent=q.text();
  const stars=Math.floor(state.wanted||0);
  [...$('#badges').children].forEach((el,i)=>el.classList.toggle('on',i<stars));
  $('#badges').classList.toggle('flash',stars>0&&RG.seenT>1.5);$('#wantedbox').classList.toggle('hot',stars>0);
  $('#wantedlabel').textContent=stars===0?(RG.disguise>0?'Rangers · disguised':'Rangers · not looking'):RG.seenT<1.5?'Rangers · they see you!':P.hidden?'Rangers · searching (you’re hidden)':'Rangers · searching';
  $('#pocket').textContent=`Gifts in pocket: ${state.gifts.length} · Given: ${state.given}`;
  $('#vibes').textContent=`Good vibes ${state.karma}`;
  const dt2=dreamText();$('#dream').hidden=!dt2;if(dt2)$('#dtext').textContent=dt2;
  const sd=$('#side');sd.hidden=!state.job;if(state.job){$('#stitle').textContent=JOB_INFO[state.job.id].title;$('#stext').textContent=jobText(state.job);}
  let msg='';
  if(P.ride&&P.ride.drop&&state.quest===0&&drop.active){const D=drop.active;const dd=Math.hypot(STADIUM.pos.x-D.pos.x,STADIUM.pos.z-D.pos.z);const ahead=(STADIUM.pos.x-D.pos.x)*D.dir.x+(STADIUM.pos.z-D.pos.z)*D.dir.z>0;msg=dd<130?`<kbd>Space</kbd>JUMP NOW, you're over the Stone Stadium!`:`Stone Stadium ${Math.round(dd)} m ${ahead?'ahead':'behind you'} · <kbd>A</kbd><kbd>D</kbd>/<kbd>Mouse</kbd>Steer <kbd>W</kbd>Faster <kbd>Space</kbd>Jump`;}
  else if(P.ride&&P.ride.drop){msg=touch.on?`Stick: turn &amp; speed · drag to steer · Jump when ready`:`<kbd>A</kbd><kbd>D</kbd>/<kbd>Mouse</kbd>Steer <kbd>Mouse ↑</kbd>Dive <kbd>↓</kbd>Climb <kbd>W</kbd>Faster <kbd>S</kbd>Slower <kbd>Shift</kbd>Boost <kbd>Space</kbd>Jump`;}
  else if(P.ride)msg=P.ride.pos.y>220?'<kbd>Space</kbd>Jump!':'Climbing to jump altitude…';
  else if(P.sky)msg=P.sky.canopy?'<kbd>W</kbd>Glide where you look · <kbd>A</kbd><kbd>D</kbd>Turn · <kbd>S</kbd>Float':P.sky.vel.y>0?'Rocketing up…':'<kbd>W</kbd>Dive where you look · <kbd>Space</kbd>Open glider · <kbd>V</kbd>Spread your wings';
  else if(P.flying)msg='<kbd>Space</kbd>Rise · <kbd>C</kbd>Dive · <kbd>Shift</kbd>Blaze · <kbd>V</kbd>Land';
  else if(P.hidden)msg='Hiding… <kbd>E</kbd>Step out';
  else if(P.vehicle)msg=`<kbd>E</kbd>Hop off ${P.vehicle.kind==='art'?P.vehicle.name:'the bike'}`;
  else{const n=nearest(npcs,P.pos,x=>x.wants);const v=nearest(vehicles,P.pos,x=>!x.driven);
    const gv=Object.values(GIVERS).find(x=>d2(x.pos,P.pos)<3.6);const J=state.job;
    const lamp=J&&J.id==='lamp'&&lamps.find(l=>!l.lit&&d2(l.pos,P.pos)<3.2);
    const dp=daliPrompt();
    const hd=nearHide(),rk=nearRack();
    if(hd)msg='<kbd>E</kbd>Hide in the porta-potty';
    else if(rk)msg='<kbd>E</kbd>Grab a new costume from the free closet';
    else if(airport.plane&&!airport.busy&&d2(airport.plane.g.position,P.pos)<9)msg='<kbd>E</kbd>Board the jump plane';
    else if(lamp)msg='<kbd>E</kbd>Light the lantern';
    else if(dp)msg=dp;
    else if(nearPiece()){const mp=nearPiece();msg=`<kbd>E</kbd>Admire "${mp.def.title}" · ${ARTIST_NAME[mp.def.artist]||''}`;}
    else if(J&&J.id==='rescue'&&!J.following&&d2(J.who.g.position,P.pos)<3.6)msg=`<kbd>E</kbd>"Follow me, ${J.name}!"`;
    else if(gv)msg=`<kbd>E</kbd>Talk to ${gv.name}`;
    else if(n&&n.d<3.6)msg=state.gifts.length?`<kbd>E</kbd>Give ${n.item.name} a ${state.gifts[0]}`:`${n.item.name} would love a gift`;
    else if(v&&v.d<v.item.r+2.2)msg=v.item.kind==='art'?`<kbd>E</kbd>Climb aboard ${v.item.name}`:'<kbd>E</kbd>Ride this bike';}
  if(!msg&&!P.vehicle&&crowdMesh&&nearestCrowd(P.pos.x,P.pos.z,2.4)>=0)msg='<kbd>E</kbd>High-five';
  if(P.vehicle&&P.vehicle.kind==='bike'&&!msg)msg='';
  const pr=$('#prompt');pr.hidden=!msg;if(msg&&pr.innerHTML!==msg)pr.innerHTML=msg;
  const airborne=P.flying||P.sky||P.ride;$('#speedo').hidden=!P.vehicle&&!airborne;
  if(airborne){const m=$('#mph');m.firstChild.nodeValue=String(Math.round(P.pos.y));m.querySelector('small').textContent='METERS UP';m.classList.remove('over');$('#limit').hidden=true;}else $('#mph small').textContent='MPH';
  if(P.vehicle&&!airborne){const m=$('#mph');m.firstChild.nodeValue=String(Math.round(mphShown));m.classList.toggle('over',P.vehicle.kind==='art'&&mphShown>5.6);$('#limit').hidden=P.vehicle.kind!=='art';}
  if(P.vehicle&&P.vehicle.kind==='art'&&!msg)msg='';
}

// ================= minimap =================
const mm=$('#mm'),mctx=mm.getContext('2d');
function sizeMinimap(){const r=mm.getBoundingClientRect();const dpr=Math.min(2,window.devicePixelRatio||1);mm.width=Math.max(64,Math.round(r.width*dpr));mm.height=Math.max(64,Math.round(r.height*dpr));}
window.addEventListener('resize',()=>{if(!mm.hidden)sizeMinimap();});
function drawMinimap(){
  const S=mm.width,big=state.mapOpen;const viewR=big?720:240;const k=(S/2)/viewR;const f=focusPos();
  const cx=big?0:f.x,cz=big?0:f.z;
  mctx.setTransform(1,0,0,1,0,0);mctx.clearRect(0,0,S,S);
  mctx.save();if(!big){mctx.beginPath();mctx.arc(S/2,S/2,S/2,0,TAU);mctx.clip();}
  mctx.fillStyle='#1d1612';mctx.fillRect(0,0,S,S);
  mctx.translate(S/2,S/2);mctx.scale(k,k);mctx.translate(-cx,-cz);
  mctx.drawImage(mapCanvas,-800,-800,1600,1600);
  const dot=(p,r,col)=>{mctx.fillStyle=col;mctx.beginPath();mctx.arc(p.x,p.z,r/k,0,TAU);mctx.fill();};
  for(const pk of pickups)if(pk.active)dot(pk.g.position,big?2:1.6,pk.kind==='gift'?'#ff8fcf':'#8fd6ff');
  for(const n of npcs)if(n.wants)dot(n.pos,big?2.2:2,'#ff4fa8');
  for(const v of artCars)dot(v.pos,big?4:3.5,'#46f1ff');
  mctx.fillStyle=state.manBurnt?'#ff6b35':'#ffd23f';mctx.save();mctx.rotate(Math.PI/4);const ms=6/k;mctx.fillRect(-ms/2,-ms/2,ms,ms);mctx.restore();
  dot(TEMPLE,4,state.templeBurnt?'#ff6b35':'#e8c890');
  if(airport.park){mctx.strokeStyle='#46f1ff';mctx.lineWidth=2/k;const ap=airport.park;mctx.beginPath();mctx.moveTo(ap.x-6/k,ap.z);mctx.lineTo(ap.x+6/k,ap.z);mctx.moveTo(ap.x,ap.z-6/k);mctx.lineTo(ap.x,ap.z+6/k);mctx.stroke();}
  if(ambientSky.active)dot(ambientSky.plane.g.position,3,'#ffffff');
  if(drop.active){const D=drop.active;mctx.strokeStyle='rgba(255,255,255,.75)';mctx.setLineDash([10/k,8/k]);mctx.lineWidth=2.5/k;mctx.beginPath();mctx.moveTo(D.pos.x,D.pos.z);mctx.lineTo(D.pos.x+D.dir.x*400,D.pos.z+D.dir.z*400);mctx.stroke();mctx.setLineDash([]);dot(D.pos,5,'#ffd23f');}
  for(const pd of pads){mctx.strokeStyle='#46f1ff';mctx.lineWidth=2/k;mctx.beginPath();mctx.arc(pd.pos.x,pd.pos.z,(big?4:3.5)/k,0,TAU);mctx.stroke();}
  for(const c of soundCamps)dot(c.pos,3.5,c.on?'#9b6bff':'#5a4a6a');
  dot(CAMP,4.5,'#ff4fa8');mctx.strokeStyle='#fff';mctx.lineWidth=1.5/k;mctx.beginPath();mctx.arc(CAMP.x,CAMP.z,4.5/k,0,TAU);mctx.stroke();
  if(ranger.active&&Math.sin(performance.now()*.012)>0)dot(ranger.pos,4,'#c9b57c');
  for(const r of RG.list){if(d2(r.pos,f)>viewR*1.1)continue;const col=r.st==='chase'?'#ff3b2e':r.st==='search'||r.st==='notice'?'#ffd23f':'#d9c690';
    if(!big){mctx.fillStyle=col+'33';mctx.beginPath();mctx.moveTo(r.pos.x,r.pos.z);const vd=viewDist();mctx.arc(r.pos.x,r.pos.z,vd,Math.PI/2-r.heading-1,Math.PI/2-r.heading+1);mctx.closePath();mctx.fill();}
    dot(r.pos,big?3:2.6,col);}
  for(const dr of RG.drones)dot(dr.pos,3,'#ff6b35');
  if(wantedStars()>0&&RG.seenT>1.5){mctx.strokeStyle='rgba(255,210,63,.8)';mctx.setLineDash([5/k,4/k]);mctx.lineWidth=2/k;mctx.beginPath();mctx.arc(RG.lastSeen.x,RG.lastSeen.z,18,0,TAU);mctx.stroke();mctx.setLineDash([]);}
  for(const h of RG.hides)if(d2(h.pos,f)<viewR){mctx.fillStyle='#2c6fd1';const hs=(big?3:2.6)/k;mctx.fillRect(h.pos.x-hs/2,h.pos.z-hs/2,hs,hs);}
  for(const k2 of RG.racks){mctx.fillStyle='#ff8fcf';const hs=(big?4:3.2)/k;mctx.fillRect(k2.pos.x-hs/2,k2.pos.z-hs/2,hs,hs);}
  for(const k in GIVERS){const gv=GIVERS[k];if(!giverOpen(gv))continue;mctx.fillStyle='#ffb35a';const gs=5/k;mctx.fillRect(gv.pos.x-gs/2,gv.pos.z-gs/2,gs,gs);}
  const J=state.job;if(J&&J.search){mctx.setLineDash([6/k,5/k]);mctx.strokeStyle='#ffb35a';mctx.lineWidth=2/k;mctx.beginPath();mctx.arc(J.search.x,J.search.z,J.radius,0,TAU);mctx.stroke();mctx.setLineDash([]);}
  if(state.dream.stage===1)for(const c of dali.clocks)if(!c.got)dot(c.pos,big?3.4:3,'#b07cff');
  if(dali.phone&&state.dream.stage<2)dot(dali.phone.pos,big?3.6:3.2,'#ff3b2e');
  for(const b of dali.elephants)dot(b.g.position,big?4:3.4,'#e6d2b0');
  if(STADIUM.S){mctx.save();mctx.translate(STADIUM.pos.x,STADIUM.pos.z);mctx.rotate(-STADIUM.rot);mctx.fillStyle='rgba(60,140,60,.85)';mctx.fillRect(-32,-20,64,40);mctx.strokeStyle='rgba(200,170,130,.95)';mctx.lineWidth=3/k;mctx.strokeRect(-46,-33,92,66);mctx.restore();}
  for(const m of masters.pieces){mctx.fillStyle=ARTIST_COL[m.def.artist]||'#fff';const s2=(big?4:3.2)/k;mctx.fillRect(m.pos.x-s2/2,m.pos.z-s2/2,s2,s2);}
  if(J&&J.id==='moop')for(const it of J.items)if(it.visible)dot(it.position,1.6,'#fff2c0');
  const t2=jobTarget();if(t2){mctx.strokeStyle='#ffb35a';mctx.lineWidth=2/k;let tx=t2.x,tz=t2.z;if(!big){const dx=tx-cx,dz=tz-cz,dl=Math.hypot(dx,dz),lim=viewR*.9;if(dl>lim){tx=cx+dx/dl*lim;tz=cz+dz/dl*lim;}}mctx.beginPath();mctx.arc(tx,tz,(5+Math.sin(performance.now()*.008)*1.5)/k,0,TAU);mctx.stroke();}
  const tgt=QUESTS[state.quest]&&QUESTS[state.quest].target();
  if(tgt){const pulse=6+Math.sin(performance.now()*.006)*2;mctx.strokeStyle='#46f1ff';mctx.lineWidth=2/k;
    let tx=tgt.x,tz=tgt.z;if(!big){const dx=tx-cx,dz=tz-cz,dl=Math.hypot(dx,dz),lim=viewR*.9;if(dl>lim){tx=cx+dx/dl*lim;tz=cz+dz/dl*lim;}}
    mctx.beginPath();mctx.arc(tx,tz,pulse/k,0,TAU);mctx.stroke();}
  mctx.save();mctx.translate(f.x,f.z);mctx.rotate(-(P.vehicle?P.vehicle.heading:P.heading));const a=7/k;
  mctx.fillStyle='#ffb35a';mctx.strokeStyle='#140f0b';mctx.lineWidth=1.5/k;mctx.beginPath();mctx.moveTo(0,a*1.3);mctx.lineTo(a*.8,-a);mctx.lineTo(0,-a*.45);mctx.lineTo(-a*.8,-a);mctx.closePath();mctx.fill();mctx.stroke();mctx.restore();
  mctx.restore();
  if(!big){mctx.fillStyle='rgba(234,220,192,.9)';mctx.font=`600 ${Math.round(S*.07)}px 'Martian Mono', monospace`;mctx.textAlign='center';mctx.fillText('12',S/2,S*.1);}
}

// ================= boot =================
let ready=false,pendingSave=null;
function startGame(useSave){
  if(!ready)return;
  const resumed=useSave===true&&pendingSave&&!state.started;if(resumed)applySave(pendingSave);pendingSave=null;
  initAudio();if(audio.ctx&&audio.ctx.state==='suspended')audio.ctx.resume();
  $('#start').hidden=true;['#tl','#tr','#mm'].forEach(s=>$(s).hidden=false);if(isTouch)setupTouch();
  sizeMinimap();
  state.paused=false;
  if(!state.started){state.started=true;camera.position.set(P.pos.x+20,12,P.pos.z+30);
    if(resumed&&state.landed===false){startDrop(true);}
    else if(resumed){toast(`Welcome back, Phoenix. It’s ${fmtTime(state.time)}.`);if(WP&&!state.weapons.length)state.weapons.push(WP.START_WEAPON);if(state.weapon&&WP)equip(state.weapon,true);renderHotbar();}
    else startDrop(true);
    saveGame();}
  canvas.focus();
  if(!touch.on&&P.ride&&P.ride.drop&&canvas.requestPointerLock){try{const pr=canvas.requestPointerLock();if(pr&&pr.catch)pr.catch(()=>{});}catch(_){}}
}
$('#go').addEventListener('click',()=>startGame(true));
$('#go2').addEventListener('click',()=>{clearSave();pendingSave=null;startGame(false);});
function restore(d){
  if(!d||typeof d.time!=='number')return;
  Object.assign(state,{time:d.time,quest:d.quest||0,given:d.given||0,gifts:d.gifts||[],goggles:!!d.goggles});
  if(typeof d.x==='number')P.pos.set(d.x,0,d.z);
}
const hot=window.claude&&window.claude.hot;
if(hot&&hot.snapshot){try{hot.snapshot(()=>({time:state.time,quest:state.quest,given:state.given,gifts:state.gifts,goggles:state.goggles,x:P.pos&&P.pos.x,z:P.pos&&P.pos.z,started:state.started}));}catch(_){}}

let last=performance.now();
// adaptive resolution: keep frame time near 60 fps on slower machines
var pr=Math.min(window.devicePixelRatio||1,1.5),ftAcc=0,ftN=0;
function adapt(ms){ftAcc+=ms;ftN++;if(ftN<90)return;const avg=ftAcc/ftN;ftAcc=ftN=0;
  const max=Math.min(window.devicePixelRatio||1,prCap);let n=pr;if(avg>24)n=Math.max(.6,pr-.15);else if(avg<13)n=Math.min(max,pr+.1);
  if(Math.abs(n-pr)>.01){pr=n;renderer.setPixelRatio(pr);composer.setPixelRatio(pr);resize();}}
function frame(now){
  const dt=Math.min(.05,(now-last)/1000);if(state.started)adapt(now-last);last=now;
  if(state.started&&!state.paused){updateMelt(dt);update(dt*melt.scale,dt);updateCamera(dt,false);}
  else if(!state.started){envUpdate(dt);updateArtCars(dt);if(LZ.mesh){const tt=performance.now()*.001;updateLaserField(tt);updateFlares(tt);updateSkyFlares(dt);updateLightPool();}updateCamera(dt,true);}
  else if(P.vehicle===null&&player.cur==='Lie_Idle'){player.mixer.update(dt);}
  if(state.started&&!mm.hidden)drawMinimap();
  composer.render(dt);
  requestAnimationFrame(frame);
}
async function boot(data){
  const bar=$('#load i');
  try{
    await Promise.all([loadAssets(p=>{bar.style.width=Math.round(p*90)+'%';}),loadDali(),loadMasters(),loadProps(),loadWeapons()]);
    buildWorld();fxWrapScene(scene);bar.style.width='100%';
    restore(data||{});
    applySettings();pendingSave=loadSave();
    ready=true;const go=$('#go');go.disabled=false;go.textContent=pendingSave?'Continue the week':'Enter the playa';$('#go2').hidden=!pendingSave;
    $('#load').hidden=true;
    window.__game={STADIUM,stadWorld,stadLocal,inStadium,QUESTS,obstacles,compactProp,aimPoint,weaponTargets,startDrop,clearAir,drop,RG,W,mouse,giveWeapon,equip,holster,setWanted,enterHide,leaveHide,armed,pads,get WP(){return WP;},get PR(){return PR;},CAMP,CENTER,MAN,TEMPLE,exitVehicle,scene,get night(){return night;},LZ,FL,skyFlares,MB,TB,masters,admire,nearPiece,cX,cZ,crowdBurnGather,airport,ambientSky,toggleFly,boardPlane,jumpOut,dali,step(n,dt){for(let i=0;i<n;i++){update(dt||1/60);updateCamera(dt||1/60,false);}},keys,obstaclesNear,settings,applySettings,get crowdVerts(){return crowdMeshes.map(m=>m.geometry.attributes.position.count+'x'+m.count).join(' ');},parkPos,ramps,vehicles,groundHeight,state,P,startGame,startJob,enterVehicle,addKarma,poof,artCars,lamps,GIVERS,openPhone,openPause,renderer,camera,get player(){return player;},cam(y,p,d){camYaw=y;camPitch=p;camDist=d;lastLook=performance.now()+1e6;}};
  }catch(err){
    console.error(err);$('#go').textContent='Could not load the 3D models. Reload to try again.';
  }
  requestAnimationFrame(t=>{last=t;frame(t);});
}
if(hot&&hot.ready)hot.ready(boot);else boot(hot&&hot.data?hot.data:{});
