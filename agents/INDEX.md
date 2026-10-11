# Agent Guide Index

Routing table for agents.
Pick the minimal set of guides for a task, so a narrow change does not load the whole area.

`AGENTS.md` holds only the rules every change needs, such as how changes reach `main`.
Agents load it on their own.
Everything else is routed here.
Include only the guides the task needs.
This file tells you which those are.

## How to use

Find your change type in the table.
Read the listed guides, plus the task description.
Nothing else.
For an audit, use the Auditing section, not the Authoring table alone.
A task file's `Guides:` line records the set it was routed to; re-route here only when its scope changes.

Before routing a change, list in-flight tasks: `git ls-remote --heads origin 'task/*'`.
Task files live on their `task/<slug>` branch, not on `main`.
If a task's Intent or Scope overlaps the intended work, also read its `tasks/live/<slug>.md` and `agents/TASKS.md`.

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
| Add an AI provider | `agents/ADD-AI-PROVIDER.md`, `docs/specs/AI-PROVIDERS.md`, `agents/CODE-STYLE.md`, `agents/CODE-DOCUMENTATION.md`, `agents/I18N.md`, `docs/decisions/TS-RUST-DOMAIN-MIRRORING.md` |
| Add an assistant tool | `agents/ADD-ASSISTANT-TOOL.md`, `docs/specs/ASSISTANT-DATA-ACCESS.md`, `agents/CODE-STYLE.md`, `agents/CODE-DOCUMENTATION.md`, `agents/I18N.md` |
| Assistant conversation list (create, name, unread, clone, delete) | `docs/specs/ASSISTANT-CONVERSATION-LIST.md`, `agents/ASSISTANT-MAP.md` |
| Assistant chat (anything else) | `agents/ASSISTANT-MAP.md` (it routes to one spec and the files) |
| Cards (content, state, add/edit/delete, views) | `docs/specs/CARDS.md` |
| Move a card between decks or change a card's template | `docs/specs/CARDS.md`, `docs/decisions/FIXED-CARD-PARENTS.md` |
| Card images (insert, formats, where they show) | `docs/specs/MEDIA.md` |
| Decks (create, edit algorithm/template, delete) | `docs/specs/DECKS.md` |
| Lessons (overview, today's progress, session, amounts, grading, learn-ahead) | `docs/specs/LESSONS.md` |
| Templates (fields, layout, locking) | `docs/specs/TEMPLATES.md` |
| Algorithms / presets | `docs/specs/ALGORITHMS.md` |
| Learning settings (defaults, daily limits, day boundary, learn-ahead limit) | `docs/specs/LEARNING-SETTINGS.md` |
| Database schema change | `agents/DB.md`, `docs/decisions/TS-RUST-DOMAIN-MIRRORING.md` |
| Card media storage (attachments, hash ids, byte store) | `docs/decisions/MEDIA-STORAGE.md`, `docs/decisions/TS-RUST-DOMAIN-MIRRORING.md` |
| Sync modules in `crates/koloda` (`src/repo/sync/`: capture, apply, push, restore, join, backfill) | `crates/koloda/src/repo/sync/README.md`, `crates/koloda-sync-proto/PROTOCOL.md`, `agents/RUST.md` |
| Change inside `crates/koloda` (Rust domain, repos, settings slices, FSRS, reviews) | `agents/RUST.md`, `docs/decisions/TS-RUST-DOMAIN-MIRRORING.md` |
| Sync wire protocol (envelope, field-group registry, clock, codecs; `crates/koloda-sync-proto`) | `crates/koloda-sync-proto/PROTOCOL.md`, `crates/koloda-sync-proto/README.md` |
| Sync engine on native devices (`crates/koloda-sync`: cycle, runner, pairing, fork, restore, attachments) | `crates/koloda-sync/README.md`, `crates/koloda-sync-proto/PROTOCOL.md` |
| Desktop Rust addon (`apps/electron/src-rust`, hosts the sync engine) | `apps/electron/README.md`; add `apps/electron/IPC.md` when a channel changes |
| Sync server (`crates/koloda-server`: routes, envelope log, pairing, quotas, backup, restore, CLI) | `crates/koloda-server/README.md`, `crates/koloda-sync-proto/PROTOCOL.md` |
| Sync server database (`crates/koloda-server/src/migrations/server/`, `space/`; not the desktop series, so not `DB.md`) | `crates/koloda-server/README.md` (§Data directory); add `crates/koloda-sync-proto/PROTOCOL.md` when devices see the change |
| Docker image or compose example (`crates/koloda-server/Dockerfile`, `deploy/`, `.dockerignore`) | `crates/koloda-server/README.md` (§Docker) |
| Sync screens, sync status, joining and leaving a space (desktop only) | `docs/specs/SYNC.md`, `agents/I18N.md` |
| Add a color theme | `agents/ADD-COLOR-THEME.md`, `docs/specs/INTERFACE-SETTINGS.md` |
| Interface settings change (language, scheme, themes, motion) | `docs/specs/INTERFACE-SETTINGS.md`, `agents/I18N.md` |
| App shell layout (narrow/wide, drawer, nav) | `agents/LAYOUT.md`, `agents/CSS.md`; add `docs/specs/INTERFACE-SETTINGS.md` when the change is an interface setting |
| User-visible behavior (UI copy, flows, settings the user touches) | area primary spec (or `agents/ASSISTANT-MAP.md` for assistant), `agents/VERIFY.md`, plus the usual CODE-STYLE / CODE-DOCUMENTATION as for any TS/React edit |
| Add a hotkey | `agents/ADD-HOTKEY.md`, `docs/specs/HOTKEYS.md`, `agents/I18N.md` |
| Write or update a functional spec | `agents/FUNCTIONAL-SPECIFICATIONS.md`, `agents/MARKDOWN.md` |
| Write or update a decision | `agents/DECISIONS.md`, `agents/MARKDOWN.md` |
| Write or update any markdown | `agents/MARKDOWN.md` |
| Playwright e2e suites (`apps/web-e2e`, `apps/electron-e2e`, `libs/e2e`) | `apps/web-e2e/README.md` or `apps/electron-e2e/README.md`, `libs/e2e/README.md`, `agents/VERIFY.md` |
| Desktop IPC channel (renderer ↔ main; `libs/native-ipc`) | `apps/electron/IPC.md`, `libs/native-ipc/README.md` |
| CI workflows, push gate, landing (`.github/workflows/`, `tools/land.ts`, `tools/check-push.ts`) | No guide yet. `AGENTS.md` (§Landing) is always loaded; the workflow files and `tools/` are the reference |
| Workspace dependency layers (`tools/workspace-deps/`, `bun run check:workspace-deps`) | No guide yet. `tools/workspace-deps/layers.ts` is the table; each lib's `README.md` "Where it sits" and "Does NOT own" give its boundaries |
| Other `tools/` files (pre-commit hook, vitest config, theme-boot Vite plugin) | No guide yet. The files are the reference; the theme-boot `SURFACE` map is in `agents/ADD-COLOR-THEME.md` |

## Reviewing

Always include `agents/REVIEW.md`.
Then add the same guides the author used for that change type, so the reviewer applies the same rules.

| Review target | Add to `agents/REVIEW.md` |
| --- | --- |
| Any diff | `agents/CODE-STYLE.md`, `agents/CODE-DOCUMENTATION.md` |
| Diff adds or changes tests | add `agents/TESTING.md` |
| Diff touches `className` | add `agents/CSS.md` |
| Add AI provider diff | `agents/ADD-AI-PROVIDER.md`, `docs/specs/AI-PROVIDERS.md`, `agents/I18N.md`, `docs/decisions/TS-RUST-DOMAIN-MIRRORING.md` |
| Add assistant tool diff | `agents/ADD-ASSISTANT-TOOL.md`, `docs/specs/ASSISTANT-DATA-ACCESS.md`, `agents/I18N.md` |
| Assistant conversation list diff | `docs/specs/ASSISTANT-CONVERSATION-LIST.md`, `agents/ASSISTANT-MAP.md` |
| Assistant chat diff | `agents/ASSISTANT-MAP.md` (+ the one spec it names) |
| Cards diff | `docs/specs/CARDS.md` |
| Card images diff | `docs/specs/MEDIA.md` |
| Decks diff | `docs/specs/DECKS.md` |
| Lessons diff | `docs/specs/LESSONS.md` |
| Templates diff | `docs/specs/TEMPLATES.md` |
| Algorithms diff | `docs/specs/ALGORITHMS.md` |
| Learning settings diff | `docs/specs/LEARNING-SETTINGS.md` |
| Schema change diff | `agents/DB.md`, `docs/decisions/TS-RUST-DOMAIN-MIRRORING.md` |
| Card media storage diff | `docs/decisions/MEDIA-STORAGE.md`, `docs/decisions/TS-RUST-DOMAIN-MIRRORING.md` |
| Sync modules diff (`crates/koloda/src/repo/sync/`) | `crates/koloda/src/repo/sync/README.md`, `crates/koloda-sync-proto/PROTOCOL.md`, `agents/RUST.md` |
| `crates/koloda` / `koloda` crate diff | `agents/RUST.md`, `docs/decisions/TS-RUST-DOMAIN-MIRRORING.md` |
| `crates/koloda-sync-proto` diff | `crates/koloda-sync-proto/PROTOCOL.md`, `crates/koloda-sync-proto/README.md` |
| `crates/koloda-sync` diff | `crates/koloda-sync/README.md`, `crates/koloda-sync-proto/PROTOCOL.md` |
| `crates/koloda-server` diff (incl. its migrations and Dockerfile) | `crates/koloda-server/README.md`, `crates/koloda-sync-proto/PROTOCOL.md` |
| Desktop Rust addon diff (`apps/electron/src-rust`) | `apps/electron/README.md`, `apps/electron/IPC.md` |
| Sync spec diff | `docs/specs/SYNC.md`, `agents/I18N.md` |
| Theme diff | `agents/ADD-COLOR-THEME.md`, `docs/specs/INTERFACE-SETTINGS.md` |
| Interface settings diff | `docs/specs/INTERFACE-SETTINGS.md` |
| App shell layout diff | `agents/LAYOUT.md`, `agents/CSS.md`; add `docs/specs/INTERFACE-SETTINGS.md` when the diff changes an interface setting |
| User-visible behavior diff (UI copy, flows, settings the user touches) | area primary spec (or `agents/ASSISTANT-MAP.md` for assistant), `agents/VERIFY.md`, plus the usual CODE-STYLE / CODE-DOCUMENTATION as for any TS/React edit |
| Hotkey diff | `agents/ADD-HOTKEY.md`, `docs/specs/HOTKEYS.md`, `agents/I18N.md` |
| Functional spec diff | `agents/FUNCTIONAL-SPECIFICATIONS.md`, `agents/MARKDOWN.md` |
| Desktop IPC diff | `apps/electron/IPC.md`, `libs/native-ipc/README.md` |
| Playwright e2e diff | `agents/VERIFY.md`, plus the touched suite's README |
| CI, Docker, or `tools/` diff | `AGENTS.md` (§Landing); no other guide yet. Docker diffs also take `crates/koloda-server/README.md` (§Docker) |

## Auditing

Always include `agents/AUDIT.md` and the standing authoring guides:
`agents/CODE-STYLE.md`, `agents/CODE-DOCUMENTATION.md`, `agents/TESTING.md`, `agents/BACKWARDS-COMPATIBILITY.md`.
Then add the Authoring-table guides for the target, the same way Reviewing does.

Also add:

- `agents/FUNCTIONAL-SPECIFICATIONS.md` when a spec is in scope
- `agents/CSS.md` when UI is in scope
- `agents/LAYOUT.md` when the target includes app-shell layout, the drawer, or the wide breakpoint
- `agents/I18N.md` when user-visible strings are in scope
- `docs/decisions/TS-RUST-DOMAIN-MIRRORING.md` when the target crosses TypeScript and Rust, or includes persistence
- `agents/ASSISTANT-MAP.md` for assistant
- the package README for each package in scope
- `apps/electron/IPC.md` when the target includes desktop IPC

One primary spec, one package, or one named cross-cutting question per audit.
If the target spans more than one primary spec without a single cross-cutting question, split it.

Planning work from a finished audit report is still the Authoring row for a multi-commit plan.

## Always-available background

Read these only when the task touches them.
Consult them yourself when a change crosses a boundary.

- `agents/BACKWARDS-COMPATIBILITY.md` — deletion policy, no shims.
- `docs/decisions/TS-RUST-DOMAIN-MIRRORING.md` — why TS and Rust both exist, and who owns persistence on each host.
- `docs/decisions/APP-ROLES.md` — which apps are products and which are demos; product-only features are allowed.
- `libs/*/README.md`, `apps/*/README.md` — per-package "Where it sits" and "Does NOT own" boundaries.
- `apps/electron/IPC.md` — the desktop renderer ↔ main IPC channel contract.

## Rule to remember

Minimal context is the goal.
If a guide is not relevant to the task, do not include it.
This index helps you omit, not pile on.
A spec that is only linked from the primary spec is not in the prompt until the task actually needs it.