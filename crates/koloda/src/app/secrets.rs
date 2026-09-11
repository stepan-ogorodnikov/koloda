use crate::app::error::{error_codes, AppError};
use std::collections::HashMap;
use std::sync::{Arc, LazyLock, RwLock, RwLockReadGuard, RwLockWriteGuard};

const STORE_ID: &str = "koloda";

// WHY: Kept under `debug_assertions` (not `cfg(test)`). Integration tests in
// `tests/` are a separate crate and link a non-`test` build of this library, so
// `cfg(test)` would strip the seam. Release Electron builds use `--release`,
// which disables `debug_assertions` and removes the override entirely.
#[cfg(debug_assertions)]
static TEST_SECRET_STORE: LazyLock<RwLock<Option<Arc<dyn SecretStore>>>> = LazyLock::new(|| RwLock::new(None));

#[cfg(debug_assertions)]
fn test_store_lock_poisoned() -> AppError {
    AppError::new(
        error_codes::SECRET_STORE,
        Some("Test secret store lock poisoned".to_string()),
    )
}

#[cfg(debug_assertions)]
pub fn set_test_secret_store(store: Option<Arc<dyn SecretStore>>) -> Result<(), AppError> {
    let mut guard = TEST_SECRET_STORE
        .write()
        .map_err(|_poisoned| test_store_lock_poisoned())?;
    *guard = store;
    Ok(())
}

#[cfg(debug_assertions)]
pub fn get_secret_store() -> Result<Arc<dyn SecretStore>, AppError> {
    let guard = TEST_SECRET_STORE
        .read()
        .map_err(|_poisoned| test_store_lock_poisoned())?;
    if let Some(store) = guard.as_ref() {
        return Ok(Arc::clone(store));
    }
    drop(guard);
    Ok(Arc::clone(&*REAL_SECRET_STORE))
}

#[cfg(not(debug_assertions))]
pub fn get_secret_store() -> Result<Arc<dyn SecretStore>, AppError> {
    Ok(Arc::clone(&*REAL_SECRET_STORE))
}

pub trait SecretStore: Send + Sync {
    fn get(&self, key: &str) -> Result<Option<String>, AppError>;
    fn set(&self, key: &str, value: &str) -> Result<(), AppError>;
    fn remove(&self, key: &str) -> Result<(), AppError>;
}

// WHY: The raw OS vault behind the cache. Splitting the backend from the
// read-through cache below lets tests pin the cache policy against an in-memory
// fake without touching real credentials.
pub trait RawBackend: Send + Sync {
    fn read(&self, key: &str) -> Result<Option<String>, AppError>;
    fn write(&self, key: &str, value: &str) -> Result<(), AppError>;
    fn delete(&self, key: &str) -> Result<(), AppError>;
    /// Error domain for cache lock poisoning; each OS backend keeps its own code.
    fn cache_lock_error(&self) -> AppError;
}

// INVARIANT: per-process read-through cache; populated on first `get` and updated on
// `set`/`remove` only. External vault changes are not observed until process restart
// (a new store instance starts with a cold cache). Misses (`None`) are not cached.
pub struct CachedStore<B: RawBackend> {
    backend: B,
    cache: RwLock<HashMap<String, String>>,
}

impl<B: RawBackend> CachedStore<B> {
    pub fn new(backend: B) -> Self {
        Self {
            backend,
            cache: RwLock::new(HashMap::new()),
        }
    }

    fn read_cache(&self) -> Result<RwLockReadGuard<'_, HashMap<String, String>>, AppError> {
        self.cache.read().map_err(|_poisoned| self.backend.cache_lock_error())
    }

    fn write_cache(&self) -> Result<RwLockWriteGuard<'_, HashMap<String, String>>, AppError> {
        self.cache.write().map_err(|_poisoned| self.backend.cache_lock_error())
    }
}

impl<B: RawBackend> SecretStore for CachedStore<B> {
    fn get(&self, key: &str) -> Result<Option<String>, AppError> {
        {
            let cache = self.read_cache()?;
            if let Some(value) = cache.get(key) {
                return Ok(Some(value.clone()));
            }
        }

        match self.backend.read(key)? {
            Some(value) => {
                let mut cache = self.write_cache()?;
                cache.insert(key.to_string(), value.clone());
                Ok(Some(value))
            }
            None => Ok(None),
        }
    }

    fn set(&self, key: &str, value: &str) -> Result<(), AppError> {
        self.backend.write(key, value)?;
        let mut cache = self.write_cache()?;
        cache.insert(key.to_string(), value.to_string());
        Ok(())
    }

