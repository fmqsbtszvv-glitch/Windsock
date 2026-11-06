// Info panel, compass ring, settings sheet, toasts.

import { PALETTES } from './palettes.js';
import { wakeLockSupported } from './wakelock.js';

const SPEED = {
  mph: { f: 1.15078, label: 'mph', dp: 0 },
  kn: { f: 1, label: 'kn', dp: 0 },
  kmh: { f: 1.852, label: 'km/h', dp: 0 },
  ms: { f: 0.514444, label: 'm/s', dp: 1 },
};
const CARD = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];

export const norm = (d) => ((d % 360) + 360) % 360;
export const angleDiff = (a, b) => ((a - b + 540) % 360) - 180; // a relative to b, -180..180
export const cardinal = (d) => CARD[Math.round(norm(d) / 22.5) % 16];

const SECTIONS = [
  {
    title: 'Style', key: 'style', cols: 3,
    options: [['cel', 'Cel-shaded'], ['realistic', 'Realistic'], ['outline', 'Outline'], ['neon', 'Neon'], ['pixel', 'Pixel'], ['blueprint', 'Blueprint']],
  },
  { title: 'Sock colors', key: 'palette', type: 'swatch' },
  { title: 'Background', key: 'background', cols: 3, options: [['auto', 'Live weather'], ['oled', 'OLED black'], ['custom', 'Pick a scene']] },
  {
    title: 'Scene', key: 'sceneWeather', cols: 4, showIf: (s) => s.background === 'custom',
    options: [['clear', 'Clear'], ['partly', 'Partly'], ['overcast', 'Overcast'], ['fog', 'Fog'], ['drizzle', 'Drizzle'], ['rain', 'Rain'], ['storm', 'Storm'], ['snow', 'Snow']],
  },
  {
    title: 'Time of day', key: 'sceneTime', cols: 4, showIf: (s) => s.background === 'custom',
    options: [['live', 'Live'], ['day', 'Day'], ['sunset', 'Sunset'], ['night', 'Night']],
  },
  { title: 'Wind speed', key: 'speedUnit', cols: 4, options: [['mph', 'mph'], ['kn', 'knots'], ['kmh', 'km/h'], ['ms', 'm/s']] },
  { title: 'Temperature', key: 'tempUnit', cols: 2, options: [['F', '°F'], ['C', '°C']] },
  { title: 'Info panel', key: 'panel', cols: 3, options: [['full', 'Full'], ['compact', 'Compact'], ['hidden', 'Hidden']] },
  {
    title: 'Haptics', type: 'toggles', test: true,
    note: 'Uses the iPhone tick haptic (iOS 18 or later). Web apps can only play that one tap, so these are built from tap patterns.',
    items: [
      ['haptics', 'Haptics', null],
      ['hGusts', 'Gusts', 'A run of taps that builds with each gust', 'haptics'],
      ['hHeadwind', 'Wind finder', 'One tap facing into the wind, two with it at your back', 'haptics'],
      ['hDetents', 'Compass clicks', 'A tap as you pass N, E, S and W', 'haptics'],
      ['hThunder', 'Thunder', 'A rumble after lightning in storms', 'haptics'],
    ],
  },
  { title: 'Screen', type: 'toggles', items: [['keepAwake', 'Keep screen awake', wakeLockSupported ? null : 'Not supported on this device']] },
];

const $ = (id) => document.getElementById(id);

export class UI {
  constructor(settings, handlers) {
    this.s = settings;
    this.h = handlers;
    this.panel = $('panel');
    this._buildCompass();
    this._buildSettings();
    this.applyPanel();

    $('settings-btn').addEventListener('click', () => this.openSheet());
    $('sheet').addEventListener('click', (e) => {
      if (e.target.closest('[data-close]')) this.closeSheet();
    });
    this.panel.addEventListener('click', () => {
      this.set('panel', this.s.panel === 'full' ? 'compact' : 'full');
    });
    $('start-btn').addEventListener('click', () => this.h.onStart());
  }

  /* ----- settings ----- */

  set(key, value) {
    this.s[key] = value;
    this.h.onChange(key, value);
    this._syncSettings();
    if (key === 'panel') this.applyPanel();
  }

  applyPanel() {
    this.panel.dataset.mode = this.s.panel;
  }

  openSheet() {
    this._syncSettings();
    const sheet = $('sheet');
    sheet.hidden = false;
    requestAnimationFrame(() => sheet.classList.add('open'));
  }

