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
- `PROCESS.md` has no History section: it must stay within 900–1100 words,
  and the commit messages and the `crit-*` tags already carry the history.
  Rewrite `PROCESS.md` at each crit so it describes the project as it stands.
- Stay inside the current crit's scope. Crit 10 is the "Crit 10" section of
  `docs/plan.md`: the server log, classrooms the admin opens, links in an
  in-app window, then (pulled forward while there's budget) the east road,
  the dog, the classroom board, the Sketch & Guess game and the library.
  Everything else in the plan is out until its crit.
- Keep the real-time layer generic ("move", "action", "chat", per space), never
  tied to one room or one verb: the spaces and what people do in them will
  keep changing.
- When a feature replaces an old one (sticky notes replacing poops), say why
  in the commit message and in `PROCESS.md`.
- A promise in `README.md` needs a check in `spec/` or a rule here; if it
  can't be checked, README says it's judged, not enforced.

## Product rules the code must keep

- Names are 1–8 letters, digits or underscores, unique regardless of case. A
  name can only be reclaimed by the browser holding the token issued when it
  was taken. `qa_` names are reserved for the password accounts.
- Sticky notes: up to 100 words (and 600 characters), one per person every
  30 seconds, five per person per space (a sixth replaces their oldest, after a
  warning). They disappear a month after they're stuck (the note says when);
  until then only the author or an admin removes one. Never in the Student
  Hub, never inside a building's footprint outside, never within 2 m of a door
  or anything else you press E at; the server checks it.
  Comments: same text limits, one every 10 seconds, same removal rule.
- Classroom boards (Q&A, Notices, Board): posts up to 500 words (and 3000
  characters) with a title of up to 80, one every 30 seconds; comments as
  for notes. Only lecturers and staff post in Notices (for now the admin),
  checked on the server; anyone reads and comments. Authors or the admin
  remove; closing a classroom removes its board.
- Chat is never stored: 200 characters, the space only, gone from screens
  after a minute.
- Everything a person does reaches only the people in the same space.
- The server never trusts the client's coordinates: they're clamped to the room.
- Everything works keyboard-only (WASD move, Space jump, E use, hold Q menu,
  Enter chat) and on a phone (D-pad + Menu, Jump and Use buttons).
- Live positions stay in server memory and are never written per move; a
  visitor's space and spot reach SQLite only when their socket closes.
- Spaces' bounds live in both `server/spaces.ts` and `client/src/spaces/`;
  change them together.
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
