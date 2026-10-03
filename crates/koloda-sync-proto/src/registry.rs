//! The single definition of what syncs: kinds, field groups, classes, lanes, parents, and refs.
//!
//! Mirrors the field-group and refs tables in `PROTOCOL.md` (§Field groups and merge, §Deletes).

use std::fmt;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub enum Kind {
    Cards,
    Reviews,
    Decks,
    Templates,
    Algorithms,
    AlgorithmRevisions,
    SettingsLearning,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub enum Group {
    Create,
    Content,
    Scheduling,
    Reset,
    Row,
    Title,
    Notes,
    Algorithm,
    Template,
    Structure,
    DefaultsAlgorithm,
    DefaultsTemplate,
    DailyLimits,
    DayStartsAt,
    LearnAheadLimit,
}

/// `Write` names a field group; its class decides whether it creates, updates, or inserts an immutable row.
/// `Delete` names no group and tombstones the whole entity.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub enum Op {
    Write,
    Delete,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub enum Class {
    Create,
    Update,
    Immutable,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub enum Lane {
    Hot,
    Cold,
}

/// Header ref names. Algorithm and template refs are hard: the server requires a live referent.
/// Attachment refs are soft: they never block a push and never cascade.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub enum RefName {
    AlgorithmId,
    TemplateId,
    AttachmentIds,
}

#[derive(Debug, PartialEq, Eq)]
pub struct KindSpec {
    pub kind: Kind,
    pub lane: Lane,
    pub parent: Option<Kind>,
    pub has_tombstones: bool,
    pub groups: &'static [GroupSpec],
}

#[derive(Debug, PartialEq, Eq)]
pub struct GroupSpec {
    pub group: Group,
    pub class: Class,
    pub refs: &'static [RefName],
    pub contributes_updated_at: bool,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum RegistryError {
    UnknownKind(String),
    UnknownGroup(String),
    UnknownOp(String),
    UnknownLane(String),
    GroupNotInKind { kind: Kind, group: Group },
    WriteWithoutGroup { kind: Kind },
    DeleteWithGroup { kind: Kind, group: Group },
    DeleteNotAllowed { kind: Kind },
    LaneMismatch { kind: Kind, lane: Lane },
}

const fn group(group: Group, class: Class, refs: &'static [RefName], contributes_updated_at: bool) -> GroupSpec {
    GroupSpec {
        group,
        class,
        refs,
        contributes_updated_at,
    }
}

const CARDS: KindSpec = KindSpec {
    kind: Kind::Cards,
    lane: Lane::Hot,
    parent: Some(Kind::Decks),
    has_tombstones: true,
    groups: &[
        group(
            Group::Create,
            Class::Create,
            &[RefName::TemplateId, RefName::AttachmentIds],
            false,
        ),
        group(Group::Content, Class::Update, &[RefName::AttachmentIds], true),
        group(Group::Scheduling, Class::Update, &[], false),
        group(Group::Reset, Class::Update, &[], false),
    ],
};

const REVIEWS: KindSpec = KindSpec {
    kind: Kind::Reviews,
    lane: Lane::Cold,
    parent: Some(Kind::Cards),
    has_tombstones: false,
    groups: &[group(Group::Row, Class::Immutable, &[], false)],
};

const DECKS: KindSpec = KindSpec {
    kind: Kind::Decks,
    lane: Lane::Hot,
    parent: None,
    has_tombstones: true,
    groups: &[
        group(Group::Create, Class::Create, &[], false),
        group(Group::Title, Class::Update, &[], true),
        group(Group::Notes, Class::Update, &[], true),
        group(Group::Algorithm, Class::Update, &[RefName::AlgorithmId], true),
        group(Group::Template, Class::Update, &[RefName::TemplateId], true),
    ],
};

const TEMPLATES: KindSpec = KindSpec {
    kind: Kind::Templates,
    lane: Lane::Hot,
    parent: None,
    has_tombstones: true,
    groups: &[
        group(Group::Create, Class::Create, &[], false),
        group(Group::Title, Class::Update, &[], true),
        group(Group::Notes, Class::Update, &[], true),
        group(Group::Structure, Class::Update, &[], true),
    ],
};

const ALGORITHMS: KindSpec = KindSpec {
    kind: Kind::Algorithms,
    lane: Lane::Hot,
    parent: None,
    has_tombstones: true,
    groups: &[
        group(Group::Create, Class::Create, &[], false),
        group(Group::Title, Class::Update, &[], true),
        group(Group::Notes, Class::Update, &[], true),
        group(Group::Content, Class::Update, &[], true),
    ],
};

// INVARIANT: revisions have no parent and no refs. Their algorithm id is a soft payload reference,
// so an algorithm tombstone never cascades to them.
const ALGORITHM_REVISIONS: KindSpec = KindSpec {
    kind: Kind::AlgorithmRevisions,
    lane: Lane::Hot,
    parent: None,
    has_tombstones: false,
    groups: &[group(Group::Row, Class::Immutable, &[], false)],
};

const SETTINGS_LEARNING: KindSpec = KindSpec {
    kind: Kind::SettingsLearning,
    lane: Lane::Hot,
    parent: None,
    has_tombstones: false,
    groups: &[
        group(Group::DefaultsAlgorithm, Class::Update, &[RefName::AlgorithmId], false),
        group(Group::DefaultsTemplate, Class::Update, &[RefName::TemplateId], false),
        group(Group::DailyLimits, Class::Update, &[], false),
        group(Group::DayStartsAt, Class::Update, &[], false),
        group(Group::LearnAheadLimit, Class::Update, &[], false),
    ],
};

impl Kind {
    pub const ALL: [Kind; 7] = [
        Kind::Cards,
        Kind::Reviews,
        Kind::Decks,
        Kind::Templates,
        Kind::Algorithms,
        Kind::AlgorithmRevisions,
        Kind::SettingsLearning,
    ];

    pub fn as_wire(self) -> &'static str {
        match self {
            Kind::Cards => "cards",
            Kind::Reviews => "reviews",
            Kind::Decks => "decks",
            Kind::Templates => "templates",
            Kind::Algorithms => "algorithms",
            Kind::AlgorithmRevisions => "algorithm_revisions",
            Kind::SettingsLearning => "settings.learning",
        }
    }

    pub fn from_wire(value: &str) -> Result<Kind, RegistryError> {
        Kind::ALL
            .into_iter()
            .find(|kind| kind.as_wire() == value)
            .ok_or_else(|| RegistryError::UnknownKind(value.to_string()))
    }

    pub fn spec(self) -> &'static KindSpec {
        match self {
            Kind::Cards => &CARDS,
            Kind::Reviews => &REVIEWS,
            Kind::Decks => &DECKS,
            Kind::Templates => &TEMPLATES,
            Kind::Algorithms => &ALGORITHMS,
            Kind::AlgorithmRevisions => &ALGORITHM_REVISIONS,
            Kind::SettingsLearning => &SETTINGS_LEARNING,
        }
    }
}

