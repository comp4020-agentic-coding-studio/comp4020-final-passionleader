import "./status.css";
import type { PlayerStatus } from "./net.ts";

// How open you are to a chat (RICE v2 #3, 10/30): "Happy to chat",
// "Studying" or "Away", beside your name for everyone in your space. A
// small button after your name at the top left picks it; it's one of three
// fixed values (no free text, so nothing to moderate), kept in this browser
// and sent again on each connect. The server keeps it in memory only.

const KEY = "campus.status";
const ALL: { id: PlayerStatus | null; icon: string; label: string }[] = [
  { id: "chat", icon: "👋", label: "Happy to chat" },
  { id: "study", icon: "📚", label: "Studying" },
  { id: "away", icon: "🌙", label: "Away" },
  { id: null, icon: "○", label: "No status" },
];

export const statusText = (s: string): { icon: string; label: string } => ALL.find((x) => x.id === s) ?? { icon: "", label: "" };

function load(): PlayerStatus | null {
  try {
    const v = localStorage.getItem(KEY);
    return v === "chat" || v === "study" || v === "away" ? v : null;
  } catch {
    return null;
  }
}

export function mountStatus(after: HTMLElement, send: (s: PlayerStatus | null) => void): { current(): PlayerStatus | null; resend(): void } {
  let current = load();
  const btn = document.createElement("button");
  btn.type = "button";
  btn.id = "status-btn";
  btn.setAttribute("aria-haspopup", "menu");
  const menu = document.createElement("div");
  menu.id = "status-menu";
  menu.setAttribute("role", "menu");
  menu.hidden = true;
  const draw = (): void => {
    const s = ALL.find((x) => x.id === current) ?? ALL[3]!;
    // A phone has room for the icon only, beside the name and under the round buttons.
    const narrow = window.matchMedia("(max-width: 700px)").matches;
    btn.textContent = current ? (narrow ? `${s.icon}▾` : `${s.icon} ${s.label} ▾`) : narrow ? "☺▾" : "Set status ▾";
    btn.setAttribute("aria-label", current ? `Status: ${s.label}. Change it` : "Set your status");
    btn.title = "How open you are to a chat, beside your name for everyone here";
  };
  for (const s of ALL) {
    const item = document.createElement("button");
    item.type = "button";
    item.setAttribute("role", "menuitem");
    item.textContent = `${s.icon} ${s.label}`;
    item.addEventListener("click", () => {
      current = s.id;
      try {
        if (s.id) localStorage.setItem(KEY, s.id);
        else localStorage.removeItem(KEY);
      } catch {
        // private mode: just for this visit
      }
      send(current);
      draw();
      menu.hidden = true;
    });
    menu.append(item);
  }
  btn.addEventListener("click", () => (menu.hidden = !menu.hidden));
  window.addEventListener("pointerdown", (e) => {
    if (!menu.hidden && !menu.contains(e.target as Node) && e.target !== btn) menu.hidden = true;
  });
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape") menu.hidden = true;
  });
  after.after(btn);
  document.body.append(menu);
  draw();
  return { current: () => current, resend: () => current && send(current) };
}
