# Plan

Where the app is going, in the order I'll build it. Earlier steps are what
later ones stand on. Each crit takes a slice; the brief for each crit still
decides what that week is marked on.

## Direction

A small 3D, real-time social space for the ANU community. The problem I care
about: students and staff (especially academics) almost never meet
informally, so finding a supervisor, or a student for a lab, depends on luck.
The space gives them somewhere to bump into each other: a stretch of campus
outside, the Student Hub, classrooms named after courses (e.g. `COMP8280`),
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
6. ✅ `COMP8280` classroom (door in building 155)

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
