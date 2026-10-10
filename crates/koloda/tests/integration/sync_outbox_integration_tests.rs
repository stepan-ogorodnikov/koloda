use koloda::app::db::Database;
use koloda::domain::decks::{UpdateDeckData, UpdateDeckValues};
use koloda::repo::decks::{get_deck, update_deck};
use koloda::repo::sync::outbox::{push_batch, push_lost, release_held, settle_push, unfix_unconsumed};
use koloda_sync_proto::envelope::{Envelope, Header};
use koloda_sync_proto::hlc::Hlc;
use koloda_sync_proto::registry::Kind;
use koloda_sync_proto::transport::{HeldReason, Outcome, PushOutcome};

use crate::common::fixtures::{add_algorithm, add_deck, add_template};
use crate::common::sync::{count, origin, register, replica, starter};

/// One commit's outbox rows: its seqs and their total envelope bytes.
struct Commit {
    seqs: Vec<u64>,
    bytes: usize,
}

/// An algorithm (create and revision), a template (create), and a deck (create and two pointers): three cohorts.
fn three_commits() -> (Database, Vec<Commit>) {
    let db = replica();
    let algorithm = add_algorithm(&db, "FSRS");
    let template = add_template(&db, "Basic");
    add_deck(&db, &algorithm, &template, "Spanish");

    let commits = commits(&db);
    assert_eq!(
        commits.iter().map(|commit| commit.seqs.len()).collect::<Vec<_>>(),
        vec![2, 1, 3],
        "the fixture's cohorts"
    );
    (db, commits)
}

/// The outbox's cohorts in the order of their lowest seq.
fn commits(db: &Database) -> Vec<Commit> {
    let rows: Vec<(u64, Vec<u8>, usize)> = db
        .with_conn(|conn| {
            let rows = conn
                .prepare("SELECT sender_seq, commit_id, length(envelope) FROM sync_outbox ORDER BY sender_seq")?
                .query_map([], |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)))?
                .collect::<Result<Vec<_>, _>>()?;
            Ok(rows)
        })
        .expect("outbox reads");
    let mut commits: Vec<(Vec<u8>, Commit)> = Vec::new();
    for (seq, commit_id, bytes) in rows {
        match commits.last_mut() {
            Some((last, commit)) if *last == commit_id => {
                commit.seqs.push(seq);
                commit.bytes += bytes;
            }
            _ => commits.push((commit_id, Commit { seqs: vec![seq], bytes })),
        }
    }
    commits.into_iter().map(|(_, commit)| commit).collect()
}

/// The item and byte caps a case pushes with, given the fixture's cohorts.
type Caps = fn(&[Commit]) -> (usize, usize);

/// Rows in the first `count` cohorts.
fn items(commits: &[Commit], count: usize) -> usize {
    commits.iter().take(count).map(|commit| commit.seqs.len()).sum()
}

/// Envelope bytes in the first `count` cohorts.
fn bytes(commits: &[Commit], count: usize) -> usize {
    commits.iter().take(count).map(|commit| commit.bytes).sum()
}

fn in_flight(db: &Database) -> Vec<u64> {
    db.with_conn(|conn| {
        let seqs = conn
            .prepare("SELECT sender_seq FROM sync_outbox WHERE in_flight = 1 ORDER BY sender_seq")?
            .query_map([], |row| row.get(0))?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(seqs)
    })
    .expect("outbox reads")
}

fn cohort_states(db: &Database) -> Vec<String> {
    db.with_conn(|conn| {
        let states = conn
            .prepare(
                r#"
                SELECT c.state FROM sync_cohorts c
                ORDER BY (SELECT MIN(sender_seq) FROM sync_outbox o WHERE o.commit_id = c.commit_id)
                "#,
            )?
            .query_map([], |row| row.get(0))?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(states)
    })
    .expect("cohorts read")
}

