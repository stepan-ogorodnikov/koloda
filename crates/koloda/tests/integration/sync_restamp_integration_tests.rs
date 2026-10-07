//! Re-stamping `local` cohorts after a clock correction (`crates/koloda-sync-proto/PROTOCOL.md` §Cohorts, §Hybrid
//! logical clock). A wrong clock is simulated by moving `last_hlc` ahead, as captures on a clock set ahead leave it.

use std::collections::HashMap;
use std::time::{SystemTime, UNIX_EPOCH};

use koloda::app::db::Database;
use koloda::domain::cards::{ResetCardProgressData, UpdateCardProgress};
use koloda::domain::decks::{DeleteDeckData, UpdateDeckData, UpdateDeckValues};
use koloda::domain::lessons::LessonResultData;
use koloda::domain::reviews::InsertReviewData;
use koloda::repo::cards::{get_card, reset_card_progress};
use koloda::repo::decks::{delete_deck, get_deck, update_deck};
use koloda::repo::lessons::submit_lesson_result;
use koloda::repo::sync::backfill::backfill_batch;
use koloda::repo::sync::outbox::{push_batch, push_lost};
use koloda::repo::sync::restamp::restamp_local_cohorts;
use koloda::repo::sync::SpaceRole;
use koloda_sync_proto::envelope::digest;
use koloda_sync_proto::hlc::{Hlc, Stamp};

use crate::common::fixtures::{add_algorithm, add_card, add_deck, add_template};
use crate::common::sync::{count, enroll_as, last_hlc, origin, outbox, register, replica, FakeSpace, OutboxEntry};
use crate::common::test_db;

const MINUTE_MS: u64 = 60 * 1000;
const DAY_MS: u64 = 24 * 60 * MINUTE_MS;

fn now_ms() -> u64 {
    u64::try_from(
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("clock is past the epoch")
            .as_millis(),
    )
    .expect("now fits")
}

/// Moves the device's clock `ahead_ms` past now, so every capture after it stamps from there.
fn set_clock_ahead(db: &Database, ahead_ms: u64) {
    let raw = Hlc::new(now_ms() + ahead_ms, 0).expect("wall time fits").raw();
    db.with_conn(|conn| {
        conn.execute(
            "UPDATE sync_state SET last_hlc = ?1 WHERE id = 1",
            rusqlite::params![i64::try_from(raw).expect("HLC fits")],
        )?;
        Ok(())
    })
    .expect("clock moves");
}

fn restamp(db: &Database) {
    restamp_local_cohorts(db, now_ms()).expect("cohorts re-stamp");
}

/// The stamp of each pending commit, keyed by `commit_id`; fails if a commit's rows disagree.
fn commit_stamps(entries: &[OutboxEntry]) -> HashMap<[u8; 16], Stamp> {
    let mut stamps = HashMap::new();
    for entry in entries {
        let header = &entry.envelope.header;
        let stamp = *stamps.entry(header.commit_id).or_insert(header.stamp);
        assert_eq!(stamp, header.stamp, "every row of one commit shares its stamp");
    }
    stamps
}

fn pending_stamp(db: &Database, kind: &str, id: &str) -> Stamp {
    outbox(db)
        .into_iter()
        .find(|entry| entry.envelope.header.kind.as_wire() == kind && entry.envelope.header.id == id)
        .expect("the write is pending")
        .envelope
        .header
        .stamp
}

fn grade(db: &Database, card: &str) {
    submit_lesson_result(
        db,
        LessonResultData {
            card: UpdateCardProgress {
                id: card.to_string(),
                state: 2,
                due_at: 1_900_000_000_000,
                stability: 5.5,
                difficulty: 4.25,
                scheduled_days: 9,
                learning_steps: 0,
                reps: 1,
                lapses: 0,
                last_reviewed_at: Some(1_800_000_000_000),
            },
            review: InsertReviewData {
                card_id: card.to_string(),
                rating: 3,
                state: 2,
                due_at: 1_900_000_000_000,
                stability: 5.5,
                difficulty: 4.25,
                scheduled_days: 9,
                learning_steps: 0,
                time: 12,
                is_ignored: false,
            },
        },
    )
    .expect("grade submits");
}

fn reset(db: &Database, card: &str) {
    reset_card_progress(db, ResetCardProgressData { id: card.to_string() }).expect("card resets");
}

fn retitle(db: &Database, deck: &str, title: &str) {
    let current = get_deck(db, deck).expect("deck reads").expect("deck exists");
    update_deck(
        db,
        UpdateDeckData {
            id: deck.to_string(),
            values: UpdateDeckValues {
                title: title.to_string(),
                algorithm_id: current.algorithm_id,
                template_id: current.template_id,
                notes: current.notes,
            },
        },
    )
    .expect("deck updates");
}

fn review_of(db: &Database, card: &str) -> String {
    db.with_conn(|conn| {
        Ok(conn.query_row(
            "SELECT id FROM reviews WHERE card_id = ?1",
            rusqlite::params![card],
            |row| row.get(0),
        )?)
    })
    .expect("review reads")
}

