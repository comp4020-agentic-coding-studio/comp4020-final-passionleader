# Roles between parallel sessions

I usually run two Claude Code sessions at once: a **main** session and a
**helper** session. Each role below belongs to exactly one of them, so two
sessions never edit the same file or argue about who decides.

Two sessions is the default. A third costs a cold start and another set of
hands on the same files, and the coordination it needs eats the time it saves.
I only open a short-lived third session for a one-off job with no file
overlap (a big QA sweep, an asset hunt), and close it when it reports.

## Main session: Opus

| Role | What it covers |
|---|---|
| PM / integrator | Splits the work, writes each task for the helper, decides the API contract and file layout, merges the helper's slices |
| Backend and real-time | `server/`: routes, validation, SQLite, the WebSocket layer and its protocol |
| Frontend core | `client/src/main.ts`, `net.ts`, `api.ts`, `world.ts`, `index.html`, `style.css` |
| DevOps | Dockerfile, deploys (CI once public), database resets and backups, checking the live site after each deploy |
| Observability | Server-side logging and any live activity view (crit 10) |
| Docs and harness | Keeps README facts, `CLAUDE.md`, `docs/`, decision records and the `PROCESS.md` history current; translates my drafts. The arguments in README, PROCESS and reflections are mine |
| Reviewer | Reads every slice the helper hands over before it is committed |
| **Committer** | **The only session that runs `git add`, `commit`, `push` or tags** |

Effort: **high** by default; **xhigh** for real-time design, sync bugs and
anything touching production data; **medium** for doc edits and small fixes.

## Helper session: Sonnet

| Role | What it covers |
|---|---|
| Design and assets | Finding CC0/licensed models, sounds and images, crediting them in `client/public/assets/CREDITS.md` |
| UI pieces | Self-contained modules the main session asks for (like `client/src/keyguide.ts`), against an API the main session specifies |
| QA and testing | Headless-browser checks on the local server: two browsers side by side, desktop and phone viewports, keyboard-only, console errors, screenshots |
| Accessibility and responsive checks | Keyboard-only play, touch controls, resizing mid-use, the things markers try |
| Security and privacy checks | Read-only review: input limits, token handling, nothing secret in the tree |

Effort: **medium** by default; **low** for mechanical jobs (renaming, moving
assets, re-running a known QA script).

Hard limits for the helper:

- Create or edit only the files the main session names in the task. Nothing
  else, ever, and never `git` commands, deploys or `flyctl`.
- Test against `http://localhost:8080` only. Never send test traffic to the
  `*.fly.dev` URL.

## Commits

One session commits (the main one), so the history reads as one story and two
sessions never race on the index. The helper hands over a finished slice with
the list of files it touched; the main session reviews it, commits it with a
message that says it came from the helper session, and adds the
`PROCESS.md` history line.

## Handoffs

- **Main → helper:** the task, the exact files it may create or edit, the API
  it must match, how to check it (`npx tsc --noEmit`, what to screenshot), and
  a time to report back.
- **Helper → main:** done / not done, the files it changed, test results per
  item, console errors, screenshot paths, and anything it noticed outside its
  task (reported, not fixed).

## Testing the live site

Only the main session touches production, and only as the pre-made test
visitors (`qa_bot01`–`qa_bot10`, plus `qa_master` for admin-only actions):
realistic visits, never the spec suite, so the rooms people see aren't filled
with random test names. The tokens live outside the repo.

## This week's split

What each session is doing in the current crit is listed in `docs/plan.md`.
