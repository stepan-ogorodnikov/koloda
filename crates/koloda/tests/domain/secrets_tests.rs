//! Secret-store seam contract tests plus one gated real-store smoke test.
//!
//! The default suite is hermetic: the seam tests inject a marker fake through
//! `set_test_secret_store` and never touch the OS credential vault. The smoke
//! test below is the only one that hits real FFI; run it explicitly with
//! `cargo test -p koloda -- --ignored`.

use koloda::app::secrets::{create_secret_store, SecretStore};

// The seam compiles only under `debug_assertions` (see WHY comment in
// `src/app/secrets.rs`), so these tests are gated identically to keep
// `cargo test --release` green.
#[cfg(debug_assertions)]
mod seam {
    use koloda::app::error::AppError;
    use koloda::app::secrets::{get_secret_store, set_test_secret_store, SecretStore};
    use std::sync::{Arc, LazyLock, Mutex, MutexGuard};

    static LOCK: LazyLock<Mutex<()>> = LazyLock::new(|| Mutex::new(()));

    /// Serializes seam tests: each holds the global lock for its duration and
    /// clears the override on drop, so a failing assertion cannot leak state
    /// into the next test.
    struct Guard(#[expect(dead_code, reason = "holds mutex guard for test isolation")] MutexGuard<'static, ()>);

    impl Drop for Guard {
        fn drop(&mut self) {
            set_test_secret_store(None).expect("clear test secret store");
        }
    }

    /// Stateless marker stub: exists only so a test has an `Arc` to compare
    /// against. A distinctive code makes any call-through fail loudly at the
    /// consuming `expect`, proving the wrong store was reached.
    struct MarkerStore;

    const MARKER_CALLED: &str = "test-secrets.marker-store-called";

    fn marker_called() -> AppError {
        AppError::new(
            MARKER_CALLED,
            Some("marker store must never be called through".to_string()),
        )
    }

    impl SecretStore for MarkerStore {
        fn get(&self, _key: &str) -> Result<Option<String>, AppError> {
            Err(marker_called())
        }
        fn set(&self, _key: &str, _value: &str) -> Result<(), AppError> {
            Err(marker_called())
        }
        fn remove(&self, _key: &str) -> Result<(), AppError> {
            Err(marker_called())
        }
    }

    fn install_marker() -> (Guard, Arc<dyn SecretStore>) {
        let guard = Guard(LOCK.lock().unwrap_or_else(|e| e.into_inner()));
        let marker: Arc<dyn SecretStore> = Arc::new(MarkerStore);
        set_test_secret_store(Some(Arc::clone(&marker))).expect("install marker store");
        (guard, marker)
    }

    #[test]
    fn get_secret_store_returns_the_installed_override() {
        let (_guard, marker) = install_marker();

        let resolved = get_secret_store().expect("get_secret_store should resolve");
        assert!(Arc::ptr_eq(&resolved, &marker), "override must be returned as-is");
    }

    #[test]
    fn fallback_after_clear_returns_real_singleton_not_the_override() {
        let (_guard, marker) = install_marker();
        set_test_secret_store(None).expect("clear marker store");

        // Fallback constructs the real store object only; no vault access happens here.
        let first = get_secret_store().expect("first fallback should resolve");
        let second = get_secret_store().expect("second fallback should resolve");

        assert!(
            !Arc::ptr_eq(&first, &marker),
            "cleared override must not leak into fallback"
        );
        assert!(
            Arc::ptr_eq(&first, &second),
            "fallback calls must hit the same REAL_SECRET_STORE singleton"
        );
    }
}

/// Cache-policy tests: `CachedStore` over an instrumented in-memory backend.
/// Hermetic by construction — no OS vault access. `external_write` bypasses the
/// store to simulate another process changing the vault behind our back.
#[cfg(debug_assertions)]
mod cache {
    use koloda::app::error::AppError;
    use koloda::app::secrets::{CachedStore, RawBackend, SecretStore};
    use std::collections::HashMap;
    use std::sync::atomic::{AtomicUsize, Ordering};
    use std::sync::{Arc, Mutex};

    struct FakeInner {
        data: Mutex<HashMap<String, String>>,
        reads: AtomicUsize,
    }

    #[derive(Clone)]
    struct FakeBackend {
        inner: Arc<FakeInner>,
    }

    impl FakeBackend {
        fn new() -> Self {
            Self {
                inner: Arc::new(FakeInner {
                    data: Mutex::new(HashMap::new()),
                    reads: AtomicUsize::new(0),
                }),
            }
        }

        fn store(&self) -> CachedStore<FakeBackend> {
            CachedStore::new(self.clone())
        }

        fn read_count(&self) -> usize {
            self.inner.reads.load(Ordering::SeqCst)
        }

        fn external_write(&self, key: &str, value: &str) {
            self.inner
                .data
                .lock()
                .unwrap_or_else(|e| e.into_inner())
                .insert(key.to_string(), value.to_string());
        }
    }

    impl RawBackend for FakeBackend {
        fn read(&self, key: &str) -> Result<Option<String>, AppError> {
            self.inner.reads.fetch_add(1, Ordering::SeqCst);
            Ok(self
                .inner
                .data
                .lock()
                .unwrap_or_else(|e| e.into_inner())
                .get(key)
                .cloned())
        }

