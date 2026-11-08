// A link to a spot: https://<host>/?at=<space>,<x>,<z>. Opening it puts you there instead of at your
// saved spot (main.ts). Only the text of the link lives here; whether the space exists, the
// bounds and meeting rooms (which never get a link) are decided where the spaces are known, and the
// server still clamps and checks the "enter" that follows.

const PARAM = "at";
/** Coordinates are shared to half a metre: a spot, not a pixel, and the link stays short. */
const STEP = 0.5;
/** A space id as the server writes them ("outdoor", "comp8020", "team-library-5"): never anything else in the address. */
const SPACE_ID = /^[a-z0-9-]{1,40}$/;
/** No space is anywhere near this wide; a bigger number is a typo or a trick, not a place. */
const LIMIT = 1000;

const round = (n: number): number => Math.round(n / STEP) * STEP;

/** The link for a spot, `base` being this page's address without its query. */
export function placeLink(base: string, space: string, x: number, z: number): string {
  const url = new URL(base);
  url.search = "";
  url.hash = "";
  // Built by hand: URLSearchParams would write the commas as %2C.
  return `${url.toString()}?${PARAM}=${space},${round(x)},${round(z)}`;
}

/** The spot an address asks for, or null if it has none or it isn't well formed (not yet checked against the spaces). */
export function parsePlaceLink(search: string): { space: string; x: number; z: number } | null {
  const value = new URLSearchParams(search).get(PARAM);
  const parts = value?.split(",");
  if (!parts || parts.length !== 3) return null;
  const [space, sx, sz] = parts as [string, string, string];
  const x = Number(sx);
  const z = Number(sz);
  if (!SPACE_ID.test(space) || sx.trim() === "" || sz.trim() === "" || !Number.isFinite(x) || !Number.isFinite(z)) return null;
  if (Math.abs(x) > LIMIT || Math.abs(z) > LIMIT) return null;
  return { space, x, z };
}

/** Takes ?at= out of the address bar, keeping any other query and the hash, once it has been used (or turned out to be no use). */
export function dropPlaceLink(): void {
  const url = new URL(location.href);
  if (!url.searchParams.has(PARAM)) return;
  url.searchParams.delete(PARAM);
  try {
    history.replaceState(history.state, "", url.pathname + url.search + url.hash);
  } catch {
    // a sandboxed frame may refuse: the link just stays in the bar
  }
}

/** Puts text on the clipboard; false if the browser won't (an insecure page, a refused permission). */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // The older way, for browsers without the async clipboard.
    const box = document.createElement("textarea");
    box.value = text;
    box.setAttribute("readonly", "");
    box.style.cssText = "position:fixed;top:0;left:0;opacity:0";
    document.body.append(box);
    box.select();
    try {
      return document.execCommand("copy");
    } catch {
      return false;
    } finally {
      box.remove();
    }
  }
}
