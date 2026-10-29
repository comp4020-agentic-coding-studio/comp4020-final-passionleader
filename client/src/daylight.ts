import * as THREE from "three";

// The campus's light follows Canberra's clock (RICE v2 #2, 10/30): a soft
// golden hour before sunset, a blue dusk, a dark night with the lamps lit,
// and back through dawn. Outside only; rooms keep their own light. The sky
// photo is tinted rather than swapped, the sun and the sky's fill change
// colour and strength, and lamp bulbs (marked `userData.lamp`) glow at
// night. `?hour=21` in the address shows that hour, for checking.

export interface Daylight {
  /** Multiplies the sky photo. */
  sky: THREE.Color;
  sunColour: THREE.Color;
  sunIntensity: number;
  hemiIntensity: number;
  fog: THREE.Color;
  /** 0 by day, 1 at night: how bright the lamps are. */
  lamps: number;
  exposure: number;
}

// Key moments through the day (hour, Canberra time); between them, a blend.
// Sunrise and sunset move through the year (about 5:45–7:30 and 17:00–20:30),
// so they're taken from the month: close enough for a mood.
type Key = { h: number; sky: number; sun: number; si: number; hemi: number; fog: number; lamps: number; exp: number };
function keys(month: number): Key[] {
  // Southern hemisphere: long days around December, short around June.
  const summer = Math.cos(((month - 0.5) / 12) * Math.PI * 2); // 1 in Jan, -1 in Jul
  const rise = 6.5 - summer * 0.9;
  const set = 18.6 + summer * 1.4;
  return [
    { h: 0, sky: 0x0e1430, sun: 0x7f96d0, si: 0.25, hemi: 0.18, fog: 0x121a30, lamps: 1, exp: 0.55 },
    { h: rise - 0.8, sky: 0x1a2142, sun: 0x8fa2d4, si: 0.3, hemi: 0.22, fog: 0x1c2440, lamps: 1, exp: 0.58 },
    { h: rise, sky: 0xf2b48c, sun: 0xffc59a, si: 1.4, hemi: 0.65, fog: 0xd9b9a2, lamps: 0.3, exp: 0.85 },
    { h: rise + 1.5, sky: 0xffffff, sun: 0xfff3e0, si: 2.6, hemi: 0.9, fog: 0xc9dcea, lamps: 0, exp: 0.85 },
    { h: set - 1.5, sky: 0xffffff, sun: 0xfff3e0, si: 2.6, hemi: 0.9, fog: 0xc9dcea, lamps: 0, exp: 0.85 },
    { h: set - 0.4, sky: 0xffcf9a, sun: 0xffb070, si: 1.9, hemi: 0.75, fog: 0xe6c3a0, lamps: 0.2, exp: 0.85 },
    { h: set + 0.3, sky: 0xb0687e, sun: 0xff8a60, si: 0.9, hemi: 0.45, fog: 0x8a6f86, lamps: 0.7, exp: 0.72 },
    { h: set + 1.2, sky: 0x1a2246, sun: 0x8396d0, si: 0.3, hemi: 0.22, fog: 0x1a2240, lamps: 1, exp: 0.58 },
    { h: 24, sky: 0x0e1430, sun: 0x7f96d0, si: 0.25, hemi: 0.18, fog: 0x121a30, lamps: 1, exp: 0.55 },
  ];
}

/** The hour now in Canberra (0–24, with minutes as a fraction), or `?hour=` when given. */
export function canberraHour(now = new Date()): { hour: number; month: number } {
  const forced = Number(new URLSearchParams(location.search).get("hour"));
  const parts = new Intl.DateTimeFormat("en-AU", { timeZone: "Australia/Sydney", hour: "numeric", minute: "numeric", month: "numeric", hourCycle: "h23" }).formatToParts(now);
  const get = (t: string): number => Number(parts.find((p) => p.type === t)?.value ?? 0);
  const hour = Number.isFinite(forced) && new URLSearchParams(location.search).has("hour") ? Math.max(0, Math.min(23.99, forced)) : get("hour") + get("minute") / 60;
  return { hour, month: get("month") };
}

const a = new THREE.Color();
const b = new THREE.Color();
export function daylightAt(hour: number, month: number): Daylight {
  const ks = keys(month);
  let i = 0;
  while (i < ks.length - 2 && ks[i + 1]!.h <= hour) i++;
  const k0 = ks[i]!;
  const k1 = ks[i + 1]!;
  const t = THREE.MathUtils.smoothstep(hour, k0.h, k1.h);
  const mix = (x: number, y: number): THREE.Color => a.setHex(x).lerp(b.setHex(y), t).clone();
  const lerp = (x: number, y: number): number => x + (y - x) * t;
  return {
    sky: mix(k0.sky, k1.sky),
    sunColour: mix(k0.sun, k1.sun),
    sunIntensity: lerp(k0.si, k1.si),
    hemiIntensity: lerp(k0.hemi, k1.hemi),
    fog: mix(k0.fog, k1.fog),
    lamps: lerp(k0.lamps, k1.lamps),
    exposure: lerp(k0.exp, k1.exp),
  };
}
