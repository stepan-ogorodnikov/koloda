//! The statements that renumber this device's pending rows, or find a cohort's rows, search an index.
//!
//! WHY: a fork, a heal, or a held release renumbers pending rows one by one in one transaction, and a save that
//! replaces a pending row looks up its cohort. A scan per row costs minutes on a large file, and no test of a few
//! hundred rows notices. Nothing runs `ANALYZE`, so the plan does not depend on the rows and an empty file shows it.

use rusqlite::Connection;

use super::{heal, outbox, EMPTY_COHORT, RENUMBER};
use crate::app::db::Database;

/// The steps of the statement's plan that read one of `tables`, under the name SQLite gives it there.
fn steps(conn: &Connection, statement: &str, tables: &[&str]) -> Vec<String> {
    let mut plan = conn.prepare(&format!("EXPLAIN QUERY PLAN {statement}")).unwrap();
    // WHY: `raw_query` leaves the parameters unbound; the plan does not depend on their values.
    let mut rows = plan.raw_query();
    let mut steps = Vec::new();
    while let Some(row) = rows.next().unwrap() {
        let detail: String = row.get(3).unwrap();
        if detail
            .split_whitespace()
            .nth(1)
            .is_some_and(|table| tables.contains(&table))
        {
            steps.push(detail);
        }
    }
    steps
}

#[test]
fn renumbering_and_cohort_reads_search_an_index() {
    let db = Database::in_memory().unwrap();
    let mut statements: Vec<(&str, &[&str])> = RENUMBER
        .into_iter()
        .zip([&["sync_stamps"][..], &["sync_origins"][..], &["sync_tombstones"][..]])
        .collect();
    statements.extend([
        (EMPTY_COHORT, &["sync_outbox"][..]),
        (outbox::REFUSED_ROWS, &["sync_outbox"][..]),
        // WHY: `o` is the outbox under the alias the statement gives it.
        (outbox::UNCONSUMED, &["o"][..]),
        (heal::IS_LAST_COHORT, &["sync_outbox"][..]),
        (heal::COHORT_ROWS, &["sync_outbox"][..]),
    ]);
    db.with_conn(|conn| {
        for (statement, tables) in statements {
            let steps = steps(conn, statement, tables);
            // WHY: a plan with no step on the table means the description changed shape, not that the read is indexed.
            assert!(!steps.is_empty(), "no plan step reads {tables:?} in {statement}");
            let scans: Vec<&String> = steps
                .iter()
                .filter(|step| !step.starts_with("SEARCH") || !step.contains(" USING ") || step.contains("AUTOMATIC"))
                .collect();
            assert!(scans.is_empty(), "{statement} scans: {scans:?}");
        }
        Ok(())
    })
    .unwrap();
}
