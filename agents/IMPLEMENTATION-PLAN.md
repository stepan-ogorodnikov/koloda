# Implementation Plan Guide for AI Agents

This guide defines how an agent turns a feature request or an audit report into a plan of small logical commits.

The plan lives in the task file's Plan section, at `tasks/live/<slug>.md`.
If no task file exists yet, create a draft first, per `agents/TASKS.md`.
Do not write a separate plan file.

## When to plan

Plan work that will land as several commits: a feature, a batch of audit findings.
A single-commit change does not need a plan.
Work that needs a plan needs a task file.

## What a plan item is

Each plan item becomes exactly one commit.

- One commit — the unit of commit, revert, and message.
- Independently implementable — ordered so each item starts from the state the preceding items leave.
- Self-contained — the item text is the entire prompt the implementer receives.

This file's "plan item" is not a task.
The task is `tasks/live/<slug>.md`.

## Green

Prefer the repo building and passing tests after every item.
The last item must leave it green.

An intermediate may be red only when keeping it green would merge items or require a shim.
Declare it on the item: `Green: no — restored by item N`.
That item's `Done when` is not the test suite — remaining call sites, files added, a mirror still pending.
If you cannot name the restoring item, the split is wrong.
Do not use red for an incoherent slice.

## Sizing

- Split an item that mixes unrelated concerns.
- A little size is fine; the final review judges the whole change, not each commit.
- Merge an item that produces nothing worth committing alone into the item that uses its output.
- Docs and spec updates ride with the change that makes them true, unless the whole plan is docs-only.
- An item whose commit message cannot be stated in one line is not coherent — split or reshape it.

## Procedure

1. Confirm the area guides are in the prompt, and ask for the guides covering the affected area if they are not.
2. For an audit report, triage first: fix, skip, or needs-decision per finding.
3. Put skips and open questions in the task file's Scope and Open questions sections, never into plan items.
4. Ask the human every question whose answer changes the split — scope, priorities, approach forks; never guess.
5. Order plan items by their dependencies, placing the riskiest uncertainty as early as those allow.
6. Write the plan into the task file's Plan section.
   Item shape is in `agents/TASKS.md`.
7. Present the plan in the presentation format below, list the open questions, and stop.

## Presentation

Present the plan in chat as plain text, never as a table or a rendered list.
Use exactly this shape:

```
1. <plan item title>
a. <commit message candidate>
b. <commit message candidate>
c. <commit message candidate>

2. <plan item title>
a. <commit message candidate>
b. <commit message candidate>
```

One numbered line per plan item, in item order, with the lettered candidates directly beneath it and a blank line between items.
Output it inside a fenced code block, so each line survives markdown rendering on its own line.
Item details — Goal, Constraints, Done when, Green — stay in the task file; name its path when presenting.
The human picks per item by letter, or supplies their own message.

## Commit message candidates

- Offer two or three candidates per plan item.
- Candidates differ where a real choice exists — emphasis, scope, framing — not rewordings of each other.
- If there is only one honest message, offer one and say so.
- Match the repo's commit style: imperative subject, no type prefix, no trailing period (see recent `git log`).

## Approval

The plan is approved only when the human has both:

1. Accepted the plan, with any edits incorporated.
2. Picked one commit message for every plan item, from the candidates or their own.

On approval, write each picked message as the item's single `Commit:` line.
Drop the other candidates.
Follow `agents/TASKS.md` (flip to `ready`).
Approval is not an instruction to implement.
Do not start executing unless the human explicitly asks to implement.
Never start executing with unpicked messages.