impl Group {
    pub const ALL: [Group; 15] = [
        Group::Create,
        Group::Content,
        Group::Scheduling,
        Group::Reset,
        Group::Row,
        Group::Title,
        Group::Notes,
        Group::Algorithm,
        Group::Template,
        Group::Structure,
        Group::DefaultsAlgorithm,
        Group::DefaultsTemplate,
        Group::DailyLimits,
        Group::DayStartsAt,
        Group::LearnAheadLimit,
    ];

    pub fn as_wire(self) -> &'static str {
        match self {
            Group::Create => "create",
            Group::Content => "content",
            Group::Scheduling => "scheduling",
            Group::Reset => "reset",
            Group::Row => "row",
            Group::Title => "title",
            Group::Notes => "notes",
            Group::Algorithm => "algorithm",
            Group::Template => "template",
            Group::Structure => "structure",
            Group::DefaultsAlgorithm => "defaults.algorithm",
            Group::DefaultsTemplate => "defaults.template",
            Group::DailyLimits => "dailyLimits",
            Group::DayStartsAt => "dayStartsAt",
            Group::LearnAheadLimit => "learnAheadLimit",
        }
    }

    pub fn from_wire(value: &str) -> Result<Group, RegistryError> {
        Group::ALL
            .into_iter()
            .find(|group| group.as_wire() == value)
            .ok_or_else(|| RegistryError::UnknownGroup(value.to_string()))
    }
}

