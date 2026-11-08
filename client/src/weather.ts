// Canberra's weather on the campus (daylight.ts tints the sky, rain.ts drops the rain, world.ts's
// grass sways harder in wind). The server fetches it from Open-Meteo at most every 15 minutes and
// hands it out at /api/weather; here it's asked once on loading (never waited for: until it
// answers, or if it never does, the weather is clear) and again every 15 minutes.
// `?weather=rain|cloud|clear` in the address shows that weather instead, for checking, like `?hour=`.

export type WeatherKind = "clear" | "cloud" | "rain";

export interface Weather {
  kind: WeatherKind;
  /** Plain words for the Settings line. */
  text: string;
  /** Cloud cover, 0 to 100. */
  cloud: number;
  /** Millimetres of rain in the last hour. */
  rain: number;
  /** Wind at 10 m, km/h. */
  wind: number;
}

const CLEAR: Weather = { kind: "clear", text: "Clear", cloud: 0, rain: 0, wind: 0 };

/** What `?weather=` shows: a plausible example of each. */
const FORCED: Record<WeatherKind, Weather> = {
  clear: { kind: "clear", text: "Clear", cloud: 5, rain: 0, wind: 8 },
  cloud: { kind: "cloud", text: "Overcast", cloud: 90, rain: 0, wind: 22 },
  rain: { kind: "rain", text: "Rain", cloud: 100, rain: 2.4, wind: 30 },
};

const forced = ((): Weather | null => {
  try {
    const v = new URLSearchParams(location.search).get("weather");
    return v === "rain" || v === "cloud" || v === "clear" ? FORCED[v] : null;
  } catch {
    return null;
  }
})();

let now: Weather = forced ?? CLEAR;
const listeners: (() => void)[] = [];

/** The weather now (clear until the server has answered). */
export const weatherNow = (): Weather => now;
/** True when `?weather=` is overriding the real thing. */
export const weatherForced = (): boolean => !!forced;
/** Called whenever the weather changes (main.ts re-lights the scene and starts or stops the rain). */
export const onWeather = (f: () => void): void => void listeners.push(f);

/** The Settings line: "Light rain, wind 14 km/h". */
export function weatherLine(w: Weather = now): string {
  const wind = w.wind >= 1 ? `wind ${Math.round(w.wind)} km/h` : "no wind";
  return `${w.text}, ${wind}${forced ? " (set by ?weather= for checking)" : ""}`;
}

async function load(): Promise<void> {
  if (forced) return;
  try {
    const r = await fetch("/api/weather", { cache: "no-store" });
    if (!r.ok) return;
    const w = (await r.json()) as Partial<Weather>;
    const kind: WeatherKind = w.kind === "rain" || w.kind === "cloud" ? w.kind : "clear";
    const num = (x: unknown): number => (typeof x === "number" && Number.isFinite(x) ? x : 0);
    const next: Weather = { kind, text: typeof w.text === "string" && w.text ? w.text.slice(0, 40) : CLEAR.text, cloud: num(w.cloud), rain: num(w.rain), wind: num(w.wind) };
    const changed = JSON.stringify(next) !== JSON.stringify(now);
    now = next;
    if (changed) for (const f of listeners) f();
  } catch {
    // Offline or the server restarting: the weather stays as it was (clear on a fresh start).
  }
}
void load();
window.setInterval(() => void load(), 15 * 60_000);
