# Harness — Poop Room

The app is a 3D toilet room where a visitor claims a name, leaves one poop, and
finds it (with their name over it) when they come back. The final project grows
it into a real-time social space; each crit is one step of that, and only that.

Read before planning or building: `README.md` (what good means for this app),
`spec/README.md` and `spec/*.test.ts` (what is enforced), and the
[final project brief](https://comp.anu.edu.au/courses/comp4020-agentic-coding-studio/assessments/final-project/).

## Rules

- Commit one feature at a time, small, with a message that says why.
- Write every file in this repo in English (docs, comments, commit messages).
- After each task I give you, add a line to the **History** section at the
  bottom of `PROCESS.md`: the commit hash (as a link) and one sentence on what
  changed. History belongs to the current crit only: when a new crit week
  starts, clear it and start again (crit 8's history is removed when crit 9
  work begins).
- Stay inside the current crit's scope. Crit 8 is proof of life: no real-time
  sync, chat, inventory, cleaning up poop, character customisation or lighting
  work.

## Product rules the code must keep

- Names are 1–8 letters or underscores, unique regardless of case. A name can
  only be reclaimed by the browser holding the token issued when it was taken.
- Each visitor has exactly one poop: a new poop moves the old one. Poops never
  expire (for now).
- The server never trusts the client's coordinates: they're clamped to the room.
- Everything works keyboard-only (arrows/WASD + Space) and on a phone (on-screen
  D-pad + Poop button).
- Third-party assets are CC0 or properly licensed, and credited in
  `client/public/assets/CREDITS.md`.

## Stack

Node 24 runs `server/main.ts` directly (Hono + built-in `node:sqlite`, file on
the `/data` volume). The client is Vite + Three.js in `client/`, built into
`client/dist` and served by the same process. `pnpm start` runs the server;
`pnpm check` runs `spec/` against it.
