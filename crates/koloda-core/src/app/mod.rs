//! DB connection, init/seed, keyring secrets, clock/UUID helpers.
//!
//! `error` (`AppError` + `error_codes`) is the crate-wide error type used by domain and repo.

pub mod db;
pub mod error;
pub mod init;
pub mod secrets;
pub mod utility;
