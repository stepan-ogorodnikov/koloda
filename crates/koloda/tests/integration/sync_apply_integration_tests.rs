use koloda::app::db::Database;
use koloda::app::init::seed_db;
use koloda::domain::algorithms::{UpdateAlgorithmData, UpdateAlgorithmValues};
use koloda::domain::seed_ids::SEED_ALGORITHM_SIMPLE_ID;
use koloda::repo::algorithms::{get_algorithm, update_algorithm};
use koloda::repo::cards::get_card;
use koloda::repo::decks::get_deck;
use koloda::repo::sync::apply::{apply_page, Page};
use koloda::repo::templates::get_template;
use koloda_sync_proto::payload::{
    CardCreate, CardScheduling, DeckCreate, DocumentCreate, InitialProductTs, Payload, Review,
};
use koloda_sync_proto::registry::{Kind, Lane};
use uuid::Uuid;

use crate::common::fixtures::{add_algorithm, add_card, add_deck, add_template};
use crate::common::sync::{
    count, cursor, device, enroll, hot_page, last_hlc, origin, register, replica, sealed, stamp, FakeSpace,
};
use crate::common::{fsrs_algorithm_content, seed_data, test_db};

const WALL_MS: u64 = 1_727_000_000_000;
const ALGORITHM: &str = "01920000-0000-7000-8000-0000000000a1";
const DECK: &str = "01920000-0000-7000-8000-0000000000d1";
const CARD: &str = "01920000-0000-7000-8000-0000000000c1";

fn algorithm_create(title: &str, initial_product_ts: InitialProductTs, floor: Option<i64>) -> Payload {
    Payload::AlgorithmCreate(DocumentCreate {
        title: title.to_string(),
        notes: Some("from the space".to_string()),
        content: serde_json::to_string(&fsrs_algorithm_content()).expect("parameters serialize"),
        created_at: 1_726_000_000_000,
        initial_product_ts,
        legacy_product_ts_floor: floor,
    })
}

fn deck_create() -> Payload {
    Payload::DeckCreate(DeckCreate {
        title: "Remote deck".to_string(),
        notes: None,
        created_at: 1_726_000_000_000,
        initial_product_ts: InitialProductTs::new(),
        legacy_product_ts_floor: None,
    })
}

fn card_create(deck_id: &str, template_id: &str) -> Payload {
    Payload::CardCreate(CardCreate {
        deck_id: deck_id.to_string(),
        template_id: template_id.to_string(),
        content: "{}".to_string(),
        scheduling: CardScheduling {
            state: 0,
            due_at: None,
            stability: 0.0,
            difficulty: 0.0,
            scheduled_days: 0,
            learning_steps: 0,
            reps: 0,
            lapses: 0,
            last_reviewed_at: None,
        },
        created_at: 1_726_000_000_000,
        initial_product_ts: InitialProductTs::new(),
        legacy_product_ts_floor: None,
    })
}

fn revisions(db: &Database) -> Vec<(String, String, String, String, i64)> {
    db.with_conn(|conn| {
        let mut stmt =
            conn.prepare("SELECT id, algorithm_id, content, actor, created_at FROM algorithm_revisions ORDER BY id")?;
        let rows = stmt
            .query_map([], |row| {
                Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?))
            })?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(rows)
    })
    .expect("revisions read")
}

#[test]
fn remote_creates_insert_rows_equal_to_the_writing_replica() {
    let (a, b) = (replica(), replica());
    let algorithm = add_algorithm(&a, "FSRS");
    let template = add_template(&a, "Basic");
    let deck = add_deck(&a, &algorithm, &template, "Spanish");
    let card = add_card(&a, &deck, &template, "hola");

    let mut space = FakeSpace::default();
    space.push(&a);
    let changed = space.pull(&b);

    assert_eq!(
        get_algorithm(&b, &algorithm).unwrap(),
        get_algorithm(&a, &algorithm).unwrap()
    );
    assert_eq!(
        get_template(&b, &template).unwrap(),
        get_template(&a, &template).unwrap()
    );
    assert_eq!(get_deck(&b, &deck).unwrap(), get_deck(&a, &deck).unwrap());
    assert_eq!(get_card(&b, &card).unwrap(), get_card(&a, &card).unwrap());
    assert_eq!(revisions(&b), revisions(&a));
    for kind in [
        Kind::Algorithms,
        Kind::AlgorithmRevisions,
        Kind::Templates,
        Kind::Decks,
        Kind::Cards,
    ] {
        assert!(changed.contains(&kind), "{kind:?} is reported as changed");
    }

    let a_origin = origin(&a, "cards", &card, "create").expect("A records the card create");
    let b_origin = origin(&b, "cards", &card, "create").expect("B records the card create");
    assert_eq!(b_origin.hlc, a_origin.hlc);
    assert_eq!(b_origin.sender, device(&a));
    assert_eq!(b_origin.sender_seq, a_origin.sender_seq);

    let content = register(&b, "cards", &card, "content").expect("the create stamps the content register");
    assert_eq!(content.hlc, a_origin.hlc);
    assert!(content.is_synthetic, "a create's registers are synthetic floors");
}

