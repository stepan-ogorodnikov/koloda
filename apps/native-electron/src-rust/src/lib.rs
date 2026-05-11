use koloda_core::app::db::Database;
use koloda_core::app::error::AppError;
use koloda_core::app::init::{self as init_mod, SeedData};
use koloda_core::domain::lessons::GetLessonsParams;
use koloda_core::domain::reviews::GetReviewTotalsParams;
use koloda_core::domain::settings::SettingsName;
use koloda_core::repo;
use napi::bindgen_prelude::*;
use napi_derive::napi;

fn to_napi_error(err: AppError) -> Error {
    let error_json = serde_json::json!({
        "code": err.code,
        "details": err.details
    });
    Error::from_reason(error_json.to_string())
}

fn parse_settings_name(name: &str) -> Result<SettingsName> {
    let json_name = format!("\"{}\"", name);
    serde_json::from_str(&json_name).map_err(|e| Error::from_reason(e.to_string()))
}

fn as_json<T: serde::Serialize>(val: &T) -> Result<String> {
    serde_json::to_string(val).map_err(|e| Error::from_reason(e.to_string()))
}

fn extract_id(params: serde_json::Value) -> Result<i64> {
    #[derive(serde::Deserialize)]
    struct P {
        id: i64,
    }
    serde_json::from_value::<P>(params)
        .map(|p| p.id)
        .map_err(|e| Error::from_reason(e.to_string()))
}

