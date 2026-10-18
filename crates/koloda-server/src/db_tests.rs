//! A writer connection takes the write lock as its transaction begins; a unit test, since the openers are private.

use std::path::Path;
use std::time::Duration;

use rusqlite::{Connection, ErrorCode};

use crate::db::{self, DbError};

type Opener = fn(&Path) -> Result<Connection, DbError>;

#[test]
fn a_writer_transaction_holds_the_write_lock_from_its_start() {
    let dir = tempfile::tempdir().unwrap();
    let openers: [(&str, Opener); 2] = [("space.db", db::open_space), ("server.db", db::open_server)];
    for (name, open) in openers {
        let path = dir.path().join(name);
        let mut writer = open(&path).unwrap();
        // WHY: another process, as a CLI command beside `serve`, with no busy timeout so a held lock shows at once.
        let other = Connection::open(&path).unwrap();
        other.busy_timeout(Duration::ZERO).unwrap();

        let tx = writer.transaction().unwrap();
        let error = other.execute_batch("BEGIN IMMEDIATE").unwrap_err();
        assert_eq!(error.sqlite_error_code(), Some(ErrorCode::DatabaseBusy), "{name}");

        drop(tx);
        other.execute_batch("BEGIN IMMEDIATE; ROLLBACK").unwrap();
    }
}
