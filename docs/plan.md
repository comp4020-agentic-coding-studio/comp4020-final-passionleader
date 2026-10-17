# Plan

Where the app is going, in the order I'll build it. Earlier steps are what
later ones stand on. Each crit takes a slice; the brief for each crit still
decides what that week is marked on.

## Direction

**ANU Crossing (Unofficial)**: a small 3D, real-time social space for the ANU
community, somewhere people cross paths and can ask what they don't know. The problem I care
about: students and staff (especially academics) almost never meet
informally, so finding a supervisor, or a student for a lab, depends on luck.
The space gives them somewhere to bump into each other: a stretch of campus
outside, the Student Hub, classrooms named after courses (e.g. `COMP8020`),
joined by doors. It is not an official ANU service and never looks like one.

Started in crit 8 as Poop Room: one toilet, one poop each. The real-time
layer from crit 9 carries over unchanged; the toilet and the poop don't.
The detailed, numbered to-do list lives outside the repo (my own planning
notes); the numbers below match it.

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

10. ✅ Server-side structured log of every action (who, what, when)
    ([`d1a50b3`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-passionleader/commit/d1a50b3)), and the admin's seven-day log with bug reports
    ([`9fe0e7f`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-passionleader/commit/9fe0e7f))

**Boards**

11. ✅ Classrooms the admin opens and closes, with a picker at 155's door
    ([`fb17501`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-passionleader/commit/fb17501), [`658447e`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-passionleader/commit/658447e))
11b. ✅ (in part) COMP8020's board lists classmates' live final projects; elsewhere
    the admin sets what the whiteboard and that board open ([`185cfc5`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-passionleader/commit/185cfc5))
11c. ✅ A board per classroom: Q&A, Notices (staff only), Board ([`ea18534`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-passionleader/commit/ea18534))
12. ✅ The Student Hub's board: labs looking for students, students looking for
    labs, Ask the Hub ([`f13eaef`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-passionleader/commit/f13eaef)); a researcher search beside it; the
    lawn noticeboard ([`a67eece`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-passionleader/commit/a67eece), [`c388d44`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-passionleader/commit/c388d44)). Posts take Markdown
    ([`f34664d`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-passionleader/commit/f34664d)); authors edit their own ([`a1eabc5`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-passionleader/commit/a1eabc5))

**Rooms and files**

21. ✅ Meeting rooms: invite-only counselling rooms off the Hub, team rooms off
    classrooms and the library, six people each ([`ed5d0ef`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-passionleader/commit/ed5d0ef)); a toolbar
    with a Chat button ([`0340a68`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-passionleader/commit/0340a68)); the last one out is warned
    ([`502cfc4`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-passionleader/commit/502cfc4))
18. ✅ Files on board posts, in meeting rooms and on bug reports, by signed links
    to a private S3 bucket ([`606b59d`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-passionleader/commit/606b59d))

**Settings and looks**

13. ✅ Settings: music and sound-effect volumes, graphics Low / High
    ([`4a0c6de`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-passionleader/commit/4a0c6de)), sound effects ([`e23c0e2`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-passionleader/commit/e23c0e2))
14. ✅ Your own look: figure, skin, hair, clothes, hat ([`e23c0e2`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-passionleader/commit/e23c0e2))
15. ✅ Better graphics: CC0 textures and furniture, lived-in rooms, phones checked
23. ✅ Sitting down on chairs, sofas and benches ([`e23c0e2`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-passionleader/commit/e23c0e2), [`dda350a`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-passionleader/commit/dda350a))
32. ✅ Head counts per space, numbers only ([`2e53582`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-passionleader/commit/2e53582))
33. ✅ (in part) Report someone, with the last five minutes of chat; the admin
    restricts notes, posts, chat or coming in ([`919fbc5`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-passionleader/commit/919fbc5))

**Places**

26. ✅ Chifley Library's interior ([`f480247`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-passionleader/commit/f480247), [`a84c5e9`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-passionleader/commit/a84c5e9)); the library
    closes the map ([`b823045`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-passionleader/commit/b823045))
28. ✅ Sketch & Guess on the Hub's arcade machine ([`114ae4f`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-passionleader/commit/114ae4f))
29. ✅ A dog in front of 154 ([`39f786e`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-passionleader/commit/39f786e), [`8e0c987`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-passionleader/commit/8e0c987))
—   ✅ Lab Coffee and a list of the cafés on campus ([`8031751`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-passionleader/commit/8031751), [`0d94d7c`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-passionleader/commit/0d94d7c))

**Final project (after crit 10), in this order**

34. Camera that turns in four 90° steps
35. Shaders for High graphics
32a. A minimap
38. Sign-up by student number with an emailed code, guest log-in, and roles:
    guest, student, staff, admin (needs AWS SES)
36. One-to-one counselling and private enquiries (with 16 mail, 17 one-to-one chat)
37. Meeting rooms for working together, and saving a room's chat and files to
    your own archive
39. A shared Markdown document in team rooms
33. The rest of reporting: report from a name tag, mute
31. Voice (last; needs a relay server)
—   Last of all, before Fly.io is taken back: a backup server on EC2
    (`docs/self-hosting.md`)

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
  admin PC (or `/admin/` in a tab during the crit): seven days of what
  people wrote and removed, sign-ins and refusals, with IPs; bug reports
  sent from the settings dialog, read in a second tab. Only the admin, checked
  on the server
- **11b** (in part): COMP8020's board right of the whiteboard lists
  classmates' live final-project apps; in other classrooms the admin sets
  what the whiteboard and that board open. COMMON becomes a lounge. Two more
  arcade machines in the Hub for my earlier course games

Already done ahead of this crit: the backdrop buildings and walkable areas
(4a), and the music player and volume sliders (part of 13).

Added later in the week, asked for while testing the live site: the Hub's
board and researcher search (12), the lawn noticeboard (12a), head counts
(32), Markdown and editing on boards, Lab Coffee, phone fixes
([`276292a`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-passionleader/commit/276292a)), reporting and restrictions (33, in part), the Hub and
library rearranged ([`b4dbad9`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-passionleader/commit/b4dbad9)), the library as the map's edge, a
licence ([`1630496`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-passionleader/commit/1630496)), and the name **ANU Crossing (Unofficial)**
([`b23ab30`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-passionleader/commit/b23ab30)). Code freeze: Tuesday 20 October, 18:00.

Owed to the crit: `docs/decisions/002-*.md`, `reflections/crit-10.md`,
`PROCESS.md` rewritten, README facts updated, a rehearsal with two Chrome
profiles narrated from the log alone, then the `crit-10` tag.

### Who does what this week

Roles are in [`roles.md`](roles.md). This week:

- **Main (Opus):** the server log, permission checks and classrooms (10, 11a),
  wiring the in-app window into `main.ts`, the decision record, specs, docs,
  commits, the push and the live check
- **Helper (Sonnet):** the in-app web window as a self-contained module
  (`webview.ts`/`.css`, 25), the 390 px check (15), local QA with two browsers
  side by side once 10 and 11a land, and the log-only rehearsal dry run
