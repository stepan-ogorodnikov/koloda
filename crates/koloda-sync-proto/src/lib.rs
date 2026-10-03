//! Sync wire protocol shared by the sync engine and the sync server: what travels, never how it is stored or sent.
//!
//! Contract: `PROTOCOL.md` (update it in the same change as this crate). Ownership: crate `README.md`.

pub mod envelope;
pub mod hlc;
pub mod registry;
