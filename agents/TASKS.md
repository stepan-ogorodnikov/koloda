# Task Guide for AI Agents

This guide defines how an agent creates and maintains a task file.
A task file is one unit of work: intent, status, open questions, and the plan.

A task that needs a file lives on its own branch and pull request.
Branch name: `task/<slug>`.
The live file on that branch is `tasks/live/<slug>.md`.
On `done`, move it to `tasks/archive/<slug>.md` on the same branch, then merge.
Do not rename the slug.
To abandon the work, close the PR without merging and delete the branch; the branch deletion (or an abandon commit on the branch) records why.

The plan lives in the task file's Plan section.
Do not write a separate plan file.

The repository is the source of truth.
Do not track work in GitHub Issues.

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

One task = one branch = one PR.
Parallel tasks are parallel branches and PRs.
Do not serialize work on `main` to keep commits contiguous; the PR holds the commit train.

### Schedule (create)

1. Create branch `task/<slug>` from the current integration branch (usually `main`).
2. Add `tasks/live/<slug>.md` with `Status: draft`.
3. Push and open a **draft** PR titled after the task.
   PR body includes one line: `Task: <slug>`.
4. That draft PR is the scheduled unit of work.
   Finding scheduled and in-flight work means listing open PRs for `task/*` branches, not grepping `main`.

A `draft` file exists while intent and the plan are being shaped on the branch.

### Ready (plan approved)

Plan approval flips the file to `Status: ready` and is not an instruction to implement.
Keep the PR draft until the human explicitly asks to implement.
Do not change status for that ask; `ready` stays `ready` until `done`.

If the task depends on another open task, say so in Plan `Depends on:` and either:
- stack this branch on that task's branch, or
- wait to branch from `main` until the dependency has merged.

Do not assume merge order from PR numbers alone.

### Implement

When the human asks to implement:

1. Mark the PR ready for review (leave draft).
2. Implement one Plan item per commit on `task/<slug>`.
3. Every commit that belongs to the task carries one body line: `Task: <slug>`.
   The slug is the identity; the folder is not.
4. Tick each Plan checkbox when that commit exists.
5. Merge with history preserved (rebase merge or merge commit).
   Do not squash — Plan items stay separate commits for reviewability.

### Done (merge)

On completion, on the task branch:

1. Fill Outcome.
2. Flip Status to `done`.
3. Move `tasks/live/<slug>.md` to `tasks/archive/<slug>.md`.
4. Merge the PR.
   After merge, the archive file is on the integration branch; the live path is gone.

Commits on `main` may interleave across tasks.
Recover one task's history from its merged PR or with `git log --grep='Task: <slug>'`.

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

1. Before starting work, list open `task/*` PRs (draft and ready for review).
   For each that might overlap the intended work, check out or read `tasks/live/<slug>.md` on that branch (Intent and Scope).
   If any overlap, surface it to the human; never resolve overlap silently.
   Do not rely on grepping `tasks/live` on `main` — in-flight files are not there.
2. Record open questions as they appear.
   Do not guess answers.
3. Before ending a session, update Open questions and Plan on the task branch so the next session can start from the file.
4. On completion, fill Outcome, flip Status to `done`, move the file to `tasks/archive/<slug>.md`, and merge with history preserved.
5. To abandon, close the PR without merging and delete the branch.

A new session starts from the task file on its branch (and the PR), not from memory or chat history.
