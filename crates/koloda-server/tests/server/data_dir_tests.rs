use std::sync::Arc;

use koloda_server::clock::SystemClock;
use koloda_server::data_dir::{self, DataDirError, DataDirLock};
use koloda_server::server::Server;

use crate::common::START_MS;

#[test]
fn init_refuses_a_directory_that_already_holds_a_server() {
    let dir = tempfile::tempdir().expect("temporary directory");
    data_dir::init(dir.path(), START_MS).expect("first init");

    let second = data_dir::init(dir.path(), START_MS);

    assert!(
        matches!(second, Err(DataDirError::AlreadyInitialized(_))),
        "second init: {second:?}"
    );
}

#[test]
fn an_uninitialized_directory_cannot_be_served_or_locked() {
    let dir = tempfile::tempdir().expect("temporary directory");

    let opened = Server::open(dir.path(), Arc::new(SystemClock));
    let locked = DataDirLock::acquire(dir.path());

    assert!(
        matches!(opened, Err(DataDirError::NotInitialized(_))),
        "open: {:?}",
        opened.err()
    );
    assert!(
        matches!(locked, Err(DataDirError::NotInitialized(_))),
        "lock: {:?}",
        locked.err()
    );
}

#[test]
fn a_second_lock_holder_fails_until_the_first_releases() {
    let dir = tempfile::tempdir().expect("temporary directory");
    data_dir::init(dir.path(), START_MS).expect("init");
    let first = DataDirLock::acquire(dir.path()).expect("first lock");

    let second = DataDirLock::acquire(dir.path());
    assert!(
        matches!(second, Err(DataDirError::Locked(_))),
        "second lock: {:?}",
        second.err()
    );

    drop(first);
    DataDirLock::acquire(dir.path()).expect("lock after the first holder released it");
}
