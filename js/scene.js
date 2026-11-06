// The 3D world: sky, ground, pole, windsock, weather effects, and the six
// drawing styles.
//
// World axes: x = east, y = up, z = south (so north is -z). The pole stands at
// the origin. The camera always looks at the pole from the direction you're
// facing, so turning your phone turns the view, not the wind.

import * as THREE from '../vendor/three.module.min.js';
import { Windsock, STRIPES } from './sock.js';
import { computeLook } from './sky.js';
import { PALETTES } from './palettes.js';

const RAD = Math.PI / 180;
const KN = 0.514444; // knots -> m/s

/* ---------- shaders ---------- */

// Inverted-hull outline with a roughly constant on-screen thickness.
function hullMaterial(color, thickness, { opacity = 1, additive = false } = {}) {
  return new THREE.ShaderMaterial({
    uniforms: {
      color: { value: new THREE.Color(color) },
      thickness: { value: thickness },
      opacity: { value: opacity },
    },
    vertexShader: /* glsl */ `
      uniform float thickness;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vec3 n = normalize(normalMatrix * normal);
        mv.xyz += n * thickness * max(1.0, -mv.z);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 color;
      uniform float opacity;
      void main() {
        gl_FragColor = vec4(color, opacity);
        #include <colorspace_fragment>
      }`,
    side: THREE.BackSide,
    transparent: opacity < 1 || additive,
    depthWrite: !additive,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
  });
}

