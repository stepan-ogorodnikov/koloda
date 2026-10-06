use koloda::app::db::Database;
use koloda::domain::attachments::AddAttachmentData;
use koloda::domain::cards::DeleteCardData;
use koloda::repo::attachments::{add_attachment, get_attachment, get_attachment_bytes};
use koloda::repo::cards::delete_card;
use koloda::repo::sync::attachments::{
    defer_fetch, due_transfers, finish_transfer, store_fetched, upload_source, Direction, Transfer,
};
use koloda::repo::sync::outbox::{push_batch, settle_push};
use koloda_sync_proto::payload::{CardContent, CardCreate, CardScheduling, InitialProductTs, Payload};
use koloda_sync_proto::transport::{Outcome, PushOutcome};
use sha2::{Digest, Sha256};
use uuid::Uuid;

use crate::common::fixtures::{add_algorithm, add_card, add_deck, add_template};
use crate::common::sync::{apply, count, enrolled_deck, hot_page, replica, sealed, stamp, starter, DeckFixture};
use crate::common::test_db;

const WALL_MS: u64 = 1_727_000_000_000;
const CARD: &str = "01920000-0000-7000-8000-0000000000c1";
const OTHER_CARD: &str = "01920000-0000-7000-8000-0000000000c2";
const MINUTE_MS: i64 = 60 * 1000;
const HOUR_MS: i64 = 60 * MINUTE_MS;

fn png(seed: u8) -> AddAttachmentData {
    let mut bytes = b"\x89PNG\r\n\x1a\n".to_vec();
    bytes.extend([seed; 32]);
    AddAttachmentData {
        bytes,
        width: None,
        height: None,
    }
}

fn id_of(data: &AddAttachmentData) -> String {
    format!("{:x}", Sha256::digest(&data.bytes))
}

fn links(ids: &[&str]) -> String {
    ids.iter()
        .map(|id| format!("![x](attachment:{id})"))
        .collect::<Vec<_>>()
        .join(" ")
}

fn linking(ids: &[&str]) -> String {
    serde_json::json!({ "01900000-0000-7000-8000-000000000001": { "text": links(ids) } }).to_string()
}

/// Applies a card create from another device, linking `ids`, at a stamp older than any local write.
fn pull_card(db: &Database, fixture: &DeckFixture, card: &str, ids: &[&str]) {
    let create = Payload::CardCreate(CardCreate {
        deck_id: fixture.deck.clone(),
        template_id: fixture.template.clone(),
        content: linking(ids),
        scheduling: CardScheduling {
            state: 0,
            due_at: None,
            stability: 0.0,
            difficulty: 0.0,
            scheduled_days: 0,
            learning_steps: 0,
            reps: 0,
            lapses: 0,
            last_reviewed_at: None,
        },
        created_at: 1_726_000_000_000,
        initial_product_ts: InitialProductTs::new(),
        legacy_product_ts_floor: None,
    });
    let remote = Uuid::now_v7();
    let page = hot_page(
        remote,
        vec![sealed(card, Some(&fixture.deck), stamp(remote, WALL_MS), &create)],
        1,
    );
    apply(db, &page).expect("the card applies");
}

/// Applies a content edit from another device at `wall_ms`.
fn pull_content(db: &Database, fixture: &DeckFixture, card: &str, wall_ms: u64, ids: &[&str]) {
    let content = Payload::CardContent(CardContent {
        content: linking(ids),
        updated_at: Some(1_726_000_000_000),
    });
    let remote = Uuid::now_v7();
    let page = hot_page(
        remote,
        vec![sealed(card, Some(&fixture.deck), stamp(remote, wall_ms), &content)],
        1,
    );
    apply(db, &page).expect("the edit applies");
}

fn fetch(id: &str) -> Transfer {
    Transfer {
        id: id.to_string(),
        direction: Direction::Fetch,
    }
}

fn upload(id: &str) -> Transfer {
    Transfer {
        id: id.to_string(),
        direction: Direction::Upload,
    }
}

fn due_now(db: &Database) -> Vec<Transfer> {
    let mut due = due_transfers(db, i64::MAX, 100).expect("due transfers read");
    due.sort_by(|left, right| left.id.cmp(&right.id));
    due
}

#[test]
fn pulled_cards_queue_fetches_for_the_images_this_device_lacks() {
    let db = test_db();
    let fixture = enrolled_deck(&db);
    let held = add_attachment(&db, png(1)).unwrap().id;
    let (missing, later) = (id_of(&png(2)), id_of(&png(3)));

    pull_card(&db, &fixture, CARD, &[&held, &missing]);
    let after_create = due_now(&db);
    pull_content(&db, &fixture, CARD, WALL_MS + 1_000, &[&held, &later]);

    assert_eq!(after_create, vec![fetch(&missing)]);
    assert_eq!(
        due_now(&db),
        vec![fetch(&later)],
        "the edit queues its new image, and the image it dropped is no longer wanted"
    );
}