#[test]
fn a_batch_takes_whole_cohorts_until_a_cap() {
    let cases: [(&str, Caps, usize); 4] = [
        ("both caps fit every cohort", |_| (100, 1 << 20), 3),
        (
            "the item cap falls inside the third cohort",
            |commits| (items(commits, 2) + 1, 1 << 20),
            2,
        ),
        (
            "the byte cap falls inside the second cohort",
            |commits| (100, bytes(commits, 1) + 1),
            1,
        ),
        ("a first cohort past both caps goes alone", |_| (1, 1), 1),
    ];

    for (name, caps, taken) in cases {
        let (db, commits) = three_commits();
        let (max_items, max_bytes) = caps(&commits);

        let batch = push_batch(&db, max_items, max_bytes).expect("a batch is picked");

        let expected: Vec<u64> = commits
            .iter()
            .take(taken)
            .flat_map(|commit| commit.seqs.clone())
            .collect();
        let sent: Vec<u64> = batch.items.iter().map(|item| item.sender_seq).collect();
        assert_eq!(sent, expected, "{name}: whole cohorts in seq order");
        assert_eq!(in_flight(&db), expected, "{name}: exactly the batch is in flight");
        let states: Vec<&str> = (0..3)
            .map(|index| if index < taken { "uncertain" } else { "local" })
            .collect();
        assert_eq!(cohort_states(&db), states, "{name}: sent cohorts are uncertain");
    }
}

#[test]
fn a_row_left_in_flight_goes_out_first_and_fixes_its_cohort() {
    let (db, commits) = three_commits();
    let first = push_batch(&db, 2, 1 << 20).expect("a batch is picked");

    // No outcome is settled, as when the app stops mid-push.
    let again = push_batch(&db, 2, 1 << 20).expect("a batch is picked");

    let seqs = |batch: &koloda::repo::sync::outbox::Batch| -> Vec<u64> {
        batch.items.iter().map(|item| item.sender_seq).collect()
    };
    let first_cohort: Vec<u64> = commits.iter().take(1).flat_map(|commit| commit.seqs.clone()).collect();
    assert_eq!(seqs(&again), first_cohort, "the unsettled cohort goes out again");
    assert_eq!(
        again.items.iter().map(|item| item.envelope.clone()).collect::<Vec<_>>(),
        first.items.iter().map(|item| item.envelope.clone()).collect::<Vec<_>>(),
        "with the same bytes"
    );
    assert_eq!(
        cohort_states(&db),
        vec!["fixed", "local", "local"],
        "an earlier send may have been consumed, so the cohort keeps its stamp"
    );
    assert_eq!(
        count(&db, "SELECT COUNT(*) FROM sync_outbox"),
        6,
        "nothing leaves the outbox"
    );
}

#[test]
fn cohorts_in_flight_go_first_and_the_rest_follow_by_lowest_seq() {
    let db = replica();
    let algorithm = add_algorithm(&db, "FSRS");
    for title in ["Spanish", "French", "German"] {
        let template = add_template(&db, title);
        add_deck(&db, &algorithm, &template, title);
    }
    let commits = commits(&db);
    assert_eq!(
        commits.iter().map(|commit| commit.seqs.len()).collect::<Vec<_>>(),
        vec![2, 1, 3, 1, 3, 1, 3],
        "the fixture's cohorts"
    );
    // Two decks in flight above rows that are not, as `unfix_unconsumed` leaves the outbox when it returns a lower
    // cohort to `local`.
    for index in [2, 4] {
        for seq in &commits[index].seqs {
            db.with_conn(|conn| {
                conn.execute("UPDATE sync_outbox SET in_flight = 1 WHERE sender_seq = ?1", [seq])?;
                Ok(())
            })
            .expect("the row goes in flight");
        }
    }

    let mut batches = Vec::new();
    while count(&db, "SELECT COUNT(*) FROM sync_outbox") > 0 {
        let batch = push_batch(&db, 6, 1 << 20).expect("a batch is picked");
        batches.push(batch.items.iter().map(|item| item.sender_seq).collect::<Vec<_>>());
        let outcomes: Vec<PushOutcome> = batch
            .items
            .iter()
            .map(|item| PushOutcome {
                sender_seq: item.sender_seq,
                outcome: Outcome::Applied,
                replayed: false,
                missing_attachments: Vec::new(),
            })
            .collect();
        settle_push(&db, &batch, &outcomes, &starter()).expect("the reply settles");
    }

    let seqs = |indexes: &[usize]| -> Vec<u64> {
        let mut seqs: Vec<u64> = indexes.iter().flat_map(|&index| commits[index].seqs.clone()).collect();
        seqs.sort_unstable();
        seqs
    };
    assert_eq!(
        batches,
        vec![seqs(&[2, 4]), seqs(&[0, 1, 3, 5]), seqs(&[6])],
        "in-flight cohorts first, then whole cohorts by their lowest seq until the item cap"
    );
}

