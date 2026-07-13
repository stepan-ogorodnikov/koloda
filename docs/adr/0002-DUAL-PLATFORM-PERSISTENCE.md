# ADR 0002: Dual-platform persistence

- Status: Accepted
- Date: 2026-07-13

## Context

The project began as a web-only exploration.
PGlite was chosen for simplicity: an in-browser Postgres that kept the demo local-first without a server.
When a desktop app was added, SQLite was chosen instead — a better fit for an on-disk native database than embedding Postgres.

Desktop persistence therefore lives in Rust (`koloda-core` over SQLite), exposed to Electron via NAPI
(see `docs/adr/0001-TS-RUST-DOMAIN-MIRRORING.md`).
Web persistence stays in-process TypeScript (`@koloda/srs-pgsql` over PGlite).

Shared UI talks to data through the `Queries` contract (`@koloda/core-react`); each app injects its backend.
`agents/DB.md` describes the schema/migration workflow.
It does not record why two engines and two ownership boundaries exist.

## Decision

Keep two persistence stacks on purpose:

| Platform | Engine | Ownership | Schema / migrations |
| --- | --- | --- | --- |
| Web (`apps/demo`) | PGlite (PostgreSQL) | `@koloda/srs-pgsql` in-process | `libs/srs-pgsql` schema → `drizzle/pgsql/` |
| Desktop (Electron) | SQLite | `koloda-core` via NAPI | `libs/srs-sqlite` schema → `drizzle/sqlite/` → hand-port Refinery in `koloda-core` |

Do not collapse to a single dialect “for simplicity.”
Do not run desktop DB I/O from TypeScript, or web DB I/O through Rust.
`@koloda/srs-sqlite` is schema-only input for Drizzle; it does not own runtime repos.

Product tables and columns stay structurally equivalent across dialects.
Schema changes update both Drizzle schemas, shared Zod/domain types, Rust domain, generated migrations, and the Refinery port in one change
(see `agents/DB.md`).

## Consequences

- Every schema change is multi-package and dual-dialect by default.
- Agents must not “unify” on SQLite-in-the-browser or Postgres-on-desktop without a new ADR.
- The `Queries` seam is the portability boundary for UI; feature libs must not import a concrete DB backend.
- `agents/DB.md` remains the how-to; this ADR is the why.

## Related

- `docs/adr/0001-TS-RUST-DOMAIN-MIRRORING.md` — why Rust/domain mirroring exists beside the TS web path
- `agents/DB.md` — dual Drizzle configs, generate, Refinery port rules
- `libs/srs-pgsql/README.md`, `libs/srs-sqlite/README.md`, `crates/koloda-core/README.md`
- `libs/core-react/README.md` — `Queries` injection per app
