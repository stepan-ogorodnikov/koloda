use koloda::app::init::seed_db;
use koloda::domain::seed_ids::{SEED_ALGORITHM_SIMPLE_ID, SEED_TEMPLATE_TYPE_ID};
use koloda::repo::sync::join::JoinMode;
use koloda_sync::error::SyncError;
use koloda_sync::pairing::{IssuedPairing, Joined};
use koloda_sync::transport::Method;
use koloda_sync_proto::envelope::Envelope;
use koloda_sync_proto::payload::{Delete, Payload};
use koloda_sync_proto::registry::{Group, Kind, Lane};
use koloda_sync_proto::transport::{DeviceList, ErrorCode};

use crate::common::{Device, Fault, Space, SERVER_URL};
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
fn a_detached_file_is_refused_for_a_space_with_another_epoch_before_its_code_is_claimed() {
    let space = Space::new();
    let b = space.server.join(&space.device);
    space.device.engine.detach().expect("A detaches");
    // WHY: no server restore exists yet to change the space's epoch, so the file's stored one changes instead.
    space
        .device
        .execute("UPDATE sync_state SET epoch = x'00000000000000000000000000000001'");
    let code = b.engine.issue_pairing(None).expect("B issues a code").code;

    let result = join(&space.device, &code);

    assert!(matches!(result, Err(SyncError::EpochChanged)), "{result:?}");
    assert!(claims(&space.device).is_empty(), "nothing is claimed");
    let c = space.server.device();
    join(&c, &code).expect("the code is still unused");
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
