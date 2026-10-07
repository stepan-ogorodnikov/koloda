//! The sync server: one envelope log per space, device enrollment, push, pull, bootstrap, and attachments.
//!
//! Contract: `crates/koloda-sync-proto/PROTOCOL.md`. Layout and ownership: crate `README.md`.
//! INVARIANT: the server reads envelope headers and never decodes a payload, so payloads can become ciphertext.

pub mod backup;
pub mod clock;
pub mod data_dir;
pub mod server;

mod attachments;
mod auth;
mod bootstrap;
mod db;
mod devices;
mod http;
mod known;
mod log;
mod pairing;
mod pull;
mod push;
mod spaces;

use std::sync::Arc;

use axum::extract::DefaultBodyLimit;
use axum::routing::{get, post};
use axum::Router;

use crate::server::Server;

pub fn router(server: Arc<Server>) -> Router {
    Router::new()
        .route("/v1/spaces", post(spaces::create).get(spaces::list))
        .route("/v1/spaces/{space}/pairings", post(pairing::issue))
        .route("/v1/pairings/preview", post(pairing::preview))
        .route("/v1/pairings/claim", post(pairing::claim))
        .route("/v1/spaces/{space}/push", post(push::push))
        .route("/v1/spaces/{space}/receipts", get(push::receipts))
        .route("/v1/spaces/{space}/ids/known", post(known::known))
        .route(
            "/v1/spaces/{space}/attachments/{id}",
            get(attachments::get).put(attachments::put),
        )
        .route("/v1/spaces/{space}/pull", get(pull::pull))
        .route("/v1/spaces/{space}/bootstrap", post(bootstrap::open))
        .route(
            "/v1/spaces/{space}/bootstrap/{snapshot}",
            get(bootstrap::page).delete(bootstrap::release),
        )
        .route(
            "/v1/spaces/{space}/bootstrap/{snapshot}/heartbeat",
            post(bootstrap::heartbeat),
        )
        .route("/v1/spaces/{space}/devices", get(devices::list))
        .route("/v1/spaces/{space}/devices/fork", post(devices::fork))
        .route(
            "/v1/spaces/{space}/devices/{device}",
            get(devices::get).delete(devices::revoke),
        )
        .fallback(http::fallback)
        // WHY: `read_body` enforces the protocol's own body and zstd limits and answers with a reply body.
        .layer(DefaultBodyLimit::disable())
        .with_state(server)
}
