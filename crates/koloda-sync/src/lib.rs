//! The sync engine on native devices: it calls `koloda-server` and drives `koloda`'s capture, apply, backfill, and
//! join (`crates/koloda-sync-proto/PROTOCOL.md`). Layout and ownership: crate `README.md`.
//!
//! INVARIANT: every SQL statement stays in `koloda`; the engine only calls its sync functions.

pub mod devices;
pub mod engine;
pub mod error;
pub mod pairing;
pub mod runner;
pub mod status;
pub mod transport;

mod bootstrap;
mod client;
mod cycle;
mod push;
