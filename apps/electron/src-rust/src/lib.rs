use koloda::app::db::Database;
use koloda::app::error::{error_codes, AppError};
use koloda::app::init::{self as init_mod, SeedData};
use koloda::domain::lessons::GetLessonsParams;
use koloda::domain::settings::SettingsName;
use koloda::repo;
use napi::bindgen_prelude::*;
use napi_derive::napi;

fn to_napi_error(err: AppError) -> Error {
    let error_json = serde_json::json!({
        "code": err.code,
        "details": err.details
    });
    Error::from_reason(error_json.to_string())
}

// WHY: serde wire-shape rejections (missing fields, mistyped values) must
// cross NAPI inside the `{code, details}` envelope like domain failures do,
// so the renderer `parseElectronError` builds a translatable `AppError`
// instead of an unclassified raw serde string. `unknown` is enough — the
// TS-side error table already covers it via the parity test.
fn from_wire<T: serde::de::DeserializeOwned>(value: serde_json::Value) -> Result<T> {
    serde_json::from_value(value).map_err(|e| to_napi_error(AppError::new(error_codes::UNKNOWN, Some(e.to_string()))))
}

fn parse_settings_name(name: &str) -> Result<SettingsName> {
    // WHY: same envelope as `from_wire` — an unknown name is a wire-shape
    // rejection, not a domain failure, but the renderer still needs `{code}`.
    name.parse::<SettingsName>()
        .map_err(|e| to_napi_error(AppError::new(error_codes::UNKNOWN, Some(e.to_string()))))
}

fn to_value<T: serde::Serialize>(val: &T) -> Result<serde_json::Value> {
    serde_json::to_value(val).map_err(|e| Error::from_reason(e.to_string()))
}

fn extract_id(params: serde_json::Value) -> Result<String> {
    #[derive(serde::Deserialize)]
    struct P {
        id: String,
    }
    from_wire::<P>(params).map(|p| p.id)
}

fn extract_name(params: serde_json::Value) -> Result<String> {
    #[derive(serde::Deserialize)]
    struct P {
        name: String,
    }
    from_wire::<P>(params).map(|p| p.name)
}

#[napi]
pub struct KolodaDb {
    db: Database,
}

#[napi]
impl KolodaDb {
    #[napi(constructor)]
    pub fn new(db_path: String) -> Result<Self> {
        let db = Database::init(db_path).map_err(to_napi_error)?;
        Ok(Self { db })
    }

    #[napi]
    pub fn get_db_status(&self) -> Result<String> {
        let status = init_mod::get_db_status(&self.db).map_err(to_napi_error)?;
        Ok(match status {
            koloda::app::init::DbStatus::Blank => "blank".to_string(),
            koloda::app::init::DbStatus::Ok => "ok".to_string(),
        })
    }

    #[napi]
    pub fn seed_db(&self, data: serde_json::Value) -> Result<()> {
        let data: SeedData = from_wire(data)?;
        init_mod::seed_db(&self.db, data).map_err(to_napi_error)
    }

    #[napi]
    pub fn get_cards(&self, params: serde_json::Value) -> Result<serde_json::Value> {
        let params: koloda::domain::cards::GetCardsParams = from_wire(params)?;
        let cards = repo::cards::get_cards(&self.db, &params.deck_id).map_err(to_napi_error)?;
        to_value(&cards)
    }

    #[napi]
    pub fn get_card_counts(&self) -> Result<serde_json::Value> {
        let counts = repo::cards::get_card_counts(&self.db).map_err(to_napi_error)?;
        to_value(&counts)
    }

    #[napi]
    pub fn get_card(&self, params: serde_json::Value) -> Result<Option<serde_json::Value>> {
        let id = extract_id(params)?;
        let card = repo::cards::get_card(&self.db, &id).map_err(to_napi_error)?;
        card.map(|c| to_value(&c)).transpose()
    }

    #[napi]
    pub fn add_card(&self, data: serde_json::Value) -> Result<serde_json::Value> {
        let data = from_wire(data)?;
        let card = repo::cards::add_card(&self.db, data).map_err(to_napi_error)?;
        to_value(&card)
    }

