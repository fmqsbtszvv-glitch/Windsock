// Windsock physics + geometry.
// The sock is a chain of points. The first two are held by the rigid hoop on a
// swivel; the rest swing under gravity, wind drag and flutter. Each of the 5
// stripes "inflates" at 3 knots of wind, like a real airport windsock, which
// makes that part of the chain stiff and the fabric round.

import * as THREE from '../vendor/three.module.min.js';

export const STRIPES = 5;
const UP = new THREE.Vector3(0, 1, 0);
const _dir = new THREE.Vector3();
const _side = new THREE.Vector3();
const _a = new THREE.Vector3();
const _t = new THREE.Vector3();
const _n = new THREE.Vector3();
const _b = new THREE.Vector3();

const wrapPi = (a) => Math.atan2(Math.sin(a), Math.cos(a));

export class Windsock {
  constructor(opt = {}) {
    this.poleHeight = opt.poleHeight ?? 6;
    this.length = opt.length ?? 3.6;
    this.r0 = opt.mouthRadius ?? 0.42;
    this.r1 = opt.tailRadius ?? 0.19;
    this.N = opt.segments ?? 36;
    this.radial = opt.radial ?? 28;
    this.arm = this.r0 + 0.2; // pole axis -> hoop center
    this.segLen = this.length / this.N;
    this.pivot = new THREE.Vector3(0, this.poleHeight, 0);
    this.yaw = opt.yaw ?? 0; // bearing the sock points toward (radians, 0 = north)
    this.yawVel = 0;
    this.speedKn = 0; // smoothed, drives inflation
    this.time = 0;
    this.wrinkle = 0; // extra fine ripples (realistic style)

    this.p = [];
    this.q = [];
    const dir = this.dir(_dir);
    const p0 = this.pivot.clone().addScaledVector(dir, this.arm);
    for (let i = 0; i <= this.N; i++) {
      const v = p0.clone();
      if (i <= 1) v.addScaledVector(dir, i * this.segLen);
      else {
        v.addScaledVector(dir, this.segLen);
        v.y -= (i - 1) * this.segLen;
      }
      this.p.push(v);
      this.q.push(v.clone());
    }
    this.fill = new Float32Array(this.N + 1);
    this._buildGeometry();
  }

  dir(out) {
    return out.set(Math.sin(this.yaw), 0, -Math.cos(this.yaw));
  }

  centroid(out) {
    out.set(0, 0, 0);
    for (const v of this.p) out.add(v);
    return out.multiplyScalar(1 / this.p.length);
  }

  _buildGeometry() {
    const rows = this.N + 1;
    const cols = this.radial + 1;
    const pos = new Float32Array(rows * cols * 3);
    const uv = new Float32Array(rows * cols * 2);
    const idx = [];
    for (let i = 0; i < rows; i++) {
      for (let j = 0; j < cols; j++) {
        const k = i * cols + j;
        uv[k * 2] = j / this.radial;
        uv[k * 2 + 1] = i / this.N;
      }
    }
    for (let i = 0; i < this.N; i++) {
      for (let j = 0; j < this.radial; j++) {
        const a = i * cols + j;
        const b = a + 1;
        const c = a + cols;
        const d = c + 1;
        idx.push(a, c, b, b, c, d); // outward-facing winding
      }
    }
    const g = new THREE.BufferGeometry();
    const posAttr = new THREE.BufferAttribute(pos, 3);
    posAttr.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', posAttr);
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setIndex(idx);
    this.geometry = g;
    this._updateGeometry();
  }

  // wind: world vector in m/s (x = east, z = south). speedKn: instantaneous speed.
  step(dt, wind, speedKn) {
    if (!(dt > 0)) return;
    this.time += dt;
    const tau = speedKn > this.speedKn ? 0.35 : 1.5; // inflate fast, deflate slowly
    this.speedKn += (speedKn - this.speedKn) * (1 - Math.exp(-dt / tau));

    for (let i = 0; i <= this.N; i++) {
      const x = (i / this.N) * STRIPES;
      let f = Math.min(1, Math.max(0, this.speedKn / 3 - x + 0.5)) * Math.min(1, this.speedKn / 1.5);
      this.fill[i] = f * f * (3 - 2 * f);
    }

    // Swivel acts like a weather vane: torque grows with wind speed squared.
    const ws = Math.hypot(wind.x, wind.z);
    if (ws > 0.05) {
      const target = Math.atan2(wind.x, -wind.z);
      const diff = wrapPi(target - this.yaw);
      this.yawVel += (0.5 * ws * ws * Math.sin(diff) + 0.4 * diff) * dt;
    }
    this.yawVel *= Math.exp(-(1.0 + 0.6 * ws) * dt);
    this.yaw = wrapPi(this.yaw + this.yawVel * dt);

    const sub = Math.max(1, Math.ceil(dt * 120));
    const h = dt / sub;
    for (let s = 0; s < sub; s++) this._integrate(h, wind, ws);
    this._updateGeometry();
  }

