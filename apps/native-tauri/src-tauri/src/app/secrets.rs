use crate::app::error::AppError;
use std::collections::HashMap;
use std::fs;
use std::io::ErrorKind;
use std::path::PathBuf;
use std::sync::{Mutex, RwLock, RwLockReadGuard, RwLockWriteGuard};

pub trait SecretStore: Send + Sync {
    fn get(&self, key: &str) -> Result<Option<String>, AppError>;
    fn set(&self, key: &str, value: &str) -> Result<(), AppError>;
    fn remove(&self, key: &str) -> Result<(), AppError>;
}

pub struct KeyringSecretStore {
    service: &'static str,
    cache: RwLock<HashMap<String, String>>,
}

impl KeyringSecretStore {
    pub fn new(service: &'static str) -> Self {
        Self {
            service,
            cache: RwLock::new(HashMap::new()),
        }
    }

    fn read_cache(&self) -> Result<RwLockReadGuard<'_, HashMap<String, String>>, AppError> {
        self.cache
            .read()
            .map_err(|_| AppError::new("keyring", Some("Secret cache lock poisoned".to_string())))
    }

    fn write_cache(&self) -> Result<RwLockWriteGuard<'_, HashMap<String, String>>, AppError> {
        self.cache
            .write()
            .map_err(|_| AppError::new("keyring", Some("Secret cache lock poisoned".to_string())))
    }

    fn get_from_keyring(&self, key: &str) -> Result<Option<String>, AppError> {
        let entry = keyring::Entry::new(self.service, key).map_err(|e| {
            AppError::new(
                "keyring",
                Some(format!("Failed to create keyring entry: {}", e)),
            )
        })?;

        match entry.get_password() {
            Ok(value) => Ok(Some(value)),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(e) => Err(AppError::new(
                "keyring",
                Some(format!("Failed to retrieve secret: {}", e)),
            )),
        }
    }

    fn set_to_keyring(&self, key: &str, value: &str) -> Result<(), AppError> {
        let entry = keyring::Entry::new(self.service, key).map_err(|e| {
            AppError::new(
                "keyring",
                Some(format!("Failed to create keyring entry: {}", e)),
            )
        })?;

        entry
            .set_password(value)
            .map_err(|e| AppError::new("keyring", Some(format!("Failed to store secret: {}", e))))
    }

    fn remove_from_keyring(&self, key: &str) -> Result<(), AppError> {
        let entry = keyring::Entry::new(self.service, key).map_err(|e| {
            AppError::new(
                "keyring",
                Some(format!("Failed to create keyring entry: {}", e)),
            )
        })?;

        match entry.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(e) => Err(AppError::new(
                "keyring",
                Some(format!("Failed to delete secret: {}", e)),
            )),
        }
    }
}

impl SecretStore for KeyringSecretStore {
    fn get(&self, key: &str) -> Result<Option<String>, AppError> {
        {
            let cache = self.read_cache()?;
            if let Some(value) = cache.get(key) {
                return Ok(Some(value.clone()));
            }
        }

        match self.get_from_keyring(key)? {
            Some(value) => {
                let mut cache = self.write_cache()?;
                cache.insert(key.to_string(), value.clone());
                Ok(Some(value))
            }
            None => Ok(None),
        }
    }

    fn set(&self, key: &str, value: &str) -> Result<(), AppError> {
        self.set_to_keyring(key, value)?;
        let mut cache = self.write_cache()?;
        cache.insert(key.to_string(), value.to_string());
        Ok(())
    }

    fn remove(&self, key: &str) -> Result<(), AppError> {
        self.remove_from_keyring(key)?;
        let mut cache = self.write_cache()?;
        cache.remove(key);
        Ok(())
    }
}

pub struct FileSecretStore {
    file_path: PathBuf,
    cache: RwLock<HashMap<String, String>>,
    io_lock: Mutex<()>,
}

impl FileSecretStore {
    pub fn new(service: &'static str) -> Self {
        let data_dir = dirs::data_local_dir()
            .unwrap_or_else(|| PathBuf::from("."))
            .join("koloda");
        Self::new_with_dir(service, data_dir)
    }

    pub fn new_with_dir(service: &'static str, data_dir: PathBuf) -> Self {
        let _ = fs::create_dir_all(&data_dir);

        Self {
            file_path: data_dir.join(format!("{}.json", service)),
            cache: RwLock::new(HashMap::new()),
            io_lock: Mutex::new(()),
        }
    }

