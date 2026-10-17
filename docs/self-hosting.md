# Running this app on your own server (after Fly.io)

A guide for whoever brings the app back up after the course's Fly.io
machine is taken away, written for an AI coding agent to follow step by
step. The plan is one AWS EC2 instance. Everything here is a fact about the
code as of crit 10 (2026-10-17). Check it against the repo before you act
on it.

## What the app is, in one paragraph

One Node 24 process serves everything: the Vite-built Three.js client
(`client/dist`), a JSON API (Hono), a WebSocket at `/ws` (the `ws` library)
for real-time movement, chat and updates, `README.md` rendered at `/readme/`,
and the admin page at `/admin/`. Data is one SQLite file (`node:sqlite`,
WAL mode). Uploaded files go to a private S3 bucket by five-minute presigned
links, never through the server. There is no other service: no Redis, no
Postgres, no queue.

## Stack

| Part | What | Where |
|---|---|---|
| Runtime | Node **24** (runs `.ts` directly: type stripping only, so no enums, namespaces or constructor parameter properties) | `Dockerfile` pins `node:24.21.0-slim` |
| Package manager | pnpm **11** (workspace: root = server, `client/` = Vite app) | `package.json`, `pnpm-workspace.yaml` |
| HTTP | Hono + `@hono/node-server` | `server/main.ts` |
| Real-time | `ws` WebSocket server on the same port, path `/ws?token=…` | `server/realtime.ts` |
| Database | SQLite via built-in `node:sqlite`, `journal_mode=WAL`, `foreign_keys=ON`, `busy_timeout=5000` | `server/db.ts` |
| Files | AWS S3 (private bucket), `@aws-sdk/client-s3` + presigner | `server/files.ts` |
| Client | Vite + Three.js, built to `client/dist` | `client/` |
| Checks | vitest against a **running** server (`APP_URL`, default `http://localhost:8080`) | `spec/` |

## Environment variables

| Name | Needed | Meaning |
|---|---|---|
| `PORT` | yes | Port to listen on (Fly used 8080). The server binds 0.0.0.0. |
| `DATABASE_PATH` | yes in production | SQLite file path. Default `data/app.db`. Put it on a disk that survives reboots and redeploys (e.g. `/data/app.db` on an EBS volume). |
| `NODE_ENV` | recommended | `production`. |
| `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`, `S3_BUCKET` | for uploads | Without all four, uploads refuse with error code `S3-CONFIG` and everything else works. On EC2, prefer an **instance role** with the same bucket-only policy, and leave the two key variables out. The SDK picks the role up by itself, but `server/files.ts` currently checks that the key variables are set: change that check to need only `S3_BUCKET` and `AWS_REGION` when moving to a role. |
| `PROJECTS_CHECK` | optional | `0` turns off the hourly scan of classmates' `*.fly.dev` apps. After Fly is gone, set it to `0` (or point the scan elsewhere in `server/main.ts`, `ORG` / `refreshProjects`). |
| `GAME_TEST_HOOKS` | **never in production** | Test-only hooks for Sketch & Guess. |

Secrets never go in the repo. The AWS keys, if used, live only in the
server's environment (e.g. a root-only `EnvironmentFile`).

## Data: the SQLite schema

`server/db.ts` creates and migrates every table itself on start (`CREATE
TABLE IF NOT EXISTS` plus `ALTER TABLE … ADD COLUMN` for later columns), so a
new empty file just works, and an old file is upgraded in place. Times are
text: `datetime('now')` (UTC, `YYYY-MM-DD HH:MM:SS`) in older tables, ISO 8601
(`…T…Z`) in `audit`, `bug_reports`, `chat_lines` and `restrictions`.

