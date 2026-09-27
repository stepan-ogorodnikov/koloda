# TypeScript ↔ Rust domain mirroring

## Ruling

Keep a Rust desktop backend (`koloda`) and a TypeScript web/domain layer.
Mirror domain shapes across both.
Do not treat the duplication as accidental debt to collapse by removing one side.

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
- Rust `Option<T>` accepts an explicit JSON `null` where the TS twin uses `.optional()` (which rejects `null`, accepting only absence). Renderer payloads never carry explicit nulls (`toWire` drops `undefined`), so the leniency is reachable only by hand-crafted input, where failing open on desktop is harmless.

## Why

Desktop validates and persists through Rust (`crates/koloda`, exposed to Electron through NAPI).
Web runs in TypeScript (`@koloda/db-sqlite` repos).
The same product concepts exist in both languages.
Functional specs describe behavior.
Playbooks describe how to change a feature.
Neither records which side owns which rule.

## Applies when

- A change touches both the TypeScript domain and `koloda`, including AI providers and schema.
- `agents/ADD-AI-PROVIDER.md` and `agents/DB.md` stay the how-to.
- Platform engines and ownership are `docs/decisions/DUAL-PLATFORM-PERSISTENCE.md`.
- A single-file quirk does not need this file.
