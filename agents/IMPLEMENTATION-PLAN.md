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

1. Confirm the task's `Guides:` line covers the affected area; if it does not,
   route the change in `agents/INDEX.md` and update the line.
2. For an audit report, triage first: fix, skip, or needs-decision per finding.
3. Put skips and open questions in the task file's Scope and Open questions sections, never into plan items.
4. Ask the human every question whose answer changes the split — scope, priorities, approach forks; never guess.
5. Order plan items by their dependencies, placing the riskiest uncertainty as early as those allow.
6. Write the plan into the task file's Plan section.
   Item shape is in `agents/TASKS.md`.
7. Summarize the plan in chat: each item's title and `Commit:` subject, plus the open questions.
   Name the task file path for the rest, and stop.

## Commit messages

- Write one message per plan item, as its `Commit:` line.
- Match the repo's commit style: imperative subject, no type prefix, no trailing period (see recent `git log`).
- If the message's framing is a real choice (emphasis, scope), record it as an open question instead.
  Do not offer alternatives.

## Approval

The plan is approved when the human accepts it, with any edits incorporated.
Edits include changes to a `Commit:` line.
Follow `agents/TASKS.md` (flip to `ready`).
Approval is not an instruction to implement.
Do not start executing unless the human explicitly asks to implement.
