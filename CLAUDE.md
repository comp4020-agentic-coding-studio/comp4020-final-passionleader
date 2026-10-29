# Harness — ANU Crossing (Unofficial) (was Poop Room)

The app is a small 3D, real-time social space for the ANU community, where
students and staff who rarely meet informally can bump into each other, and
anyone can ask what they don't know. It started in crit 8 as Poop Room (one
toilet, one poop each); from crit 9 it grew into ANU spaces joined by doors
(a stretch of campus outside, the Student Hub, classrooms, Chifley Library,
meeting rooms), with chat, emotes, sticky notes and boards. The
implementation order and the final project's three bundles are in
`docs/plan.md`; its numbers match the commit messages.

Read before planning or building: `README.md` (what good means for this app),
`spec/README.md` and `spec/*.test.ts` (what is enforced), and the
[final project brief](https://comp.anu.edu.au/courses/comp4020-agentic-coding-studio/assessments/final-project/).

## Rules

- When two sessions run in parallel, follow the role split and its limits in
  @docs/roles.md. Only the main session commits.
- Commit one feature at a time, small, with a message that says why. Push
  to `main` in batches, not after every commit: each push deploys.
- Write every file in this repo in English (docs, comments, commit messages).
- `PROCESS.md`, `README.md`'s argument and `reflections/` are mine and are
  written once, after the build is finished (bundle 3 in `docs/plan.md`);
  don't rewrite them while building. Keep `README.md`'s facts and its list of
  what is checked true as features land. `PROCESS.md` has no History section:
  the commit messages and the `crit-*` tags carry the history.
- Work in the current bundle of `docs/plan.md`, in its order. Big
  implementation ends Friday 30 October; from Friday 6 November only bugs,
  hotfixes, small things and the documents. The final project is due Monday
  9 November, 12:00; the deployed app must stay up through it.
- Before a push, `pnpm check` and `pnpm check:evidence` pass; after it, the
  CI run (check, deploy) is watched and the live site visited with a `qa_`
  account.
- Keep the real-time layer generic ("move", "action", "chat", per space), never
  tied to one room or one verb: the spaces and what people do in them will
  keep changing.
- When a feature replaces an old one (sticky notes replacing poops, the
  ANUSA Student Lounge replacing COMMON), say why in the commit message, so the
  final `PROCESS.md` can tell it.
- A promise in `README.md` needs a check in `spec/` or a rule here; if it
  can't be checked, README says it's judged, not enforced.

## Product rules the code must keep

- You come in by signing up with an ANU email, or as a guest. Students give
  their student number (the code goes to uNNNNNNN@anu.edu.au); staff tick
  "I'm ANU staff" and give their @anu.edu.au address (not a student number).
  A six-digit code by SES: ten minutes, five tries, one email a minute, only
  its hash kept. Then a name (1–8 letters, digits or underscores, unique
  regardless of case, not `qa_…` or `guest…`) and a password (8+, scrypt
  hash only). A forgotten password is reset by the same kind of code, and
  every other browser signs in again. Guests are `guestNNN`, their browser's
  token brings them back; they walk, chat, emote, stick notes and use team
  rooms, but posting, commenting, hearts, joining study groups, files and
  reporting someone are refused on the server (bug reports are open to
  anyone). `qa_` names are reserved for the test accounts, which sign in
  with a password. The free-name accounts from before sign-up are retired:
  their notes and posts stay, nobody can sign in as them.
- Sticky notes: up to 100 words (and 600 characters), one per person every
  30 seconds, five per person per space (a sixth replaces their oldest, after a
  warning). They disappear a month after they're stuck (the note says when);
  until then only the author or an admin removes one. Never in the Student
  Hub (but by staff) or the ANUSA Student Lounge, never inside a building's footprint outside, never
  within 2 m of a door or anything else you press E at; the server checks it.
  Comments: same text limits, one every 10 seconds, same removal rule.
  Deleting a note or a comment asks first.
- Hearts on comments (notes' and every board's): one per person, a second
  press takes it back, never on your own, checked on the server; only the
  most-hearted comment is pinned first and marked 🔥 HOT (ties: the older),
  the rest stay oldest first. A
  comment's hearts go with it. Anyone may report someone's note, post or
  comment (the person report, with who and a quote filled in).
- Classroom boards (Q&A, Notices, Board): posts up to 500 words (and 3000
  characters) with a title of up to 80, one every 30 seconds; comments as
  for notes. Authors edit their own posts and comments (same limits; they
  then say "edited"); nobody else does, not even the admin. Post text is
  Markdown, rendered without innerHTML; comments are plain text.
  Only staff (signed up as ANU staff) and the admin post in Notices,
  checked on the server; anyone reads and comments. Authors or the admin
  remove; closing a classroom removes its board. Staff and the admin open
  and close classrooms, and outside COMP8020 set what the whiteboard and
  the board to its right open (https addresses), checked on the server.
- The Student Hub's lab matching board (Labs looking for students,
  Students looking for labs), its "Ask the Hub" enquiry board, the
  study-group board beside 155's door and the advertising board keep the same
  post and comment rules; anyone signed up posts in every tab. A study group's writer sets how many people (2 to 20, them
  included); others join or leave with a button, never past that, checked on
  the server; the writer stays in until they remove the post. On "Ask the
  Hub" a writer may mark a question private: then only they and staff (and the
  admin) see it, its comments and its files, checked on the server
  for each; no other board takes private posts. Ads go after 30 days
  (hidden at once, deleted by the hourly purge, files and all), and the
  board says so. Which boards exist, their tabs, which tabs are staff-only,
  and which allow private posts or expire live in `server/boards.ts` alone;
  the client draws what it's sent. All say they're unofficial and that
  posters aren't verified. Notes keep 2 m off the advertising board (south of
  the flower bed east of Broger's) and the study-group board (beside 155's
  door), which lists posts as thumbnails, two a row (a post's
  first picture, or its title).
