//! Repair of pointers whose referent died (`crates/koloda-sync-proto/PROTOCOL.md` §Deletes, Referents are not
//! parents).
//!
//! Repairs publish like local writes: they go through `Capture` in the transaction that found the dead pointer.

use koloda_sync_proto::payload::{DeckAlgorithm, DeckTemplate, DefaultAlgorithm, DefaultTemplate, Payload};
use koloda_sync_proto::registry::Kind;
use rusqlite::{params, Connection, OptionalExtension};

use super::apply::{is_present, patch_learning, table};
use super::capture::Capture;
use super::{protocol_error, Changed};
use crate::app::db::Database;
use crate::app::error::{error_codes, throw_known_error, AppError};
use crate::app::utility::get_current_timestamp;
use crate::domain::algorithms::InsertAlgorithmData;
use crate::domain::templates::InsertTemplateData;
use crate::repo::algorithms::insert_algorithm;
use crate::repo::settings::learning_defaults;
use crate::repo::templates::insert_template;

const LEARNING_ID: &str = "learning";

/// The rows a repair creates when a kind has no live row left: the host's first-run starter content.
pub struct Starter {
    pub algorithm: InsertAlgorithmData,
    pub template: InsertTemplateData,
}

/// Repairs learning defaults that name no live row, and returns the kinds it changed.
///
/// Call it after catch-up only. Before that, a missing referent may still be on its way.
pub fn repair_dangling_defaults(db: &Database, starter: &Starter) -> Result<Vec<Kind>, AppError> {
    throw_known_error(error_codes::DB_UPDATE, || {
        db.with_transaction(|tx| {
            let mut changed = Changed::default();
            let Some(defaults) = learning_defaults(tx)? else {
                return Ok(changed.0);
            };

            for (kind, id) in [
                (Kind::Algorithms, defaults.algorithm),
                (Kind::Templates, defaults.template),
            ] {
                if is_present(tx, kind, &id)? {
                    continue;
                }
                let successor = tombstone_successor(tx, kind, &id)?;
                let target = repair_target(tx, kind, successor.as_deref(), None, starter, &mut changed)?;
                let mut capture = Capture::begin(tx)?;
                write_pointer(
                    tx,
                    &mut capture,
                    Kind::SettingsLearning,
                    LEARNING_ID,
                    kind,
                    &target,
                    &mut changed,
                )?;
            }

            Ok(changed.0)
        })
    })
}

/// Repoints every deck and learning default that names `dead_id` before the referent row is deleted.
pub(super) fn sweep_pointers(
    conn: &Connection,
    kind: Kind,
    dead_id: &str,
    successor: Option<&str>,
    starter: &Starter,
    changed: &mut Changed,
) -> Result<(), AppError> {
    let column = pointer_column(kind)?;
    let decks: Vec<String> = conn
        .prepare(&format!("SELECT id FROM decks WHERE {column} = ?1"))?
        .query_map(params![dead_id], |row| row.get(0))?
        .collect::<Result<_, _>>()?;
    let is_default_dead = learning_defaults(conn)?.is_some_and(|defaults| match kind {
        Kind::Algorithms => defaults.algorithm == dead_id,
        _ => defaults.template == dead_id,
    });
    if decks.is_empty() && !is_default_dead {
        return Ok(());
    }

    let target = repair_target(conn, kind, successor, Some(dead_id), starter, changed)?;
    let mut capture = Capture::begin(conn)?;
    for deck in decks {
        write_pointer(conn, &mut capture, Kind::Decks, &deck, kind, &target, changed)?;
    }
    if is_default_dead {
        write_pointer(
            conn,
            &mut capture,
            Kind::SettingsLearning,
            LEARNING_ID,
            kind,
            &target,
            changed,
        )?;
    }
    Ok(())
}

/// Repoints one deck or learning default whose incoming pointer named a dead referent.
pub(super) fn repoint(
    conn: &Connection,
    holder: Kind,
    holder_id: &str,
    kind: Kind,
    successor: Option<&str>,
    starter: &Starter,
    changed: &mut Changed,
) -> Result<(), AppError> {
    let target = repair_target(conn, kind, successor, None, starter, changed)?;
    let mut capture = Capture::begin(conn)?;
    write_pointer(conn, &mut capture, holder, holder_id, kind, &target, changed)
}