        fn write(&self, key: &str, value: &str) -> Result<(), AppError> {
            self.inner
                .data
                .lock()
                .unwrap_or_else(|e| e.into_inner())
                .insert(key.to_string(), value.to_string());
            Ok(())
        }

        fn delete(&self, key: &str) -> Result<(), AppError> {
            self.inner.data.lock().unwrap_or_else(|e| e.into_inner()).remove(key);
            Ok(())
        }

        fn cache_lock_error(&self) -> AppError {
            AppError::new(
                "test-secrets.cache-lock-poisoned",
                Some("cache lock poisoned".to_string()),
            )
        }
    }

    #[test]
    fn read_through_populates_cache() {
        let backend = FakeBackend::new();
        backend.external_write("k", "v1");
        let store = backend.store();

        assert_eq!(store.get("k").expect("first get"), Some("v1".to_string()));
        assert_eq!(store.get("k").expect("second get"), Some("v1".to_string()));
        assert_eq!(backend.read_count(), 1, "second get must be served from cache");
    }

    // INVARIANT: external vault changes are not observed until process restart
    // (a new store instance starts with a cold cache).
    #[test]
    fn external_change_invisible_until_new_instance() {
        let backend = FakeBackend::new();
        backend.external_write("k", "v1");
        let store = backend.store();
        assert_eq!(store.get("k").expect("prime cache"), Some("v1".to_string()));

        backend.external_write("k", "v2");
        assert_eq!(
            store.get("k").expect("cached get"),
            Some("v1".to_string()),
            "external vault change must not be observed"
        );
        assert_eq!(backend.read_count(), 1);

        let restarted = backend.store();
        assert_eq!(restarted.get("k").expect("cold get"), Some("v2".to_string()));
        assert_eq!(backend.read_count(), 2);
    }

    #[test]
    fn set_updates_cache() {
        let backend = FakeBackend::new();
        let store = backend.store();

        store.set("k", "v1").expect("set");
        backend.external_write("k", "v2");
        assert_eq!(store.get("k").expect("get after set"), Some("v1".to_string()));
        assert_eq!(backend.read_count(), 0, "get after set must not hit the backend");
    }

    #[test]
    fn remove_evicts_cache() {
        let backend = FakeBackend::new();
        let store = backend.store();

        store.set("k", "v1").expect("set");
        assert_eq!(store.get("k").expect("prime"), Some("v1".to_string()));
        store.remove("k").expect("remove");
        backend.external_write("k", "v2");
        assert_eq!(store.get("k").expect("get after remove"), Some("v2".to_string()));
        assert_eq!(backend.read_count(), 1, "evicted key must be re-read from the backend");
    }

    #[test]
    fn miss_is_not_cached() {
        let backend = FakeBackend::new();
        let store = backend.store();

        assert_eq!(store.get("k").expect("absent get"), None);
        backend.external_write("k", "v1");
        assert_eq!(
            store.get("k").expect("get after external insert"),
            Some("v1".to_string())
        );
        assert_eq!(backend.read_count(), 2, "misses must not be cached");
    }
}

/// Manual purge if this key ever strands: Windows Credential Manager target
/// "koloda-test-smoke:smoke-key"; other platforms service "koloda-test-smoke",
/// entry "smoke-key".
const SERVICE: &str = "koloda-test-smoke";
const KEY: &str = "smoke-key";

#[ignore = "writes a real OS credential; run explicitly"]
#[test]
fn real_store_smoke_set_get_overwrite_remove() {
    let store = create_secret_store(SERVICE);

    // Cleanup layer 1 (entry): recovers a key stranded by an earlier killed run
    // (no unwind happened) and makes "vault lacks this key" an explicit fixture
    // precondition. Delete-of-absent maps to Ok on both real stores.
    store.remove(KEY).expect("entry cleanup remove");

    // Cleanup layer 2 (drop): removes the key even when an assertion panics and
    // the unwind runs.
    struct RemoveOnDrop<'a>(&'a dyn SecretStore);
    impl Drop for RemoveOnDrop<'_> {
        fn drop(&mut self) {
            if let Err(cleanup_err) = self.0.remove(KEY) {
                eprintln!("smoke-test cleanup remove failed: {}", cleanup_err);
            }
        }
    }
    let _cleanup = RemoveOnDrop(&*store);

    // Smokes the not-found mapping branch: ERROR_NOT_FOUND / NoEntry -> Ok(None).
    assert_eq!(store.get(KEY).expect("get on absent key"), None);

    store.set(KEY, "v1").expect("set should work");
    assert_eq!(store.get(KEY).expect("get should work"), Some("v1".to_string()));

    store.set(KEY, "v2").expect("overwrite set should work");
    assert_eq!(store.get(KEY).expect("get after overwrite"), Some("v2".to_string()));

    // The reads above are served by the first store's per-process cache; a second
    // instance has a cold cache, forcing a real FFI found-read (blob decode).
    let cold_reader = create_secret_store(SERVICE);
    assert_eq!(
        cold_reader.get(KEY).expect("cache-miss get after overwrite"),
        Some("v2".to_string())
    );

    store.remove(KEY).expect("remove should work");
    assert_eq!(store.get(KEY).expect("get after remove"), None);
}
