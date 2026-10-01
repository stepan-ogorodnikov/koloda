# Task Guide for AI Agents

This guide defines how an agent creates and maintains a task file.
A task file is one unit of work: intent, status, open questions, and the plan.

A task that needs a file lives on its own branch, `task/<slug>`.
The live file on that branch is `tasks/live/<slug>.md`.
The plan lives in the task file's Plan section.
Do not write a separate plan file.

The repository is the source of truth.
Do not track work in GitHub Issues.

## When a task file is required

Create one when any of these hold.

- The work spans more than one session.
- The work needs a multi-commit plan.
- The work crosses layers or packages.
- The work carries an open question that needs a durable home.

A small fix, a typo-level doc edit, or a mechanical rename does not need a task file.
Git history is enough.
It still reaches `main` only through `bun run land`, run from any branch or from `main`.

## Lifecycle

Statuses: `draft` → `ready` → `done`.
The status lives on one fixed line, exactly `Status: <draft|ready|done>`.

One task = one branch.
Parallel tasks are parallel branches.
Do not serialize work on `main` to keep commits contiguous.
The branch holds the commit train until the human asks to land.

### Schedule (create)

1. Sync, then branch from `origin/main`.
   - Run `git fetch origin`.
   - `git status --porcelain` must be empty.
   - `git log origin/main..HEAD` must be empty.
   - Push or stash unrelated work first.
   - Then run `git checkout -b task/<slug> origin/main`.
2. Add `tasks/live/<slug>.md` with `Status: draft`.
3. Push the branch.

The branch and its task file are the scheduled unit of work.
Find scheduled and in-flight work by listing `task/*` branches (§Session protocol), not by grepping `main`.
A `draft` file exists while intent and the plan are being shaped on the branch.

### Ready (plan approved)

Plan approval flips the file to `Status: ready`.
Approval is not an instruction to implement.
Wait for the human to explicitly ask to implement.
Do not change status for that ask.
`ready` stays `ready` until `done`.

If the task depends on another open task, say so in Plan `Depends on:`.
Then either stack or wait.

- Stack this branch on that task's branch.
- Wait to branch from `origin/main` until the dependency has landed.

Do not assume the order in which tasks land.

### Implement

When the human asks to implement.

1. Implement one Plan item per commit on `task/<slug>`.
2. Every commit that belongs to the task carries one body line: `Task: <slug>`.
   - The slug is the identity.
   - The folder is not the identity.
3. Tick each Plan checkbox when that commit exists.
4. Push the branch as commits are made.
   - Each push runs the CI job `checks` on the tip.
5. Keep history linear.
   - Never create a merge commit.
   - Never run `git merge`.
   - Never run `git pull` without `--rebase`.
   - To sync, run `git fetch origin && git rebase origin/main`.
   - Do not squash.
   - Plan items stay separate commits for reviewability.

### Self-review (agent, before the human's ask)

Self-review is the agent checking its own work.
It is not the human's approval.

1. Self-review after the last Plan item.
   - The diff under review is `origin/main..HEAD`.
   - Review per `agents/REVIEW.md` plus the task's area guides.
2. If changes are needed, add them as new commits on `task/<slug>`.
   - Each commit carries a `Task: <slug>` trailer.
   - Update Plan checkboxes if scope changed.
   - Then self-review again.
3. When self-review passes, required checks on the tip must be green.
   - That is the CI job `checks` on the pushed tip, or `bun run check:push` locally.
   - On a flake, re-run the checks.
4. Then report to the human and wait.
   - Do not archive yet; that is Done.
   - If the human asks for changes, add commits and self-review again.

### Done (land, gated)

Done starts only when the human asks to land.
A passing self-review is not that ask.

Gate: the branch lands only if all of these hold.

- The human asked to land.
- The oldest commit on `origin/main..HEAD` is the Add commit.
  It adds `tasks/live/<slug>.md`.
- The newest commit on `origin/main..HEAD` is the Archive commit.
  It moves the file to `tasks/archive/<slug>.md`, with `Status: done` and Outcome filled.
- Every commit carries `Task: <slug>`.
- The tip is green: its CI job `checks` (`bun run check:push`) passed.

Check the order with `git log origin/main..HEAD --oneline` before landing.
If the gate does not hold, stop.

On the task branch, once self-review has passed and the tip is green:

1. Fill Outcome.
2. Flip Status to `done`.
3. Move `tasks/live/<slug>.md` to `tasks/archive/<slug>.md` and commit it as Archive.
4. Run `bun run land`.
   - It rebases onto `origin/main`, pushes the branch, and waits for `checks` on that exact tip.
   - Then it fast-forwards `main` to the tip and deletes the remote branch.
   - If `main` moved meanwhile, it rebases and checks again.
   - If `checks` fails, it stops; fix as in §Fix after Archive.

After landing, the archive file is on `main` and the live path is gone.
Commits on `main` may interleave across tasks.
Recover one task's history with `git log --grep='Task: <slug>'`.

### Fix after Archive

Never commit on top of Archive.
Do not archive on a red tip, or to get past red.
If Archive is the tip and changes are needed or checks are red, reset and re-archive:

1. Reset the Archive commit off the tip.
   - Soft reset if reusing the task-file edit; otherwise recreate it later.
2. Add fix commits, each with `Task: <slug>`.
   - Update Plan if scope changed.
3. Get the tip green.
   - Self-review again if the fix needs it.
4. Create a new Archive commit.
5. Force-push with lease if the branch was already pushed.

## File

Slug is lowercase kebab-case.
Do not put status in the filename.
Do not rename the slug or the file.
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

## Session protocol

1. Before starting work, list `task/*` branches.
   - Run `git ls-remote --heads origin 'task/*'`; also check local `git branch --list 'task/*'`.
   - For each overlapping candidate, read `tasks/live/<slug>.md` on that branch.
   - Check Intent and Scope.
   - If any overlap, surface it to the human.
   - Never resolve overlap silently.
   - Do not grep `tasks/live` on `main`.
   - In-flight files are not there.
2. Record open questions as they appear.
   - Do not guess answers.
3. Before ending a session, update Open questions and Plan on the task branch.
   - The next session starts from the file.
4. After self-review passes on a green tip, report to the human and wait (§Self-review).
5. When the human asks to land, follow §Done.
6. To abandon, delete the branch locally and on `origin`.

A new session starts from the task file on its branch.
It does not start from memory or chat history.
