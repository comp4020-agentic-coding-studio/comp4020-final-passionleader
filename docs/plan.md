# Plan

Where the app is going, in the order I'll build it. Earlier steps are what
later ones stand on. Each crit takes a slice; the brief for each crit still
decides what that week is marked on.

## Direction

A small 3D, real-time social space for the ANU community. The problem I care
about: students and staff (especially academics) almost never meet
informally, so finding a supervisor, or a student for a lab, depends on luck.
The space gives them somewhere to bump into each other: a stretch of campus
outside, the Student Hub, classrooms named after courses (e.g. `COMP8020`),
joined by doors. It is not an official ANU service and never looks like one.

Started in crit 8 as Poop Room: one toilet, one poop each. The real-time
layer from crit 9 carries over unchanged; the toilet and the poop don't.

## Implementation order

✅ = done.

**Foundation**

0. ✅ Real-time positions and actions over WebSocket
   ([`1cb36a4`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-passionleader/commit/1cb36a4),
   [`a83202c`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-passionleader/commit/a83202c))
1. ✅ Test and admin accounts: `qa_master` (admin) and `qa_bot01`–`qa_bot10`
   (ordinary users), created by a script; a role column in the database
2. ✅ Spaces: the server keeps one channel per space, so you only see and hear
   people in the same space
3. ✅ Doors: press E at a door to load another space (only one space rendered at
   a time)

**Maps**

4. ✅ A stretch of campus outside: the Marie Reay Teaching Centre (155) and the
   Brian Kenyon Student Space, and the path between them, modelled from
   reference photos and OpenStreetMap outlines (credited)
5. ✅ Student Hub interior (door in the Brian Kenyon Student Space)
6. ✅ `COMP8020` classroom (door in building 155)

**Talking**

7. ✅ Chat: Enter to type, a speech bubble over your figure, a chat log at the
   bottom left; messages disappear after a minute
8. ✅ Q emote menu (a radial picker): wave, yes / no, "How ya doing mate", dance
9. ✅ Sticky notes (replacing poops): stick one from the Q menu, read with E,
   kept per space

**Crit 10 requirement**

10. Server-side structured log of every action (who, what, when) and a live
    view of activity

**Boards**

11. Classrooms: only `qa_master` creates them (course-code names); rows older
    than six months are deleted; a question board per class
11b. Classroom showcase board beside the whiteboard: links to classmates'
    live final projects (public `comp4020-final-*` repos → their `fly.dev`
    URLs, only ones that answer), and a guestbook beside it (300 words per
    entry). Crit 9 only places the two boards and makes the whiteboard open
    the course page.
12. Hub boards: lab ads, looking-for-a-lab posts, CV posts, and a suggestions
    board, each marked unofficial with unverified authors

**Settings and looks**

13. Esc settings: volume, graphics (low / high, shadows on / off), licences
    and credits, UI language
14. Character colours: skin, hair, eyes, clothes
15. Better graphics: CC0 textures, low / high presets, checked on phones
    (CC0 textures and furniture models are already in; presets are not)

**Messages**

16. Mail: leave a message for someone who's offline
17. One-to-one text chat

**Later**

18. Attachments in one-to-one chat (png, jpg, pdf, up to 5 MB)
19. Voice (hold F to talk, WebRTC; may not connect on locked-down networks
    without a relay server)

**On hold**

20. Club, residence and college / course spaces

## Crit 9 (due Wednesday 14 October, 07:00)

Steps **1–9**, and step 10 if time allows (it's next week's task anyway).

Owed to the crit, and more important than any feature:

- one decision record in `docs/decisions/` on how the app behaves with
  several people at once (candidates: chat fades after a minute but sticky
  notes stay; you only see people in your own space; returning visitors start
  where they left)
- `reflections/crit-9.md`
- `PROCESS.md` rewritten for this week
- `README.md`'s definition of good rewritten for the ANU space

### Who does what this week

Roles are in [`roles.md`](roles.md). This week:

- **Main (Opus):** accounts, spaces, doors, chat, emote and sticky-note
  protocol, the maps' layout and collisions, specs, docs, commits, deploys
- **Helper (Sonnet):** gathering building references (kept out of the repo),
  finding CC0 textures and furniture with credits, the radial menu and chat
  panel UI as self-contained modules, local QA of doors, chat and emotes with
  several browsers

## Crit 10 (due Wednesday 21 October, 07:00)

Two people in their own browsers, told apart in the server log; what each
may see and change checked on the server and written down. Steps, in order:

- **10**: one JSON line per action on the server (who, which space, what,
  when), readable with `flyctl logs`; decision record 002 on permissions
- **11a**: a classroom picker at 155's door; only `qa_master` adds
  classrooms, checked on the server (002's main example)
- **25**: links open in an in-app window where the site allows it, otherwise
  in a new tab, on desktop and phone
- **15** (small): recheck the name tag against the top-right buttons at 390 px
- if time: the classroom's exit door moves to the right-hand wall

Pulled forward once those were done (budget left over), in this order:

- **4b**: the road east of 154 carries on north between the O'Donoghue
  centre and the red-brick buildings, as asphalt
- **29**: a dog in front of 154; E asks whether to buy it some food, and yes
  shows a "Buy me a feed" button that opens my Buy Me a Coffee page
- **11c**: a board left of each classroom's whiteboard with three tabs
  (Q&A, Notices, Board); only the admin posts notices, checked on the server
- **28**: the Sketch & Guess drawing game on an arcade machine in the Hub,
  in the in-app window, moved onto this server
- **26** (if time): Chifley Library's interior behind its front door
- **21, 6a, 26a, 30** (if time): meeting rooms, each a small room with a
  group-chat window: six invite-only counselling rooms off the Hub, three team
  rooms per classroom and five in the library; six people at most, checked on
  the server; the chat lasts while someone is inside. No voice yet
- **18, 22** (pulled forward, with S3 in place): files on board posts, in
  meeting rooms and on bug reports (screenshots), up to 200 MB, kept 30 days
  at most, straight to a private S3 bucket by signed links
- **10, extended**: the admin's log, read in the app at the Student Hub's
  reception PC (or `/admin/` in a tab during the crit): seven days of what
  people wrote and removed, sign-ins and refusals, with IPs; bug reports
  sent from the settings dialog, read in a second tab. Only the admin, checked
  on the server
- **11b** (in part): COMP8020's board right of the whiteboard lists
  classmates' live final-project apps; in other classrooms the admin sets
  what the whiteboard and that board open. COMMON becomes a lounge. Two more
  arcade machines in the Hub for my earlier course games

Already done ahead of this crit: the backdrop buildings and walkable areas
(4a), and the music player and volume sliders (part of 13).

Owed to the crit: `docs/decisions/002-*.md`, `reflections/crit-10.md`,
`PROCESS.md` rewritten, README facts updated, a rehearsal with two Chrome
profiles narrated from the log alone.

### Who does what this week

Roles are in [`roles.md`](roles.md). This week:

- **Main (Opus):** the server log, permission checks and classrooms (10, 11a),
  wiring the in-app window into `main.ts`, the decision record, specs, docs,
  commits, the push and the live check
- **Helper (Sonnet):** the in-app web window as a self-contained module
  (`webview.ts`/`.css`, 25), the 390 px check (15), local QA with two browsers
  side by side once 10 and 11a land, and the log-only rehearsal dry run
