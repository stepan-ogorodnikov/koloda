//! The sync server: one envelope log per space, device enrollment, push, pull, and bootstrap.
//!
//! Contract: `crates/koloda-sync-proto/PROTOCOL.md`. Layout and ownership: crate `README.md`.
//! INVARIANT: the server reads envelope headers and never decodes a payload, so payloads can become ciphertext.

pub mod clock;
pub mod data_dir;
pub mod server;

mod auth;
mod db;
mod devices;
mod http;
mod spaces;

use std::sync::Arc;

use axum::extract::DefaultBodyLimit;
use axum::routing::{get, post};
use axum::Router;

use crate::server::Server;

pub fn router(server: Arc<Server>) -> Router {
    Router::new()
        .route("/v1/spaces", post(spaces::create).get(spaces::list))
        .route("/v1/spaces/{space}/devices/{device}", get(devices::get))
        .fallback(http::fallback)
        // WHY: `read_body` enforces the protocol's own body and zstd limits and answers with a reply body.
        .layer(DefaultBodyLimit::disable())
        .with_state(server)
}
