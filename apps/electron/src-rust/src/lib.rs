use base64::prelude::{Engine as _, BASE64_STANDARD};
use koloda::app::db::Database;
use koloda::app::error::{error_codes, AppError};
use koloda::app::init::{self as init_mod, SeedData};
use koloda::domain::attachments::{AddAttachmentData, Attachment};
use koloda::domain::lessons::GetLessonsParams;
use koloda::domain::settings::SettingsName;
use koloda::repo;
use napi::bindgen_prelude::*;
use napi::{Env, JsObject};
use napi_derive::napi;
use std::num::NonZeroU32;
use std::panic::{self, AssertUnwindSafe};
use std::sync::mpsc::{self, Sender};
use std::thread;

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

// WHY: `toWire` walks a `Uint8Array` as a plain object, so attachment bytes cross IPC as base64.
#[derive(serde::Serialize)]
struct AttachmentContentWire {
    #[serde(flatten)]
    attachment: Attachment,
    bytes: String,
}

#[derive(serde::Deserialize)]
struct AddAttachmentWire {
    bytes: String,
    width: Option<NonZeroU32>,
    height: Option<NonZeroU32>,
}

type Job = Box<dyn FnOnce(&Database) + Send>;

// WHY: SQLite work used to run on Electron's main thread, so a slow query froze every
// window. Each method now queues its body on one dedicated thread and returns a Promise.
// INVARIANT: one FIFO worker — jobs run in call order, exactly as the synchronous calls did,
// so a read issued after a write always sees it. Do not move this onto the libuv pool.
#[napi]
pub struct KolodaDb {
    jobs: Sender<Job>,
}

impl KolodaDb {
    fn run<T, F>(&self, env: Env, work: F) -> Result<JsObject>
    where
        T: ToNapiValue + Send + 'static,
        F: FnOnce(&Database) -> Result<T> + Send + 'static,
    {
        let (deferred, promise) = env.create_deferred()?;
        let job: Job = Box::new(move |db| {
            // WHY: a panic would otherwise kill the worker and leave every later call pending.
            match panic::catch_unwind(AssertUnwindSafe(|| work(db))) {
                Ok(Ok(value)) => deferred.resolve(move |_| Ok(value)),
                Ok(Err(err)) => deferred.reject(err),
                Err(_) => deferred.reject(to_napi_error(AppError::new(
                    error_codes::UNKNOWN,
                    Some("Database worker panicked".to_string()),
                ))),
            }
        });
        self.jobs.send(job).map_err(|e| {
            to_napi_error(AppError::new(
                error_codes::UNKNOWN,
                Some(format!("Database worker stopped: {e}")),
            ))
        })?;
        Ok(promise)
    }
}

#[napi]
impl KolodaDb {
    // WHY: open + migrate stays synchronous; it runs once at startup before any window exists.
    #[napi(constructor)]
    pub fn new(db_path: String) -> Result<Self> {
        let db = Database::init(db_path).map_err(to_napi_error)?;
        let (jobs, queue) = mpsc::channel::<Job>();
        thread::Builder::new()
            .name("koloda-db".to_string())
            .spawn(move || {
                for job in queue {
                    job(&db);
                }
            })
            .map_err(|e| to_napi_error(AppError::new(error_codes::UNKNOWN, Some(e.to_string()))))?;
        Ok(Self { jobs })
    }

    #[napi]
    pub fn get_db_status(&self, env: Env) -> Result<JsObject> {
        self.run(env, move |db| {
            let status = init_mod::get_db_status(db).map_err(to_napi_error)?;
            Ok(match status {
                koloda::app::init::DbStatus::Blank => "blank".to_string(),
                koloda::app::init::DbStatus::Ok => "ok".to_string(),
            })
        })
    }

    #[napi]
    pub fn seed_db(&self, env: Env, data: serde_json::Value) -> Result<JsObject> {
        self.run(env, move |db| {
            let data: SeedData = from_wire(data)?;
            init_mod::seed_db(db, data).map_err(to_napi_error)
        })
    }