/// Sends the whole outbox and loses the reply, which fixes every cohort.
fn lose_every_cohort(db: &Database) {
    let batch = push_batch(db, 100, 1 << 20).expect("a batch is picked");
    push_lost(db, &batch).expect("the loss is recorded");
}

/// The stamps of the fixture's cohorts, in seq order.
fn cohort_hlcs(db: &Database) -> Vec<Hlc> {
    db.with_conn(|conn| {
        let hlcs = conn
            .prepare(
                r#"
                SELECT c.hlc FROM sync_cohorts c
                ORDER BY (SELECT MIN(sender_seq) FROM sync_outbox o WHERE o.commit_id = c.commit_id)
                "#,
            )?
            .query_map([], |row| row.get::<_, i64>(0))?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(hlcs)
    })
    .expect("cohorts read")
    .into_iter()
    .map(|hlc| Hlc::from_raw(u64::try_from(hlc).expect("stamps are positive")))
    .collect()
}

/// How a case leaves the fixture's cohorts, and the record's `last_sender_seq` and the server's limit it unfixes with.
type Unfix = fn(&Database, &[Commit]) -> (u64, Hlc);

#[test]
fn only_a_fixed_cohort_no_push_consumed_returns_to_local_above_the_limit() {
    let cases: [(&str, Unfix, [&str; 3]); 5] = [
        (
            "every row above the record's seq and every stamp above the limit",
            |db, _| {
                lose_every_cohort(db);
                (0, Hlc::from_raw(0))
            },
            ["local", "local", "local"],
        ),
        (
            "a cohort with a row at the record's seq may have been consumed",
            |db, commits| {
                lose_every_cohort(db);
                (commits[0].seqs[0], Hlc::from_raw(0))
            },
            ["fixed", "local", "local"],
        ),
        (
            "a cohort with a consumed member keeps its stamp",
            |db, commits| {
                lose_every_cohort(db);
                let seq = commits[2].seqs[0];
                db.with_conn(|conn| {
                    conn.execute(
                        &format!(
                            "UPDATE sync_cohorts SET has_consumed = 1 \
                             WHERE commit_id = (SELECT commit_id FROM sync_outbox WHERE sender_seq = {seq})"
                        ),
                        [],
                    )?;
                    Ok(())
                })
                .expect("the member is marked consumed");
                (0, Hlc::from_raw(0))
            },
            ["local", "local", "fixed"],
        ),
        (
            "cohorts at or below the limit are not refused",
            |db, _| {
                lose_every_cohort(db);
                (0, cohort_hlcs(db)[1])
            },
            ["fixed", "fixed", "local"],
        ),
        (
            "cohorts sent for the first time are not fixed",
            |db, _| {
                push_batch(db, 100, 1 << 20).expect("a batch is picked");
                (0, Hlc::from_raw(0))
            },
            ["uncertain", "uncertain", "uncertain"],
        ),
    ];

    for (name, arrange, states) in cases {
        let (db, commits) = three_commits();
        let (last_sender_seq, ahead_of) = arrange(&db, &commits);

        let unfixed = unfix_unconsumed(&db, last_sender_seq, ahead_of).expect("cohorts settle");

        assert_eq!(cohort_states(&db), states, "{name}");
        assert_eq!(
            unfixed,
            states.iter().filter(|state| **state == "local").count(),
            "{name}: the count of cohorts returned"
        );
        let in_flight_seqs: Vec<u64> = commits
            .iter()
            .zip(states)
            .filter(|(_, state)| *state != "local")
            .flat_map(|(commit, _)| commit.seqs.clone())
            .collect();
        assert_eq!(
            in_flight(&db),
            in_flight_seqs,
            "{name}: a returned cohort's rows leave flight"
        );
    }
}

/// Pushes the whole outbox and settles every row with the outcome `held` picks for its header.
fn push_and_hold(db: &Database, held: impl Fn(&Header) -> HeldReason) {
    let batch = push_batch(db, 1000, usize::MAX).expect("a batch is picked");
    let outcomes: Vec<PushOutcome> = batch
        .items
        .iter()
        .map(|item| PushOutcome {
            sender_seq: item.sender_seq,
            outcome: Outcome::Held {
                reason: held(&Envelope::decode(&item.envelope).expect("the envelope decodes").header),
            },
            replayed: false,
            missing_attachments: Vec::new(),
        })
        .collect();
    settle_push(db, &batch, &outcomes, &starter()).expect("the reply settles");
}

