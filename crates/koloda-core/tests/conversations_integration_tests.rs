use koloda_core::domain::conversations::Conversation;
use koloda_core::repo::conversations as repo;
use serde_json::json;

mod common;
use common::fixtures::add_conversation;
use common::test_db;

fn set(
    db: &koloda_core::app::db::Database,
    id: &str,
    state: serde_json::Value,
) -> Result<Conversation, koloda_core::app::error::AppError> {
    repo::set_conversation(
        db,
        repo::SetConversationInput {
            id: id.to_string(),
            state,
            title: None,
            updated_at: None,
        },
    )
}

// ============================================================================
// SET CONVERSATION
// ============================================================================

#[test]
fn set_conversation_inserts_new_row_with_timestamps() {
    let db = test_db();
    let before = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .expect("clock should be after unix epoch")
        .as_millis() as i64;

    let id = add_conversation(&db, "conv-1", json!({"messages": []}));

    let after = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .expect("clock should be after unix epoch")
        .as_millis() as i64;

    let stored = repo::get_conversation(&db, &id)
        .expect("query should succeed")
        .expect("conversation should exist");

    assert_eq!(stored.id, "conv-1");
    assert_eq!(stored.state, json!({"messages": []}));
    assert!(
        stored.created_at >= before && stored.created_at <= after,
        "created_at should fall within [before, after] (handles backward NTP jumps)"
    );
    assert!(
        stored.updated_at.is_some(),
        "updated_at should be stamped on initial insert (sidebar sort key)"
    );
    let updated_at = stored.updated_at.unwrap();
    assert!(
        updated_at >= before && updated_at <= after,
        "updated_at should fall within [before, after] when omitted on insert"
    );
    assert!(stored.title.is_none(), "title should be NULL on initial insert");
}

#[test]
fn set_conversation_upserts_existing_row_and_advances_updated_at() {
    let db = test_db();
    let id = "conv-upsert";

    let initial = repo::set_conversation(
        &db,
        repo::SetConversationInput {
            id: id.to_string(),
            state: json!({"version": 1}),
            title: None,
            updated_at: None,
        },
    )
    .expect("initial insert should succeed");
    assert!(initial.updated_at.is_some(), "updated_at is stamped on insert");
    let initial_updated_at = initial.updated_at.unwrap();

    // 50ms exceeds the default Windows timer resolution (~15ms), guaranteeing
    // a strictly later timestamp on every platform.
    std::thread::sleep(std::time::Duration::from_millis(50));

    let updated = repo::set_conversation(
        &db,
        repo::SetConversationInput {
            id: id.to_string(),
            state: json!({"version": 2}),
            title: None,
            updated_at: None,
        },
    )
    .expect("upsert should succeed");

    assert_eq!(updated.id, id);
    assert_eq!(updated.state, json!({"version": 2}));
    assert!(updated.updated_at.is_some(), "updated_at should be set after upsert");
    assert!(
        updated.updated_at.unwrap() > initial_updated_at,
        "updated_at should advance past the original insert stamp"
    );
}

#[test]
fn set_conversation_preserves_created_at_on_update() {
    let db = test_db();
    let id = "conv-preserve";

    let initial = set(&db, id, json!({"v": 1})).expect("initial insert should succeed");
    let original_created_at = initial.created_at;

    std::thread::sleep(std::time::Duration::from_millis(50));

    let updated = set(&db, id, json!({"v": 2})).expect("upsert should succeed");

    assert_eq!(
        updated.created_at, original_created_at,
        "created_at should be preserved across upsert"
    );
    assert!(
        updated.updated_at.unwrap() > original_created_at,
        "updated_at should advance past created_at"
    );
}

