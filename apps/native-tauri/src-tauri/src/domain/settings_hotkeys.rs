use std::collections::{HashMap, HashSet};

use serde::{Deserialize, Serialize};

use crate::app::error::{error_codes, AppError};

const FORM_KEYS: &[&str] = &["submit", "reset"];
const UI_KEYS: &[&str] = &["submit", "focusNext", "focusPrev", "nextTab", "prevTab", "close"];
const NAVIGATION_KEYS: &[&str] = &["dashboard", "decks", "algorithms", "templates", "settings"];
const GRADES_KEYS: &[&str] = &["again", "hard", "normal", "easy"];
const AI_KEYS: &[&str] = &["cancel", "openProfilePicker"];

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HotkeysSettings {
    #[serde(default)]
    pub form: HashMap<String, Vec<String>>,
    #[serde(default)]
    pub ui: HashMap<String, Vec<String>>,
    #[serde(default)]
    pub navigation: HashMap<String, Vec<String>>,
    #[serde(default)]
    pub grades: HashMap<String, Vec<String>>,
    #[serde(default)]
    pub ai: HashMap<String, Vec<String>>,
}

impl HotkeysSettings {
    pub fn validate(&self) -> Result<(), AppError> {
        for scope in [&self.form, &self.ui, &self.navigation, &self.grades, &self.ai] {
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

        let ui_hotkeys: HashSet<&String> = self.ui.values().flat_map(|keys| keys.iter()).collect();
        if self
            .form
            .values()
            .chain(self.navigation.values())
            .chain(self.grades.values())
            .chain(self.ai.values())
            .flat_map(|keys| keys.iter())
            .any(|key| ui_hotkeys.contains(key))
        {
            return Err(AppError::new(
                error_codes::VALIDATION_SETTINGS_HOTKEYS_DUPLICATE_KEYS,
                None,
            ));
        }

        Ok(())
    }

    pub fn fill_defaults(&mut self) {
        for key in FORM_KEYS {
            self.form.entry(key.to_string()).or_default();
        }
        for key in UI_KEYS {
            self.ui.entry(key.to_string()).or_default();
        }
        for key in NAVIGATION_KEYS {
            self.navigation.entry(key.to_string()).or_default();
        }
        for key in GRADES_KEYS {
            self.grades.entry(key.to_string()).or_default();
        }
        for key in AI_KEYS {
            self.ai.entry(key.to_string()).or_default();
        }
    }
}
