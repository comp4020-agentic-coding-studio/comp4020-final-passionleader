# ANU campus, unofficially

A small 3D, real-time space for the ANU community: a stretch of campus between
building 155 (Marie Reay Teaching Centre) and building 154 (Di Riddell Student
Centre), the Student Hub inside 154, and a COMP8020 classroom inside 155.
Everyone in a space sees everyone else walk, chat, wave and leave sticky notes
on the floor, live. It is not an official ANU service.

It started in crit 8 as Poop Room, a toilet you could leave one poop in. From
crit 9 the poop is gone and the toilet became the campus; the real-time layer
underneath stayed.

## Who it's for

Anyone who wants to leave a mark online, but mostly people who are a bit awkward
with each other: a new crit group, a project team that just met, friends who
want an in-joke. You poop, you leave, and later you come back and remember:

> "You pooped the moment you saw me."
> "We carved forever into poop. Remember?"
> "I was glad to put my poop next to yours."

## How to use it

1. Type a name: letters, digits and underscores, up to 8. Names are first
   come, first served; your browser remembers yours so you come back as you,
   where you left.
2. Walk with **WASD**, jump with **Space**. On a phone, use the pad and the
   Menu / Jump / Use buttons.
3. Walk up to a door and press **E** to go in or out. Only the people in the
   same space see and hear you.
4. Press **Enter** to chat: a bubble over your head and a line in the chat log,
   gone after a minute.
5. Hold **Q** for the menu: stick a note, wave, say yes or no, "How ya doing,
   mate?", or dance.
6. A sticky note stays on the floor where you stood until you (or the admin)
   remove it: up to 100 words, one every 30 seconds, five per person per space
   (a sixth replaces your oldest). Walk onto one and press **E** to read it and
   comment.

## What good means for this app (v1)

- **A childish, dirty subject breaks the ice.** Poop is silly enough that two
  awkward people can laugh at the same thing without needing to talk first.
- **It feels like being somewhere.** A 3D room you walk around in, not a form
  you fill in.
- **A poop is a guestbook.** Where you leave it, and next to whose, is the
  message: a vow, a love, a to-do, remembered when you come back.
- **No need to actually need to go.** Anyone can poop, any time.
- **The satisfaction is in the keyboard.** One key, instant result.

### Which of these are checked

Enforced by `spec/`: names and their limits (`campus.test.ts`); a sticky note
is still there on the next visit, belongs to its space, keeps to 100 words, one
every 30 seconds, five per person per space, and only its author or an admin
removes it (`campus.test.ts`, `rules.test.ts`); movement, chat, emotes and new
notes reach everyone in the same space within a second, and nobody in another
space (`realtime.test.ts`). Judged by people: whether it breaks the ice,
whether it feels like a place.

## What I chose not to build (yet)

Boards (supervisor and lab posts), more classrooms, mail, one-to-one chat,
voice, character colours and graphics settings. Everyone is still the same
white clay figure, and the buildings are simplified, not surveyed.

## What I read while deciding

- Andrew Dowell, [A practical guide to Game Design](https://www.artstation.com/blogs/andrewdowell/PQaWj/a-practical-guide-to-game-design)
  (ArtStation). Good games make players choose, grow, fail and try again.
  Reading it is how I realised I don't want a game: I want a place to talk.
- Comcare, [Effective communication](https://www.comcare.gov.au/safe-healthy-work/healthy-workplace/work-design/better-practice-guides/effective-communication).
  Written for workplaces, but it holds online, where it matters more: a clear
  purpose (more is lost online), the right channel (a virtual space has more of
  them), empathetic listening (fewer non-verbal cues), and fixing
  misunderstandings fast (text misleads easily).
- [hop.earth](https://hop.earth/), for what a real-time game world in the
  browser can feel like.
- [FrameVR](https://learn.framevr.io/), virtual meeting spaces: the closest
  thing to where I want the final project to end up.

<img width="1386" height="1021" alt="image" src="https://github.com/user-attachments/assets/fe997cd4-21b2-4d32-a0e2-4193ba617e15" />