#[test]
fn set_conversation_with_explicit_updated_at_preserves_timestamp() {
    let db = test_db();
    let id = "conv-explicit-updated";

    // An arbitrary historical timestamp that the caller wants to keep —
    // including on the *first* insert (sidebar order on first message save).
    let provided = 1_700_000_000_123_i64;

    let stored = repo::set_conversation(
        &db,
        repo::SetConversationInput {
            id: id.to_string(),
            state: json!({"v": 1}),
            title: None,
            updated_at: Some(provided),
        },
    )
    .expect("insert with explicit updated_at should succeed");

    assert_eq!(
        stored.updated_at,
        Some(provided),
        "explicit updated_at should be persisted as-is on insert"
    );

    // A follow-up save without an updated_at should still bump it via the
    // server-side fallback.
    std::thread::sleep(std::time::Duration::from_millis(50));
    let _ = set(&db, id, json!({"v": 2})).expect("follow-up upsert should succeed");

    let after = repo::get_conversation(&db, id)
        .expect("query should succeed")
        .expect("conversation should exist");
    assert!(
        after.updated_at.unwrap() > provided,
        "missing updated_at should fall back to the current time"
    );
}

#[test]
fn set_conversation_insert_with_explicit_updated_at_sorts_to_top() {
    let db = test_db();

    // Older conversations stamped earlier.
    let _ = repo::set_conversation(
        &db,
        repo::SetConversationInput {
            id: "older".to_string(),
            state: json!({}),
            title: None,
            updated_at: Some(1_700_000_000_000),
        },
    )
    .expect("older insert should succeed");

    // First message save for a brand-new conversation: pass the run-start
    // stamp so the row appears at the top immediately (not after a later upsert).
    let newer_stamp = 1_700_000_100_000_i64;
    let _ = repo::set_conversation(
        &db,
        repo::SetConversationInput {
            id: "brand-new".to_string(),
            state: json!({"messages": ["hi"]}),
            title: Some("hi".to_string()),
            updated_at: Some(newer_stamp),
        },
    )
    .expect("brand-new insert should succeed");

    let result = repo::get_conversations(&db).expect("query should succeed");
    assert_eq!(result.len(), 2);
    assert_eq!(
        result[0].id, "brand-new",
        "first insert with explicit updated_at must sort ahead of older rows"
    );
    assert_eq!(result[0].updated_at, Some(newer_stamp));
    assert_eq!(result[1].id, "older");
}

#[test]
fn set_conversation_persists_complex_state_payload() {
    let db = test_db();
    let state = json!({
        "messages": [
            {"role": "user", "content": "Hello"},
            {"role": "assistant", "content": "Hi there"},
        ],
        "metadata": {"model": "test", "tokens": 42, "draft": null},
        "tags": ["a", "b", "c"],
    });

    let stored = set(&db, "conv-complex", state.clone()).expect("set should succeed");

    assert_eq!(stored.state, state);

    let fetched = repo::get_conversation(&db, "conv-complex")
        .expect("query should succeed")
        .expect("conversation should exist");
    assert_eq!(fetched.state, state);
}

#[test]
fn set_conversation_accepts_null_state_payload() {
    let db = test_db();
    let stored = set(&db, "conv-null", serde_json::Value::Null).expect("null state should be accepted");

    assert_eq!(stored.state, serde_json::Value::Null);
}

// ============================================================================
// GET CONVERSATION
// ============================================================================

#[test]
fn get_conversation_returns_none_for_missing_id() {
    let db = test_db();
    let result = repo::get_conversation(&db, "does-not-exist").expect("query should succeed");

    assert!(result.is_none());
}

#[test]
fn get_conversation_returns_some_for_existing_id() {
    let db = test_db();
    let id = add_conversation(&db, "conv-get", json!({"k": "v"}));

    let result = repo::get_conversation(&db, &id)
        .expect("query should succeed")
        .expect("conversation should exist");

    assert_eq!(result.id, id);
    assert_eq!(result.state, json!({"k": "v"}));
}

// ============================================================================
// GET CONVERSATIONS
// ============================================================================

#[test]
fn get_conversations_returns_empty_list_when_table_empty() {
    let db = test_db();
    let result = repo::get_conversations(&db).expect("query should succeed");
    assert!(result.is_empty());
}

