# Process overview

## Crit 8: proof of life

My final project idea is a real-time 3D social space, something like a tiny
VRChat or Gather.town. That's far too much for one week, so for crit 8 I cut it
down to a single interaction that doesn't need real-time at all: pick a name,
leave one poop in a toilet, come back and find it with your name over it.

I started a few hours before the cutoff, and that shaped everything below.

## How I worked with the agent

**I wrote the plan first, by hand.** Before any code, I wrote a plan in Korean:
the concept, the one thing a stranger does, the trace they find on return,
what's out of scope, and the rules I wanted the agent to follow. The agent
reviewed it and pushed back on a few gaps I hadn't thought about: what happens
to the trace if poops expire after 24 hours, how someone recognises their own
poop if two people pick the same name, and what a stranger is allowed to type
into a public room. I made those calls myself (no expiry for now, unique names,
letters and underscores up to 8, one poop per person that moves when you poop
again) and they went straight into `CLAUDE.md` and the spec.

**Contract first, then two sessions in parallel.** With so little time, I ran
two Claude Code sessions. One built the server, database, tests and deploy; the
other built the Three.js client and found a CC0 toilet model. The server
session wrote the API contract (join, list poops, place poop) first and sent it
to the client session, so the client was built against a mock and neither side
waited. Only one session was allowed to commit, so the history stays readable.
The client session also did the browser QA: keyboard-only, a phone viewport
with real touch events, the duplicate-name case, and a reload to check the trace.

![Crit 8 work split between the Opus session (server, deploy, docs) and the Sonnet session (client, assets, QA)](diagrams/4-work-split.png)

**A correction I made.** The agent ran the spec against the live site to check
the deploy, which left three random test poops in the production database for
my pod to find. Nothing broke, but random names in a room meant for people
are noise. The spec now runs locally, and any testing on the live site goes
through one named QA visitor that's reused, so it leaves one poop, not dozens.

**Translation, not ghostwriting of the ideas.** I wrote my README in Korean and
had the agent translate it. The arguments and sources are mine; the agent's job
was clean English.

## Why this stack

![How one poop travels: browser, Hono server and SQLite on the Fly volume](diagrams/1-crit8-architecture.png)

- **3D in the browser (WebGL, Three.js).** A 3D world is the most original and
  eye-catching way into the idea. I weighed Three.js against Babylon.js and
  went with Three.js because there are far more examples to learn from, and I
  only pay for the parts I import.
- **SQLite on the Fly volume.** I need to store names and where each poop is.
  SQLite is one file and one library, no separate database server, and it fits
  Fly's free setup of one machine and one volume. Node 24's built-in
  `node:sqlite` means there's no native module to compile in Docker.
- **Hono on Node.** One small process serves the client, the API and this
  README, rendered on the server.
- **Later: real-time.** Positions and chat will go over WebSockets. In crit 9
  I'll weigh Colyseus (room-based state sync, less server code) against plain
  `ws`.

### What I ruled out

![Database choice: SQLite on the volume (chosen) vs. managed Postgres and Redis (given up)](diagrams/2-database-choice.png)

- **Postgres + Redis.** Managed versions on Fly cost money, and I want to stay
  inside the course credit. Extra processes on one machine worried me, and with
  a single server there's nothing for Redis to cache.
- **A NoSQL database.** It needs its own server process, which doesn't fit one
  machine and one volume.

![From crit 8 to the final project: REST writes now, WebSockets and in-memory positions next](diagrams/3-crit8-to-final.png)

## History

Crit 9 (crit 8's history is in the [`crit-8`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-passionleader/tree/crit-8) tag).

- [`1cb36a4`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-passionleader/commit/1cb36a4): WebSocket layer on the server: live positions in memory, poops broadcast the moment they land, last spot saved on leaving.
- [`a83202c`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-passionleader/commit/a83202c): the client shows everyone live; WASD + E to poop + Space to jump; keyboard key guide; centred cooldown notice.
- [`238efdf`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-passionleader/commit/238efdf): `docs/roles.md`, the role split between the two parallel sessions, linked from `CLAUDE.md`.
