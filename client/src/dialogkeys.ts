// Keys inside any open window (plan 109): the hands are already on WASD, so
// in a dialog A/W step to the previous control and D/S to the next (like
// Shift+Tab and Tab), and Space presses the one in focus (as Enter does).
// Esc stays each window's own (close, or back a step), with one check first:
// if Esc would throw away something typed and not yet saved (a note, a post,
// a mail, a bug report), it asks. Boxes whose text isn't lost by closing
// (chat, the room's notes, a question to an assistant) carry data-keep and
// aren't asked about. While typing in a text box nothing else is taken:
// letters and spaces are words there. Keys used here stop, so they never
// reach the game behind (walking, jumping, E).

const TYPING = 'input:not([type="button"]):not([type="submit"]):not([type="checkbox"]):not([type="radio"]):not([type="range"]), textarea, select, [contenteditable=""], [contenteditable="true"]';
const FOCUSABLE = 'button:not([disabled]), a[href], input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** The window the key belongs to: the nearest open dialog, or the room window. */
function windowOf(el: Element | null): HTMLElement | null {
  return (el?.closest('[role="dialog"], [role="alertdialog"], #room-ui') as HTMLElement | null) ?? null;
}

const visible = (el: HTMLElement): boolean => !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length) && !el.closest("[hidden]");

/** True if a text box in this window holds words that closing would lose. */
function unsaved(win: HTMLElement): boolean {
  return [...win.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('textarea, input[type="text"], input:not([type])')].some(
    (el) => visible(el) && !el.closest("[data-keep]") && el.value.trim() !== "" && el.value !== el.defaultValue,
  );
}

export function installDialogKeys(): void {
  document.addEventListener(
    "keydown",
    (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const active = document.activeElement;
      const win = windowOf(active);
      if (e.key === "Escape" && win && unsaved(win) && !window.confirm("Close and lose what you've written?")) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      if (!win || (active instanceof Element && active.matches(TYPING))) return;
      const step = e.code === "KeyA" || e.code === "KeyW" ? -1 : e.code === "KeyD" || e.code === "KeyS" ? 1 : 0;
      if (step) {
        const all = [...win.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(visible);
        if (!all.length) return;
        const at = all.indexOf(active as HTMLElement);
        const next = all[(at + step + all.length) % all.length] ?? all[0]!;
        e.preventDefault();
        e.stopPropagation();
        next.focus();
        return;
      }
      if (e.code === "Space" && active instanceof HTMLElement && active !== win) {
        // A button already clicks on Space (by itself, on key up): only keep it from the game.
        if (active instanceof HTMLButtonElement) return void e.stopPropagation();
        // A link, a tab or a row doesn't: press it here.
        e.preventDefault();
        e.stopPropagation();
        if (!e.repeat) active.click();
      }
    },
    // Before the windows' own handlers, which stop keys from reaching the game.
    true,
  );
}
