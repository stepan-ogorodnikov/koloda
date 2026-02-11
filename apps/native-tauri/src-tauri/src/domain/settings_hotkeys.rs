use std::collections::HashMap;

use serde::{Deserialize, Serialize};

use crate::app::error::{error_codes, AppError};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HotkeysSettings {
    pub navigation: HashMap<String, Vec<String>>,
    pub grades: HashMap<String, Vec<String>>,
}

impl HotkeysSettings {
    pub fn validate(&self) -> Result<(), AppError> {
        for scope in [&self.navigation, &self.grades] {
            let mut seen = std::collections::HashSet::new();
            for keys in scope.values() {
                for key in keys {
                    if !seen.insert(key) {
                        return Err(AppError::new(
                            error_codes::VALIDATION_SETTINGS_HOTKEYS_DUPLICATE_KEYS,
                            None,
                        ));
                    }
                }
            }
        }

        Ok(())
    }
}
