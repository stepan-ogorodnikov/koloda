use koloda::app::secrets::SecretStore;
use koloda::repo::sync::join::JoinMode;
use koloda_sync::error::SyncError;
use koloda_sync::transport::Method;
use koloda_sync_proto::transport::Platform;

use crate::common::{Device, TestServer, SERVER_URL};
use crate::fixtures::{seed_settings, Library};

/// A creator with a library and a blank joiner that joined by code, both synced.
fn two_devices(server: &TestServer) -> (Device, Device, Library) {
    let a = server.device();
    a.engine
        .create_space(SERVER_URL, &server.setup_token, "Study", "Laptop")
        .expect("A creates the space");
    let library = a.library();
    a.engine.sync_now().expect("A syncs");
    let code = a.engine.issue_pairing(None).expect("a code is issued").code;
    let b = server.device();
    b.engine
        .join(SERVER_URL, &code, "Phone", seed_settings())
        .expect("B joins");
    b.engine.sync_now().expect("B syncs");
    (a, b, library)
}

fn id(device: &Device) -> uuid::Uuid {
    device.state().expect("enrolled").device_id
}

#[test]
fn the_device_list_names_every_device_and_marks_the_caller() {
    let server = TestServer::new();
    let (a, b, _) = two_devices(&server);

    let devices = b.engine.devices().expect("the list reads");

    let mut seen: Vec<(String, Platform, bool)> = devices
        .iter()
        .map(|device| (device.name.clone(), device.platform, device.is_self))
        .collect();
    seen.sort_by(|left, right| left.0.cmp(&right.0));
    assert_eq!(
        seen,
        vec![
            ("Laptop".to_string(), Platform::DesktopLinux, false),
            ("Phone".to_string(), Platform::DesktopLinux, true),
        ]
    );
    let caller = devices
        .iter()
        .find(|device| device.is_self)
        .expect("the caller is listed");
    assert_eq!(caller.id, id(&b));
    assert!(devices.iter().any(|device| device.id == id(&a)));
}

#[test]
fn a_revoked_device_detaches_on_its_next_call_and_keeps_its_rows() {
    let server = TestServer::new();
    let (a, b, library) = two_devices(&server);

    a.engine.revoke_device(id(&b)).expect("A revokes B");
    let revoked = b.engine.sync_now();

    assert!(matches!(revoked, Err(SyncError::Revoked)), "{revoked:?}");
    assert!(b.secrets.keys().is_empty(), "the token is gone");
    assert_eq!(
        b.count("SELECT detached_at IS NOT NULL FROM sync_state"),
        1,
        "the file is detached"
    );
    assert!(b.has_card(&library.card), "B keeps its rows");
    let sent = b.transport.sent().len();
    let again = b.engine.sync_now();
    assert!(matches!(again, Err(SyncError::Detached)), "{again:?}");
    assert_eq!(b.transport.sent().len(), sent, "a detached file sends nothing");
    b.update_deck(&library.deck, "Offline", &library.algorithm, &library.template);
    assert!(!b.outbox().is_empty(), "capture keeps recording for a later re-attach");
}

#[test]
fn detach_revokes_the_own_device_first() {
    let server = TestServer::new();
    let (a, b, _) = two_devices(&server);

    b.engine.detach().expect("B detaches");

    let listed = a.engine.devices().expect("the list reads");
    let record = listed.iter().find(|device| device.id == id(&b)).expect("B is listed");
    assert!(record.revoked_at.is_some(), "B's own record is revoked");
    assert_eq!(
        b.count("SELECT detached_at IS NOT NULL FROM sync_state"),
        1,
        "the file is detached"
    );
    assert!(b.secrets.keys().is_empty(), "the token is gone");
}

#[test]
fn a_token_the_server_does_not_know_stops_the_engine() {
    let server = TestServer::new();
    let (_, b, _) = two_devices(&server);
    b.secrets
        .set(&format!("sync.token.{}", id(&b)), "a token no device holds")
        .expect("the token is replaced");

    let result = b.engine.sync_now();

    assert!(matches!(result, Err(SyncError::UnknownDevice)), "{result:?}");
    assert_eq!(
        b.count("SELECT detached_at IS NULL FROM sync_state"),
        1,
        "the file is not detached"
    );
    assert_eq!(b.secrets.keys().len(), 1, "the token stays for recovery to use");
}

/// Puts B's token in some state that `detach` must still handle.
type TokenState = fn(&Device);

#[test]
fn detach_leaves_a_file_that_pairs_again_whatever_its_token_state() {
    let cases: [(&str, TokenState, bool, usize); 3] = [
        (
            "a secret store that fails the delete",
            |b| b.secrets.refuse_next("sync.token."),
            false,
            1,
        ),
        (
            "a token already gone",
            |b| {
                b.secrets
                    .remove(&format!("sync.token.{}", id(b)))
                    .expect("the token is removed");
            },
            true,
            0,
        ),
        (
            "a token the server does not know",
            |b| {
                b.secrets
                    .set(&format!("sync.token.{}", id(b)), "a token no device holds")
                    .expect("the token is replaced");
            },
            true,
            1,
        ),
    ];

    for (name, token_state, is_ok, revokes) in cases {
        let server = TestServer::new();
        let (a, b, library) = two_devices(&server);
        let old = id(&b);
        token_state(&b);

        let result = b.engine.detach();

        assert_eq!(result.is_ok(), is_ok, "{name}: {result:?}");
        assert_eq!(
            b.count("SELECT detached_at IS NOT NULL FROM sync_state"),
            1,
            "{name}: the file is detached"
        );
        let sent = b
            .transport
            .sent()
            .iter()
            .filter(|request| request.method == Method::Delete && request.url.contains("/devices/"))
            .count();
        assert_eq!(sent, revokes, "{name}: revocations sent");

        let code = a.engine.issue_pairing(None).expect("a code is issued").code;
        let joined = b
            .engine
            .join(SERVER_URL, &code, "Phone", seed_settings())
            .expect("B re-attaches");
        assert_eq!(joined.mode, JoinMode::Reattach, "{name}");
        assert_ne!(id(&b), old, "{name}: a new device id");
        b.update_deck(&library.deck, "Back", &library.algorithm, &library.template);
        b.engine.sync_now().expect("B syncs");
        a.engine.sync_now().expect("A syncs");
        assert_eq!(
            a.deck(&library.deck).map(|deck| deck.title),
            Some("Back".to_string()),
            "{name}: B's write reaches A"
        );
    }
}