    fn remove(&self, key: &str) -> Result<(), AppError> {
        self.backend.delete(key)?;
        let mut cache = self.write_cache()?;
        cache.remove(key);
        Ok(())
    }
}

#[cfg(not(target_os = "windows"))]
pub struct KeyringBackend {
    service: &'static str,
}

#[cfg(not(target_os = "windows"))]
impl KeyringBackend {
    pub fn new(service: &'static str) -> Self {
        Self { service }
    }

    fn get_from_keyring(&self, key: &str) -> Result<Option<String>, AppError> {
        let entry = keyring::Entry::new(self.service, key).map_err(|e| {
            AppError::new(
                error_codes::KEYRING,
                Some(format!("Failed to create keyring entry: {}", e)),
            )
        })?;

        match entry.get_password() {
            Ok(value) => Ok(Some(value)),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(e) => Err(AppError::new(
                error_codes::KEYRING,
                Some(format!("Failed to retrieve secret: {}", e)),
            )),
        }
    }

    fn set_to_keyring(&self, key: &str, value: &str) -> Result<(), AppError> {
        let entry = keyring::Entry::new(self.service, key).map_err(|e| {
            AppError::new(
                error_codes::KEYRING,
                Some(format!("Failed to create keyring entry: {}", e)),
            )
        })?;

        entry
            .set_password(value)
            .map_err(|e| AppError::new(error_codes::KEYRING, Some(format!("Failed to store secret: {}", e))))
    }

    fn remove_from_keyring(&self, key: &str) -> Result<(), AppError> {
        let entry = keyring::Entry::new(self.service, key).map_err(|e| {
            AppError::new(
                error_codes::KEYRING,
                Some(format!("Failed to create keyring entry: {}", e)),
            )
        })?;

        match entry.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(e) => Err(AppError::new(
                error_codes::KEYRING,
                Some(format!("Failed to delete secret: {}", e)),
            )),
        }
    }
}

#[cfg(not(target_os = "windows"))]
impl RawBackend for KeyringBackend {
    fn read(&self, key: &str) -> Result<Option<String>, AppError> {
        self.get_from_keyring(key)
    }

    fn write(&self, key: &str, value: &str) -> Result<(), AppError> {
        self.set_to_keyring(key, value)
    }

    fn delete(&self, key: &str) -> Result<(), AppError> {
        self.remove_from_keyring(key)
    }

    fn cache_lock_error(&self) -> AppError {
        AppError::new(error_codes::KEYRING, Some("Secret cache lock poisoned".to_string()))
    }
}

#[cfg(target_os = "windows")]
mod windows_store {
    use crate::app::error::{error_codes, AppError};
    use std::ffi::OsStr;
    use std::os::windows::ffi::OsStrExt;
    use windows_sys::Win32::Security::Credentials::{
        CredDeleteW, CredFree, CredReadW, CredWriteW, CREDENTIALW, CRED_PERSIST_LOCAL_MACHINE, CRED_TYPE_GENERIC,
    };

    const ERROR_NOT_FOUND: i32 = 1168;

    pub struct WindowsBackend {
        service: &'static str,
    }

    impl WindowsBackend {
        pub fn new(service: &'static str) -> Self {
            Self { service }
        }

        fn to_wide(service: &str, key: &str) -> Vec<u16> {
            let full_key = format!("{}:{}", service, key);
            OsStr::new(&full_key).encode_wide().chain(std::iter::once(0)).collect()
        }

