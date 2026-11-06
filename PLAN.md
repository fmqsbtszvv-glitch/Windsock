# Windsock — Plan

A home-screen web app for iPhone that shows an animated 3D windsock driven by the
live wind at your GPS location, turned to match the direction your phone faces.

## How it works

1. **Location** — GPS gives latitude/longitude.
2. **Wind** — Open-Meteo (free, no API key) returns wind speed, gusts, direction,
   temperature, conditions, sunrise/sunset. Refresh every ~10 minutes.
3. **Heading** — iPhone compass (`webkitCompassHeading`). iOS needs a
   "Tap to start" button to grant motion permission.
4. **Relative wind** = wind direction − phone heading. That angle decides where the
   sock points on screen:
   - Wind at your back → sock streams away from you
   - Wind in your face → sock blows toward you
   - Side wind → sock swings left/right

## Visuals

- **View:** 3D, standing near the pole looking ahead (Three.js).
- **Sock physics:** fabric made of linked segments, so it droops, flaps and ripples.
  Each of the 5 stripes fills out at ~3 knots (fully straight at 15+ knots), like a
  real airport sock.
- **Gusts:** sock snaps out harder during gusts, then relaxes.

### Render styles
- Cel-shaded (flat color bands, bold outline)
- Realistic (soft fabric shading, metal pole)
- Outline only
- Neon glow
- Pixel art
- Blueprint

### Sock color presets
Classic orange/white, red/white, all white, rainbow, and a few more.

### Backgrounds
- **Auto (default):** matches live weather — clear, clouds, rain, storm with
  lightning, snow, fog. Sky follows local sunrise/sunset, stars at night.
  Rain, snow and clouds move with the real wind.
- **OLED black**
- **Manual override:** pick any weather scene.

## Info panel (can be hidden)
Wind speed + gusts, wind direction (e.g. NW), your heading, temperature,
conditions, compass ring.

## Settings
- Style, sock colors, background (Auto / OLED black / pick a scene)
- Units: mph, knots, km/h, m/s
- Haptics on gusts (toggle) — note: iPhone web apps can't vibrate normally; we'll
  use the iOS 18+ switch-control workaround for a light tap, so it's best-effort.
- Keep screen awake (Wake Lock API)
- Settings remembered on the device

## Tech
- Plain HTML/JS + Three.js, no build step
- Installable web app (manifest, icon, offline shell)
- Hosted on GitHub Pages (HTTPS is required for GPS and compass)

## Build order
1. Skeleton: permissions, GPS, compass, wind fetch, info panel
2. 3D scene + sock physics in one style (cel-shaded)
3. Other render styles + color presets
4. Weather backgrounds + OLED black
5. Settings, units, haptics, wake lock
6. Home-screen install + GitHub Pages
