mod common;
use common::test_db;
use koloda_core::app::error::{error_codes, throw_known_error, AppError};

#[test]
fn in_memory_database_initializes_schema_and_foreign_keys() {
    let db = test_db();

    db.with_conn(|conn| {
        let foreign_keys_enabled: i64 = conn.query_row("PRAGMA foreign_keys", [], |row| row.get(0))?;
        assert_eq!(foreign_keys_enabled, 1, "foreign keys pragma should be enabled");

        let cards_exists: i64 = conn.query_row(
            "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'cards'",
            [],
            |row| row.get(0),
        )?;
        let reviews_exists: i64 = conn.query_row(
            "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'reviews'",
            [],
            |row| row.get(0),
        )?;
        let settings_exists: i64 = conn.query_row(
            "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'settings'",
            [],
            |row| row.get(0),
        )?;
        let migrations_exists: i64 = conn.query_row(
            "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = '_migrations'",
            [],
            |row| row.get(0),
        )?;

        assert_eq!(cards_exists, 1);
        assert_eq!(reviews_exists, 1);
        assert_eq!(settings_exists, 1);
        assert_eq!(migrations_exists, 1);
        Ok(())
    })
    .expect("schema checks should pass");
}

#[test]
fn throw_known_error_remaps_unknown_and_preserves_known_codes() {
    let remapped = throw_known_error(error_codes::DB_ADD, || -> Result<(), AppError> {
        Err(AppError::from(rusqlite::Error::SqliteFailure(
            rusqlite::ffi::Error::new(rusqlite::ffi::SQLITE_CONSTRAINT_FOREIGNKEY),
            Some("FOREIGN KEY constraint failed".to_string()),
        )))
    })
    .expect_err("should remap unknown");
    assert_eq!(remapped.code, error_codes::DB_ADD);
    assert!(remapped.details.is_some());

    let preserved = throw_known_error(error_codes::DB_ADD, || -> Result<(), AppError> {
        Err(AppError::new(
            error_codes::NOT_FOUND_DECKS_ADD_ALGORITHM,
            Some("Algorithm id: 1".to_string()),
        ))
    })
    .expect_err("should preserve known code");
    assert_eq!(preserved.code, error_codes::NOT_FOUND_DECKS_ADD_ALGORITHM);
}

#[test]
fn repo_db_errors_use_operation_codes() {
    let db = test_db();

    let err = db
        .with_conn(|conn| {
            conn.execute_batch(
                "
                CREATE TABLE parent (id INTEGER PRIMARY KEY);
                CREATE TABLE child (
                    id INTEGER PRIMARY KEY,
                    parent_id INTEGER NOT NULL REFERENCES parent(id)
                );
                ",
            )?;
            Ok(())
        })
        .and_then(|_| {
            throw_known_error(error_codes::DB_ADD, || {
                db.with_conn(|conn| {
                    conn.execute("INSERT INTO child (id, parent_id) VALUES (1, 999)", [])?;
                    Ok(())
                })
            })
        })
        .expect_err("fk failure should surface as db.add");

    assert_eq!(err.code, error_codes::DB_ADD);
}