    #[napi]
    pub fn get_cards(&self, env: Env, params: serde_json::Value) -> Result<JsObject> {
        self.run(env, move |db| {
            let params: koloda::domain::cards::GetCardsParams = from_wire(params)?;
            let cards = repo::cards::get_cards(db, &params.deck_id).map_err(to_napi_error)?;
            to_value(&cards)
        })
    }

    #[napi]
    pub fn get_card_counts(&self, env: Env) -> Result<JsObject> {
        self.run(env, move |db| {
            let counts = repo::cards::get_card_counts(db).map_err(to_napi_error)?;
            to_value(&counts)
        })
    }

    #[napi]
    pub fn get_card(&self, env: Env, params: serde_json::Value) -> Result<JsObject> {
        self.run(env, move |db| {
            let id = extract_id(params)?;
            let card = repo::cards::get_card(db, &id).map_err(to_napi_error)?;
            card.map(|c| to_value(&c)).transpose()
        })
    }

    #[napi]
    pub fn add_card(&self, env: Env, data: serde_json::Value) -> Result<JsObject> {
        self.run(env, move |db| {
            let data = from_wire(data)?;
            let card = repo::cards::add_card(db, data).map_err(to_napi_error)?;
            to_value(&card)
        })
    }

    #[napi]
    pub fn add_cards(&self, env: Env, cards_data: serde_json::Value) -> Result<JsObject> {
        self.run(env, move |db| {
            let cards = from_wire(cards_data)?;
            let result = repo::cards::add_cards(db, cards).map_err(to_napi_error)?;
            to_value(&result)
        })
    }

    #[napi]
    pub fn update_card(&self, env: Env, data: serde_json::Value) -> Result<JsObject> {
        self.run(env, move |db| {
            let data = from_wire(data)?;
            let card = repo::cards::update_card(db, data).map_err(to_napi_error)?;
            to_value(&card)
        })
    }

    #[napi]
    pub fn delete_card(&self, env: Env, data: serde_json::Value) -> Result<JsObject> {
        self.run(env, move |db| {
            let data = from_wire(data)?;
            repo::cards::delete_card(db, data).map_err(to_napi_error)
        })
    }

    #[napi]
    pub fn delete_cards(&self, env: Env, data: serde_json::Value) -> Result<JsObject> {
        self.run(env, move |db| {
            let data = from_wire(data)?;
            repo::cards::delete_cards(db, data).map_err(to_napi_error)
        })
    }

    #[napi]
    pub fn reset_card_progress(&self, env: Env, data: serde_json::Value) -> Result<JsObject> {
        self.run(env, move |db| {
            let data = from_wire(data)?;
            let card = repo::cards::reset_card_progress(db, data).map_err(to_napi_error)?;
            to_value(&card)
        })
    }

    #[napi]
    pub fn get_algorithms(&self, env: Env) -> Result<JsObject> {
        self.run(env, move |db| {
            let algorithms = repo::algorithms::get_algorithms(db).map_err(to_napi_error)?;
            to_value(&algorithms)
        })
    }

    #[napi]
    pub fn get_algorithm(&self, env: Env, params: serde_json::Value) -> Result<JsObject> {
        self.run(env, move |db| {
            let id = extract_id(params)?;
            let algorithm = repo::algorithms::get_algorithm(db, &id).map_err(to_napi_error)?;
            algorithm.map(|a| to_value(&a)).transpose()
        })
    }

    #[napi]
    pub fn add_algorithm(&self, env: Env, data: serde_json::Value) -> Result<JsObject> {
        self.run(env, move |db| {
            let data = from_wire(data)?;
            let algorithm = repo::algorithms::add_algorithm(db, data).map_err(to_napi_error)?;
            to_value(&algorithm)
        })
    }

    #[napi]
    pub fn update_algorithm(&self, env: Env, data: serde_json::Value) -> Result<JsObject> {
        self.run(env, move |db| {
            let data = from_wire(data)?;
            let algorithm = repo::algorithms::update_algorithm(db, data).map_err(to_napi_error)?;
            to_value(&algorithm)
        })
    }