fn extract_name(params: serde_json::Value) -> Result<String> {
    #[derive(serde::Deserialize)]
    struct P {
        name: String,
    }
    serde_json::from_value::<P>(params)
        .map(|p| p.name)
        .map_err(|e| Error::from_reason(e.to_string()))
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
            koloda_core::app::init::DbStatus::Blank => "blank".to_string(),
            koloda_core::app::init::DbStatus::Ok => "ok".to_string(),
        })
    }

    #[napi]
    pub fn seed_db(&self, data: serde_json::Value) -> Result<String> {
        let data: SeedData = serde_json::from_value(data)
            .map_err(|e| Error::from_reason(e.to_string()))?;
        init_mod::seed_db(&self.db, data).map_err(to_napi_error)?;
        Ok("true".to_string())
    }

    #[napi]
    pub fn get_cards(&self, params: serde_json::Value) -> Result<String> {
        let params: koloda_core::domain::cards::GetCardsParams =
            serde_json::from_value(params).map_err(|e| Error::from_reason(e.to_string()))?;
        let cards = repo::cards::get_cards(&self.db, params.deck_id).map_err(to_napi_error)?;
        as_json(&cards)
    }

    #[napi]
    pub fn get_card(&self, params: serde_json::Value) -> Result<Option<String>> {
        let id = extract_id(params)?;
        let card = repo::cards::get_card(&self.db, id).map_err(to_napi_error)?;
        Ok(card.map(|c| serde_json::to_string(&c).unwrap_or_default()))
    }

    #[napi]
    pub fn add_card(&self, data: serde_json::Value) -> Result<String> {
        let data = serde_json::from_value(data).map_err(|e| Error::from_reason(e.to_string()))?;
        let card = repo::cards::add_card(&self.db, data).map_err(to_napi_error)?;
        as_json(&card)
    }

    #[napi]
    pub fn add_cards(&self, cards_data: serde_json::Value) -> Result<String> {
        let cards = serde_json::from_value(cards_data).map_err(|e| Error::from_reason(e.to_string()))?;
        let result = repo::cards::add_cards(&self.db, cards).map_err(to_napi_error)?;
        as_json(&result)
    }

    #[napi]
    pub fn update_card(&self, data: serde_json::Value) -> Result<String> {
        let data = serde_json::from_value(data).map_err(|e| Error::from_reason(e.to_string()))?;
        let card = repo::cards::update_card(&self.db, data).map_err(to_napi_error)?;
        as_json(&card)
    }

    #[napi]
    pub fn delete_card(&self, data: serde_json::Value) -> Result<()> {
        let data = serde_json::from_value(data).map_err(|e| Error::from_reason(e.to_string()))?;
        repo::cards::delete_card(&self.db, data).map_err(to_napi_error)
    }

    #[napi]
    pub fn delete_cards(&self, data: serde_json::Value) -> Result<()> {
        let data = serde_json::from_value(data).map_err(|e| Error::from_reason(e.to_string()))?;
        repo::cards::delete_cards(&self.db, data).map_err(to_napi_error)
    }

    #[napi]
    pub fn reset_card_progress(&self, data: serde_json::Value) -> Result<String> {
        let data = serde_json::from_value(data).map_err(|e| Error::from_reason(e.to_string()))?;
        let card = repo::cards::reset_card_progress(&self.db, data).map_err(to_napi_error)?;
        as_json(&card)
    }

    #[napi]
    pub fn get_algorithms(&self) -> Result<String> {
        let algorithms = repo::algorithms::get_algorithms(&self.db).map_err(to_napi_error)?;
        as_json(&algorithms)
    }

    #[napi]
    pub fn get_algorithm(&self, params: serde_json::Value) -> Result<Option<String>> {
        let id = extract_id(params)?;
        let algorithm = repo::algorithms::get_algorithm(&self.db, id).map_err(to_napi_error)?;
        Ok(algorithm.map(|a| serde_json::to_string(&a).unwrap_or_default()))
    }

    #[napi]
    pub fn add_algorithm(&self, data: serde_json::Value) -> Result<String> {
        let data = serde_json::from_value(data).map_err(|e| Error::from_reason(e.to_string()))?;
        let algorithm = repo::algorithms::add_algorithm(&self.db, data).map_err(to_napi_error)?;
        as_json(&algorithm)
    }

    #[napi]
    pub fn update_algorithm(&self, data: serde_json::Value) -> Result<String> {
        let data = serde_json::from_value(data).map_err(|e| Error::from_reason(e.to_string()))?;
        let algorithm = repo::algorithms::update_algorithm(&self.db, data).map_err(to_napi_error)?;
        as_json(&algorithm)
    }

    #[napi]
    pub fn clone_algorithm(&self, data: serde_json::Value) -> Result<String> {
        let data = serde_json::from_value(data).map_err(|e| Error::from_reason(e.to_string()))?;
        let algorithm = repo::algorithms::clone_algorithm(&self.db, data).map_err(to_napi_error)?;
        as_json(&algorithm)
    }

    #[napi]
    pub fn delete_algorithm(&self, data: serde_json::Value) -> Result<()> {
        let data = serde_json::from_value(data).map_err(|e| Error::from_reason(e.to_string()))?;
        repo::algorithms::delete_algorithm(&self.db, data).map_err(to_napi_error)
    }

    #[napi]
    pub fn get_algorithm_decks(&self, params: serde_json::Value) -> Result<String> {
        let id = extract_id(params)?;
        let decks = repo::algorithms::get_algorithm_decks(&self.db, id).map_err(to_napi_error)?;
        as_json(&decks)
    }

    #[napi]
    pub fn get_decks(&self) -> Result<String> {
        let decks = repo::decks::get_decks(&self.db).map_err(to_napi_error)?;
        as_json(&decks)
    }

    #[napi]
    pub fn get_deck(&self, params: serde_json::Value) -> Result<Option<String>> {
        let id = extract_id(params)?;
        let deck = repo::decks::get_deck(&self.db, id).map_err(to_napi_error)?;
        Ok(deck.map(|d| serde_json::to_string(&d).unwrap_or_default()))
    }

    #[napi]
    pub fn add_deck(&self, data: serde_json::Value) -> Result<String> {
        let data = serde_json::from_value(data).map_err(|e| Error::from_reason(e.to_string()))?;
        let deck = repo::decks::add_deck(&self.db, data).map_err(to_napi_error)?;
        as_json(&deck)
    }

    #[napi]
    pub fn update_deck(&self, data: serde_json::Value) -> Result<String> {
        let data = serde_json::from_value(data).map_err(|e| Error::from_reason(e.to_string()))?;
        let deck = repo::decks::update_deck(&self.db, data).map_err(to_napi_error)?;
        as_json(&deck)
    }

    #[napi]
    pub fn delete_deck(&self, data: serde_json::Value) -> Result<()> {
        let data = serde_json::from_value(data).map_err(|e| Error::from_reason(e.to_string()))?;
        repo::decks::delete_deck(&self.db, data).map_err(to_napi_error)
    }

    #[napi]
    pub fn get_templates(&self) -> Result<String> {
        let templates = repo::templates::get_templates(&self.db).map_err(to_napi_error)?;
        as_json(&templates)
    }

    #[napi]
    pub fn get_template(&self, params: serde_json::Value) -> Result<Option<String>> {
        let id = extract_id(params)?;
        let template = repo::templates::get_template(&self.db, id).map_err(to_napi_error)?;
        Ok(template.map(|t| serde_json::to_string(&t).unwrap_or_default()))
    }

    #[napi]
    pub fn add_template(&self, data: serde_json::Value) -> Result<String> {
        let data = serde_json::from_value(data).map_err(|e| Error::from_reason(e.to_string()))?;
        let template = repo::templates::add_template(&self.db, data).map_err(to_napi_error)?;
        as_json(&template)
    }

    #[napi]
    pub fn update_template(&self, data: serde_json::Value) -> Result<String> {
        let data = serde_json::from_value(data).map_err(|e| Error::from_reason(e.to_string()))?;
        let template = repo::templates::update_template(&self.db, data).map_err(to_napi_error)?;
        as_json(&template)
    }

    #[napi]
    pub fn clone_template(&self, data: serde_json::Value) -> Result<String> {
        let data = serde_json::from_value(data).map_err(|e| Error::from_reason(e.to_string()))?;
        let template = repo::templates::clone_template(&self.db, data).map_err(to_napi_error)?;
        as_json(&template)
    }

    #[napi]
    pub fn delete_template(&self, data: serde_json::Value) -> Result<()> {
        let data = serde_json::from_value(data).map_err(|e| Error::from_reason(e.to_string()))?;
        repo::templates::delete_template(&self.db, data).map_err(to_napi_error)
    }

    #[napi]
    pub fn get_template_decks(&self, params: serde_json::Value) -> Result<String> {
        let id = extract_id(params)?;
        let decks = repo::templates::get_template_decks(&self.db, id).map_err(to_napi_error)?;
        as_json(&decks)
    }

    #[napi]
    pub fn get_settings(&self, params: serde_json::Value) -> Result<String> {
        let name = extract_name(params)?;
        let name = parse_settings_name(&name)?;
        let settings = repo::settings::get_settings(&self.db, name).map_err(to_napi_error)?;
        Ok(settings.map(|s| serde_json::to_string(&s).unwrap_or_default()).unwrap_or_else(|| "null".to_string()))
    }

    #[napi]
    pub fn set_settings(&self, params: serde_json::Value) -> Result<()> {
        #[derive(serde::Deserialize)]
        struct P {
            name: String,
            content: serde_json::Value,
        }
        let p: P = serde_json::from_value(params).map_err(|e| Error::from_reason(e.to_string()))?;
        let name = parse_settings_name(&p.name)?;
        repo::settings::set_settings(&self.db, name, p.content).map_err(to_napi_error)?;
        Ok(())
    }

    #[napi]
    pub fn patch_settings(&self, params: serde_json::Value) -> Result<String> {
        #[derive(serde::Deserialize)]
        struct P {
            name: String,
            patch: serde_json::Value,
        }
        let p: P = serde_json::from_value(params).map_err(|e| Error::from_reason(e.to_string()))?;
        let name = parse_settings_name(&p.name)?;
        let settings = repo::settings::patch_settings(&self.db, name, p.patch).map_err(to_napi_error)?;
        as_json(&settings)
    }

    #[napi]
    pub fn get_lessons(&self, params: serde_json::Value) -> Result<String> {
        let params: GetLessonsParams =
            serde_json::from_value(params).map_err(|e| Error::from_reason(e.to_string()))?;
        let lessons = repo::lessons::get_lessons(&self.db, params).map_err(to_napi_error)?;
        as_json(&lessons)
    }

    #[napi]
    pub fn get_lesson_data(&self, params: serde_json::Value) -> Result<String> {
        let params = serde_json::from_value(params).map_err(|e| Error::from_reason(e.to_string()))?;
        let data = repo::lessons::get_lesson_data(&self.db, &params).map_err(to_napi_error)?;
        Ok(data.map(|d| serde_json::to_string(&d).unwrap_or_default()).unwrap_or_else(|| "null".to_string()))
    }

    #[napi]
    pub fn submit_lesson_result(&self, data: serde_json::Value) -> Result<()> {
        let data = serde_json::from_value(data).map_err(|e| Error::from_reason(e.to_string()))?;
        repo::lessons::submit_lesson_result(&self.db, data).map_err(to_napi_error)
    }

    #[napi]
    pub fn get_reviews(&self, data: serde_json::Value) -> Result<String> {
        let data = serde_json::from_value(data).map_err(|e| Error::from_reason(e.to_string()))?;
        let reviews = repo::reviews::get_reviews(&self.db, data).map_err(to_napi_error)?;
        as_json(&reviews)
    }

    #[napi]
    pub fn get_review_totals(&self, params: serde_json::Value) -> Result<String> {
        let params: GetReviewTotalsParams =
            serde_json::from_value(params).map_err(|e| Error::from_reason(e.to_string()))?;
        let totals = repo::reviews::get_review_totals(&self.db, params).map_err(to_napi_error)?;
        as_json(&totals)
    }

    #[napi]
    pub fn get_todays_review_totals(&self) -> Result<String> {
        let totals = repo::reviews::get_todays_review_totals(&self.db).map_err(to_napi_error)?;
        as_json(&totals)
    }

    #[napi]
    pub fn get_ai_profiles(&self) -> Result<String> {
        let profiles = repo::ai::get_ai_profiles(&self.db).map_err(to_napi_error)?;
        as_json(&profiles)
    }

    #[napi]
    pub fn add_ai_profile(&self, data: serde_json::Value) -> Result<String> {
        let data: koloda_core::domain::ai::AddProfileData =
            serde_json::from_value(data).map_err(|e| Error::from_reason(e.to_string()))?;
        let profile = repo::ai::add_ai_profile(&self.db, data.title, data.secrets)
            .map_err(to_napi_error)?;
        as_json(&profile)
    }

    #[napi]
    pub fn update_ai_profile(&self, data: serde_json::Value) -> Result<String> {
        let data: koloda_core::domain::ai::UpdateProfileData =
            serde_json::from_value(data).map_err(|e| Error::from_reason(e.to_string()))?;
        let profile = repo::ai::update_ai_profile(&self.db, &data.id, data.title, data.secrets)
            .map_err(to_napi_error)?;
        as_json(&profile)
    }

    #[napi]
    pub fn remove_ai_profile(&self, data: serde_json::Value) -> Result<()> {
        let data: koloda_core::domain::ai::RemoveProfileData =
            serde_json::from_value(data).map_err(|e| Error::from_reason(e.to_string()))?;
        repo::ai::remove_ai_profile(&self.db, &data.id).map_err(to_napi_error)
    }

    #[napi]
    pub fn touch_ai_profile(&self, data: serde_json::Value) -> Result<()> {
        let data: koloda_core::domain::ai::TouchProfileData =
            serde_json::from_value(data).map_err(|e| Error::from_reason(e.to_string()))?;
        repo::ai::touch_ai_profile(&self.db, &data.id, data.model_id).map_err(to_napi_error)
    }

    #[napi]
    pub fn checkpoint(&self) -> Result<()> {
        self.db.checkpoint().map_err(to_napi_error)
    }
}