#[test]
fn a_create_for_an_id_already_held_is_dropped() {
    let b = replica();
    let id = add_algorithm(&b, "Local");
    let remote = Uuid::now_v7();

    let page = hot_page(
        remote,
        vec![sealed(
            &id,
            None,
            stamp(remote, WALL_MS),
            &algorithm_create("Remote", InitialProductTs::new(), None),
        )],
        1,
    );
    let changed = apply_page(&b, &page).unwrap();

    assert!(changed.is_empty(), "a dropped create changes nothing");
    assert_eq!(get_algorithm(&b, &id).unwrap().unwrap().title, "Local");
}

#[test]
fn only_an_untouched_seed_row_is_overlaid_by_a_remote_seed_create() {
    for is_touched in [false, true] {
        let b = test_db();
        seed_db(&b, seed_data("Simple", "Basic")).unwrap();
        enroll(&b);
        if is_touched {
            update_algorithm(
                &b,
                UpdateAlgorithmData {
                    id: SEED_ALGORITHM_SIMPLE_ID.to_string(),
                    values: UpdateAlgorithmValues {
                        title: "Edited here".to_string(),
                        content: fsrs_algorithm_content(),
                        notes: None,
                    },
                },
            )
            .unwrap();
        }
        let local_title = get_algorithm(&b, SEED_ALGORITHM_SIMPLE_ID).unwrap().unwrap().title;

        let remote = Uuid::now_v7();
        let page = hot_page(
            remote,
            vec![sealed(
                SEED_ALGORITHM_SIMPLE_ID,
                None,
                stamp(remote, WALL_MS),
                &algorithm_create("Space simple", InitialProductTs::new(), None),
            )],
            1,
        );
        apply_page(&b, &page).unwrap();

        let seed = get_algorithm(&b, SEED_ALGORITHM_SIMPLE_ID).unwrap().unwrap();
        if is_touched {
            assert_eq!(
                seed.title, local_title,
                "a seed row with registers is no longer stamp zero"
            );
            assert!(origin(&b, "algorithms", SEED_ALGORITHM_SIMPLE_ID, "create").is_none());
        } else {
            assert_eq!(seed.title, "Space simple");
            assert_eq!(seed.notes.as_deref(), Some("from the space"));
            let created =
                origin(&b, "algorithms", SEED_ALGORITHM_SIMPLE_ID, "create").expect("overlay records an origin");
            assert_eq!(created.sender, remote);
        }
    }
}

#[test]
fn a_deck_create_without_its_pointers_sits_on_the_lowest_live_ids() {
    let b = replica();
    let algorithms = [add_algorithm(&b, "First"), add_algorithm(&b, "Second")];
    let templates = [add_template(&b, "First"), add_template(&b, "Second")];
    let remote = Uuid::now_v7();

    let page = hot_page(
        remote,
        vec![sealed(DECK, None, stamp(remote, WALL_MS), &deck_create())],
        1,
    );
    apply_page(&b, &page).unwrap();

    let deck = get_deck(&b, DECK).unwrap().expect("the deck is inserted");
    assert_eq!(Some(&deck.algorithm_id), algorithms.iter().min());
    assert_eq!(Some(&deck.template_id), templates.iter().min());
    let pointer = register(&b, "decks", DECK, "algorithm").expect("the create stamps the pointer register");
    assert!(
        pointer.is_synthetic,
        "the same-commit pointer group can still win the register"
    );
}

#[test]
fn a_create_derives_updated_at_from_its_initial_product_timestamps_and_floor() {
    let cases: [(InitialProductTs, Option<i64>, Option<i64>); 3] = [
        (
            InitialProductTs::from([("title".to_string(), 100), ("notes".to_string(), 300)]),
            Some(200),
            Some(300),
        ),
        (InitialProductTs::new(), Some(200), Some(200)),
        (InitialProductTs::new(), None, None),
    ];
    for (initial, floor, expected) in cases {
        let b = replica();
        let remote = Uuid::now_v7();
        let page = hot_page(
            remote,
            vec![sealed(
                ALGORITHM,
                None,
                stamp(remote, WALL_MS),
                &algorithm_create("Remote", initial.clone(), floor),
            )],
            1,
        );
        apply_page(&b, &page).unwrap();

        let algorithm = get_algorithm(&b, ALGORITHM).unwrap().unwrap();
        assert_eq!(algorithm.updated_at, expected, "initial {initial:?}, floor {floor:?}");
        let title = register(&b, "algorithms", ALGORITHM, "title").expect("title register");
        assert_eq!(title.product_ts, initial.get("title").copied());
    }
}