  closeSheet() {
    const sheet = $('sheet');
    sheet.classList.remove('open');
    setTimeout(() => { sheet.hidden = true; }, 260);
  }

  _buildSettings() {
    const body = $('sheet-body');
    body.innerHTML = '';
    this.sectionEls = [];
    for (const sec of SECTIONS) {
      const wrap = document.createElement('section');
      wrap.className = 'set';
      const h = document.createElement('h3');
      h.textContent = sec.title;
      wrap.appendChild(h);

      if (sec.type === 'swatch') {
        const row = document.createElement('div');
        row.className = 'swatches';
        for (const [key, p] of Object.entries(PALETTES)) {
          const b = document.createElement('button');
          b.className = 'swatch';
          b.dataset.key = sec.key;
          b.dataset.value = key;
          b.setAttribute('aria-label', p.name);
          const stops = p.colors.map((c, i) => `${c} ${i * 20}% ${(i + 1) * 20}%`).join(',');
          b.innerHTML = `<span class="chip" style="background:linear-gradient(90deg,${stops})"></span><span class="sw-name">${p.name}</span>`;
          b.addEventListener('click', () => this.set(sec.key, key));
          row.appendChild(b);
        }
        wrap.appendChild(row);
      } else if (sec.type === 'toggles') {
        const list = document.createElement('div');
        list.className = 'toggles';
        for (const [key, title, sub, parent] of sec.items) {
          const lab = document.createElement('label');
          lab.className = 'toggle' + (parent ? ' sub' : '');
          lab.innerHTML = `<span class="t-text"><span class="t-title">${title}</span>${sub ? `<span class="t-sub">${sub}</span>` : ''}</span>`;
          const input = document.createElement('input');
          input.type = 'checkbox';
          input.setAttribute('switch', '');
          input.dataset.key = key;
          if (parent) input.dataset.parent = parent;
          input.addEventListener('change', () => this.set(key, input.checked));
          lab.appendChild(input);
          list.appendChild(lab);
        }
        wrap.appendChild(list);
        if (sec.test) {
          const b = document.createElement('button');
          b.className = 'ghost';
          b.textContent = 'Feel the patterns';
          b.addEventListener('click', () => this.h.onHapticTest());
          wrap.appendChild(b);
        }
        if (sec.note) {
          const p = document.createElement('p');
          p.className = 'fine';
          p.textContent = sec.note;
          wrap.appendChild(p);
        }
      } else {
        const seg = document.createElement('div');
        seg.className = 'seg';
        seg.style.setProperty('--cols', sec.cols ?? sec.options.length);
        for (const [value, label] of sec.options) {
          const b = document.createElement('button');
          b.textContent = label;
          b.dataset.key = sec.key;
          b.dataset.value = value;
          b.addEventListener('click', () => this.set(sec.key, value));
          seg.appendChild(b);
        }
        wrap.appendChild(seg);
      }
      body.appendChild(wrap);
      this.sectionEls.push([sec, wrap]);
    }
    const credit = document.createElement('p');
    credit.className = 'fine center';
    credit.innerHTML = 'Weather data by <a href="https://open-meteo.com/" target="_blank" rel="noopener">Open-Meteo</a>';
    body.appendChild(credit);
  }

  _syncSettings() {
    const s = this.s;
    for (const [sec, wrap] of this.sectionEls) {
      wrap.hidden = sec.showIf ? !sec.showIf(s) : false;
    }
    document.querySelectorAll('#sheet-body [data-value]').forEach((b) => {
      b.setAttribute('aria-pressed', String(s[b.dataset.key] === b.dataset.value));
    });
    document.querySelectorAll('#sheet-body input[data-key]').forEach((i) => {
      i.checked = !!s[i.dataset.key];
      i.disabled = i.dataset.parent ? !s[i.dataset.parent] : false;
      i.closest('.toggle').classList.toggle('off', i.disabled);
    });
  }

  /* ----- compass ----- */

