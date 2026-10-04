# TypeScript ↔ Rust domain mirroring

## Ruling

Keep a Rust desktop backend (`koloda`) and a TypeScript web/domain layer.
Mirror domain shapes across both.
Do not treat the duplication as accidental debt to collapse by removing one side.

### Persistence owners

Both hosts run SQLite on one migration series, `crates/koloda/src/migrations/V*.sql`.
The schema workflow is `agents/DB.md`.

| Platform | Owner |
| --- | --- |
| Web (`apps/web`) | `@koloda/db-sqlite`, in-process TypeScript over `wa-sqlite` |
| Desktop (Electron) | `koloda` over rusqlite, exposed to Electron through NAPI |

Do not run desktop DB I/O from TypeScript, or web DB I/O through Rust (for example a WASM `koloda`).
Changing either owner needs a new decision.
Product tables and columns stay structurally equivalent on both hosts.

### Split source of truth

| Concern | Source of truth | Mirror / consumer |
| --- | --- | --- |
| AI provider identity and secrets redaction | Rust (`koloda` domain + repo) | `@koloda/ai` catalog and secrets schemas |
| FSRS scheduling | TypeScript (`@koloda/srs`, lesson flow in `@koloda/srs-react`) | Backends persist client-computed card/review results; they do not re-schedule |
| Shared product entities (cards, decks, templates, settings, …) | Both sides must agree | Update Zod (`libs/srs`, `libs/app`) and Rust domain together |

When a field or invariant changes, update every owning layer in the same change.
Prefer deleting and reshaping call sites over compatibility shims (`agents/BACKWARDS-COMPATIBILITY.md`).

Schema and domain edits are multi-package by default (TS libs + `koloda`, including web SQLite repos).
Do not remove Rust validation, move FSRS into Rust, or invent adapter layers unless that is an explicit new decision.

### Accepted divergences

These numeric/serde edges are deliberately not mirrored; do not re-flag them as drift.

- Rust `i32` upper bounds are not mirrored in Zod (e.g. `reviews.time` rejects negatives on both sides, but only serde rejects values past 2^31−1). Values that large are nonsense for the fields involved.
- FSRS learning-step amounts are `i64` in Rust vs the safe-integer bound (2^53) in Zod (`learningStepValidation` in `libs/srs/src/lib/algorithms-fsrs.ts`). Step durations can never approach either limit.
- Desktop repos also write sync bookkeeping (`sync_*` tables) in the same transaction as each product write, backfill rows written before enrollment, and apply envelopes other devices captured; the web repos do none of this, because the web host does not sync (`docs/decisions/APP-ROLES.md`). The `sync_*` tables still exist on both hosts through the shared migration series.
- Rust `Option<T>` accepts an explicit JSON `null` where the TS twin uses `.optional()` (which rejects `null`, accepting only absence). Renderer payloads never carry explicit nulls (`toWire` drops `undefined`), so the leniency is reachable only by hand-crafted input, where failing open on desktop is harmless.

## Why

Rust is the better choice for backend code in general, so it stays the desktop backend on its merits.
It started as the backend of a Tauri desktop app and was kept on purpose when the desktop shell moved to Electron.
The obvious alternative, running the web TypeScript repos in Electron's main process, is rejected for that reason.
The cost is accepted: every schema or domain change lands in both languages.

## Applies when

- A change touches both the TypeScript domain and `koloda`, including AI providers and schema.
- A change touches web or desktop persistence ownership.
- `agents/ADD-AI-PROVIDER.md` and `agents/DB.md` stay the how-to.
- A single-file quirk does not need this file.
  UI that only uses the `Queries` contract does not need it either.
