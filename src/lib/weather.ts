import type { Weather } from "../store";

const URL =
  "https://api.open-meteo.com/v1/forecast?latitude=53.48&longitude=-2.24&current=temperature_2m,precipitation,wind_speed_10m";

/** Live Manchester weather. If it fails, assume the safest forecast in history: drizzle. */
export async function fetchWeather(): Promise<Weather> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 3000);
    const r = await fetch(URL, { signal: ctrl.signal });
    clearTimeout(t);
    const j = await r.json();
    return {
      tempC: Math.round(j.current.temperature_2m),
      rainMm: j.current.precipitation,
      windKmh: Math.round(j.current.wind_speed_10m),
      live: true,
    };
  } catch {
    return { tempC: 11, rainMm: 0.8, windKmh: 18, live: false };
  }
}
