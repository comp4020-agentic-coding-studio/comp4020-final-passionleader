# Harness — ANU virtual campus (was Poop Room)

The app is a small 3D, real-time social space for the ANU community, where
students and staff who rarely meet informally can bump into each other. It
started in crit 8 as Poop Room (one toilet, one poop each); from crit 9 it
grows into a few ANU spaces joined by doors (a stretch of campus outside,
the Student Hub, a classroom), with chat, emotes and sticky notes. Each crit
is one step of that, and only that. The implementation order and this week's
cut are in `docs/plan.md`.

Read before planning or building: `README.md` (what good means for this app),
`spec/README.md` and `spec/*.test.ts` (what is enforced), and the
[final project brief](https://comp.anu.edu.au/courses/comp4020-agentic-coding-studio/assessments/final-project/).

## Rules

- When two sessions run in parallel, follow the role split and its limits in
  @docs/roles.md. Only the main session commits.
- Commit one feature at a time, small, with a message that says why.
- Write every file in this repo in English (docs, comments, commit messages).
- After each task I give you, add a line to the **History** section at the
  bottom of `PROCESS.md`: the commit hash (as a link) and one sentence on what
  changed. History belongs to the current crit only: when a new crit week
  starts, clear it and start again (crit 8's history is removed when crit 9
  work begins).
- Stay inside the current crit's scope. Crit 9 is steps 1–9 of
  `docs/plan.md` (accounts, spaces, doors, three maps, chat, the Q emote menu,
  sticky notes); step 10 (server logging) only if there's time. Everything
  later in the plan is out until its crit.
- Keep the real-time layer generic ("move", "action", "chat", per space), never
  tied to one room or one verb: the spaces and what people do in them will
  keep changing.
- When a feature replaces an old one (sticky notes replacing poops), say why
  in the commit message and in `PROCESS.md`.
- A promise in `README.md` needs a check in `spec/` or a rule here; if it
  can't be checked, README says it's judged, not enforced.

## Product rules the code must keep

- Names are 1–8 letters or underscores, unique regardless of case. A name can
  only be reclaimed by the browser holding the token issued when it was taken.
- Each visitor has exactly one poop: a new poop moves the old one. Poops never
  expire (for now). One poop per visitor every 5 seconds, enforced on the server.
  (Until sticky notes replace poops in crit 9; then this rule moves to notes.)
- The server never trusts the client's coordinates: they're clamped to the room.
- Everything works keyboard-only (WASD to move, E to poop, Space to jump) and on
  a phone (on-screen D-pad + Jump and Poop buttons).
- Live positions stay in server memory and are never written per move; a
  visitor's spot reaches SQLite only when their socket closes.
- Third-party assets are CC0 or properly licensed, and credited in
  `client/public/assets/CREDITS.md`. Photos and satellite images of real
  buildings are modelling references only: never shipped in the app or the repo.
- This is not an official ANU service: no ANU logos or official styling, and
  any board that looks like an ANU channel says it's unofficial and that
  posters' identities aren't verified.
- Test and admin accounts: `qa_master` is the only admin (e.g. creates
  classrooms); `qa_bot01`–`qa_bot10` are ordinary users for testing. Their
  tokens never go in the repo. Live-site testing uses them only.

## Stack

Node 24 runs `server/main.ts` directly (Hono + built-in `node:sqlite`, file on
the `/data` volume). The client is Vite + Three.js in `client/`, built into
`client/dist` and served by the same process. `pnpm start` runs the server;
`pnpm check` runs `spec/` against it.
