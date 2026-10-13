# Agents

Rules for every change.
Everything else is routed from `agents/INDEX.md`; run that routing yourself.

## Git

- Make changes in the working tree only.
- Commit, push, and land only when the human explicitly asks for that step.
  - Asking for one step is not asking for the next.
  - Exception: task branches commit and push as `agents/TASKS.md` says.
- Do not open pull requests.
- Commit subjects are one short line; add a body only when the why is not obvious from the diff.

## Session start

On a `task/*` branch, read `tasks/live/<slug>.md` and `agents/TASKS.md` first, and follow its session protocol.

## Verification

Never start the app or Playwright unless the human asks for that command.
An audit may run the e2e suites, as `agents/AUDIT.md` (§Method) says.
`agents/VERIFY.md` says how to check a change.

## Scratch

Use `tmp/` (gitignored, ephemeral) for scratch and generated output.
Durable files and commit messages must not cite `tmp/` or other ephemeral paths.
Later sessions cannot open them, so restate what they need.

## Landing

- `main` moves only through `bun run land`; never push to it by hand.
- If `land` stops on a failed check, report it and wait. Do not work around the gate.