/// A replica with a deck and two cards whose creates the space already holds.
fn deck_with_cards() -> (Database, String, String) {
    let db = replica();
    let algorithm = add_algorithm(&db, "FSRS");
    let template = add_template(&db, "Basic");
    let deck = add_deck(&db, &algorithm, &template, "Spanish");
    let graded = add_card(&db, &deck, &template, "hola");
    let was_reset = add_card(&db, &deck, &template, "adiós");
    grade(&db, &was_reset);
    FakeSpace::default().push(&db);
    (db, graded, was_reset)
}

#[test]
fn re_stamp_keeps_each_cohort_on_one_new_stamp_with_its_payload() {
    let (db, graded, was_reset) = deck_with_cards();
    set_clock_ahead(&db, DAY_MS);
    grade(&db, &graded);
    reset(&db, &was_reset);
    let before = outbox(&db);
    let old = commit_stamps(&before);
    assert_eq!(old.len(), 2, "a grade and a reset, one commit each");

    restamp(&db);

    let after = outbox(&db);
    let new = commit_stamps(&after);
    for (commit_id, stamp) in &new {
        assert!(
            stamp.hlc < old[commit_id].hlc,
            "the corrected clock stamps below the wrong one"
        );
        assert!(
            stamp.hlc.wall_ms() + MINUTE_MS > now_ms(),
            "the new stamp comes from the corrected clock"
        );
    }
    for (old_row, new_row) in before.iter().zip(&after) {
        assert_eq!(old_row.sender_seq, new_row.sender_seq, "rows keep their seqs");
        assert_eq!(
            old_row.envelope.payload, new_row.envelope.payload,
            "payload bytes are untouched"
        );
        assert_eq!(old_row.envelope.header.commit_id, new_row.envelope.header.commit_id);
    }
    let digests_match: bool = db
        .with_conn(|conn| {
            let rows: Vec<(Vec<u8>, Vec<u8>)> = conn
                .prepare("SELECT envelope, digest FROM sync_outbox")?
                .query_map([], |row| Ok((row.get(0)?, row.get(1)?)))?
                .collect::<Result<_, _>>()?;
            Ok(rows
                .iter()
                .all(|(envelope, stored)| digest(envelope).0.as_slice() == stored.as_slice()))
        })
        .expect("outbox reads");
    assert!(digests_match, "each stored digest is the digest of the new bytes");

    // The registers and origin the two commits wrote follow them.
    let grade_stamp = pending_stamp(&db, "reviews", &review_of(&db, &graded));
    let reset_stamp = pending_stamp(&db, "cards", &was_reset);
    let scheduling = register(&db, "cards", &graded, "scheduling").expect("scheduling register");
    let review = origin(&db, "reviews", &review_of(&db, &graded), "row").expect("review origin");
    assert_eq!((scheduling.hlc, review.hlc), (grade_stamp.hlc, grade_stamp.hlc));
    for group in ["reset", "scheduling"] {
        let register = register(&db, "cards", &was_reset, group).expect("reset registers");
        assert_eq!(register.hlc, reset_stamp.hlc, "the reset's {group} register");
    }
}

#[test]
fn re_stamp_moves_a_creates_synthetic_registers_and_a_deletes_tombstone() {
    let db = replica();
    let algorithm = add_algorithm(&db, "FSRS");
    let template = add_template(&db, "Basic");
    let doomed = add_deck(&db, &algorithm, &template, "Old");
    FakeSpace::default().push(&db);
    set_clock_ahead(&db, DAY_MS);
    let deck = add_deck(&db, &algorithm, &template, "Spanish");
    delete_deck(&db, DeleteDeckData { id: doomed.clone() }).expect("deck deletes");

    restamp(&db);

    let created = pending_stamp(&db, "decks", &deck);
    assert!(created.hlc.wall_ms() < now_ms() + DAY_MS, "the create was re-stamped");
    assert_eq!(
        origin(&db, "decks", &deck, "create").expect("create origin").hlc,
        created.hlc
    );
    for group in ["title", "notes", "algorithm", "template"] {
        let register = register(&db, "decks", &deck, group).expect("deck register");
        assert_eq!(register.hlc, created.hlc, "the {group} register follows the create");
    }
    let deleted = pending_stamp(&db, "decks", &doomed);
    let tombstone = count(
        &db,
        &format!("SELECT hlc FROM sync_tombstones WHERE kind = 'decks' AND id = '{doomed}'"),
    );
    assert_eq!(tombstone, i64::try_from(deleted.hlc.raw()).expect("HLC fits"));
    assert!(deleted.hlc > created.hlc, "the later commit keeps the later stamp");
}

