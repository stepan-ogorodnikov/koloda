//! Switching a file to a new device id by the old sender's receipts (`crates/koloda-sync-proto/PROTOCOL.md` §Behind
//! its own record).

use koloda::app::db::Database;
use koloda::domain::cards::ResetCardProgressData;
use koloda::domain::decks::{UpdateDeckData, UpdateDeckValues};
use koloda::repo::cards::reset_card_progress;
use koloda::repo::decks::{get_deck, update_deck};
use koloda::repo::sync::outbox::{push_batch, push_lost, settle_push};
use koloda::repo::sync::switch::switch_device;
use koloda::repo::sync::{store_enrolling, stored_enrolling, Enrolling};
use koloda_sync_proto::envelope::digest;
use koloda_sync_proto::hlc::{DeviceId, Stamp};
use koloda_sync_proto::transport::{HeldReason, Outcome, PushOutcome, Receipt};
use uuid::Uuid;

use crate::common::fixtures::{add_algorithm, add_card, add_deck, add_template};
use crate::common::sync::{count, device, origin, outbox, register, replica, starter, FakeSpace, OutboxEntry};

/// A receipt for the pending row at `seq`: with its own digest when `is_same`, else with another envelope's.
fn receipt(db: &Database, seq: i64, is_same: bool, outcome: Outcome) -> Receipt {
    let bytes: Vec<u8> = db
        .with_conn(|conn| {
            Ok(conn.query_row(
                "SELECT envelope FROM sync_outbox WHERE sender_seq = ?1",
                rusqlite::params![seq],
                |row| row.get(0),
            )?)
        })
        .expect("the row exists");
    let digest = if is_same {
        digest(&bytes).0
    } else {
        digest(b"another copy's envelope").0
    };
    Receipt {
        sender_seq: u64::try_from(seq).expect("seq fits"),
        digest,
        outcome,
    }
}

fn switch(db: &Database, receipts: &[Receipt]) -> Uuid {
    let new_device = Uuid::now_v7();
    switch_device(db, new_device, receipts, &starter(), now_ms(), false, None).expect("the file switches");
    new_device
}

fn now_ms() -> u64 {
    u64::try_from(
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .expect("clock is past the epoch")
            .as_millis(),
    )
    .expect("now fits")
}

fn rows_for<'a>(rows: &'a [OutboxEntry], id: &str) -> Vec<&'a OutboxEntry> {
    rows.iter().filter(|row| row.envelope.header.id == id).collect()
}

fn on_device(stamp: Stamp, device: Uuid) -> bool {
    stamp.device == DeviceId(*device.as_bytes())
}

