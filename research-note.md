# When code is cheap, someone still has to decide what to build

"Delivering new code has dropped in price to almost free... but delivering
good code remains significantly more expensive than that" (Willison, 2026).
I keep coming back to that line. Anyone can now build an app in an afternoon
and put it on the web, so the web is filling up with them, and people get
bored fast. My position is that good agentic practice now rests on two things
the agent can't supply: seeing the whole system before anything is built, and
knowing the people it's for. Without both, you've just added one more piece
of mass-produced content to the pile.

## The big picture is the developer's job now

Willison's list of what makes code 'good' is telling. It works, we know it
works, and it 'solves the right problem'. An agent can do a lot for the first
two. The third is a decision, and it sits upstream of every prompt. Which
stack, which services, how far the scope can reach: an agent will happily
build whatever you ask for, but it won't tell you that you asked for the
wrong thing.

So I don't think the scarce skill is knowing many technologies. It's knowing
which ones this service needs, and how they fit together. I saw a small
example of this outside the literature. A post on Instagram (ai_freaks.kr,
2026) about a Korean student OpenAI hackathon said the winning team spent three of its eight hours in
meetings. In a contest where AI writes the code, they spent almost half the
time deciding what to build.

## Field research decides what gets built

The second half is about people. Requirements I imagine at my desk are not
enough. I need to see where and how people actually use a thing and where
they get stuck. Nielsen (2002) argued that field studies are among the most
valuable ways to set a project's direction and find unmet needs, and that
you have to watch what people do, not only listen to what they say.

This is why I chose Human-Centred and Creative Computing as my
specialisation. For me UX research isn't polishing screens at the end. It
decides, at the start, which problem to solve and what to build first. When
features cost almost nothing, that first decision matters more, because
nothing stops you building the wrong ones.

I should be honest about a gap here. Nielsen shows why user research matters.
He wrote twenty years before coding agents, so he can't show that agents make
it matter more. That part is my own argument, from what I've seen.

## The counter-case: what if AI does the research too?

A serious challenge comes from the HCI literature itself. Xuan et al. (2025)
built a platform where generative agents simulate people interacting with an
assistant, then replicated ten earlier user studies with it and reproduced
their core conclusions, all without live participants. If simulated users can
stand in for real ones, maybe the agent will end up owning UX too. Honestly,
reading that was a little sad.

I accept part of it. AI can take over some early, cheap evaluation. But reading a report is not
the same as watching someone get stuck in your own product. Rosala (2026)
makes the distinction I needed: even if AI matched a researcher's output,
human-led research would still matter, because the team learns by observing
users, and that learning can't be outsourced. She sorts the work in two.
Recruiting, transcribing and organising data are support work and can go to
AI. Moderating, observing and interpreting are where the learning happens.

There's also a limit in what Xuan et al. tested. They replicated conclusions
that real studies had already found. Nielsen's case for field work is about
the opposite: finding needs nobody has written down yet. A simulation can
check what we already know. It's much less clear it can surprise us. When a
friend tried my campus app, they stood at the north end of the map, said
'Wow, how did you build our campus?' and never found a single feature. I
hadn't predicted that, so no simulation built from my assumptions would have
either.

## Where this leaves the developer

So my answer to 'what is good agentic practice' is a division of labour. Let
agents write the code and do the support work of research. Keep the system
view and the watching of real users for yourself, because those decide
whether the cheap code was worth writing.

Coding is turning into a general skill that anyone can pick up. What stays
scarce is deciding what deserves to be built, and that decision still starts
with watching people.

## References

- ai_freaks.kr. (2026). *Post on the student OpenAI hackathon winners*
  [Instagram post]. https://www.instagram.com/p/DeeEqoKmlkW/
- Nielsen, J. (2002, 19 January). *Field studies done right: Fast and
  observational*. Nielsen Norman Group.
  https://www.nngroup.com/articles/field-studies-done-right-fast-and-observational/
- Rosala, M. (2026, 17 July). *Why human-led research still matters in the age
  of AI*. Nielsen Norman Group.
  https://www.nngroup.com/articles/human-led-research-still-matters/
- Willison, S. (2026). Writing code is cheap now. In *Agentic engineering
  patterns*. https://simonwillison.net/guides/agentic-engineering-patterns/code-is-cheap/
- Xuan, Z., Wu, Y., Xu, X., Namboodiri, V., Chuah, M. C. & Yang, Y. (2025).
  Design and evaluation of generative agent-based platform for
  human-assistant interaction research: A tale of 10 user studies.
  *Proceedings of the ACM on Interactive, Mobile, Wearable and Ubiquitous
  Technologies*, 9(4). <https://doi.org/10.1145/3770661>

<sub>Drafted in Korean, translated by Claude.</sub>
