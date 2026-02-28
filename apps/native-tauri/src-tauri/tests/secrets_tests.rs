use koloda_native_tauri::app::secrets::{create_secret_store, SecretStore};
use std::sync::{Arc, Barrier};
use std::thread;
use std::time::{SystemTime, UNIX_EPOCH};

fn unique_service_name(prefix: &str) -> String {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("Clock went backwards")
        .as_nanos();
    format!("{}-{}-{}", prefix, std::process::id(), nanos)
}

fn cleanup_key(store: &dyn SecretStore, key: &str) {
    let _ = store.remove(key);
}

#[test]
fn runtime_store_set_get_remove_round_trip() {
    let service = unique_service_name("runtime-secrets-round-trip");
    let store = create_secret_store(Box::leak(service.into_boxed_str()));
    let key = "alpha";

    cleanup_key(&*store, key);
    store.set(key, "v1").expect("set should work");
    assert_eq!(store.get(key).expect("get should work"), Some("v1".to_string()));

    store.remove(key).expect("remove should work");
    assert_eq!(store.get(key).expect("get after remove should work"), None);
}

#[test]
fn runtime_store_overwrite_updates_value() {
    let service = unique_service_name("runtime-secrets-overwrite");
    let store = create_secret_store(Box::leak(service.into_boxed_str()));
    let key = "alpha";

    cleanup_key(&*store, key);
    store.set(key, "v1").expect("first set should work");
    store.set(key, "v2").expect("second set should work");

    assert_eq!(store.get(key).expect("get should work"), Some("v2".to_string()));
    store.remove(key).expect("cleanup remove should work");
}

#[test]
fn runtime_store_is_isolated_by_service() {
    let service_a = unique_service_name("runtime-secrets-service-a");
    let service_b = unique_service_name("runtime-secrets-service-b");
    let store_a = create_secret_store(Box::leak(service_a.into_boxed_str()));
    let store_b = create_secret_store(Box::leak(service_b.into_boxed_str()));
    let key = "shared-key";

    cleanup_key(&*store_a, key);
    cleanup_key(&*store_b, key);

    store_a.set(key, "a-value").expect("set on service A should work");
    assert_eq!(
        store_a.get(key).expect("get from service A should work"),
        Some("a-value".to_string())
    );
    assert_eq!(store_b.get(key).expect("get from service B should work"), None);

    store_a.remove(key).expect("cleanup remove on service A should work");
}

#[test]
fn runtime_store_concurrent_set_and_get() {
    let service = unique_service_name("runtime-secrets-concurrent");
    let store = Arc::new(create_secret_store(Box::leak(service.into_boxed_str())));
    let workers = 10;
    let start = Arc::new(Barrier::new(workers));
    let mut handles = Vec::new();

    for i in 0..workers {
        let store = Arc::clone(&store);
        let start = Arc::clone(&start);
        handles.push(thread::spawn(move || {
            let key = format!("concurrent-key-{}", i);
            let value = format!("value-{}", i);

            start.wait();

            store.set(&key, &value).expect("concurrent set should work");
            assert_eq!(
                store.get(&key).expect("concurrent get should work"),
                Some(value.clone()),
                "concurrent get should return own value for own key"
            );

            store.remove(&key).expect("concurrent remove should work");
            assert_eq!(
                store.get(&key).expect("concurrent get after remove should work"),
                None,
                "concurrent remove should clear own key"
            );
        }));
    }

    for handle in handles {
        handle.join().expect("thread should not panic");
    }
}

#[test]
fn runtime_store_get_nonexistent_key() {
    let service = unique_service_name("runtime-secrets-missing");
    let store = create_secret_store(Box::leak(service.into_boxed_str()));

    let result = store.get("nonexistent-key").expect("get should work");
    assert_eq!(result, None, "nonexistent key should return None");
}
