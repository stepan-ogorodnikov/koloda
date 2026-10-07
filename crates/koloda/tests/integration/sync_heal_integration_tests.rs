//! Heal after a server restore: the scan that re-pushes every write above its sender's cutoff
//! (`crates/koloda-sync-proto/PROTOCOL.md` §Server restore). A test pushes into a fake space, picks the cutoffs a
//! restore would report, and drains the scan.

use koloda::app::db::Database;
use koloda::domain::cards::{DeleteCardData, UpdateCardData, UpdateCardProgress, UpdateCardValues};
use koloda::domain::lessons::LessonResultData;
use koloda::domain::reviews::InsertReviewData;
use koloda::domain::settings::SettingsName;
use koloda::repo::cards::{delete_card, update_card};
use koloda::repo::lessons::submit_lesson_result;
use koloda::repo::settings;
use koloda::repo::sync::heal::{begin_heal, heal_batch, Heal};
use koloda::repo::sync::outbox::push_batch;
use koloda::repo::sync::rebase::{begin_rebase, finish_rebase};
use koloda::repo::sync::restamp::restamp_local_cohorts;
use koloda::repo::sync::switch::switch_device;
use koloda_sync_proto::envelope::digest;
use koloda_sync_proto::payload::{CardCreate, DocumentCreate, InitialProductTs, Payload};
use koloda_sync_proto::registry::{Group, Kind, Op};
use serde_json::json;
use uuid::Uuid;

use crate::common::fixtures::{add_algorithm, add_card, add_deck, add_template};
use crate::common::sync::{
    apply, count, device, enroll, hot_page, origin, outbox, register, replica, sealed, stamp, starter, FakeSpace,
    OutboxEntry,
};
use crate::common::{card_content, learning_settings, simple_template_content, test_db};

const RESTORED: Uuid = Uuid::from_u128(0x0192_0000_0000_7000_8000_0000_0000_4e57);

fn heal(db: &Database, cutoffs: &[(Uuid, u64)]) {
    begin_heal(db, RESTORED, 1 << 40, 1 << 40, cutoffs).expect("heal begins");
}

/// Runs the scan to its end in batches of `max_envelopes`, and returns how many batches it took.
fn drain(db: &Database, max_envelopes: usize) -> usize {
    let mut batches = 1;
    while heal_batch(db, max_envelopes, usize::MAX).expect("heal batch runs") == Heal::Pending {
        batches += 1;
    }
    batches
}

fn seq_of(db: &Database, kind: &str, id: &str, group: &str) -> u64 {
    let seq = match group {
        "create" | "row" => origin(db, kind, id, group).expect("origin exists").sender_seq,
        _ => register(db, kind, id, group).expect("register exists").sender_seq,
    };
    u64::try_from(seq).expect("seq is non-negative")
}

fn targets(rows: &[OutboxEntry]) -> Vec<(Kind, String, Option<Group>, Op)> {
    rows.iter()
        .map(|row| {
            let header = &row.envelope.header;
            (header.kind, header.id.clone(), header.group, header.op)
        })
        .collect()
}

fn position(rows: &[OutboxEntry], kind: Kind, id: &str, group: Option<Group>) -> usize {
    rows.iter()
        .position(|row| {
            let header = &row.envelope.header;
            header.kind == kind && header.id == id && header.group == group
        })
        .expect("the write is in the outbox")
}

fn edit(db: &Database, card: &str, front: &str) {
    update_card(
        db,
        UpdateCardData {
            id: card.to_string(),
            values: UpdateCardValues {
                content: card_content(front, "answer"),
            },
        },
    )
    .expect("card updates");
}

fn grade(db: &Database, card: &str) {
    submit_lesson_result(
        db,
        LessonResultData {
            card: UpdateCardProgress {
                id: card.to_string(),
                state: 2,
                due_at: 1_900_000_000_000,
                stability: 5.5,
                difficulty: 4.25,
                scheduled_days: 9,
                learning_steps: 0,
                reps: 1,
                lapses: 0,
                last_reviewed_at: Some(1_800_000_000_000),
            },
            review: InsertReviewData {
                card_id: card.to_string(),
                rating: 3,
                state: 2,
                due_at: 1_900_000_000_000,
                stability: 5.5,
                difficulty: 4.25,
                scheduled_days: 9,
                learning_steps: 0,
                time: 12,
                is_ignored: false,
            },
        },
    )
    .expect("grade submits");
}

