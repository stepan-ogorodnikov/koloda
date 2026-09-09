# ADR 0002: Dual-platform persistence

- Status: Accepted
- Date: 2026-07-13
- Updated: 2026-09-09

## Context

The project began as a web-only exploration with in-browser Postgres (PGlite).
When a desktop app was added, SQLite was chosen for the on-disk native database.
Web later moved onto the same product SQL: SQLite in the browser (`wa-sqlite` + `IDBBatchAtomicVFS`).

Desktop persistence lives in Rust (`koloda` over rusqlite), exposed to Electron via NAPI
(see `docs/adr/0001-TS-RUST-DOMAIN-MIRRORING.md`).
Web persistence stays in-process TypeScript (`@koloda/db-sqlite`).

Shared UI talks to data through the `Queries` contract (`@koloda/core-react`); each app injects its backend.
`agents/DB.md` describes the schema/migration workflow.
It does not record why two ownership boundaries exist.

## Decision

Keep two persistence **owners** on purpose. Product SQL is SQLite on both hosts.

| Platform | Engine | Ownership | Schema / migrations |
| --- | --- | --- | --- |
| Web (`apps/web`) | SQLite (`wa-sqlite` + `IDBBatchAtomicVFS`) | `@koloda/db-sqlite` in-process | Apply `crates/koloda/src/migrations/V*.sql` |
| Desktop (Electron) | SQLite (rusqlite) | `koloda` via NAPI | Refinery SQL in `koloda` (`src/migrations/`) |

Do not run desktop DB I/O from TypeScript, or web DB I/O through Rust.

Product tables and columns stay structurally equivalent.
Schema changes are Refinery SQL plus shared Zod/domain types and Rust domain types
(see `agents/DB.md`).

## Consequences

- Every schema change is multi-package (TS libs + `koloda` + web repos that apply the same SQL).
- Desktop and web share the Refinery files as the product SQL source.
- Agents must not move web I/O into WASM `koloda` or desktop I/O into TypeScript without a new ADR.
- The `Queries` seam is the portability boundary for UI; feature libs must not import a concrete DB backend.
- `agents/DB.md` remains the how-to; this ADR is the why.

## Related

- `docs/adr/0001-TS-RUST-DOMAIN-MIRRORING.md` — why Rust/domain mirroring exists beside the TS web path
- `agents/DB.md` — Refinery SQL, shared types, web apply path
- `libs/db-sqlite/README.md`, `crates/koloda/README.md`
- `libs/core-react/README.md` — `Queries` injection per app
