# Dual-platform persistence

## Ruling

Keep two persistence owners on purpose.
Product SQL is SQLite on both hosts.

| Platform | Engine | Ownership | Schema / migrations |
| --- | --- | --- | --- |
| Web (`apps/web`) | SQLite (`wa-sqlite` + `IDBBatchAtomicVFS`) | `@koloda/db-sqlite` in-process | Apply `crates/koloda/src/migrations/V*.sql` |
| Desktop (Electron) | SQLite (rusqlite) | `koloda` via NAPI | Refinery SQL in `koloda` (`src/migrations/`) |

Do not run desktop DB I/O from TypeScript, or web DB I/O through Rust.
Product tables and columns stay structurally equivalent.
Schema changes are Refinery SQL plus shared Zod/domain types and Rust domain types (`agents/DB.md`).

Every schema change is multi-package (TS libs + `koloda` + web repos that apply the same SQL).
Desktop and web share the Refinery files as the product SQL source.
Do not move web I/O into WASM `koloda` or desktop I/O into TypeScript without a new decision.
The `Queries` seam (`@koloda/core-react`) is the portability boundary for UI.
Feature libs must not import a concrete DB backend.

## Why

Web persistence stays in-process TypeScript (`@koloda/db-sqlite`).
Desktop persistence lives in Rust (`koloda` over rusqlite), exposed to Electron via NAPI.
See `docs/decisions/TS-RUST-DOMAIN-MIRRORING.md`.
Shared UI talks to data through the `Queries` contract; each app injects its backend.
`agents/DB.md` describes the schema workflow.
It does not record why two ownership boundaries exist.

## Applies when

- A schema change, or any edit that touches web or desktop persistence.
- Domain mirroring is `docs/decisions/TS-RUST-DOMAIN-MIRRORING.md`.
- UI that only uses the `Queries` contract does not need this file.
