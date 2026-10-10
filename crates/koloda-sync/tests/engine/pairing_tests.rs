use koloda::app::init::{get_db_status, seed_db, DbStatus};
use koloda::domain::seed_ids::{SEED_ALGORITHM_SIMPLE_ID, SEED_TEMPLATE_TYPE_ID};
use koloda::repo::sync::join::JoinMode;
use koloda_sync::error::SyncError;
use koloda_sync::pairing::{IssuedPairing, Joined};
use koloda_sync::transport::Method;
use koloda_sync_proto::envelope::Envelope;
use koloda_sync_proto::payload::{Delete, Payload};
use koloda_sync_proto::registry::{Group, Kind, Lane};
use koloda_sync_proto::transport::{DeviceList, ErrorCode};

use crate::common::{error_reply, Device, Fault, Space, SERVER_URL};
use crate::fixtures::{seed_data, seed_settings};

fn issue(space: &Space, hint: Option<Vec<u8>>) -> IssuedPairing {
    space.device.engine.issue_pairing(hint).expect("a code is issued")
}

fn join(device: &Device, code: &str) -> Result<Joined, SyncError> {
    device.engine.join(SERVER_URL, code, "Phone", seed_settings())
}

/// The envelopes a device pushed, as the raw client pulls them.
fn pushed_by(space: &Space, device: &Device) -> Vec<Envelope> {
    let sender = *device.state().expect("enrolled").device_id.as_bytes();
    space
        .raw_pull(Lane::Hot, 0)
        .entries
        .into_iter()
        .filter(|entry| entry.sender == sender)
        .map(|entry| Envelope::decode(&entry.envelope).expect("decodes"))
        .collect()
}

fn claims(device: &Device) -> Vec<Option<Vec<u8>>> {
    device
        .transport
        .sent()
        .into_iter()
        .filter(|request| request.url.ends_with("/pairings/claim"))
        .map(|request| request.body)
        .collect()
}

#[test]
fn a_blank_file_joins_by_code_and_converges() {
    let space = Space::new();
    let library = space.device.library();
    space.device.engine.sync_now().expect("A syncs");
    let issued = issue(&space, Some(b"interface settings".to_vec()));
    assert_eq!(
        (issued.server_url.as_str(), issued.space_id),
        (SERVER_URL, space.space_id())
    );
    let b = space.server.device();

    let preview = b.engine.preview(SERVER_URL, &issued.code).expect("the code previews");
    let joined = join(&b, &issued.code).expect("B joins");
    b.engine.sync_now().expect("B syncs");

    assert_eq!((preview.space_id, preview.name.as_str()), (space.space_id(), "Study"));
    assert_eq!(
        joined,
        Joined {
            mode: JoinMode::Blank,
            hint: Some(b"interface settings".to_vec()),
            known_ids: 0,
        }
    );
    assert_eq!(b.state().map(|state| state.role).as_deref(), Some("joiner"));
    assert!(b.has_card(&library.card), "B converges");
    assert_eq!(
        b.count("SELECT COUNT(*) FROM settings"),
        3,
        "a blank joiner seeds its interface, learning, and hotkeys settings"
    );
}

#[test]
fn an_untouched_seed_joins_a_space_that_holds_the_seed_rows() {
    let space = Space::with(|device| seed_db(&device.db, seed_data(77)).expect("A starts fresh"));
    space.device.engine.sync_now().expect("A backfills its seed rows");
    let issued = issue(&space, None);
    let b = space.server.device();
    seed_db(&b.db, seed_data(100)).expect("B starts fresh");

    let joined = join(&b, &issued.code).expect("B joins");
    b.engine.sync_now().expect("B syncs");

    assert_eq!(joined.mode, JoinMode::UntouchedSeed);
    assert_eq!(
        b.ids("algorithms"),
        space.device.ids("algorithms"),
        "the space's seed algorithm overlays B's"
    );
    assert_eq!(
        b.ids("templates"),
        space.device.ids("templates"),
        "and its seed template"
    );
    assert_eq!(
        b.count("SELECT json_extract(content, '$.dailyLimits.total') FROM settings WHERE name = 'learning'"),
        77,
        "the space's learning settings overlay B's"
    );
    let creates: Vec<_> = pushed_by(&space, &b)
        .into_iter()
        .filter(|envelope| envelope.header.group == Some(Group::Create))
        .collect();
    assert!(creates.is_empty(), "a joiner never pushes its seed rows: {creates:?}");
}

