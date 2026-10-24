import "./npcchat.css";
import { renderMarkdown } from "./markdown.ts";

// Talking to one of the AI campus assistants: a small window with what they
// said, a box to ask, and the pages they draw on. Nothing typed here is
// kept, and the window says so. The answering is the server's (npcs.ts);
// this only shows it.

export interface NpcInfo {
  id: string;
  name: string;
  role: string;
  greeting: string;
  links: { label: string; url: string }[];
}

/** Wraps bare http(s) addresses as Markdown links, leaving ones already in [text](url) alone and trailing punctuation outside. */
function linkBareUrls(text: string): string {
  return text.replace(/\[[^\]]+\]\([^)]+\)|https?:\/\/[^\s)<>\]]+/g, (m) => {
    if (m.startsWith("[")) return m;
    const url = m.replace(/[.,;:!?]+$/, "");
    return `[${url}](${url})${m.slice(url.length)}`;
  });
}

export function mountNpcChat(opts: {
  /** Asks the server; resolves to the reply, or an error message to show. */
  ask(npcId: string, text: string): Promise<{ reply: string } | string>;
  /** Opens a page (the in-app window or a new tab, as main decides). */
  openLink(label: string, url: string): void;
}): { open(npc: NpcInfo): void; isOpen(): boolean } {
  const root = document.createElement("div");
  root.id = "npc-chat";
  root.hidden = true;
  root.setAttribute("role", "dialog");
  root.setAttribute("aria-modal", "true");
  root.setAttribute("aria-labelledby", "npc-title");
  const card = document.createElement("div");
  card.className = "settings-card npc-card";
  const head = document.createElement("div");
  head.className = "npc-head";
  const title = document.createElement("h2");
  title.id = "npc-title";
  const close = document.createElement("button");
  close.type = "button";
  close.className = "npc-close";
  close.textContent = "✕";
  close.setAttribute("aria-label", "Close");
  head.append(title, close);
  const note = document.createElement("p");
  note.className = "npc-note";
  note.textContent = "An AI campus assistant on an unofficial, fan-made campus: check anything important on ANU's own pages. Nothing you type is kept.";
  const log = document.createElement("div");
  log.className = "npc-log";
  log.setAttribute("aria-live", "polite");
  const links = document.createElement("ul");
  links.className = "npc-links";
  const form = document.createElement("form");
  form.className = "npc-form";
  const input = document.createElement("input");
  input.maxLength = 500;
  input.autocomplete = "off";
  input.setAttribute("aria-label", "Your question");
  const send = document.createElement("button");
  send.type = "submit";
  send.textContent = "Ask";
  form.append(input, send);
  card.append(head, note, log, links, form);
  root.append(card);
  document.body.append(root);

  let current: NpcInfo | null = null;
  const say = (who: "you" | "them", text: string): void => {
    const p = document.createElement(who === "you" ? "p" : "div");
    p.className = `npc-line is-${who}`;
    const name = document.createElement("strong");
    name.textContent = who === "you" ? "You" : current?.name ?? "";
    if (who === "you") p.append(name, document.createTextNode(` ${text}`));
    // The assistant's answer is Markdown (bold, lists, links), drawn without innerHTML; a bare address becomes a link too.
    else p.append(name, renderMarkdown(linkBareUrls(text)));
    log.append(p);
    log.scrollTop = log.scrollHeight;
  };
  const hide = (): void => {
    root.hidden = true;
    current = null;
  };

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text || !current || send.disabled) return;
    const npc = current;
    say("you", text);
    input.value = "";
    send.disabled = true;
    void opts
      .ask(npc.id, text)
      .then((r) => {
        if (current?.id === npc.id) say("them", typeof r === "string" ? r : r.reply);
      })
      .finally(() => {
        send.disabled = false;
        input.focus();
      });
  });
  close.addEventListener("click", hide);
  root.addEventListener("click", (e) => {
    if (e.target === root) hide();
  });
  root.addEventListener("keydown", (e) => {
    // Keep game keys out of the scene while typing.
    e.stopPropagation();
    if (e.key === "Escape") hide();
  });

  return {
    open(npc) {
      current = npc;
      title.textContent = `${npc.name} · ${npc.role}`;
      log.replaceChildren();
      say("them", npc.greeting);
      links.replaceChildren(
        ...npc.links.map((l) => {
          const li = document.createElement("li");
          const b = document.createElement("button");
          b.type = "button";
          b.className = "npc-link";
          b.textContent = `${l.label} ↗`;
          b.addEventListener("click", () => opts.openLink(l.label, l.url));
          li.append(b);
          return li;
        }),
      );
      root.hidden = false;
      input.value = "";
      input.focus();
    },
    isOpen: () => !root.hidden,
  };
}
