# 006: Several agent sessions, each on the model that fits

Status: accepted (crit 10, extended for the final project)

## Context

I build with Claude Code on a weekly budget. One session doing everything
in turn was slow, and paying the strongest model for every task was
expensive.

## Options

- A. One session, one model, everything in order.
- B. Several sessions in parallel, each with its own role and model.

## Decision

I chose B. The main session (Opus) builds and commits. A helper (Sonnet) runs
browser QA, and Haiku checks the crawled data and puts test questions to the
assistants. What each may touch is written in `docs/roles.md`
([238efdf](https://github.com/comp4020-agentic-coding-studio/comp4020-final-passionleader/commit/238efdf)). For review workflows the rule is 'search on Sonnet, verify on Opus'.

Why: running in parallel cut the time most of all. QA could happen while the
build went on, which was efficient. Splitting by model also saves budget:
Sonnet was enough for QA, and Haiku was enough to check the crawl. Each job
got a model that fits it.

## Trade-offs

- Results need checking. Haiku marked answers as made up that were really
  on another crawled page, so the main session checks helpers' findings
  against the data.
- Only one session commits, so helpers hand their work over, which adds
  a step.
- Getting the model wrong is costly. The first review workflow ran every
  searching agent on Opus and burned budget before I stopped it.

## How it's checked

By people, not by the spec: `docs/roles.md` sets the limits, and the commit
history shows one committer.

---

<sub>I drafted this record myself, in Korean, and Claude translated it into English and corrected the grammar.</sub>
