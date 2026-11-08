import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { api } from "./helpers.ts";

// Canberra's weather (server/weather.ts): fetched from Open-Meteo at most every 15 minutes, kept
// in memory, served to everyone, and clear whenever the fetch fails. The module is exercised
// directly with a fake fetch (never the real service), on a throwaway database.

process.env.DATABASE_PATH = join(mkdtempSync(join(tmpdir(), "weather-")), "test.db");
const w = await import("../server/weather.ts");

describe("Canberra's weather", () => {
  it("reads Open-Meteo's answer as clear, cloud or rain, in words", () => {
    expect(w.readWeather({ weather_code: 0, cloud_cover: 3, precipitation: 0, wind_speed_10m: 9 }, "t")).toMatchObject({ kind: "clear", text: "Clear", wind: 9 });
    expect(w.readWeather({ weather_code: 3, cloud_cover: 100, precipitation: 0, wind_speed_10m: 20 }, "t")).toMatchObject({ kind: "cloud", text: "Overcast" });
    expect(w.readWeather({ weather_code: 61, cloud_cover: 100, precipitation: 0.8, wind_speed_10m: 25 }, "t")).toMatchObject({ kind: "rain", text: "Light rain" });
    // Rain that has fallen counts even when the code says cloud.
    expect(w.readWeather({ weather_code: 3, cloud_cover: 100, precipitation: 1.2, wind_speed_10m: 5 }, "t").kind).toBe("rain");
    // Junk is clear, never a crash.
    expect(w.readWeather(null, "t").kind).toBe("clear");
    expect(w.readWeather({ weather_code: "x", cloud_cover: NaN }, "t").kind).toBe("clear");
  });

  it("asks at most every 15 minutes, keeps the answer, and stays clear when the fetch fails", async () => {
    w.resetWeather();
    let calls = 0;
    const raining = async (url: string) => {
      calls++;
      expect(url).toContain("api.open-meteo.com/v1/forecast?latitude=-35.28&longitude=149.12");
      return { current: { weather_code: 63, cloud_cover: 95, precipitation: 1.5, wind_speed_10m: 30 } };
    };
    const t0 = 1_000_000_000_000;
    await w.refreshWeather(raining, t0);
    expect(w.weatherNow()).toMatchObject({ kind: "rain", text: "Rain" });
    await w.refreshWeather(raining, t0 + 14 * 60_000);
    expect(calls).toBe(1);
    await w.refreshWeather(raining, t0 + 15 * 60_000 + 1);
    expect(calls).toBe(2);

    // A failing service keeps the last reading (and isn't hammered).
    const down = async () => {
      calls++;
      throw new Error("offline");
    };
    await w.refreshWeather(down, t0 + 31 * 60_000);
    expect(w.weatherNow().kind).toBe("rain");
    await w.refreshWeather(down, t0 + 32 * 60_000);
    expect(calls).toBe(3);

    // A fresh start whose first fetch fails is clear.
    w.resetWeather();
    await w.refreshWeather(down, t0);
    expect(w.weatherNow().kind).toBe("clear");
  });

  it("serves it to anyone at /api/weather, with nothing about a visitor", async () => {
    const res = await api("/api/weather");
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(["clear", "cloud", "rain"]).toContain(body.kind);
    expect(typeof body.text).toBe("string");
    expect(Object.keys(body).sort()).toEqual(["at", "cloud", "kind", "rain", "text", "wind"]);
  });
});