// Crisp lines drawn along the sock's stripe seams (and optionally lengthwise),
// with an optional glow. Used by the line-art styles.
function seamMaterial({ colors, width = 1.5, glow = 0, along = 0, opacity = 1, additive = false }) {
  return new THREE.ShaderMaterial({
    uniforms: {
      colors: { value: colors.map((c) => new THREE.Color(c)) },
      width: { value: width },
      glow: { value: glow },
      along: { value: along },
      opacity: { value: opacity },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 colors[${STRIPES}];
      uniform float width;
      uniform float glow;
      uniform float along;
      uniform float opacity;
      varying vec2 vUv;
      float lineDist(float x, float freq) {
        float f = x * freq;
        return abs(f - floor(f + 0.5)) / max(fwidth(f), 1e-5);
      }
      void main() {
        float d = lineDist(vUv.y, ${STRIPES}.0);
        if (along > 0.0) d = min(d, lineDist(vUv.x, along));
        float core = 1.0 - smoothstep(width - 0.75, width + 0.75, d);
        float halo = glow > 0.0 ? exp(-d / glow) * 0.55 : 0.0;
        float a = max(core, halo);
        if (a < 0.02) discard;
        int s = int(clamp(floor(vUv.y * ${STRIPES}.0), 0.0, ${STRIPES - 1}.0));
        gl_FragColor = vec4(colors[s], a * opacity);
        #include <colorspace_fragment>
      }`,
    side: THREE.DoubleSide,
    transparent: true,
    depthWrite: false,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
  });
}

const depthOnly = () =>
  new THREE.MeshBasicMaterial({
    colorWrite: false,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: 2,
    polygonOffsetUnits: 2,
  });

function toonGradient(steps) {
  const data = new Uint8Array(steps);
  for (let i = 0; i < steps; i++) data[i] = Math.round(70 + (185 * i) / (steps - 1));
  const t = new THREE.DataTexture(data, steps, 1, THREE.RedFormat);
  t.minFilter = t.magFilter = THREE.NearestFilter;
  t.needsUpdate = true;
  return t;
}

function stripeTexture(colors, { fabric = false, nearest = false } = {}) {
  const w = fabric ? 128 : 4;
  const h = fabric ? 1024 : 640;
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const g = cv.getContext('2d');
  const band = h / STRIPES;
  colors.forEach((c, s) => {
    g.fillStyle = c;
    g.fillRect(0, h - (s + 1) * band, w, band + 1); // v=0 (mouth) is the bottom row
  });
  if (fabric) {
    // weave + stitched seams
    const img = g.getImageData(0, 0, w, h);
    const d = img.data;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const k = (y * w + x) * 4;
        const weave = ((x + (y >> 1)) % 4 === 0 ? -9 : 0) + ((y % 3 === 0) ? -5 : 0);
        const n = weave + (Math.random() - 0.5) * 12;
        d[k] = Math.max(0, Math.min(255, d[k] + n));
        d[k + 1] = Math.max(0, Math.min(255, d[k + 1] + n));
        d[k + 2] = Math.max(0, Math.min(255, d[k + 2] + n));
      }
    }
    g.putImageData(img, 0, 0);
    g.fillStyle = 'rgba(0,0,0,0.28)';
    for (let s = 1; s < STRIPES; s++) g.fillRect(0, h - s * band - 2, w, 4);
    g.fillStyle = 'rgba(0,0,0,0.35)';
    g.fillRect(0, h - 10, w, 10); // reinforced hem at the mouth
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  if (nearest) tex.minFilter = tex.magFilter = THREE.NearestFilter;
  tex.anisotropy = 4;
  return tex;
}

function cloudTexture() {
  const cv = document.createElement('canvas');
  cv.width = 256;
  cv.height = 128;
  const g = cv.getContext('2d');
  for (let i = 0; i < 14; i++) {
    const x = 40 + Math.random() * 176;
    const y = 60 + Math.random() * 30 - (1 - Math.abs(x - 128) / 128) * 22;
    const r = 18 + Math.random() * 30 * (1 - Math.abs(x - 128) / 160);
    const grd = g.createRadialGradient(x, y, 0, x, y, r);
    grd.addColorStop(0, 'rgba(255,255,255,0.9)');
    grd.addColorStop(0.6, 'rgba(255,255,255,0.45)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  }
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function dotTexture() {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 32;
  const g = cv.getContext('2d');
  const grd = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.5, 'rgba(255,255,255,0.6)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 32, 32);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/* ---------- scene ---------- */

export class WindScene {
  constructor(canvas, { onThunder } = {}) {
    this.canvas = canvas;
    this.onThunder = onThunder;
    const r = (this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
    }));
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(60, 1, 0.1, 4000);
    this.heading = 0;
    this.camDist = 14;
    this.flash = 0;
    this.time = 0;

    this.sock = new Windsock();
    this._lights();
    this._sky();
    this._ground();
    this._pole();
    this._sockMeshes();
    this._weather();

    this.look = null;
    this.mode = 'auto';
    this.styleKey = null;
    this.paletteKey = null;
    this._nextBolt = 5 + Math.random() * 6;
    this._bolt = -1;
  }

  /* ----- setup ----- */

  _lights() {
    this.hemi = new THREE.HemisphereLight(0xffffff, 0x445533, 1);
    this.sun = new THREE.DirectionalLight(0xffffff, 2.5);
    this.sun.shadow.mapSize.set(1024, 1024);
    const sc = this.sun.shadow.camera;
    sc.left = sc.bottom = -8;
    sc.right = sc.top = 8;
    sc.near = 1;
    sc.far = 80;
    this.sun.shadow.bias = -0.0008;
    this.sun.target.position.set(0, 3, 0);
    this.lamp = new THREE.PointLight(0xffd8a0, 0, 14, 1.4);
    this.lamp.position.set(0.8, 7.4, 0.8);
    this.scene.add(this.hemi, this.sun, this.sun.target, this.lamp);
  }

  _sky() {
    this.skyMat = new THREE.ShaderMaterial({
      uniforms: {
        zenith: { value: new THREE.Color() },
        horizon: { value: new THREE.Color() },
        sunDir: { value: new THREE.Vector3(0, 1, 0) },
        sunColor: { value: new THREE.Color() },
        sunGlow: { value: 0 },
        flash: { value: 0 },
      },
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main() {
          vDir = position;
          vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          gl_Position = p.xyww;
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 zenith, horizon, sunDir, sunColor;
        uniform float sunGlow, flash;
        varying vec3 vDir;
        void main() {
          vec3 d = normalize(vDir);
          float h = max(d.y, 0.0);
          vec3 col = mix(horizon, zenith, pow(h, 0.5));
          float s = max(dot(d, sunDir), 0.0);
          col += sunColor * (pow(s, 6.0) * 0.25 + pow(s, 60.0) * 0.6) * sunGlow;
          col += sunColor * smoothstep(0.9993, 0.9996, s) * sunGlow * 2.0;
          col += vec3(0.75, 0.8, 1.0) * flash;
          gl_FragColor = vec4(col, 1.0);
          #include <colorspace_fragment>
        }`,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(1800, 32, 16), this.skyMat);
    this.sky.renderOrder = -10;
    this.sky.frustumCulled = false;

    const n = 900;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const u = Math.random();
      const el = Math.asin(0.04 + 0.96 * u);
      const az = Math.random() * Math.PI * 2;
      pos[i * 3] = Math.cos(el) * Math.sin(az) * 1500;
      pos[i * 3 + 1] = Math.sin(el) * 1500;
      pos[i * 3 + 2] = Math.cos(el) * Math.cos(az) * 1500;
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.starMat = new THREE.PointsMaterial({
      size: 1.6,
      sizeAttenuation: false,
      color: 0xffffff,
      transparent: true,
      opacity: 0,
      fog: false,
      depthWrite: false,
    });
    this.stars = new THREE.Points(sg, this.starMat);
    this.stars.renderOrder = -9;
    this.stars.frustumCulled = false;

    this.skyGroup = new THREE.Group();
    this.skyGroup.add(this.sky, this.stars);
    this.scene.add(this.skyGroup);
  }

  _ground() {
    const g = new THREE.CircleGeometry(1600, 72).rotateX(-Math.PI / 2);
    this.ground = new THREE.Mesh(g);
    this.ground.receiveShadow = true;
    this.scene.add(this.ground);

    this.grid = new THREE.GridHelper(60, 30, 0xffffff, 0xffffff);
    this.grid.material.transparent = true;
    this.grid.material.opacity = 0.22;
    this.grid.material.depthWrite = false;
    this.scene.add(this.grid);

  }

  _pole() {
    const H = this.sock.poleHeight;
    const parts = (this.poleParts = []);
    const add = (geo, pos, kind, parent = this.scene) => {
      const m = new THREE.Mesh(geo);
      m.position.copy(pos);
      m.castShadow = true;
      m.receiveShadow = true;
      m.userData.kind = kind;
      parent.add(m);
      parts.push(m);
      return m;
    };
    add(new THREE.CylinderGeometry(0.05, 0.065, H, 18), new THREE.Vector3(0, H / 2, 0), 'metal');
    add(new THREE.CylinderGeometry(0.6, 0.66, 0.14, 32), new THREE.Vector3(0, 0.07, 0), 'concrete');
    add(new THREE.CylinderGeometry(0.075, 0.075, 0.32, 18), new THREE.Vector3(0, H, 0), 'metal');
    add(new THREE.SphereGeometry(0.07, 16, 10), new THREE.Vector3(0, H + 0.2, 0), 'metal');

    // swivel frame: turns with the sock
    this.swivel = new THREE.Group();
    this.swivel.position.set(0, H, 0);
    this.scene.add(this.swivel);
    const s = this.sock;
    const rodLen = s.arm - s.r0 + 0.04;
    const rod = new THREE.CylinderGeometry(0.018, 0.018, rodLen, 8).rotateX(Math.PI / 2);
    add(rod, new THREE.Vector3(0, 0, -rodLen / 2), 'metal', this.swivel);
    const hoop = new THREE.TorusGeometry(s.r0, 0.024, 10, 48);
    add(hoop, new THREE.Vector3(0, 0, -s.arm), 'metal', this.swivel);
    const hoop2 = new THREE.TorusGeometry(s.r0 - 0.012, 0.016, 8, 48);
    add(hoop2, new THREE.Vector3(0, 0, -s.arm - s.segLen), 'metal', this.swivel);
    // struts between the two hoops
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
      const strut = new THREE.CylinderGeometry(0.01, 0.01, s.segLen, 6).rotateX(Math.PI / 2);
      add(strut, new THREE.Vector3(Math.cos(a) * s.r0, Math.sin(a) * s.r0, -s.arm - s.segLen / 2), 'metal', this.swivel);
    }

    // a hull (outline) mesh for every pole part, shown in ink styles
    this.poleHulls = parts.map((m) => {
      const h = new THREE.Mesh(m.geometry);
      h.renderOrder = 1;
      m.add(h);
      return h;
    });
  }

  _sockMeshes() {
    const g = this.sock.geometry;
    this.sockMesh = new THREE.Mesh(g);
    this.sockMesh.castShadow = true;
    this.sockMesh.receiveShadow = true;
    this.sockHulls = [0, 1, 2].map(() => {
      const h = new THREE.Mesh(g);
      h.renderOrder = 1;
      return h;
    });
    this.sockSeams = new THREE.Mesh(g);
    this.sockSeams.renderOrder = 3;
    for (const m of [this.sockMesh, this.sockSeams, ...this.sockHulls]) {
      m.frustumCulled = false;
      this.scene.add(m);
    }
  }

  _weather() {
    // clouds
    this.cloudTex = cloudTexture();
    this.clouds = [];
    for (let i = 0; i < 46; i++) {
      const mat = new THREE.SpriteMaterial({ map: this.cloudTex, transparent: true, depthWrite: false, fog: false });
      const sp = new THREE.Sprite(mat);
      const r = 120 + Math.random() * 1000;
      const a = Math.random() * Math.PI * 2;
      sp.position.set(Math.sin(a) * r, 140 + Math.random() * 200, Math.cos(a) * r);
      const w = 180 + Math.random() * 260;
      sp.scale.set(w, w * 0.5, 1);
      sp.renderOrder = -5;
      sp.userData.order = Math.random();
      this.clouds.push(sp);
      this.scene.add(sp);
    }

    // rain: short streaks drawn along their velocity
    const nr = (this.rainCount = 1600);
    this.rainPos = new Float32Array(nr * 3);
    this.rainLine = new Float32Array(nr * 6);
    for (let i = 0; i < nr; i++) {
      this.rainPos[i * 3] = (Math.random() - 0.5) * 50;
      this.rainPos[i * 3 + 1] = Math.random() * 22;
      this.rainPos[i * 3 + 2] = (Math.random() - 0.5) * 50;
    }
    const rg = new THREE.BufferGeometry();
    rg.setAttribute('position', new THREE.BufferAttribute(this.rainLine, 3).setUsage(THREE.DynamicDrawUsage));
    this.rain = new THREE.LineSegments(
      rg,
      new THREE.LineBasicMaterial({ color: 0xc4d0dc, transparent: true, opacity: 0.45, depthWrite: false })
    );
    this.rain.frustumCulled = false;
    this.scene.add(this.rain);

    // snow
    const ns = (this.snowCount = 1800);
    this.snowPos = new Float32Array(ns * 3);
    this.snowSeed = new Float32Array(ns);
    for (let i = 0; i < ns; i++) {
      this.snowPos[i * 3] = (Math.random() - 0.5) * 50;
      this.snowPos[i * 3 + 1] = Math.random() * 22;
      this.snowPos[i * 3 + 2] = (Math.random() - 0.5) * 50;
      this.snowSeed[i] = Math.random() * 100;
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(this.snowPos, 3).setUsage(THREE.DynamicDrawUsage));
    this.snow = new THREE.Points(
      sg,
      new THREE.PointsMaterial({ size: 0.16, map: dotTexture(), transparent: true, depthWrite: false, color: 0xffffff })
    );
    this.snow.frustumCulled = false;
    this.scene.add(this.snow);
  }

  /* ----- configuration ----- */

  setEnv({ mode, weather, cloud, sunElev, sunAz }) {
    this.mode = mode;
    this.look = computeLook({ weather, cloud, sunElev, sunAz });
    this._applyLook();
    if (this.styleKey) this.setStyle(this.styleKey, this.paletteKey, true);
  }

  _applyLook() {
    const L = this.look;
    const oled = this.mode === 'oled';
    this.skyMat.uniforms.zenith.value.copy(L.zenith);
    this.skyMat.uniforms.horizon.value.copy(L.horizon);
    this.skyMat.uniforms.sunDir.value.copy(L.sunDir);
    this.skyMat.uniforms.sunColor.value.copy(L.sunColor);
    this.skyMat.uniforms.sunGlow.value = L.sunGlow;
    this.starMat.opacity = L.starAlpha;

    if (oled) {
      // pure black, neutral light so colors still read
      this.scene.fog = null;
      this.hemi.color.set(0xffffff);
      this.hemi.groundColor.set(0x333333);
      this.hemi.intensity = 1.1;
      this.sun.color.set(0xffffff);
      this.sun.intensity = 2.2;
      this.sun.position.set(-6, 14, 8);
      this.lamp.intensity = 0;
    } else {
      this.scene.fog = new THREE.Fog(L.horizon.clone(), L.fogNear, L.fogFar);
      this.hemi.color.copy(L.hemiSky);
      this.hemi.groundColor.copy(L.hemiGround);
      this.hemi.intensity = L.hemiIntensity;
      this.sun.color.copy(L.sunColor);
      // under the horizon the "sun" light becomes soft moonlight from above
      if (L.sunDir.y > 0.02) {
        this.sun.intensity = L.sunIntensity;
        this.sun.position.copy(L.sunDir).multiplyScalar(40).add(this.sun.target.position);
      } else {
        this.sun.color.set(0x9db2e0);
        this.sun.intensity = 0.35 * (1 - L.cover / 140);
        this.sun.position.set(-10, 30, -14);
      }
      this.lamp.intensity = L.lamp * 9;
    }
    for (const c of this.clouds) c.material.color.copy(L.cloudTint);
  }

  setStyle(styleKey, paletteKey, force = false) {
    if (!force && styleKey === this.styleKey && paletteKey === this.paletteKey) return;
    this.styleKey = styleKey;
    this.paletteKey = paletteKey;
    const colors = (PALETTES[paletteKey] ?? PALETTES.classic).colors;
    const L = this.look;
    const oled = this.mode === 'oled';
    const blueprint = styleKey === 'blueprint';
    const lightBg = !oled && !blueprint && L && L.brightness > 0.32;
    const ink = lightBg ? '#15171c' : '#f3f2ec';

    // dispose old materials
    for (const m of [this.sockMesh, this.sockSeams, ...this.sockHulls, this.ground, ...this.poleParts, ...this.poleHulls]) {
      if (m.material && m.material !== this._shared) m.material.dispose?.();
    }
    this._tex?.dispose();

    const r = this.renderer;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let pixelRatio = dpr;
    let shadows = false;
    const show = { sky: !oled && !blueprint, ground: !oled && !blueprint, grid: blueprint, weather: !oled && !blueprint };
    const hullOn = (n) => this.sockHulls.forEach((h, i) => (h.visible = i < n));
    let poleHull = null;
    this.sockSeams.visible = false;
    this.sock.wrinkle = 0;
    document.body.classList.toggle('bp', blueprint);
    this.canvas.classList.toggle('pixelated', styleKey === 'pixel');

    const groundColor = L ? L.ground : new THREE.Color('#5f8a3c');

    if (styleKey === 'cel' || styleKey === 'pixel') {
      const pixel = styleKey === 'pixel';
      const grad = toonGradient(pixel ? 2 : 3);
      this._tex = stripeTexture(colors, { nearest: pixel });
      this.sockMesh.material = new THREE.MeshToonMaterial({ map: this._tex, gradientMap: grad, side: THREE.DoubleSide });
      this.sockHulls[0].material = hullMaterial('#121212', pixel ? 0.006 : 0.0035);
      hullOn(1);
      this.ground.material = new THREE.MeshToonMaterial({ color: groundColor, gradientMap: grad });
      this.poleParts.forEach((m) => {
        m.material = new THREE.MeshToonMaterial({
          color: m.userData.kind === 'concrete' ? 0xb9b6ae : 0xd9dde2,
          gradientMap: grad,
        });
      });
      poleHull = hullMaterial('#121212', pixel ? 0.006 : 0.003);
      if (pixel) pixelRatio = 0.25;
    } else if (styleKey === 'realistic') {
      this._tex = stripeTexture(colors, { fabric: true });
      this._tex.anisotropy = r.capabilities.getMaxAnisotropy();
      this.sockMesh.material = new THREE.MeshStandardMaterial({
        map: this._tex,
        roughness: 0.82,
        metalness: 0,
        side: THREE.DoubleSide,
      });
      hullOn(0);
      this.sock.wrinkle = 1;
      this.ground.material = new THREE.MeshStandardMaterial({ color: groundColor, roughness: 1 });
      this.poleParts.forEach((m) => {
        m.material =
          m.userData.kind === 'concrete'
            ? new THREE.MeshStandardMaterial({ color: 0xa8a49b, roughness: 0.95 })
            : new THREE.MeshStandardMaterial({ color: 0xc9ced4, roughness: 0.35, metalness: 0.85 });
      });
      shadows = !oled;
    } else {
      // line-art styles: depth-only fill so hidden lines stay hidden
      this.sockMesh.material = depthOnly();
      this.poleParts.forEach((m) => (m.material = depthOnly()));
      this.ground.material = depthOnly();
      show.ground = false;
      this.sockSeams.visible = true;
      if (styleKey === 'outline') {
        this.sockHulls[0].material = hullMaterial(ink, 0.0028);
        hullOn(1);
        this.sockSeams.material = seamMaterial({ colors: Array(STRIPES).fill(ink), width: 1.1 * dpr });
        poleHull = hullMaterial(ink, 0.0024);
      } else if (styleKey === 'neon') {
        const glow = colors.map((c) => '#' + new THREE.Color(c).offsetHSL(0, 0.15, 0.08).getHexString());
        this.sockHulls[0].material = hullMaterial(glow[0], 0.0022, { opacity: 0.95, additive: true });
        this.sockHulls[1].material = hullMaterial(glow[0], 0.006, { opacity: 0.28, additive: true });
        this.sockHulls[2].material = hullMaterial(glow[0], 0.012, { opacity: 0.1, additive: true });
        hullOn(3);
        this.sockSeams.material = seamMaterial({ colors: glow, width: 1.2 * dpr, glow: 5 * dpr, additive: true });
        poleHull = hullMaterial('#7fd8ff', 0.0024, { opacity: 0.8, additive: true });
      } else {
        // blueprint
        this.sockHulls[0].material = hullMaterial('#eaf4ff', 0.0022);
        hullOn(1);
        this.sockSeams.material = seamMaterial({ colors: Array(STRIPES).fill('#eaf4ff'), width: 0.8 * dpr, along: 12, opacity: 0.85 });
        poleHull = hullMaterial('#eaf4ff', 0.002);
      }
    }

    this.poleHulls.forEach((h) => {
      h.visible = !!poleHull;
      if (poleHull) h.material = poleHull;
    });

    this.sky.visible = show.sky;
    this.stars.visible = show.sky;
    this.ground.visible = show.ground;
    this.grid.visible = show.grid;
    this.weatherVisible = show.weather;
    for (const c of this.clouds) c.visible = show.weather;

    r.setClearColor(0x000000, blueprint ? 0 : 1);
    r.shadowMap.enabled = shadows;
    this.sun.castShadow = shadows;
    r.setPixelRatio(pixelRatio);
    this.resize();
  }

  resize() {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    const aspect = w / h;
    // keep enough width for a sock blowing sideways, even in portrait
    const hHalf = 26 * RAD;
    let vfov = 2 * Math.atan(Math.tan(hHalf) / aspect);
    vfov = Math.min(Math.max(vfov, 40 * RAD), 78 * RAD);
    const realHHalf = Math.atan(Math.tan(vfov / 2) * aspect);
    // the camera pans to follow the sock, so it only needs room for half of it
    this.camDist = Math.max(8.5, 3.3 / Math.tan(realHHalf));
    this.camera.fov = vfov / RAD;
    this.camera.aspect = aspect;
    // shift the picture so the top of the pole sits just under the info panel
    const ndc = (5.4 - 2.4) / (this.camDist * Math.tan(vfov / 2));
    const want = (0.5 - 0.44) * 2;
    this.camera.setViewOffset(w, h, 0, -((ndc - want) * h) / 2, w, h);
    this.camera.updateProjectionMatrix();
  }

  /* ----- per frame ----- */

  // heading: degrees the phone faces. windKn / windFrom: live wind.
  update(dt, { heading, windKn, windFrom }) {
    this.time += dt;
    const toward = (windFrom + 180) * RAD;
    const ms = windKn * KN;
    const wind = new THREE.Vector3(Math.sin(toward) * ms, 0, -Math.cos(toward) * ms);

    this.sock.step(dt, wind, windKn);
    this.swivel.rotation.y = -this.sock.yaw;

    // camera stands back from the pole, looking the way you face
    const h = heading * RAD;
    const fx = Math.sin(h);
    const fz = -Math.cos(h);
    const cam = this.camera;
    // slide sideways (never rotate) toward the sock so it stays in frame
    const c = this.sock.centroid(this._c ?? (this._c = new THREE.Vector3()));
    const lateral = c.x * -fz + c.z * fx;
    this.pan = (this.pan ?? 0) + (lateral * 0.55 - (this.pan ?? 0)) * (1 - Math.exp(-dt / 0.6));
    const rx = -fz * this.pan;
    const rz = fx * this.pan;
    // level camera + lens shift keeps the pole upright on screen
    cam.position.set(-fx * this.camDist + rx, 2.4, -fz * this.camDist + rz);
    cam.lookAt(rx, 2.4, rz);
    this.skyGroup.position.copy(cam.position);

    if (this.weatherVisible && this.look) this._updateWeather(dt, wind, fx, fz);
    else {
      this.rain.visible = false;
      this.snow.visible = false;
    }
    this.renderer.render(this.scene, cam);
  }

  _updateWeather(dt, wind, fx, fz) {
    const L = this.look;
    const cam = this.camera.position;

    // clouds drift with the wind and fade near the horizon
    const want = Math.round((L.cover / 100) * this.clouds.length);
    for (let i = 0; i < this.clouds.length; i++) {
      const c = this.clouds[i];
      c.position.x += wind.x * 2.2 * dt;
      c.position.z += wind.z * 2.2 * dt;
      const d = Math.hypot(c.position.x, c.position.z);
      if (d > 1150) {
        c.position.x *= -0.97;
        c.position.z *= -0.97;
      }
      const dx = c.position.x - cam.x;
      const dz = c.position.z - cam.z;
      const elev = Math.atan2(c.position.y - cam.y, Math.hypot(dx, dz)) / RAD;
      const fade = Math.min(1, Math.max(0, (elev - 1.5) / 6));
      c.visible = i < want;
      c.material.opacity = L.cloudOpacity * fade * (1 + this.flash * 0.6);
    }

    // lightning
    let flash = 0;
    if (L.storm) {
      this._nextBolt -= dt;
      if (this._nextBolt <= 0) {
        this._bolt = 0;
        this._nextBolt = 4 + Math.random() * 9;
        const delay = 500 + Math.random() * 2000;
        setTimeout(() => this.onThunder?.(), delay);
      }
      if (this._bolt >= 0) {
        this._bolt += dt;
        const b = this._bolt;
        flash = b < 0.07 ? 1 : b < 0.13 ? 0.15 : b < 0.2 ? 0.7 : Math.max(0, 0.7 - (b - 0.2) * 3);
        if (b > 0.5) this._bolt = -1;
      }
    }
    this.flash = flash;
    this.skyMat.uniforms.flash.value = flash * 0.55;
    this.hemi.intensity = L.hemiIntensity + flash * 2.5;

    // particles live in a box in front of the camera
    const cx = cam.x + fx * 12;
    const cz = cam.z + fz * 12;
    const half = 25;
    const wrap = (v, c) => {
      const d = v - c;
      if (d > half) return v - half * 2;
      if (d < -half) return v + half * 2;
      return v;
    };

    this.rain.visible = L.rain > 0;
    if (L.rain > 0) {
      const n = Math.floor(this.rainCount * Math.min(1, L.rain));
      const fall = L.rain < 0.5 ? 5 : 9.5;
      const vx = wind.x * 0.9;
      const vz = wind.z * 0.9;
      const P = this.rainPos;
      const S = this.rainLine;
      const len = L.rain < 0.5 ? 0.03 : 0.045;
      for (let i = 0; i < this.rainCount; i++) {
        const k = i * 3;
        let x = P[k] + vx * dt;
        let y = P[k + 1] - fall * dt;
        let z = P[k + 2] + vz * dt;
        if (y < 0) {
          y += 22;
          x = cx + (Math.random() - 0.5) * half * 2;
          z = cz + (Math.random() - 0.5) * half * 2;
        }
        x = wrap(x, cx);
        z = wrap(z, cz);
        P[k] = x; P[k + 1] = y; P[k + 2] = z;
        const j = i * 6;
        if (i < n) {
          S[j] = x; S[j + 1] = y; S[j + 2] = z;
          S[j + 3] = x - vx * len; S[j + 4] = y + fall * len; S[j + 5] = z - vz * len;
        } else {
          S[j] = S[j + 3] = x; S[j + 1] = S[j + 4] = -50; S[j + 2] = S[j + 5] = z;
        }
      }
      this.rain.geometry.attributes.position.needsUpdate = true;
      this.rain.material.opacity = 0.25 + 0.3 * L.day + flash * 0.4;
    }

    this.snow.visible = L.snow > 0;
    if (L.snow > 0) {
      const P = this.snowPos;
      const t = this.time;
      for (let i = 0; i < this.snowCount; i++) {
        const k = i * 3;
        const sd = this.snowSeed[i];
        let x = P[k] + (wind.x * 0.85 + Math.sin(t * 1.3 + sd) * 0.4) * dt;
        let y = P[k + 1] - (0.9 + (sd % 1) * 0.6) * dt;
        let z = P[k + 2] + (wind.z * 0.85 + Math.cos(t * 1.1 + sd) * 0.4) * dt;
        if (y < 0) {
          y += 22;
          x = cx + (Math.random() - 0.5) * half * 2;
          z = cz + (Math.random() - 0.5) * half * 2;
        }
        P[k] = wrap(x, cx); P[k + 1] = y; P[k + 2] = wrap(z, cz);
      }
      this.snow.geometry.attributes.position.needsUpdate = true;
      this.snow.material.opacity = 0.55 + 0.4 * L.day;
    }
  }
}