fn cohort_states(db: &Database) -> Vec<String> {
    db.with_conn(|conn| {
        let states = conn
            .prepare("SELECT state FROM sync_cohorts ORDER BY state")?
            .query_map([], |row| row.get(0))?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(states)
    })
    .expect("cohorts read")
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

#[test]
fn only_a_receipt_with_the_rows_digest_settles_it() {
    let db = replica();
    let old = device(&db);
    let accepted = add_template(&db, "Accepted");
    let other = add_template(&db, "Other copy");
    let unsent = add_template(&db, "Unsent");
    push_batch(&db, 1000, usize::MAX).expect("batch picks");

    let new_device = switch(
        &db,
        &[
            receipt(&db, 1, true, Outcome::Applied),
            receipt(&db, 2, false, Outcome::Applied),
        ],
    );

    let rows = outbox(&db);
    assert!(rows_for(&rows, &accepted).is_empty(), "the accepted write is settled");
    assert_eq!(
        rows.iter().map(|row| row.sender_seq).collect::<Vec<_>>(),
        vec![1, 2],
        "the rest renumber from 1"
    );
    for id in [&other, &unsent] {
        let row = rows_for(&rows, id)[0];
        assert!(!row.in_flight);
        assert!(
            on_device(row.envelope.header.stamp, new_device),
            "a write never accepted takes the new id"
        );
    }
    let settled = origin(&db, "templates", &accepted, "create").expect("accepted origin");
    assert_eq!(
        (settled.sender, settled.sender_seq),
        (old, 1),
        "an accepted write keeps the old sender"
    );
    assert_eq!(cohort_states(&db), vec!["local", "local"]);
    assert_eq!(device(&db), new_device);
    assert_eq!(count(&db, "SELECT next_sender_seq FROM sync_state"), 3);
}

#[test]
fn a_cohort_with_one_accepted_member_keeps_its_stamp() {
    let db = replica();
    let old = device(&db);
    let algorithm = add_algorithm(&db, "FSRS");
    let template = add_template(&db, "Basic");
    FakeSpace::default().push(&db);
    let deck = add_deck(&db, &algorithm, &template, "Spanish");
    let before = outbox(&db);
    assert_eq!(before.len(), 3, "a deck's create and its two pointers share a commit");
    let stamp = before[0].envelope.header.stamp;

    let new_device = switch(&db, &[receipt(&db, before[0].sender_seq, true, Outcome::Applied)]);

    let rows = outbox(&db);
    assert_eq!(rows.iter().map(|row| row.sender_seq).collect::<Vec<_>>(), vec![1, 2]);
    for row in rows_for(&rows, &deck) {
        assert_eq!(
            row.envelope.header.stamp, stamp,
            "the rest of the cohort keeps its stamp"
        );
    }
    assert_eq!(cohort_states(&db), vec!["fixed"]);
    let pointer = register(&db, "decks", &deck, "algorithm").expect("pointer register");
    assert_eq!(pointer.sender, new_device, "renumbered under the new sender");
    assert_ne!(pointer.sender, old);
}

#[test]
fn a_copy_whose_original_pushed_only_the_reset_keeps_the_cohorts_stamp() {
    let db = replica();
    let algorithm = add_algorithm(&db, "FSRS");
    let template = add_template(&db, "Basic");
    let deck = add_deck(&db, &algorithm, &template, "Spanish");
    let card = add_card(&db, &deck, &template, "hola");
    FakeSpace::default().push(&db);
    reset_card_progress(&db, ResetCardProgressData { id: card.clone() }).expect("card resets");
    let before = outbox(&db);
    let reset = before
        .iter()
        .find(|row| {
            row.envelope
                .header
                .group
                .is_some_and(|group| group.as_wire() == "reset")
        })
        .expect("the reset is pending");
    let stamp = reset.envelope.header.stamp;

    switch(&db, &[receipt(&db, reset.sender_seq, true, Outcome::Applied)]);

    let rows = outbox(&db);
    assert_eq!(rows.len(), 1, "only the blank scheduling is left");
    assert_eq!(
        rows[0].envelope.header.stamp, stamp,
        "the blank scheduling keeps the reset's stamp and device"
    );
}

#[test]
fn a_member_consumed_earlier_keeps_its_cohort_fixed_and_a_lost_reply_does_not() {
    let db = replica();
    let algorithm = add_algorithm(&db, "FSRS");
    let template = add_template(&db, "Basic");
    FakeSpace::default().push(&db);
    // A reply that consumed the deck's create and stopped at `seq_reused`.
    let deck = add_deck(&db, &algorithm, &template, "Spanish");
    let batch = push_batch(&db, 1000, usize::MAX).expect("batch picks");
    let outcomes = vec![
        PushOutcome {
            sender_seq: batch.items[0].sender_seq,
            outcome: Outcome::Applied,
            replayed: false,
            missing_attachments: Vec::new(),
        },
        PushOutcome {
            sender_seq: batch.items[1].sender_seq,
            outcome: Outcome::SeqReused,
            replayed: false,
            missing_attachments: Vec::new(),
        },
    ];
    settle_push(&db, &batch, &outcomes, &starter()).expect("reply settles");
    let consumed_stamp = rows_for(&outbox(&db), &deck)[0].envelope.header.stamp;
    // A rename whose push lost its reply.
    retitle(&db, &deck, "Renamed");
    let batch = push_batch(&db, 1000, usize::MAX).expect("batch picks");
    push_lost(&db, &batch).expect("reply is lost");

    let new_device = switch(&db, &[]);

    let rows = outbox(&db);
    let groups: Vec<(String, Stamp)> = rows
        .iter()
        .map(|row| {
            let group = row.envelope.header.group.map(|group| group.as_wire().to_string());
            (group.unwrap_or_default(), row.envelope.header.stamp)
        })
        .collect();
    for (group, stamp) in &groups {
        if group == "title" {
            assert!(
                on_device(*stamp, new_device),
                "a cohort a lost reply left fixed returns to local"
            );
        } else {
            assert_eq!(
                *stamp, consumed_stamp,
                "a cohort with a member consumed earlier stays fixed"
            );
        }
    }
    assert_eq!(cohort_states(&db), vec!["fixed", "local"]);
}

#[test]
fn registers_and_origins_follow_the_new_numbers_and_held_rows_stay() {
    let db = replica();
    let old = device(&db);
    let held = add_template(&db, "Held");
    let batch = push_batch(&db, 1000, usize::MAX).expect("batch picks");
    let outcomes: Vec<PushOutcome> = batch
        .items
        .iter()
        .map(|item| PushOutcome {
            sender_seq: item.sender_seq,
            outcome: Outcome::Held {
                reason: HeldReason::Schema,
            },
            replayed: false,
            missing_attachments: Vec::new(),
        })
        .collect();
    settle_push(&db, &batch, &outcomes, &starter()).expect("reply settles");
    let algorithm = add_algorithm(&db, "FSRS");
    let template = add_template(&db, "Basic");

    let new_device = switch(&db, &[]);

    for row in outbox(&db) {
        let header = &row.envelope.header;
        let group = header.group.map_or("", |group| group.as_wire());
        let written = match group {
            "create" | "row" => {
                let origin = origin(&db, header.kind.as_wire(), &header.id, group).expect("origin");
                (origin.sender, origin.sender_seq)
            }
            _ => {
                let register = register(&db, header.kind.as_wire(), &header.id, group).expect("register");
                (register.sender, register.sender_seq)
            }
        };
        assert_eq!(written, (new_device, row.sender_seq), "{:?} {group}", header.kind);
    }
    assert!(!rows_for(&outbox(&db), &algorithm).is_empty() && !rows_for(&outbox(&db), &template).is_empty());
    assert_eq!(
        count(&db, "SELECT sender_seq FROM sync_held"),
        1,
        "a held row keeps its consumed seq"
    );
    let held_origin = origin(&db, "templates", &held, "create").expect("held origin");
    assert_eq!((held_origin.sender, held_origin.sender_seq), (old, 1));
}

#[test]
fn a_fenced_receipt_deletes_the_entity_as_a_push_outcome_does() {
    let db = replica();
    let algorithm = add_algorithm(&db, "FSRS");
    let template = add_template(&db, "Basic");
    let deck = add_deck(&db, &algorithm, &template, "Spanish");
    FakeSpace::default().push(&db);
    retitle(&db, &deck, "Renamed");
    let seq = outbox(&db)[0].sender_seq;

    switch(&db, &[receipt(&db, seq, true, Outcome::Fenced)]);

    assert!(
        get_deck(&db, &deck).expect("deck reads").is_none(),
        "the fenced deck is deleted"
    );
    assert_eq!(
        count(
            &db,
            &format!("SELECT COUNT(*) FROM sync_tombstones WHERE id = '{deck}'")
        ),
        1,
        "and fenced"
    );
}

#[test]
fn a_re_attach_clears_the_pending_claim_and_a_fork_keeps_it() {
    let claim = Enrolling::Claim {
        nonce: [1; 16],
        code_hash: [2; 32],
        space_id: Uuid::now_v7(),
        server_url: "https://sync.test".to_string(),
    };
    for (name, server_url, expected) in [
        ("a fork", None, Some(claim.clone())),
        ("a re-attach", Some("https://other.test"), None),
    ] {
        let db = replica();
        store_enrolling(&db, &claim).expect("the claim stores");

        switch_device(
            &db,
            Uuid::now_v7(),
            &[],
            &starter(),
            now_ms(),
            server_url.is_none(),
            server_url,
        )
        .expect("the file switches");

        assert_eq!(stored_enrolling(&db).expect("reads"), expected, "{name}");
    }
}