    fn read_cache(&self) -> Result<RwLockReadGuard<'_, HashMap<String, String>>, AppError> {
        self.cache
            .read()
            .map_err(|_| AppError::new("secrets", Some("Secret cache lock poisoned".to_string())))
    }

    fn write_cache(&self) -> Result<RwLockWriteGuard<'_, HashMap<String, String>>, AppError> {
        self.cache
            .write()
            .map_err(|_| AppError::new("secrets", Some("Secret cache lock poisoned".to_string())))
    }

    fn load_secrets(&self) -> Result<HashMap<String, String>, AppError> {
        let content = match fs::read_to_string(&self.file_path) {
            Ok(content) => content,
            Err(err) if err.kind() == ErrorKind::NotFound => return Ok(HashMap::new()),
            Err(err) => {
                return Err(AppError::new(
                    "secrets",
                    Some(format!("Failed to read secrets file: {}", err)),
                ));
            }
        };

        if content.trim().is_empty() {
            return Ok(HashMap::new());
        }

        serde_json::from_str::<HashMap<String, String>>(&content).map_err(|e| {
            AppError::new(
                "secrets",
                Some(format!("Failed to parse secrets file as JSON: {}", e)),
            )
        })
    }

    fn save_secrets(&self, secrets: &HashMap<String, String>) -> Result<(), AppError> {
        let json = serde_json::to_vec(secrets)
            .map_err(|e| AppError::new("secrets", Some(format!("Failed to serialize secrets: {}", e))))?;

        if let Some(parent) = self.file_path.parent() {
            fs::create_dir_all(parent).map_err(|e| {
                AppError::new(
                    "secrets",
                    Some(format!("Failed to create secrets directory: {}", e)),
                )
            })?;
        }

        let temp_path = self.file_path.with_extension("json.tmp");
        fs::write(&temp_path, json).map_err(|e| {
            AppError::new(
                "secrets",
                Some(format!("Failed to write temporary secrets file: {}", e)),
            )
        })?;

        if self.file_path.exists() {
            fs::remove_file(&self.file_path).map_err(|e| {
                AppError::new(
                    "secrets",
                    Some(format!("Failed to clear existing secrets file: {}", e)),
                )
            })?;
        }

        fs::rename(&temp_path, &self.file_path).map_err(|e| {
            AppError::new(
                "secrets",
                Some(format!("Failed to replace secrets file atomically: {}", e)),
            )
        })?;

        Ok(())
    }
}

impl SecretStore for FileSecretStore {
    fn get(&self, key: &str) -> Result<Option<String>, AppError> {
        {
            let cache = self.read_cache()?;
            if let Some(value) = cache.get(key) {
                return Ok(Some(value.clone()));
            }
        }

        let _guard = self
            .io_lock
            .lock()
            .map_err(|_| AppError::new("secrets", Some("Secret file lock poisoned".to_string())))?;
        let secrets = self.load_secrets()?;
        match secrets.get(key) {
            Some(value) => {
                let value = value.clone();
                let mut cache = self.write_cache()?;
                cache.insert(key.to_string(), value.clone());
                Ok(Some(value))
            }
            None => Ok(None),
        }
    }

    fn set(&self, key: &str, value: &str) -> Result<(), AppError> {
        let _guard = self
            .io_lock
            .lock()
            .map_err(|_| AppError::new("secrets", Some("Secret file lock poisoned".to_string())))?;

        let mut secrets = self.load_secrets()?;
        secrets.insert(key.to_string(), value.to_string());
        self.save_secrets(&secrets)?;

        let mut cache = self.write_cache()?;
        cache.insert(key.to_string(), value.to_string());
        Ok(())
    }

    fn remove(&self, key: &str) -> Result<(), AppError> {
        let _guard = self
            .io_lock
            .lock()
            .map_err(|_| AppError::new("secrets", Some("Secret file lock poisoned".to_string())))?;

        let mut secrets = self.load_secrets()?;
        secrets.remove(key);
        self.save_secrets(&secrets)?;

        let mut cache = self.write_cache()?;
        cache.remove(key);
        Ok(())
    }
}

#[cfg(target_os = "windows")]
mod windows_store {
    use super::SecretStore;
    use crate::app::error::AppError;
    use std::collections::HashMap;
    use std::ffi::OsStr;
    use std::os::windows::ffi::OsStrExt;
    use std::sync::{RwLock, RwLockReadGuard, RwLockWriteGuard};
    use windows_sys::Win32::Security::Credentials::{CredDeleteW, CredFree, CredReadW, CredWriteW, CREDENTIALW, CRED_PERSIST_LOCAL_MACHINE, CRED_TYPE_GENERIC};

    const ERROR_NOT_FOUND: i32 = 1168;

    pub struct WindowsCredentialStore {
        service: &'static str,
        cache: RwLock<HashMap<String, String>>,
    }

    impl WindowsCredentialStore {
        pub fn new(service: &'static str) -> Self {
            Self {
                service,
                cache: RwLock::new(HashMap::new()),
            }
        }

        fn read_cache(&self) -> Result<RwLockReadGuard<'_, HashMap<String, String>>, AppError> {
            self.cache.read().map_err(|_| {
                AppError::new(
                    "windows-credentials",
                    Some("Secret cache lock poisoned".to_string()),
                )
            })
        }