#[test]
fn only_writes_above_their_senders_cutoff_go_out_again() {
    let db = replica();
    let own = device(&db);
    let mut space = FakeSpace::default();
    let algorithm = add_algorithm(&db, "FSRS");
    let template = add_template(&db, "Basic");
    let deck = add_deck(&db, &algorithm, &template, "Spanish");
    space.push(&db);
    let remote = Uuid::now_v7();
    let (kept, lost) = (Uuid::now_v7().to_string(), Uuid::now_v7().to_string());
    let remote_template = |id: &str| {
        sealed(
            id,
            None,
            stamp(remote, 1_800_000_000_000),
            &Payload::TemplateCreate(DocumentCreate {
                title: "Remote".to_string(),
                notes: None,
                content: serde_json::to_string(&simple_template_content()).expect("content serializes"),
                created_at: 1_800_000_000_000,
                initial_product_ts: InitialProductTs::new(),
                legacy_product_ts_floor: None,
            }),
        )
    };
    apply(
        &db,
        &hot_page(remote, vec![remote_template(&kept), remote_template(&lost)], 2),
    )
    .expect("page applies");
    let template_seq = seq_of(&db, "templates", &template, "create");

    // The backup holds this device's writes through the template, and the remote sender's first write.
    heal(&db, &[(own, template_seq), (remote, 1)]);
    drain(&db, 100);

    let rows = outbox(&db);
    assert_eq!(
        targets(&rows)
            .into_iter()
            .map(|(kind, id, group, _)| (kind, id, group))
            .collect::<Vec<_>>(),
        vec![
            (Kind::Templates, lost.clone(), Some(Group::Create)),
            (Kind::Decks, deck.clone(), Some(Group::Create)),
            (Kind::Decks, deck.clone(), Some(Group::Algorithm)),
            (Kind::Decks, deck, Some(Group::Template)),
        ],
        "the deck's synthetic title and notes registers are not writes"
    );
    assert_eq!(
        rows[0].envelope.header.stamp,
        stamp(remote, 1_800_000_000_000),
        "another device's write goes out with that device's stamp"
    );
}

#[test]
fn a_sender_the_restore_does_not_list_has_every_write_re_pushed() {
    let db = replica();
    let own = device(&db);
    let algorithm = add_algorithm(&db, "FSRS");
    let template = add_template(&db, "Basic");
    FakeSpace::default().push(&db);

    heal(&db, &[(Uuid::now_v7(), 1000)]);
    drain(&db, 100);

    let rows = outbox(&db);
    assert_eq!(
        targets(&rows)
            .into_iter()
            .map(|(kind, id, group, _)| (kind, id, group))
            .filter(|(kind, _, _)| *kind != Kind::AlgorithmRevisions)
            .collect::<Vec<_>>(),
        vec![
            (Kind::Algorithms, algorithm, Some(Group::Create)),
            (Kind::Templates, template, Some(Group::Create)),
        ]
    );
    assert!(
        rows.iter()
            .all(|row| row.envelope.header.stamp.device.0 == *own.as_bytes()),
        "re-pushed writes keep the stamps they were written with"
    );
}

#[test]
fn a_lost_card_goes_out_after_its_deck_and_before_its_tombstones() {
    let db = test_db();
    settings::set_settings(&db, SettingsName::Learning, learning_settings(200, 20, 50, 100))
        .expect("learning settings save");
    enroll(&db);
    let own = device(&db);
    let algorithm = add_algorithm(&db, "FSRS");
    let template = add_template(&db, "Basic");
    let mut space = FakeSpace::default();
    space.push(&db);
    let cutoff = seq_of(&db, "templates", &template, "create");
    let deck = add_deck(&db, &algorithm, &template, "Spanish");
    let card = add_card(&db, &deck, &template, "hola");
    let gone = add_card(&db, &deck, &template, "adiós");
    edit(&db, &card, "hola!");
    grade(&db, &card);
    delete_card(&db, DeleteCardData { id: gone.clone() }).expect("card deletes");
    settings::patch_settings(&db, SettingsName::Learning, json!({ "dayStartsAt": "05:00" })).expect("patch saves");
    space.push(&db);

    heal(&db, &[(own, cutoff)]);
    drain(&db, 100);

    let rows = outbox(&db);
    let at = |kind, id: &str, group| position(&rows, kind, id, group);
    assert!(at(Kind::Decks, &deck, Some(Group::Create)) < at(Kind::Decks, &deck, Some(Group::Algorithm)));
    assert!(at(Kind::Decks, &deck, Some(Group::Template)) < at(Kind::Cards, &card, Some(Group::Create)));
    assert!(at(Kind::Cards, &card, Some(Group::Create)) < at(Kind::Cards, &card, Some(Group::Content)));
    assert!(at(Kind::Cards, &card, Some(Group::Content)) < at(Kind::Cards, &card, Some(Group::Scheduling)));
    let review = rows
        .iter()
        .position(|row| row.envelope.header.kind == Kind::Reviews)
        .expect("the review goes out");
    assert!(at(Kind::Cards, &card, Some(Group::Scheduling)) < review);
    assert!(at(Kind::SettingsLearning, "learning", Some(Group::DayStartsAt)) < review);
    let tombstone = at(Kind::Cards, &gone, None);
    assert_eq!(tombstone, rows.len() - 1, "the tombstone goes last");
    assert_eq!(
        rows[tombstone].envelope.header.parent.as_deref(),
        Some(deck.as_str()),
        "a card's delete still names its deck after the card row is gone"
    );
}

