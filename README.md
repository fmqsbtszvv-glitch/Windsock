# Windsock

A 3D windsock for your iPhone home screen. It uses the live wind where you are
and turns to match the way your phone is facing.

- **Live wind** from [Open-Meteo](https://open-meteo.com/) (free, no account),
  refreshed every 10 minutes, with simulated gusts and turbulence in between.
- **Real windsock behavior:** each of the 5 stripes fills out at about 3 knots,
  so a sock flying straight means 15+ knots. In calm air it hangs limp.
- **Six styles:** cel-shaded, realistic, outline, neon, pixel, blueprint.
- **Eight sock color presets.**
- **Backgrounds:** live weather (clear, clouds, fog, drizzle, rain, storms with
  lightning, snow) with the sky following your real sunrise and sunset. Or pure
  black for OLED, or pick any scene and time of day yourself.
- **Info panel:** speed, gusts, direction, temperature, conditions, your
  heading, headwind/crosswind/tailwind, and a compass ring. Tap it to shrink it.
- **Haptics (iOS 18+):** gust taps, a "wind finder" tap when you face into the
  wind, compass clicks, and thunder rumbles.
- **Keep screen awake**, and units in mph, knots, km/h or m/s.

## Use it on your iPhone

1. Open the hosted page in **Safari**.
2. Tap **Share → Add to Home Screen**.
3. Open it from the home screen, tap **Start**, and allow motion and location.

GPS and the compass need HTTPS, so open the hosted link, not a local file.

## Hosting on GitHub Pages

In the repo on GitHub: **Settings → Pages → Build and deployment → Deploy from a
branch**, pick the branch and `/ (root)`, then save. The site appears at
`https://<your-username>.github.io/Windsock/` after a minute or two.

## About the haptics

Safari has no vibration API. Since iOS 18, toggling a switch control plays the
system "tick" on the Taptic Engine, and the app triggers that from code. Each
tick is the same light tap, so gusts, thunder and so on are built from timed
patterns of ticks. Strength and texture can't be controlled from a web app.
That needs a native app (Core Haptics).

## Testing on a computer

Serve the folder (`python3 -m http.server`) and open it. With no compass, drag
to turn. Add `?heading=120` to the URL to start facing a set direction.

## Code layout

| File | What it does |
| --- | --- |
| `js/sock.js` | Windsock physics (cloth chain) and its 3D mesh |
| `js/scene.js` | 3D world, the six styles, sky, clouds, rain, snow, lightning |
| `js/sky.js` | Sky colors and lighting from the weather and sun position |
| `js/wind.js` | Turns reported wind into live gusts and turbulence |
| `js/weather.js` | Open-Meteo request and weather codes |
| `js/solar.js` | Sun position for your location and time |
| `js/sensors.js` | Compass and GPS |
| `js/haptics.js` | iPhone haptic patterns |
| `js/ui.js` | Info panel, compass ring, settings |
| `js/main.js` | Wires everything together |

Three.js (MIT license) is included in `vendor/`.