  _integrate(h, wind, ws) {
    const { N, p, q, segLen } = this;
    const dir = this.dir(_dir);
    _side.set(-dir.z, 0, dir.x);

    p[0].copy(this.pivot).addScaledVector(dir, this.arm);
    q[0].copy(p[0]);
    p[1].copy(p[0]).addScaledVector(dir, segLen);
    q[1].copy(p[1]);

    const t = this.time;
    const drag = 1.5;
    const freq = 3 + ws * 0.9;
    const h2 = h * h;
    for (let i = 2; i <= N; i++) {
      const pi = p[i];
      const qi = q[i];
      const vx = (pi.x - qi.x) / h;
      const vy = (pi.y - qi.y) / h;
      const vz = (pi.z - qi.z) / h;
      // an inflated tube catches far more air, and the pressure inside carries its weight
      const f = this.fill[i];
      const dr = drag * (1 + 1.6 * f);
      let ax = dr * (wind.x - vx);
      let ay = -9.81 * (1 - 0.55 * f) - dr * vy;
      let az = dr * (wind.z - vz);
      // flutter: strongest on limp fabric and toward the tail
      const fl = ws * 1.6 * (1 - 0.7 * f) * (0.3 + i / N);
      const ph = t * freq - i * 0.55;
      const s1 = Math.sin(ph) * fl;
      ax += _side.x * s1;
      az += _side.z * s1;
      ay += Math.sin(ph * 1.3 + 1.7) * fl * 0.6;
      const nx = pi.x + (pi.x - qi.x) * 0.99 + ax * h2;
      const ny = pi.y + (pi.y - qi.y) * 0.99 + ay * h2;
      const nz = pi.z + (pi.z - qi.z) * 0.99 + az * h2;
      qi.copy(pi);
      pi.set(nx, ny, nz);
    }

    // Position-based constraints. Points 0 and 1 are held by the hoop.
    const w = (i) => (i < 2 ? 0 : 1);
    const ITER = 10;
    for (let it = 0; it < ITER; it++) {
      for (let i = 0; i < N; i++) this._dist(i, i + 1, segLen, 1, w(i), w(i + 1));
      // inflated fabric holds its shape: keep points two apart at full spacing
      for (let i = 2; i <= N; i++) {
        const f = this.fill[i];
        if (f > 0.01) this._dist(i - 2, i, segLen * 2, 1 - Math.pow(1 - f * 0.9, 1 / ITER), w(i - 2), w(i));
      }
    }
    for (let i = 2; i <= N; i++) {
      const pi = p[i];
      // don't pass through the pole or the ground
      const r = Math.hypot(pi.x, pi.z);
      if (pi.y < this.poleHeight + 0.2 && r < 0.14) {
        const k = 0.14 / (r || 1e-6);
        pi.x *= k;
        pi.z *= k;
      }
      if (pi.y < 0.05) pi.y = 0.05;
    }
  }

  _dist(a, b, rest, k, wa, wb) {
    const wsum = wa + wb;
    if (wsum === 0) return;
    const pa = this.p[a];
    const pb = this.p[b];
    _a.subVectors(pb, pa);
    const len = _a.length() || 1e-6;
    const c = ((len - rest) / len) * k / wsum;
    pa.addScaledVector(_a, c * wa);
    pb.addScaledVector(_a, -c * wb);
  }

  _updateGeometry() {
    const { N, radial, p } = this;
    const cols = radial + 1;
    const pos = this.geometry.attributes.position.array;
    const t = this.time;
    const w = 4 + this.speedKn * 0.5;
    const calm = Math.min(1, this.speedKn / 6 + 0.25);

    for (let i = 0; i <= N; i++) {
      if (i === 0) _t.subVectors(p[1], p[0]);
      else if (i === N) _t.subVectors(p[N], p[N - 1]);
      else _t.subVectors(p[i + 1], p[i - 1]);
      _t.normalize();
      if (i === 0) {
        _n.copy(UP).addScaledVector(_t, -_t.dot(UP));
        if (_n.lengthSq() < 1e-6) _n.set(1, 0, 0);
      } else {
        _n.addScaledVector(_t, -_t.dot(_n)); // parallel transport
      }
      _n.normalize();
      _b.crossVectors(_t, _n);

      const r = this.r0 + (this.r1 - this.r0) * (i / N);
      const infl = i <= 1 ? 1 : Math.max(this.fill[i], 1 - (i - 1) / 3);
      const rad = r * (0.72 + 0.28 * infl);
      const flat = 0.42 + 0.58 * infl;
      const amp = i === 0 ? 0 : (0.02 + 0.06 * (1 - infl)) * calm * (0.4 + i / N);
      const wr = i === 0 ? 0 : this.wrinkle * 0.025 * calm;
      const c = p[i];

      for (let j = 0; j <= radial; j++) {
        const th = (j / radial) * Math.PI * 2;
        const rr =
          rad *
          (1 +
            amp * Math.sin(3 * th + w * t - i * 0.9) +
            amp * 0.6 * Math.sin(5 * th - w * 1.3 * t + i * 1.7) +
            wr * Math.sin(11 * th + i * 2.3 - t * w * 0.7));
        const cx = Math.cos(th) * rr;
        const cy = Math.sin(th) * rr * flat;
        const k = (i * cols + j) * 3;
        pos[k] = c.x + _b.x * cx + _n.x * cy;
        pos[k + 1] = c.y + _b.y * cx + _n.y * cy;
        pos[k + 2] = c.z + _b.z * cx + _n.z * cy;
      }
    }
    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.computeVertexNormals();
  }
}