#[test]
fn a_re_pushed_write_carries_its_stored_stamp_and_the_rows_values() {
    let db = replica();
    let own = device(&db);
    let algorithm = add_algorithm(&db, "FSRS");
    let template = add_template(&db, "Basic");
    let deck = add_deck(&db, &algorithm, &template, "Spanish");
    let card = add_card(&db, &deck, &template, "hola");
    edit(&db, &card, "hola!");
    FakeSpace::default().push(&db);
    let created = origin(&db, "cards", &card, "create").expect("create origin");
    let content = register(&db, "cards", &card, "content").expect("content register");

    heal(&db, &[(own, seq_of(&db, "decks", &deck, "template"))]);
    drain(&db, 100);

    let rows = outbox(&db);
    let create_row = &rows[position(&rows, Kind::Cards, &card, Some(Group::Create))];
    let content_row = &rows[position(&rows, Kind::Cards, &card, Some(Group::Content))];
    assert_eq!(create_row.envelope.header.stamp.hlc, created.hlc);
    assert_eq!(content_row.envelope.header.stamp.hlc, content.hlc);
    let Payload::CardCreate(CardCreate {
        content: created_content,
        initial_product_ts,
        ..
    }) = &create_row.payload
    else {
        panic!("expected a card create, got {:?}", create_row.payload);
    };
    let current: String = db
        .with_conn(|conn| {
            Ok(conn.query_row(
                "SELECT content FROM cards WHERE id = ?1",
                rusqlite::params![card],
                |row| row.get(0),
            )?)
        })
        .expect("content reads");
    assert_eq!(*created_content, current, "a create carries the row's current values");
    assert_eq!(initial_product_ts.get("content").copied(), content.product_ts);
    let Payload::CardContent(edited) = &content_row.payload else {
        panic!("expected card content, got {:?}", content_row.payload);
    };
    assert_eq!(
        edited.updated_at, content.product_ts,
        "an update carries its register's product time"
    );
    let stored_digest: Vec<u8> = db
        .with_conn(|conn| {
            Ok(conn.query_row(
                "SELECT digest FROM sync_outbox WHERE sender_seq = ?1",
                rusqlite::params![content_row.sender_seq],
                |row| row.get(0),
            )?)
        })
        .expect("digest reads");
    assert_eq!(
        stored_digest,
        digest(&content_row.envelope.encode().expect("envelope encodes"))
            .0
            .to_vec()
    );

    let moved = register(&db, "cards", &card, "content").expect("content register");
    assert_eq!(
        (moved.sender, moved.sender_seq, moved.hlc),
        (own, content_row.sender_seq, content.hlc),
        "the register names the re-push and keeps its stamp"
    );
    let moved = origin(&db, "cards", &card, "create").expect("create origin");
    assert_eq!((moved.sender_seq, moved.hlc), (create_row.sender_seq, created.hlc));
    assert_eq!(
        count(
            &db,
            "SELECT COUNT(*) FROM sync_cohorts WHERE state = 'fixed' AND has_consumed = 1"
        ),
        1,
        "the batch is one fixed cohort"
    );
}

