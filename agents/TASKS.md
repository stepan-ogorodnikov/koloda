# Task Guide for AI Agents

This guide defines how an agent creates and maintains a task file.
A task file is one unit of work: intent, status, open questions, and the plan.

A task that needs a file lives on its own branch and pull request.
Branch name: `task/<slug>`.
The live file on that branch is `tasks/live/<slug>.md`.
On `done`, move it to `tasks/archive/<slug>.md` on the same branch.
Do that only when the tip is green.
Then merge.
Never commit on top of Archive.
Do not rename the slug.
To abandon the work, close the PR without merging and delete the branch.
The branch deletion (or an abandon commit on the branch) records why.

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

## Lifecycle

Statuses: `draft` → `ready` → `done`.
The status lives on one fixed line, exactly `Status: <draft|ready|done>`.

One task = one branch = one PR.
Parallel tasks are parallel branches and PRs.
Do not serialize work on `main` to keep commits contiguous.
The PR holds the commit train.

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
3. Push and open a **draft** PR titled after the task.
   - PR body includes one line: `Task: <slug>`.
4. That draft PR is the scheduled unit of work.
   - Finding scheduled and in-flight work means listing open PRs for `task/*` branches.
   - Do not grep `main`.

A `draft` file exists while intent and the plan are being shaped on the branch.

### Ready (plan approved)

Plan approval flips the file to `Status: ready`.
Approval is not an instruction to implement.
Keep the PR draft until the human explicitly asks to implement.
Do not change status for that ask.
`ready` stays `ready` until `done`.

If the task depends on another open task, say so in Plan `Depends on:`.
Then either stack or wait.

- Stack this branch on that task's branch.
- Wait to branch from `origin/main` until the dependency has merged.

Do not assume merge order from PR numbers alone.

### Implement

When the human asks to implement.

1. Keep the PR draft while implementing.
2. Implement one Plan item per commit on `task/<slug>`.
3. Every commit that belongs to the task carries one body line: `Task: <slug>`.
   - The slug is the identity.
   - The folder is not the identity.
4. Tick each Plan checkbox when that commit exists.
5. Keep history linear.
   - Never create a merge commit.
   - Never run `git merge`.
   - Never run `git pull` without `--rebase`.
   - Never run `gh pr merge --merge`.
   - To sync, run `git fetch origin && git rebase origin/main`.
   - To merge the PR, use rebase merge or fast-forward only.
   - Run `gh pr merge --rebase`.
   - Do not squash.
   - Plan items stay separate commits for reviewability.

### Review (gate before archive)

1. After the last Plan item, mark the PR ready for review.
2. Do not archive yet.
3. Review per `agents/REVIEW.md` plus the task's area guides.
4. If changes are needed, add them as new commits on `task/<slug>`.
   - Each commit carries a `Task: <slug>` trailer.
   - Update Plan checkboxes if scope changed.
   - Then re-request review.
5. Do not create the archive commit until review passes.
6. Before that commit, required checks on the current tip are green.
   - Until PR CI exists, the local stand-in is `bun run check:push` and `bun run test:libs`.
   - When PR status checks exist, those are required checks too.
   - Do not archive on a red tip.
   - On a flake, re-run the checks.
   - Do not archive to get past red.
7. Nothing commits after archive except merge.
   - Never commit on top of Archive.
   - If Archive is already the tip, recovery is reset, then re-archive (Done).

### Done (merge, gated)

Gate: the branch merges only if all three hold.

- The oldest commit on `origin/main..HEAD` is the Add commit.
- The newest commit on `origin/main..HEAD` is the Archive commit.
- Every commit carries `Task: <slug>`.

The tip must be green at merge time.
Same checks as before Archive.

The Add commit adds `tasks/live/<slug>.md`.
The Archive commit moves `tasks/live/<slug>.md` to `tasks/archive/<slug>.md`.
The Archive commit has `Status: done` and Outcome filled.

Verify with `git log origin/main..HEAD --oneline` before merging.
If Add is not first or Archive is not last, stop.
If the tip is red, stop.

If Archive is already the tip and review needs changes, or checks are red, reset that Archive commit off the tip.
Soft reset if reusing the task-file edit.
Otherwise recreate Archive later.
Add fix commits.
Each carries `Task: <slug>`.
Update Plan if scope changed.
Get the tip green.
Re-pass review if the fix needs it.
Create a new Archive commit.
Status `done`, Outcome filled, move `live/` to `archive/`.
Force-push with lease if the branch was already pushed.
Merge only when Add is oldest, Archive is newest, every commit has `Task: <slug>`, and the tip is green.
Never commit on top of Archive.
Reset and re-archive is the only path.

On completion, work on the task branch.
Review has passed.
Required checks on the tip are green.

1. Fill Outcome.
2. Flip Status to `done`.
3. Move `tasks/live/<slug>.md` to `tasks/archive/<slug>.md`.
4. Merge the PR with rebase merge or fast-forward only.
   - Do not create merge commits.
   - The tip is green.
   - After merge, the archive file is on the integration branch.
   - The live path is gone.

Commits on `main` may interleave across tasks.
Recover one task's history from its merged PR.
Or use `git log --grep='Task: <slug>'`.

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

1. Before starting work, list open `task/*` PRs.
   - Include draft and ready for review.
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
4. After review passes and the tip is green, archive as the last commit.
   - Until PR CI exists, the local stand-in is `bun run check:push` and `bun run test:libs`.
   - When PR status checks exist, those are required checks too.
   - Do not archive on a red tip.
   - On a flake, re-run the checks.
   - Do not archive to get past red.
   - Fill Outcome.
   - Flip Status to `done`.
   - Move `tasks/live/<slug>.md` to `tasks/archive/<slug>.md`.
   - Merge with rebase merge or fast-forward only.
   - Do not create merge commits.
   - Merge only when Add is oldest, Archive is newest, every commit has `Task: <slug>`, and the tip is green.
   - Never commit on top of Archive.
   - If Archive is already the tip and review or checks fail, reset it, fix, then re-archive.
5. To abandon, close the PR without merging and delete the branch.

A new session starts from the task file on its branch.
It also starts from the PR.
It does not start from memory or chat history.
