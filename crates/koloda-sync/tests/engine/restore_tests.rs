//! A server restore seen from devices: heal re-pushes what the backup lacks (`crates/koloda-sync-proto/PROTOCOL.md`
//! §Server restore).

use std::collections::HashMap;

use koloda::domain::attachments::AddAttachmentData;
use koloda::domain::cards::{CardContentField, DeleteCardData, UpdateCardData, UpdateCardValues};
use koloda::repo::attachments::{add_attachment, get_attachment_bytes};
use koloda::repo::cards;
use koloda_sync::transport::Method;
use koloda_sync_proto::envelope::Envelope;
use koloda_sync_proto::hlc::{DeviceId, Hlc, Stamp};
use koloda_sync_proto::payload::{Delete, Payload, Title};
use koloda_sync_proto::registry::{Group, Kind, Lane};
use koloda_sync_proto::transport::{ErrorCode, Outcome, RestoreMode};
use uuid::Uuid;

use crate::common::{error_reply, system_ms, Device, Fault, Space};
use crate::fixtures::{Library, BACK, FRONT};

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
