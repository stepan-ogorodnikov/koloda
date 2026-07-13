# ADR 0001: TypeScript ↔ Rust domain mirroring

- Status: Accepted
- Date: 2026-07-13

## Context

Desktop started as a Tauri app, so persistence and domain validation lived in Rust.
System webviews made Tauri painful enough that the product moved to Electron.
The Rust backend was kept anyway: it was already working, and it is a performant option for local SQLite work.
It was extracted into `crates/koloda-core` and exposed to Electron through NAPI.

Web still runs in TypeScript (PGlite + Drizzle repos).
Desktop still validates and persists through Rust.
The same product concepts therefore exist in both languages.

Functional specs describe behavior.
Agent playbooks describe how to change a feature across layers.
Neither records *why* the duplication exists or which side owns which rule.

## Decision

Keep a Rust desktop backend (`koloda-core`) and a TypeScript web/domain layer.
Mirror domain shapes across both.
Do not treat the duplication as accidental debt to “clean up” by collapsing one side.

### Split source of truth

| Concern | Source of truth | Mirror / consumer |
| --- | --- | --- |
| AI provider identity and secrets redaction | Rust (`koloda-core` domain + repo) | `@koloda/ai` catalog and secrets schemas |
| FSRS scheduling | TypeScript (`@koloda/srs`, lesson flow in `@koloda/srs-react`) | Backends persist client-computed card/review results; they do not re-schedule |
| Shared product entities (cards, decks, templates, settings, …) | Both sides must agree | Update Zod (`libs/srs`, `libs/app`) and Rust domain together |

When a field or invariant changes, update every owning layer in the same change.
Prefer deleting and reshaping call sites over compatibility shims
(see `agents/BACKWARDS-COMPATIBILITY.md`).

## Consequences

- Schema and domain edits are multi-package by default (TS libs + `koloda-core`, often both DB dialects).
- Agents must not “dedupe” by removing Rust validation, moving FSRS into Rust, or inventing adapter layers unless that is an explicit new ADR.
- Playbooks such as `agents/ADD-AI-PROVIDER.md` and `agents/DB.md` remain the how-to; this ADR is the why.
- Platform engines and ownership are covered in `docs/adr/0002-DUAL-PLATFORM-PERSISTENCE.md`.

## Related

- `docs/adr/0002-DUAL-PLATFORM-PERSISTENCE.md` — web PGlite vs desktop SQLite / `koloda-core`
- `agents/ADD-AI-PROVIDER.md` — keep provider enum and secrets in sync
- `agents/DB.md` — schema + migration workflow across dialects and Refinery
- `agents/BACKWARDS-COMPATIBILITY.md` — no deprecation shims while pre-release
- `libs/ai/README.md`, `libs/srs/README.md`, `crates/koloda-core/README.md` — package maps
