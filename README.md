# 💩 Poop Room 💩

A 3D toilet you walk into, leave a poop in, and come back to. Pick a name,
press **Space**, and your poop stays where you left it, with your name floating
over it whenever someone walks close. You only ever have one: poop again and it
moves.

It's the first step of a bigger idea: a small 3D social space, closer to a
lightweight VRChat or Gather.town than to a game, where people who barely know
each other have something silly to do together.

## 💩 Who it's for

Anyone who wants to leave a mark online, but mostly people who are a bit awkward
with each other: a new crit group, a project team that just met, friends who
want an in-joke. You poop, you leave, and later you come back and remember:

> "You pooped the moment you saw me." 💩
> "We carved forever into poop. Remember?" 💩
> "I was glad to put my poop next to yours." 💩💩

## 💩 How to use it

1. Type a name: letters and underscores, up to 8. Names are first come, first
   served; your browser remembers yours so you can come back as you.
2. Walk with the arrow keys or WASD (on a phone, the on-screen pad).
3. Press **Space** (or the Poop button) to poop where you stand. 💩
4. Walk up to any poop to see whose it is.

## 💩 What good means for this app (v1)

- **A childish, dirty subject breaks the ice.** Poop is silly enough that two
  awkward people can laugh at the same thing without needing to talk first.
- **It feels like being somewhere.** A 3D room you walk around in, not a form
  you fill in.
- **A poop is a guestbook.** 💩 Where you leave it, and next to whose, is the
  message: a vow, a love, a to-do, remembered when you come back.
- **No need to actually need to go.** Anyone can poop, any time.
- **The satisfaction is in the keyboard.** One key, instant result.

### 💩 Which of these are checked

Enforced by `spec/poop-room.test.ts`: names are 1–8 letters or underscores and
can't be taken twice; your poop is still there on the next visit; one poop per
person; poops stay inside the room. Judged by people (the pod at crit 8): whether
it breaks the ice, whether it feels like a place.

## 💩 What I chose not to build (yet)

Real-time sync (others appear only when you reload), chat, an inventory,
cleaning up poop, character customisation, and lighting. The toilet is plain
yellowish walls under flat light, and everyone is the same white clay figure.

## 💩 What I read while deciding

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