    #[napi]
    pub fn clone_algorithm(&self, env: Env, data: serde_json::Value) -> Result<JsObject> {
        self.run(env, move |db| {
            let data = from_wire(data)?;
            let algorithm = repo::algorithms::clone_algorithm(db, data).map_err(to_napi_error)?;
            to_value(&algorithm)
        })
    }

    #[napi]
    pub fn delete_algorithm(&self, env: Env, data: serde_json::Value) -> Result<JsObject> {
        self.run(env, move |db| {
            let data = from_wire(data)?;
            repo::algorithms::delete_algorithm(db, data).map_err(to_napi_error)
        })
    }

    #[napi]
    pub fn get_algorithm_decks(&self, env: Env, params: serde_json::Value) -> Result<JsObject> {
        self.run(env, move |db| {
            let id = extract_id(params)?;
            let decks = repo::algorithms::get_algorithm_decks(db, &id).map_err(to_napi_error)?;
            to_value(&decks)
        })
    }

    #[napi]
    pub fn get_decks(&self, env: Env) -> Result<JsObject> {
        self.run(env, move |db| {
            let decks = repo::decks::get_decks(db).map_err(to_napi_error)?;
            to_value(&decks)
        })
    }

    #[napi]
    pub fn get_deck(&self, env: Env, params: serde_json::Value) -> Result<JsObject> {
        self.run(env, move |db| {
            let id = extract_id(params)?;
            let deck = repo::decks::get_deck(db, &id).map_err(to_napi_error)?;
            deck.map(|d| to_value(&d)).transpose()
        })
    }

    #[napi]
    pub fn add_deck(&self, env: Env, data: serde_json::Value) -> Result<JsObject> {
        self.run(env, move |db| {
            let data = from_wire(data)?;
            let deck = repo::decks::add_deck(db, data).map_err(to_napi_error)?;
            to_value(&deck)
        })
    }

    #[napi]
    pub fn update_deck(&self, env: Env, data: serde_json::Value) -> Result<JsObject> {
        self.run(env, move |db| {
            let data = from_wire(data)?;
            let deck = repo::decks::update_deck(db, data).map_err(to_napi_error)?;
            to_value(&deck)
        })
    }

    #[napi]
    pub fn delete_deck(&self, env: Env, data: serde_json::Value) -> Result<JsObject> {
        self.run(env, move |db| {
            let data = from_wire(data)?;
            repo::decks::delete_deck(db, data).map_err(to_napi_error)
        })
    }

    #[napi]
    pub fn get_templates(&self, env: Env) -> Result<JsObject> {
        self.run(env, move |db| {
            let templates = repo::templates::get_templates(db).map_err(to_napi_error)?;
            to_value(&templates)
        })
    }

    #[napi]
    pub fn get_template(&self, env: Env, params: serde_json::Value) -> Result<JsObject> {
        self.run(env, move |db| {
            let id = extract_id(params)?;
            let template = repo::templates::get_template(db, &id).map_err(to_napi_error)?;
            template.map(|t| to_value(&t)).transpose()
        })
    }

    #[napi]
    pub fn add_template(&self, env: Env, data: serde_json::Value) -> Result<JsObject> {
        self.run(env, move |db| {
            let data = from_wire(data)?;
            let template = repo::templates::add_template(db, data).map_err(to_napi_error)?;
            to_value(&template)
        })
    }

    #[napi]
    pub fn update_template(&self, env: Env, data: serde_json::Value) -> Result<JsObject> {
        self.run(env, move |db| {
            let data = from_wire(data)?;
            let template = repo::templates::update_template(db, data).map_err(to_napi_error)?;
            to_value(&template)
        })
    }

    #[napi]
    pub fn clone_template(&self, env: Env, data: serde_json::Value) -> Result<JsObject> {
        self.run(env, move |db| {
            let data = from_wire(data)?;
            let template = repo::templates::clone_template(db, data).map_err(to_napi_error)?;
            to_value(&template)
        })
    }