        fn get_from_windows(&self, key: &str) -> Result<Option<String>, AppError> {
            let target = Self::to_wide(self.service, key);
            let mut cred_ptr: *mut CREDENTIALW = std::ptr::null_mut();

            // SAFETY: `target` is a null-terminated wide string owned by this function.
            // CredReadW either fails or writes a credential pointer that we free with CredFree.
            let result = unsafe { CredReadW(target.as_ptr(), CRED_TYPE_GENERIC, 0, &mut cred_ptr) };
            if result == 0 {
                let os_error = std::io::Error::last_os_error();
                return match os_error.raw_os_error() {
                    Some(ERROR_NOT_FOUND) => Ok(None),
                    _ => Err(AppError::new(
                        error_codes::WINDOWS_CREDENTIALS,
                        Some(format!("Failed to read credential '{}': {}", key, os_error)),
                    )),
                };
            }

            if cred_ptr.is_null() {
                return Err(AppError::new(
                    error_codes::WINDOWS_CREDENTIALS,
                    Some(format!("Credential API returned null pointer for key '{}'", key)),
                ));
            }

            // SAFETY: CredReadW succeeded and returned a non-null credential pointer.
            let cred = unsafe { &*cred_ptr };
            let blob_size = cred.CredentialBlobSize as usize;
            if blob_size > 0 && cred.CredentialBlob.is_null() {
                // SAFETY: `cred_ptr` was allocated by CredReadW and must be freed with CredFree.
                unsafe { CredFree(cred_ptr as *mut _) };
                return Err(AppError::new(
                    error_codes::WINDOWS_CREDENTIALS,
                    Some(format!(
                        "Credential API returned empty blob pointer for non-empty key '{}'",
                        key
                    )),
                ));
            }

            let blob_bytes = if blob_size == 0 {
                Vec::new()
            } else {
                // SAFETY: CredentialBlob is non-null with `blob_size` bytes as reported by the API.
                // The slice is copied before CredFree below.
                unsafe { std::slice::from_raw_parts(cred.CredentialBlob, blob_size).to_vec() }
            };

            let value_result = String::from_utf8(blob_bytes).map_err(|e| {
                AppError::new(
                    error_codes::WINDOWS_CREDENTIALS,
                    Some(format!("Stored credential for '{}' is not valid UTF-8: {}", key, e)),
                )
            });
            // SAFETY: `cred_ptr` was allocated by CredReadW and must be freed with CredFree.
            unsafe { CredFree(cred_ptr as *mut _) };
            value_result.map(Some)
        }

        fn set_to_windows(&self, key: &str, value: &str) -> Result<(), AppError> {
            let mut target = Self::to_wide(self.service, key);
            let password_bytes = value.as_bytes();

            let cred = CREDENTIALW {
                Flags: 0,
                Type: CRED_TYPE_GENERIC,
                TargetName: target.as_mut_ptr(),
                Comment: std::ptr::null_mut(),
                LastWritten: Default::default(),
                CredentialBlobSize: password_bytes.len() as u32,
                CredentialBlob: password_bytes.as_ptr() as *mut u8,
                Persist: CRED_PERSIST_LOCAL_MACHINE,
                AttributeCount: 0,
                Attributes: std::ptr::null_mut(),
                TargetAlias: std::ptr::null_mut(),
                UserName: std::ptr::null_mut(),
            };

            // SAFETY: `cred` pointers reference live local buffers (`target`, `password_bytes`)
            // for the duration of this CredWriteW call.
            let result = unsafe { CredWriteW(&cred, 0) };
            if result == 0 {
                let os_error = std::io::Error::last_os_error();
                return Err(AppError::new(
                    error_codes::WINDOWS_CREDENTIALS,
                    Some(format!("Failed to write credential '{}': {}", key, os_error)),
                ));
            }

            Ok(())
        }

        fn remove_from_windows(&self, key: &str) -> Result<(), AppError> {
            let target = Self::to_wide(self.service, key);

            // SAFETY: `target` is a null-terminated wide string owned by this function.
            let result = unsafe { CredDeleteW(target.as_ptr(), CRED_TYPE_GENERIC, 0) };
            if result == 0 {
                let os_error = std::io::Error::last_os_error();
                return match os_error.raw_os_error() {
                    Some(ERROR_NOT_FOUND) => Ok(()),
                    _ => Err(AppError::new(
                        error_codes::WINDOWS_CREDENTIALS,
                        Some(format!("Failed to delete credential '{}': {}", key, os_error)),
                    )),
                };
            }

            Ok(())
        }
    }

    impl super::RawBackend for WindowsBackend {
        fn read(&self, key: &str) -> Result<Option<String>, AppError> {
            self.get_from_windows(key)
        }

        fn write(&self, key: &str, value: &str) -> Result<(), AppError> {
            self.set_to_windows(key, value)
        }

        fn delete(&self, key: &str) -> Result<(), AppError> {
            self.remove_from_windows(key)
        }

        fn cache_lock_error(&self) -> AppError {
            AppError::new(
                error_codes::WINDOWS_CREDENTIALS,
                Some("Secret cache lock poisoned".to_string()),
            )
        }
    }
}

static REAL_SECRET_STORE: LazyLock<Arc<dyn SecretStore>> = LazyLock::new(|| create_secret_store(STORE_ID));

#[cfg(target_os = "windows")]
pub fn create_secret_store(service: &'static str) -> Arc<dyn SecretStore> {
    Arc::new(CachedStore::new(windows_store::WindowsBackend::new(service)))
}

#[cfg(not(target_os = "windows"))]
pub fn create_secret_store(service: &'static str) -> Arc<dyn SecretStore> {
    Arc::new(CachedStore::new(KeyringBackend::new(service)))
}