#[test]
fn a_create_naming_a_missing_parent_or_template_is_dropped() {
    let b = replica();
    let algorithm = add_algorithm(&b, "FSRS");
    let template = add_template(&b, "Basic");
    let deck = add_deck(&b, &algorithm, &template, "Spanish");
    let missing = "01920000-0000-7000-8000-0000000000ff";
    let remote = Uuid::now_v7();

    let cases = [
        (missing, template.as_str(), false),
        (deck.as_str(), missing, false),
        (deck.as_str(), template.as_str(), true),
    ];
    for (index, (deck_id, template_id, is_inserted)) in cases.into_iter().enumerate() {
        let card = format!("01920000-0000-7000-8000-00000000c00{index}");
        let page = hot_page(
            remote,
            vec![sealed(
                &card,
                None,
                stamp(remote, WALL_MS),
                &card_create(deck_id, template_id),
            )],
            1,
        );
        let changed = apply_page(&b, &page).unwrap();

        assert_eq!(
            get_card(&b, &card).unwrap().is_some(),
            is_inserted,
            "deck {deck_id}, template {template_id}"
        );
        assert_eq!(changed.contains(&Kind::Cards), is_inserted);
    }
}

#[test]
fn the_clock_moves_past_every_applied_stamp() {
    let b = replica();
    let remote = Uuid::now_v7();
    let ahead = stamp(remote, WALL_MS * 2);

    let page = hot_page(
        remote,
        vec![sealed(
            ALGORITHM,
            None,
            ahead,
            &algorithm_create("Remote", InitialProductTs::new(), None),
        )],
        1,
    );
    apply_page(&b, &page).unwrap();
    assert_eq!(last_hlc(&b), ahead.hlc);

    let template = add_template(&b, "Local");
    let local = origin(&b, "templates", &template, "create").expect("local create is stamped");
    assert!(local.hlc > ahead.hlc, "the next local write beats what it applied");
}

#[test]
fn a_failed_page_applies_nothing_and_keeps_the_cursor() {
    let remote = Uuid::now_v7();
    let review = Payload::Review(Review {
        card_id: CARD.to_string(),
        rating: 3,
        state: 2,
        due_at: 1_727_000_000_000,
        stability: 1.0,
        difficulty: 5.0,
        scheduled_days: 1,
        learning_steps: 0,
        time: 1_000,
        is_ignored: false,
        created_at: 1_727_000_000_000,
    });
    let bad_entries = [
        ("undecodable bytes", vec![0xff, 0x00]),
        (
            "a cold-lane kind in a hot page",
            sealed("r1", Some(CARD), stamp(remote, WALL_MS), &review),
        ),
        (
            "a deck create with no live template",
            sealed(DECK, None, stamp(remote, WALL_MS), &deck_create()),
        ),
    ];

    for (case, bad) in bad_entries {
        let b = replica();
        add_algorithm(&b, "Local");
        apply_page(&b, &hot_page(remote, Vec::new(), 5)).unwrap();

        let valid = sealed(
            ALGORITHM,
            None,
            stamp(remote, WALL_MS),
            &algorithm_create("Remote", InitialProductTs::new(), None),
        );
        let error = apply_page(&b, &hot_page(remote, vec![valid, bad], 9)).unwrap_err();

        assert_eq!(error.code, "db.update", "{case}");
        assert_eq!(cursor(&b, Lane::Hot), 5, "{case}");
        assert!(get_algorithm(&b, ALGORITHM).unwrap().is_none(), "{case}");
    }
}

#[test]
fn apply_needs_an_enrolled_database() {
    let db = test_db();
    let remote = Uuid::now_v7();
    let page = hot_page(
        remote,
        vec![sealed(
            ALGORITHM,
            None,
            stamp(remote, WALL_MS),
            &algorithm_create("Remote", InitialProductTs::new(), None),
        )],
        1,
    );

    let error = apply_page(&db, &page).unwrap_err();
    assert_eq!(error.code, "db.update");
    assert_eq!(count(&db, "SELECT COUNT(*) FROM algorithms"), 0);
}

#[test]
fn the_cursor_moves_to_scanned_through_even_for_an_empty_page() {
    let b = replica();
    let remote = Uuid::now_v7();

    apply_page(&b, &hot_page(remote, Vec::new(), 12)).unwrap();
    apply_page(
        &b,
        &Page {
            lane: Lane::Cold,
            entries: Vec::new(),
            scanned_through: 4,
        },
    )
    .unwrap();

    assert_eq!(cursor(&b, Lane::Hot), 12);
    assert_eq!(cursor(&b, Lane::Cold), 4);
}
