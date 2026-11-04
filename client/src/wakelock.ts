// A phone's screen stays on while you're on campus (the user's ask, 11/4):
// standing still in a conversation, or waiting in a room, shouldn't dim
// and lock it. The Screen Wake Lock API (Chrome, Android, iPhone Safari
// 16.4+); where it isn't there, nothing happens. Touch screens only, and
// only while the page is showing: the browser lets the lock go when you
// switch away, so it's asked for again on coming back.

type Sentinel = { released: boolean; release(): Promise<void>; addEventListener(type: "release", f: () => void): void };
type WakeLockApi = { request(type: "screen"): Promise<Sentinel> };

export function keepScreenOn(isPlaying: () => boolean): void {
  const api = (navigator as Navigator & { wakeLock?: WakeLockApi }).wakeLock;
  if (!api || !window.matchMedia("(pointer: coarse)").matches) return;
  let lock: Sentinel | null = null;
  const take = async (): Promise<void> => {
    if (lock && !lock.released) return;
    if (document.visibilityState !== "visible" || !isPlaying()) return;
    try {
      lock = await api.request("screen");
      lock.addEventListener("release", () => (lock = null));
    } catch {
      // Refused (low battery, or no tap yet): the next tap tries again.
    }
  };
  // Browsers want a tap first; any tap on the page asks (cheap when it's already held).
  window.addEventListener("pointerdown", () => void take(), { capture: true, passive: true });
  document.addEventListener("visibilitychange", () => void take());
}