  _buildCompass() {
    const svg = $('compass');
    const NS = 'http://www.w3.org/2000/svg';
    const el = (tag, attrs, parent) => {
      const e = document.createElementNS(NS, tag);
      for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
      parent.appendChild(e);
      return e;
    };
    el('circle', { r: 46, class: 'c-ring' }, svg);
    this.dial = el('g', {}, svg);
    for (let a = 0; a < 360; a += 15) {
      const major = a % 90 === 0;
      const r1 = major ? 37 : a % 45 === 0 ? 40 : 42;
      const rad = (a * Math.PI) / 180;
      el('line', {
        x1: Math.sin(rad) * r1, y1: -Math.cos(rad) * r1,
        x2: Math.sin(rad) * 45, y2: -Math.cos(rad) * 45,
        class: major ? 'c-tick major' : 'c-tick',
      }, this.dial);
    }
    this.letters = ['N', 'E', 'S', 'W'].map((t, i) => {
      const rad = (i * 90 * Math.PI) / 180;
      const x = Math.sin(rad) * 28;
      const y = -Math.cos(rad) * 28;
      const tx = el('text', { x, y, class: t === 'N' ? 'c-letter north' : 'c-letter', 'text-anchor': 'middle', 'dominant-baseline': 'central' }, this.dial);
      tx.textContent = t;
      return { tx, x, y };
    });
    this.arrow = el('g', {}, svg);
    el('path', { d: 'M0,-44 L0,-6', class: 'c-arrow-line' }, this.arrow);
    el('path', { d: 'M-7,-14 L0,-2 L7,-14 Z', class: 'c-arrow-head' }, this.arrow);
    el('path', { d: 'M-5,-46 L0,-40 L5,-46', class: 'c-arrow-tail' }, this.arrow);
    el('path', { d: 'M-4.5,-50 L4.5,-50 L0,-44.5 Z', class: 'c-facing' }, svg);
  }

  /* ----- readout ----- */

  update(d) {
    const u = SPEED[this.s.speedUnit] ?? SPEED.mph;
    const fmt = (kn) => (kn * u.f).toFixed(u.dp);
    $('speed').textContent = d.meanKn == null ? '--' : fmt(d.meanKn);
    $('speed-unit').textContent = u.label;
    const calm = d.meanKn != null && d.meanKn < 1;
    $('dir-line').textContent = d.fromDeg == null ? 'Waiting for wind…' : calm ? 'Calm' : `From ${cardinal(d.fromDeg)} · ${Math.round(norm(d.fromDeg))}°`;
    $('gust-line').textContent = d.gustKn == null ? '' : `Gusts ${fmt(d.gustKn)} ${u.label}`;
    $('temp').textContent = d.tempC == null ? '--' : this.s.tempUnit === 'F' ? `${Math.round(d.tempC * 9 / 5 + 32)}°F` : `${Math.round(d.tempC)}°C`;
    $('cond').textContent = d.condLabel ?? '--';
    $('facing').textContent = `${cardinal(d.heading)} ${Math.round(norm(d.heading))}°`;

    let rel = '--';
    if (d.fromDeg != null) {
      const diff = angleDiff(d.fromDeg, d.heading);
      const a = Math.abs(diff);
      rel = calm ? 'Calm' : a <= 22.5 ? 'Headwind' : a >= 157.5 ? 'Tailwind' : diff > 0 ? 'Crosswind, right' : 'Crosswind, left';
    }
    $('relative').textContent = rel;

    let foot;
    if (d.demo) foot = d.locationError ? `Demo wind · ${d.locationError}` : 'Demo wind · waiting for location';
    else {
      const mins = Math.round((Date.now() - d.updatedAt) / 60000);
      foot = `Updated ${mins < 1 ? 'just now' : mins === 1 ? '1 min ago' : `${mins} min ago`}`;
    }
    if (!d.compassActive) foot += ' · drag to turn';
    $('updated').textContent = foot;

    // compass: top of the ring = the way you face
    this.dial.setAttribute('transform', `rotate(${-d.heading})`);
    for (const l of this.letters) l.tx.setAttribute('transform', `rotate(${d.heading} ${l.x} ${l.y})`);
    if (d.fromDeg != null && !calm) {
      this.arrow.style.display = '';
      this.arrow.setAttribute('transform', `rotate(${d.fromDeg - d.heading})`);
    } else this.arrow.style.display = 'none';
  }

  toast(msg, ms = 3200) {
    const t = $('toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(this._toastT);
    this._toastT = setTimeout(() => t.classList.remove('show'), ms);
  }

  hideStart() {
    const s = $('start');
    document.body.classList.remove('pre-start');
    s.classList.add('gone');
    setTimeout(() => s.remove(), 500);
  }
}
