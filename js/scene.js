// J.A.R.V.I.S 3D core: particle energy sphere, holographic rings, bloom.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

// Ashima 3D simplex noise (MIT) - drives the organic motion of the particles.
const NOISE_GLSL = /* glsl */ `
vec3 mod289(vec3 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 mod289(vec4 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 permute(vec4 x){return mod289(((x*34.0)+1.0)*x);}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-0.85373472095314*r;}
float snoise(vec3 v){
  const vec2 C=vec2(1.0/6.0,1.0/3.0); const vec4 D=vec4(0.0,0.5,1.0,2.0);
  vec3 i=floor(v+dot(v,C.yyy)); vec3 x0=v-i+dot(i,C.xxx);
  vec3 g=step(x0.yzx,x0.xyz); vec3 l=1.0-g; vec3 i1=min(g.xyz,l.zxy); vec3 i2=max(g.xyz,l.zxy);
  vec3 x1=x0-i1+C.xxx; vec3 x2=x0-i2+C.yyy; vec3 x3=x0-D.yyy;
  i=mod289(i);
  vec4 p=permute(permute(permute(i.z+vec4(0.0,i1.z,i2.z,1.0))+i.y+vec4(0.0,i1.y,i2.y,1.0))+i.x+vec4(0.0,i1.x,i2.x,1.0));
  float n_=0.142857142857; vec3 ns=n_*D.wyz-D.xzx;
  vec4 j=p-49.0*floor(p*ns.z*ns.z); vec4 x_=floor(j*ns.z); vec4 y_=floor(j-7.0*x_);
  vec4 x=x_*ns.x+ns.yyyy; vec4 y=y_*ns.x+ns.yyyy; vec4 h=1.0-abs(x)-abs(y);
  vec4 b0=vec4(x.xy,y.xy); vec4 b1=vec4(x.zw,y.zw);
  vec4 s0=floor(b0)*2.0+1.0; vec4 s1=floor(b1)*2.0+1.0; vec4 sh=-step(h,vec4(0.0));
  vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy; vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
  vec3 p0=vec3(a0.xy,h.x); vec3 p1=vec3(a0.zw,h.y); vec3 p2=vec3(a1.xy,h.z); vec3 p3=vec3(a1.zw,h.w);
  vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
  p0*=norm.x; p1*=norm.y; p2*=norm.z; p3*=norm.w;
  vec4 m=max(0.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.0); m=m*m;
  return 42.0*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
}`;

const SPHERE_VERT = /* glsl */ `
uniform float uTime; uniform float uAudio; uniform float uPulse; uniform float uSize; uniform float uPixelRatio;
attribute float aRand;
varying float vMix; varying float vAlpha;
${NOISE_GLSL}
void main(){
  float r = length(position);
  vec3 dir = position / max(r, 1e-4);
  float n = snoise(dir * 1.7 + vec3(uTime * 0.22, uTime * 0.17, -uTime * 0.13));
  float beat = sin(uTime * uPulse + aRand * 6.2831) * 0.035;
  // Audio pushes particles outward - louder voice, wider scatter.
  float disp = n * (0.07 + uAudio * 0.45) + beat + uAudio * aRand * aRand * 0.9;
  vec3 p = dir * (r + disp * r);
  // Slow differential swirl around Y.
  float a = uTime * (0.12 + 0.25 * aRand) * (0.6 + r);
  p.xz = mat2(cos(a), -sin(a), sin(a), cos(a)) * p.xz;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_PointSize = uSize * uPixelRatio * (0.5 + aRand) * (1.0 + uAudio * 0.9) / -mv.z;
  gl_Position = projectionMatrix * mv;
  vMix = clamp(n * 0.5 + 0.5 + uAudio * 0.35, 0.0, 1.0);
  vAlpha = 0.3 + 0.5 * aRand;
}`;

