import "./cafeguide.css";
import { CAFES, CAFES_CHECKED } from "./cafes.ts";

// The menu board at Lab Coffee, on 154's north side: E opens a list of the
// cafés on campus, where each is and roughly what it sells, with a link to
// its own page in a new tab. The list is cafes.ts, gathered from public pages;
// it says when, and that it isn't official.

export function mountCafeGuide(): { open(): void; isOpen(): boolean } {
  const root = document.createElement("div");
  root.id = "cafe-guide";
  root.hidden = true;
  root.setAttribute("role", "dialog");
  root.setAttribute("aria-modal", "true");
  root.setAttribute("aria-labelledby", "cafe-guide-title");

  const card = document.createElement("div");
  card.className = "settings-card cafe-card";
  const head = document.createElement("div");
  head.className = "cafe-head";
  const title = document.createElement("h2");
  title.id = "cafe-guide-title";
  title.textContent = "☕ Cafés on campus";
  const close = document.createElement("button");
  close.type = "button";
  close.className = "cafe-close";
  close.textContent = "✕";
  close.setAttribute("aria-label", "Close");
  head.append(title, close);
  const note = document.createElement("p");
  note.className = "settings-note";
  note.textContent = `Gathered from public pages on ${CAFES_CHECKED}. Hours and menus change, so check before you go. Not an official list.`;

  const list = document.createElement("ul");
  list.className = "cafe-list";
  for (const cafe of CAFES) {
    const li = document.createElement("li");
    li.className = "cafe-item";
    const name = document.createElement("h3");
    name.textContent = cafe.name;
    const where = document.createElement("p");
    where.className = "cafe-where";
    where.textContent = `📍 ${cafe.where}`;
    const about = document.createElement("p");
    about.textContent = cafe.about;
    const sells = document.createElement("ul");
    sells.className = "cafe-sells";
    sells.setAttribute("aria-label", "Sells");
    for (const s of cafe.sells) sells.append(Object.assign(document.createElement("li"), { textContent: s }));
    li.append(name, where, about, sells);
    if (cafe.link) {
      const a = document.createElement("a");
      a.className = "cafe-link";
      a.href = cafe.link;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.textContent = "Their page (new tab)";
      li.append(a);
    }
    list.append(li);
  }

  card.append(head, note, list);
  root.append(card);
  document.body.append(root);

  const hide = (): void => {
    root.hidden = true;
  };
  close.addEventListener("click", hide);
  root.addEventListener("click", (e) => {
    if (e.target === root) hide();
  });
  root.addEventListener("keydown", (e) => {
    // Keep game keys out of the scene while the list is open.
    e.stopPropagation();
    if (e.key === "Escape") hide();
  });

  return {
    open() {
      root.hidden = false;
      list.scrollTop = 0;
      close.focus();
    },
    isOpen: () => !root.hidden,
  };
}
