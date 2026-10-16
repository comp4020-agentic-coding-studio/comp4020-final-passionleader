// Classmates' final projects: the board in the COMP8020 classroom opens this
// list of live final-project apps. Each row opens that app in a new tab (not
// in the in-app window: these are other people's sites, and some won't be
// framed). The server only sends apps that answered, and your own app is in
// the list but marked, not linked, since it is the one you are already in.

import "./projectlist.css";

export interface Project {
  name: string;
  url: string;
}

/** The GitHub user whose app this is; marked "this app" and not a link. */
const MINE = "passionleader";

/** "2 h ago", from an ISO or SQLite-style timestamp; null when it can't be read. */
function ago(checkedAt: string | null): string | null {
  if (!checkedAt) return null;
  // The server may send "2026-10-16 05:09:00" (UTC, no zone): read it as UTC.
  const iso = /[zZ]|[+-]\d\d:?\d\d$/.test(checkedAt) ? checkedAt : `${checkedAt.replace(" ", "T")}Z`;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  const s = Math.max(0, Math.round((Date.now() - t) / 1000));
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h} h ago`;
  return `${Math.round(h / 24)} days ago`;
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

export function mountProjectList(): {
  open(): void;
  show(projects: Project[], checkedAt: string | null): void;
  fail(message: string): void;
  close(): void;
  isOpen(): boolean;
} {
  const root = document.createElement("div");
  root.id = "project-list";
  root.hidden = true;
  root.setAttribute("role", "dialog");
  root.setAttribute("aria-modal", "true");
  root.setAttribute("aria-labelledby", "project-list-title");

  const card = document.createElement("div");
  card.className = "projects-card";

  const head = document.createElement("div");
  head.className = "projects-head";
  const heading = document.createElement("div");
  heading.className = "projects-heading";
  const title = document.createElement("h2");
  title.id = "project-list-title";
  title.className = "projects-title";
  title.textContent = "Classmates' final projects";
  const sub = document.createElement("p");
  sub.className = "projects-sub";
  heading.append(title, sub);
  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.className = "projects-close";
  closeBtn.textContent = "×";
  closeBtn.setAttribute("aria-label", "Close");
  head.append(heading, closeBtn);

  const tools = document.createElement("div");
  tools.className = "projects-tools";
  const filter = document.createElement("input");
  filter.type = "text";
  filter.className = "projects-filter";
  filter.placeholder = "Filter by name";
  filter.autocomplete = "off";
  filter.autocapitalize = "off";
  filter.spellcheck = false;
  filter.setAttribute("aria-label", "Filter projects by name");
  const count = document.createElement("span");
  count.className = "projects-count";
  count.setAttribute("aria-live", "polite");
  tools.append(filter, count);

  const body = document.createElement("div");
  body.className = "projects-body";
  const status = document.createElement("p");
  status.className = "projects-status";
  status.setAttribute("role", "status");
  const error = document.createElement("p");
  error.className = "projects-error";
  error.setAttribute("role", "alert");
  error.hidden = true;
  const list = document.createElement("ul");
  list.className = "projects-list";
  body.append(status, error, list);

  card.append(head, tools, body);
  root.append(card);
  document.body.append(root);

  let isOpen = false;
  let projects: Project[] = [];
  let checkedAt: string | null = null;
  // Each row's lowercase name, so the filter doesn't re-read the DOM.
  let rows: { li: HTMLLIElement; name: string }[] = [];

  function setSub(): void {
    const when = ago(checkedAt);
    sub.textContent = "Live apps from COMP4020 final-project repos. Opens in a new tab." + (when ? ` Checked ${when}.` : "");
  }

  function applyFilter(): void {
    const q = filter.value.trim().toLowerCase();
    let shown = 0;
    for (const r of rows) {
      const on = q === "" || r.name.includes(q);
      r.li.hidden = !on;
      if (on) shown++;
    }
    if (rows.length === 0) return;
    count.textContent = q === "" ? String(rows.length) : `${shown} of ${rows.length}`;
    status.hidden = shown !== 0;
    if (shown === 0) status.textContent = "No projects match that name.";
  }

  function buildRow(p: Project): HTMLLIElement {
    const li = document.createElement("li");
    const names = document.createElement("span");
    names.className = "projects-names";
    const name = document.createElement("span");
    name.className = "projects-name";
    name.textContent = p.name;
    const host = document.createElement("span");
    host.className = "projects-host";
    host.textContent = hostOf(p.url);
    names.append(name, host);

    if (p.name.toLowerCase() === MINE) {
      // The app you are in: highlighted, not a link.
      const row = document.createElement("div");
      row.className = "projects-row is-mine";
      const tag = document.createElement("span");
      tag.className = "projects-tag";
      tag.textContent = "this app";
      row.append(names, tag);
      li.append(row);
      return li;
    }

    const row = document.createElement("button");
    row.type = "button";
    row.className = "projects-row";
    row.setAttribute("aria-label", `${p.name}, opens in a new tab`);
    const hint = document.createElement("span");
    hint.className = "projects-hint";
    hint.setAttribute("aria-hidden", "true");
    hint.textContent = "↗";
    row.append(names, hint);
    // Straight from the click (or Enter/Space on the button), so phones
    // allow the new tab.
    row.addEventListener("click", () => {
      window.open(p.url, "_blank", "noopener");
    });
    li.append(row);
    return li;
  }

  function hide(): void {
    if (!isOpen) return;
    isOpen = false;
    root.hidden = true;
    filter.value = "";
    (document.activeElement as HTMLElement | null)?.blur();
  }

  closeBtn.addEventListener("click", hide);
  root.addEventListener("click", (e) => {
    if (e.target === root) hide();
  });
  filter.addEventListener("input", applyFilter);
  root.addEventListener("keydown", (e) => {
    // Keep game keys (WASD, E, Q) out of the scene while the list is open.
    e.stopPropagation();
    if (e.key === "Escape") {
      e.preventDefault();
      hide();
    }
  });

  return {
    open() {
      isOpen = true;
      projects = [];
      checkedAt = null;
      rows = [];
      list.replaceChildren();
      filter.value = "";
      filter.disabled = true;
      count.textContent = "";
      error.hidden = true;
      status.hidden = false;
      status.textContent = "Loading…";
      setSub();
      root.hidden = false;
      closeBtn.focus();
    },
    show(next, checked) {
      // A late answer for a list that has been closed is dropped.
      if (!isOpen) return;
      projects = [...next].sort((a, b) => a.name.localeCompare(b.name, "en", { sensitivity: "base" }));
      checkedAt = checked;
      error.hidden = true;
      setSub();
      filter.disabled = false;
      rows = projects.map((p) => ({ li: buildRow(p), name: p.name.toLowerCase() }));
      list.replaceChildren(...rows.map((r) => r.li));
      if (projects.length === 0) {
        count.textContent = "";
        status.hidden = false;
        status.textContent = "No live apps found right now.";
        return;
      }
      count.textContent = String(projects.length);
      status.hidden = true;
      applyFilter();
      filter.focus();
    },
    fail(message) {
      if (!isOpen) return;
      rows = [];
      list.replaceChildren();
      filter.disabled = true;
      count.textContent = "";
      status.hidden = true;
      error.hidden = false;
      error.textContent = message;
    },
    close: hide,
    isOpen: () => isOpen,
  };
}