| Table | Holds | Kept |
|---|---|---|
| `visitors` | `name` (PK, case-insensitive), `token` (browser secret, unique), `role` (`user`/`admin`), `password_hash` (scrypt, qa accounts only), `last_space`, `last_x`, `last_z`, `look` (JSON of palette indexes), rate-limit timestamps | forever |
| `notes` | sticky notes: `space`, `author`, `x`, `z`, `text` | one month |
| `comments` | comments on notes | with the note |
| `posts` | board posts: `space`, `tab`, `author`, `title`, `text` (Markdown), `edited_at` | until removed |
| `post_comments` | comments on posts, `edited_at` | with the post |
| `classrooms` | `code`, `created_by`, `board_url`, `side_url` | until the admin closes it |
| `files` | uploads: `id`, `kind` (`bug`/`board`/`room`), `owner`, `name`, `size`, S3 `key`, `post_id`/`bug_id`/`room`, `ready` | 30 days at most |
| `audit` | the admin's log: `event`, `who`, `browser` (hash of the token), `role`, `ip`, `space`, `details` (JSON), `content` | 7 days |
| `bug_reports` | bug reports and reports about people: `text`, `about`, `chat` (JSON of the last five minutes) | 28 days |
| `chat_lines` | map chat (not meeting rooms'), only for reports | 1 day |
| `restrictions` | `name`, `what` (`notes`/`posts`/`chat`/`join`), `until`, `by`, `reason` | until `until` |
| `cache` | small key–value JSON (e.g. the classmates' project list) | overwritten |

Purges run hourly in the server (`purge()` in `server/main.ts`). Live
positions and meeting-room chat are memory only and never touch the file.

**Backups.** WAL mode means the database is three files (`app.db`,
`app.db-wal`, `app.db-shm`). Never copy them while the server writes. Use
SQLite's online backup instead:

```sh
sqlite3 /data/app.db ".backup '/backup/app-$(date +%F).db'"
```

or `VACUUM INTO '/backup/app.db'` from `node:sqlite`, then upload the copy to
S3 (a separate prefix or bucket without the 30-day expiry rule).

## S3 bucket (already exists; keep using it or make a new one)

- Private: Block all public access, SSE-S3, no versioning.
- **CORS:** `PUT` and `GET`, header `content-type`, origins = the app's own
  URL(s) (it was the fly.dev URL and `http://localhost:8080`). **Add the new
  domain**, or browsers can't upload.
- **Lifecycle:** delete objects after 30 days (uploads only).
- **IAM** for the server: `s3:PutObject`, `s3:GetObject`, `s3:DeleteObject`
  on `arn:aws:s3:::<bucket>/*` only.

## Bringing it up on EC2

1. **Instance.** Ubuntu 24.04, `t4g.small` or `t3.small` (the app ran in
   256 MB on Fly; 1–2 GB leaves room for building). Attach a gp3 volume for
   `/data`, or use the root disk and take snapshots. Security group: 22 from
   your IP only, 80 and 443 from anywhere.
2. **Node and pnpm.** Install Node 24 (NodeSource or `mise`), then
   `npm install -g pnpm@11`. Node must be 24+ for `node:sqlite` and
   TypeScript stripping.
3. **Code.** `git clone` the repo, then `pnpm install --frozen-lockfile` and
   `pnpm -r --if-present build` (builds `client/dist`). Or build the
   `Dockerfile` and run the image with `-v /data:/data -p 8080:8080` and the
   env vars. The Dockerfile already sets `DATABASE_PATH=/data/app.db`.
4. **Data.** Copy the last database in, if there is one (see "Getting the
   data off Fly" below), to `/data/app.db`. Owner: the service user.
5. **Service.** A systemd unit, roughly:
   ```ini
   [Service]
   WorkingDirectory=/srv/campus
   ExecStart=/usr/bin/node server/main.ts
   Environment=NODE_ENV=production PORT=8080 DATABASE_PATH=/data/app.db PROJECTS_CHECK=0
   EnvironmentFile=/etc/campus.env   # AWS_* and S3_BUCKET, mode 600
   Restart=always
   User=campus
   ```
6. **TLS and the proxy.** Put Caddy (simplest: automatic HTTPS) or nginx in
   front, proxying to `127.0.0.1:8080`. The WebSocket upgrade on `/ws` must
   pass through: Caddy does it by itself; nginx needs
   `proxy_set_header Upgrade $http_upgrade; proxy_set_header Connection "upgrade";`.
   Keep idle timeouts above 30 s (the server pings every 25 s).
7. **Visitor IPs.** The admin's log reads the visitor's IP from the
   `Fly-Client-IP` header (`ipOf` in `server/main.ts`, and
   `server/realtime.ts` on upgrade), else the socket's address. Behind your
   own proxy that would be 127.0.0.1 for everyone. Change both places to
   read `X-Forwarded-For` (first address), set **only** by your proxy.
8. **Check it.** Start the server, then from the repo `APP_URL=https://<your
   domain> pnpm check` **only against a staging copy**: the spec creates
   visitors and posts. On the live server, open it in two browsers, walk,
   chat, stick a note, restart the service, and see that the note is still there.
9. **Accounts.** The `qa_` accounts (password sign-in, `qa_master` = admin)
   live in `visitors`. To create or reset them, run `scripts/make-accounts.ts`
   on your own machine (it writes passwords to a local file outside the repo)
   and `node scripts/seed-accounts.ts <base64>` on the server. Never commit
   passwords or hashes.

## Getting the data off Fly (do this before it's taken away)

```sh
flyctl ssh console -a comp4020-final-passionleader -C "sqlite3 /data/app.db \".backup /data/export.db\""
flyctl ssh sftp get /data/export.db ./app.db -a comp4020-final-passionleader
```

If `sqlite3` isn't on the image, run a few lines of `node:sqlite` there
instead (`db.exec("VACUUM INTO '/data/export.db'")`). The S3 bucket is
yours, so its files stay where they are.

## Things that were Fly-specific (change when moving)

- `fly.toml` and the deploy step in `.github/workflows/checks.yml`
  (`flyctl deploy`): replace with your own deploy (e.g. SSH + `git pull` +
  `pnpm build` + `systemctl restart`), or drop the deploy job.
- Auto-stop: Fly stopped the machine when idle. EC2 keeps running (costs
  more, but no cold start).
- `Fly-Client-IP`, see step 7.
- The classmates' project list scans `https://<repo>.fly.dev/`, see `PROJECTS_CHECK`.
- S3 CORS origins, see above.
- `scripts/reset-db.ts` and `seed-accounts.ts` comments say `flyctl ssh
  console`. On EC2, run them directly with `DATABASE_PATH` set.

## Rules that still hold (from CLAUDE.md)

Only `qa_` accounts for live testing; `GAME_TEST_HOOKS` never in production;
no secrets in the repo; positions are never written per move; chat in
meeting rooms is never stored; the admin's log keeps seven days and never
chat text or tokens. Read `CLAUDE.md` before changing behaviour.
