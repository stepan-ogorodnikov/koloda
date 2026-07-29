//! SQLite repos parallel to `@koloda/srs-pgsql` (plus AI secrets redaction/reconstruction).
//!
//! Owns `rusqlite` adapters. Public functions wrap DB failures with `throw_known_error`
//! so operation codes (`db.get` / `db.add` / …) match the TS side.

pub mod ai;
pub mod algorithms;
pub mod cards;
pub mod conversations;
pub mod decks;
pub mod lessons;
pub mod reviews;
pub mod settings;
pub mod templates;