#[test]
fn a_waiting_write_moves_behind_the_create_it_needs_and_one_in_flight_goes_again() {
    let db = replica();
    let own = device(&db);
    let algorithm = add_algorithm(&db, "FSRS");
    let template = add_template(&db, "Basic");
    let deck = add_deck(&db, &algorithm, &template, "Spanish");
    let sent = add_card(&db, &deck, &template, "sent");
    let waiting = add_card(&db, &deck, &template, "waiting");
    FakeSpace::default().push(&db);
    let cutoff = seq_of(&db, "decks", &deck, "template");
    edit(&db, &sent, "sent!");
    push_batch(&db, 1000, usize::MAX).expect("the edit goes in flight");
    edit(&db, &waiting, "waiting!");
    let before = outbox(&db);
    let waiting_bytes = before[position(&before, Kind::Cards, &waiting, Some(Group::Content))]
        .envelope
        .encode()
        .expect("envelope encodes");

    heal(&db, &[(own, cutoff)]);
    drain(&db, 100);

    let rows = outbox(&db);
    let waiting_rows: Vec<&OutboxEntry> = rows
        .iter()
        .filter(|row| row.envelope.header.id == waiting && row.envelope.header.group == Some(Group::Content))
        .collect();
    assert_eq!(waiting_rows.len(), 1, "a waiting write is not duplicated");
    assert_eq!(
        waiting_rows[0].envelope.encode().expect("envelope encodes"),
        waiting_bytes
    );
    assert!(
        position(&rows, Kind::Cards, &waiting, Some(Group::Create))
            < position(&rows, Kind::Cards, &waiting, Some(Group::Content)),
        "the waiting edit moved behind its card's create"
    );
    assert_eq!(
        register(&db, "cards", &waiting, "content")
            .expect("register")
            .sender_seq,
        waiting_rows[0].sender_seq,
        "the register follows the moved row"
    );

    let sent_rows: Vec<&OutboxEntry> = rows
        .iter()
        .filter(|row| row.envelope.header.id == sent && row.envelope.header.group == Some(Group::Content))
        .collect();
    assert_eq!(
        sent_rows.iter().map(|row| row.in_flight).collect::<Vec<_>>(),
        vec![true, false],
        "a write in flight may be lost with the old server, so it goes out again"
    );
    assert!(
        position(&rows, Kind::Cards, &sent, Some(Group::Create))
            < rows
                .iter()
                .position(|row| {
                    row.envelope.header.id == sent
                        && row.envelope.header.group == Some(Group::Content)
                        && !row.in_flight
                })
                .expect("the second copy is waiting")
    );
}

#[test]
fn a_capped_batch_resumes_where_it_stopped() {
    let build = || {
        let db = replica();
        let algorithm = add_algorithm(&db, "FSRS");
        let template = add_template(&db, "Basic");
        let deck = add_deck(&db, &algorithm, &template, "Spanish");
        for front in ["a", "b", "c"] {
            add_card(&db, &deck, &template, front);
        }
        FakeSpace::default().push(&db);
        heal(&db, &[]);
        db
    };
    let whole = build();
    let batched = build();

    assert_eq!(drain(&whole, 100), 1);
    assert!(drain(&batched, 2) > 3, "a cap of 2 takes several batches");

    let shape = |db: &Database| {
        targets(&outbox(db))
            .into_iter()
            .map(|(kind, _, group, op)| (kind, group, op))
            .collect::<Vec<_>>()
    };
    assert_eq!(shape(&batched), shape(&whole));
    assert_eq!(
        count(&batched, "SELECT COUNT(*) FROM sync_heal_cutoffs")
            + count(&batched, "SELECT COUNT(*) FROM sync_state WHERE heal_step IS NOT NULL"),
        0,
        "a finished scan clears its state"
    );
}

