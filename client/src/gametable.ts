import "./gametable.css";

// The Student Hub's games table (server/tables.ts): E opens this window, which
// shows whatever the table is doing: a picker when it is free, a quick quiz
// (join, answer, scores, the winner) or Sketch & Guess. The server holds the
// game and the score and only tells people within 3 m of the table; this
// draws what it is sent and sends back the person's choices, nothing more.

export interface TableView {
  game: null | "quiz" | "sketch";
  phase?: "lobby" | "asking" | "reveal" | "over" | "open";
  host?: string;
  by?: string;
  players?: { name: string; score: number; answered?: boolean }[];
  n?: number;
  of?: number;
  question?: { text: string; options: string[] };
  /** Milliseconds left when it was sent. */
  left?: number;
  correct?: number;
  picks?: Record<string, number>;
  winners?: string[];
}

const REFUSALS: Record<string, string> = {
  "too far": "Stand next to the table (within 3 m) to play.",
  "a game is already on": "A game is already on at this table.",
  "people are waiting for the quiz": "People are waiting to play the quiz here: join it, or wait for them to finish.",
  "already started": "That quiz has already started. Wait for the next one.",
  "table full": "The table is full.",
  "need two people": "A quiz needs at least two people at the table.",
};

export function mountGameTable(opts: {
  /** Sends one request about a table ("look", "pick", "join", "start", "answer", "leave"). */
  send(table: string, op: string, extra?: Record<string, unknown>): boolean;
  /** Opens Sketch & Guess in the in-app window, joined as you. */
  openSketch(): void;
  me(): string;
  onNotSent(): void;
}): {
  open(table: string): void;
  isOpen(): boolean;
  /** The server's view of a table: shown if the window is on it, else a short notice for someone who is nearby. */
  view(table: string, v: TableView): string | null;
  refused(table: string, reason: string): void;
  close(): void;
} {
  const root = document.createElement("div");
  root.id = "game-table";
  root.hidden = true;
  root.setAttribute("role", "dialog");
  root.setAttribute("aria-modal", "true");
  root.setAttribute("aria-labelledby", "gt-title");
  const card = document.createElement("div");
  card.className = "settings-card gt-card";
  const title = document.createElement("h2");
  title.id = "gt-title";
  title.textContent = "🎲 Games table";
  const body = document.createElement("div");
  body.className = "gt-body";
  const note = document.createElement("p");
  note.className = "gt-note";
  note.setAttribute("role", "status");
  const actions = document.createElement("div");
  actions.className = "settings-actions";
  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.textContent = "Close";
  actions.append(closeBtn);
  card.append(title, body, note, actions);
  root.append(card);
  document.body.append(root);

  let table = "";
  let last: TableView = { game: null };
  let sentAt = 0;
  let tick = 0;
  let announced = "";

  const btn = (text: string, onClick: () => void, primary = false): HTMLButtonElement => {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = text;
    if (primary) b.className = "gt-primary";
    b.addEventListener("click", onClick);
    return b;
  };
  const send = (op: string, extra?: Record<string, unknown>): void => {
    if (!opts.send(table, op, extra)) opts.onNotSent();
  };
  const para = (text: string, cls = ""): HTMLParagraphElement => {
    const p = document.createElement("p");
    p.textContent = text;
    if (cls) p.className = cls;
    return p;
  };
  const scores = (v: TableView): HTMLElement => {
    const ul = document.createElement("ul");
    ul.className = "gt-players";
    for (const p of [...(v.players ?? [])].sort((a, b) => b.score - a.score)) {
      const li = document.createElement("li");
      li.textContent = `${p.name}${p.answered ? " ✓" : ""}`;
      const s = document.createElement("strong");
      s.textContent = String(p.score);
      li.append(s);
      ul.append(li);
    }
    return ul;
  };
  const winnerLine = (w: string[] | undefined): string => (w && w.length ? `🏆 ${w.join(" and ")} won!` : "No winner this time: nobody scored.");

  function render(): void {
    const v = last;
    const mine = (v.players ?? []).some((p) => p.name.toLowerCase() === opts.me().toLowerCase());
    body.replaceChildren();
    window.clearInterval(tick);
    tick = 0;
    if (v.game === null) {
      body.append(para("Pick a game for everyone at this table. Anyone within 3 m can join."));
      const row = document.createElement("div");
      row.className = "gt-picks";
      const quiz = btn("🧠 Quick quiz", () => send("pick", { game: "quiz" }), true);
      const small1 = document.createElement("small");
      small1.textContent = "5 questions about ANU and Canberra";
      quiz.append(small1);
      const sketch = btn("🖍️ Sketch & Guess", () => send("pick", { game: "sketch" }));
      const small2 = document.createElement("small");
      small2.textContent = "Draw and guess; two or more players";
      sketch.append(small2);
      row.append(quiz, sketch);
      body.append(row);
    } else if (v.game === "sketch") {
      if (v.phase === "over") {
        body.append(para(winnerLine(v.winners), "gt-big"), scoresOf(v.players));
        body.append(btn("Pick another game", () => send("pick", { game: "quiz" }), true));
      } else {
        body.append(para(`${v.by ?? "Someone"} opened Sketch & Guess for this table. Open it, join, and anyone can start once two are in.`));
        body.append(btn("Open Sketch & Guess", () => opts.openSketch(), true));
      }
    } else if (v.phase === "lobby") {
      body.append(para(`Quick quiz: ${v.of ?? 5} questions, 15 seconds each, quicker right answers score more. Hosted by ${v.host}.`), scores(v));
      const row = document.createElement("div");
      row.className = "gt-picks";
      if (!mine) row.append(btn("Join the quiz", () => send("join"), true));
      else {
        row.append(btn("Start the quiz", () => send("start"), true), btn("Leave", () => send("leave")));
        if ((v.players?.length ?? 0) < 2) body.append(para("Waiting for one more person to join…", "gt-note"));
      }
      body.append(row);
    } else if (v.phase === "asking" || v.phase === "reveal") {
      const clock = document.createElement("p");
      clock.className = "gt-clock";
      const draw = (): void => {
        const ms = Math.max(0, (v.left ?? 0) - (performance.now() - sentAt));
        clock.textContent = `Question ${v.n} of ${v.of} · ${v.phase === "asking" ? `${Math.ceil(ms / 1000)} s` : "next one soon"}`;
      };
      draw();
      tick = window.setInterval(draw, 500);
      const q = para(v.question?.text ?? "", "gt-q");
      const opt = document.createElement("div");
      opt.className = "gt-options";
      const myPick = v.picks?.[[...Object.keys(v.picks ?? {})].find((k) => k.toLowerCase() === opts.me().toLowerCase()) ?? ""];
      (v.question?.options ?? []).forEach((text, i) => {
        const b = btn(text, () => {
          chosen = i;
          send("answer", { pick: i });
          render();
        });
        const picked = (v.phase === "reveal" ? myPick : chosen) === i;
        if (picked) b.classList.add("is-picked");
        if (v.phase === "reveal") {
          b.disabled = true;
          if (i === v.correct) b.classList.add("is-correct");
          else if (picked) b.classList.add("is-wrong");
        } else if (!mine || chosen !== null) b.disabled = true;
        opt.append(b);
      });
      body.append(clock, q, opt, scores(v));
      if (!mine) body.append(para("This one's already going. Wait for the next quiz to join.", "gt-note"));
    } else if (v.phase === "over") {
      body.append(para(winnerLine(v.winners), "gt-big"), scores(v), btn("Play again", () => send("pick", { game: "quiz" }), true));
    }
    if (v.game !== "quiz" || v.phase !== "asking") chosen = null;
  }
  const scoresOf = (players: { name: string; score: number }[] | undefined): HTMLElement => scores({ game: "sketch", players });
  let chosen: number | null = null;

  const hide = (): void => {
    if (root.hidden) return;
    if (table && last.game === "quiz" && (last.phase === "lobby" || last.phase === "asking")) {
      // Closing the window doesn't take you out of a quiz: you can open it again from the table (leave it with Leave).
    }
    root.hidden = true;
    window.clearInterval(tick);
    tick = 0;
    table = "";
  };
  closeBtn.addEventListener("click", hide);
  root.addEventListener("click", (e) => {
    if (e.target === root) hide();
  });
  root.addEventListener("keydown", (e) => {
    e.stopPropagation();
    if (e.key === "Escape") hide();
  });

  return {
    open(id) {
      table = id;
      last = { game: null };
      note.textContent = "";
      chosen = null;
      render();
      root.hidden = false;
      closeBtn.focus();
      send("look");
    },
    isOpen: () => !root.hidden,
    view(id, v) {
      const before = last;
      if (!root.hidden && table === id) {
        last = v;
        sentAt = performance.now();
        // A new question or phase clears what was picked.
        if (before.game !== v.game || before.phase !== v.phase || before.n !== v.n) chosen = null;
        render();
        return null;
      }
      // Window closed (or on another table): a short line for someone near who might want to join.
      const key = `${id}:${v.game}:${v.phase}:${v.n ?? ""}`;
      if (key === announced) return null;
      announced = key;
      if (v.game === "quiz" && v.phase === "lobby") return `🧠 ${v.host} is starting a quick quiz at the games table. Press E there to join.`;
      if (v.game === "sketch" && v.phase === "open") return `🖍️ ${v.by} opened Sketch & Guess at the games table. Press E there to join.`;
      if ((v.game === "quiz" || v.game === "sketch") && v.phase === "over") return `🎲 ${winnerLine(v.winners)}`;
      return null;
    },
    refused(_id, reason) {
      note.textContent = REFUSALS[reason] ?? "That didn't work.";
    },
    close: hide,
  };
}
