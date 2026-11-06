// Turns the reported wind (mean speed, gust speed, direction) into a live,
// moving wind: gentle turbulence plus gust events that build and fade.

const smoothNoise = (t, seed) =>
  (Math.sin(t * 0.73 + seed) * 0.5 +
    Math.sin(t * 1.37 + seed * 2.1) * 0.3 +
    Math.sin(t * 2.91 + seed * 3.7) * 0.2);

const rand = (a, b) => a + Math.random() * (b - a);

export class WindSim {
  constructor() {
    this.mean = 0;
    this.gust = 0;
    this.from = 270;
    this.target = null;
    this.t = Math.random() * 100;
    this.env = 0; // gust envelope 0..1
    this.phase = 'idle';
    this.phaseT = 0;
    this.peak = 0;
    this.nextGust = rand(4, 9);
    this.veer = 0;
    this.onGust = null;
  }

  setData({ speedKn, gustKn, fromDeg }, immediate = false) {
    this.target = { speedKn, gustKn: Math.max(gustKn ?? speedKn, speedKn), fromDeg };
    if (immediate) {
      this.mean = speedKn;
      this.gust = this.target.gustKn;
      this.from = fromDeg;
    }
  }

  update(dt) {
    this.t += dt;
    if (this.target) {
      const k = 1 - Math.exp(-dt / 3);
      this.mean += (this.target.speedKn - this.mean) * k;
      this.gust += (this.target.gustKn - this.gust) * k;
      const d = ((this.target.fromDeg - this.from + 540) % 360) - 180;
      this.from = (this.from + d * k + 360) % 360;
    }

    const extra = Math.max(0, this.gust - this.mean);
    this._gusts(dt, extra);

    const turb = 0.1 + Math.min(0.1, extra / 60);
    const speed = Math.max(
      0,
      this.mean * (1 + turb * smoothNoise(this.t, 1.3)) + this.env * this.peak
    );
    const wobble = (5 + Math.min(10, extra)) * smoothNoise(this.t * 0.6, 7.1);
    const fromDeg = (this.from + wobble + this.env * this.veer + 360) % 360;
    return { speedKn: speed, fromDeg, meanKn: this.mean, gustKn: this.gust, meanFrom: this.from };
  }

  _gusts(dt, extra) {
    this.phaseT += dt;
    if (this.phase === 'idle') {
      this.env += (0 - this.env) * (1 - Math.exp(-dt / 0.8));
      this.nextGust -= dt;
      if (this.nextGust <= 0 && extra >= 2.5) {
        this.phase = 'attack';
        this.phaseT = 0;
        this.attack = rand(0.4, 0.9);
        this.hold = rand(0.8, 2.6);
        this.release = rand(1.4, 3);
        this.peak = extra * rand(0.6, 1);
        this.veer = rand(-10, 10);
        this.onGust?.(Math.min(1, this.peak / 12));
      } else if (this.nextGust <= 0) {
        this.nextGust = rand(4, 9);
      }
    } else if (this.phase === 'attack') {
      this.env = Math.min(1, this.phaseT / this.attack);
      if (this.phaseT >= this.attack) { this.phase = 'hold'; this.phaseT = 0; }
    } else if (this.phase === 'hold') {
      this.env = 1;
      if (this.phaseT >= this.hold) { this.phase = 'release'; this.phaseT = 0; }
    } else if (this.phase === 'release') {
      this.env = Math.max(0, 1 - this.phaseT / this.release);
      if (this.phaseT >= this.release) {
        this.phase = 'idle';
        this.phaseT = 0;
        // gustier days gust more often
        const gf = this.mean > 0 ? extra / this.mean : 1;
        this.nextGust = rand(5, 16) / Math.min(2, 0.6 + gf);
      }
    }
  }
}
