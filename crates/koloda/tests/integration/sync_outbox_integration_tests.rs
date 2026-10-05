use koloda::app::db::Database;
use koloda::repo::sync::outbox::push_batch;

use crate::common::fixtures::{add_algorithm, add_deck, add_template};
use crate::common::sync::{count, replica};

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
    let commits: Vec<Commit> = commits.into_iter().map(|(_, commit)| commit).collect();
    assert_eq!(
        commits.iter().map(|commit| commit.seqs.len()).collect::<Vec<_>>(),
        vec![2, 1, 3],
        "the fixture's cohorts"
    );
    (db, commits)
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
