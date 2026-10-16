# ANU campus, unofficially

A small 3D, real-time space for the ANU community: a stretch of campus between
building 155 (Marie Reay Teaching Centre) and building 154 (Di Riddell Student
Centre), the Student Hub inside 154, classrooms inside 155 (COMMON for
anyone, COMP8020, and any course the admin opens), and Chifley Library across
the bridge to the south.
Everyone in a space sees everyone else walk, chat, wave, dance and leave sticky
notes, live. It is not an official ANU service.

## Who it's for

Anyone connected to ANU. For now it is built mostly around students talking to
students, but the aim is a place where staff and academics can talk with
students informally and at ease. You can hang out with live chat and emotes, or
leave a trace with a sticky note. Students, staff and academics
should feel at home in a virtual space shaped like the real campus they know.

## How to use it

1. Type your student number (e.g. `u1234567`); staff and visitors use any name
   of up to 8 letters, digits and underscores. Nothing checks a number is real.
   Your browser remembers you, and you come back where you left.
2. **WASD** to walk, **Space** to jump, **E** at a door to go in or out
   (building 155's door asks which classroom). On a phone: the pad and the
   Menu, Jump and Use buttons.
3. **Enter** to chat (gone after a minute). Hold **Q** to wave, say yes or no,
   "How ya doing, mate?", dance, or stick a note.
4. A note stays where you stood for a month (it says the day it goes), unless
   you or the admin remove it first. Notes go up outside and in classrooms,
   not in the Student Hub and not on top of a door. Walk onto one and press
   **E** to read and comment.
5. In a classroom, **E** at the board left of the whiteboard opens its Q&A,
   Notices and Board. Anyone asks, posts and comments (posts up to 500
   words); only lecturers and staff post notices. In COMP8020 the whiteboard
   opens the course page in a window over the campus, and the board to its
   right lists classmates' final-project apps that are up (each opens in a
   new tab). In other classrooms both open whatever page the staff set (for
   now the admin). COMMON is a lounge, not a lecture room.
6. Say hello to the dog in front of 154. In the Hub, three arcade machines:
   Sketch & Guess, a drawing game for everyone there, and two of my earlier
   course games, Two-Tone (made with my pod) and Retro Run & Gun. In Chifley Library the
   catalogue desk opens room booking, the catalogue and research ethics.
7. Meeting rooms: six counselling rooms off the Student Hub, three team rooms
   off every classroom and four off the library. Up to six people each. Team
   rooms are open to anyone; a counselling room lets in only whoever someone
   inside has invited by name. Inside, a group chat shows what's been said
   since the room last emptied; when the last person leaves it's gone, and so
   are the invites.
8. The gear (top right) sets the music and sound-effect volumes and switches
   graphics between Low and High. On a computer, the box beside it shows the
   track playing, with pause and next.

## What good means for this app

- **Familiar places, so less effort.** By processing fluency theory (Reber,
  Schwarz & Winkielman, 2004), the brain spends less effort on visual and
  spatial information it already knows (a mental map), and that fluency feels
  safe and pleasant. By cognitive load theory (Sweller, 1988), a predictable,
  familiar campus cuts the extraneous load of learning a virtual world, leaving
  more for real tasks, deep thinking and creative work together. So the spaces
  follow the real campus, and people can settle in without friction.
- **Accessible from anywhere.** No building to reach, no weather, no physical
  barrier: a community space in the browser, on a laptop or a phone.
- **A place to rest, not another work screen.** Not the 2D tools we stare at
  all day, but a game-like space where anyone can drop in, relax and socialise
  without pressure.
- **Easy for shy people.** Calm music and game-like art make it easier to be
  social. Stick a note to leave your mark, let classmates comment on it, or
  just dance together.

### Which of these are checked

Enforced by `spec/`: name rules (`campus.test.ts`); notes and comments
persist, stay in their space, keep their limits, and only their author or an
admin removes them (`campus.test.ts`, `rules.test.ts`); movement, chat, emotes
and new notes reach the same space within a second, and no other
(`realtime.test.ts`); a meeting room holds six and a counselling room only
the invited (`rooms.test.ts`). Keyboard and phone controls are a rule in `CLAUDE.md`.
Judged by people: whether it feels familiar and restful, and whether talking
gets easier.

## What I chose not to build (yet)

Files and voice in the meeting rooms, sitting on chairs, the Hub's boards,
mail, one-to-one chat, voice, and character colours. "Staff" is only
the admin account for now: nothing yet tells a lecturer from a student. The buildings are
simplified, not surveyed.

## What I read while deciding

- Reber, R., Schwarz, N. & Winkielman, P. (2004). Processing fluency and
  aesthetic pleasure. *Personality and Social Psychology Review*, 8(4), 364–382.
- Sweller, J. (1988). Cognitive load during problem solving: effects on
  learning. *Cognitive Science*, 12(2), 257–285.
- Andrew Dowell, [A practical guide to Game Design](https://www.artstation.com/blogs/andrewdowell/PQaWj/a-practical-guide-to-game-design):
  why I want a place to talk, not a game.
- Comcare, [Effective communication](https://www.comcare.gov.au/safe-healthy-work/healthy-workplace/work-design/better-practice-guides/effective-communication).
- [hop.earth](https://hop.earth/) and [FrameVR](https://learn.framevr.io/):
  real-time spaces in the browser.
