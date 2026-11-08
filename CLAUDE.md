# Harness — ANU Crossing (Unofficial) (was Poop Room)

The app is a small 3D, real-time piece of the ANU campus where students, staff
and academics meet by chance, and anyone can ask what they don't know. It
started in crit 8 as Poop Room (one toilet, one poop each); it is now the
campus between 155 and 154 with its surroundings from OpenStreetMap, the
Student Hub, the ANUSA lounge, the Career Hub, Chifley Library, classrooms and
meeting rooms, with chat, whispers, mail, voice, emotes, sticky notes, boards,
shared notes and AI campus assistants that answer from ANU's own pages. The
implementation order and the final project's three bundles are in
`docs/plan.md`; its numbers match the commit messages.

Read before planning or building: `README.md` (what good means for this app),
`spec/README.md` and `spec/*.test.ts` (what is enforced), and the
[final project brief](https://comp.anu.edu.au/courses/comp4020-agentic-coding-studio/assessments/final-project/).
The architecture is drawn in `diagrams/8`–`12` (browser, server and AWS; the
whole server; the AWS side and its IAM user; voice on the author's t4g.small EC2;
email sign-up) and the big decisions are in `docs/decisions/`. Keep both true
when a flow changes.

## Rules

- When two sessions run in parallel, follow the role split and its limits in
  @docs/roles.md. Only the main session commits.
- Commit one feature at a time, small, with a message that says why. Push
  to `main` in batches, not after every commit: each push deploys.
- Write every file in this repo in English (docs, comments, commit messages).
- `PROCESS.md`, `README.md`'s argument and `reflections/` are mine and are
  written once, after the build is finished (bundle 3 in `docs/plan.md`; the
  README's argument was written on 8 November); don't rewrite them while
  building. Keep `README.md`'s facts and its list of
  what is checked true as features land. `PROCESS.md` has no History section:
  the commit messages and the `crit-*` tags carry the history.
- Work in the current bundle of `docs/plan.md`, in its order. Big
  implementation ended on Friday 30 October; from Friday 6 November only bugs,
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
  every other browser signs in again. Guests are `guestNNN` (then
  `guestNNNN`), their browser's token brings them back; they walk, chat,
  emote and use team rooms, but sticky notes, posting, commenting, hearts,
  joining study groups, files and reporting someone are refused on the
  server (bug reports are open to anyone). A guest leaves as little as
  possible in the database: their row (name and token) only, gone a day
  after they were last seen; their spot and look aren't saved. A newcomer, and a guest every
  time, comes in at the middle of the lawn, and after a first walk the
  tutorial sends them to the library and Robin; someone in a classroom that
  closes comes back outside, by 155's door. Signing in by
  student number or email never says whether that address has an account,
  and ten wrong passwords from one address for one name mean a fifteen-minute
  wait. `qa_` names are reserved for the test accounts, which sign in
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
  Three different members reporting the same note, post or comment within 24
  hours hide it at once for everyone except its author (who is told) and the
  admin; two don't, and one person reporting twice counts once. The admin
  page's "Hidden, awaiting review" lists them with Restore (back for everyone,
  and it stays) and Remove (deleted); both are checked on the server and
  logged (`item-hidden`, `item-restored`, and the usual removal event).
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
  often as you like), checked on the server. Chat and emote gaps count per
  person, not per tab. In the chat box, the up arrow brings back your last
  line and "/r message" answers whoever whispered last (made into "/w" in
  the browser, so the server's whisper rules hold); both are forgotten on
  the join screen. A line that can't go (reconnecting) says so. A tab in the
  background shows a count of new whispers, mail and invites in its title.
  Map chat (not meeting rooms') is kept one day in `chat_lines`, read only
  when someone reports a person: the server then attaches that space's last
  five minutes to the report (never text from the browser). Only the admin
  reads it, and it's deleted after a day.
- Mail: a member writes to another member by name (subject 80, up to 1000
  characters, one every 30 seconds); only its reader sees it in their inbox
  and may delete it, its sender sees what they sent; kept 30 days. If the
  reader is online their mailbox lights up at once. The log notes that mail
  went and to whom, never what it said. Guests neither send nor receive it.
  A half-written note, post or mail is kept in the browser (one draft per
  place, board tab or the mail form; a reply to someone else leaves a draft
  for another person alone) and cleared when it's sent or on signing out.
  A board's search box and "Unanswered only" (Q&A) only narrow the posts
  already fetched; nothing new is asked of the server.
- Events timetable: a signed-up member puts an event on with a title (up to
  80 characters, the board posts' text rules), a place (any space but a
  meeting room or the Poop Room), a start in Canberra time within the next 30
  days (never in the past) and a length of 15 to 180 minutes; one every 30
  seconds, five that haven't ended per person; guests only read. The author or
  the admin removes it; one that has ended is deleted by the hourly purge.
  "Coming up" (the next five) is on the join screen and in the Campus Guide, a
  banner in the place says "Now: <title> (until hh:mm)" while it's on, and the
  minimap shows a star; the list is fetched again every minute, nothing is
  pushed to other screens. All checked on the server (`server/events.ts`).
- Visit stamps: a signed-up member earns a stamp the first time the server
  lets them into each kind of main space (outside, the Student Hub, the
  library, the ANUSA lounge, the Career Hub, any classroom as "a classroom",
  any team room as "a team room", the Poop Room: eight) and sees "New stamp:
  <place> (n/8)"; a "Stamps" card in the look window shows them, with the Poop
  Room's unnamed ("A secret place") until found. Stored per account in SQLite,
  granted only when the server accepts an "enter", never on the client's word;
  guests get none; counselling and interview rooms give none.
- Look rewards: three existing choices wait for stamps (`LOOK_UNLOCKS` in
  `server/db.ts`): the hat colours purple and green at 3, the helmet at 8. The
  server refuses a locked choice (`PUT /api/look`, 403, logged) and the look
  window shows a lock and "n more stamps"; a choice already saved stays
  allowed, and `QA_HAT` is still for `qa_` accounts only whatever the stamps.
- The AI campus assistants (server/npcs.ts) answer anyone joined, guests
  too, one question every two seconds and thirty a day each, 500
  characters; fifty a day per assistant (`NPC_PER_DAY`), which is the only
  thing that caps the bill (AWS's budget only warns). They answer only from
  public ANU pages crawled into `knowledge.db` (server/crawl.ts, beside the
  app's database): the question's best pieces from that assistant's own
  sources (eight; a small source whole; a course asked by its code, its own
  page whole), with their addresses, go to the model, told to use nothing
  else (its own words allowed, no outside facts), link each page once, name
  the academic year it answers for, and say when the pages don't say. No piece matches: the model gets no sources and a brief that
  allows no facts at all: a hello or "what can you do?" gets an
  introduction and example questions, anything else "I couldn't find that
  in my pages" and its links. A question in another language is first
  turned into English search words by the cheap model (the pages are
  English); the reply's language is named in the brief from the question's
  letters (Hangul Korean, Latin English…). The window shows "Thinking…"
  while it waits. Taylor (Computing & IT, standing between the Hub's office
  pods) reads ANU's IT pages; Riley (getting around Canberra, behind the
  ANUSA counter opposite Sam) reads ANU's transport and safety pages and
  Transport Canberra's, and only for a food or grocery question also
  ANUSA's pages; it says the pages name no particular supermarket rather
  than guess one. Courses, careers and accommodation run on Claude
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
  apart, a new one replacing their last; a member's kept in SQLite 30 days
  (so a deploy doesn't sweep them away), a guest's in server memory only;
  sent only to whoever is in the room. No
  notes in it. Its door is never signposted; the only clue is Seongsu, the
  author's ghost by Badger & Co, who tells anyone who talks to him.
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
  room is opened only by staff (the admin included), and then lets in only
  those someone inside has invited, which is how a student comes in; the invitee, if on
  campus, is asked at once (Accept takes them straight in; they can be asked
  again, once every ten seconds), and an invitation is good for one visit. Both are
  checked on the server and refusals are logged. A room's chat lives in
  server memory only while someone is inside; when the room empties, its
  chat, host, invites and files go, and the last one out is warned of
  that before leaving (by the room menu's Leave, last on it, or the door;
  the menu opens on coming in and closes to an "Open Room UI" button under the
  round buttons at the top right). One exception: a member may save the chat so far (its lines; of
  the files, only the pictures the shared notes show), or the shared notes
  alone, for themselves only, kept 30 days
  in SQLite and then purged, at most 50 each; everyone inside is told in the
  room that they saved it. Only its owner lists,
  reads or deletes a saved chat, checked on the server. No notes in
  meeting rooms. A room also has one shared Markdown note (5000
  characters, rendered live as you type: on a wide screen source and
  rendering side by side, on a phone the rendering, a tap editing that
  block; leaving the field sends at once, and someone else's edit waits
  behind "load their version" while you type; last write wins, in server
  memory with the room's chat, gone
  when it empties; a saved chat takes a copy; a picture dropped in it is
  shared like any room file and goes with them), and one whiteboard: an
  Excalidraw collaboration link the server makes at random for that room
  when first asked, given only to people inside, forgotten when it empties
  (the drawing goes through Excalidraw's own encrypted relay, never ours).
  While a room's window is open, notices (a saved chat, the mic) show in a
  card over it. A room has one Focus timer, shared by everyone inside (25
  minutes of work, then 5 of break; anyone inside starts, pauses, resets or
  moves it by five minutes, within a minute and an hour, once a second each;
  in server memory with the room, gone when it empties). The menu runs: chat,
  shared notes, mic, whiteboard, share screen, the video, then the rest.
- A room's shared viewing screen (room menu, "Show a video to the room",
  `server/video.ts`): a member pastes an https YouTube or Vimeo link; the
  server accepts only those sites' own addresses, keeps just the provider and
  video id (never the pasted text), and refuses anything else. Play, pause and
  seek go through the server, the last one wins, at most one a second per
  person, and the room is told where the video is now (never a clock). Only
  people inside get it; it lives in the room's memory and goes when the room
  empties. The players are the sites' own IFrame APIs, so watching reaches
  YouTube or Vimeo (the room's other things never do). "Open in a new
  window" opens the same video on its own site from where the room is, for
  that person alone and not kept in step.
- Voice (through the author's LiveKit server on a t4g.small EC2; never recorded, never
  through this app): the server gives a ticket (a LiveKit token signed with
  the Fly secret, two minutes, so it is only good for joining now) only for the voice of where you are now: a
  meeting room's voice only to someone inside it this sitting (so its cap
  and invites hold), the open voice outside (hold V, on a computer; quieter
  with distance, silent past 18 m) only to someone outside. Everyone there
  hears without doing anything; to be heard, the room menu's Mic switch in
  a room, or hold V outside. Leaving the place ends it; the Voices volume
  at 0 turns it off. Muting someone silences their
  voice too. The chat restriction stops voice as well. Whoever is speaking
  shows a mic on their name tag. The log notes who joined which voice,
  never what was said.
- Games table (the Student Hub's table, `server/tables.ts`): anyone within 3 m
  may open it and pick a quick quiz (five questions drawn from the fixed list
  in `server/quiz.ts`, about places and dates the app's own pages state; 15
  seconds each, the right answer never sent before the reveal) or open Sketch
  & Guess. The server keeps the score and tells the table who won, and only
  people near it hear of the game or may act on it. In server memory, gone
  when the game ends; the log notes who started which game, nothing else.
- Screen sharing (room menu, "Share screen"): through the same LiveKit
  voice as the room, so the same room and the same six-person cap hold. Only a
  meeting room's ticket allows it (`canPublishSources`: microphone, screen
  share and its sound; never the camera), the open voice outside allows the
  microphone only. Others see the share in the room window's Shared screen
  view; it ends when the sharer stops, leaves, or the room's voice does. Never
  recorded, never through this app. Without voice (no LiveKit, Voices volume
  at 0, a browser that can't capture) the button says why. Not testable
  without a LiveKit server: judged by people.
- Files (a bug report's screenshot, up to five on your own board post within
  a day of posting, and any shared in the meeting room you're in): png, jpg,
  gif, webp, pdf, txt, md, docx, pptx, xlsx, zip only (a screenshot an
  image), 200 MB at most, 50 a day each; the type comes from the extension,
  never the browser. They go straight from the browser to the private S3
  bucket by five-minute links the server signs for that exact size and type,
  and come back the same way, only to whoever may see them: anyone for a
  post's, the people in the room for a room's, the admin for a screenshot's.
  Kept 30 days at most (the bucket's rule, and the server stops listing them),
  a room's only until it empties, except a picture someone's saved notes
  show: that stays for the saver alone (only they may fetch it, checked on
  the server) until the bucket's 30 days or until they delete the copy.
  Without S3 an upload refuses with "Uploads
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
  everyone when they change: never names or positions. "Who's here"
  (pressing the online line) lists by name only the people in your own
  space, whose name tags you can already see; elsewhere, the counts.
- A status beside your name ("Happy to chat", "Studying", "Away", or none)
  is one of those three values, never free text, at most one change every
  two seconds, checked on the server; kept in server memory with the
  socket (and in your browser), shown to your space only.
- "Tell me when they're on": a member follows up to 20 other members by name
  (from Who's here), kept in SQLite; when one comes onto the campus (no other tab
  already open) the follower gets one notice, "<name> is on the campus (in <space
  name>)", never a position, a meeting room only "a room", at most once every ten
  minutes per person. Members at both ends. By default only mutual follows are
  told; the followed person may allow anyone who follows them in Settings. Checked
  on the server; nobody is shown who follows them.
- Office hours: only staff and the admin open them (optionally naming one of the Hub's
  counselling rooms), checked on the server and logged when refused; they last
  while the staff member is online. An "Office hours" badge shows on their name
  tag and the Student Hub's people see "Office hours now: <name>" in Who's here
  (a name and a room number, never a position). A signed-up student in the Hub
  may "Knock": the staff member alone gets the counselling-room invitation
  prompt (they invite from inside a counselling room), at most one knock per
  student per staff member a minute.
- Interest tags: a member shows at most three, picked from a fixed list the server
  owns (course codes and fifteen interests, `server/social.ts`), never typed;
  anything off the list is refused on the server, they are kept with the account
  and shown only to the people in the same space (name tag, Who's here). Guests
  have none.
- Outside follows Canberra's time of day (client only: sky, sun, lamps;
  indoors only the sun's shafts go at night, the windows stay as they are); `?hour=` shows another hour for checking.
- Outside also follows Canberra's weather: the server asks Open-Meteo (public
  data, nothing about any visitor goes out) at most every 15 minutes, keeps it
  in memory and the cache table and serves it at `/api/weather`; start-up never
  waits for it and a failed fetch means clear. Cloud greys and dims the sky,
  rain adds light rain on Medium and High (none with Reduce motion) and a
  darker tone, wind sways the grass harder. Settings shows a "Weather" line;
  `?weather=rain|cloud|clear` shows one for checking.
- Familiar places (README): the spaces follow the real campus. Buildings,
  paths, the creek and the scenery past the edges keep their OpenStreetMap
  positions (one scale and turn, 0.742 and -35.8°, as in
  `client/src/spaces/osmscape.ts`), and each space is laid out from the
  author's own photos and drawings. A new space or move is checked against
  them, not made up. This is judged by people, not by the spec.
- A place to rest, not a work screen (README): calm music by default (the
  sound settings can turn it down or off), soft game-like art in the app's
  ivory and brown UI, and no productivity-tool look (no dashboards, no
  notification badges beyond mail and invites). Judged by people, not by the spec.
- Easy for shy people (README): a newcomer can wave, emote or leave a note
  before saying anything, and nothing forces chat or voice (voice starts
  muted; the mic or V is the person's own choice). Judged by people, not by
  the spec.
- Running for real: an error in one message or on leaving is caught and
  logged (name and message only) and the one shared server keeps running;
  WebSocket frames over 64 KB and API bodies over 256 KB are refused;
  every response says nosniff, frame-ancestors 'self' and a strict referrer
  policy; the built files go gzipped, hashed bundles cached a year. Reduce motion (in Settings) is
  off until ticked. The Credits page opens with who made it and the README's
  argument, read from README.md each time.
- The server never trusts the client's coordinates: they're clamped to the room.
- Describe what's around me (Settings, Accessibility; off until ticked, kept
  in this browser) is for screen-reader users and works by keyboard alone: an
  aria-live region says the nearest doors, assistants, boards and seats with
  direction and distance in plain words ("Library door, 4 metres ahead-left"),
  every few seconds while you move; L lists the people in your own space by
  name and rough direction (never anyone elsewhere); G walks you to the
  nearest usable thing a step at a time through the normal movement (same
  speed, walls and server clamping), never a teleport, and any movement key,
  jump or E stops it. The secret door is never described.
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