const SPHERE_FRAG = /* glsl */ `
uniform vec3 uColor; uniform vec3 uColor2;
varying float vMix; varying float vAlpha;
void main(){
  float d = length(gl_PointCoord - 0.5);
  if (d > 0.5) discard;
  float s = pow(1.0 - d * 2.0, 1.7);
  vec3 c = mix(uColor, uColor2, vMix);
  gl_FragColor = vec4(c * (0.25 + 0.9 * s), s * vAlpha);
}`;

function glowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.2, 'rgba(255,255,255,0.65)');
  grad.addColorStop(0.5, 'rgba(255,255,255,0.15)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export class JarvisCore {
  constructor(canvas, hex = '#00e5ff') {
    this.canvas = canvas;
    this.clock = new THREE.Clock();
    this.audioTarget = 0;
    this.audio = 0;
    this.scaleTarget = 1;
    this.scale = 1;
    this.mode = 'idle'; // idle | listening | thinking | speaking
    this.pointer = new THREE.Vector2();
    this.color = new THREE.Color(hex);
    this.color2 = new THREE.Color();
    this.colorFrom = this.color.clone();
    this.colorTo = this.color.clone();
    this.colorT = 1;
    this.themed = []; // { set(color, color2) } entries recolored on theme change
    this.onFrame = null;

    const small = Math.min(window.innerWidth, window.innerHeight) < 700;
    this.quality = small ? 0.55 : 1;

    this.#initRenderer();
    this.#buildStars();
    this.#buildSphere();
    this.#buildCore();
    this.#buildRings();
    this.#buildDust();
    this.#applyColor(this.color);

    window.addEventListener('resize', () => this.#resize());
    window.addEventListener('pointermove', (e) => {
      this.pointer.set((e.clientX / window.innerWidth) * 2 - 1, (e.clientY / window.innerHeight) * 2 - 1);
    });
    this.renderer.setAnimationLoop(() => this.#tick());
  }

  // ----------------------------------------------------------------- public API
  setAudioLevel(v) { this.audioTarget = Math.max(0, Math.min(1, v)); }
  setGestureScale(s) { this.scaleTarget = s == null ? 1 : Math.max(0.5, Math.min(1.9, s)); }
  setMode(mode) { this.mode = mode; }

  setColor(hex, animate = true) {
    this.colorFrom = this.color.clone();
    this.colorTo = new THREE.Color(hex);
    this.colorT = animate ? 0 : 1;
    if (!animate) this.#applyColor(this.colorTo);
  }

  // ----------------------------------------------------------------- setup
  #initRenderer() {
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setClearColor(0x000308, 1);

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x000308, 0.045);
    this.camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 200);
    this.baseCamZ = window.innerWidth < 700 ? 8 : 6.2;
    this.camera.position.set(0, 0, this.baseCamZ);

    this.root = new THREE.Group(); // everything that scales with gestures
    this.scene.add(this.root);

    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.8, 0.5, 0.2);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());

    this.light = new THREE.PointLight(0xffffff, 40, 12, 1.6);
    this.root.add(this.light);
    this.scene.add(new THREE.AmbientLight(0x223344, 0.4));
  }

  #buildStars() {
    const n = Math.floor(2500 * this.quality);
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const r = 30 + Math.random() * 70;
      const th = Math.random() * Math.PI * 2;
      const ph = Math.acos(2 * Math.random() - 1);
      pos.set([r * Math.sin(ph) * Math.cos(th), r * Math.sin(ph) * Math.sin(th), r * Math.cos(ph)], i * 3);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.stars = new THREE.Points(geo, new THREE.PointsMaterial({
      size: 0.18, color: 0x8fb8ff, transparent: true, opacity: 0.55, map: glowTexture(),
      depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    }));
    this.scene.add(this.stars);
  }

  #buildSphere() {
    const n = Math.floor(11000 * this.quality);
    const pos = new Float32Array(n * 3);
    const rand = new Float32Array(n);
    const golden = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < n; i++) {
      let r;
      if (i < n * 0.68) r = 1.0 + (Math.random() - 0.5) * 0.06;          // shell
      else if (i < n * 0.85) r = 0.72 + Math.random() * 0.12;            // inner shell
      else r = Math.cbrt(Math.random()) * 0.65;                           // volume
      const y = 1 - (i / (n - 1)) * 2;
      const rad = Math.sqrt(1 - y * y);
      const th = golden * i;
      pos.set([Math.cos(th) * rad * r, y * r, Math.sin(th) * rad * r], i * 3);
      rand[i] = Math.random();
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aRand', new THREE.BufferAttribute(rand, 1));

    this.sphereUniforms = {
      uTime: { value: 0 }, uAudio: { value: 0 }, uPulse: { value: 1.6 },
      uSize: { value: 20 }, uPixelRatio: { value: this.renderer.getPixelRatio() },
      uColor: { value: new THREE.Color() }, uColor2: { value: new THREE.Color() },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.sphereUniforms, vertexShader: SPHERE_VERT, fragmentShader: SPHERE_FRAG,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    this.sphere = new THREE.Points(geo, mat);
    this.root.add(this.sphere);
    this.themed.push({ set: (c, c2) => { this.sphereUniforms.uColor.value.copy(c); this.sphereUniforms.uColor2.value.copy(c2); } });
  }

  #buildCore() {
    const tex = glowTexture();
    this.coreMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95 });
    this.coreMesh = new THREE.Mesh(new THREE.SphereGeometry(0.2, 32, 32), this.coreMat);
    this.root.add(this.coreMesh);

    this.halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.halo.scale.setScalar(1.9);
    this.root.add(this.halo);

    this.lattice = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.5, 1),
      new THREE.MeshBasicMaterial({ wireframe: true, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    this.root.add(this.lattice);

    this.themed.push({
      set: (c, c2) => {
        this.coreMat.color.copy(c2).lerp(new THREE.Color(0xffffff), 0.55);
        this.halo.material.color.copy(c);
        this.lattice.material.color.copy(c2);
        this.light.color.copy(c);
      },
    });
  }

  #ringMaterial(opacity) {
    return new THREE.MeshBasicMaterial({ transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  }

  #buildRings() {
    this.rings = [];
    const add = (obj, { tilt = [0, 0, 0], spin = [0, 0, 0.3], opacity = 0.8, alt = false }) => {
      const pivot = new THREE.Group();
      pivot.rotation.set(...tilt);
      pivot.add(obj);
      this.root.add(pivot);
      this.rings.push({ pivot, obj, spin: new THREE.Vector3(...spin), baseOpacity: opacity, phase: Math.random() * 6.28 });
      const mats = [];
      obj.traverse((o) => o.material && mats.push(o.material));
      this.themed.push({ set: (c, c2) => mats.forEach((m) => m.color.copy(alt ? c2 : c)) });
    };

    // 1. Thin solid equator ring
    add(new THREE.Mesh(new THREE.TorusGeometry(1.45, 0.006, 8, 256), this.#ringMaterial(0.9)),
      { tilt: [Math.PI / 2, 0, 0], spin: [0, 0, 0.25] });

    // 2. Segmented arc ring (counter-rotating)
    const seg = new THREE.Group();
    const segMat = this.#ringMaterial(0.85);
    [0, 1, 2, 3].forEach((k) => {
      const arc = new THREE.Mesh(new THREE.TorusGeometry(1.62, 0.018, 6, 96, Math.PI * 0.38), segMat);
      arc.rotation.z = k * Math.PI / 2;
      seg.add(arc);
    });
    add(seg, { tilt: [Math.PI / 2.4, 0.3, 0], spin: [0, 0, -0.55], alt: true });

    // 3. Tick-mark ring (like a dial)
    const ticks = 120;
    const tickPos = [];
    for (let i = 0; i < ticks; i++) {
      const a = (i / ticks) * Math.PI * 2;
      const len = i % 10 === 0 ? 0.1 : 0.04;
      tickPos.push(Math.cos(a) * 1.85, Math.sin(a) * 1.85, 0, Math.cos(a) * (1.85 + len), Math.sin(a) * (1.85 + len), 0);
    }
    const tickGeo = new THREE.BufferGeometry();
    tickGeo.setAttribute('position', new THREE.Float32BufferAttribute(tickPos, 3));
    add(new THREE.LineSegments(tickGeo, new THREE.LineBasicMaterial({ transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false })),
      { tilt: [Math.PI / 2, 0, 0], spin: [0, 0, 0.12] });

    // 4. Dashed orbit on the Y axis
    const dashPts = [];
    for (let i = 0; i <= 256; i++) { const a = (i / 256) * Math.PI * 2; dashPts.push(new THREE.Vector3(Math.cos(a) * 1.3, Math.sin(a) * 1.3, 0)); }
    const dashGeo = new THREE.BufferGeometry().setFromPoints(dashPts);
    const dash = new THREE.Line(dashGeo, new THREE.LineDashedMaterial({ dashSize: 0.08, gapSize: 0.05, transparent: true, opacity: 0.75, blending: THREE.AdditiveBlending, depthWrite: false }));
    dash.computeLineDistances();
    add(dash, { tilt: [0, 0, 0], spin: [0, 0.7, 0], alt: true });

    // 5. Tilted thin ring on X axis, opposite direction
    add(new THREE.Mesh(new THREE.TorusGeometry(1.7, 0.004, 6, 256), this.#ringMaterial(0.6)),
      { tilt: [0.4, 0, Math.PI / 3], spin: [-0.45, 0, 0] });

    // 6. Wide outer halo band - lit by the point light (metallic) with an emissive edge
    const bandMat = new THREE.MeshStandardMaterial({ color: 0x0a1218, metalness: 0.9, roughness: 0.25, emissive: 0x000000, emissiveIntensity: 0.6, transparent: true, opacity: 0.9 });
    const band = new THREE.Mesh(new THREE.TorusGeometry(2.2, 0.03, 12, 256, Math.PI * 1.4), bandMat);
    const bandPivot = new THREE.Group();
    bandPivot.rotation.set(Math.PI / 2.1, -0.2, 0);
    bandPivot.add(band);
    this.root.add(bandPivot);
    this.rings.push({ pivot: bandPivot, obj: band, spin: new THREE.Vector3(0, 0, -0.18), baseOpacity: 0.9, phase: 0, lit: true });
    this.themed.push({ set: (c) => bandMat.emissive.copy(c) });

    // 7. Orbiting satellites on the segmented ring
    const satGeo = new THREE.SphereGeometry(0.03, 12, 12);
    const satMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const sats = new THREE.Group();
    [0, 2.1, 4.2].forEach((a) => {
      const s = new THREE.Mesh(satGeo, satMat);
      s.position.set(Math.cos(a) * 1.45, Math.sin(a) * 1.45, 0);
      sats.add(s);
    });
    add(sats, { tilt: [Math.PI / 2, 0, 0], spin: [0, 0, 0.9] });
  }

  #buildDust() {
    const n = Math.floor(1800 * this.quality);
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const r = 2.4 + Math.random() * 2.2;
      const th = Math.random() * Math.PI * 2;
      const y = (Math.random() - 0.5) * 0.6 * r;
      pos.set([Math.cos(th) * r, y, Math.sin(th) * r], i * 3);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.dust = new THREE.Points(geo, new THREE.PointsMaterial({
      size: 0.05, map: glowTexture(), transparent: true, opacity: 0.6, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    this.root.add(this.dust);
    this.themed.push({ set: (c, c2) => this.dust.material.color.copy(c2) });
  }

  #applyColor(c) {
    this.color.copy(c);
    const hsl = {};
    c.getHSL(hsl);
    // Secondary tone: slight hue shift and brighter - gives the blue/turquoise blend.
    this.color2.setHSL((hsl.h + 0.06) % 1, Math.min(1, hsl.s * 0.9 + 0.1), Math.min(0.85, hsl.l + 0.18));
    this.themed.forEach((t) => t.set(this.color, this.color2));
  }

  #resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.baseCamZ = w < 700 ? 8 : 6.2;
    this.renderer.setSize(w, h);
    this.composer.setSize(w, h);
    this.sphereUniforms.uPixelRatio.value = this.renderer.getPixelRatio();
  }

  // ----------------------------------------------------------------- frame loop
  #tick() {
    const dt = Math.min(this.clock.getDelta(), 0.05);
    const t = this.clock.elapsedTime;

    // Smooth inputs (fast attack, slower release feels like a real VU meter).
    const k = this.audioTarget > this.audio ? 0.35 : 0.08;
    this.audio += (this.audioTarget - this.audio) * k;
    this.scale += (this.scaleTarget - this.scale) * 0.12;

    if (this.colorT < 1) {
      this.colorT = Math.min(1, this.colorT + dt / 0.9);
      const e = 1 - Math.pow(1 - this.colorT, 3);
      this.#applyColor(this.colorFrom.clone().lerp(this.colorTo, e));
    }

    const modeBoost = { idle: 0, listening: 0.15, thinking: 0.35, speaking: 0.1 }[this.mode] ?? 0;
    const a = this.audio;
    const u = this.sphereUniforms;
    u.uTime.value = t;
    u.uAudio.value = a;
    u.uPulse.value = 1.6 + a * 9 + modeBoost * 6; // heartbeat rate follows the voice

    const beat = 1 + Math.sin(t * u.uPulse.value) * (0.015 + a * 0.06);
    this.root.scale.setScalar(this.scale * beat);

    this.coreMesh.scale.setScalar(1 + a * 1.4 + Math.sin(t * 3) * 0.05);
    this.halo.scale.setScalar(1.3 + a * 1.8 + modeBoost);
    this.halo.material.opacity = 0.4 + a * 0.4;
    this.lattice.rotation.x += dt * (0.2 + a);
    this.lattice.rotation.y -= dt * (0.3 + a);
    this.light.intensity = 30 + a * 120;

    const spinMul = 1 + a * 3.5 + modeBoost * 4;
    for (const r of this.rings) {
      r.obj.rotation.x += r.spin.x * dt * spinMul;
      r.obj.rotation.y += r.spin.y * dt * spinMul;
      r.obj.rotation.z += r.spin.z * dt * spinMul;
      const s = 1 + a * 0.18 * Math.sin(t * 6 + r.phase) + a * 0.12;
      r.obj.scale.setScalar(s);
      if (!r.lit) r.obj.traverse((o) => { if (o.material) o.material.opacity = Math.min(1, r.baseOpacity * (0.75 + a * 0.6)); });
    }

    this.dust.rotation.y += dt * (0.03 + a * 0.2);
    this.stars.rotation.y += dt * 0.004;
    this.bloom.strength = 0.75 + a * 0.8 + modeBoost * 0.4;

    // Camera: gestures pull it in/out, the pointer adds gentle parallax.
    const camZ = this.baseCamZ - (this.scale - 1) * 1.4;
    this.camera.position.x += (this.pointer.x * 0.5 - this.camera.position.x) * 0.04;
    this.camera.position.y += (-this.pointer.y * 0.35 - this.camera.position.y) * 0.04;
    this.camera.position.z += (camZ - this.camera.position.z) * 0.08;
    this.camera.fov += ((55 - (this.scale - 1) * 6) - this.camera.fov) * 0.08;
    this.camera.updateProjectionMatrix();
    this.camera.lookAt(0, 0, 0);

    this.composer.render();
    this.onFrame?.({ audio: a, scale: this.scale });
  }
}
