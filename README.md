# Koloda

Local-first spaced repetition software powered by the [FSRS](https://github.com/open-spaced-repetition/ts-fsrs) algorithm.

[Live demo](https://stepan-ogorodnikov.github.io/koloda)

> This project is in early stages. API, database dialect and schema are subject to change.

## Getting Started

### Prerequisites

- [Bun](https://bun.sh)
- [Rust toolchain](https://rustup.rs) (1.80.0+)

```bash
bun install
```

### Dev server (desktop — Electron)

```bash
nx serve native-electron
```

### Build (desktop — Electron)

```bash
nx build native-electron
```

## Tech Stack

- Nx monorepo with Bun as package manager
- **Frontend**: Vite, React, TanStack Router
- **Web**: PGLite
- **Desktop**: Electron + Rust NAPI + SQLite
- **Testing**: Vitest (unit), Playwright (E2E), Cargo (Rust)

## Testing

```bash
# TypeScript unit tests (libs tagged type:lib)
bun run test:libs

# Desktop: Electron IPC unit tests + Playwright e2e
nx test native-electron
nx run native-electron:test:unit
nx run native-electron:test:e2e

# Web Playwright e2e
nx run demo-e2e:e2e

# Rust (workspace: koloda-core + Electron NAPI crate)
cargo test
```

## Project Structure

```
apps/
  demo/                   # Web app (Live demo)
  demo-e2e/               # E2E tests for web app (Playwright)
  native-electron/        # Desktop app backend (Electron / Rust NAPI)
  native-electron-e2e/    # E2E tests for desktop app (Playwright)
  native-electron-react/  # Desktop app frontend (React / Electron)
libs/
  ai/                     # Domain lib for AI features
  ai-react/               # AI features React UI
  app/                    # Generic app infrastructure (error types, utilities, interface settings)
  app-react/              # App shell, routing, settings UI, global hooks
  core-react/             # Shared React infrastructure (queries, hooks, atoms)
  srs/                    # SRS domain logic
  srs-pgsql/              # PostgreSQL backend (web)
  srs-react/              # SRS domain React UI
  srs-sqlite/             # SQLite schema (desktop)
  ui/                     # Styles and UI primitives
crates/
  koloda-core/            # Shared Rust backend (domain logic, DB, migrations)
```
