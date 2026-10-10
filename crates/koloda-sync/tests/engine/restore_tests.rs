//! A server restore seen from devices: heal re-pushes what the backup lacks, and an authoritative restore discards
//! local data once the host accepts it (`crates/koloda-sync-proto/PROTOCOL.md` §Server restore).

use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

use koloda::domain::attachments::AddAttachmentData;
use koloda::domain::cards::{CardContentField, DeleteCardData, UpdateCardData, UpdateCardValues};
use koloda::domain::decks::DeleteDeckData;
use koloda::repo::attachments::{add_attachment, get_attachment_bytes};
use koloda::repo::sync::join::JoinMode;
use koloda::repo::{cards, decks};
use koloda_server::restore::RestoreOptions;
use koloda_sync::error::SyncError;
use koloda_sync::status::{State, Stop};
use koloda_sync::transport::Method;
use koloda_sync_proto::envelope::Envelope;
use koloda_sync_proto::hlc::{DeviceId, Hlc, Stamp};
use koloda_sync_proto::payload::{Delete, Payload, Title};
use koloda_sync_proto::registry::{Group, Kind, Lane};
use koloda_sync_proto::transport::{ErrorCode, IssuePairing, Outcome, Pairing, RestoreMode};
use uuid::Uuid;

use crate::common::{error_reply, system_ms, Device, Fault, Space, SERVER_URL};
use crate::fixtures::{seed_settings, Library, BACK, FRONT};

const MINUTE_MS: i64 = 60 * 1000;

impl Device {
    fn sync(&self) {
        self.engine.sync_now().expect("the device syncs");
    }

    fn edit(&self, card: &str, front: &str) {
        let content: HashMap<String, CardContentField> = [(FRONT, front), (BACK, "answer")]
            .into_iter()
            .map(|(field, text)| (field.to_string(), CardContentField { text: text.to_string() }))
            .collect();
        cards::update_card(
            &self.db,
            UpdateCardData {
                id: card.to_string(),
                values: UpdateCardValues { content },
            },
        )
        .expect("the card is edited");
    }

    fn epoch(&self) -> Uuid {
        Uuid::from_bytes(self.state().expect("the device is enrolled").epoch.expect("an epoch"))
    }
}

/// A space whose creator A and joiner B hold a synced library.
struct Pair {
    space: Space,
    b: Device,
    library: Library,
}

fn pair() -> Pair {
    let space = Space::new();
    let library = space.device.library();
    space.device.sync();
    let b = space.server.join(&space.device);
    b.sync();
    Pair { space, b, library }
}

impl Pair {
    fn a(&self) -> &Device {
        &self.space.device
    }

    /// A device that joins after everything, so it holds exactly what the space holds.
    fn witness(&self) -> Device {
        let witness = self.space.server.join(self.a());
        witness.sync();
        witness
    }
}

#[test]
fn a_write_after_the_backup_below_an_unrelated_restored_head_reaches_the_restored_space() {
    let pair = pair();
    let a = pair.a();
    // A rename stamped ahead of every device's clock is in the backup; A never pulls it before writing.
    pair.space.raw_push(
        &pair.library.deck,
        None,
        pair.space.raw_stamp(4 * 60 * 1000),
        &Payload::DeckTitle(Title {
            title: "Ahead".to_string(),
            updated_at: None,
        }),
    );
    let backup = pair.space.server.backup();
    let card = a.add_card(&pair.library.deck, &pair.library.template, "after the backup");
    a.sync();

    pair.space.server.restore(&backup, RestoreMode::Heal);
    a.sync();

    let current = pair
        .space
        .server
        .current_epoch(&format!("/v1/spaces/{}/", pair.space.space_id()));
    assert_eq!(Some(a.epoch()), current, "A moved to the restored epoch");
    assert!(
        pair.witness().has_card(&card),
        "the restored space takes A's write again"
    );
}

#[test]
fn a_write_whose_device_is_gone_is_re_pushed_by_another() {
    let pair = pair();
    let backup = pair.space.server.backup();
    let card = pair.a().add_card(&pair.library.deck, &pair.library.template, "A's");
    pair.a().sync();
    pair.b.sync();

    pair.space.server.restore(&backup, RestoreMode::Heal);
    pair.b.sync();

    assert!(pair.witness().has_card(&card));
}

