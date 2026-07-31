use koloda_core::app::secrets::get_secret_store;
use koloda_core::domain::ai::AISecrets;
use koloda_core::repo::ai;
use std::sync::Arc;

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

        pub fn into_arc(self) -> Arc<dyn SecretStore> {
            Arc::new(self)
        }
    }

    pub struct FailingGetSecretStore;

    impl SecretStore for FailingGetSecretStore {
        fn get(&self, _key: &str) -> Result<Option<String>, AppError> {
            Err(AppError::new("keyring", Some("simulated keyring failure".to_string())))
        }
        fn set(&self, _key: &str, _value: &str) -> Result<(), AppError> {
            Ok(())
        }
        fn remove(&self, _key: &str) -> Result<(), AppError> {
            Ok(())
        }
    }

    pub struct FailingSetSecretStore {
        data: Arc<Mutex<HashMap<String, String>>>,
    }

    impl FailingSetSecretStore {
        pub fn new(data: Arc<Mutex<HashMap<String, String>>>) -> Self {
            Self { data }
        }

        pub fn into_arc(self) -> Arc<dyn SecretStore> {
            Arc::new(self)
        }
    }

    impl SecretStore for FailingSetSecretStore {
        fn get(&self, key: &str) -> Result<Option<String>, AppError> {
            Ok(self.data.lock().unwrap().get(key).cloned())
        }
        fn set(&self, _key: &str, _value: &str) -> Result<(), AppError> {
            Err(AppError::new(
                "keyring",
                Some("simulated keyring set failure".to_string()),
            ))
        }
        fn remove(&self, key: &str) -> Result<(), AppError> {
            self.data.lock().unwrap().remove(key);
            Ok(())
        }
    }

    pub struct FailingRemoveSecretStore {
        data: Arc<Mutex<HashMap<String, String>>>,
    }

    impl FailingRemoveSecretStore {
        pub fn new(data: Arc<Mutex<HashMap<String, String>>>) -> Self {
            Self { data }
        }

        pub fn into_arc(self) -> Arc<dyn SecretStore> {
            Arc::new(self)
        }
    }

    impl SecretStore for FailingRemoveSecretStore {
        fn get(&self, key: &str) -> Result<Option<String>, AppError> {
            Ok(self.data.lock().unwrap().get(key).cloned())
        }
        fn set(&self, key: &str, value: &str) -> Result<(), AppError> {
            self.data.lock().unwrap().insert(key.to_string(), value.to_string());
            Ok(())
        }
        fn remove(&self, _key: &str) -> Result<(), AppError> {
            Err(AppError::new(
                "keyring",
                Some("simulated keyring remove failure".to_string()),
            ))
        }
    }

    pub fn setup_failing_store() -> Guard {
        let guard = LOCK.lock().unwrap_or_else(|e| e.into_inner());
        let store: Arc<dyn SecretStore> = Arc::new(FailingGetSecretStore);
        set_test_secret_store(Some(store)).expect("set test secret store");
        Guard(guard)
    }

    pub fn setup_failing_set_store() -> Guard {
        let guard = LOCK.lock().unwrap_or_else(|e| e.into_inner());
        let store = FailingSetSecretStore::new(Arc::new(Mutex::new(HashMap::new()))).into_arc();
        set_test_secret_store(Some(store)).expect("set test secret store");
        Guard(guard)
    }

    pub struct Guard(#[allow(dead_code)] std::sync::MutexGuard<'static, ()>);

    pub fn setup() -> Guard {
        let guard = LOCK.lock().unwrap_or_else(|e| e.into_inner());
        let store = MockSecretStore::new().into_arc();
        set_test_secret_store(Some(store)).expect("set test secret store");
        Guard(guard)
    }

    pub fn setup_shared() -> (Guard, Arc<Mutex<HashMap<String, String>>>) {
        let guard = LOCK.lock().unwrap_or_else(|e| e.into_inner());
        let data = Arc::new(Mutex::new(HashMap::new()));
        let store = MockSecretStore {
            data: Arc::clone(&data),
        }
        .into_arc();
        set_test_secret_store(Some(store)).expect("set test secret store");
        (Guard(guard), data)
    }

    pub fn replace_store(store: Arc<dyn SecretStore>) {
        set_test_secret_store(Some(store)).expect("set test secret store");
    }

    pub fn teardown(_guard: Guard) {
        set_test_secret_store(None).expect("clear test secret store");
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

#[test]
fn update_ai_profile_clears_stale_keyring_key_when_new_secrets_have_no_key() {
    let _guard = test_store::setup();
    let db = test_db();

    let added = ai::add_ai_profile(
        &db,
        Some("OpenRouter".to_string()),
        Some(AISecrets::OpenRouter {
            api_key: "sk-original-key".to_string(),
        }),
    )
    .expect("profile should be added");
    let store_key = format!("ai-profile-{}", added.id);

    assert_eq!(
        get_secret_store()
            .expect("get secret store")
            .get(&store_key)
            .expect("read keyring"),
        Some("sk-original-key".to_string()),
        "key should be stored after add"
    );

    let updated = ai::update_ai_profile(
        &db,
        &added.id,
        Some("Local model".to_string()),
        Some(AISecrets::Ollama {
            base_url: "http://localhost:11434".to_string(),
            api_key: None,
        }),
    )
    .expect("profile should be updated");

    assert_eq!(
        get_secret_store()
            .expect("get secret store")
            .get(&store_key)
            .expect("read keyring"),
        None,
        "old key must be cleared after updating to a no-key variant"
    );

    let all = ai::get_ai_profiles(&db).expect("should get profiles");
    let retrieved = all.iter().find(|p| p.id == added.id).expect("profile should exist");
    match retrieved.secrets.as_ref() {
        Some(AISecrets::Ollama { api_key, .. }) => {
            assert!(api_key.is_none(), "no old key should leak back into the profile");
        }
        other => panic!("expected Ollama secrets after update, got {:?}", other),
    }

    match updated.secrets.as_ref() {
        Some(AISecrets::Ollama { api_key, .. }) => {
            assert!(
                api_key.is_none(),
                "returned updated profile should not carry the old key"
            );
        }
        other => panic!("expected Ollama secrets in update return, got {:?}", other),
    }

    test_store::teardown(_guard);
}

#[test]
fn get_ai_profiles_propagates_keyring_error_instead_of_swallowing_it() {
    // WHY: stage a profile under a working store first; otherwise the failing
    // get_api_key in get_ai_profiles is never reached and the test passes
    // vacuously.
    let guard = test_store::setup();
    let db = test_db();
    ai::add_ai_profile(
        &db,
        Some("OpenRouter".to_string()),
        Some(AISecrets::OpenRouter {
            api_key: "sk-secret-key".to_string(),
        }),
    )
    .expect("profile should be added under working store");
    test_store::teardown(guard);

    let guard = test_store::setup_failing_store();
    let result = ai::get_ai_profiles(&db);

    let err = result.expect_err("get_ai_profiles must propagate keyring errors, not swallow as None");
    assert_eq!(err.code, "keyring", "the keyring error code must be preserved");

    test_store::teardown(guard);
}

#[test]
fn add_ai_profile_rolls_back_settings_when_keyring_set_fails() {
    let _guard = test_store::setup_failing_set_store();
    let db = test_db();

    let err = ai::add_ai_profile(
        &db,
        Some("OpenRouter".to_string()),
        Some(AISecrets::OpenRouter {
            api_key: "sk-secret-key".to_string(),
        }),
    )
    .expect_err("add must fail when keyring set fails");
    assert_eq!(err.code, "keyring");

    let profiles = ai::get_ai_profiles(&db).expect("settings read should still work");
    assert!(profiles.is_empty(), "failed add must not leave a profile in settings");

    test_store::teardown(_guard);
}

#[test]
fn update_ai_profile_rolls_back_settings_when_keyring_set_fails() {
    let (guard, data) = test_store::setup_shared();
    let db = test_db();

    let added = ai::add_ai_profile(
        &db,
        Some("OpenRouter".to_string()),
        Some(AISecrets::OpenRouter {
            api_key: "sk-original-key".to_string(),
        }),
    )
    .expect("profile should be added");

    test_store::replace_store(test_store::FailingSetSecretStore::new(Arc::clone(&data)).into_arc());

    let err = ai::update_ai_profile(
        &db,
        &added.id,
        Some("Renamed".to_string()),
        Some(AISecrets::OpenRouter {
            api_key: "sk-new-key".to_string(),
        }),
    )
    .expect_err("update must fail when keyring set fails");
    assert_eq!(err.code, "keyring");

    let profiles = ai::get_ai_profiles(&db).expect("should get profiles");
    let retrieved = profiles
        .iter()
        .find(|p| p.id == added.id)
        .expect("profile should remain");
    assert_eq!(retrieved.title, Some("OpenRouter".to_string()));
    match retrieved.secrets.as_ref() {
        Some(AISecrets::OpenRouter { api_key }) => assert_eq!(api_key, "sk-original-key"),
        other => panic!("expected original OpenRouter secrets after rollback, got {:?}", other),
    }

    test_store::teardown(guard);
}

#[test]
fn update_ai_profile_rolls_back_settings_when_keyring_remove_fails() {
    let (guard, data) = test_store::setup_shared();
    let db = test_db();

    let added = ai::add_ai_profile(
        &db,
        Some("OpenRouter".to_string()),
        Some(AISecrets::OpenRouter {
            api_key: "sk-original-key".to_string(),
        }),
    )
    .expect("profile should be added");

    test_store::replace_store(test_store::FailingRemoveSecretStore::new(Arc::clone(&data)).into_arc());

    let err = ai::update_ai_profile(
        &db,
        &added.id,
        Some("Local model".to_string()),
        Some(AISecrets::Ollama {
            base_url: "http://localhost:11434".to_string(),
            api_key: None,
        }),
    )
    .expect_err("update must fail when keyring remove fails");
    assert_eq!(err.code, "keyring");

    let profiles = ai::get_ai_profiles(&db).expect("should get profiles");
    let retrieved = profiles
        .iter()
        .find(|p| p.id == added.id)
        .expect("profile should remain");
    assert_eq!(retrieved.title, Some("OpenRouter".to_string()));
    match retrieved.secrets.as_ref() {
        Some(AISecrets::OpenRouter { api_key }) => assert_eq!(api_key, "sk-original-key"),
        other => panic!("expected original OpenRouter secrets after rollback, got {:?}", other),
    }

    test_store::teardown(guard);
}