    #[napi]
    pub fn add_cards(&self, cards_data: serde_json::Value) -> Result<serde_json::Value> {
        let cards = from_wire(cards_data)?;
        let result = repo::cards::add_cards(&self.db, cards).map_err(to_napi_error)?;
        to_value(&result)
    }

    #[napi]
    pub fn update_card(&self, data: serde_json::Value) -> Result<serde_json::Value> {
        let data = from_wire(data)?;
        let card = repo::cards::update_card(&self.db, data).map_err(to_napi_error)?;
        to_value(&card)
    }

    #[napi]
    pub fn delete_card(&self, data: serde_json::Value) -> Result<()> {
        let data = from_wire(data)?;
        repo::cards::delete_card(&self.db, data).map_err(to_napi_error)
    }

    #[napi]
    pub fn delete_cards(&self, data: serde_json::Value) -> Result<()> {
        let data = from_wire(data)?;
        repo::cards::delete_cards(&self.db, data).map_err(to_napi_error)
    }

    #[napi]
    pub fn reset_card_progress(&self, data: serde_json::Value) -> Result<serde_json::Value> {
        let data = from_wire(data)?;
        let card = repo::cards::reset_card_progress(&self.db, data).map_err(to_napi_error)?;
        to_value(&card)
    }

    #[napi]
    pub fn get_algorithms(&self) -> Result<serde_json::Value> {
        let algorithms = repo::algorithms::get_algorithms(&self.db).map_err(to_napi_error)?;
        to_value(&algorithms)
    }

    #[napi]
    pub fn get_algorithm(&self, params: serde_json::Value) -> Result<Option<serde_json::Value>> {
        let id = extract_id(params)?;
        let algorithm = repo::algorithms::get_algorithm(&self.db, &id).map_err(to_napi_error)?;
        algorithm.map(|a| to_value(&a)).transpose()
    }

    #[napi]
    pub fn add_algorithm(&self, data: serde_json::Value) -> Result<serde_json::Value> {
        let data = from_wire(data)?;
        let algorithm = repo::algorithms::add_algorithm(&self.db, data).map_err(to_napi_error)?;
        to_value(&algorithm)
    }

    #[napi]
    pub fn update_algorithm(&self, data: serde_json::Value) -> Result<serde_json::Value> {
        let data = from_wire(data)?;
        let algorithm = repo::algorithms::update_algorithm(&self.db, data).map_err(to_napi_error)?;
        to_value(&algorithm)
    }

    #[napi]
    pub fn clone_algorithm(&self, data: serde_json::Value) -> Result<serde_json::Value> {
        let data = from_wire(data)?;
        let algorithm = repo::algorithms::clone_algorithm(&self.db, data).map_err(to_napi_error)?;
        to_value(&algorithm)
    }

    #[napi]
    pub fn delete_algorithm(&self, data: serde_json::Value) -> Result<()> {
        let data = from_wire(data)?;
        repo::algorithms::delete_algorithm(&self.db, data).map_err(to_napi_error)
    }

    #[napi]
    pub fn get_algorithm_decks(&self, params: serde_json::Value) -> Result<serde_json::Value> {
        let id = extract_id(params)?;
        let decks = repo::algorithms::get_algorithm_decks(&self.db, &id).map_err(to_napi_error)?;
        to_value(&decks)
    }

    #[napi]
    pub fn get_decks(&self) -> Result<serde_json::Value> {
        let decks = repo::decks::get_decks(&self.db).map_err(to_napi_error)?;
        to_value(&decks)
    }

    #[napi]
    pub fn get_deck(&self, params: serde_json::Value) -> Result<Option<serde_json::Value>> {
        let id = extract_id(params)?;
        let deck = repo::decks::get_deck(&self.db, &id).map_err(to_napi_error)?;
        deck.map(|d| to_value(&d)).transpose()
    }

    #[napi]
    pub fn add_deck(&self, data: serde_json::Value) -> Result<serde_json::Value> {
        let data = from_wire(data)?;
        let deck = repo::decks::add_deck(&self.db, data).map_err(to_napi_error)?;
        to_value(&deck)
    }

    #[napi]
    pub fn update_deck(&self, data: serde_json::Value) -> Result<serde_json::Value> {
        let data = from_wire(data)?;
        let deck = repo::decks::update_deck(&self.db, data).map_err(to_napi_error)?;
        to_value(&deck)
    }