#[test]
fn a_foreign_low_tombstone_after_the_backup_still_fences_after_the_restore() {
    let pair = pair();
    let backup = pair.space.server.backup();
    let low = Stamp {
        hlc: Hlc::new(system_ms() - 10 * 60 * 1000, 0).expect("wall time fits"),
        device: DeviceId(pair.space.raw.device_id),
    };
    pair.space.raw_push(
        &pair.library.deck,
        None,
        low,
        &Payload::Delete {
            kind: Kind::Decks,
            delete: Delete { successor: None },
        },
    );
    pair.a().sync();
    assert!(
        pair.a().deck(&pair.library.deck).is_none(),
        "the tombstone applies whatever its stamp"
    );

    pair.space.server.restore(&backup, RestoreMode::Heal);
    pair.a().sync();

    assert!(pair.witness().deck(&pair.library.deck).is_none());
}

#[test]
fn the_same_backup_restored_twice_heals_twice_without_re_pairing() {
    let pair = pair();
    let backup = pair.space.server.backup();
    let card = pair.a().add_card(&pair.library.deck, &pair.library.template, "twice");
    pair.a().sync();

    pair.space.server.restore(&backup, RestoreMode::Heal);
    pair.a().sync();
    let first = pair.a().epoch();
    pair.space.server.restore(&backup, RestoreMode::Heal);
    pair.a().sync();

    assert_ne!(pair.a().epoch(), first, "the second restore issued another epoch");
    assert!(pair.witness().has_card(&card));
}

#[test]
fn a_tombstone_and_a_create_of_one_entity_stay_deleted_in_either_order() {
    for is_tombstone_first in [true, false] {
        let pair = pair();
        let backup = pair.space.server.backup();
        let card = pair.a().add_card(&pair.library.deck, &pair.library.template, "doomed");
        pair.a().sync();
        pair.b.sync();
        cards::delete_card(&pair.b.db, DeleteCardData { id: card.clone() }).expect("B deletes the card");
        pair.b.sync();

        // A never pulled the delete, so it re-pushes the create; B holds only the tombstone.
        pair.space.server.restore(&backup, RestoreMode::Heal);
        if is_tombstone_first {
            pair.b.sync();
            pair.a().sync();
        } else {
            pair.a().sync();
            pair.b.sync();
            pair.a().sync();
        }

        assert!(!pair.witness().has_card(&card), "tombstone first: {is_tombstone_first}");
        assert!(!pair.a().has_card(&card), "tombstone first: {is_tombstone_first}");
    }
}

#[test]
fn a_card_whose_deck_is_also_new_heals_without_existence() {
    let pair = pair();
    let backup = pair.space.server.backup();
    let a = pair.a();
    let deck = a.add_deck(&pair.library.algorithm, &pair.library.template, "New");
    let card = a.add_card(&deck, &pair.library.template, "nuevo");
    a.sync();

    pair.space.server.restore(&backup, RestoreMode::Heal);
    a.sync();

    assert!(!pair.space.outcomes(a).contains(&Outcome::Existence));
    let witness = pair.witness();
    assert!(witness.deck(&deck).is_some());
    assert!(witness.has_card(&card));
}

#[test]
fn a_clock_pause_during_a_heal_leaves_re_pushed_stamps_alone() {
    let pair = pair();
    let backup = pair.space.server.backup();
    let a = pair.a();
    let card = a.add_card(&pair.library.deck, &pair.library.template, "stamped");
    a.sync();
    let written = Hlc::from_raw(
        u64::try_from(a.count(&format!(
            "SELECT hlc FROM sync_origins WHERE kind = 'cards' AND id = '{card}' AND group_name = 'create'"
        )))
        .expect("stamps are positive"),
    );
    pair.space.server.restore(&backup, RestoreMode::Heal);
    // The heal's rows are queued, then the push fails and the clock goes wrong before they go out.
    a.transport
        .fault_on("/push", Fault::Reply(error_reply(500, ErrorCode::Internal)));
    a.engine.sync_now().expect_err("the push fails");
    pair.space.server.clock.set_offset(10 * MINUTE_MS);
    a.engine.sync_now().expect_err("the cycle pauses for the clock");
    pair.space.server.clock.set_offset(0);

    a.sync();

    let page = pair.space.raw_pull(Lane::Hot, 0);
    let create = page
        .entries
        .iter()
        .map(|entry| Envelope::decode(&entry.envelope).expect("envelope decodes").header)
        .find(|header| header.id == card && header.group == Some(Group::Create))
        .expect("the card's create is in the space");
    assert_eq!(
        create.stamp.hlc, written,
        "the re-pushed create keeps the stamp it was written with"
    );
}

