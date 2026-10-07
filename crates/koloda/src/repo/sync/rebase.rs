//! The re-bootstrap barrier: a generation that snapshot and catch-up apply mark creates with, and the absence
//! cleanup that ends it (`crates/koloda-sync-proto/PROTOCOL.md` §Re-bootstrap).
//!
//! A join bootstrap is union and never deletes; only a re-bootstrap removes what the server no longer holds.

use koloda_sync_proto::registry::Kind;
use rusqlite::{params, Connection};

use super::apply::remove_entity;
use super::repair::Starter;
use super::Changed;
use crate::app::db::Database;
use crate::app::error::{error_codes, throw_known_error, AppError};

// WHY: dependents before referents, so a referent's pointer repair never touches a deck that is about to go, and a
// deck takes its pending cards with it before the card scan reaches them.
const ABSENT_KINDS: [Kind; 4] = [Kind::Cards, Kind::Decks, Kind::Templates, Kind::Algorithms];

const SCAN_BATCH: usize = 500;

/// Opens the barrier under a new generation. Calling it while the barrier is open changes nothing, so a relaunch or
/// a lapsed lease resumes the same re-bootstrap.
pub fn begin_rebase(db: &Database) -> Result<(), AppError> {
    throw_known_error(error_codes::DB_UPDATE, || db.with_conn(open_barrier))
}

pub(super) fn open_barrier(conn: &Connection) -> Result<(), AppError> {
    conn.execute(
        r#"
        UPDATE sync_state SET rebase_generation = rebase_generation + 1, is_rebasing = 1
        WHERE id = 1 AND is_rebasing = 0
        "#,
        [],
    )?;
    Ok(())
}

/// Ends a re-bootstrap once its snapshot and catch-up are applied: deletes what the server no longer holds, sets the
/// `cold` cursor, and closes the barrier. Returns the kinds whose product rows changed.
pub fn finish_rebase(db: &Database, cursor_cold: u64, starter: &Starter) -> Result<Vec<Kind>, AppError> {
    throw_known_error(error_codes::DB_UPDATE, || {
        db.with_transaction(|tx| {
            let mut changed = Changed::default();
            for kind in ABSENT_KINDS {
                let mut after = String::new();
                while let Some(batch) = absent_batch(tx, kind, &after)? {
                    for id in &batch {
                        remove_entity(tx, kind, id, None, starter, &mut changed)?;
                    }
                    after = batch.last().cloned().unwrap_or_default();
                }
            }
            tx.execute(
                "UPDATE sync_state SET cursor_cold = ?1, is_rebasing = 0 WHERE id = 1",
                params![cursor_cold],
            )?;
            Ok(changed.0)
        })
    })
}

// INVARIANT: absent means the server holds no create for it. A create still waiting in the outbox (in flight or not)
// or held was never taken, so its entity stays whatever its age, and so does one a running heal has yet to re-push.
// Removal records no tombstone and no fence: the server's reason for lacking the entity is not known to be a delete.
fn absent_batch(conn: &Connection, kind: Kind, after: &str) -> Result<Option<Vec<String>>, AppError> {
    let ids: Vec<String> = conn
        .prepare(
            r#"
            SELECT o.id FROM sync_origins o, sync_state s
            WHERE s.id = 1 AND o.kind = ?1 AND o.group_name = 'create' AND o.id > ?2
              AND o.seen_generation < s.rebase_generation
              AND NOT EXISTS (
                  SELECT 1 FROM sync_outbox x WHERE x.kind = o.kind AND x.id = o.id AND x.group_name = 'create'
              )
              AND NOT EXISTS (
                  SELECT 1 FROM sync_held h WHERE h.kind = o.kind AND h.id = o.id AND h.group_name = 'create'
              )
              AND NOT (
                  s.heal_step IS NOT NULL
                  AND o.sender_seq > COALESCE((SELECT c.last_seq FROM sync_heal_cutoffs c WHERE c.sender = o.sender), 0)
              )
            ORDER BY o.id
            LIMIT ?3
            "#,
        )?
        .query_map(params![kind.as_wire(), after, SCAN_BATCH], |row| row.get(0))?
        .collect::<Result<_, _>>()?;
    Ok(if ids.is_empty() { None } else { Some(ids) })
}