#[test]
fn re_stamp_leaves_uncertain_and_fixed_cohorts_alone() {
    let db = replica();
    let lost = add_template(&db, "Lost");
    let batch = push_batch(&db, 1000, usize::MAX).expect("batch picks");
    push_lost(&db, &batch).expect("reply is lost");
    let sent = add_template(&db, "Sent");
    push_batch(&db, 1000, usize::MAX).expect("batch picks");
    set_clock_ahead(&db, DAY_MS);
    let pending = add_template(&db, "Pending");
    let before = [lost.as_str(), sent.as_str(), pending.as_str()].map(|id| pending_stamp(&db, "templates", id));

    restamp(&db);

    assert_eq!(
        pending_stamp(&db, "templates", &lost),
        before[0],
        "a fixed cohort keeps its stamp"
    );
    assert_eq!(
        pending_stamp(&db, "templates", &sent),
        before[1],
        "an uncertain cohort keeps its stamp"
    );
    let restamped = pending_stamp(&db, "templates", &pending);
    assert!(
        restamped.hlc < before[2].hlc,
        "the local cohort takes the corrected clock"
    );
    assert!(
        restamped.hlc > before[1].hlc,
        "a cohort that went out raised the stable high-water, so the re-stamp stays above it"
    );
}

#[test]
fn re_stamp_leaves_a_backfill_batch_at_its_reserved_stamp() {
    let db = test_db();
    let old = add_template(&db, "Old");
    enroll_as(&db, SpaceRole::Joiner);
    backfill_batch(&db, 100, usize::MAX).expect("backfill batch runs");
    let reserved = pending_stamp(&db, "templates", &old);
    set_clock_ahead(&db, DAY_MS);
    let new = add_template(&db, "New");

    restamp(&db);

    assert_eq!(
        pending_stamp(&db, "templates", &old),
        reserved,
        "the backfill batch keeps its phase stamp"
    );
    let restamped = pending_stamp(&db, "templates", &new);
    assert!(
        restamped.hlc > reserved.hlc,
        "a re-stamped write never sorts before a backfill phase"
    );
    assert!(restamped.hlc.wall_ms() < now_ms() + DAY_MS);
}

#[test]
fn re_stamp_issues_rising_stamps_in_the_old_order_and_lets_the_clock_fall_back() {
    let db = replica();
    set_clock_ahead(&db, DAY_MS);
    let ids = ["One", "Two", "Three"].map(|title| add_template(&db, title));
    let old = ids.each_ref().map(|id| pending_stamp(&db, "templates", id));

    restamp(&db);

    let new = ids.each_ref().map(|id| pending_stamp(&db, "templates", id));
    assert!(
        new[0].hlc < new[1].hlc && new[1].hlc < new[2].hlc,
        "the cohorts keep their order"
    );
    assert_eq!(last_hlc(&db), new[2].hlc, "the clock rests on the last stamp issued");
    assert!(
        last_hlc(&db) < old[0].hlc,
        "the clock fell back below stamps only local cohorts held"
    );
}

#[test]
fn a_re_stamped_edit_still_beats_the_remote_stamp_it_replaced() {
    let a = replica();
    let algorithm = add_algorithm(&a, "FSRS");
    let template = add_template(&a, "Basic");
    let deck = add_deck(&a, &algorithm, &template, "Spanish");
    let mut space = FakeSpace::default();
    space.push(&a);
    let b = replica();
    space.pull(&b);

    // B's clock runs 4 minutes ahead, inside the tolerance; A applies its rename.
    set_clock_ahead(&b, 4 * MINUTE_MS);
    retitle(&b, &deck, "From B");
    let remote = pending_stamp(&b, "decks", &deck);
    space.push(&b);
    space.pull(&a);

    // A's clock jumps a day ahead and A renames the deck, replacing B's stamp in the register.
    set_clock_ahead(&a, DAY_MS);
    retitle(&a, &deck, "From A");

    restamp(&a);

    let local = pending_stamp(&a, "decks", &deck);
    assert!(
        local.hlc > remote.hlc,
        "the re-stamp stays above the remote stamp the edit replaced"
    );
    space.push(&a);
    space.pull(&b);
    let title = get_deck(&b, &deck).expect("deck reads").expect("deck exists").title;
    assert_eq!(title, "From A", "the later edit wins on the other device");
}

#[test]
fn a_re_stamped_grade_still_beats_a_reset_applied_before_it() {
    let a = replica();
    let algorithm = add_algorithm(&a, "FSRS");
    let template = add_template(&a, "Basic");
    let deck = add_deck(&a, &algorithm, &template, "Spanish");
    let card = add_card(&a, &deck, &template, "hola");
    let mut space = FakeSpace::default();
    space.push(&a);
    let b = replica();
    space.pull(&b);
    reset(&b, &card);
    let reset_stamp = pending_stamp(&b, "cards", &card);
    space.push(&b);
    space.pull(&a);

    set_clock_ahead(&a, DAY_MS);
    grade(&a, &card);

    restamp(&a);

    assert!(pending_stamp(&a, "cards", &card).hlc > reset_stamp.hlc);
    space.push(&a);
    space.pull(&b);
    let reviews = count(&b, &format!("SELECT COUNT(*) FROM reviews WHERE card_id = '{card}'"));
    assert_eq!(reviews, 1, "the grade's review survives the reset");
    let scheduled = get_card(&b, &card).expect("card reads").expect("card exists");
    assert_eq!(scheduled.scheduled_days, 9, "the grade's scheduling survives with it");
}