#[test]
fn only_a_stale_re_pusher_holding_an_images_bytes_uploads_it() {
    let pair = pair();
    let backup = pair.space.server.backup();
    let a = pair.a();
    let mut bytes = b"\x89PNG\r\n\x1a\n".to_vec();
    bytes.extend((0..64_u8).collect::<Vec<_>>());
    let image = add_attachment(
        &a.db,
        AddAttachmentData {
            bytes,
            width: None,
            height: None,
        },
    )
    .expect("the image is stored")
    .id;
    let card = a.add_card(
        &pair.library.deck,
        &pair.library.template,
        &format!("![x](attachment:{image})"),
    );
    a.sync();
    // B takes the card, but its fetch of the image fails, so B never holds the bytes.
    pair.b.transport.fault_when(
        Method::Get,
        "/attachments/",
        Fault::Reply(error_reply(404, ErrorCode::NotFound)),
    );
    pair.b.sync();
    assert!(get_attachment_bytes(&pair.b.db, &image).expect("bytes read").is_none());

    // B's re-push of the card lands first; A's comes back `stale`, still told the bytes are missing.
    pair.space.server.restore(&backup, RestoreMode::Heal);
    pair.b.sync();
    a.sync();

    let witness = pair.witness();
    assert!(witness.has_card(&card));
    assert!(
        get_attachment_bytes(&witness.db, &image).expect("bytes read").is_some(),
        "A uploaded the bytes, so a new device fetches them"
    );
}

#[test]
fn a_device_offline_across_two_restores_heals_once_for_both() {
    let pair = pair();
    let a = pair.a();
    let older = pair.space.server.backup();
    let first = a.add_card(&pair.library.deck, &pair.library.template, "first");
    a.sync();
    pair.b.sync();
    let newer = pair.space.server.backup();
    let second = a.add_card(&pair.library.deck, &pair.library.template, "second");
    a.sync();
    pair.b.sync();

    // A is gone; B is offline across both restores.
    pair.space.server.restore(&newer, RestoreMode::Heal);
    pair.space.server.restore(&older, RestoreMode::Heal);
    pair.b.sync();

    let witness = pair.witness();
    assert!(witness.has_card(&first) && witness.has_card(&second));
}

#[test]
fn an_edit_waiting_at_the_restore_reaches_the_space() {
    let pair = pair();
    let backup = pair.space.server.backup();
    let a = pair.a();
    let card = a.add_card(&pair.library.deck, &pair.library.template, "draft");
    a.sync();
    a.edit(&card, "final");

    pair.space.server.restore(&backup, RestoreMode::Heal);
    a.sync();

    assert_eq!(a.count("SELECT COUNT(*) FROM sync_outbox"), 0);
    assert_eq!(pair.witness().card_front(&card), "final");
}

fn is_held(device: &Device) -> bool {
    device.engine.status().expect("status reads").state == State::Stopped(Stop::AuthoritativeRestore)
}

/// Syncs into the held restore, accepts it, and syncs again from the restored space.
fn accept(device: &Device) {
    device.engine.sync_now().expect_err("the restore waits for the host");
    assert!(is_held(device));
    device.engine.accept_restore().expect("the host accepts");
    device.sync();
}

#[test]
fn a_mass_delete_is_undone_on_every_device_once_each_accepts() {
    let pair = pair();
    let a = pair.a();
    let offline = pair.witness();
    let backup = pair.space.server.backup();
    decks::delete_deck(
        &a.db,
        DeleteDeckData {
            id: pair.library.deck.clone(),
        },
    )
    .expect("A deletes the deck");
    a.sync();
    pair.b.sync();
    assert!(pair.b.deck(&pair.library.deck).is_none());

    let algorithms = a.ids("algorithms");
    pair.space.server.restore(&backup, RestoreMode::Authoritative);
    a.engine.sync_now().expect_err("the restore waits for the host");

    assert!(is_held(a));
    assert!(
        a.deck(&pair.library.deck).is_none(),
        "nothing changes before the host accepts"
    );
    assert_eq!(
        a.ids("algorithms"),
        algorithms,
        "nothing is deleted before the host accepts"
    );
    a.engine.accept_restore().expect("the host accepts");
    a.sync();
    accept(&pair.b);
    accept(&offline);
    for device in [a, &pair.b, &offline] {
        assert!(
            device.has_card(&pair.library.card),
            "every device holds the backup's card again"
        );
        assert_eq!(device.ids("decks"), a.ids("decks"));
        assert!(!is_held(device));
    }
}

