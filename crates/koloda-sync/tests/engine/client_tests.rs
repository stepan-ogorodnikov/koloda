use koloda_sync::error::SyncError;
use koloda_sync::transport::Response;

use crate::common::{Fault, TestServer, SERVER_URL};

/// The first try and 3 retries.
const ATTEMPTS: usize = 4;

#[test]
fn server_urls_are_https_or_loopback_http() {
    let server = TestServer::new();
    let cases = [
        ("https://sync.example.com", "created"),
        ("http://127.0.0.1:8080", "created"),
        ("http://127.1.2.3", "created"),
        ("http://localhost:8080", "created"),
        ("http://[::1]:8080", "created"),
        ("http://sync.example.com", "refused"),
        ("http://192.168.1.10:8080", "refused"),
        ("ftp://sync.example.com", "refused"),
        ("https://sync.example.com/?space=1", "refused"),
        ("sync.example.com", "refused"),
    ];

    for (url, expected) in cases {
        let device = server.device();
        let result = device.engine.create_space(url, &server.setup_token, "Study", "Laptop");
        let outcome = match result {
            Ok(()) => "created",
            Err(SyncError::InsecureServerUrl(_)) => "refused",
            Err(_) => "failed",
        };
        assert_eq!(outcome, expected, "{url}");
        if expected == "refused" {
            assert!(device.transport.sent().is_empty(), "{url}: nothing is sent");
        }
    }
}

#[test]
fn a_reply_that_is_not_a_sync_reply_is_a_transport_failure() {
    let server = TestServer::new();
    let device = server.device();
    for _ in 0..ATTEMPTS {
        device.transport.fault(Fault::Reply(Response {
            status: 502,
            body: b"<html><body>Bad Gateway</body></html>".to_vec(),
            is_zstd: false,
        }));
    }

    let result = device
        .engine
        .create_space(SERVER_URL, &server.setup_token, "Study", "Laptop");

    assert!(matches!(result, Err(SyncError::Transport(_))), "{result:?}");
    assert_eq!(
        device.transport.sent().len(),
        ATTEMPTS,
        "it is retried like a lost reply, then given up"
    );
    assert!(device.state().is_none(), "the file is not enrolled");
}

#[test]
fn the_skew_estimate_is_server_time_minus_local_time() {
    let server = TestServer::new();
    server.clock.set_offset(120_000);
    let device = server.device();

    device
        .engine
        .create_space(SERVER_URL, &server.setup_token, "Study", "Laptop")
        .expect("space is created");

    let skew = device.engine.skew_ms();
    assert!(
        (119_000..=120_000).contains(&skew),
        "a server two minutes ahead reads as +120 s, less the reply's travel time: {skew}"
    );
}