    #[napi]
    pub fn delete_template(&self, env: Env, data: serde_json::Value) -> Result<JsObject> {
        self.run(env, move |db| {
            let data = from_wire(data)?;
            repo::templates::delete_template(db, data).map_err(to_napi_error)
        })
    }

    #[napi]
    pub fn get_template_decks(&self, env: Env, params: serde_json::Value) -> Result<JsObject> {
        self.run(env, move |db| {
            let id = extract_id(params)?;
            let decks = repo::templates::get_template_decks(db, &id).map_err(to_napi_error)?;
            to_value(&decks)
        })
    }

    #[napi]
    pub fn get_settings(&self, env: Env, params: serde_json::Value) -> Result<JsObject> {
        self.run(env, move |db| {
            let name = extract_name(params)?;
            let name = parse_settings_name(&name)?;
            let settings = repo::settings::get_settings(db, name).map_err(to_napi_error)?;
            settings.map(|s| to_value(&s)).transpose()
        })
    }

    #[napi]
    pub fn set_settings(&self, env: Env, params: serde_json::Value) -> Result<JsObject> {
        self.run(env, move |db| {
            #[derive(serde::Deserialize)]
            struct P {
                name: String,
                content: serde_json::Value,
            }
            let p: P = from_wire(params)?;
            let name = parse_settings_name(&p.name)?;
            let settings = repo::settings::set_settings(db, name, p.content).map_err(to_napi_error)?;
            to_value(&settings)
        })
    }

    #[napi]
    pub fn patch_settings(&self, env: Env, params: serde_json::Value) -> Result<JsObject> {
        self.run(env, move |db| {
            #[derive(serde::Deserialize)]
            struct P {
                name: String,
                content: serde_json::Value,
            }
            let p: P = from_wire(params)?;
            let name = parse_settings_name(&p.name)?;
            let settings = repo::settings::patch_settings(db, name, p.content).map_err(to_napi_error)?;
            to_value(&settings)
        })
    }

    #[napi]
    pub fn get_conversation(&self, env: Env, params: serde_json::Value) -> Result<JsObject> {
        self.run(env, move |db| {
            #[derive(serde::Deserialize)]
            struct P {
                id: String,
            }
            let p: P = from_wire(params)?;
            let conversation = repo::conversations::get_conversation(db, &p.id).map_err(to_napi_error)?;
            conversation.map(|c| to_value(&c)).transpose()
        })
    }

    #[napi]
    pub fn get_conversations(&self, env: Env) -> Result<JsObject> {
        self.run(env, move |db| {
            let conversations = repo::conversations::get_conversations(db).map_err(to_napi_error)?;
            to_value(&conversations)
        })
    }

    #[napi]
    pub fn set_conversation(&self, env: Env, params: serde_json::Value) -> Result<JsObject> {
        self.run(env, move |db| {
            let input: repo::conversations::SetConversationInput = from_wire(params)?;
            let conversation = repo::conversations::set_conversation(db, input).map_err(to_napi_error)?;
            to_value(&conversation)
        })
    }

    #[napi]
    pub fn delete_conversation(&self, env: Env, params: serde_json::Value) -> Result<JsObject> {
        self.run(env, move |db| {
            #[derive(serde::Deserialize)]
            struct P {
                id: String,
            }
            let p: P = from_wire(params)?;
            repo::conversations::delete_conversation(db, &p.id).map_err(to_napi_error)
        })
    }

    #[napi]
    pub fn get_lessons(&self, env: Env, params: serde_json::Value) -> Result<JsObject> {
        self.run(env, move |db| {
            let params: GetLessonsParams = from_wire(params)?;
            let lessons = repo::lessons::get_lessons(db, params).map_err(to_napi_error)?;
            to_value(&lessons)
        })
    }

    #[napi]
    pub fn get_lesson_data(&self, env: Env, params: serde_json::Value) -> Result<JsObject> {
        self.run(env, move |db| {
            let params = from_wire(params)?;
            let data = repo::lessons::get_lesson_data(db, &params).map_err(to_napi_error)?;
            data.map(|d| to_value(&d)).transpose()
        })
    }

