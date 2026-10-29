import "./guide.css";

// The Campus Guide and the first-visit tour (plan 112). Everything they say
// lives in GUIDE below, one list: the tour shows the entries marked `intro`
// in order, the guide shows them all by section, and a room's Help opens the
// guide at the rooms. A feature that isn't built yet isn't in it. Each entry
// may have a short looping clip (assets/guide/<id>.webp, animated); without one
// it's text only. Seen or skipped is kept in this browser.

export interface GuideEntry {
  id: string;
  section: "Getting around" | "Talking" | "Places" | "Rooms" | "Your account";
  title: string;
  /** What it is and how to do it; `keys` / `touch` say the controls on each kind of device. */
  text: string;
  keys?: string;
  touch?: string;
  /** In the first-visit tour, in this order. */
  intro?: number;
  /** A short clip exists in assets/guide/<id>.webp (recorded by the author's clips tool). */
  clip?: boolean;
}

export const GUIDE: GuideEntry[] = [
  { id: "welcome", section: "Getting around", intro: 1, title: "Welcome to ANU Crossing", text: "An unofficial, fan-made 3D campus for the ANU community: bump into people, ask what you don't know, find study mates. It isn't run by ANU." },
  { id: "move", clip: true, section: "Getting around", intro: 2, title: "Walk around", text: "Walk anywhere on the paths and lawns, run, jump onto kerbs and sit on benches.", keys: "WASD or the arrows to walk, Shift to run, Space to jump", touch: "the arrow pad to walk, Jump to jump" },
  { id: "use", clip: true, section: "Getting around", intro: 3, title: "Use things", text: "Doors, boards, PCs, seats and the AI assistants show a key badge when you're close. Press it to go in, read, sit or talk.", keys: "E", touch: "the Use button" },
  { id: "turn", clip: true, section: "Getting around", title: "Turn the view", text: "Outside, turn the camera a quarter round you. Walking keeps going away from the camera.", keys: "R, or the ⟳ button", touch: "the ⟳ button" },
  { id: "chat", clip: true, section: "Talking", intro: 4, title: "Chat and emotes", text: "Say something to everyone in the same place; it shows over your head for a minute. \"/all message\" reaches every space, \"/w name message\" whispers to one member. Wave, nod or dance with the emote menu.", keys: "Enter to chat, hold Q for emotes", touch: "Chat, and the Emotes button" },
  { id: "notes", section: "Talking", title: "Sticky notes", text: "Stick a note (up to 100 words) where you stand, outside or in a classroom; others read it, heart it and reply. Notes go after a month.", keys: "hold Q, then 1", touch: "Emotes, then Sticky note" },
  { id: "npcs", clip: true, section: "Talking", intro: 5, title: "AI campus assistants", text: "People with a green \"AI\" tag answer questions from ANU's public pages and link them: Robin (library), Kai (sport), Jordan (accommodation), Sam (ANUSA), Priya (courses), Mei (international students), Alex (careers). They can be wrong: check the pages they link." },
  { id: "mail", section: "Talking", title: "Mail", text: "Signed up, the ✉️ button writes to another member by name; mail is kept 30 days, and the button lights up when something arrives. Saved room chats and notes are there too." },
  { id: "hub", section: "Places", title: "Student Hub (154)", text: "Sofas to sit together, the lab matching board, \"Ask the Hub\" (public or private questions), the academic calendar on the wall, arcade games, and counselling rooms (invite only)." },
  { id: "library", section: "Places", title: "Chifley Library", text: "Over the bridge to the south: book a room, search the catalogue, Academic Skills (writing and study help), quiet desks and four team rooms anyone can use." },
  { id: "classrooms", section: "Places", title: "Classrooms (155)", text: "Pick a course at 155's door. Each has a board (Q&A, Notices, Board) with a link to Canvas, and three team rooms." },
  { id: "anusa", section: "Places", title: "ANUSA Student Lounge", text: "North of the Hub's door: the students' association, with its own meeting rooms. Sam answers questions about ANUSA's help, legal service and pantry." },
  { id: "careers", section: "Places", title: "Career Hub", text: "Across the north road in the O'Donoghue centre: Alex, the careers adviser, a jobs board and six interview rooms (invite only) for mock interviews and CV reviews." },
  { id: "outside", section: "Places", title: "Around the lawn", text: "The study-group board by 155's door (start or join a group), the advertising board by the flower beds, Lab Coffee's café list, the ANU Sport and Accommodation tents, and picnic tables by Badger & Co." },
  { id: "rooms", clip: true, section: "Rooms", intro: 6, title: "Team and counselling rooms", text: "Up to six people. Coming in opens the room menu: Chat (share files too), Shared notes (Markdown, pictures), a Whiteboard everyone draws on together (a new tab), Save chat and Save notes. Close it to see the room (the "Open Room UI" button at the top right brings it back); leave from the menu or by the door. Counselling and interview rooms let in only those invited from inside." },
  { id: "save", section: "Rooms", title: "Keeping a room's chat or notes", text: "A room's chat, notes and files go when the last person leaves. Save chat or Save notes keeps a copy for you for 30 days: read it from the room menu's 📂 My saved chats and notes, or ✉️ → Saved." },
  { id: "look", clip: true, section: "Your account", title: "Change your look", text: "The coat hanger picks your figure, skin, hair, clothes and hat." },
  { id: "settings", section: "Your account", title: "Settings", text: "The gear: music and effects volume, graphics quality, full screen on a phone, report a bug or a person, mute someone, credits and licences, and signing out." },
  { id: "guest", section: "Your account", title: "Guests and members", text: "Guests walk, chat, emote, stick notes and use team rooms. Signing up with an ANU email lets you post, comment, heart, join study groups, send mail and share files." },
];