#[test]
fn get_conversations_returns_all_rows() {
    let db = test_db();
    add_conversation(&db, "conv-a", json!({"a": 1}));
    add_conversation(&db, "conv-b", json!({"b": 2}));
    add_conversation(&db, "conv-c", json!({"c": 3}));

    let result = repo::get_conversations(&db).expect("query should succeed");

    assert_eq!(result.len(), 3);
    let ids: Vec<&str> = result.iter().map(|c| c.id.as_str()).collect();
    assert!(ids.contains(&"conv-a"));
    assert!(ids.contains(&"conv-b"));
    assert!(ids.contains(&"conv-c"));
}

#[test]
fn get_conversations_orders_by_updated_at_desc_then_created_at_desc() {
    let db = test_db();

    let older = set(&db, "older", json!({"v": 1})).expect("insert should succeed");

    // Ensure a strictly later created_at (50ms exceeds Windows ~15ms timer resolution).
    std::thread::sleep(std::time::Duration::from_millis(50));

    let newer = set(&db, "newer", json!({"v": 1})).expect("insert should succeed");
    assert!(newer.created_at > older.created_at);

    std::thread::sleep(std::time::Duration::from_millis(50));

    // Touch the older conversation: it should now have an updated_at and jump
    // to the front of the order.
    let touched = set(&db, "older", json!({"v": 2})).expect("upsert should succeed");
    assert!(touched.updated_at.is_some());

    let result = repo::get_conversations(&db).expect("query should succeed");

    assert_eq!(result.len(), 2);
    assert_eq!(result[0].id, "older", "touched row should be first (updated_at DESC)");
    assert_eq!(result[1].id, "newer");
}

#[test]
fn get_conversations_groups_rows_with_null_updated_at_after_touched_rows() {
    let db = test_db();

    // Seed a legacy/untouched row with NULL updated_at via raw SQL — normal
    // set_conversation inserts always stamp updated_at now.
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .expect("clock should be after unix epoch")
        .as_millis() as i64;
    db.with_conn(|conn| {
        conn.execute(
            "INSERT INTO conversations (id, state, created_at, updated_at) VALUES (?1, ?2, ?3, NULL)",
            rusqlite::params!["untouched", "{}", now + 50],
        )?;
        Ok(())
    })
    .expect("raw insert should succeed");

    std::thread::sleep(std::time::Duration::from_millis(50));
    let _touched = set(&db, "touched", json!({"v": 1})).expect("insert should succeed");

    let result = repo::get_conversations(&db).expect("query should succeed");
    assert_eq!(result.len(), 2);
    assert_eq!(result[0].id, "touched");
    assert_eq!(result[1].id, "untouched");
    assert!(result[1].updated_at.is_none());
}

// ============================================================================
// TITLE COLUMN
// ============================================================================

#[test]
fn set_conversation_persists_explicit_title() {
    let db = test_db();
    let stored = repo::set_conversation(
        &db,
        repo::SetConversationInput {
            id: "conv-titled".to_string(),
            state: json!({"messages": []}),
            title: Some("My conversation".to_string()),
            updated_at: None,
        },
    )
    .expect("set should succeed");

    assert_eq!(stored.title.as_deref(), Some("My conversation"));

    let loaded = repo::get_conversation(&db, "conv-titled")
        .expect("query should succeed")
        .expect("conversation should exist");
    assert_eq!(loaded.title.as_deref(), Some("My conversation"));
}

#[test]
fn set_conversation_omitted_title_stores_null() {
    let db = test_db();
    let stored = set(&db, "conv-no-title", json!({"messages": []})).expect("set should succeed");
    assert!(stored.title.is_none(), "omitted title should store NULL");
}

