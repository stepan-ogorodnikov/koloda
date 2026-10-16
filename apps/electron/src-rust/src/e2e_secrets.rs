//! A secret store in a plain JSON file, for the desktop e2e suite (`apps/electron-e2e`).
//!
//! INVARIANT: compiled into debug builds only, and installed only when `KOLODA_E2E_SECRETS` names the file.
//! A release addon has no way to keep secrets outside the OS keyring.

use std::collections::BTreeMap;
use std::fs;
use std::io::ErrorKind;
use std::path::PathBuf;
use std::sync::{Arc, Mutex, MutexGuard};

use koloda::app::error::{error_codes, AppError};
use koloda::app::secrets::{set_test_secret_store, SecretStore};

const PATH_VAR: &str = "KOLODA_E2E_SECRETS";

pub fn install_from_env() -> Result<(), AppError> {
    let Some(path) = std::env::var_os(PATH_VAR) else {
        return Ok(());
    };
    set_test_secret_store(Some(Arc::new(FileSecretStore::new(PathBuf::from(path)))))
}

struct FileSecretStore {
    path: PathBuf,
    // WHY: the database and sync workers both reach the store, and `set` and `remove` rewrite the whole file.
    lock: Mutex<()>,
}

impl FileSecretStore {
    fn new(path: PathBuf) -> Self {
        Self {
            path,
            lock: Mutex::new(()),
        }
    }

    fn guard(&self) -> Result<MutexGuard<'_, ()>, AppError> {
        self.lock
            .lock()
            .map_err(|_poisoned| store_error("lock poisoned".to_string()))
    }

    fn read(&self) -> Result<BTreeMap<String, String>, AppError> {
        match fs::read_to_string(&self.path) {
            Ok(text) => serde_json::from_str(&text).map_err(|error| store_error(error.to_string())),
            Err(error) if error.kind() == ErrorKind::NotFound => Ok(BTreeMap::new()),
            Err(error) => Err(store_error(error.to_string())),
        }
    }

    fn update(&self, change: impl FnOnce(&mut BTreeMap<String, String>)) -> Result<(), AppError> {
        let _guard = self.guard()?;
        let mut secrets = self.read()?;
        change(&mut secrets);
        let text = serde_json::to_string(&secrets).map_err(|error| store_error(error.to_string()))?;
        fs::write(&self.path, text).map_err(|error| store_error(error.to_string()))
    }
}

impl SecretStore for FileSecretStore {
    fn get(&self, key: &str) -> Result<Option<String>, AppError> {
        let _guard = self.guard()?;
        Ok(self.read()?.remove(key))
    }

    fn set(&self, key: &str, value: &str) -> Result<(), AppError> {
        self.update(|secrets| {
            secrets.insert(key.to_string(), value.to_string());
        })
    }

    fn remove(&self, key: &str) -> Result<(), AppError> {
        self.update(|secrets| {
            secrets.remove(key);
        })
    }
}

fn store_error(details: String) -> AppError {
    AppError::new(error_codes::SECRET_STORE, Some(format!("e2e secrets file: {details}")))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fresh_path(name: &str) -> PathBuf {
        let path = std::env::temp_dir().join(format!("koloda-e2e-secrets-{}-{name}.json", std::process::id()));
        if path.exists() {
            fs::remove_file(&path).unwrap();
        }
        path
    }

    #[test]
    fn a_value_set_reads_back_from_a_fresh_store_on_the_same_file() {
        let path = fresh_path("round-trip");
        FileSecretStore::new(path.clone())
            .set("sync.token.a", "secret-a")
            .unwrap();
        FileSecretStore::new(path.clone())
            .set("sync.token.b", "secret-b")
            .unwrap();

        let store = FileSecretStore::new(path.clone());
        assert_eq!(store.get("sync.token.a").unwrap().as_deref(), Some("secret-a"));
        assert_eq!(store.get("sync.token.b").unwrap().as_deref(), Some("secret-b"));
        fs::remove_file(&path).unwrap();
    }

    #[test]
    fn a_missing_file_or_key_reads_as_none() {
        let path = fresh_path("missing");
        let store = FileSecretStore::new(path.clone());
        assert_eq!(store.get("sync.token.a").unwrap(), None);

        store.set("sync.token.a", "secret-a").unwrap();
        assert_eq!(store.get("sync.token.b").unwrap(), None);
        fs::remove_file(&path).unwrap();
    }

    #[test]
    fn remove_drops_only_its_key_from_the_file() {
        let path = fresh_path("remove");
        let store = FileSecretStore::new(path.clone());
        store.set("sync.token.a", "secret-a").unwrap();
        store.set("sync.token.b", "secret-b").unwrap();
        store.remove("sync.token.a").unwrap();

        let fresh = FileSecretStore::new(path.clone());
        assert_eq!(fresh.get("sync.token.a").unwrap(), None);
        assert_eq!(fresh.get("sync.token.b").unwrap().as_deref(), Some("secret-b"));
        fs::remove_file(&path).unwrap();
    }
}
