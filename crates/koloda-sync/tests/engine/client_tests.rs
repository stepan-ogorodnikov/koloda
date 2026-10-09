use koloda_sync::error::SyncError;
use koloda_sync::transport::Response;
use std::collections::BTreeMap;

use koloda_sync_proto::transport::{Meta, PairingPreview, Reply};

use crate::common::{system_ms, Fault, TestServer, SERVER_URL};

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

#[test]
fn a_zstd_reply_may_expand_past_the_request_ratio() {
    let server = TestServer::new();
    let device = server.device();
    let reply = Reply {
        meta: Meta {
            server_time_ms: system_ms(),
            epoch: None,
            device: None,
        },
        ok: Some(PairingPreview {
            space_id: [1; 16],
            name: "Home".to_string(),
            epoch: [3; 16],
            counts: BTreeMap::from([("a".repeat(64 * 1024), 1)]),
            bytes: 0,
        }),
        error: None,
    };
    let mut body = Vec::new();
    ciborium::into_writer(&reply, &mut body).expect("encode the reply");
    let compressed = zstd::encode_all(body.as_slice(), 3).expect("compress the reply");
    assert!(
        compressed.len() * 32 < body.len(),
        "the reply expands past 32 times its size"
    );
    device.transport.fault(Fault::Reply(Response {
        status: 200,
        body: compressed,
        is_zstd: true,
    }));

    let result = device.engine.preview(SERVER_URL, "0123456789");

    let error = result.err();
    assert!(error.is_none(), "a reply is limited by size only: {error:?}");
}

#[test]
fn a_body_that_compresses_past_the_server_ratio_goes_out_uncompressed() {
    let space = crate::common::Space::new();

    let issued = space.device.engine.issue_pairing(Some(vec![0; 4096]));

    let error = issued.err();
    assert!(error.is_none(), "the server accepts the hint: {error:?}");
    let pairing = space
        .device
        .transport
        .sent()
        .into_iter()
        .find(|request| request.url.ends_with("/pairings"))
        .expect("the pairing request was sent");
    assert!(
        !pairing.is_zstd,
        "4 KiB of zeros would expand past 32 times its zstd size, which the server refuses"
    );
}