#[test]
fn set_conversation_upsert_replaces_title() {
    let db = test_db();
    let id = "conv-rename";

    repo::set_conversation(
        &db,
        repo::SetConversationInput {
            id: id.to_string(),
            state: json!({"v": 1}),
            title: Some("Old title".to_string()),
            updated_at: None,
        },
    )
    .expect("initial insert should succeed");

    let updated = repo::set_conversation(
        &db,
        repo::SetConversationInput {
            id: id.to_string(),
            state: json!({"v": 2}),
            title: Some("New title".to_string()),
            updated_at: None,
        },
    )
    .expect("upsert should succeed");

    assert_eq!(updated.title.as_deref(), Some("New title"));
}

#[test]
fn set_conversation_upsert_can_clear_title_with_null() {
    let db = test_db();
    let id = "conv-clear";

    repo::set_conversation(
        &db,
        repo::SetConversationInput {
            id: id.to_string(),
            state: json!({}),
            title: Some("Has title".to_string()),
            updated_at: None,
        },
    )
    .expect("initial insert should succeed");

    let updated = repo::set_conversation(
        &db,
        repo::SetConversationInput {
            id: id.to_string(),
            state: json!({}),
            title: None,
            updated_at: None,
        },
    )
    .expect("upsert should succeed");

    assert!(
        updated.title.is_none(),
        "title should be cleared when explicitly set to None"
    );
}

#[test]
fn get_conversations_returns_title_on_each_row() {
    let db = test_db();

    repo::set_conversation(
        &db,
        repo::SetConversationInput {
            id: "with-title".to_string(),
            state: json!({}),
            title: Some("Titled".to_string()),
            updated_at: None,
        },
    )
    .expect("set should succeed");

    set(&db, "without-title", json!({})).expect("set should succeed");

    let list = repo::get_conversations(&db).expect("query should succeed");
    assert_eq!(list.len(), 2);

    let titled = list.iter().find(|c| c.id == "with-title").expect("row should exist");
    let untitled = list.iter().find(|c| c.id == "without-title").expect("row should exist");

    assert_eq!(titled.title.as_deref(), Some("Titled"));
    assert!(untitled.title.is_none());
}

// ============================================================================
// DELETE CONVERSATION
// ============================================================================

#[test]
fn delete_conversation_removes_row() {
    let db = test_db();
    let id = add_conversation(&db, "conv-del", json!({"x": 1}));

    let before = repo::get_conversation(&db, &id)
        .expect("query should succeed")
        .expect("conversation should exist before delete");
    assert_eq!(before.id, id);

    repo::delete_conversation(&db, &id).expect("delete should succeed");

    let after = repo::get_conversation(&db, &id).expect("query should succeed");
    assert!(after.is_none(), "conversation should be gone after delete");

    let all = repo::get_conversations(&db).expect("query should succeed");
    assert!(all.is_empty(), "table should be empty after delete");
}

#[test]
fn delete_conversation_is_noop_for_missing_id() {
    let db = test_db();
    add_conversation(&db, "conv-keep", json!({}));

    let result = repo::delete_conversation(&db, "does-not-exist");
    assert!(result.is_ok(), "deleting a missing id should not error");

    let all = repo::get_conversations(&db).expect("query should succeed");
    assert_eq!(all.len(), 1);
    assert_eq!(all[0].id, "conv-keep");
}

#[test]
fn delete_conversation_only_removes_targeted_row() {
    let db = test_db();
    add_conversation(&db, "conv-1", json!({}));
    add_conversation(&db, "conv-2", json!({}));
    add_conversation(&db, "conv-3", json!({}));

    repo::delete_conversation(&db, "conv-2").expect("delete should succeed");

    let ids: Vec<String> = repo::get_conversations(&db)
        .expect("query should succeed")
        .into_iter()
        .map(|c: Conversation| c.id)
        .collect();

    assert_eq!(ids.len(), 2);
    assert!(ids.contains(&"conv-1".to_string()));
    assert!(ids.contains(&"conv-3".to_string()));
    assert!(!ids.contains(&"conv-2".to_string()));
}

