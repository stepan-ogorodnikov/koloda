use std::num::NonZeroU32;

use koloda::app::db::Database;
use koloda::domain::attachments::{AddAttachmentData, ATTACHMENT_MAX_BYTES};
use koloda::repo::attachments as repo;

use crate::common::test_db;

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
