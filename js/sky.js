// Works out sky colors, lighting and weather effects from the weather type,
// cloud cover and the sun's position.

import * as THREE from '../vendor/three.module.min.js';

const RAD = Math.PI / 180;
const C = (h) => new THREE.Color(h);
const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// sun elevation -> [zenith, horizon]
const KEYS = [
  [-18, C('#01030a'), C('#03060d')],
  [-9, C('#060b22'), C('#121a36')],
  [-3, C('#1a2552'), C('#a85a5c')],
  [1.5, C('#34569a'), C('#f0965e')],
  [8, C('#3d74c4'), C('#e2c7a2')],
  [20, C('#2f6cc8'), C('#b3d2ee')],
  [70, C('#2660c0'), C('#a6cbee')],
];

export const WEATHER = {
  clear: { cloud: 4, oc: 0 },
  partly: { cloud: 45, oc: 0.1 },
  overcast: { cloud: 100, oc: 0.85 },
  fog: { cloud: 100, oc: 0.9, fog: 1 },
  drizzle: { cloud: 95, oc: 0.85, rain: 0.35 },
  rain: { cloud: 100, oc: 0.9, rain: 1 },
  storm: { cloud: 100, oc: 1, rain: 1.4, storm: 1 },
  snow: { cloud: 100, oc: 0.8, snow: 1 },
};

function keyed(elev) {
  if (elev <= KEYS[0][0]) return [KEYS[0][1].clone(), KEYS[0][2].clone()];
  for (let i = 1; i < KEYS.length; i++) {
    const [e1, z1, h1] = KEYS[i];
    if (elev <= e1) {
      const [e0, z0, h0] = KEYS[i - 1];
      const t = (elev - e0) / (e1 - e0);
      return [z0.clone().lerp(z1, t), h0.clone().lerp(h1, t)];
    }
  }
  const last = KEYS[KEYS.length - 1];
  return [last[1].clone(), last[2].clone()];
}

export function computeLook({ weather, cloud, sunElev, sunAz }) {
  const w = WEATHER[weather] ?? WEATHER.partly;
  const cover = Math.min(100, Math.max(0, cloud ?? w.cloud));
  const oc = Math.max(w.oc, cover > 80 ? 0.5 * (cover - 80) / 20 : 0);
  const day = smooth(-8, 8, sunElev);

  let [zenith, horizon] = keyed(sunElev);
  const dim = 0.06 + 0.94 * day;
  const greyZ = C('#737d89').multiplyScalar(dim * (w.storm ? 0.5 : 1));
  const greyH = C('#a2aab3').multiplyScalar(dim * (w.storm ? 0.6 : 1));
  zenith.lerp(greyZ, oc);
  horizon.lerp(greyH, oc);
  if (w.fog) {
    const f = C('#a7aeb4').multiplyScalar(dim);
    zenith.lerp(f, 0.85);
    horizon.copy(f);
  }

  const sunDir = new THREE.Vector3(
    Math.sin(sunAz * RAD) * Math.cos(sunElev * RAD),
    Math.sin(sunElev * RAD),
    -Math.cos(sunAz * RAD) * Math.cos(sunElev * RAD)
  ).normalize();
  const sunColor = C('#ff9150').lerp(C('#fff4e0'), smooth(0, 22, sunElev));
  const sunGlow = (1 - oc) * (1 - (cover / 100) * 0.4) * smooth(-4, 1, sunElev);

  const cloudTint = C('#ffffff')
    .lerp(C('#ffb59a'), (1 - smooth(2, 14, sunElev)) * (1 - oc) * day)
    .multiplyScalar(0.12 + 0.88 * day);
  if (oc > 0.5) cloudTint.lerp(greyH.clone().multiplyScalar(1.05), 0.5);

  const snowy = !!w.snow;
  return {
    zenith,
    horizon,
    sunDir,
    sunColor,
    sunGlow,
    day,
    sunIntensity: 3.0 * smooth(-2, 12, sunElev) * (1 - 0.75 * oc),
    hemiIntensity: 0.45 + 1.1 * day,
    hemiSky: zenith.clone().lerp(C('#ffffff'), 0.35),
    hemiGround: snowy ? C('#c9d2db') : C('#4a5a36'),
    lamp: 1 - smooth(-6, 2, sunElev),
    starAlpha: (1 - smooth(-12, -4, sunElev)) * (1 - cover / 100),
    cover,
    cloudTint,
    cloudOpacity: 0.55 + 0.4 * oc,
    ground: snowy ? C('#e4e9ee') : C('#5f8a3c'),
    fogNear: w.fog ? 6 : 40,
    fogFar: w.fog ? 110 : w.rain || w.snow ? 380 : 900,
    rain: w.rain ?? 0,
    snow: w.snow ?? 0,
    storm: w.storm ?? 0,
    // how bright the backdrop is overall: picks light or dark line colors
    brightness: horizon.r * 0.3 + horizon.g * 0.55 + horizon.b * 0.15,
  };
}
