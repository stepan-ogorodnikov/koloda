//! Every join of `versions` to `heads`, and every read of one lane's heads, searches an index of a migrated space.
//!
//! WHY: these run on every pull page or under the space writer lock, where a scan of `heads` costs seconds on a large
//! space and no test of a few hundred rows notices. The server never runs `ANALYZE`, so the plan does not depend on
//! the rows and an empty space shows it.

use rusqlite::Connection;

use crate::{bootstrap, db, drop_envelope, log, pull};

/// The steps of the statement's plan that read `heads`, as SQLite describes them.
fn heads_steps(conn: &Connection, statement: &str) -> Vec<String> {
    let mut plan = conn.prepare(&format!("EXPLAIN QUERY PLAN {statement}")).unwrap();
    // WHY: `raw_query` leaves the parameters unbound; the plan does not depend on their values.
    let mut rows = plan.raw_query();
    let mut steps = Vec::new();
    while let Some(row) = rows.next().unwrap() {
        let detail: String = row.get(3).unwrap();
        if matches!(detail.split_whitespace().nth(1), Some("h" | "heads")) {
            steps.push(detail);
        }
    }
    steps
}

#[test]
fn heads_reads_search_an_index() {
    let dir = tempfile::tempdir().unwrap();
    let conn = db::open_space(&dir.path().join("space.db")).unwrap();
    let statements = [
        ("pull page", pull::PAGE.to_string()),
        ("lease end", log::LEASE_ONLY_VERSIONS.to_string()),
        ("reviews of a cascaded card", log::LIVE_REVIEWS.to_string()),
        ("cascade review count", log::LIVE_REVIEW_COUNT.to_string()),
        ("live cards of a deck", log::LIVE_DECK_CARDS.to_string()),
        ("live cards of a template", log::LIVE_TEMPLATE_CARDS.to_string()),
        ("highest collected tombstone", log::HIGHEST_COLLECTED.to_string()),
        ("collected tombstones", log::COLLECTED.to_string()),
        ("collected heads", log::COLLECT_HEADS.to_string()),
        ("hot lease items", bootstrap::lease_items(bootstrap::HOT_ORDER)),
        ("cold lease items", bootstrap::lease_items(bootstrap::COLD_ORDER)),
        ("dropped head", drop_envelope::DROP_HEAD.to_string()),
        ("card create to relink", drop_envelope::CARD_CREATE.to_string()),
    ];
    for (name, statement) in statements {
        let steps = heads_steps(&conn, &statement);
        // WHY: a plan that names no `heads` step means the description changed shape, not that the read is indexed.
        assert!(!steps.is_empty(), "{name}: no plan step reads heads");
        let scans: Vec<&String> = steps
            .iter()
            .filter(|step| !step.starts_with("SEARCH") || !step.contains(" INDEX ") || step.contains("AUTOMATIC"))
            .collect();
        assert!(scans.is_empty(), "{name} scans heads: {scans:?}");
    }
}
