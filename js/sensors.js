// Compass heading and GPS location.

export class Compass {
  constructor() {
    this.heading = 0;
    this.active = false;
    this.accuracy = null;
    this._onEvent = this._onEvent.bind(this);
  }

  // Must be called straight from a tap on iPhone.
  requestPermission() {
    const DOE = window.DeviceOrientationEvent;
    if (DOE && typeof DOE.requestPermission === 'function') {
      return DOE.requestPermission().then((r) => r === 'granted');
    }
    return Promise.resolve(!!DOE);
  }

  start() {
    if ('ondeviceorientationabsolute' in window) {
      window.addEventListener('deviceorientationabsolute', this._onEvent);
    }
    window.addEventListener('deviceorientation', this._onEvent);
  }

  _onEvent(e) {
    let h = null;
    if (typeof e.webkitCompassHeading === 'number' && !Number.isNaN(e.webkitCompassHeading)) {
      h = e.webkitCompassHeading; // iPhone: degrees from north, clockwise
      this.accuracy = e.webkitCompassAccuracy;
    } else if (e.absolute && typeof e.alpha === 'number') {
      h = 360 - e.alpha; // Android absolute orientation
    }
    if (h == null) return;
    const screenAngle = screen.orientation?.angle ?? window.orientation ?? 0;
    this.heading = (((h + screenAngle) % 360) + 360) % 360;
    this.active = true;
  }
}

export class Locator {
  constructor(onFix, onError) {
    this.onFix = onFix;
    this.onError = onError;
    this.watchId = null;
  }

  start() {
    if (!('geolocation' in navigator)) {
      this.onError?.(new Error('Location is not available on this device'));
      return;
    }
    this.watchId = navigator.geolocation.watchPosition(
      (p) => this.onFix?.(p.coords.latitude, p.coords.longitude),
      (err) => this.onError?.(err),
      { enableHighAccuracy: false, maximumAge: 5 * 60e3, timeout: 30e3 }
    );
  }
}

// distance in km
export function distanceKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const r = Math.PI / 180;
  const a =
    Math.sin(((lat2 - lat1) * r) / 2) ** 2 +
    Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(((lon2 - lon1) * r) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