#[test]
fn unconditional_upsert_recreates_row_after_delete() {
    let db = test_db();
    let id = "conv-upsert-after-delete";
    let state = json!({
        "id": id,
        "createdAt": 1_700_000_000_000_i64,
        "messages": [{
            "id": "msg-1",
            "role": "user",
            "parts": [{ "type": "text", "text": "hello" }]
        }],
        "runs": {},
        "activeRunId": null,
        "mode": "chat",
        "deckId": null,
    });

    set(&db, id, state.clone()).expect("initial set should succeed");
    repo::delete_conversation(&db, id).expect("delete should succeed");
    assert!(
        repo::get_conversation(&db, id).expect("query should succeed").is_none(),
        "row should be gone after delete"
    );

    // WHY: both PGlite and SQLite repos use unconditional on-conflict upsert.
    // A save that passed an in-memory existence check can recreate the row
    // after delete unless the persistence coordinator tombstones/awaits first.
    set(&db, id, state).expect("upsert after delete should succeed");
    assert!(
        repo::get_conversation(&db, id).expect("query should succeed").is_some(),
        "unconditional upsert recreates the row"
    );
}

#[test]
fn delayed_write_that_respects_tombstone_after_delete_does_not_resurrect_row() {
    use std::sync::atomic::{AtomicBool, Ordering};
    use std::sync::mpsc::sync_channel;
    use std::sync::Arc;

    let db = test_db();
    let id = "conv-delayed-write-delete";
    let state_v1 = json!({
        "id": id,
        "createdAt": 1_700_000_000_000_i64,
        "messages": [{
            "id": "msg-1",
            "role": "user",
            "parts": [{ "type": "text", "text": "v1" }]
        }],
        "runs": {},
        "activeRunId": null,
        "mode": "chat",
        "deckId": null,
    });
    let state_v2 = json!({
        "id": id,
        "createdAt": 1_700_000_000_000_i64,
        "messages": [{
            "id": "msg-1",
            "role": "user",
            "parts": [{ "type": "text", "text": "v2" }]
        }],
        "runs": {},
        "activeRunId": null,
        "mode": "chat",
        "deckId": null,
    });

    set(&db, id, state_v1).expect("initial set should succeed");

    let (release_tx, release_rx) = sync_channel::<()>(0);
    let tombstoned = Arc::new(AtomicBool::new(false));
    let tombstoned_for_write = Arc::clone(&tombstoned);
    let db_for_write = db.clone();
    let id_owned = id.to_string();

    // WHY: mirrors prepareDelete ordering — tombstone, delete, then resume a
    // write that already passed the in-memory existence check.
    let delayed = std::thread::spawn(move || {
        release_rx.recv().expect("gate should release");
        if !tombstoned_for_write.load(Ordering::SeqCst) {
            set(&db_for_write, &id_owned, state_v2).expect("delayed set should succeed");
        }
    });

    tombstoned.store(true, Ordering::SeqCst);
    repo::delete_conversation(&db, id).expect("delete should succeed");
    release_tx.send(()).expect("gate should open");
    delayed.join().expect("delayed write thread should finish");

    assert!(
        repo::get_conversation(&db, id).expect("query should succeed").is_none(),
        "tombstoned delayed write must not resurrect the row"
    );
}

// ============================================================================
// REPO RETURN TYPE SHAPE
// ============================================================================

#[test]
fn get_conversation_row_failure_on_invalid_state_json() {
    // `get_conversation` should surface an error (not silently swallow) when
    // the `state` column contains something that is not valid JSON.
    let db = test_db();

    db.with_conn(|conn| {
        conn.execute(
            "INSERT INTO conversations (id, state, created_at, updated_at) VALUES (?1, ?2, ?3, NULL)",
            rusqlite::params!["broken", "not-valid-json{", 1_700_000_000_000_i64],
        )?;
        Ok(())
    })
    .expect("row should insert with raw text in state column");

    let result = repo::get_conversation(&db, "broken");
    assert!(
        result.is_err(),
        "malformed state JSON should produce an error, not a silent success"
    );
}
