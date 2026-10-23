// An in-app web window: a modal over the scene that shows a page in an
// iframe, so a link (a course page, a classmate's project) opens without
// leaving the campus. Some sites refuse to be framed (they send
// X-Frame-Options: SAMEORIGIN, e.g. anulib, researchportalplus,
// buymeacoffee), so a link marked embeddable=false opens in a new tab instead,
// straight from the user's tap or keypress so popup blockers allow it.
// Esc, the backdrop and Close shut it; its keys stay out of the game.

import "./webview.css";

export interface WebLink {
  label: string;
  url: string;
  embeddable: boolean;
}

export function mountWebView(): { open(link: WebLink): void; close(): void; isOpen(): boolean } {
  const root = document.createElement("div");
  root.id = "webview";
  root.hidden = true;
  root.setAttribute("role", "dialog");
  root.setAttribute("aria-modal", "true");
  root.setAttribute("aria-labelledby", "webview-title");

  const card = document.createElement("div");
  card.className = "webview-card";

  const head = document.createElement("div");
  head.className = "webview-head";
  const title = document.createElement("h2");
  title.id = "webview-title";
  title.className = "webview-title";
  const newTab = document.createElement("button");
  newTab.type = "button";
  newTab.textContent = "Open in new tab";
  // Another site's page in the frame can't be read (the browser keeps where
  // you've got to private), so for those this opens the page you started on.
  newTab.title = "Opens this page in a new tab. On other sites it starts again from the first page.";
  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.className = "webview-close";
  closeBtn.textContent = "✕";
  closeBtn.setAttribute("aria-label", "Close");
  head.append(title, newTab, closeBtn);

  const frame = document.createElement("iframe");
  frame.className = "webview-frame";
  frame.referrerPolicy = "no-referrer";
  frame.setAttribute("sandbox", "allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox");

  card.append(head, frame);
  root.append(card);
  document.body.append(root);

  let current: WebLink | null = null;

  const openInTab = (url: string): void => {
    window.open(url, "_blank", "noopener");
  };
  /** Where the frame is now, if it's our own page (others' are unreadable); else the page it opened on. */
  const whereNow = (fallback: string): string => {
    try {
      const href = frame.contentWindow?.location.href;
      if (href && href !== "about:blank") return href;
    } catch {
      // Another site: the browser won't say.
    }
    return fallback;
  };

  const close = (): void => {
    if (root.hidden) return;
    root.hidden = true;
    current = null;
    // about:blank stops the page's audio and video.
    frame.src = "about:blank";
    (document.activeElement as HTMLElement | null)?.blur();
    document.body.focus();
  };

  closeBtn.addEventListener("click", close);
  newTab.addEventListener("click", () => {
    if (current) openInTab(whereNow(current.url));
  });
  root.addEventListener("click", (e) => {
    if (e.target === root) close();
  });
  root.addEventListener("keydown", (e) => {
    // Keep game keys (WASD, E, Q) out of the scene while the window is open.
    e.stopPropagation();
    if (e.key === "Escape") close();
  });

  return {
    open(link) {
      if (!link.embeddable) return openInTab(link.url);
      current = link;
      title.textContent = link.label;
      frame.title = link.label;
      frame.src = link.url;
      root.hidden = false;
      closeBtn.focus();
    },
    close,
    isOpen: () => !root.hidden,
  };
}
