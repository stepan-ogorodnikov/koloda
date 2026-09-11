# Koloda

Local-first spaced repetition software powered by the [FSRS](https://github.com/open-spaced-repetition/ts-fsrs) algorithm.

[Live demo](https://stepan-ogorodnikov.github.io/koloda)

> This project is in early stages. API and schema are subject to change.

## Getting Started

### Prerequisites

- [Bun](https://bun.sh)
- [Rust toolchain](https://rustup.rs) (1.88.0+)

```bash
bun install
```

### Dev server (desktop — Electron)

```bash
nx serve electron
```

### Build (desktop — Electron)

```bash
nx build electron
```

## Tech Stack

- Nx monorepo with Bun as package manager
- **Frontend**: Vite, React, TanStack Router
- **Web**: wa-sqlite (in-browser SQLite via IndexedDB)
- **Desktop**: Electron + Rust NAPI + SQLite
- **Testing**: Vitest (unit), Playwright (E2E), Cargo (Rust)

## Testing

```bash
# TypeScript unit tests (libs tagged type:lib)
bun run test:libs

# Desktop: Electron IPC unit tests + Playwright e2e
nx test electron
nx run @koloda/electron:test:unit
nx run @koloda/electron:test:e2e

# Web Playwright e2e
nx run web-e2e:e2e

# Rust (workspace: koloda + Electron NAPI crate)
cargo test
```

## Project Structure

```
apps/
  web/                    # SQLite web host
  web-e2e/                # E2E tests for web host (Playwright)
  electron/               # Desktop main process (Electron / Rust NAPI)
  electron-react/         # Desktop renderer (React / Electron)
  electron-e2e/           # E2E tests for desktop app (Playwright)
libs/
  ai/                     # Domain lib for AI features
  ai-react/               # AI features React UI
  app/                    # Generic app infrastructure (error types, utilities, interface settings)
  app-react/              # App shell, routing, global hooks
  assistant/              # Assistant application layer (run execution, save scheduling)
  assistant-react/        # Assistant chat React UI
  core-react/             # Shared React infrastructure (queries, hooks, atoms)
  db-sqlite/              # SQLite persistence (web)
  settings/               # Settings row registry (Zod)
  settings-react/         # Global settings screens
  srs/                    # SRS domain logic
  srs-react/              # SRS domain React UI
  ui/                     # Styles and UI primitives
crates/
  koloda/                 # Desktop Rust backend (domain, repos, SQLite/Refinery, keyring)
```
