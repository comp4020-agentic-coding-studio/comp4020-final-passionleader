# Crit 8 reflection

## The breakthrough that moved the work forward

A thorough plan kills the pointless back-and-forth. Before, my planning was a
quick brainstorm and then straight into agentic coding, and the build kept
stalling on small clarifying questions. This time I wrote the plan properly,
from the stack to the user's scenario, before any code. Writing it took two or
three times longer than usual, but the first working prototype came within
minutes, and the details (BGM, the bathroom map) were done in under an hour.

I also tried Opus for the first time. It's slower than Sonnet but understood
what I meant straight away, so I made it the main session and gave Sonnet the
small parallel jobs like assets and QA. Splitting the work like that really
paid off. Dropping my ambition for real-time and aiming only for a prototype
made it finish fast, and that felt good.

![Crit 8 work split between the Opus session (server, deploy, docs) and the Sonnet session (client, assets, QA)](../diagrams/4-work-split.png)

## What this changed about who I want to be as a developer

This was my first time simulating 3D in a browser, and I was surprised how
quickly it came together: over an hour of planning, then the build almost
straight away. It made me feel how much a future developer's value lies in
design and creativity rather than in writing the code. To keep up with AI, I
want to learn more stacks and how they combine, and to keep coming up with
ideas as odd as a poop in a web space.

Looking into stacks also made me curious about real-time in the browser: how
do you move from the HTTP I've always used to WebSockets, and how does it
actually work? I'll need that for the final project. People say real-time
needs Redis, but on a single small instance I doubt caching buys much, two
processes on one machine might overload it, and managed Postgres and Redis on
Fly are paid anyway.

![From crit 8 to the final project: REST writes now, WebSockets and in-memory positions next](../diagrams/3-crit8-to-final.png)