        fn write_cache(&self) -> Result<RwLockWriteGuard<'_, HashMap<String, String>>, AppError> {
            self.cache.write().map_err(|_| {
                AppError::new(
                    "windows-credentials",
                    Some("Secret cache lock poisoned".to_string()),
                )
            })
        }

        fn to_wide(service: &str, key: &str) -> Vec<u16> {
            let full_key = format!("{}:{}", service, key);
            OsStr::new(&full_key)
                .encode_wide()
                .chain(std::iter::once(0))
                .collect()
        }

        fn get_from_windows(&self, key: &str) -> Result<Option<String>, AppError> {
            let target = Self::to_wide(self.service, key);
            unsafe {
                let mut cred_ptr: *mut CREDENTIALW = std::ptr::null_mut();
                let result = CredReadW(target.as_ptr(), CRED_TYPE_GENERIC, 0, &mut cred_ptr);
                if result == 0 {
                    let os_error = std::io::Error::last_os_error();
                    return match os_error.raw_os_error() {
                        Some(ERROR_NOT_FOUND) => Ok(None),
                        _ => Err(AppError::new(
                            "windows-credentials",
                            Some(format!("Failed to read credential '{}': {}", key, os_error)),
                        )),
                    };
                }

                if cred_ptr.is_null() {
                    return Err(AppError::new(
                        "windows-credentials",
                        Some(format!("Credential API returned null pointer for key '{}'", key)),
                    ));
                }

                let cred = &*cred_ptr;
                let blob_size = cred.CredentialBlobSize as usize;
                if blob_size > 0 && cred.CredentialBlob.is_null() {
                    CredFree(cred_ptr as *mut _);
                    return Err(AppError::new(
                        "windows-credentials",
                        Some(format!(
                            "Credential API returned empty blob pointer for non-empty key '{}'",
                            key
                        )),
                    ));
                }

                let blob_bytes = if blob_size == 0 {
                    Vec::new()
                } else {
                    std::slice::from_raw_parts(cred.CredentialBlob, blob_size).to_vec()
                };

                let value_result = String::from_utf8(blob_bytes)
                .map_err(|e| {
                    AppError::new(
                        "windows-credentials",
                        Some(format!("Stored credential for '{}' is not valid UTF-8: {}", key, e)),
                    )
                });
                CredFree(cred_ptr as *mut _);
                value_result.map(Some)
            }
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

            unsafe {
                let result = CredWriteW(&cred, 0);
                if result == 0 {
                    let os_error = std::io::Error::last_os_error();
                    return Err(AppError::new(
                        "windows-credentials",
                        Some(format!("Failed to write credential '{}': {}", key, os_error)),
                    ));
                }
            }

            Ok(())
        }

        fn remove_from_windows(&self, key: &str) -> Result<(), AppError> {
            let target = Self::to_wide(self.service, key);

            unsafe {
                let result = CredDeleteW(target.as_ptr(), CRED_TYPE_GENERIC, 0);
                if result == 0 {
                    let os_error = std::io::Error::last_os_error();
                    return match os_error.raw_os_error() {
                        Some(ERROR_NOT_FOUND) => Ok(()),
                        _ => Err(AppError::new(
                            "windows-credentials",
                            Some(format!("Failed to delete credential '{}': {}", key, os_error)),
                        )),
                    };
                }
            }

            Ok(())
        }
    }

    impl SecretStore for WindowsCredentialStore {
        fn get(&self, key: &str) -> Result<Option<String>, AppError> {
            {
                let cache = self.read_cache()?;
                if let Some(value) = cache.get(key) {
                    return Ok(Some(value.clone()));
                }
            }

            match self.get_from_windows(key)? {
                Some(value) => {
                    let mut cache = self.write_cache()?;
                    cache.insert(key.to_string(), value.clone());
                    Ok(Some(value))
                }
                None => Ok(None),
            }
        }

        fn set(&self, key: &str, value: &str) -> Result<(), AppError> {
            self.set_to_windows(key, value)?;
            let mut cache = self.write_cache()?;
            cache.insert(key.to_string(), value.to_string());
            Ok(())
        }

        fn remove(&self, key: &str) -> Result<(), AppError> {
            self.remove_from_windows(key)?;
            let mut cache = self.write_cache()?;
            cache.remove(key);
            Ok(())
        }
    }
}

#[cfg(target_os = "windows")]
pub use windows_store::WindowsCredentialStore;

#[cfg(target_os = "windows")]
pub fn create_secret_store(service: &'static str) -> Box<dyn SecretStore> {
    Box::new(WindowsCredentialStore::new(service))
}

#[cfg(not(target_os = "windows"))]
pub fn create_secret_store(service: &'static str) -> Box<dyn SecretStore> {
    Box::new(KeyringSecretStore::new(service))
}
