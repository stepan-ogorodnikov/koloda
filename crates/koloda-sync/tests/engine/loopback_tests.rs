use std::sync::Arc;

use koloda::app::db::Database;
use koloda_sync::engine::Engine;
use koloda_sync::transport::HttpTransport;
use koloda_sync_proto::transport::Platform;

use crate::common::{MemorySecrets, TestServer};
use crate::fixtures::starter;

#[test]
fn a_space_is_created_over_http_on_loopback() {
    let server = TestServer::new();
    let serving = tokio::runtime::Runtime::new().expect("server runtime");
    let listener = serving
        .block_on(tokio::net::TcpListener::bind("127.0.0.1:0"))
        .expect("bind a loopback port");
    let address = listener.local_addr().expect("the bound address");
    let serve = serving.spawn(async move { axum::serve(listener, server.router.clone()).await });

    let db = Database::in_memory().expect("in-memory database");
    let engine = Engine::start(
        db.clone(),
        Arc::new(MemorySecrets::default()),
        Arc::new(HttpTransport::new().expect("HTTP client")),
        Platform::DesktopLinux,
        starter(),
    )
    .expect("engine starts");
    engine
        .create_space(&format!("http://{address}"), &server.setup_token, "Study", "Laptop")
        .expect("space is created over HTTP");

    assert!(
        koloda::repo::sync::enrolled_device(&db)
            .expect("sync state reads")
            .is_some(),
        "the file is enrolled"
    );
    serve.abort();
}
