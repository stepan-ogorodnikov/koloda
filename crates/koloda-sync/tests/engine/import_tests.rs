use koloda::app::init::seed_db;
use koloda::repo::sync::join::JoinMode;
use koloda_sync::pairing::{ImportMode, Joined};

use crate::common::{Device, TestServer, SERVER_URL};
use crate::fixtures::{seed_data, seed_settings, Library};

const SYNCED_TABLES: [&str; 6] = [
    "algorithms",
    "algorithm_revisions",
    "templates",
    "decks",
    "cards",
    "reviews",
];

/// A blank creator with a library, synced into a new space.
fn creator(server: &TestServer) -> (Device, Library) {
    let a = server.device();
    a.engine
        .create_space(SERVER_URL, &server.setup_token, "Study", "Laptop")
        .expect("A creates the space");
    let library = a.library();
    a.engine.sync_now().expect("A syncs");
    (a, library)
}

/// A file that started fresh and holds its own library, and never synced.
fn used_file(server: &TestServer) -> (Device, Library) {
    let b = server.device();
    seed_db(&b.db, seed_data(100)).expect("B starts fresh");
    let library = b.library();
    (b, library)
}

fn join(creator: &Device, joiner: &Device) -> Joined {
    let code = creator.engine.issue_pairing(None).expect("a code is issued").code;
    let joined = joiner
        .engine
        .join(SERVER_URL, &code, "Phone", seed_settings())
        .expect("the joiner claims the code");
    assert_eq!(joined.mode, JoinMode::Used, "a used file waits for a choice");
    joined
}

#[test]
fn add_of_an_unrelated_file_remints_nothing_and_both_sides_end_with_the_union() {
    let server = TestServer::new();
    let (a, a_library) = creator(&server);
    let (b, b_library) = used_file(&server);

    let joined = join(&a, &b);
    b.engine.import(ImportMode::Add).expect("B adds its rows");
    b.engine.sync_now().expect("B syncs");
    a.engine.sync_now().expect("A pulls B's rows");

    assert_eq!(joined.known_ids, 0, "the space holds none of B's ids");
    assert!(b.has_card(&b_library.card), "B's card keeps its id");
    assert!(
        b.has_card(&a_library.card) && a.has_card(&b_library.card),
        "each side holds the other's card"
    );
    assert_eq!(a.ids("cards"), b.ids("cards"));
    assert_eq!(a.ids("decks"), b.ids("decks"));
}

#[test]
fn add_of_a_copy_converges_on_the_union() {
    let server = TestServer::new();
    let a = server.device();
    seed_db(&a.db, seed_data(100)).expect("A starts fresh");
    let library = a.library();
    let copy = server.copy(&a);
    a.engine
        .create_space(SERVER_URL, &server.setup_token, "Study", "Laptop")
        .expect("A creates the space");
    a.engine.sync_now().expect("A syncs");

    let joined = join(&a, &copy);
    copy.engine.import(ImportMode::Add).expect("the copy adds its rows");
    copy.engine.sync_now().expect("the copy syncs");
    a.engine.sync_now().expect("A pulls the copy's rows");

    assert!(
        joined.known_ids > 0,
        "a copy's ids are known, the sign to suggest Replace"
    );
    assert_eq!(a.ids("cards"), copy.ids("cards"));
    assert_eq!(
        a.count("SELECT COUNT(*) FROM cards"),
        2,
        "the copy's card is reminted beside the original"
    );
    assert!(copy.has_card(&library.card), "the original arrives from the space");
}

#[test]
fn replace_leaves_the_joiner_with_exactly_the_space_rows() {
    let server = TestServer::new();
    let (a, _) = creator(&server);
    let (b, b_library) = used_file(&server);

    join(&a, &b);
    b.engine.import(ImportMode::Replace).expect("B replaces its rows");
    b.engine.sync_now().expect("B syncs");

    for table in SYNCED_TABLES {
        assert_eq!(b.ids(table), a.ids(table), "{table}");
    }
    assert!(!b.has_card(&b_library.card), "B's own rows are gone");
}

#[test]
fn a_probe_of_more_than_1000_ids_spans_two_calls() {
    let server = TestServer::new();
    let (a, _) = creator(&server);
    let (b, b_library) = used_file(&server);
    b.add_cards(&b_library.deck, &b_library.template, 1_000);

    join(&a, &b);

    let probes = b
        .transport
        .sent()
        .iter()
        .filter(|request| request.url.ends_with("/ids/known"))
        .count();
    assert_eq!(probes, 2, "1000 ids per call");
}

#[test]
fn a_used_file_still_waits_for_its_choice_after_a_relaunch() {
    let server = TestServer::new();
    let (a, a_library) = creator(&server);
    let (b, b_library) = used_file(&server);
    join(&a, &b);

    let relaunched = server.relaunch(&b);
    relaunched
        .engine
        .sync_now()
        .expect("a pending file's cycle does nothing");
    assert!(
        relaunched.transport.sent().is_empty(),
        "nothing is sent while the choice is pending"
    );
    relaunched
        .engine
        .import(ImportMode::Add)
        .expect("the choice is made after the relaunch");
    relaunched.engine.sync_now().expect("the file syncs");

    assert!(relaunched.has_card(&a_library.card) && relaunched.has_card(&b_library.card));
}