const SEEN = "campus.guideSeen";
function seenTour(): boolean {
  try {
    return localStorage.getItem(SEEN) === "1";
  } catch {
    return false;
  }
}
function markSeen(): void {
  try {
    localStorage.setItem(SEEN, "1");
  } catch {
    // Private mode: it shows again next visit.
  }
}

const touchScreen = (): boolean => window.matchMedia("(pointer: coarse), (max-width: 700px)").matches;

/** One entry as a card: its clip (if any), title, text and controls. */
function card(e: GuideEntry): HTMLElement {
  const el = document.createElement("article");
  el.className = "guide-entry";
  el.id = `guide-${e.id}`;
  if (e.clip) {
    // A short looping clip: an animated WebP (lighter than a video, and it plays by itself, silently).
    const img = document.createElement("img");
    img.className = "guide-clip";
    img.src = `${import.meta.env.BASE_URL}assets/guide/${e.id}.webp`;
    img.alt = "";
    img.loading = "lazy";
    img.addEventListener("error", () => img.remove());
    el.append(img);
  }
  const h = document.createElement("h3");
  h.textContent = e.title;
  const p = document.createElement("p");
  p.textContent = e.text;
  el.append(h, p);
  const how = touchScreen() ? e.touch : e.keys;
  if (how) {
    const k = document.createElement("p");
    k.className = "guide-keys";
    k.textContent = `How: ${how}`;
    el.append(k);
  }
  return el;
}

export function mountGuide(opts: { onTourDone(): void; onTourStart(): void }): {
  /** The guide, optionally scrolled to one entry. */
  open(at?: string): void;
  /** The first-visit tour, unless it was seen or skipped; resolves when it's done (or straight away). */
  tourIfNew(): void;
  isOpen(): boolean;
  /** True while the tour is up, so other first-visit things wait. */
  touring(): boolean;
} {
  const root = document.createElement("div");
  root.id = "guide";
  root.hidden = true;
  root.setAttribute("role", "dialog");
  root.setAttribute("aria-modal", "true");
  root.setAttribute("aria-labelledby", "guide-title");
  const box = document.createElement("div");
  box.className = "settings-card guide-card";
  const head = document.createElement("div");
  head.className = "guide-head";
  const title = document.createElement("h2");
  title.id = "guide-title";
  const close = document.createElement("button");
  close.type = "button";
  close.className = "guide-close";
  close.textContent = "✕";
  close.setAttribute("aria-label", "Close");
  head.append(title, close);
  const body = document.createElement("div");
  body.className = "guide-body";
  const foot = document.createElement("div");
  foot.className = "guide-foot";
  box.append(head, body, foot);
  root.append(box);
  document.body.append(root);

  let tour = false;
  let step = 0;
  const steps = GUIDE.filter((e) => e.intro).sort((a, b) => a.intro! - b.intro!);

  function showGuide(at?: string): void {
    tour = false;
    title.textContent = "❓ Campus Guide";
    const sections = [...new Set(GUIDE.map((e) => e.section))];
    body.replaceChildren(
      ...sections.map((s) => {
        const sec = document.createElement("section");
        const h = document.createElement("h2");
        h.className = "guide-section";
        h.textContent = s;
        sec.append(h, ...GUIDE.filter((e) => e.section === s).map(card));
        return sec;
      }),
    );
    const again = document.createElement("button");
    again.type = "button";
    again.textContent = "Show the welcome tour again";
    again.addEventListener("click", () => startTour());
    foot.replaceChildren(again);
    root.hidden = false;
    const target = at ? body.querySelector<HTMLElement>(`#guide-${at}`) : null;
    if (target) {
      target.scrollIntoView({ block: "start" });
      target.classList.add("is-flash");
    } else body.scrollTop = 0;
    close.focus();
  }

  function renderStep(): void {
    const e = steps[step]!;
    title.textContent = `Welcome · ${step + 1}/${steps.length}`;
    body.replaceChildren(card(e));
    const skip = document.createElement("button");
    skip.type = "button";
    skip.textContent = "Skip tour";
    skip.addEventListener("click", finishTour);
    const back = document.createElement("button");
    back.type = "button";
    back.textContent = "‹ Back";
    back.disabled = step === 0;
    back.addEventListener("click", () => {
      step = Math.max(0, step - 1);
      renderStep();
    });
    const next = document.createElement("button");
    next.type = "button";
    next.className = "guide-next";
    next.textContent = step === steps.length - 1 ? "Start exploring" : "Next ›";
    next.addEventListener("click", () => {
      if (step === steps.length - 1) return finishTour();
      step++;
      renderStep();
    });
    foot.replaceChildren(skip, back, next);
    next.focus();
  }
  function startTour(): void {
    opts.onTourStart();
    tour = true;
    step = 0;
    root.hidden = false;
    renderStep();
  }
  function finishTour(): void {
    markSeen();
    root.hidden = true;
    if (tour) {
      tour = false;
      opts.onTourDone();
    }
  }
  const hide = (): void => {
    if (tour) return finishTour();
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
    open: showGuide,
    tourIfNew() {
      if (seenTour()) return opts.onTourDone();
      startTour();
    },
    isOpen: () => !root.hidden,
    touring: () => tour && !root.hidden,
  };
}
