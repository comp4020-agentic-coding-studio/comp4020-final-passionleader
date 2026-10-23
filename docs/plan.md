# Plan

Where the app is going, in the order I'll build it. Earlier steps are what
later ones stand on. Crits 8–10 each took a slice (tags `crit-8` to
`crit-10`); from 22 October it is one run to the final project, due
Monday 9 November, 12:00, in three bundles (below).

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
Before building the final project I wrote two planning files outside the
repo: a plan (direction, decisions, AWS set-up) and a numbered checklist of
everything to build. The numbers below match that checklist, and so do the
numbers in commit messages.

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
    — the Student Hub's board drops Ask the Hub and becomes a staff–student
    matching board (63); classroom boards become PCs (67)
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

**Final project**

Everything left on the checklist is meant for the final project; whatever
won't fit is dropped from the end of bundle 3 (below), not cut in advance.

*Small fixes and comfort*

40. Esc closes the lawn noticeboard
41. "Open in new tab" opens the page you'd reached in the in-app window, if
    the browser lets the app read it (checked first)
45. A sticky note opens scrolled to the top
46. Hearts on comments (the most-hearted pinned first), reporting a post or
    comment, and a confirm before deleting, on notes and every board
47. Lawn noticeboard posts go after 30 days, and the write form says so
49. Times shown in Canberra time (stored as UTC)
50. Emotes other than dance and notes once every two seconds, checked on the
    server
51. `/all message` reaches the chat log in every space; bubbles stay local
54. The admin's "coming in" restriction kicks at once; a plain kick with no
    restriction
55. Jumping over sofas
57. Signs say what a thing is, not "press E" (the E badge already does)
74. The lit E badge sits over the thing you use, not behind it
75. The meeting room door label isn't cut off by the chat column

*Looks*

42. A hat colour (the hair palette)
43. A yellow hard hat only `qa_` accounts may wear, checked on the server
44. The dog barks happily when you press "Buy me a feed"
52. A coat-hanger button left of settings opens Customise look (it leaves
    the settings dialog); faces stay visible when skin and hair match

*Places*

58. The lawn noticeboard moves south of Broger's garden bed, facing the main
    path
59. An ANU Sports tent at the east end with a PC to its site
60. The lawn to the creek west of it, closer to the real place
61. The east–west white path carries on across the asphalt
62. An easter egg: a hidden toilet back to Poop Room
63. The Hub's board: staff–student matching, without Ask the Hub
64. Behind the Hub desk: two AI advisers (56) and a PC for enquiries, public
    or private (private ones only the writer and staff see)
65. Hub reception in order: matching board, researcher search, AI essentials
    as a pile of papers
66. A large wall calendar of campus events in the Hub
67. Classroom boards as PCs
68. COMMON is replaced by the ANUSA office, up the stairs left of the Hub's
    entrance; 68a. a study-group board there showing who has joined
69. The admin picks "new tab" or "in-app window" for a classroom link
70. Research Ethics in the library as a pile of papers

*Bigger features*

56. AI campus assistants: one each in the library, the ANU Sports tent and
    the ANUSA office, and a course adviser and a careers adviser in the Hub;
    answers drawn from ANU pages fetched weekly; nothing said is stored, and
    the window says so; a per-person daily limit (the model runs on the
    course budget)
38. Sign-up by student number with an emailed code (AWS SES), guest log-in,
    and roles: guest, student, staff, admin; guests read and stick notes but
    get a sign-up prompt when they try to post
16. Mail to someone who isn't online, from a mailbox button beside the coat
    hanger; 17, 36. one-to-one chat and counselling; 18. files on them
37. Meeting rooms for working together, and saving a room's chat and files to
    your own archive; 39. a shared Markdown document in team rooms
72. A skippable tutorial of small quests ("Go to the library" ✓)
53. A minimap outside, desktop only, with the names of buildings you can enter
33. The rest of reporting: mute
35. Shaders for High graphics; 35a. the sky drifts left to right
34. A camera button that turns 90° outside (last)
31. Voice (last; needs a relay server)
20. Club, residence and college / course spaces (last, if at all)
—   After the course, before Fly.io is taken back: a backup server on EC2
    (`docs/self-hosting.md`)

*Review*

73. Multi-agent review runs: before each push, several reviewers (bugs,
    `CLAUDE.md` rules, missing specs, phone and keyboard-only, security) with
    each finding checked again; research runs before the big items; and one
    full audit on 6 November (README ↔ spec ↔ `CLAUDE.md` ↔ the live app,
    screenshots of every space on desktop and phone)

## Final project (due Monday 9 November, 12:00)

The course budget refills every Thursday, 09:00, so a bundle is one budget
week, about $180, with some left spare. Each bundle ends with a review run
(73) and a push; pushes deploy, so they come in batches.

**Bundle 1 — 24 to 29 October: small fixes, then what changes the
structure.** Push the three commits left from crit 10; small fixes and
comfort (40, 45, 57, 70, 44, 55, 50, 49, 61, and from the 18 October QA: 74 the
E badge over the library PCs sits too high, 75 a door label cut off in meeting
rooms); looks (42, 43, 52); boards and
the Hub (63, 65, 67, 69, 47, 58, 46's delete confirm); 41, 54, mute, 51,
expired classrooms (11); hearts and reports (46); the enquiry PC and the
ANU Sports tent (64, 59); research for 56 and 68; COMMON becomes the ANUSA
office (68).

**Bundle 2 — 29 October to 4 November: big features.** The AI assistants
(56); sign-up and roles (38; AWS SES production access is requested on 24
October); mail and one-to-one chat (16, 17, 36, 18); the study-group board
and the tutorial (68a, 72); the minimap and the wall calendar (53, 66).
Shaders and the easter egg (35, 62) only if it runs to spare. Big
implementation ends Friday 30 October; the rest of the week catches up.

**Bundle 3 — 5 to 9 November: finish, check, write.** On 5 November what
bundle 2 left and the collaborative rooms (37, 39); from 6 November the full
audit (73), then bugs, hotfixes and small things only, and the documents:
README (400–600 words), PROCESS rewritten from scratch, `CLAUDE.md`, `spec/`,
`reflections/crit-8.md` cut to 300 words. If anything has to go, it goes from
here, in this order: 60, 34, UI language, 31, 20.

### Who does what

Roles are in [`roles.md`](roles.md): one main session (Opus) plans, builds the
server and the core client files, commits and deploys; a helper session
(Sonnet) finds assets, builds self-contained UI modules the main session
names, and does local QA. Review runs (73) are read-only and report to the
main session.

## Earlier crits

Crit 8 (Poop Room), crit 9 (steps 1–9, spaces and doors) and crit 10 (the
server log, permissions checked on the server, files on S3, meeting rooms,
the boards) are tagged `crit-8`, `crit-9` and `crit-10`; each tag's
`docs/plan.md` has that week's plan and split.
