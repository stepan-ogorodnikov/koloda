//! Desktop SQLite backend for Koloda (Electron / NAPI).
//!
//! Layer map and ownership: crate `README.md`.
//! Schema workflow: `agents/DB.md`. Domain mirroring: `docs/adr/0001-TS-RUST-DOMAIN-MIRRORING.md`.

pub mod app;
pub mod domain;
pub mod migrations;
pub mod repo;
