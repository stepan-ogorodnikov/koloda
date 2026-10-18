use koloda_sync_proto::registry::{allow, check_lane, Class, Group, Kind, Lane, Op, RegistryError};

type HeaderCase = (
    &'static str,
    Option<&'static str>,
    &'static str,
    Result<(), RegistryError>,
);

fn check_header(kind: &str, group: Option<&str>, op: &str) -> Result<(), RegistryError> {
    let kind = Kind::from_wire(kind)?;
    let group = group.map(Group::from_wire).transpose()?;
    let op = Op::from_wire(op)?;
    allow(kind, group, op).map(|_| ())
}

#[test]
fn header_allowlist_accepts_registry_groups_and_rejects_the_rest() {
    let cases: Vec<HeaderCase> = vec![
        ("cards", Some("create"), "write", Ok(())),
        ("cards", Some("reset"), "write", Ok(())),
        ("reviews", Some("row"), "write", Ok(())),
        ("decks", Some("algorithm"), "write", Ok(())),
        ("algorithms", Some("content"), "write", Ok(())),
        ("algorithm_revisions", Some("row"), "write", Ok(())),
        ("settings.learning", Some("defaults.template"), "write", Ok(())),
        ("settings.learning", Some("learnAheadLimit"), "write", Ok(())),
        ("cards", None, "delete", Ok(())),
        ("decks", None, "delete", Ok(())),
        ("templates", None, "delete", Ok(())),
        ("algorithms", None, "delete", Ok(())),
        (
            "conversations",
            Some("state"),
            "write",
            Err(RegistryError::UnknownKind("conversations".to_string())),
        ),
        (
            "reviews",
            Some("flags"),
            "write",
            Err(RegistryError::UnknownGroup("flags".to_string())),
        ),
        (
            "cards",
            Some("content"),
            "upsert",
            Err(RegistryError::UnknownOp("upsert".to_string())),
        ),
        (
            "cards",
            Some("title"),
            "write",
            Err(RegistryError::GroupNotInKind {
                kind: Kind::Cards,
                group: Group::Title,
            }),
        ),
        (
            "decks",
            Some("structure"),
            "write",
            Err(RegistryError::GroupNotInKind {
                kind: Kind::Decks,
                group: Group::Structure,
            }),
        ),
        (
            "cards",
            None,
            "write",
            Err(RegistryError::WriteWithoutGroup { kind: Kind::Cards }),
        ),
        (
            "cards",
            Some("content"),
            "delete",
            Err(RegistryError::DeleteWithGroup {
                kind: Kind::Cards,
                group: Group::Content,
            }),
        ),
        (
            "reviews",
            None,
            "delete",
            Err(RegistryError::DeleteNotAllowed { kind: Kind::Reviews }),
        ),
        (
            "algorithm_revisions",
            None,
            "delete",
            Err(RegistryError::DeleteNotAllowed {
                kind: Kind::AlgorithmRevisions,
            }),
        ),
        (
            "settings.learning",
            None,
            "delete",
            Err(RegistryError::DeleteNotAllowed {
                kind: Kind::SettingsLearning,
            }),
        ),
    ];

    for (kind, group, op, expected) in cases {
        assert_eq!(check_header(kind, group, op), expected, "{kind} / {group:?} / {op}");
    }
}

#[test]
fn only_reviews_travel_in_the_cold_lane() {
    for kind in Kind::ALL {
        let (own, other) = if kind == Kind::Reviews {
            (Lane::Cold, Lane::Hot)
        } else {
            (Lane::Hot, Lane::Cold)
        };
        assert_eq!(check_lane(kind, own), Ok(()), "{kind:?} in {own:?}");
        assert_eq!(
            check_lane(kind, other),
            Err(RegistryError::LaneMismatch { kind, lane: other }),
            "{kind:?} in {other:?}"
        );
    }
}

#[test]
fn each_group_keeps_its_class_and_updated_at_contribution() {
    // Wire contract pin: §Groups (Class column) and §`updated_at` (contributing groups), in registry order.
    let expected = [
        ("cards", "create", Class::Create, false),
        ("cards", "content", Class::Update, true),
        ("cards", "scheduling", Class::Update, false),
        ("cards", "reset", Class::Update, false),
        ("reviews", "row", Class::Immutable, false),
        ("decks", "create", Class::Create, false),
        ("decks", "title", Class::Update, true),
        ("decks", "notes", Class::Update, true),
        ("decks", "algorithm", Class::Update, true),
        ("decks", "template", Class::Update, true),
        ("templates", "create", Class::Create, false),
        ("templates", "title", Class::Update, true),
        ("templates", "notes", Class::Update, true),
        ("templates", "structure", Class::Update, true),
        ("algorithms", "create", Class::Create, false),
        ("algorithms", "title", Class::Update, true),
        ("algorithms", "notes", Class::Update, true),
        ("algorithms", "content", Class::Update, true),
        ("algorithm_revisions", "row", Class::Immutable, false),
        ("settings.learning", "defaults.algorithm", Class::Update, false),
        ("settings.learning", "defaults.template", Class::Update, false),
        ("settings.learning", "dailyLimits", Class::Update, false),
        ("settings.learning", "dayStartsAt", Class::Update, false),
        ("settings.learning", "learnAheadLimit", Class::Update, false),
    ];

    let registry: Vec<_> = Kind::ALL
        .into_iter()
        .flat_map(|kind| {
            kind.spec().groups.iter().map(move |spec| {
                (
                    kind.as_wire(),
                    spec.group.as_wire(),
                    spec.class,
                    spec.contributes_updated_at,
                )
            })
        })
        .collect();
    assert_eq!(registry, expected);
}
