# Agents

Rules for every change.
Guides for a specific change are routed from `agents/INDEX.md`.
Run that routing yourself, load only the guides it lists, and record a task's set on its `Guides:` line (`agents/TASKS.md`).
Later sessions read that line instead of routing again.

## Git

- Make changes in the working tree only.
- Commit, push, and land only when the human explicitly asks for that step.
- Asking for one step is not asking for the next.
- Exception: task work under `agents/TASKS.md` commits and pushes its task branch as that guide says.
  - Landing still needs an explicit ask.
- Do not open pull requests.
- Do not push to `main` by hand.

## Landing

- `main` moves only through `bun run land`.
- It rebases onto `origin/main`, waits for CI `checks` on that exact commit, and fast-forwards `main`.
- If `land` stops on a failed check, report it and wait.
- Do not work around the gate.
