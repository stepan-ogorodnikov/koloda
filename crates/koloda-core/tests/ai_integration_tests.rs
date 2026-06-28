use koloda_core::domain::ai::AISecrets;
use koloda_core::repo::ai;

mod common;
use common::test_db;

mod test_store {
    use koloda_core::app::error::AppError;
    use koloda_core::app::secrets::{set_test_secret_store, SecretStore};
    use std::collections::HashMap;
    use std::sync::{Arc, Mutex};

    static LOCK: std::sync::LazyLock<std::sync::Mutex<()>> = std::sync::LazyLock::new(|| std::sync::Mutex::new(()));

    #[derive(Default)]
    pub struct MockSecretStore {
        data: Arc<Mutex<HashMap<String, String>>>,
    }

    impl SecretStore for MockSecretStore {
        fn get(&self, key: &str) -> Result<Option<String>, AppError> {
            Ok(self.data.lock().unwrap().get(key).cloned())
        }

        fn set(&self, key: &str, value: &str) -> Result<(), AppError> {
            self.data.lock().unwrap().insert(key.to_string(), value.to_string());
            Ok(())
        }

        fn remove(&self, key: &str) -> Result<(), AppError> {
            self.data.lock().unwrap().remove(key);
            Ok(())
        }
    }

    impl MockSecretStore {
        pub fn new() -> Self {
            Self::default()
        }

        pub fn into_box(self) -> Box<dyn SecretStore> {
            Box::new(self)
        }
    }

    pub struct Guard(#[allow(dead_code)] std::sync::MutexGuard<'static, ()>);

    pub fn setup() -> Guard {
        let guard = LOCK.lock().unwrap_or_else(|e| e.into_inner());
        let store = MockSecretStore::new().into_box();
        set_test_secret_store(Some(store));
        Guard(guard)
    }

    pub fn teardown(_guard: Guard) {
        set_test_secret_store(None);
    }
}

#[test]
fn ai_profiles_add_get_and_remove() {
    let _guard = test_store::setup();
    let db = test_db();

    let added = ai::add_ai_profile(
        &db,
        Some("Local model".to_string()),
        Some(AISecrets::Ollama {
            base_url: "http://localhost:11434".to_string(),
            api_key: None,
        }),
    )
    .expect("profile should be added");

    assert_eq!(added.title, Some("Local model".to_string()));
    assert!(!added.id.is_empty());

    let all = ai::get_ai_profiles(&db).expect("should get profiles");
    assert_eq!(all.len(), 1);
    assert_eq!(all[0].id, added.id);

    ai::remove_ai_profile(&db, &added.id).expect("should remove profile");

    let after_remove = ai::get_ai_profiles(&db).expect("should get profiles after remove");
    assert!(after_remove.is_empty());

    test_store::teardown(_guard);
}

#[test]
fn ai_profile_api_key_is_stored_in_secret_store() {
    let _guard = test_store::setup();
    let db = test_db();

    let profile = ai::add_ai_profile(
        &db,
        Some("Test".to_string()),
        Some(AISecrets::OpenRouter {
            api_key: "sk-secret-key".to_string(),
        }),
    )
    .expect("profile should be added");

    let all = ai::get_ai_profiles(&db).expect("should get profiles");
    let retrieved = all.iter().find(|p| p.id == profile.id).expect("profile should exist");

    assert!(matches!(retrieved.secrets, Some(AISecrets::OpenRouter { .. })));

    test_store::teardown(_guard);
}

#[test]
fn ai_profile_codex_round_trips_without_secret_store_data() {
    let _guard = test_store::setup();
    let db = test_db();

    let added =
        ai::add_ai_profile(&db, Some("Codex".to_string()), Some(AISecrets::Codex {})).expect("profile should be added");

    let all = ai::get_ai_profiles(&db).expect("should get profiles");
    let retrieved = all.iter().find(|p| p.id == added.id).expect("profile should exist");

    assert!(matches!(retrieved.secrets, Some(AISecrets::Codex { .. })));

    test_store::teardown(_guard);
}

#[test]
fn ai_profile_opencode_go_round_trips_via_secret_store() {
    let _guard = test_store::setup();
    let db = test_db();

    let added = ai::add_ai_profile(
        &db,
        Some("OpenCode Go".to_string()),
        Some(AISecrets::OpencodeGo {
            api_key: "go-secret-key".to_string(),
        }),
    )
    .expect("profile should be added");

    let all = ai::get_ai_profiles(&db).expect("should get profiles");
    let retrieved = all.iter().find(|p| p.id == added.id).expect("profile should exist");

    match retrieved.secrets.as_ref() {
        Some(AISecrets::OpencodeGo { api_key }) => assert_eq!(api_key, "go-secret-key"),
        other => panic!("expected OpencodeGo secrets, got {:?}", other),
    }

    test_store::teardown(_guard);
}

#[test]
fn ai_profile_opencode_zen_round_trips_via_secret_store() {
    let _guard = test_store::setup();
    let db = test_db();

    let added = ai::add_ai_profile(
        &db,
        Some("OpenCode Zen".to_string()),
        Some(AISecrets::OpencodeZen {
            api_key: "zen-secret-key".to_string(),
        }),
    )
    .expect("profile should be added");

    let all = ai::get_ai_profiles(&db).expect("should get profiles");
    let retrieved = all.iter().find(|p| p.id == added.id).expect("profile should exist");

    match retrieved.secrets.as_ref() {
        Some(AISecrets::OpencodeZen { api_key }) => assert_eq!(api_key, "zen-secret-key"),
        other => panic!("expected OpencodeZen secrets, got {:?}", other),
    }

    test_store::teardown(_guard);
}