    #[napi]
    pub fn submit_lesson_result(&self, env: Env, data: serde_json::Value) -> Result<JsObject> {
        self.run(env, move |db| {
            let data = from_wire(data)?;
            repo::lessons::submit_lesson_result(db, data).map_err(to_napi_error)
        })
    }

    #[napi]
    pub fn get_reviews(&self, env: Env, params: serde_json::Value) -> Result<JsObject> {
        self.run(env, move |db| {
            let params = from_wire(params)?;
            let reviews = repo::reviews::get_reviews(db, params).map_err(to_napi_error)?;
            to_value(&reviews)
        })
    }

    #[napi]
    pub fn get_todays_review_totals(&self, env: Env) -> Result<JsObject> {
        self.run(env, move |db| {
            let totals = repo::reviews::get_todays_review_totals(db).map_err(to_napi_error)?;
            to_value(&totals)
        })
    }

    #[napi]
    pub fn get_attachment(&self, env: Env, params: serde_json::Value) -> Result<JsObject> {
        self.run(env, move |db| {
            let id = extract_id(params)?;
            let Some(attachment) = repo::attachments::get_attachment(db, &id).map_err(to_napi_error)? else {
                return Ok(None);
            };
            let Some(bytes) = repo::attachments::get_attachment_bytes(db, &id).map_err(to_napi_error)? else {
                return Ok(None);
            };
            to_value(&AttachmentContentWire {
                attachment,
                bytes: BASE64_STANDARD.encode(bytes),
            })
            .map(Some)
        })
    }

    #[napi]
    pub fn add_attachment(&self, env: Env, data: serde_json::Value) -> Result<JsObject> {
        self.run(env, move |db| {
            let wire: AddAttachmentWire = from_wire(data)?;
            let bytes = BASE64_STANDARD
                .decode(wire.bytes)
                .map_err(|e| to_napi_error(AppError::new(error_codes::UNKNOWN, Some(e.to_string()))))?;
            let data = AddAttachmentData {
                bytes,
                width: wire.width,
                height: wire.height,
            };
            let attachment = repo::attachments::add_attachment(db, data).map_err(to_napi_error)?;
            to_value(&attachment)
        })
    }

    #[napi]
    pub fn get_ai_profiles(&self, env: Env) -> Result<JsObject> {
        self.run(env, move |db| {
            let profiles = repo::ai::get_ai_profiles(db).map_err(to_napi_error)?;
            to_value(&profiles)
        })
    }

    // INVARIANT: Main-process only — usable secrets for host AI handlers.
    // Do not register as a renderer `cmd_*`.
    #[napi]
    pub fn get_ai_profile_secrets(&self, env: Env, profile_id: String) -> Result<JsObject> {
        self.run(env, move |db| {
            let secrets = repo::ai::get_ai_profile_secrets(db, &profile_id).map_err(to_napi_error)?;
            to_value(&secrets)
        })
    }

    #[napi]
    pub fn add_ai_profile(&self, env: Env, data: serde_json::Value) -> Result<JsObject> {
        self.run(env, move |db| {
            let data: koloda::domain::ai::AddProfileData = from_wire(data)?;
            let profile = repo::ai::add_ai_profile(db, data.title, data.secrets, data.whitelist_model_ids)
                .map_err(to_napi_error)?;
            to_value(&profile)
        })
    }

    #[napi]
    pub fn update_ai_profile(&self, env: Env, data: serde_json::Value) -> Result<JsObject> {
        self.run(env, move |db| {
            let data: koloda::domain::ai::UpdateProfileData = from_wire(data)?;
            let profile = repo::ai::update_ai_profile(db, &data.id, data.title, data.secrets, data.whitelist_model_ids)
                .map_err(to_napi_error)?;
            to_value(&profile)
        })
    }

    #[napi]
    pub fn remove_ai_profile(&self, env: Env, data: serde_json::Value) -> Result<JsObject> {
        self.run(env, move |db| {
            let data: koloda::domain::ai::RemoveProfileData = from_wire(data)?;
            repo::ai::remove_ai_profile(db, &data.id).map_err(to_napi_error)
        })
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
