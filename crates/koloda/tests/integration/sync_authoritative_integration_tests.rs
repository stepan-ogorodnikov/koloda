//! Discarding local data for an authoritative server restore (`crates/koloda-sync-proto/PROTOCOL.md` §Server
//! restore). The file waits for its host, then bootstraps from the backup as a blank joiner.

use koloda::app::db::Database;
use koloda::domain::attachments::AddAttachmentData;
use koloda::domain::cards::DeleteCardData;
use koloda::domain::settings::SettingsName;
use koloda::repo::attachments::add_attachment;
use koloda::repo::cards::delete_card;
use koloda::repo::settings;
use koloda::repo::sync::authoritative::{hold_authoritative, reset_for_authoritative};
use koloda::repo::sync::heal::begin_heal;
use koloda::repo::sync::{sync_state, SpaceRole};
use serde_json::json;
use uuid::Uuid;

use crate::common::fixtures::{add_algorithm, add_card, add_conversation, add_deck, add_template, insert_review_row};
use crate::common::sync::{copy_of, count, device, enroll, enroll_as, FakeSpace};
use crate::common::{learning_settings, test_db};

const RESTORED: Uuid = Uuid::from_u128(0x0192_0000_0000_7000_8000_0000_0000_a07e);

const PRODUCT_TABLES: [&str; 6] = [
    "reviews",
    "cards",
    "decks",
    "algorithm_revisions",
    "algorithms",
    "templates",
];
const SYNC_TABLES: [&str; 8] = [
    "sync_stamps",
    "sync_origins",
    "sync_outbox",
    "sync_cohorts",
    "sync_tombstones",
    "sync_held",
    "sync_attachment_queue",
    "sync_heal_cutoffs",
];

fn rows(db: &Database, table: &str) -> i64 {
    count(db, &format!("SELECT COUNT(*) FROM {table}"))
}

/// A file with every kind of row, pending writes, a tombstone, and a heal in progress.
fn used_file() -> Database {
    let db = test_db();
    settings::set_settings(&db, SettingsName::Learning, learning_settings(200, 20, 50, 100))
        .expect("learning settings save");
    enroll(&db);
    let algorithm = add_algorithm(&db, "FSRS");
    let template = add_template(&db, "Basic");
    let deck = add_deck(&db, &algorithm, &template, "Spanish");
    let card = add_card(&db, &deck, &template, "hola");
    insert_review_row(&db, &card, 2, 0, 1_727_000_000_500);
    let gone = add_card(&db, &deck, &template, "adiós");
    delete_card(&db, DeleteCardData { id: gone }).expect("card deletes");
    add_conversation(&db, "conversation", json!({ "turns": [] }));
    add_attachment(
        &db,
        AddAttachmentData {
            bytes: b"\x89PNG\r\n\x1a\n\0\0\0\0\0\0\0\0".to_vec(),
            width: None,
            height: None,
        },
    )
    .expect("attachment adds");
    begin_heal(&db, Uuid::now_v7(), 0, 0, &[]).expect("heal begins");
    db.with_conn(|conn| {
        conn.execute(
            "INSERT INTO sync_attachment_queue (id, direction, attempts, next_attempt_at) VALUES ('a', 'fetch', 0, 0)",
            [],
        )?;
        Ok(())
    })
    .expect("a fetch queues");
    db
}

#[test]
fn a_held_restore_deletes_nothing_until_the_reset() {
    let db = used_file();
    let before: Vec<i64> = PRODUCT_TABLES.iter().map(|table| rows(&db, table)).collect();

    hold_authoritative(&db, RESTORED, 4).expect("restore is held");

    assert_eq!(
        PRODUCT_TABLES.iter().map(|table| rows(&db, table)).collect::<Vec<_>>(),
        before
    );
    let reopened = copy_of(&db);
    assert!(
        sync_state(&reopened)
            .expect("state reads")
            .expect("enrolled")
            .is_restore_held,
        "the held restore outlives a relaunch"
    );
}

#[test]
fn a_reset_keeps_only_device_local_data_and_bootstraps_as_a_blank_joiner() {
    let db = used_file();
    let own = device(&db);
    hold_authoritative(&db, RESTORED, 4).expect("restore is held");

    reset_for_authoritative(&db).expect("file resets");

    for table in PRODUCT_TABLES.into_iter().chain(SYNC_TABLES) {
        assert_eq!(rows(&db, table), 0, "{table} is empty");
    }
    for table in ["settings", "conversations", "attachments"] {
        assert!(rows(&db, table) > 0, "{table} stays");
    }
    let state = sync_state(&db).expect("state reads").expect("still enrolled");
    assert_eq!(state.device_id, own, "the device keeps its id and token");
    assert_eq!(state.epoch, Some(RESTORED));
    assert_eq!((state.cursor_hot, state.cursor_cold), (0, 0));
    assert!(state.is_bootstrapping);
    assert!(!state.is_restore_held);
    assert!(!state.is_rebasing);
    assert_eq!(
        count(
            &db,
            "SELECT heal_step IS NULL AND backfill_step IS NULL FROM sync_state"
        ),
        1
    );
}

#[test]
fn the_next_seq_is_above_both_the_files_and_the_servers() {
    for (local_next, server_last, expected) in [(10, 3, 10), (5, 20, 21), (8, 7, 8)] {
        let db = used_file();
        db.with_conn(|conn| {
            conn.execute(
                "UPDATE sync_state SET next_sender_seq = ?1, last_observed_server_seq = 2 WHERE id = 1",
                rusqlite::params![local_next],
            )?;
            Ok(())
        })
        .expect("seq sets");
        hold_authoritative(&db, RESTORED, server_last).expect("restore is held");

        reset_for_authoritative(&db).expect("file resets");

        assert_eq!(count(&db, "SELECT next_sender_seq FROM sync_state"), expected);
        assert!(
            count(&db, "SELECT last_observed_server_seq FROM sync_state") >= i64::try_from(server_last).expect("fits"),
            "the server's record must not read as another copy's pushes"
        );
    }
}

#[test]
fn a_reset_file_takes_the_spaces_rows_and_learning_settings() {
    let creator = test_db();
    koloda::app::init::seed_db(&creator, crate::common::seed_data("Simple", "Basic")).expect("creator seeds");
    settings::set_settings(&creator, SettingsName::Learning, learning_settings(300, 30, 60, 90))
        .expect("learning settings save");
    enroll_as(&creator, SpaceRole::Creator);
    let mut space = FakeSpace::default();
    space.drain_backfill(&creator, 100);
    let db = used_file();
    hold_authoritative(&db, RESTORED, 0).expect("restore is held");
    reset_for_authoritative(&db).expect("file resets");

    space.pull(&db);

    for table in ["algorithms", "templates"] {
        assert_eq!(
            count(&db, &format!("SELECT COUNT(*) FROM {table}")),
            count(&creator, &format!("SELECT COUNT(*) FROM {table}")),
            "{table} come from the space"
        );
    }
    let limit = |db: &Database| {
        settings::get_settings(db, SettingsName::Learning)
            .expect("settings read")
            .expect("learning exists")
            .content["dailyLimits"]["total"]
            .clone()
    };
    assert_eq!(limit(&creator), json!(300));
    assert_eq!(
        limit(&db),
        limit(&creator),
        "the space's learning document overlays the kept one"
    );
}

#[test]
fn a_reset_without_a_held_restore_is_refused() {
    let db = used_file();

    assert!(reset_for_authoritative(&db).is_err());
    assert!(rows(&db, "cards") > 0);
}
