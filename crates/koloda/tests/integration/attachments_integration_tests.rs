use std::num::NonZeroU32;

use koloda::app::db::Database;
use koloda::domain::attachments::{AddAttachmentData, SweepAttachmentsData, ATTACHMENT_MAX_BYTES};
use koloda::domain::cards::InsertCardData;
use koloda::repo::attachments as repo;
use koloda::repo::cards;

use crate::common::fixtures::{add_algorithm, add_deck, add_template};
use crate::common::{card_content, test_db};

// WHY: the web twin pins the same literal, so both hosts mint the same id for the same bytes.
const PNG_16_ID: &str = "d9c9bcbbba3f78d5acb0e0223861c44f79e918c161d4ea7b571f5cc6df50797f";

fn png_of_len(len: usize) -> Vec<u8> {
    let mut bytes = b"\x89PNG\r\n\x1a\n".to_vec();
    bytes.resize(len, 0);
    bytes
}

fn add_data(bytes: Vec<u8>, width: Option<u32>, height: Option<u32>) -> AddAttachmentData {
    AddAttachmentData {
        bytes,
        width: width.and_then(NonZeroU32::new),
        height: height.and_then(NonZeroU32::new),
    }
}

fn count_rows(db: &Database, table: &str) -> i64 {
    db.with_conn(|conn| Ok(conn.query_row(&format!("SELECT COUNT(*) FROM {table}"), [], |row| row.get(0))?))
        .expect("count query should succeed")
}

#[test]
fn add_attachment_round_trips_every_field() {
    let db = test_db();

    let added =
        repo::add_attachment(&db, add_data(png_of_len(16), Some(640), Some(480))).expect("a valid png should be added");
    let stored = repo::get_attachment(&db, PNG_16_ID)
        .expect("query should succeed")
        .expect("attachment should exist");

    assert_eq!(stored.id, PNG_16_ID, "the id is the hex SHA-256 of the bytes");
    assert_eq!(stored.mime, "image/png");
    assert_eq!(stored.size, 16);
    assert_eq!(stored.width, Some(640));
    assert_eq!(stored.height, Some(480));
    assert!(stored.created_at > 0, "created_at is stamped at insert");
    assert_eq!(stored, added);
    assert_eq!(
        repo::get_attachment_bytes(&db, PNG_16_ID).expect("query should succeed"),
        Some(png_of_len(16))
    );
}

#[test]
fn re_adding_the_same_bytes_returns_the_existing_row_unchanged() {
    let db = test_db();

    let first = repo::add_attachment(&db, add_data(png_of_len(16), Some(640), Some(480))).expect("first add");
    let second = repo::add_attachment(&db, add_data(png_of_len(16), None, None)).expect("re-add");

    assert_eq!(second, first);
    assert_eq!(count_rows(&db, "attachments"), 1);
    assert_eq!(count_rows(&db, "attachment_bytes"), 1);
}

// WHY: second door over the domain cap test — pins that the repo validates before it writes.
#[test]
fn add_attachment_over_the_cap_fails_and_writes_nothing() {
    let db = test_db();

    let error = repo::add_attachment(&db, add_data(png_of_len(ATTACHMENT_MAX_BYTES + 1), None, None))
        .expect_err("an over-cap add must fail");

    assert_eq!(error.code, "validation.attachments.too-large");
    assert_eq!(count_rows(&db, "attachments"), 0);
    assert_eq!(count_rows(&db, "attachment_bytes"), 0);
}

fn set_created_at(db: &Database, id: &str, created_at: i64) {
    db.with_conn(|conn| {
        conn.execute(
            "UPDATE attachments SET created_at = ?1 WHERE id = ?2",
            rusqlite::params![created_at, id],
        )?;
        Ok(())
    })
    .expect("created_at update should succeed");
}

#[test]
fn sweep_removes_only_old_unreferenced_attachments() {
    let db = test_db();
    let cutoff = 1_000_000;
    let referenced = repo::add_attachment(&db, add_data(png_of_len(16), None, None)).expect("add");
    let old = repo::add_attachment(&db, add_data(png_of_len(17), None, None)).expect("add");
    let at_cutoff = repo::add_attachment(&db, add_data(png_of_len(18), None, None)).expect("add");
    set_created_at(&db, &referenced.id, cutoff - 1);
    set_created_at(&db, &old.id, cutoff - 1);
    set_created_at(&db, &at_cutoff.id, cutoff);

    let algorithm_id = add_algorithm(&db, "Algorithm");
    let template_id = add_template(&db, "Template");
    let deck_id = add_deck(&db, &algorithm_id, &template_id, "Deck");
    // The ref sits mid-text in the back field, so nothing matches it by position.
    let content = card_content("question", &format!("see ![x](attachment:{})", referenced.id));
    cards::add_card(
        &db,
        InsertCardData {
            deck_id,
            template_id,
            content,
            state: None,
            due_at: None,
            stability: None,
            difficulty: None,
            scheduled_days: None,
            learning_steps: None,
            reps: None,
            lapses: None,
            last_reviewed_at: None,
        },
    )
    .expect("card should be created");

    repo::sweep_attachments(&db, SweepAttachmentsData { created_before: cutoff }).expect("sweep should succeed");

    let has = |id: &str| repo::get_attachment(&db, id).expect("query should succeed").is_some();
    assert!(has(&referenced.id), "a referenced attachment survives, however old");
    assert!(
        !has(&old.id),
        "an unreferenced attachment older than the cutoff is removed"
    );
    assert!(
        has(&at_cutoff.id),
        "an attachment created exactly at the cutoff survives"
    );
    assert_eq!(
        repo::get_attachment_bytes(&db, &old.id).expect("query should succeed"),
        None,
        "the removed attachment's bytes go with it"
    );
    assert_eq!(count_rows(&db, "attachment_bytes"), 2);
}