#[test]
fn an_untouched_seed_drops_the_seed_rows_the_space_does_not_hold() {
    let space = Space::new();
    let library = space.device.library();
    space.device.engine.sync_now().expect("A syncs");
    // The space fences the seed template id, as when another device deleted its starter template.
    let delete = Payload::Delete {
        kind: Kind::Templates,
        delete: Delete { successor: None },
    };
    space.raw_push(SEED_TEMPLATE_TYPE_ID, None, space.raw_stamp(1_000), &delete);
    let issued = issue(&space, None);
    let b = space.server.device();
    seed_db(&b.db, seed_data(100)).expect("B starts fresh");

    let joined = join(&b, &issued.code).expect("B joins");
    b.engine.sync_now().expect("B syncs");

    assert_eq!(joined.mode, JoinMode::UntouchedSeed);
    assert_eq!(
        b.ids("templates"),
        library.template,
        "the fenced seed template is deleted"
    );
    assert_eq!(
        b.ids("algorithms"),
        library.algorithm,
        "and the seed algorithm the space never held"
    );
    let seeds: Vec<_> = pushed_by(&space, &b)
        .into_iter()
        .filter(|envelope| [SEED_ALGORITHM_SIMPLE_ID, SEED_TEMPLATE_TYPE_ID].contains(&envelope.header.id.as_str()))
        .collect();
    assert!(seeds.is_empty(), "no seed id is ever pushed: {seeds:?}");
}

#[test]
fn a_wrong_code_fails_and_leaves_the_file_alone() {
    let space = Space::new();
    let b = space.server.device();

    let result = join(&b, "0000000000");

    assert!(
        matches!(
            result,
            Err(SyncError::Server {
                status: 404,
                code: ErrorCode::PairingFailed,
                ..
            })
        ),
        "{result:?}"
    );
    assert!(b.state().is_none(), "nothing is enrolled");
    assert!(b.secrets.keys().is_empty(), "nothing is stored");
    assert_eq!(b.count("SELECT COUNT(*) FROM settings"), 0, "nothing is seeded");
}

#[test]
fn an_attached_file_is_refused_before_its_code_is_claimed() {
    let space = Space::new();
    let issued = issue(&space, None);

    let result = join(&space.device, &issued.code);

    assert!(
        matches!(result, Err(SyncError::CannotJoin(JoinMode::Reattach))),
        "{result:?}"
    );
    assert!(claims(&space.device).is_empty(), "nothing is claimed");
    let c = space.server.device();
    join(&c, &issued.code).expect("the code is still unused");
}

#[test]
fn a_lost_claim_reply_is_retried_to_the_same_device() {
    let space = Space::new();
    let issued = issue(&space, None);
    let b = space.server.device();
    b.transport.fault_on("/pairings/claim", Fault::LoseReply);

    join(&b, &issued.code).expect("the retry claims the code");

    let sent = claims(&b);
    assert_eq!(sent.len(), 2, "one lost reply, one retry");
    assert_eq!(sent.first(), sent.last(), "the retry sends the same nonce");
    let (_, reply) = space.server.call::<DeviceList>(
        Method::Get,
        &format!("/v1/spaces/{}/devices", space.space_id()),
        &space.device.token(),
    );
    assert_eq!(
        reply.ok.expect("the device list").devices.len(),
        3,
        "A, the raw client, and B, with no fourth device from the retry"
    );
    b.engine.sync_now().expect("B's stored token works");
}

fn previews(device: &Device) -> usize {
    device
        .transport
        .sent()
        .iter()
        .filter(|request| request.url.ends_with("/pairings/preview"))
        .count()
}

fn space_devices(space: &Space) -> usize {
    let (_, reply) = space.server.call::<DeviceList>(
        Method::Get,
        &format!("/v1/spaces/{}/devices", space.space_id()),
        &space.device.token(),
    );
    reply.ok.expect("the device list").devices.len()
}

/// Keeps the file from recording a claim that lands on the server, in some way.
type Interrupt = fn(&Device);

