# 002: Who may see and change what, checked on the server

Status: accepted (crit 10)

![The whole architecture as of crit 10: browsers, one Fly machine with the server and SQLite, and the private S3 bucket](../../diagrams/6-crit10-architecture.png)

## Context

This week I worked on permissions. Many people now act on the same boards,
rooms and files at once, and the app is meant for students, staff and
academics meeting informally. That only works if people trust it: a
counselling room has to stay private, a notice has to come from staff, and
someone who swears at people has to be stoppable.

Hiding a button isn't enough. Anyone can call the API directly, so the
browser can't be the one that decides. Every rule below is checked by the
server on each request, and a refusal is answered with a 403 and written to
the log.

The accounts fall into four kinds: guest (planned), ordinary user, ANU staff
(planned), and the server admin. Today only two exist: ordinary users and
one admin account (`qa_master`). A person is a name plus the browser that
took it, so two people in two Chrome profiles are two different people in
the log, even if one of them types a name the other used.

The questions:

1. Who can see the log and the reports?
2. Who can post where, and who can change or remove what someone else wrote?
3. Who can get into a meeting room, and who sees what's shared there?
4. Who can open an uploaded file, and what can the server itself do in AWS?

## Options

- A. Check only in the client: hide what people shouldn't press. Quick, but
  anyone with curl gets around it.
- B. Check on the server, per request: the visitor's role, whether they wrote
  the thing, whether they're inside the room.
- C. Something heavier: real ANU sign-in, or per-space moderators. Better
  identity, but ANU sign-in isn't available to a student app, and moderators
  need a staff role that doesn't exist yet.

## Decision

**B**, with these rules:

- **Only the admin reads the log and the reports.** The log keeps, for seven
  days, IP, username and what each person did (notes, comments and posts
  with their text, sign-ins, refusals, admin actions), but never chat text.
  Reports about bugs and about people come with the browser and OS, and a
  report about a person carries that space's last five minutes of chat,
  attached by the server, never sent by the browser. Ordinary users are
  strictly kept out: only the admin account can use the admin PC in the
  Student Hub, and the API behind it refuses everyone else.
  [9fe0e7f](https://github.com/comp4020-agentic-coding-studio/comp4020-final-passionleader/commit/9fe0e7f),
  [919fbc5](https://github.com/comp4020-agentic-coding-studio/comp4020-final-passionleader/commit/919fbc5)
- **The admin can stop a person** from notes, posts, chat or coming in at all,
  for an hour up to a year. The server checks before each action, tells
  them until when, and logs every change.
  [919fbc5](https://github.com/comp4020-agentic-coding-studio/comp4020-final-passionleader/commit/919fbc5)
- **Only the admin opens and closes classrooms** and sets what their boards
  open. Staff will do this too, once there is a staff role.
  [fb17501](https://github.com/comp4020-agentic-coding-studio/comp4020-final-passionleader/commit/fb17501)
- **Notices are staff-only; the other tabs are open to anyone.** Which tabs
  are staff-only lives in one server file, and the client only draws what it's
  sent.
  [ea18534](https://github.com/comp4020-agentic-coding-studio/comp4020-final-passionleader/commit/ea18534),
  [f13eaef](https://github.com/comp4020-agentic-coding-studio/comp4020-final-passionleader/commit/f13eaef)
- **Only the author edits; the author or the admin removes.** The admin can
  take a post down, but never put words in someone's mouth.
  [a1eabc5](https://github.com/comp4020-agentic-coding-studio/comp4020-final-passionleader/commit/a1eabc5)
- **A meeting room holds six; a counselling room lets in only those someone
  inside has invited.**
  [ed5d0ef](https://github.com/comp4020-agentic-coding-studio/comp4020-final-passionleader/commit/ed5d0ef)
- **Files go only to those who may see them.** Attachments live in a private
  S3 bucket. Depending on where they were shared, they're public (a board
  post's) or for the people inside the room only (a meeting room's); a bug
  report's screenshot is for the admin. The server signs a five-minute link
  for each upload and download, and nothing reaches the bucket directly.
  [606b59d](https://github.com/comp4020-agentic-coding-studio/comp4020-final-passionleader/commit/606b59d)
- **The server's own AWS access is the least it needs.** I created an IAM
  user for the server myself, whose policy allows only reading, writing and
  deleting objects in that one bucket. Its keys live only in Fly secrets.
- **Every refusal is logged**, with the reason, so that I can narrate from
  the log alone who tried what and what the server said.
  [114ae4f](https://github.com/comp4020-agentic-coding-studio/comp4020-final-passionleader/commit/114ae4f)

## Trade-offs

- **Nobody is verified.** A student number isn't checked against ANU, so
  every board says it's unofficial and that posters aren't verified. Email
  sign-up is planned for the final project.
- **"Staff" is one admin account.** Nothing tells a lecturer from a student
  yet, so only the admin posts notices and opens classrooms.
- **The admin sees IP addresses**, for seven days. That's privacy given up to
  trace abuse, which is why the log deletes itself after a week.
- **Map chat is kept a day** so a report can carry it. This changed decision
  001's "chat is never kept";
  [919fbc5](https://github.com/comp4020-agentic-coding-studio/comp4020-final-passionleader/commit/919fbc5)
  narrowed it to map chat, read only for a report.
- **One machine holds everything.** The server and the database run as one
  process on one Fly machine, and that machine faces the internet. Anyone who
  broke into the server would have the database too, and could corrupt or
  leak it. If this grows into a real project, the database should move to
  a machine nothing outside can reach. The S3 bucket, at least, can't be
  reached from outside without a link the server signed.
- **One bucket for every kind of file.** Board post attachments, room files and
  bug screenshots share a bucket. Files that need more secrecy should get their
  own bucket later.

## How it's checked

- `spec/admin.test.ts`: the log is refused to someone who hasn't joined and to
  an ordinary visitor; restrictions are refused to anyone but the admin; the
  chat a report carries can't come from the browser.
- `spec/classrooms.test.ts`: an ordinary visitor can't open or close a
  classroom, or set what its boards open.
- `spec/board.test.ts`: anyone asks in Q&A but can't post a notice; only the
  author edits or removes.
- `spec/rooms.test.ts`: the seventh person is turned away; a counselling room
  keeps to the people invited.
- `spec/files.test.ts`: files only on your own report or post, or from inside
  a meeting room; nothing that isn't there is handed out.
- The rehearsal (see `PROCESS.md`): two people in two browsers, told apart in
  the admin's log, and a report about one of them read with its chat.
