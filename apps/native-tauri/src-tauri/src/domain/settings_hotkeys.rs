use std::collections::{HashMap, HashSet};

use serde::{Deserialize, Serialize};

use crate::app::error::{error_codes, AppError};

const NAVIGATION_KEYS: &[&str] = &["dashboard", "decks", "algorithms", "templates", "settings"];
const GRADES_KEYS: &[&str] = &["again", "hard", "normal", "easy"];

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HotkeysSettings {
    pub navigation: HashMap<String, Vec<String>>,
    pub grades: HashMap<String, Vec<String>>,
}

impl HotkeysSettings {
    pub fn validate(&self) -> Result<(), AppError> {
        for scope in [&self.navigation, &self.grades] {
            let mut seen = HashSet::new();
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

    pub fn fill_defaults(&mut self) {
        for key in NAVIGATION_KEYS {
            self.navigation.entry(key.to_string()).or_default();
        }
        for key in GRADES_KEYS {
            self.grades.entry(key.to_string()).or_default();
        }
    }
}
