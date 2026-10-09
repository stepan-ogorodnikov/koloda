//! The re-bootstrap barrier, the mark generation each bootstrap lease raises, and the absence cleanup that ends a
//! join bootstrap or a re-bootstrap (`crates/koloda-sync-proto/PROTOCOL.md` §Bootstrap, §Re-bootstrap).

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

/// Raises the mark generation for the lease whose pages are about to apply.
///
/// INVARIANT: this does not open or close the re-bootstrap barrier. A lapsed lease resumes the same barrier, and
/// only the lease the bootstrap finishes on keeps its marks.
pub fn begin_lease(db: &Database) -> Result<(), AppError> {
    throw_known_error(error_codes::DB_UPDATE, || {
        db.with_conn(|conn| {
            conn.execute(
                "UPDATE sync_state SET rebase_generation = rebase_generation + 1 WHERE id = 1",
                [],
            )?;
            Ok(())
        })
    })
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
            let changed = delete_absent(tx, starter)?;
            tx.execute(
                "UPDATE sync_state SET cursor_cold = ?1, is_rebasing = 0 WHERE id = 1",
                params![cursor_cold],
            )?;
            Ok(changed)
        })
    })
}

/// Deletes creates the finishing lease did not mark, and returns the kinds whose product rows changed.
///
/// INVARIANT: absent means this bootstrap's finishing lease delivered no create for it. A create still waiting in
/// the outbox (in flight or not) or held was never taken, so its entity stays, and so does one a running heal has
/// yet to re-push. A row with no create origin was never delivered by a lease and stays. Removal records no
/// tombstone and no fence: the server's reason for lacking the entity is not known to be a delete.
pub(super) fn delete_absent(conn: &Connection, starter: &Starter) -> Result<Vec<Kind>, AppError> {
    let mut changed = Changed::default();
    for kind in ABSENT_KINDS {
        let mut after = String::new();
        while let Some(batch) = absent_batch(conn, kind, &after)? {
            for id in &batch {
                remove_entity(conn, kind, id, None, starter, &mut changed)?;
            }
            after = batch.last().cloned().unwrap_or_default();
        }
    }
    Ok(changed.0)
}

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
