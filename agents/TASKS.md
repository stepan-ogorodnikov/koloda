# Task Guide for AI Agents

This guide defines how an agent creates and maintains a task file.
A task file is one unit of work: intent, status, open questions, and the plan.

A live file lives at `tasks/live/<slug>.md`.
On `done`, move it to `tasks/archive/<slug>.md`.
Do not rename the slug.
To abandon the work, delete the file; the delete commit records why.

The plan lives in the task file's Plan section.
Do not write a separate plan file.

## When a task file is required

Create one when any of these hold:

- The work spans more than one session.
- The work needs a multi-commit plan.
- The work crosses layers or packages.
- The work carries an open question that needs a durable home.

A small fix, a typo-level doc edit, or a mechanical rename does not need a task file.
Git history is enough.

## Lifecycle

Statuses: `draft` → `ready` → `done`.
The status lives on one fixed line, exactly `Status: <draft|ready|done>`.
Grep live work with `rg --crlf -l '^Status: (draft|ready)$' tasks/live`.
The `--crlf` flag is required so Windows line endings still match.

A `draft` exists while intent and the plan are being shaped.
Plan approval flips the file to `ready` and is not an instruction to implement.
Implementation starts only when the human explicitly asks to implement.
Do not change status for that; `ready` stays `ready` until `done`.

Find live work by grepping `tasks/live`, not by listing the directory.

## Queue

`tasks/QUEUE.md` is only start order for **ready** files.
It is not the task, and it is not project state.

- Create a draft at `tasks/live/<slug>.md`. Do not add it to the queue.
- On `ready`, add a line. Put it where the human says; default is the end.
- A draft gets a queue line only when the human asks to park it.
- Reprioritize by moving lines in that file.
- On `done` or delete, remove the line.

Do not list `done` files in the queue.

Queue entry shape: `1. [short title](./live/slug.md)`.

## File

Slug is lowercase kebab-case.
Do not put status in the filename.
Do not rename the file.
The only move is `live/` → `archive/` on `done`.

```markdown
# <short title>

Status: draft

## Intent

<the outcome wanted, and done-when in user-visible terms>

## Scope

In: <what this work covers>
Out: <explicit non-goals>

## Open questions

- [ ] <question> — open
- [x] <question> — <answer>

## Plan

- [ ] 1. <imperative title>
  Goal: <self-contained description; the entire prompt the implementer receives>
  Constraints: <scope; files or areas to touch or avoid>
  Done when: <observable checks — test commands, manual steps>
  Commit: <one message; candidates during planning, the pick after approval>
  Depends on: <plan item numbers, or none>

## Outcome

<what shipped>
```

Omit `Green` unless the item is red.
Then add `Green: no — restored by item N`.
When `Green` is `no`, `Done when` is not the test suite.

This file is the task.
Each Plan line is one commit.
Never call a Plan line a task.

How to split work, present commit-message candidates, and get approval is `agents/IMPLEMENTATION-PLAN.md`.
After approval, write each picked message as that item's `Commit:` line.
Drop the other candidates.
Flip Status to `ready`.
The checkbox is ticked when that commit exists.

## Session protocol

1. Before starting work, grep live task files.
   Read Intent and Scope of each hit.
   If any overlap the intended work, surface it to the human; never resolve overlap silently.
2. Record open questions as they appear.
   Do not guess answers.
3. Before ending a session, update Open questions and Plan so the next session can start from the file.
4. On completion, fill Outcome and flip Status to `done`.
   Move the file to `tasks/archive/<slug>.md`.
   Remove it from the queue if it is still listed.
5. To abandon, delete the file and remove it from the queue.

A new session starts from the file, not from memory or chat history.

Commits that belong to a task file carry one body line: `Task: <slug>`.
The slug is the identity; the folder is not.
