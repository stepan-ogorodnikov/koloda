use std::cell::RefCell;
use std::sync::{Arc, Mutex};

use koloda::app::init::seed_db;
use koloda_sync_proto::transport::Outcome;

use crate::common::Space;
use crate::fixtures::{seed_data, Library};

const SYNCED_TABLES: [&str; 6] = [
    "algorithms",
    "algorithm_revisions",
    "templates",
    "decks",
    "cards",
    "reviews",
];

#[test]
fn a_joiner_converges_on_every_row_the_creator_held_before_enrolling() {
    let library: RefCell<Option<Library>> = RefCell::new(None);
    let space = Space::with(|device| {
        seed_db(&device.db, seed_data(77)).expect("the creator starts fresh");
        let written = device.library();
        device.grade(&written.card);
        library.replace(Some(written));
    });
    assert!(
        library.borrow().is_some(),
        "the creator wrote its rows before enrolling"
    );

    space.device.engine.sync_now().expect("the creator syncs");
    let joiner = space.server.join(&space.device);
    joiner.engine.sync_now().expect("the joiner syncs");

    for table in SYNCED_TABLES {
        assert_eq!(joiner.ids(table), space.device.ids(table), "{table}");
    }
    assert_eq!(
        joiner.count("SELECT json_extract(content, '$.dailyLimits.total') FROM settings WHERE name = 'learning'"),
        77,
        "the creator's learning settings overlay the joiner's first-run ones"
    );
    let outcomes = space.outcomes(&space.device);
    assert!(!outcomes.is_empty(), "the creator's rows were pushed");
    assert!(
        outcomes.iter().all(|outcome| *outcome == Outcome::Applied),
        "referents always reach the server first, so nothing meets `existence`: {outcomes:?}"
    );
}

#[test]
fn a_card_written_before_its_template_is_scanned_reaches_the_server_first_time() {
    let referents: RefCell<Option<(String, String)>> = RefCell::new(None);
    let space = Space::with(|device| {
        let algorithm = device.add_algorithm("FSRS");
        let template = device.add_template("Basic");
        let deck = device.add_deck(&algorithm, &template, "Spanish");
        referents.replace(Some((template, deck)));
    });
    let (template, deck) = referents.take().expect("the referents predate enrollment");

    // Backfill has not scanned anything yet, so the card's commit carries its unstamped referents.
    let card = space.device.add_card(&deck, &template, "written mid-scan");
    space.device.engine.sync_now().expect("the creator syncs");

    let outcomes = space.outcomes(&space.device);
    assert!(
        outcomes.iter().all(|outcome| *outcome == Outcome::Applied),
        "{outcomes:?}"
    );
    let joiner = space.server.join(&space.device);
    joiner.engine.sync_now().expect("the joiner syncs");
    assert!(joiner.has_card(&card), "the card reaches the joiner");
}

#[test]
fn the_outbox_holds_at_most_one_backfill_batch_past_a_push_batch() {
    let space = Space::with(|device| {
        let library = device.library();
        device.add_cards(&library.deck, &library.template, 3_000);
    });
    let sizes = Arc::new(Mutex::new(Vec::new()));
    let observed = Arc::clone(&sizes);
    let db = space.device.db.clone();
    space.device.transport.observe(move |request| {
        if request.url.ends_with("/push") {
            let pending: i64 = db
                .with_conn(|conn| Ok(conn.query_row("SELECT COUNT(*) FROM sync_outbox", [], |row| row.get(0))?))
                .expect("the outbox counts");
            observed.lock().expect("sizes lock").push(pending);
        }
    });

    space.device.engine.sync_now().expect("the creator syncs");

    let sizes = sizes.lock().expect("sizes lock").clone();
    assert!(sizes.len() >= 3, "6000 envelopes take several pushes: {sizes:?}");
    assert!(
        sizes.iter().all(|pending| *pending <= 2_500),
        "a push batch of 2000 plus at most one backfill batch of 500: {sizes:?}"
    );
    assert!(space.device.outbox().is_empty(), "every row is pushed");
    assert_eq!(
        space.device.count("SELECT backfill_step IS NULL FROM sync_state"),
        1,
        "backfill is done"
    );
}
