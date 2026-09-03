# Agent Guide Index

Human-only routing table.
Do not paste this file into a prompt.
It exists so you can pick the minimal set of guides for a narrow task without bloating the model's context.

There is no `AGENTS.md` on purpose.
Include only the guides the task needs.
This file tells you which those are.

## How to use

Find your change type in the table.
Paste the listed guides into the prompt, plus the task description.
Nothing else.
For an audit, use the Auditing section, not the Authoring table alone.

Before routing a change, grep live task files: `rg --crlf -l '^Status: (draft|ready)$' tasks/live`.
If a hit's Intent or Scope overlaps the intended work, also paste that file and `agents/TASKS.md`.

Load one primary spec, not a cluster.
If the task crosses that spec's stated out-of-scope, add the sibling it names.
Do not add the rest of the area by default.
When the change edits a file under `docs/specs/`, also include `agents/FUNCTIONAL-SPECIFICATIONS.md`.

The listed files are relative to the repo root.

## Authoring

| Change type | Include in the prompt |
| --- | --- |
| Any TS or React edit | `agents/CODE-STYLE.md`, `agents/CODE-DOCUMENTATION.md` |
| Change adds or edits tests | add `agents/TESTING.md` |
| Edit touches `className` | add `agents/CSS.md` |
| Split multi-commit work into a plan (feature, audit report) | `agents/IMPLEMENTATION-PLAN.md`, `agents/TASKS.md`, plus the area guides the work needs |
| Start or continue a task file | the task file, `agents/TASKS.md` |
| Add an AI provider | `agents/ADD-AI-PROVIDER.md`, `docs/specs/AI-PROVIDERS.md`, `agents/CODE-STYLE.md`, `agents/CODE-DOCUMENTATION.md`, `agents/I18N.md`, `docs/adr/0001-TS-RUST-DOMAIN-MIRRORING.md` |
| Assistant chat (anything) | `agents/ASSISTANT-MAP.md` (it routes to one spec and the files) |
| Cards (content, state, add/edit/delete, views) | `docs/specs/CARDS.md` |
| Decks (create, edit algorithm/template, delete) | `docs/specs/DECKS.md` |
| Lessons (overview, today's progress, session, amounts, grading, learn-ahead) | `docs/specs/LESSONS.md` |
| Templates (fields, layout, locking) | `docs/specs/TEMPLATES.md` |
| Algorithms / presets | `docs/specs/ALGORITHMS.md` |
| Learning settings (defaults, daily limits, day boundary, learn-ahead limit) | `docs/specs/LEARNING-SETTINGS.md` |
| Database schema change | `agents/DB.md`, `docs/adr/0001-TS-RUST-DOMAIN-MIRRORING.md`, `docs/adr/0002-DUAL-PLATFORM-PERSISTENCE.md` |
| Change inside `crates/koloda-core` (Rust domain, repos, settings slices, FSRS, reviews) | `agents/CORE-CRATE.md`, `docs/adr/0001-TS-RUST-DOMAIN-MIRRORING.md` |
| Add a color theme | `agents/ADD-COLOR-THEME.md`, `docs/specs/INTERFACE-SETTINGS.md` |
| Interface settings change (language, scheme, themes, motion) | `docs/specs/INTERFACE-SETTINGS.md`, `agents/I18N.md` |
| Add a hotkey | `agents/ADD-HOTKEY.md`, `docs/specs/HOTKEYS.md`, `agents/I18N.md` |
| Write or update a functional spec | `agents/FUNCTIONAL-SPECIFICATIONS.md`, `agents/MARKDOWN.md` |
| Write or update an ADR (new area decision) | `docs/adr/README.md`, `agents/MARKDOWN.md` |
| Write or update any markdown | `agents/MARKDOWN.md` |

## Reviewing

Always include `agents/REVIEW.md`.
Then add the same guides the author used for that change type, so the reviewer applies the same rules.

| Review target | Add to `agents/REVIEW.md` |
| --- | --- |
| Any diff | `agents/CODE-STYLE.md`, `agents/CODE-DOCUMENTATION.md` |
| Diff adds or changes tests | add `agents/TESTING.md` |
| Diff touches `className` | add `agents/CSS.md` |
| Add AI provider diff | `agents/ADD-AI-PROVIDER.md`, `docs/specs/AI-PROVIDERS.md`, `agents/I18N.md`, `docs/adr/0001-TS-RUST-DOMAIN-MIRRORING.md` |
| Assistant chat diff | `agents/ASSISTANT-MAP.md` (+ the one spec it names) |
| Cards diff | `docs/specs/CARDS.md` |
| Decks diff | `docs/specs/DECKS.md` |
| Lessons diff | `docs/specs/LESSONS.md` |
| Templates diff | `docs/specs/TEMPLATES.md` |
| Algorithms diff | `docs/specs/ALGORITHMS.md` |
| Learning settings diff | `docs/specs/LEARNING-SETTINGS.md` |
| Schema change diff | `agents/DB.md`, `docs/adr/0001`, `docs/adr/0002` |
| koloda-core diff | `agents/CORE-CRATE.md`, `docs/adr/0001` |
| Theme diff | `agents/ADD-COLOR-THEME.md`, `docs/specs/INTERFACE-SETTINGS.md` |
| Interface settings diff | `docs/specs/INTERFACE-SETTINGS.md` |
| Hotkey diff | `agents/ADD-HOTKEY.md`, `docs/specs/HOTKEYS.md`, `agents/I18N.md` |
| Functional spec diff | `agents/FUNCTIONAL-SPECIFICATIONS.md`, `agents/MARKDOWN.md` |

## Auditing

Always include `agents/AUDIT.md` and the standing authoring guides:
`agents/CODE-STYLE.md`, `agents/CODE-DOCUMENTATION.md`, `agents/TESTING.md`, `agents/BACKWARDS-COMPATIBILITY.md`.
Then add the Authoring-table guides for the target, the same way Reviewing does.

Also add:

- `agents/FUNCTIONAL-SPECIFICATIONS.md` when a spec is in scope
- `agents/CSS.md` when UI is in scope
- `agents/I18N.md` when user-visible strings are in scope
- `docs/adr/0001-TS-RUST-DOMAIN-MIRRORING.md` when the target crosses TypeScript and Rust
- `docs/adr/0002-DUAL-PLATFORM-PERSISTENCE.md` when the target includes persistence
- `agents/ASSISTANT-MAP.md` for assistant
- the package README for each package in scope
- `apps/native-electron/IPC.md` when the target includes desktop IPC

One primary spec, one package, or one named cross-cutting question per audit.
If the target spans more than one primary spec without a single cross-cutting question, split it.

Planning work from a finished audit report is still the Authoring row for a multi-commit plan.

## Always-available background

Do not paste these unless the task touches them.
Consult them yourself when a change crosses a boundary.

- `agents/BACKWARDS-COMPATIBILITY.md` — deletion policy, no shims.
- `docs/adr/0001-TS-RUST-DOMAIN-MIRRORING.md` — why TS and Rust both exist.
- `docs/adr/0002-DUAL-PLATFORM-PERSISTENCE.md` — why two DB engines exist.
- `libs/*/README.md`, `apps/*/README.md` — per-package "Where it sits" and "Does NOT own" boundaries.
- `apps/native-electron/IPC.md` — the desktop renderer ↔ main IPC channel contract.

## Rule to remember

Minimal context is the goal.
If a guide is not relevant to the task, do not include it.
This index helps you omit, not pile on.
A spec that is only linked from the primary spec is not in the prompt until the task actually needs it.