#[test]
fn a_write_waiting_at_an_authoritative_restore_is_gone_and_no_seq_is_reused() {
    let pair = pair();
    let a = pair.a();
    let own = a.state().expect("the device is enrolled").device_id;
    let backup = pair.space.server.backup();
    let lost = a.add_card(&pair.library.deck, &pair.library.template, "lost");

    pair.space.server.restore(&backup, RestoreMode::Authoritative);
    accept(a);
    let kept = a.add_card(&pair.library.deck, &pair.library.template, "kept");
    a.sync();

    assert!(!a.has_card(&lost), "a write made after the backup is gone on purpose");
    assert_eq!(a.state().expect("the device is enrolled").device_id, own, "no fork");
    assert!(!pair.space.outcomes(a).contains(&Outcome::SeqReused));
    assert!(pair.witness().has_card(&kept));
}

#[test]
fn a_device_offline_across_an_authoritative_then_a_heal_restore_takes_the_authoritative_backup() {
    let pair = pair();
    let a = pair.a();
    let first = pair.space.server.backup();
    let offline_write = pair.b.add_card(&pair.library.deck, &pair.library.template, "B offline");
    decks::delete_deck(
        &a.db,
        DeleteDeckData {
            id: pair.library.deck.clone(),
        },
    )
    .expect("A deletes the deck");
    a.sync();
    pair.space.server.restore(&first, RestoreMode::Authoritative);
    accept(a);
    let later = a.add_card(&pair.library.deck, &pair.library.template, "after the first restore");
    a.sync();
    let second = pair.space.server.backup();
    pair.space.server.restore(&second, RestoreMode::Heal);
    a.sync();

    accept(&pair.b);

    assert!(pair.b.has_card(&later));
    assert!(
        !pair.b.has_card(&offline_write),
        "the authoritative restore discarded B's write"
    );
    assert_eq!(pair.b.ids("cards"), a.ids("cards"));
}

#[test]
fn a_held_restore_survives_a_relaunch_and_deletes_nothing() {
    let pair = pair();
    let a = pair.a();
    let backup = pair.space.server.backup();
    let waiting = a.add_card(&pair.library.deck, &pair.library.template, "waiting");
    pair.space.server.restore(&backup, RestoreMode::Authoritative);
    a.engine.sync_now().expect_err("the restore waits for the host");

    let relaunched = pair.space.server.relaunch(a);

    assert!(is_held(&relaunched), "the record outlives the relaunch");
    relaunched.engine.sync_now().expect_err("still waiting");
    assert!(relaunched.has_card(&waiting));
    assert_eq!(relaunched.count("SELECT COUNT(*) FROM sync_outbox"), 1);
}

/// A code for `device`'s space from the setup token, as `koloda-server pair` gives one when no device can.
fn break_glass_code(space: &Space) -> String {
    let (status, reply) = space.server.post::<_, Pairing>(
        &format!("/v1/spaces/{}/pairings", space.space_id()),
        Some(&space.server.setup_token),
        &IssuePairing::default(),
    );
    assert_eq!(status, 200, "{:?}", reply.error);
    reply.ok.expect("a pairing code").code
}

fn reattach(device: &Device, code: &str, url: &str) {
    let joined = device
        .engine
        .join(url, code, "Again", seed_settings())
        .expect("the file re-attaches");
    assert_eq!(joined.mode, JoinMode::Reattach);
}

fn is_told_to_pair_again(device: &Device) -> bool {
    matches!(device.engine.sync_now(), Err(SyncError::PairAgain))
        && device.engine.status().expect("status reads").state == State::Stopped(Stop::Restored)
}

#[test]
fn a_device_enrolled_after_the_backup_pairs_again_and_its_writes_reach_the_space() {
    let pair = pair();
    let a = pair.a();
    let backup = pair.space.server.backup();
    let late = pair.space.server.join(a);
    late.sync();
    let card = late.add_card(&pair.library.deck, &pair.library.template, "late");
    late.sync();

    pair.space.server.restore(&backup, RestoreMode::Heal);
    a.sync();

    assert!(is_told_to_pair_again(&late));
    assert!(late.state().is_some() && late.count("SELECT detached_at IS NOT NULL FROM sync_state") == 1);
    let code = a.engine.issue_pairing(None).expect("A issues a code").code;
    reattach(&late, &code, SERVER_URL);
    late.sync();
    assert!(
        pair.witness().has_card(&card),
        "the late device's write reached the restored space"
    );
}

#[test]
fn rotated_tokens_make_every_device_pair_again_without_losing_a_write() {
    let pair = pair();
    let a = pair.a();
    let backup = pair.space.server.backup();
    let card = a.add_card(&pair.library.deck, &pair.library.template, "rotated");
    a.sync();
    pair.b.sync();

    pair.space.server.restore_with(
        &backup,
        RestoreOptions {
            mode: RestoreMode::Heal,
            is_rotating_tokens: true,
        },
    );

    for device in [a, &pair.b] {
        assert!(is_told_to_pair_again(device));
        reattach(device, &break_glass_code(&pair.space), SERVER_URL);
        device.sync();
    }
    assert!(pair.witness().has_card(&card));
}

