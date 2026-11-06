// Live weather from Open-Meteo (free, no key). Wind speeds come back in knots.

export async function fetchWeather(lat, lon, signal) {
  const params = new URLSearchParams({
    latitude: lat.toFixed(4),
    longitude: lon.toFixed(4),
    current:
      'temperature_2m,weather_code,cloud_cover,wind_speed_10m,wind_direction_10m,wind_gusts_10m,is_day',
    wind_speed_unit: 'kn',
    timezone: 'auto',
  });
  const res = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`, { signal });
  if (!res.ok) throw new Error(`Weather request failed (${res.status})`);
  const j = await res.json();
  const c = j.current;
  return {
    speedKn: c.wind_speed_10m,
    gustKn: c.wind_gusts_10m,
    fromDeg: c.wind_direction_10m,
    tempC: c.temperature_2m,
    code: c.weather_code,
    cloud: c.cloud_cover,
    isDay: !!c.is_day,
    fetchedAt: Date.now(),
    lat,
    lon,
  };
}

// WMO weather codes -> label + background scene
const CODES = [
  [[0], 'Clear', 'clear'],
  [[1], 'Mostly clear', 'clear'],
  [[2], 'Partly cloudy', 'partly'],
  [[3], 'Overcast', 'overcast'],
  [[45, 48], 'Fog', 'fog'],
  [[51, 53, 55], 'Drizzle', 'drizzle'],
  [[56, 57], 'Freezing drizzle', 'drizzle'],
  [[61, 63], 'Rain', 'rain'],
  [[65], 'Heavy rain', 'rain'],
  [[66, 67], 'Freezing rain', 'rain'],
  [[71, 73], 'Snow', 'snow'],
  [[75], 'Heavy snow', 'snow'],
  [[77], 'Snow grains', 'snow'],
  [[80, 81], 'Showers', 'rain'],
  [[82], 'Heavy showers', 'rain'],
  [[85, 86], 'Snow showers', 'snow'],
  [[95], 'Thunderstorm', 'storm'],
  [[96, 99], 'Thunderstorm, hail', 'storm'],
];

export function describeCode(code) {
  for (const [list, label, scene] of CODES) if (list.includes(code)) return { label, scene };
  return { label: '—', scene: 'partly' };
}