    #[napi]
    pub fn delete_deck(&self, data: serde_json::Value) -> Result<()> {
        let data = from_wire(data)?;
        repo::decks::delete_deck(&self.db, data).map_err(to_napi_error)
    }

    #[napi]
    pub fn get_templates(&self) -> Result<serde_json::Value> {
        let templates = repo::templates::get_templates(&self.db).map_err(to_napi_error)?;
        to_value(&templates)
    }

    #[napi]
    pub fn get_template(&self, params: serde_json::Value) -> Result<Option<serde_json::Value>> {
        let id = extract_id(params)?;
        let template = repo::templates::get_template(&self.db, &id).map_err(to_napi_error)?;
        template.map(|t| to_value(&t)).transpose()
    }

    #[napi]
    pub fn add_template(&self, data: serde_json::Value) -> Result<serde_json::Value> {
        let data = from_wire(data)?;
        let template = repo::templates::add_template(&self.db, data).map_err(to_napi_error)?;
        to_value(&template)
    }

    #[napi]
    pub fn update_template(&self, data: serde_json::Value) -> Result<serde_json::Value> {
        let data = from_wire(data)?;
        let template = repo::templates::update_template(&self.db, data).map_err(to_napi_error)?;
        to_value(&template)
    }

    #[napi]
    pub fn clone_template(&self, data: serde_json::Value) -> Result<serde_json::Value> {
        let data = from_wire(data)?;
        let template = repo::templates::clone_template(&self.db, data).map_err(to_napi_error)?;
        to_value(&template)
    }

    #[napi]
    pub fn delete_template(&self, data: serde_json::Value) -> Result<()> {
        let data = from_wire(data)?;
        repo::templates::delete_template(&self.db, data).map_err(to_napi_error)
    }

    #[napi]
    pub fn get_template_decks(&self, params: serde_json::Value) -> Result<serde_json::Value> {
        let id = extract_id(params)?;
        let decks = repo::templates::get_template_decks(&self.db, &id).map_err(to_napi_error)?;
        to_value(&decks)
    }

    #[napi]
    pub fn get_settings(&self, params: serde_json::Value) -> Result<Option<serde_json::Value>> {
        let name = extract_name(params)?;
        let name = parse_settings_name(&name)?;
        let settings = repo::settings::get_settings(&self.db, name).map_err(to_napi_error)?;
        settings.map(|s| to_value(&s)).transpose()
    }

    #[napi]
    pub fn set_settings(&self, params: serde_json::Value) -> Result<serde_json::Value> {
        #[derive(serde::Deserialize)]
        struct P {
            name: String,
            content: serde_json::Value,
        }
        let p: P = from_wire(params)?;
        let name = parse_settings_name(&p.name)?;
        let settings = repo::settings::set_settings(&self.db, name, p.content).map_err(to_napi_error)?;
        to_value(&settings)
    }

    #[napi]
    pub fn patch_settings(&self, params: serde_json::Value) -> Result<serde_json::Value> {
        #[derive(serde::Deserialize)]
        struct P {
            name: String,
            content: serde_json::Value,
        }
        let p: P = from_wire(params)?;
        let name = parse_settings_name(&p.name)?;
        let settings = repo::settings::patch_settings(&self.db, name, p.content).map_err(to_napi_error)?;
        to_value(&settings)
    }

    #[napi]
    pub fn get_conversation(&self, params: serde_json::Value) -> Result<Option<serde_json::Value>> {
        #[derive(serde::Deserialize)]
        struct P {
            id: String,
        }
        let p: P = from_wire(params)?;
        let conversation = repo::conversations::get_conversation(&self.db, &p.id).map_err(to_napi_error)?;
        conversation.map(|c| to_value(&c)).transpose()
    }

    #[napi]
    pub fn get_conversations(&self) -> Result<serde_json::Value> {
        let conversations = repo::conversations::get_conversations(&self.db).map_err(to_napi_error)?;
        to_value(&conversations)
    }

