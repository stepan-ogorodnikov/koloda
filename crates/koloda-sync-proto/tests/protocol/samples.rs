//! One sample payload per registry group plus deletes, with fixed ids and stamps.

use koloda_sync_proto::hlc::{DeviceId, Hlc, Stamp};
use koloda_sync_proto::payload::{
    AlgorithmRevision, CardContent, CardCreate, CardReset, CardScheduling, DeckAlgorithm, DeckCreate, DeckTemplate,
    DefaultAlgorithm, DefaultTemplate, Delete, DocumentCreate, InitialProductTs, JsonContent, Notes, Payload, Review,
    Seal, SettingValue, Title,
};
use koloda_sync_proto::registry::Kind;

pub const DECK_ID: &str = "01920000-0000-7000-8000-000000000001";
pub const CARD_ID: &str = "01920000-0000-7000-8000-000000000002";
pub const TEMPLATE_ID: &str = "01920000-0000-7000-8000-000000000003";
pub const ALGORITHM_ID: &str = "01920000-0000-7000-8000-000000000004";
pub const ATTACHMENT_A: &str = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
pub const ATTACHMENT_B: &str = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

pub struct Sample {
    pub name: &'static str,
    pub seal: Seal,
    pub payload: Payload,
}

pub fn stamp() -> Stamp {
    Stamp {
        hlc: Hlc::new(1_727_000_000_000, 2).expect("sample stamp fits in 48 bits"),
        device: DeviceId([0x11; 16]),
    }
}

pub fn seal_for(id: &str, parent: Option<&str>) -> Seal {
    Seal {
        id: id.to_string(),
        parent: parent.map(str::to_string),
        stamp: stamp(),
        commit_id: [0x22; 16],
    }
}

pub fn scheduling() -> CardScheduling {
    CardScheduling {
        state: 2,
        due_at: Some(1_727_100_000_000),
        stability: 12.5,
        difficulty: 4.75,
        scheduled_days: 9,
        learning_steps: 1,
        reps: 3,
        lapses: 1,
        last_reviewed_at: Some(1_726_900_000_000),
    }
}

