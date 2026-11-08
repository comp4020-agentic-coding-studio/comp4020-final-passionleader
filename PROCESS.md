# Process overview

![How the browser, the server and AWS talk](diagrams/8-client-server-aws.png)

The whole server is in [diagram 9](diagrams/9-server-whole.png), the AWS side
and its one IAM user in [diagram 10](diagrams/10-aws-infrastructure.png),
voice in [diagram 11](diagrams/11-voice-chat.png) and email sign-up in
[diagram 12](diagrams/12-email-signup.png).

## The stack, and what it cost

The course fixed the shape: one Fly machine, 256 MB, one volume, no database
server. That constraint chose most of the stack. Live positions and chat need
to reach everyone at once, so the server speaks WebSocket and keeps positions
in memory, writing a spot to disk only when someone leaves. Everything else
lives in SQLite on the volume. I looked at RDS early on. For a small community
and simple rules it would have been overkill, and it costs money every hour.
The trade-off is plain: one machine is one point of failure, and the database
and the server share it.

Fly and GitHub Actions came with the course. AWS is what I added, and I set
it up myself. Media was the reason. A big club poster or a team's files can't
live on a 1 GB volume, so files go to a private S3 bucket
([606b59d](https://github.com/comp4020-agentic-coding-studio/comp4020-final-passionleader/commit/606b59d)).
The browser uploads straight to S3 with a five-minute link the server signs,
and the bucket deletes everything after 30 days. It costs a little; I had credit. SES sends the sign-up codes
([d6ffb2d](https://github.com/comp4020-agentic-coding-studio/comp4020-final-passionleader/commit/d6ffb2d)),
Bedrock runs the assistants, and voice runs on my own t4g.small EC2 with
LiveKit, because audio is too heavy for the app's machine. The app calls AWS
as one IAM user with three permissions. I wrote that policy by hand, action
by action. AI didn't do that part for me, and it shouldn't. Spending has a
cap in code: the assistants stop at a daily limit and say so plainly when
credit runs out
([7354a25](https://github.com/comp4020-agentic-coding-studio/comp4020-final-passionleader/commit/7354a25)).
AWS Budgets only emails me. On the free tier there's no automatic stop, so
the server's own limit is the real brake.

## My position on the sources

Youssef et al. (2024)
found that metaverse platforms built social skills, but in young people in the
UAE. One campus app can't claim that, so the README lists 'easier
to talk' as judged, not proven. Reber and Sweller convinced me that a familiar
place costs less effort. That's why I checked the map against OpenStreetMap
instead of trusting my memory
([1068101](https://github.com/comp4020-agentic-coding-studio/comp4020-final-passionleader/commit/1068101)).
I kept its layout but at a smaller scale. Lee et al.
(2023) showed students felt more like a team on Gather.Town than on Zoom.
That's the case for a space with avatars rather than another video call. Bulu
(2012) ties co-presence to satisfaction, which is why the online count and
live movement matter more to me than any single feature.

## How I planned: a plan file, a checklist, weekly bundles

I keep my own notes outside the repo, in Korean. `Integreted_plan.md` holds
ideas as they come, and I only add to it. From it grew a numbered checklist.
Each week, what I want goes in as a new number, and what's done gets ticked
with a date and its commit. The same numbers appear in commit messages, so
'97:' in a message means checklist item 97
([0d920b2](https://github.com/comp4020-agentic-coding-studio/comp4020-final-passionleader/commit/0d920b2)).
The agent turned these notes into the English documents in the repo: the
plan and roles
([56b1b99](https://github.com/comp4020-agentic-coding-studio/comp4020-final-passionleader/commit/56b1b99),
[238efdf](https://github.com/comp4020-agentic-coding-studio/comp4020-final-passionleader/commit/238efdf)),
the harness brought up to date
([b83c85b](https://github.com/comp4020-agentic-coding-studio/comp4020-final-passionleader/commit/b83c85b)).
Work came in bundles, one budget week each. The budget went from $200 to $300
a week, and learning to finish inside it became a skill of its own. When a
week had too many ideas, I scored them with RICE. Day and night by Canberra's
clock came second on that list, so it got built
([11a6335](https://github.com/comp4020-agentic-coding-studio/comp4020-final-passionleader/commit/11a6335)).

## How I directed agents, and what I fixed in the harness

I worked with several Claude sessions at once. The main one (Opus) builds
and commits. A helper (Sonnet) runs browser QA, and a cheap one (Haiku) asks the
assistants test questions. The limits of each are written in `docs/roles.md`.
I plan, decide and check.

When something went wrong, I tried to fix the rule, not just the result:

- **An audit, not a retry.** For the final check I ran a multi-agent workflow:
  Sonnet agents searched the code for problems, and Opus verified each one.
  The fixes landed in the code, some with a new check in `spec/`: admin-PC
  holders could lift each other's restrictions
  ([0d920b2](https://github.com/comp4020-agentic-coding-studio/comp4020-final-passionleader/commit/0d920b2)),
  and wrong passwords now meet a limit the spec tests
  ([d018a1e](https://github.com/comp4020-agentic-coding-studio/comp4020-final-passionleader/commit/d018a1e)).
  The first time, I put every searching agent on Opus. It burned budget and
  finished one area in thirty minutes. I stopped it, and 'search on Sonnet,
  verify on Opus' became the rule.
- **The real cause, then a test.** An assistant's E badge kept landing on a PC.
  The cause was that `/api/npcs` never
  sent each one's reach; now it does, and the spec checks it
  ([3810938](https://github.com/comp4020-agentic-coding-studio/comp4020-final-passionleader/commit/3810938)).
- **Where newcomers arrive** went into `CLAUDE.md` and the spec together
  ([99c0bec](https://github.com/comp4020-agentic-coding-studio/comp4020-final-passionleader/commit/99c0bec)),
  so no later change could quietly move it.
- **QA that wasn't QA.** Early on the main session said it had tested, from
  spec runs and a guest screenshot. I found the test login broken myself. Since
  then browser QA goes to the helper, and anything untested is reported as
  untested. Haiku's results get checked against the data too, because many
  answers it called made up were on another crawled page.

For the UI, I used the stageshow skill's design notes as a checklist, not as
a tool: one labelled Close for every window, one set of line icons, and
nothing on a phone hidden under another control
([a24ccbc](https://github.com/comp4020-agentic-coding-studio/comp4020-final-passionleader/commit/a24ccbc),
[7be584a](https://github.com/comp4020-agentic-coding-studio/comp4020-final-passionleader/commit/7be584a),
[24f6ba1](https://github.com/comp4020-agentic-coding-studio/comp4020-final-passionleader/commit/24f6ba1)).

## After crit 10

AI made building easy. That made knowing the user the hard part. So after
crit 10 I watched people more than I wrote features. Two things
kept coming back: people didn't know what they could do, and they thought the
map was small. So I added a tutorial that ticks off as you go
([3aeb2b5](https://github.com/comp4020-agentic-coding-studio/comp4020-final-passionleader/commit/3aeb2b5)),
quests that lead newcomers to Robin in the library first
([efaffc0](https://github.com/comp4020-agentic-coding-studio/comp4020-final-passionleader/commit/efaffc0)),
and a Campus Guide with short looping clips recorded from the app
([b718b00](https://github.com/comp4020-agentic-coding-studio/comp4020-final-passionleader/commit/b718b00),
[33cf664](https://github.com/comp4020-agentic-coding-studio/comp4020-final-passionleader/commit/33cf664)).

The bigger additions were email sign-up, the AI assistants answering only from
crawled ANU pages
([98fc799](https://github.com/comp4020-agentic-coding-studio/comp4020-final-passionleader/commit/98fc799)),
voice, the Career Hub, and the campus at night.

I did the live QA myself. Phones were the weak spot: a desktop browser can't
fully reproduce a phone, so I took screenshots on my own phone and sent them
in. Phone fixes like this one came from those
([8371c85](https://github.com/comp4020-agentic-coding-studio/comp4020-final-passionleader/commit/8371c85)).
The decisions behind what is kept and who sees it are in
[decision 001](docs/decisions/001-what-lasts-and-who-sees-it.md) and
[decision 002](docs/decisions/002-who-may-see-and-change-what.md).