/// `(sender_seq, envelope)` of each outbox row, in seq order.
fn outbox_rows(db: &Database) -> Vec<(i64, Vec<u8>)> {
    db.with_conn(|conn| {
        let rows = conn
            .prepare("SELECT sender_seq, envelope FROM sync_outbox ORDER BY sender_seq")?
            .query_map([], |row| Ok((row.get(0)?, row.get(1)?)))?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(rows)
    })
    .expect("outbox reads")
}

fn held_envelopes(db: &Database) -> Vec<Vec<u8>> {
    db.with_conn(|conn| {
        let rows = conn
            .prepare("SELECT envelope FROM sync_held ORDER BY sender_seq")?
            .query_map([], |row| row.get(0))?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(rows)
    })
    .expect("held rows read")
}

fn deck_id(db: &Database) -> String {
    db.with_conn(|conn| Ok(conn.query_row("SELECT id FROM decks", [], |row| row.get(0))?))
        .expect("the deck reads")
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
fn released_writes_keep_their_bytes_and_stamps_and_go_out_before_pending_ones() {
    let (db, _) = three_commits();
    let deck = deck_id(&db);
    push_and_hold(&db, |header| {
        if header.kind == Kind::Decks {
            HeldReason::Dependency
        } else {
            HeldReason::Quota
        }
    });
    let held = held_envelopes(&db);
    retitle(&db, &deck, "Renamed while held");
    let pending = outbox_rows(&db);
    assert_eq!(pending.len(), 1);

    let released = release_held(&db).expect("held writes are released");

    assert_eq!(released, 6);
    assert_eq!(count(&db, "SELECT COUNT(*) FROM sync_held"), 0);
    let rows = outbox_rows(&db);
    let envelopes: Vec<Vec<u8>> = rows.iter().map(|(_, envelope)| envelope.clone()).collect();
    assert_eq!(
        envelopes[..6],
        held[..],
        "the held bytes go out unchanged, in their order"
    );
    assert_eq!(envelopes[6], pending[0].1, "the pending rename goes out after them");
    assert!(
        rows.windows(2).all(|pair| pair[0].0 < pair[1].0) && rows[0].0 > pending[0].0,
        "every row takes a new, higher seq"
    );
    let title = register(&db, "decks", &deck, "title").expect("the rename's register");
    assert_eq!(title.sender_seq, rows[6].0, "a moved pending row's register follows it");
    let create = origin(&db, "decks", &deck, "create").expect("the deck's origin");
    let create_seq = rows
        .iter()
        .find(|(_, envelope)| {
            let header = Envelope::decode(envelope).expect("the envelope decodes").header;
            header.kind == Kind::Decks && header.group.map(|group| group.as_wire()) == Some("create")
        })
        .expect("the deck create is released")
        .0;
    assert_eq!(
        create.sender_seq, create_seq,
        "a released row's origin names its new seq"
    );
    assert_eq!(
        cohort_states(&db),
        vec!["fixed", "fixed", "fixed", "local"],
        "released cohorts keep their stamps; the pending one may still be re-stamped"
    );
}

#[test]
fn a_held_update_overwritten_since_is_dropped_and_schema_holds_stay() {
    let (db, _) = three_commits();
    let deck = deck_id(&db);
    push_and_hold(&db, |_| HeldReason::Quota);
    retitle(&db, &deck, "First");
    push_and_hold(&db, |_| HeldReason::Quota);
    retitle(&db, &deck, "Second");
    push_and_hold(&db, |_| HeldReason::Schema);

    let released = release_held(&db).expect("held writes are released");

    assert_eq!(
        released, 6,
        "the first rename was overwritten, so only the commits' rows go back"
    );
    assert_eq!(
        count(&db, "SELECT COUNT(*) FROM sync_held WHERE reason = 'schema'"),
        1,
        "a schema hold waits for an app that writes the new schema"
    );
    assert_eq!(count(&db, "SELECT COUNT(*) FROM sync_held"), 1);
}

#[test]
fn nothing_is_released_while_no_write_is_held_for_quota() {
    let (db, _) = three_commits();
    push_and_hold(&db, |_| HeldReason::Dependency);

    let released = release_held(&db).expect("the release runs");

    assert_eq!(released, 0);
    assert_eq!(count(&db, "SELECT COUNT(*) FROM sync_held"), 6);
    assert_eq!(count(&db, "SELECT COUNT(*) FROM sync_outbox"), 0);
}