#[test]
fn a_losing_content_envelope_queues_nothing() {
    let db = test_db();
    let fixture = enrolled_deck(&db);
    let card = add_card(&db, &fixture.deck, &fixture.template, "hola");

    pull_content(&db, &fixture, &card, WALL_MS, &[&id_of(&png(4))]);

    assert_eq!(due_now(&db), Vec::new());
}

#[test]
fn a_push_outcome_queues_uploads_only_for_images_this_device_holds() {
    let db = replica();
    let template = add_template(&db, "Basic");
    let deck = add_deck(&db, &add_algorithm(&db, "FSRS"), &template, "Spanish");
    let held = add_attachment(&db, png(5)).unwrap().id;
    let swept = id_of(&png(6));
    add_card(&db, &deck, &template, &links(&[&held, &swept]));

    let batch = push_batch(&db, 100, usize::MAX).unwrap();
    let last = batch.items.last().expect("the card create is last").sender_seq;
    let outcomes: Vec<PushOutcome> = batch
        .items
        .iter()
        .map(|item| PushOutcome {
            sender_seq: item.sender_seq,
            outcome: Outcome::Applied,
            replayed: false,
            missing_attachments: if item.sender_seq == last {
                vec![held.clone(), swept.clone()]
            } else {
                Vec::new()
            },
        })
        .collect();
    settle_push(&db, &batch, &outcomes, &starter()).unwrap();

    assert_eq!(due_now(&db), vec![upload(&held)]);
    let (attachment, bytes) = upload_source(&db, &held).unwrap().expect("the upload has its bytes");
    assert_eq!(attachment.id, held);
    assert_eq!(bytes, png(5).bytes);
    finish_transfer(&db, &upload(&held)).unwrap();
    assert_eq!(due_now(&db), Vec::new());
}

#[test]
fn fetched_bytes_are_stored_only_when_they_match_their_id() {
    let db = test_db();
    let fixture = enrolled_deck(&db);
    let (good, bad) = (png(7), png(8));
    let (good_id, bad_id) = (id_of(&good), id_of(&bad));
    pull_card(&db, &fixture, CARD, &[&good_id, &bad_id]);

    let is_good_stored = store_fetched(&db, &good_id, &good).unwrap();
    let is_bad_stored = store_fetched(&db, &bad_id, &png(9)).unwrap();

    assert!(is_good_stored);
    assert_eq!(get_attachment_bytes(&db, &good_id).unwrap(), Some(good.bytes));
    assert!(!is_bad_stored, "bytes of another image are refused");
    assert_eq!(get_attachment(&db, &bad_id).unwrap(), None);
    assert_eq!(due_now(&db), Vec::new(), "both fetches are done");
}

#[test]
fn a_fetch_the_server_could_not_serve_waits_longer_each_time() {
    let db = test_db();
    let fixture = enrolled_deck(&db);
    let missing = id_of(&png(10));
    pull_card(&db, &fixture, CARD, &[&missing]);

    let mut delays = Vec::new();
    let mut at = 1_000_000;
    for _ in 0..11 {
        defer_fetch(&db, &missing, at).unwrap();
        let mut next = at;
        while due_transfers(&db, next, 10).unwrap().is_empty() {
            next += MINUTE_MS;
        }
        delays.push(next - at);
        at = next;
    }

    let minutes = [1, 2, 4, 8, 16, 32, 64, 128, 256].map(|minutes| minutes * MINUTE_MS);
    assert_eq!(delays[..9], minutes, "the delay doubles from one minute");
    assert_eq!(delays[9..], [6 * HOUR_MS, 6 * HOUR_MS], "and stops at six hours");
}

#[test]
fn a_fetch_no_card_needs_any_more_is_dropped() {
    let db = test_db();
    let fixture = enrolled_deck(&db);
    let (unlinked, arrived) = (png(11), png(12));
    pull_card(&db, &fixture, CARD, &[&id_of(&unlinked)]);
    pull_card(&db, &fixture, OTHER_CARD, &[&id_of(&arrived)]);
    assert_eq!(due_now(&db).len(), 2);

    delete_card(&db, DeleteCardData { id: CARD.to_string() }).unwrap();
    add_attachment(&db, arrived).unwrap();

    assert_eq!(due_now(&db), Vec::new());
    assert_eq!(count(&db, "SELECT COUNT(*) FROM sync_attachment_queue"), 0);
}
