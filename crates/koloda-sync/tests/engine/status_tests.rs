use koloda::app::init::seed_db;
use koloda::app::secrets::SecretStore;
use koloda_sync::status::{State, Stop};
use koloda_sync_proto::registry::Kind;
use koloda_sync_proto::transport::ErrorCode;

use crate::common::{Device, Fault, Space, SERVER_URL};
use crate::fixtures::{seed_data, seed_settings};

fn state(device: &Device) -> State {
    device.engine.status().expect("status reads").state
}

/// A joiner that claimed a code from the space's device and has not synced yet.
fn joiner(space: &Space, prepare: impl FnOnce(&Device)) -> Device {
    let code = space.device.engine.issue_pairing(None).expect("a code is issued").code;
    let device = space.server.device();
    prepare(&device);
    device
        .engine
        .join(SERVER_URL, &code, "Phone", seed_settings())
        .expect("the joiner claims the code");
    device
}

#[test]
fn status_tells_where_a_file_stands_before_it_syncs() {
    let space = Space::new();

    assert_eq!(state(&space.server.device()), State::NotEnrolled);
    assert_eq!(
        state(&joiner(&space, |_| {})),
        State::Bootstrapping,
        "a blank joiner bootstraps first"
    );
    let used = joiner(&space, |device| {
        seed_db(&device.db, seed_data(100)).expect("the file starts fresh");
        device.library();
    });
    assert_eq!(
        state(&used),
        State::ImportPending,
        "a used file waits for Add or Replace"
    );
}

#[test]
fn status_after_a_cycle_reports_success_and_what_is_left() {
    let space = Space::new();
    let library = space.device.library();
    space.device.engine.sync_now().expect("the library is pushed");
    space
        .server
        .server
        .set_write_schema(space.space_id(), Kind::Decks, 2)
        .expect("write schema is raised");
    space
        .device
        .update_deck(&library.deck, "Held", &library.algorithm, &library.template);
    space.device.engine.sync_now().expect("the rename is held");

    let status = space.device.engine.status().expect("status reads");

    assert_eq!(status.state, State::Idle);
    assert!(status.last_success_ms.is_some(), "the cycle finished");
    assert_eq!((status.pending, status.held), (0, 1), "the held rename is counted");
    assert_eq!(
        (status.lag_hot, status.lag_cold),
        (Some(0), Some(0)),
        "both lanes are at head"
    );
}

/// Builds a space and returns a file whose next cycle stops.
type Arrange = fn(&Space) -> Device;

/// Whether the state names the expected stop.
type Expect = fn(&State) -> bool;

#[test]
fn status_names_why_the_last_cycle_stopped() {
    let cases: [(&str, Arrange, Expect); 5] = [
        (
            "clock skew",
            |space| {
                space.server.clock.set_offset(6 * 60 * 1000);
                space.server.copy(&space.device)
            },
            |state| *state == State::Stopped(Stop::ClockSkew),
        ),
        (
            "revoked",
            |space| {
                let b = joiner(space, |_| {});
                let id = b.state().expect("enrolled").device_id;
                space.device.engine.revoke_device(id).expect("the device is revoked");
                b
            },
            |state| *state == State::Stopped(Stop::Revoked),
        ),
        (
            "unknown device",
            |space| {
                let copy = space.server.copy(&space.device);
                let id = copy.state().expect("enrolled").device_id;
                copy.secrets
                    .set(&format!("sync.token.{id}"), "a token no device holds")
                    .expect("the token is replaced");
                copy
            },
            |state| *state == State::Stopped(Stop::UnknownDevice),
        ),
        (
            "refused push",
            |space| {
                space
                    .server
                    .server
                    .set_write_schema(space.space_id(), Kind::Algorithms, 0)
                    .expect("write schema is lowered");
                space.device.add_algorithm("Unwritable");
                space.server.copy(&space.device)
            },
            |state| *state == State::Stopped(Stop::PushRefused(ErrorCode::SchemaReadOnly)),
        ),
        (
            "error",
            |space| {
                let copy = space.server.copy(&space.device);
                for _ in 0..4 {
                    copy.transport.fault(Fault::LoseReply);
                }
                copy
            },
            |state| matches!(state, State::Stopped(Stop::Error(_))),
        ),
    ];

    for (name, arrange, is_expected) in cases {
        let space = Space::new();
        let device = arrange(&space);

        let result = device.engine.sync_now();

        assert!(result.is_err(), "{name}: the cycle stops");
        let shown = state(&device);
        assert!(is_expected(&shown), "{name}: {shown:?}");
    }
}
