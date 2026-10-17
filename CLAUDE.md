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
  the dog, the classroom board, the Sketch & Guess game, the library and
  the meeting rooms (chat and files, no voice) and attached files.
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
  for notes. Authors edit their own posts and comments (same limits; they
  then say "edited"); nobody else does, not even the admin. Post text is
  Markdown, rendered without innerHTML; comments are plain text.
  Only lecturers and staff post in Notices (for now the admin),
  checked on the server; anyone reads and comments. Authors or the admin
  remove; closing a classroom removes its board. Outside COMP8020, what the
  whiteboard and the board to its right open is set by the admin only
  (https addresses), checked on the server.
- The Student Hub's board (Labs looking for students, Students looking for
  labs, Ask the Hub) and the lawn noticeboard (one tab) keep the same post
  and comment rules; anyone posts in every tab until there's a staff role.
  Which spaces have a board, their tabs and which tabs are staff-only live in
  `server/boards.ts` alone; the client draws what it's sent. Both say
  they're unofficial and that posters aren't verified. Notes keep 2 m off
  the lawn noticeboard, which lists posts as thumbnails, two a row (a
  post's first picture, or its title).
- Chat: 200 characters, the space only, gone from screens after a minute.
  Map chat (not meeting rooms') is kept one day in `chat_lines`, read only
  when someone reports a person: the server then attaches that space's last
  five minutes to the report (never text from the browser). Only the admin
  reads it, and it's deleted after a day.
- The admin can stop one person (never the admin) from sticky notes and
  their comments, board posts and their comments, chat, or coming in at
  all, for 1 hour to a year; the server checks before each, tells them
  until when, closes their sockets for "coming in", and logs every change.
- Meeting rooms (counselling rooms off the Hub, team rooms off classrooms
  and the library) hold six people at most. Team rooms are open; a
  counselling room lets in only those someone inside has invited. Both are
  checked on the server and refusals are logged. A room's chat lives in
  server memory only while someone is inside; when the room empties, its
  chat, host, invites and files go, and the last one out is warned of
  that before leaving (by the Leave button or the door). No notes in
  meeting rooms.
- Files (a bug report's screenshot, up to five on your own board post within
  a day of posting, and any shared in the meeting room you're in): png, jpg,
  gif, webp, pdf, txt, md, docx, pptx, xlsx, zip only (a screenshot an
  image), 200 MB at most, 50 a day each; the type comes from the extension,
  never the browser. They go straight from the browser to the private S3
  bucket by five-minute links the server signs for that exact size and type,
  and come back the same way, only to whoever may see them: anyone for a
  post's, the people in the room for a room's, the admin for a screenshot's.
  Kept 30 days at most (the bucket's rule, and the server stops listing them),
  a room's only until it empties. Without S3 an upload refuses with "Uploads
  aren't available right now. Please tell the admin. Error code: S3-…". The
  AWS keys are Fly secrets only, never in the repo.
- The admin's log keeps, for seven days only, what people wrote and removed
  (notes, comments, posts), sign-ins, admin actions, refusals, bug reports
  and the names of files attached, each with its IP; never chat text, moves
  or emotes, never tokens or passwords. Only the admin reads it, the
  restrictions, or the bug reports and reports about people (sent by anyone
  joined, one a minute), checked on the server. IPs and text stay out of
  stdout (`flyctl logs`).
- Everything a person does reaches only the people in the same space. The
  one exception is head counts per space (meeting rooms summed), sent to
  everyone when they change: never names or positions.
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