/// The kind's repair target: the live `successor`, else the live row with the lowest id, else a new default row.
///
/// The lowest id is a fixed pick, not an order: devices that hold the same live rows pick the same target.
pub(super) fn repair_target(
    conn: &Connection,
    kind: Kind,
    successor: Option<&str>,
    dying: Option<&str>,
    starter: &Starter,
    changed: &mut Changed,
) -> Result<String, AppError> {
    if let Some(successor) = successor.filter(|successor| Some(*successor) != dying) {
        if is_present(conn, kind, successor)? {
            return Ok(successor.to_string());
        }
    }

    let (table, _) = table(kind);
    let lowest: Option<String> = conn
        .query_row(
            &format!("SELECT id FROM {table} WHERE id IS NOT ?1 ORDER BY id LIMIT 1"),
            params![dying],
            |row| row.get(0),
        )
        .optional()?;
    if let Some(lowest) = lowest {
        return Ok(lowest);
    }

    // WHY: product rules keep a live algorithm and template on each device, but two devices that each delete one
    // of the last two rows still kill both. Every device that meets the empty kind creates its own default.
    let now = get_current_timestamp()?;
    let id = match kind {
        Kind::Algorithms => {
            changed.mark(Kind::AlgorithmRevisions);
            insert_algorithm(conn, &starter.algorithm, now, None)?
        }
        Kind::Templates => insert_template(conn, &starter.template, now, None)?,
        _ => return Err(protocol_error("only algorithms and templates are repair targets")),
    };
    changed.mark(kind);
    Ok(id)
}

pub(super) fn tombstone_successor(conn: &Connection, kind: Kind, id: &str) -> Result<Option<String>, AppError> {
    Ok(conn
        .query_row(
            "SELECT successor FROM sync_tombstones WHERE kind = ?1 AND id = ?2",
            params![kind.as_wire(), id],
            |row| row.get(0),
        )
        .optional()?
        .flatten())
}

// INVARIANT: a repair writes only the dead pointer's group, never the sibling pointer, and keeps the deck's
// product timestamp: repairing a pointer is not an edit (PROTOCOL.md, Referents are not parents).
fn write_pointer(
    conn: &Connection,
    capture: &mut Capture<'_>,
    holder: Kind,
    holder_id: &str,
    kind: Kind,
    target: &str,
    changed: &mut Changed,
) -> Result<(), AppError> {
    let target = target.to_string();
    match holder {
        Kind::Decks => {
            let column = pointer_column(kind)?;
            conn.execute(
                &format!("UPDATE decks SET {column} = ?1 WHERE id = ?2"),
                params![target, holder_id],
            )?;
            let updated_at: Option<i64> = conn.query_row(
                "SELECT updated_at FROM decks WHERE id = ?1",
                params![holder_id],
                |row| row.get(0),
            )?;
            let payload = match kind {
                Kind::Algorithms => Payload::DeckAlgorithm(DeckAlgorithm {
                    algorithm_id: target,
                    updated_at,
                }),
                _ => Payload::DeckTemplate(DeckTemplate {
                    template_id: target,
                    updated_at,
                }),
            };
            capture.write(holder_id, None, &payload)?;
        }
        _ => {
            let payload = match kind {
                Kind::Algorithms => Payload::LearningDefaultAlgorithm(DefaultAlgorithm { algorithm_id: target }),
                _ => Payload::LearningDefaultTemplate(DefaultTemplate { template_id: target }),
            };
            patch_learning(conn, holder_id, &payload)?;
            capture.write(holder_id, None, &payload)?;
        }
    }

    changed.mark(holder);
    Ok(())
}

fn pointer_column(kind: Kind) -> Result<&'static str, AppError> {
    match kind {
        Kind::Algorithms => Ok("algorithm_id"),
        Kind::Templates => Ok("template_id"),
        _ => Err(protocol_error("only algorithms and templates are referents")),
    }
}
