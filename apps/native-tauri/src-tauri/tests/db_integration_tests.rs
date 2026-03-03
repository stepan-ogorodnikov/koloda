mod common;
use common::test_db;

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