    #[napi]
    pub fn set_conversation(&self, params: serde_json::Value) -> Result<serde_json::Value> {
        let input: repo::conversations::SetConversationInput = from_wire(params)?;
        let conversation = repo::conversations::set_conversation(&self.db, input).map_err(to_napi_error)?;
        to_value(&conversation)
    }

    #[napi]
    pub fn delete_conversation(&self, params: serde_json::Value) -> Result<()> {
        #[derive(serde::Deserialize)]
        struct P {
            id: String,
        }
        let p: P = from_wire(params)?;
        repo::conversations::delete_conversation(&self.db, &p.id).map_err(to_napi_error)
    }

    #[napi]
    pub fn get_lessons(&self, params: serde_json::Value) -> Result<serde_json::Value> {
        let params: GetLessonsParams = from_wire(params)?;
        let lessons = repo::lessons::get_lessons(&self.db, params).map_err(to_napi_error)?;
        to_value(&lessons)
    }

    #[napi]
    pub fn get_lesson_data(&self, params: serde_json::Value) -> Result<Option<serde_json::Value>> {
        let params = from_wire(params)?;
        let data = repo::lessons::get_lesson_data(&self.db, &params).map_err(to_napi_error)?;
        data.map(|d| to_value(&d)).transpose()
    }

    #[napi]
    pub fn submit_lesson_result(&self, data: serde_json::Value) -> Result<()> {
        let data = from_wire(data)?;
        repo::lessons::submit_lesson_result(&self.db, data).map_err(to_napi_error)
    }

    #[napi]
    pub fn get_reviews(&self, data: serde_json::Value) -> Result<serde_json::Value> {
        let data = from_wire(data)?;
        let reviews = repo::reviews::get_reviews(&self.db, data).map_err(to_napi_error)?;
        to_value(&reviews)
    }

    #[napi]
    pub fn get_todays_review_totals(&self) -> Result<serde_json::Value> {
        let totals = repo::reviews::get_todays_review_totals(&self.db).map_err(to_napi_error)?;
        to_value(&totals)
    }

    #[napi]
    pub fn get_ai_profiles(&self) -> Result<serde_json::Value> {
        let profiles = repo::ai::get_ai_profiles(&self.db).map_err(to_napi_error)?;
        to_value(&profiles)
    }

    // INVARIANT: Main-process only — usable secrets for host AI handlers.
    // Do not register as a renderer `cmd_*`.
    #[napi]
    pub fn get_ai_profile_secrets(&self, profile_id: String) -> Result<serde_json::Value> {
        let secrets = repo::ai::get_ai_profile_secrets(&self.db, &profile_id).map_err(to_napi_error)?;
        to_value(&secrets)
    }

    #[napi]
    pub fn add_ai_profile(&self, data: serde_json::Value) -> Result<serde_json::Value> {
        let data: koloda::domain::ai::AddProfileData = from_wire(data)?;
        let profile = repo::ai::add_ai_profile(&self.db, data.title, data.secrets, data.whitelist_model_ids)
            .map_err(to_napi_error)?;
        to_value(&profile)
    }

    #[napi]
    pub fn update_ai_profile(&self, data: serde_json::Value) -> Result<serde_json::Value> {
        let data: koloda::domain::ai::UpdateProfileData = from_wire(data)?;
        let profile =
            repo::ai::update_ai_profile(&self.db, &data.id, data.title, data.secrets, data.whitelist_model_ids)
                .map_err(to_napi_error)?;
        to_value(&profile)
    }

    #[napi]
    pub fn remove_ai_profile(&self, data: serde_json::Value) -> Result<()> {
        let data: koloda::domain::ai::RemoveProfileData = from_wire(data)?;
        repo::ai::remove_ai_profile(&self.db, &data.id).map_err(to_napi_error)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn wire_shape_rejection_carries_code_envelope() {
        // Pins I5: serde failures must reach the renderer as `{code, details}`
        // so `parseElectronError` builds a classified `AppError`, not a raw string.
        let result: Result<SeedData> = from_wire(serde_json::json!({ "id": 123 }));
        let payload: serde_json::Value =
            serde_json::from_str(&result.unwrap_err().reason).expect("envelope must be JSON");
        assert_eq!(payload["code"], "unknown");
        assert!(payload["details"].as_str().unwrap().contains("missing field"));
    }
}
