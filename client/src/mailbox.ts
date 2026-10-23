import "./mailbox.css";
import { canberraTime } from "./when.ts";

// The mailbox (plan 16): messages to and from people signed up, by name,
// read whenever you come in. Three views in one window: Inbox, Sent, Write.
// main does the requests; this only shows them. Guests see why they can't.

export interface MailView {
  id: number;
  sender: string;
  reader: string;
  subject: string;
  body: string;
  sentAt: string;
  readAt: string | null;
}

export function mountMailbox(opts: {
  load(): Promise<{ inbox: MailView[]; sent: MailView[] } | string>;
  read(id: number): Promise<void>;
  remove(id: number): Promise<string | null>;
  send(to: string, subject: string, text: string): Promise<string | null>;
  /** Signed up? Guests can't send or receive mail. */
  member(): boolean;
}): { open(to?: string): void; isOpen(): boolean } {
  const root = document.createElement("div");
  root.id = "mailbox";
  root.hidden = true;
  root.setAttribute("role", "dialog");
  root.setAttribute("aria-modal", "true");
  root.setAttribute("aria-labelledby", "mail-title");
  const card = document.createElement("div");
  card.className = "settings-card mail-card";
  const head = document.createElement("div");
  head.className = "mail-head";
  const title = document.createElement("h2");
  title.id = "mail-title";
  title.textContent = "📮 Mail";
  const close = document.createElement("button");
  close.type = "button";
  close.className = "mail-close";
  close.textContent = "✕";
  close.setAttribute("aria-label", "Close");
  head.append(title, close);
  const tabs = document.createElement("div");
  tabs.className = "mail-tabs";
  tabs.setAttribute("role", "tablist");
  const tabBtn = (label: string): HTMLButtonElement => {
    const b = document.createElement("button");
    b.type = "button";
    b.setAttribute("role", "tab");
    b.textContent = label;
    tabs.append(b);
    return b;
  };
  const inboxTab = tabBtn("Inbox");
  const sentTab = tabBtn("Sent");
  const writeTab = tabBtn("Write");
  const body = document.createElement("div");
  body.className = "mail-body";
  const status = document.createElement("p");
  status.className = "mail-status";
  status.setAttribute("role", "alert");
  card.append(head, tabs, body, status);
  root.append(card);
  document.body.append(root);

  let inbox: MailView[] = [];
  let sent: MailView[] = [];
  let view: "inbox" | "sent" | "write" | "message" = "inbox";
  let draftTo = "";

  function select(v: typeof view): void {
    view = v;
    for (const [b, which] of [
      [inboxTab, "inbox"],
      [sentTab, "sent"],
      [writeTab, "write"],
    ] as const)
      b.setAttribute("aria-selected", String(view === which || (view === "message" && which === "inbox")));
  }

  function list(items: MailView[], mine: boolean): void {
    select(mine ? "sent" : "inbox");
    status.textContent = "";
    if (!items.length) {
      const p = document.createElement("p");
      p.className = "mail-empty";
      p.textContent = mine ? "Nothing sent yet." : "No mail yet.";
      body.replaceChildren(p);
      return;
    }
    const ul = document.createElement("ul");
    ul.className = "mail-list";
    for (const m of items) {
      const li = document.createElement("li");
      const b = document.createElement("button");
      b.type = "button";
      b.className = "mail-row" + (!mine && !m.readAt ? " is-unread" : "");
      const who = document.createElement("span");
      who.className = "mail-who";
      who.textContent = mine ? `To ${m.reader}` : m.sender;
      const subj = document.createElement("span");
      subj.className = "mail-subject";
      subj.textContent = m.subject;
      const when = document.createElement("span");
      when.className = "mail-when";
      when.textContent = canberraTime(m.sentAt);
      b.append(who, subj, when);
      b.addEventListener("click", () => showMessage(m, mine));
      li.append(b);
      ul.append(li);
    }
    body.replaceChildren(ul);
  }

  function showMessage(m: MailView, mine: boolean): void {
    view = "message";
    select("message");
    const wrap = document.createElement("div");
    wrap.className = "mail-message";
    const h = document.createElement("h3");
    h.textContent = m.subject;
    const meta = document.createElement("p");
    meta.className = "mail-meta";
    meta.textContent = `${mine ? `To ${m.reader}` : `From ${m.sender}`} · ${canberraTime(m.sentAt)}`;
    const text = document.createElement("p");
    text.className = "mail-text";
    text.textContent = m.body;
    const row = document.createElement("div");
    row.className = "settings-actions";
    const back = document.createElement("button");
    back.type = "button";
    back.textContent = "← Back";
    back.addEventListener("click", () => list(mine ? sent : inbox, mine));
    row.append(back);
    if (!mine) {
      const reply = document.createElement("button");
      reply.type = "button";
      reply.textContent = "Reply";
      reply.addEventListener("click", () => write(m.sender, m.subject.startsWith("Re: ") ? m.subject : `Re: ${m.subject}`));
      const del = document.createElement("button");
      del.type = "button";
      del.textContent = "Delete";
      del.addEventListener("click", () => {
        void opts.remove(m.id).then((err) => {
          if (err) status.textContent = err;
          else {
            inbox = inbox.filter((x) => x.id !== m.id);
            list(inbox, false);
          }
        });
      });
      row.append(reply, del);
      if (!m.readAt) {
        m.readAt = new Date().toISOString();
        void opts.read(m.id);
      }
    }
    wrap.append(h, meta, text, row);
    body.replaceChildren(wrap);
    back.focus();
  }

  function write(to = draftTo, subject = ""): void {
    select("write");
    status.textContent = "";
    if (!opts.member()) {
      const p = document.createElement("p");
      p.className = "mail-empty";
      p.textContent = "Mail is for people signed up with an ANU email. ⚙️ → Sign out (or sign up).";
      body.replaceChildren(p);
      return;
    }
    const form = document.createElement("form");
    form.className = "mail-form";
    const mk = (label: string, el: HTMLInputElement | HTMLTextAreaElement): HTMLLabelElement => {
      const l = document.createElement("label");
      l.append(label, el);
      return l;
    };
    const toIn = document.createElement("input");
    toIn.maxLength = 12;
    toIn.autocomplete = "off";
    toIn.autocapitalize = "off";
    toIn.value = to;
    const subjIn = document.createElement("input");
    subjIn.maxLength = 80;
    subjIn.value = subject;
    const textIn = document.createElement("textarea");
    textIn.maxLength = 1000;
    textIn.rows = 6;
    const send = document.createElement("button");
    send.type = "submit";
    send.className = "mail-send";
    send.textContent = "Send";
    form.append(mk("To (their name)", toIn), mk("Subject", subjIn), mk("Message", textIn), send);
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      if (send.disabled) return;
      if (!toIn.value.trim() || !subjIn.value.trim() || !textIn.value.trim()) {
        status.textContent = "Fill in who, a subject and a message.";
        return;
      }
      send.disabled = true;
      void opts.send(toIn.value.trim(), subjIn.value.trim(), textIn.value.trim()).then((err) => {
        send.disabled = false;
        if (err) {
          status.textContent = err;
          return;
        }
        draftTo = "";
        status.textContent = "Sent.";
        void refresh("sent");
      });
    });
    body.replaceChildren(form);
    (to ? subjIn : toIn).focus();
  }

  async function refresh(show: "inbox" | "sent"): Promise<void> {
    const r = await opts.load();
    if (typeof r === "string") {
      status.textContent = r;
      return;
    }
    inbox = r.inbox;
    sent = r.sent;
    list(show === "sent" ? sent : inbox, show === "sent");
  }

  inboxTab.addEventListener("click", () => list(inbox, false));
  sentTab.addEventListener("click", () => list(sent, true));
  writeTab.addEventListener("click", () => write());
  const hide = (): void => {
    root.hidden = true;
  };
  close.addEventListener("click", hide);
  root.addEventListener("click", (e) => {
    if (e.target === root) hide();
  });
  root.addEventListener("keydown", (e) => {
    e.stopPropagation();
    if (e.key === "Escape") hide();
  });

  return {
    open(to) {
      root.hidden = false;
      status.textContent = "";
      if (to) {
        draftTo = to;
        write(to);
      } else if (!opts.member()) write();
      else {
        body.replaceChildren();
        void refresh("inbox");
      }
      inboxTab.focus();
    },
    isOpen: () => !root.hidden,
  };
}
