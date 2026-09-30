# Task Guide for AI Agents

This guide defines how an agent creates and maintains a task file.
A task file is one unit of work: intent, status, open questions, and the plan.

A task that needs a file lives on its own branch.
Branch name: `task/<slug>`.
The live file on that branch is `tasks/live/<slug>.md`.
On `done`, move it to `tasks/archive/<slug>.md` on the same branch.
Do that only when the tip is green.
Done starts only when the human asks to land.
Then `bun run land` puts the branch on `main`.
Never commit on top of Archive.
Do not rename the slug.
To abandon the work, delete the branch.

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
The branch holds the commit train.
When the human asks to land, `bun run land` carries it to `main`.

### Schedule (create)

1. Sync, then branch from `origin/main`.
   - Run `git fetch origin`.
   - `git status --porcelain` must be empty.
   - `git log origin/main..HEAD` must be empty.
   - Push or stash unrelated work first.
   - Then run `git checkout -b task/<slug> origin/main`.
   - If `git log origin/main..HEAD` shows commits without `Task: <slug>`, stop.
   - A hit means the branch is contaminated.
2. Add `tasks/live/<slug>.md` with `Status: draft`.
3. Push the branch.
4. The branch and its task file are the scheduled unit of work.
   - Finding scheduled and in-flight work means listing `task/*` branches.
   - Run `git ls-remote --heads origin 'task/*'`; also check local `git branch --list 'task/*'`.
   - Do not grep `main`.

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
   - Never push to `main` directly; `bun run land` is the only way onto it.
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
   - Do not archive yet.
   - Archive happens at Done, after the human asks to land.
   - If the human asks for changes, add commits and self-review again.

### Done (land, gated)

Done starts only when the human asks to land.
A passing self-review is not that ask.

Gate: the branch lands only if all four hold.

- The human asked to land.
- The oldest commit on `origin/main..HEAD` is the Add commit.
- The newest commit on `origin/main..HEAD` is the Archive commit.
- Every commit carries `Task: <slug>`.

The tip must be green when it lands.
`main` accepts only a commit whose CI job `checks` (`bun run check:push`) passed.

The Add commit adds `tasks/live/<slug>.md`.
The Archive commit moves `tasks/live/<slug>.md` to `tasks/archive/<slug>.md`.
The Archive commit has `Status: done` and Outcome filled.

Verify with `git log origin/main..HEAD --oneline` before landing.
If Add is not first or Archive is not last, stop.
If the tip is red, stop.

Nothing commits after Archive.
If Archive is already the tip and changes are needed, or checks are red, reset that Archive commit off the tip.
Soft reset if reusing the task-file edit.
Otherwise recreate Archive later.
Add fix commits.
Each carries `Task: <slug>`.
Update Plan if scope changed.
Get the tip green.
Self-review again if the fix needs it.
Create a new Archive commit.
Status `done`, Outcome filled, move `live/` to `archive/`.
Force-push with lease if the branch was already pushed.
Land only when the gate holds and the tip is green.
Never commit on top of Archive.
Reset and re-archive is the only path.

When the human asks to land, work on the task branch.
Self-review has passed.
Required checks on the tip are green.
Do not archive on a red tip.

1. Fill Outcome.
2. Flip Status to `done`.
3. Move `tasks/live/<slug>.md` to `tasks/archive/<slug>.md`.
4. Run `bun run land`.
   - It rebases onto `origin/main`, pushes the branch, and waits for `checks` on that exact tip.
   - Then it fast-forwards `main` to the tip and deletes the remote branch.
   - If `main` moved meanwhile, it rebases and checks again.
   - If `checks` fails, it stops; reset Archive, fix, and re-archive as above.
   - After landing, the archive file is on `main`.
   - The live path is gone.

Commits on `main` may interleave across tasks.
Recover one task's history with `git log --grep='Task: <slug>'`.

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
4. After self-review passes and the tip is green, report to the human and wait.
   - Green is the CI job `checks` on the pushed tip, or `bun run check:push` locally.
   - Do not archive yet.
5. When the human asks to land, archive as the last commit, then run `bun run land`.
   - Do not archive on a red tip.
   - Do not archive to get past red.
   - Fill Outcome.
   - Flip Status to `done`.
   - Move `tasks/live/<slug>.md` to `tasks/archive/<slug>.md`.
   - Land only when the Done gate holds and the tip is green.
   - Never commit on top of Archive.
   - If Archive is already the tip and changes are needed or checks fail, reset it, fix, then re-archive.
6. To abandon, delete the branch locally and on `origin`.

A new session starts from the task file on its branch.
It does not start from memory or chat history.