impl Op {
    pub fn as_wire(self) -> &'static str {
        match self {
            Op::Write => "write",
            Op::Delete => "delete",
        }
    }

    pub fn from_wire(value: &str) -> Result<Op, RegistryError> {
        [Op::Write, Op::Delete]
            .into_iter()
            .find(|op| op.as_wire() == value)
            .ok_or_else(|| RegistryError::UnknownOp(value.to_string()))
    }
}

impl Lane {
    pub fn as_wire(self) -> &'static str {
        match self {
            Lane::Hot => "hot",
            Lane::Cold => "cold",
        }
    }

    pub fn from_wire(value: &str) -> Result<Lane, RegistryError> {
        [Lane::Hot, Lane::Cold]
            .into_iter()
            .find(|lane| lane.as_wire() == value)
            .ok_or_else(|| RegistryError::UnknownLane(value.to_string()))
    }
}

impl RefName {
    pub fn as_wire(self) -> &'static str {
        match self {
            RefName::AlgorithmId => "algorithm_id",
            RefName::TemplateId => "template_id",
            RefName::AttachmentIds => "attachment_ids",
        }
    }

    /// The kind a hard ref must name; `None` for soft attachment refs, which name no envelope kind.
    pub fn target(self) -> Option<Kind> {
        match self {
            RefName::AlgorithmId => Some(Kind::Algorithms),
            RefName::TemplateId => Some(Kind::Templates),
            RefName::AttachmentIds => None,
        }
    }
}

pub fn allow(kind: Kind, group: Option<Group>, op: Op) -> Result<Option<&'static GroupSpec>, RegistryError> {
    let spec = kind.spec();
    match (op, group) {
        (Op::Write, Some(group)) => spec
            .groups
            .iter()
            .find(|candidate| candidate.group == group)
            .map(Some)
            .ok_or(RegistryError::GroupNotInKind { kind, group }),
        (Op::Write, None) => Err(RegistryError::WriteWithoutGroup { kind }),
        (Op::Delete, Some(group)) => Err(RegistryError::DeleteWithGroup { kind, group }),
        (Op::Delete, None) if spec.has_tombstones => Ok(None),
        (Op::Delete, None) => Err(RegistryError::DeleteNotAllowed { kind }),
    }
}

pub fn check_lane(kind: Kind, lane: Lane) -> Result<(), RegistryError> {
    if kind.spec().lane == lane {
        Ok(())
    } else {
        Err(RegistryError::LaneMismatch { kind, lane })
    }
}

impl fmt::Display for RegistryError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            RegistryError::UnknownKind(value) => write!(f, "unknown kind `{value}`"),
            RegistryError::UnknownGroup(value) => write!(f, "unknown group `{value}`"),
            RegistryError::UnknownOp(value) => write!(f, "unknown op `{value}`"),
            RegistryError::UnknownLane(value) => write!(f, "unknown lane `{value}`"),
            RegistryError::GroupNotInKind { kind, group } => {
                write!(f, "group `{}` is not a group of `{}`", group.as_wire(), kind.as_wire())
            }
            RegistryError::WriteWithoutGroup { kind } => write!(f, "write to `{}` names no group", kind.as_wire()),
            RegistryError::DeleteWithGroup { kind, group } => {
                write!(f, "delete of `{}` names group `{}`", kind.as_wire(), group.as_wire())
            }
            RegistryError::DeleteNotAllowed { kind } => write!(f, "`{}` has no tombstones", kind.as_wire()),
            RegistryError::LaneMismatch { kind, lane } => {
                write!(f, "`{}` does not travel in lane `{}`", kind.as_wire(), lane.as_wire())
            }
        }
    }
}

impl std::error::Error for RegistryError {}
