import "./npcchat.css";
import { renderMarkdown } from "./markdown.ts";

// Talking to one of the AI campus assistants: a small window with what they
// said, a box to ask, and the pages they draw on. The answering is the
// server's (npcs.ts); this only shows it. The first time anyone in this
// browser talks to one, a notice says once, plainly, what they are (plan 84):
// an AI on an unofficial fan-made campus, not ANU staff, can be wrong, check
// ANU's own pages; after Confirm (kept in this browser) the window only
// carries a small "AI" mark.

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
  const ai = document.createElement("span");
  ai.className = "npc-ai";
  ai.textContent = "AI";
  ai.title = "An AI assistant, not a person";
  const close = document.createElement("button");
  close.type = "button";
  close.className = "npc-close";
  close.textContent = "✕";
  close.setAttribute("aria-label", "Close");
  head.append(title, ai, close);
  const log = document.createElement("div");
  log.className = "npc-log";
  log.setAttribute("aria-live", "polite");
  const links = document.createElement("ul");
  links.className = "npc-links";
  const form = document.createElement("form");
  form.className = "npc-form";
  const input = document.createElement("input");
  input.maxLength = 500;
  input.dataset.keep = "";
  input.autocomplete = "off";
  input.setAttribute("aria-label", "Your question");
  const send = document.createElement("button");
  send.type = "submit";
  send.textContent = "Ask";
  form.append(input, send);
  card.append(head, log, links, form);
  root.append(card);

  // The one-time notice (plan 84), over the window.
  const notice = document.createElement("div");
  notice.className = "settings-card npc-notice";
  notice.hidden = true;
  notice.setAttribute("role", "alertdialog");
  notice.setAttribute("aria-labelledby", "npc-notice-title");
  const nTitle = document.createElement("h2");
  nTitle.id = "npc-notice-title";
  nTitle.textContent = "Before you ask";
  const nList = document.createElement("ul");
  for (const t of [
    "ANU Crossing is an unofficial, fan-made campus. It isn't run by ANU.",
    "The campus assistants are AI characters, not ANU staff.",
    "They answer from public ANU pages and link them, but they can still be wrong.",
    "For anything important (enrolment, fees, visas, deadlines), check ANU's own pages or ask ANU.",
    "What you type isn't kept.",
  ]) {
    const li = document.createElement("li");
    li.textContent = t;
    nList.append(li);
  }
  const nRow = document.createElement("div");
  nRow.className = "settings-actions";
  const confirm = document.createElement("button");
  confirm.type = "submit";
  confirm.textContent = "Confirm";
  nRow.append(confirm);
  notice.append(nTitle, nList, nRow);
  root.append(notice);
  document.body.append(root);

  const SEEN = "campus.npcNotice";
  const seen = (): boolean => {
    try {
      return localStorage.getItem(SEEN) === "1";
    } catch {
      return false;
    }
  };
  let pending: NpcInfo | null = null;
  confirm.addEventListener("click", () => {
    try {
      localStorage.setItem(SEEN, "1");
    } catch {
      // Private mode: it asks again next visit.
    }
    notice.hidden = true;
    card.hidden = false;
    if (pending) show(pending);
    pending = null;
  });

  let current: NpcInfo | null = null;
  const say = (who: "you" | "them", text: string): void => {
    const p = document.createElement(who === "you" ? "p" : "div");
    p.className = `npc-line is-${who}`;
    const name = document.createElement("strong");
    name.textContent = who === "you" ? "You" : (current?.name ?? "");
    if (who === "you") p.append(name, document.createTextNode(` ${text}`));
    // The assistant's answer is Markdown (bold, lists, links), drawn without innerHTML; a bare address becomes a link too.
    else p.append(name, renderMarkdown(linkBareUrls(text)));
    log.append(p);
    log.scrollTop = log.scrollHeight;
  };
  const hide = (): void => {
    root.hidden = true;
    notice.hidden = true;
    card.hidden = false;
    pending = null;
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
    // While the answer is on its way (a few seconds: the search, then the model), the assistant is
    // seen "thinking" with three moving dots, so nobody thinks it ignored them (the user's ask, 10/30).
    const thinking = document.createElement("div");
    thinking.className = "npc-line is-them npc-thinking";
    thinking.setAttribute("role", "status");
    const who = document.createElement("strong");
    who.textContent = npc.name;
    const dots = document.createElement("span");
    dots.className = "npc-dots";
    dots.textContent = "Thinking";
    for (let i = 0; i < 3; i++) {
      const d = document.createElement("i");
      d.textContent = ".";
      dots.append(d);
    }
    dots.setAttribute("aria-label", `${npc.name} is writing an answer`);
    thinking.append(who, dots);
    log.append(thinking);
    log.scrollTop = log.scrollHeight;
    void opts
      .ask(npc.id, text)
      .then((r) => {
        if (current?.id === npc.id)
          say("them", typeof r === "string" ? r : r.reply);
      })
      .finally(() => {
        thinking.remove();
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

  function show(npc: NpcInfo): void {
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
  }

  return {
    open(npc) {
      if (seen()) return show(npc);
      pending = npc;
      card.hidden = true;
      notice.hidden = false;
      root.hidden = false;
      confirm.focus();
    },
    isOpen: () => !root.hidden,
  };
}
