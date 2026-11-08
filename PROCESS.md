# Process overview

![How the browser, the server and AWS talk](diagrams/8-client-server-aws.png)

The whole server is in [diagram 9](diagrams/9-server-whole.png), the AWS side
and its one IAM user in [diagram 10](diagrams/10-aws-infrastructure.png),
voice in [diagram 11](diagrams/11-voice-chat.png) and email sign-up in
[diagram 12](diagrams/12-email-signup.png).

## The stack, and what it cost

The course fixed the shape of the server: one Fly machine with 256 MB, one
volume, and no database server. That constraint chose most of the stack. Positions and chat have to reach everyone at once, so the server speaks
WebSocket and keeps live positions in memory, writing someone's spot to disk
only when they leave. Everything that lasts sits in SQLite. I
looked at RDS early on, but for a small community with simple rules it would
have been overkill. The cost is plain: one machine is one point of failure, and the database shares it
with the server.

Fly and GitHub Actions came with the course; AWS is what I added and set up
myself. Media was the reason. A big club poster or a team's files won't fit on
a 1 GB volume, so files go to a private S3 bucket
([606b59d](https://github.com/comp4020-agentic-coding-studio/comp4020-final-passionleader/commit/606b59d)). The browser uploads straight to S3 with a five-minute link
the server signs, and the bucket deletes everything after 30 days. It costs a
little; I had credit. SES sends the sign-up codes ([d6ffb2d](https://github.com/comp4020-agentic-coding-studio/comp4020-final-passionleader/commit/d6ffb2d)),
Bedrock runs the assistants, and voice runs on my own t4g.small EC2 with
LiveKit, since audio is too heavy for the app's machine.

The app reaches AWS as a single IAM user with three permissions, and I wrote
that policy by hand, one action at a time. This was the part AI didn't do for
me and shouldn't. Spending is capped in code: the assistants
stop at a daily limit and say plainly when the credit has run out
([7354a25](https://github.com/comp4020-agentic-coding-studio/comp4020-final-passionleader/commit/7354a25)). AWS Budgets only emails me, since the free tier has no
automatic stop; the server's own limit is the real brake.

## My position on the sources

Youssef et al. (2024) found that metaverse platforms built young people's
social skills, but in the UAE and across platforms in general. One campus app can't claim the same, so the README lists 'talking
gets easier' as judged rather than proven. Reber and Sweller convinced me
that a familiar place takes less effort, which is why I checked the map
against OpenStreetMap instead of trusting my memory ([1068101](https://github.com/comp4020-agentic-coding-studio/comp4020-final-passionleader/commit/1068101)); I kept the
layout, only at a smaller scale. Lee et al. (2023) found students felt more
like a team on Gather.Town than on Zoom. That's my case for a space with
avatars rather than one more video call. Bulu (2012) ties co-presence to
satisfaction, which is why the live count and moving people matter most to me.

## How I planned: a plan file, a checklist, weekly bundles

My notes live outside the repo, in Korean. `Integreted_plan.md` collects
ideas as they come, and I only add to it. From it grew a numbered
checklist: whatever I want in a week goes in as a new number, and what's done
gets ticked with its date and commit. The same numbers appear in commit
messages, so '97:' in a message points to checklist item 97 ([0d920b2](https://github.com/comp4020-agentic-coding-studio/comp4020-final-passionleader/commit/0d920b2)).
The agent turned these notes into the English documents in the repo, from
the plan and the roles ([56b1b99](https://github.com/comp4020-agentic-coding-studio/comp4020-final-passionleader/commit/56b1b99), [238efdf](https://github.com/comp4020-agentic-coding-studio/comp4020-final-passionleader/commit/238efdf)) to the harness
([b83c85b](https://github.com/comp4020-agentic-coding-studio/comp4020-final-passionleader/commit/b83c85b)).

Work came in bundles, one budget week each. The budget grew from $200 to
$300 a week, and finishing inside it became a skill of its own. When ideas
outran the budget, I scored them with RICE. Day and night following
Canberra's clock came second, so it got built ([11a6335](https://github.com/comp4020-agentic-coding-studio/comp4020-final-passionleader/commit/11a6335)).

## How I directed agents, and what I fixed in the harness

I worked with several Claude sessions at once. The main session (Opus) builds
and commits, a helper (Sonnet) runs browser QA, and a cheaper one (Haiku)
puts test questions to the assistants. What each may touch is written in
`docs/roles.md`. I plan, decide and check.

When something went wrong, I tried to fix the rule rather than just the
result.

- **An audit, not a retry.** For the final check I ran a multi-agent
  workflow: Sonnet agents searched the code for problems, and Opus verified
  each one. The fixes went into the code, some with a new check in `spec/`:
  admin-PC holders could lift each other's restrictions ([0d920b2](https://github.com/comp4020-agentic-coding-studio/comp4020-final-passionleader/commit/0d920b2)), and
  wrong passwords now meet a limit the spec tests ([d018a1e](https://github.com/comp4020-agentic-coding-studio/comp4020-final-passionleader/commit/d018a1e)). The first
  time, I put every searching agent on Opus. It burned through
  the budget and finished one area in thirty minutes, so I stopped it, and
  'search on Sonnet, verify on Opus' became the rule.
- **The real cause, then a test.** An assistant's E badge kept landing on a
  PC. The cause was that `/api/npcs` never sent each assistant's reach; now it
  does, and the spec checks it ([3810938](https://github.com/comp4020-agentic-coding-studio/comp4020-final-passionleader/commit/3810938)).
- **Rules that can't drift.** Where newcomers arrive went into `CLAUDE.md`
  and the spec together ([99c0bec](https://github.com/comp4020-agentic-coding-studio/comp4020-final-passionleader/commit/99c0bec)), so no later change can quietly move
  it.
- **QA that wasn't QA.** Early on, the main session said it had tested from
  spec runs and a guest screenshot, and I was the one who found the test
  login broken. Since then browser QA goes to the helper, and anything
  untested is reported as such. Haiku's results get checked against the
  data too, since many answers it called made up were on another page.

For the interface, I used the stageshow skill's design notes as a checklist
rather than a tool. That gave every window the same labelled Close, every
round button the same line icons, and a phone screen where nothing hides
under another control ([a24ccbc](https://github.com/comp4020-agentic-coding-studio/comp4020-final-passionleader/commit/a24ccbc), [7be584a](https://github.com/comp4020-agentic-coding-studio/comp4020-final-passionleader/commit/7be584a), [24f6ba1](https://github.com/comp4020-agentic-coding-studio/comp4020-final-passionleader/commit/24f6ba1)).

## After crit 10

AI made building easy, and that made knowing the user the hard part. After
crit 10 I watched people more than I wrote features. Two things
kept coming up: people didn't know what they could do, and they thought the
map was small. So I added a tutorial that ticks off as you go
([3aeb2b5](https://github.com/comp4020-agentic-coding-studio/comp4020-final-passionleader/commit/3aeb2b5)), quests that lead newcomers to Robin in the library first
([efaffc0](https://github.com/comp4020-agentic-coding-studio/comp4020-final-passionleader/commit/efaffc0)), and a Campus Guide with short clips recorded from the app
([b718b00](https://github.com/comp4020-agentic-coding-studio/comp4020-final-passionleader/commit/b718b00), [33cf664](https://github.com/comp4020-agentic-coding-studio/comp4020-final-passionleader/commit/33cf664)). The bigger additions were email sign-up, the
assistants answering only from crawled ANU pages ([98fc799](https://github.com/comp4020-agentic-coding-studio/comp4020-final-passionleader/commit/98fc799)), voice, the
Career Hub and the campus at night.

I did the live QA myself. Phones were the weak spot, since a desktop browser
can't fully reproduce one, so I took screenshots on my own phone and sent
them in. Fixes like these came from that ([8371c85](https://github.com/comp4020-agentic-coding-studio/comp4020-final-passionleader/commit/8371c85)). What is kept, and who sees it, is argued in
[decision 001](docs/decisions/001-what-lasts-and-who-sees-it.md) and
[decision 002](docs/decisions/002-who-may-see-and-change-what.md).
