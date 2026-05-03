# Koloda

Local-first spaced repetition software powered by the [FSRS](https://github.com/open-spaced-repetition/ts-fsrs) algorithm.

[Live demo](https://stepan-ogorodnikov.github.io/koloda)

> This project is in early stages. API, database dialect and schema are subject to change.

## Getting Started

### Prerequisites

- [Bun](https://bun.sh)
- [Rust toolchain](https://rustup.rs) (1.80.0+)
- Tauri [system dependencies](https://v2.tauri.app/start/prerequisites/) for your platform

```bash
bun install
```

### Dev server (desktop)

```bash
nx serve native-tauri
```

### Build (desktop)

```bash
nx build native-tauri
```

## Tech Stack

- Nx monorepo with Bun as package manager
- **Frontend**: Vite, React, TanStack Router
- **Web**: PGLite
- **Desktop**: Tauri + SQLite

## Project Structure

```
apps/
  demo/               # Web app (Live demo)
  native-tauri-react/ # Desktop app frontend (React)
  native-tauri/       # Desktop app backend (Rust / Tauri)
libs/
  ai/                 # Domain lib for AI features
  ai-react/           # AI features React UI
  app/                # Generic app infrastructure (error types, utilities, interface settings)
  app-react/          # App shell, routing, settings UI, global hooks
  core-react/         # Shared React infrastructure (queries, hooks, atoms)
  srs/                # SRS domain logic
  srs-pgsql/          # PostgreSQL backend (web)
  srs-sqlite/         # SQLite schema (desktop)
  srs-react/          # SRS domain React UI
  ui/                 # Styles and UI primitives
```