#[test]
fn a_claim_the_file_never_recorded_finishes_on_the_next_join_with_the_same_code() {
    let cases: [(&str, Interrupt); 2] = [
        ("every reply lost", |b| {
            for _ in 0..4 {
                b.transport.fault_on("/pairings/claim", Fault::LoseReply);
            }
        }),
        ("a stop after the reply", |b| b.secrets.refuse_next("sync.token.")),
    ];

    for (name, interrupt) in cases {
        let space = Space::new();
        let issued = issue(&space, None);
        let b = space.server.device();
        interrupt(&b);
        assert!(join(&b, &issued.code).is_err(), "{name}: the first join fails");
        assert!(b.state().is_none(), "{name}: the file records nothing");
        assert_eq!(space_devices(&space), 3, "{name}: the claim landed");
        let relaunched = space.server.relaunch(&b);

        // WHY: typed in lowercase with a hyphen, the code still names the pending claim.
        let (head, tail) = issued.code.split_at_checked(5).expect("a 10-character code");
        let typed = format!("{head}-{tail}").to_lowercase();
        let joined = join(&relaunched, &typed).expect("the next join finishes the claim");

        assert_eq!(joined.mode, JoinMode::Blank, "{name}");
        assert_eq!(
            previews(&relaunched),
            0,
            "{name}: the claimed code is not previewed again"
        );
        assert_eq!(
            space_devices(&space),
            3,
            "{name}: A, the raw client, and B, with no fourth device"
        );
        relaunched.engine.sync_now().expect("B's stored token works");
        assert_eq!(relaunched.count("SELECT COUNT(*) FROM sync_enrolling"), 0, "{name}");
        assert!(
            relaunched
                .secrets
                .keys()
                .iter()
                .all(|key| !key.starts_with("sync.pending_token.")),
            "{name}: the recorded claim removes its pending token"
        );
    }
}

#[test]
fn a_blank_join_stopped_before_it_enrolls_joins_as_blank_on_the_same_device_next_time() {
    let space = Space::new();
    let issued = issue(&space, None);
    let b = space.server.device();
    // A stop inside the transaction that seeds and enrolls, as a crash or a full disk would make it.
    b.db.with_conn(|conn| {
        conn.execute_batch(
            "CREATE TEMP TRIGGER stop_enrollment BEFORE INSERT ON sync_state BEGIN SELECT RAISE(ABORT, 'stopped'); END",
        )?;
        Ok(())
    })
    .expect("the trigger is created");

    assert!(join(&b, &issued.code).is_err(), "the first join fails");
    assert_eq!(
        b.count("SELECT COUNT(*) FROM settings"),
        0,
        "no settings without the enrollment"
    );
    assert!(
        matches!(get_db_status(&b.db).expect("status reads"), DbStatus::Blank),
        "the file still opens to the first-run seed"
    );
    assert_eq!(
        b.count("SELECT COUNT(*) FROM sync_enrolling"),
        1,
        "the claim stays pending"
    );

    b.db.with_conn(|conn| {
        conn.execute_batch("DROP TRIGGER stop_enrollment")?;
        Ok(())
    })
    .expect("the trigger is dropped");
    let joined = join(&b, &issued.code).expect("the next join finishes the claim");

    assert_eq!(joined.mode, JoinMode::Blank);
    assert_eq!(
        space_devices(&space),
        3,
        "A, the raw client, and B, with no fourth device"
    );
    assert_eq!(b.count("SELECT COUNT(*) FROM settings"), 3);
    b.engine.sync_now().expect("B syncs");
}

#[test]
fn a_claim_refused_as_failed_leaves_nothing_pending() {
    let space = Space::new();
    let issued = issue(&space, None);
    let b = space.server.device();
    b.transport.fault_on(
        "/pairings/claim",
        Fault::Reply(error_reply(404, ErrorCode::PairingFailed)),
    );

    let result = join(&b, &issued.code);

    assert!(
        matches!(
            result,
            Err(SyncError::Server {
                code: ErrorCode::PairingFailed,
                ..
            })
        ),
        "{result:?}"
    );
    assert_eq!(b.count("SELECT COUNT(*) FROM sync_enrolling"), 0, "no claim is pending");
    assert!(b.secrets.keys().is_empty(), "no token is kept");
    join(&b, &issued.code).expect("the next join previews and claims afresh");
    assert_eq!(previews(&b), 2, "the second join previews the code");
}
