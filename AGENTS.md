# Agents

Rules for every change.
Guides for a specific change are routed from `agents/INDEX.md`.
Run that routing yourself, load only the guides it lists,
and record a task's set on its `Guides:` line (`agents/TASKS.md`).
Later sessions read that line instead of routing again.

## Git

- Make changes in the working tree only.
- Commit, push, and land only when the human explicitly asks for that step.
- Asking for one step is not asking for the next.
- Exception: task work under `agents/TASKS.md` commits its task branch as that guide says.
  - It pushes only when the task's `Flow` is `remote`; the default is `local`.
  - Landing still needs an explicit ask.
- Do not open pull requests.
- Do not push to `main` by hand.
- Commit messages have a short subject line.
  - A body is optional; add one when the why is not obvious from the diff.
  - Planned work's subjects are the `Commit:` lines in its task file.

## Session start

- On a `task/*` branch, read `tasks/live/<slug>.md` and `agents/TASKS.md` before any other work.
- The session protocol in `agents/TASKS.md` says what to check first.

## Verification

- Never start the app or Playwright unless the human asks for that command.
- `agents/VERIFY.md` says how to check a change.

## Scratch

- Use `tmp/` for scratch and generated output.
- `tmp/` is gitignored and ephemeral.

## Landing

- `main` moves only through `bun run land`.
- It rebases onto `origin/main`, waits for CI `checks` on that exact commit, and fast-forwards `main`.
- If `land` stops on a failed check, report it and wait.
- Do not work around the gate.