- Chat: 200 characters, the space only, gone from screens after a minute.
  The one exception: "/all message" reaches the chat log in every space
  outside meeting rooms (its bubble only where the sender is), once every
  30 seconds per person, never from or into a meeting room; same chat
  restriction. And "/w name message" whispers to one member who is online,
  wherever they are, members only both ends; the reader and the sender see
  it, nobody else, and it's never kept (not in `chat_lines`, so not in a
  report; the log notes who to and how long, never the text). Mute hides someone's chat, bubbles, emotes and notes on your
  own screen only (kept in your browser; the server never knows).
  Wave, yes, no and "mate" go once every two seconds at most (dance as
  often as you like), checked on the server.
  Map chat (not meeting rooms') is kept one day in `chat_lines`, read only
  when someone reports a person: the server then attaches that space's last
  five minutes to the report (never text from the browser). Only the admin
  reads it, and it's deleted after a day.
- Mail: a member writes to another member by name (subject 80, up to 1000
  characters, one every 30 seconds); only its reader sees it in their inbox
  and may delete it, its sender sees what they sent; kept 30 days. If the
  reader is online their mailbox lights up at once. The log notes that mail
  went and to whom, never what it said. Guests neither send nor receive it.
- The AI campus assistants (server/npcs.ts) answer anyone joined, guests
  too, one question every three seconds and thirty a day each, 500
  characters; fifty a day per assistant (`NPC_PER_DAY`), which is the only
  thing that caps the bill (AWS's budget only warns). They answer only from
  public ANU pages crawled into `knowledge.db` (server/crawl.ts, beside the
  app's database): the question's best few pieces from that assistant's own
  sources, with their addresses, go to the model, told to use nothing else,
  link what it used, name the academic year it answers for, and say when the
  pages don't say. No piece matches and the model is never asked: it says it
  couldn't find it and points to its pages. Courses and careers run on Claude
  Haiku, the rest on Amazon Nova 2 Lite, both on Amazon Bedrock with the S3
  keys (no new key; or Claude by `ANTHROPIC_API_KEY` when `NPC_MODEL` names
  one); no key is ever in the repo. 400 tokens at most, told it's an
  unofficial AI character and to say so if asked. What's asked goes to the
  model only: not stored, not logged (the log notes who asked which
  assistant and how long it was). Without a model, or past the day's limit,
  they say so and point to their pages; out of credit (or refused by AWS),
  they say that plainly with the author's email (NPC-CREDIT), so a marker
  knows whom to tell.
- The crawler (server/crawl.ts) reads one page at a time, at least two
  seconds apart (more if robots.txt asks), obeys the sites' robots.txt for
  `*`, names the project and the author's email in its User-Agent and never
  passes for a named AI bot. It runs with no model, by `node server/crawl.ts`
  or by the server itself once a month (production only, once a first crawl
  has been seeded); a page that fails keeps what it had.
- The Poop Room (an easter egg behind the "Staff only" door at the far end
  of Lab Coffee): in there the Q menu's first item poops instead of sticking
  a note. One poop per person, anyone joined (guests too), five seconds
  apart, a new one replacing their last; kept in SQLite 30 days (so a
  deploy doesn't sweep them away), sent only to whoever is in the room. No
  notes in it. Its door is never signposted.
- The admin can stop one person (never the admin) from sticky notes and
  their comments, board posts and their comments, chat, or coming in at
  all, for 1 hour to a year; the server checks before each, tells them
  until when, and logs every change. "Coming in" puts them out at once (back
  to the join screen, told until when). The admin can also kick someone
  once, with nothing stored, so they may come straight back; logged too.
- Roles: only the top admin (`qa_master`), on the admin PC's Roles tab,
  makes a signed-up member staff or a student again, and gives or takes the
  admin PC (the log, reports, restrictions, kicks); never their own role,
  never a guest's, every change logged, checked on the server. Someone
  given the admin PC can't restrict or kick the top admin or another holder.
  Staff and the admin may also stick notes in the Student Hub (clear of its
  doors and PCs).
- Meeting rooms (counselling rooms off the Hub, interview rooms off the
  Career Hub, team rooms off classrooms, the library and the ANUSA lounge)
  hold six people at most. Team rooms are open; a counselling or interview
  room lets in only those someone inside has invited. Both are
  checked on the server and refusals are logged. A room's chat lives in
  server memory only while someone is inside; when the room empties, its
  chat, host, invites and files go, and the last one out is warned of
  that before leaving (by the room menu's Leave, last on it, or the door;
  the menu opens on coming in and closes to an "Open Room UI" button under the
  round buttons at the top right). One exception: a member may save the chat so far (its lines, not
  the files), or the shared notes alone, for themselves only, kept 30 days
  in SQLite and then purged, at most 50 each; everyone inside is told in the
  room that they saved it. Only its owner lists,
  reads or deletes a saved chat, checked on the server. No notes in
  meeting rooms. A room also has one shared Markdown note (5000
  characters, last write wins, in server memory with the room's chat, gone
  when it empties; a saved chat takes a copy; a picture dropped in it is
  shared like any room file and goes with them), and one whiteboard: an
  Excalidraw collaboration link the server makes at random for that room
  when first asked, given only to people inside, forgotten when it empties
  (the drawing goes through Excalidraw's own encrypted relay, never ours).
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
- Test and admin accounts: `qa_master` is the top admin (e.g. creates
  classrooms, and alone changes roles); `qa_bot01`–`04` are staff, `05`–`08`
  students and `09`–`10` guests, all signing in by password, for testing each
  role. Their
  tokens never go in the repo. Live-site testing uses them only.

## Stack

Node 24 runs `server/main.ts` directly (Hono + built-in `node:sqlite`, file on
the `/data` volume). The client is Vite + Three.js in `client/`, built into
`client/dist` and served by the same process. `pnpm start` runs the server;
`pnpm check` runs `spec/` against it.