#[test]
fn a_re_attach_after_an_authoritative_restore_holds_then_converges() {
    let pair = pair();
    let a = pair.a();
    let backup = pair.space.server.backup();
    let late = pair.space.server.join(a);
    late.sync();
    let lost = late.add_card(&pair.library.deck, &pair.library.template, "lost");
    late.sync();

    pair.space.server.restore(&backup, RestoreMode::Authoritative);
    accept(a);
    assert!(is_told_to_pair_again(&late));
    let code = a.engine.issue_pairing(None).expect("A issues a code").code;
    reattach(&late, &code, SERVER_URL);

    accept(&late);
    assert!(!late.has_card(&lost));
    assert_eq!(late.ids("cards"), a.ids("cards"));
}

#[test]
fn a_re_attach_records_the_url_its_code_came_through() {
    let pair = pair();
    pair.b.engine.detach().expect("B detaches");
    let code = pair.a().engine.issue_pairing(None).expect("A issues a code").code;

    reattach(&pair.b, &code, "https://moved.test");

    assert_eq!(
        pair.b.state().expect("B is enrolled").server_url.as_deref(),
        Some("https://moved.test")
    );
}

#[test]
fn a_restore_after_the_claim_is_applied_and_the_re_attach_finishes_on_the_claimed_device() {
    let pair = pair();
    let old = pair.b.state().expect("B is enrolled").device_id;
    pair.b.engine.detach().expect("B detaches");
    let code = pair.a().engine.issue_pairing(None).expect("A issues a code").code;
    let restored = Arc::new(AtomicBool::new(false));
    let flag = Arc::clone(&restored);
    // WHY: the observer runs during `join`, before this function returns, so the server is still here.
    let server = &pair.space.server as *const crate::common::TestServer as usize;
    pair.b.transport.observe(move |request| {
        if request.method != Method::Get || !request.url.contains("/devices/") || flag.swap(true, Ordering::SeqCst) {
            return;
        }
        // SAFETY: `server` points at `pair.space.server`, which this `join` keeps alive.
        let server = unsafe { &*(server as *const crate::common::TestServer) };
        let backup = server.backup();
        server.restore(&backup, RestoreMode::Heal);
    });

    reattach(&pair.b, &code, SERVER_URL);

    let state = pair.b.state().expect("B is enrolled");
    assert_ne!(state.device_id, old, "the file finishes on the device the claim made");
    assert!(
        restored.load(Ordering::SeqCst),
        "the restore ran on the lookup after the claim"
    );
    assert_eq!(
        Some(pair.b.epoch()),
        pair.space
            .server
            .current_epoch(&format!("/v1/spaces/{}/", pair.space.space_id())),
        "the restore that landed after the claim was applied"
    );
    pair.b.sync();
}

#[test]
fn an_image_uploaded_after_the_backup_goes_up_again_even_when_the_first_check_fails() {
    let pair = pair();
    let a = pair.a();
    let mut bytes = b"\x89PNG\r\n\x1a\n".to_vec();
    bytes.extend((64..128_u8).collect::<Vec<_>>());
    let image = add_attachment(
        &a.db,
        AddAttachmentData {
            bytes,
            width: None,
            height: None,
        },
    )
    .expect("the image is stored")
    .id;
    // The card reaches the space before the backup; its image goes up only after it.
    a.transport.fault_when(
        Method::Put,
        "/attachments/",
        Fault::Reply(error_reply(500, ErrorCode::Internal)),
    );
    let card = a.add_card(
        &pair.library.deck,
        &pair.library.template,
        &format!("![x](attachment:{image})"),
    );
    a.engine.sync_now().expect("the upload waits out its backoff");
    let backup = pair.space.server.backup();
    a.execute("UPDATE sync_attachment_queue SET next_attempt_at = 0");
    a.sync();

    pair.space.server.restore(&backup, RestoreMode::Heal);
    a.transport.fault_on(
        "/attachments/missing",
        Fault::Reply(error_reply(500, ErrorCode::Internal)),
    );
    a.engine.sync_now().expect_err("the first check fails");
    a.sync();

    let witness = pair.witness();
    assert!(witness.has_card(&card));
    assert!(
        get_attachment_bytes(&witness.db, &image).expect("bytes read").is_some(),
        "A re-uploaded the bytes the backup lacked"
    );
    assert_eq!(a.count("SELECT is_checking_attachments FROM sync_state"), 0);
}
