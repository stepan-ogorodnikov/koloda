use crate::common::test_db;
use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

const BOOKKEEPING_TABLES: &[&str] = &["_migrations", "__migrations"];

#[derive(Debug, Serialize, Deserialize, PartialEq)]
struct SchemaInventory {
    tables: Vec<TableInventory>,
}

#[derive(Debug, Serialize, Deserialize, PartialEq)]
struct TableInventory {
    name: String,
    columns: Vec<ColumnInventory>,
    indexes: Vec<IndexInventory>,
    foreign_keys: Vec<ForeignKeyInventory>,
}

#[derive(Debug, Serialize, Deserialize, PartialEq)]
struct ColumnInventory {
    name: String,
    #[serde(rename = "type")]
    col_type: String,
    notnull: i64,
    pk: i64,
    dflt_value: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, PartialEq)]
struct IndexInventory {
    name: String,
    unique: i64,
    columns: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize, PartialEq)]
struct ForeignKeyInventory {
    table: String,
    from: String,
    to: String,
    on_delete: String,
    on_update: String,
}

fn snapshot_path() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("src/migrations/schema-inventory.json")
}

fn pragma_ident(name: &str) -> rusqlite::Result<&str> {
    if !name.is_empty() && name.chars().all(|c| c.is_ascii_alphanumeric() || c == '_') {
        Ok(name)
    } else {
        Err(rusqlite::Error::InvalidParameterName(name.to_string()))
    }
}

fn dump_schema(conn: &Connection) -> rusqlite::Result<SchemaInventory> {
    let mut table_names = Vec::new();
    let mut stmt = conn.prepare(
        "SELECT name FROM sqlite_master
         WHERE type = 'table'
           AND name NOT LIKE 'sqlite_%'
         ORDER BY name",
    )?;
    let rows = stmt.query_map([], |row| row.get::<_, String>(0))?;
    for name in rows {
        let name = name?;
        if BOOKKEEPING_TABLES.contains(&name.as_str()) {
            continue;
        }
        table_names.push(name);
    }

    let mut tables = Vec::new();
    for table_name in table_names {
        let table_name = pragma_ident(&table_name)?.to_string();
        tables.push(TableInventory {
            name: table_name.clone(),
            columns: dump_columns(conn, &table_name)?,
            indexes: dump_indexes(conn, &table_name)?,
            foreign_keys: dump_foreign_keys(conn, &table_name)?,
        });
    }

    Ok(SchemaInventory { tables })
}

fn dump_columns(conn: &Connection, table: &str) -> rusqlite::Result<Vec<ColumnInventory>> {
    let mut stmt = conn.prepare(&format!("PRAGMA table_info({table})"))?;
    let mut columns = stmt
        .query_map([], |row| {
            Ok(ColumnInventory {
                name: row.get(1)?,
                col_type: row.get::<_, String>(2)?.to_uppercase(),
                notnull: row.get(3)?,
                pk: row.get(5)?,
                dflt_value: row.get(4)?,
            })
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    columns.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(columns)
}

fn dump_indexes(conn: &Connection, table: &str) -> rusqlite::Result<Vec<IndexInventory>> {
    let mut stmt = conn.prepare(&format!("PRAGMA index_list({table})"))?;
    let listed = stmt
        .query_map([], |row| Ok((row.get::<_, String>(1)?, row.get::<_, i64>(2)?)))?
        .collect::<rusqlite::Result<Vec<_>>>()?;

    let mut indexes = Vec::new();
    for (name, unique) in listed {
        let name = pragma_ident(&name)?.to_string();
        let mut info = conn.prepare(&format!("PRAGMA index_info({name})"))?;
        let columns = info
            .query_map([], |row| row.get::<_, String>(2))?
            .collect::<rusqlite::Result<Vec<_>>>()?;
        indexes.push(IndexInventory { name, unique, columns });
    }
    indexes.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(indexes)
}

fn dump_foreign_keys(conn: &Connection, table: &str) -> rusqlite::Result<Vec<ForeignKeyInventory>> {
    let mut stmt = conn.prepare(&format!("PRAGMA foreign_key_list({table})"))?;
    let mut foreign_keys = stmt
        .query_map([], |row| {
            Ok(ForeignKeyInventory {
                table: row.get(2)?,
                from: row.get(3)?,
                to: row.get(4)?,
                on_update: row.get::<_, String>(5)?.to_uppercase(),
                on_delete: row.get::<_, String>(6)?.to_uppercase(),
            })
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    foreign_keys.sort_by(|a, b| {
        a.from
            .cmp(&b.from)
            .then_with(|| a.table.cmp(&b.table))
            .then_with(|| a.to.cmp(&b.to))
    });
    Ok(foreign_keys)
}

#[test]
fn product_schema_matches_committed_inventory() {
    let db = test_db();
    let actual = db
        .with_conn(|conn| dump_schema(conn).map_err(koloda::app::error::AppError::from))
        .expect("schema dump should succeed");
    let expected: SchemaInventory =
        serde_json::from_str(&fs::read_to_string(snapshot_path()).expect("schema-inventory.json should exist"))
            .expect("schema-inventory.json should parse");

    assert_eq!(
        actual,
        expected,
        "desktop schema diverged from schema-inventory.json\nactual:\n{}",
        serde_json::to_string_pretty(&actual).expect("inventory should serialize"),
    );
}

#[test]
#[ignore = "writes crates/koloda/src/migrations/schema-inventory.json from a migrated desktop DB"]
fn write_schema_inventory_snapshot() {
    let db = test_db();
    let actual = db
        .with_conn(|conn| dump_schema(conn).map_err(koloda::app::error::AppError::from))
        .expect("schema dump should succeed");
    let body = format!(
        "{}\n",
        serde_json::to_string_pretty(&actual).expect("inventory should serialize")
    );
    fs::write(snapshot_path(), body).expect("schema-inventory.json should write");
}