pub fn card_content_text() -> String {
    format!(r#"{{"front":{{"text":"![cat](attachment:{ATTACHMENT_B}) and ![dog](attachment:{ATTACHMENT_A})"}}}}"#)
}

fn document_create(content: &str) -> DocumentCreate {
    DocumentCreate {
        title: "Basic".to_string(),
        notes: Some("For vocabulary".to_string()),
        content: content.to_string(),
        created_at: 1_726_000_000_000,
        initial_product_ts: InitialProductTs::new(),
        legacy_product_ts_floor: None,
    }
}

pub fn samples() -> Vec<Sample> {
    let title = || Title {
        title: "Spanish".to_string(),
        updated_at: Some(1_727_000_000_000),
    };
    let notes = || Notes {
        notes: None,
        updated_at: Some(1_727_000_000_000),
    };
    let sample = |name, id: &str, parent: Option<&str>, payload| Sample {
        name,
        seal: seal_for(id, parent),
        payload,
    };
    vec![
        sample(
            "cards.create",
            CARD_ID,
            None,
            Payload::CardCreate(CardCreate {
                deck_id: DECK_ID.to_string(),
                template_id: TEMPLATE_ID.to_string(),
                content: card_content_text(),
                scheduling: scheduling(),
                created_at: 1_726_000_000_000,
                initial_product_ts: InitialProductTs::from([("content".to_string(), 1_726_500_000_000)]),
                legacy_product_ts_floor: Some(1_726_400_000_000),
            }),
        ),
        sample(
            "cards.content",
            CARD_ID,
            Some(DECK_ID),
            Payload::CardContent(CardContent {
                content: card_content_text(),
                updated_at: Some(1_727_000_000_000),
            }),
        ),
        sample(
            "cards.scheduling",
            CARD_ID,
            Some(DECK_ID),
            Payload::CardScheduling(scheduling()),
        ),
        sample(
            "cards.reset",
            CARD_ID,
            Some(DECK_ID),
            Payload::CardReset(CardReset {
                wall_ms: 1_727_000_000_000,
            }),
        ),
        sample("cards.delete", CARD_ID, Some(DECK_ID), delete(Kind::Cards, None)),
        sample(
            "reviews.row",
            "01920000-0000-7000-8000-000000000005",
            None,
            Payload::Review(Review {
                card_id: CARD_ID.to_string(),
                rating: 3,
                state: 2,
                due_at: 1_727_100_000_000,
                stability: 12.5,
                difficulty: 4.75,
                scheduled_days: 9,
                learning_steps: 0,
                time: 4_200,
                is_ignored: false,
                created_at: 1_727_000_000_000,
            }),
        ),
        sample(
            "decks.create",
            DECK_ID,
            None,
            Payload::DeckCreate(DeckCreate {
                title: "Spanish".to_string(),
                notes: None,
                created_at: 1_726_000_000_000,
                initial_product_ts: InitialProductTs::new(),
                legacy_product_ts_floor: None,
            }),
        ),
        sample("decks.title", DECK_ID, None, Payload::DeckTitle(title())),
        sample("decks.notes", DECK_ID, None, Payload::DeckNotes(notes())),
        sample(
            "decks.algorithm",
            DECK_ID,
            None,
            Payload::DeckAlgorithm(DeckAlgorithm {
                algorithm_id: ALGORITHM_ID.to_string(),
                updated_at: None,
            }),
        ),
        sample(
            "decks.template",
            DECK_ID,
            None,
            Payload::DeckTemplate(DeckTemplate {
                template_id: TEMPLATE_ID.to_string(),
                updated_at: None,
            }),
        ),
        sample("decks.delete", DECK_ID, None, delete(Kind::Decks, None)),
        sample(
            "templates.create",
            TEMPLATE_ID,
            None,
            Payload::TemplateCreate(document_create(r#"{"fields":[],"layout":[]}"#)),
        ),
        sample("templates.title", TEMPLATE_ID, None, Payload::TemplateTitle(title())),
        sample("templates.notes", TEMPLATE_ID, None, Payload::TemplateNotes(notes())),
        sample(
            "templates.structure",
            TEMPLATE_ID,
            None,
            Payload::TemplateStructure(JsonContent {
                content: r#"{"fields":[{"id":"f1"}],"layout":[]}"#.to_string(),
                updated_at: Some(1_727_000_000_000),
            }),
        ),
        sample("templates.delete", TEMPLATE_ID, None, delete(Kind::Templates, None)),
        sample(
            "algorithms.create",
            ALGORITHM_ID,
            None,
            Payload::AlgorithmCreate(document_create(r#"{"retention":90}"#)),
        ),
        sample("algorithms.title", ALGORITHM_ID, None, Payload::AlgorithmTitle(title())),
        sample("algorithms.notes", ALGORITHM_ID, None, Payload::AlgorithmNotes(notes())),
        sample(
            "algorithms.content",
            ALGORITHM_ID,
            None,
            Payload::AlgorithmContent(JsonContent {
                content: r#"{"retention":85}"#.to_string(),
                updated_at: Some(1_727_000_000_000),
            }),
        ),
        sample(
            "algorithms.delete",
            ALGORITHM_ID,
            None,
            delete(Kind::Algorithms, Some("01a08376-dc00-7001-8000-000000000100")),
        ),
        sample(
            "algorithm_revisions.row",
            "01920000-0000-7000-8000-000000000006",
            None,
            Payload::AlgorithmRevision(AlgorithmRevision {
                algorithm_id: ALGORITHM_ID.to_string(),
                content: r#"{"retention":85}"#.to_string(),
                actor: r#"{"kind":"user"}"#.to_string(),
                created_at: 1_727_000_000_000,
            }),
        ),
        sample(
            "settings.learning.defaults.algorithm",
            "learning",
            None,
            Payload::LearningDefaultAlgorithm(DefaultAlgorithm {
                algorithm_id: ALGORITHM_ID.to_string(),
            }),
        ),
        sample(
            "settings.learning.defaults.template",
            "learning",
            None,
            Payload::LearningDefaultTemplate(DefaultTemplate {
                template_id: TEMPLATE_ID.to_string(),
            }),
        ),
        sample(
            "settings.learning.dailyLimits",
            "learning",
            None,
            Payload::LearningDailyLimits(setting(r#"{"total":200}"#)),
        ),
        sample(
            "settings.learning.dayStartsAt",
            "learning",
            None,
            Payload::LearningDayStartsAt(setting(r#""05:00""#)),
        ),
        sample(
            "settings.learning.learnAheadLimit",
            "learning",
            None,
            Payload::LearningLearnAheadLimit(setting("[0,30]")),
        ),
    ]
}

fn delete(kind: Kind, successor: Option<&str>) -> Payload {
    Payload::Delete {
        kind,
        delete: Delete {
            successor: successor.map(str::to_string),
        },
    }
}

fn setting(value: &str) -> SettingValue {
    SettingValue {
        value: value.to_string(),
    }
}
