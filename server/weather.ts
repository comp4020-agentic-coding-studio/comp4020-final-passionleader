// Canberra's weather, for the campus's sky (client/src/daylight.ts). The server asks Open-Meteo
// (free, no key, public data about the sky over Canberra: nothing about any visitor goes out) at
// most once every 15 minutes, keeps the answer in memory and in the cache table (so a deploy
// doesn't start blank), and hands it to every client from /api/weather, so a thousand tabs
// still cost one request per quarter hour. It never blocks start-up and never throws: if the
// fetch fails or answers nonsense, the weather is clear, which is also what the campus looked
// like before this existed.

import { cached, setCached } from "./db.ts";

export type WeatherKind = "clear" | "cloud" | "rain";

export interface Weather {
  kind: WeatherKind;
  /** Plain words for the Settings line, e.g. "Light rain". */
  text: string;
  /** Cloud cover, 0 to 100. */
  cloud: number;
  /** Precipitation, millimetres in the last hour. */
  rain: number;
  /** Wind at 10 m, kilometres an hour. */
  wind: number;
  /** When Open-Meteo's reading was fetched (ISO), or null while nothing has been fetched. */
  at: string | null;
}

export const CLEAR: Weather = { kind: "clear", text: "Clear", cloud: 0, rain: 0, wind: 0, at: null };

const URL = "https://api.open-meteo.com/v1/forecast?latitude=-35.28&longitude=149.12&current=weather_code,cloud_cover,precipitation,wind_speed_10m";
/** At most one request this often (the user's rule), whoever asks and however many tabs are open. */
export const WEATHER_EVERY_MS = 15 * 60_000;
const CACHE_KEY = "weather";

const num = (x: unknown, max: number): number => (typeof x === "number" && Number.isFinite(x) ? Math.max(0, Math.min(max, x)) : 0);

/** WMO weather codes (the ones Open-Meteo uses) in words. */
function wordsFor(code: number): string | null {
  if (code === 0) return "Clear";
  if (code === 1) return "Mostly clear";
  if (code === 2) return "Partly cloudy";
  if (code === 3) return "Overcast";
  if (code === 45 || code === 48) return "Fog";
  if (code >= 51 && code <= 57) return "Drizzle";
  if (code === 61 || code === 80) return "Light rain";
  if (code === 63 || code === 81) return "Rain";
  if (code === 65 || code === 66 || code === 67 || code === 82) return "Heavy rain";
  if (code >= 71 && code <= 77) return "Snow";
  if (code === 85 || code === 86) return "Snow showers";
  if (code >= 95 && code <= 99) return "Thunderstorm";
  return null;
}

/** What Open-Meteo's `current` block means for the campus; anything unreadable is clear. */
export function readWeather(current: unknown, at: string): Weather {
  if (!current || typeof current !== "object") return CLEAR;
  const c = current as Record<string, unknown>;
  const code = typeof c.weather_code === "number" ? c.weather_code : -1;
  const cloud = num(c.cloud_cover, 100);
  const rain = num(c.precipitation, 200);
  const wind = num(c.wind_speed_10m, 300);
  const words = wordsFor(code);
  // Rain by its code (drizzle, rain, showers, snow, storms) or by what has actually fallen.
  const wet = (code >= 51 && code <= 99 && code !== 70) || rain >= 0.1;
  const kind: WeatherKind = wet ? "rain" : cloud >= 60 || code === 3 || code === 45 || code === 48 ? "cloud" : "clear";
  const text = words ?? (kind === "rain" ? "Rain" : kind === "cloud" ? "Cloudy" : "Clear");
  return { kind, text, cloud: kind === "clear" ? Math.min(cloud, 59) : cloud, rain, wind, at };
}

let now: Weather = CLEAR;
let lastTry = 0;
let inFlight: Promise<void> | null = null;

/** The weather as last known (clear until a fetch has worked). */
export const weatherNow = (): Weather => now;

/** Tests only: put the module back as if freshly started. */
export function resetWeather(): void {
  now = CLEAR;
  lastTry = 0;
  inFlight = null;
}

/**
 * Asks Open-Meteo unless it was asked less than 15 minutes ago (a failure counts as asking: no
 * hammering a service that's down). Resolves when done; never rejects. `get` is for tests.
 */
export function refreshWeather(get: (url: string) => Promise<unknown> = fetchJson, clock = Date.now()): Promise<void> {
  if (inFlight) return inFlight;
  if (clock - lastTry < WEATHER_EVERY_MS) return Promise.resolve();
  lastTry = clock;
  inFlight = (async () => {
    try {
      const body = (await get(URL)) as { current?: unknown } | null;
      const fresh = readWeather(body?.current, new Date(clock).toISOString());
      // A reading that says nothing useful isn't kept over a real one.
      if (body?.current) {
        now = fresh;
        try {
          setCached(CACHE_KEY, fresh);
        } catch {
          // the cache is a convenience
        }
      }
    } catch {
      // Offline or Open-Meteo down: keep what we had (clear on a fresh start).
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}

async function fetchJson(url: string): Promise<unknown> {
  const res = await fetch(url, { signal: AbortSignal.timeout(5000), headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`open-meteo ${res.status}`);
  return res.json();
}

/**
 * Called once from main.ts. Loads what the cache table remembers (if it is still fresh, no fetch
 * is made until it ages out), then fetches in the background and every 15 minutes. Returns at once.
 */
export function startWeather(): void {
  try {
    const kept = cached<Weather>(CACHE_KEY);
    const age = kept?.at ? Date.now() - Date.parse(kept.at) : Infinity;
    if (kept && age < 3 * 3600_000) now = { ...CLEAR, ...kept };
    // A reading from the last 15 minutes counts as a fetch just made.
    if (age < WEATHER_EVERY_MS) lastTry = Date.now() - age;
  } catch {
    // start clear
  }
  void refreshWeather();
  setInterval(() => void refreshWeather(), WEATHER_EVERY_MS + 1000).unref();
}

/** A clients' ask: the weather, and a nudge to refresh if the timer somehow missed (a laptop asleep, say). */
export function weatherForClient(): Weather {
  if (Date.now() - lastTry >= WEATHER_EVERY_MS) void refreshWeather();
  // Gone stale for hours (the service has been down): clear rather than a storm that ended yesterday.
  if (now.at && Date.now() - Date.parse(now.at) > 3 * 3600_000) return CLEAR;
  return now;
}