#[test]
fn a_restore_during_a_heal_lowers_the_cutoffs_and_restarts_the_scan() {
    let db = replica();
    let own = device(&db);
    let other = Uuid::now_v7();
    for title in ["a", "b", "c"] {
        add_template(&db, title);
    }
    FakeSpace::default().push(&db);
    db.with_conn(|conn| {
        conn.execute(
            "UPDATE sync_state SET cursor_hot = 50, cursor_cold = 7 WHERE id = 1",
            [],
        )?;
        Ok(())
    })
    .expect("cursors set");
    begin_heal(&db, RESTORED, 40, 9, &[(own, 2), (other, 5)]).expect("heal begins");
    assert_eq!(heal_batch(&db, 1, usize::MAX).expect("batch runs"), Heal::Pending);

    let second = Uuid::now_v7();
    begin_heal(&db, second, 60, 3, &[(own, 1)]).expect("second heal begins");

    let cutoffs = |db: &Database| {
        db.with_conn(|conn| {
            let rows = conn
                .prepare("SELECT sender, last_seq FROM sync_heal_cutoffs")?
                .query_map([], |row| Ok((row.get::<_, Vec<u8>>(0)?, row.get::<_, i64>(1)?)))?
                .collect::<Result<Vec<_>, _>>()?;
            Ok(rows)
        })
        .expect("cutoffs read")
    };
    assert_eq!(
        cutoffs(&db),
        vec![(own.as_bytes().to_vec(), 1)],
        "the lower cutoff wins, and a sender the second restore omits counts as 0"
    );
    assert_eq!(
        count(
            &db,
            "SELECT heal_step = 'algorithms' AND heal_after_id IS NULL FROM sync_state"
        ),
        1,
        "the scan restarts"
    );
    assert_eq!(
        count(&db, "SELECT cursor_hot FROM sync_state"),
        40,
        "a cursor never moves forward"
    );
    assert_eq!(count(&db, "SELECT cursor_cold FROM sync_state"), 3);
    assert_eq!(
        count(&db, &format!("SELECT epoch = x'{}' FROM sync_state", second.simple())),
        1
    );

    begin_heal(&db, second, 60, 3, &[(own, 9)]).expect("third heal begins");
    assert_eq!(
        cutoffs(&db),
        vec![(own.as_bytes().to_vec(), 1)],
        "a higher cutoff does not raise it"
    );
}

#[test]
fn neither_a_re_stamp_nor_a_switch_changes_a_re_pushed_stamp() {
    let db = replica();
    let own = device(&db);
    let template = add_template(&db, "Basic");
    FakeSpace::default().push(&db);
    let written = origin(&db, "templates", &template, "create").expect("origin").hlc;
    heal(&db, &[(own, 0)]);
    drain(&db, 100);

    restamp_local_cohorts(&db, 1_900_000_000_000).expect("re-stamp runs");
    let new_device = Uuid::now_v7();
    switch_device(&db, new_device, &[], &starter(), 1_900_000_000_000, false).expect("switch runs");

    let rows = outbox(&db);
    let row = &rows[position(&rows, Kind::Templates, &template, Some(Group::Create))];
    assert_eq!(row.envelope.header.stamp.hlc, written);
    assert_eq!(row.envelope.header.stamp.device.0, *own.as_bytes());
    assert_eq!(
        count(&db, "SELECT COUNT(*) FROM sync_cohorts WHERE state <> 'fixed'"),
        0
    );
    let moved = origin(&db, "templates", &template, "create").expect("origin");
    assert_eq!((moved.sender, moved.sender_seq), (new_device, row.sender_seq));
}

#[test]
fn a_re_bootstrap_keeps_a_create_the_heal_has_not_reached() {
    let db = replica();
    let own = device(&db);
    let algorithm = add_algorithm(&db, "FSRS");
    let template = add_template(&db, "Basic");
    let deck = add_deck(&db, &algorithm, &template, "Spanish");
    FakeSpace::default().push(&db);
    heal(&db, &[(own, seq_of(&db, "templates", &template, "create"))]);

    begin_rebase(&db).expect("re-bootstrap begins");
    finish_rebase(&db, 0, &starter()).expect("re-bootstrap ends");

    assert_eq!(
        count(&db, &format!("SELECT COUNT(*) FROM decks WHERE id = '{deck}'")),
        1
    );
    assert_eq!(
        count(&db, &format!("SELECT COUNT(*) FROM templates WHERE id = '{template}'")),
        0,
        "a create the backup holds and the snapshot lacks is gone, as before"
    );
}

#[test]
fn a_file_waiting_for_add_or_replace_only_takes_the_new_epoch() {
    let db = replica();
    add_template(&db, "Basic");
    koloda::repo::sync::join::begin_import(
        &db,
        Uuid::now_v7(),
        crate::common::sync::SPACE,
        crate::common::sync::EPOCH,
        "https://sync.test",
    )
    .expect("claim records");

    heal(&db, &[]);

    assert_eq!(
        count(&db, "SELECT heal_step IS NULL FROM sync_state"),
        1,
        "no scan starts"
    );
    assert_eq!(
        count(&db, &format!("SELECT epoch = x'{}' FROM sync_state", RESTORED.simple())),
        1
    );
}
