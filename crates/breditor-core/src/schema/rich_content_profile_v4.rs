//! Explicit unreleased candidate rich V4: V3 grammar plus bounded ordered-list numbering,
//! one native text-language inline format, bounded image links, collapsible sections,
//! mention entities, table captions, explicit page breaks and named bookmarks with
//! internal links.
//!
//! V1–V3 specifications and fingerprints stay exact. Later V4 candidate slices
//! change this revision's rules before release, so no V4 data is persisted yet.
use super::{
    ChildConstraint, ChildKind, DeclarationOwner, ElementSpec, InlineFormatSpec,
    PersistedTypeRevision, SchemaSpec,
};
use crate::schema::child_grammar::ChildGroup;
use crate::{
    extension::{
        InlineFormatPropertyContractV1, InlineFormatPropertySpecV1, InlineFormatPropertyTypeV1,
        PropertyPresenceV1,
    },
    identity::QualifiedName,
    rich_content::{
        RICH_LANGUAGE_TAG_MAX_BYTES, RICH_LANGUAGE_TAG_MIN_BYTES, RICH_TEXT_LANGUAGE_FORMAT,
        RICH_TEXT_LANGUAGE_TAG_PROPERTY,
    },
};

/// Persisted type revision of `breditor/image` in V4 (V1–V3 keep revision 1).
const IMAGE_REVISION: u32 = 2;

/// Persisted type revision of `breditor/paragraph`, `breditor/heading` and
/// `breditor/code-block` in V4: they gain the optional `breditor/bookmark` name.
const TEXT_BLOCK_REVISION: u32 = 2;

/// Native formats V4 adds to the extension-declared set (counted against the 256 ceiling).
pub(super) const NATIVE_INLINE_FORMATS: u32 = 2;

/// V4 flow: the V2/V3 flow kinds plus the collapsible section container.
fn flow_kinds(include_tables: bool) -> Vec<ChildKind> {
    let mut kinds = [
        "paragraph",
        "heading",
        "bullet-list",
        "ordered-list",
        "image",
        "blockquote",
        "code-block",
        "horizontal-rule",
        "task-list",
        "details",
    ]
    .map(|local| ChildKind::Element(super::rich_content_profile::name(local)))
    .to_vec();
    if include_tables {
        kinds.push(ChildKind::Element(super::rich_content_profile::name("table")));
    }
    kinds
}

fn flow(include_tables: bool) -> ChildConstraint {
    ChildConstraint {
        groups: vec![ChildGroup { kinds: flow_kinds(include_tables), minimum: 1, maximum: None }],
    }
}

/// A section is exactly one leading summary followed by one or more flow blocks.
/// Its nesting bound and `details-open` value law are sealed V4 rich rules.
fn details() -> ChildConstraint {
    ChildConstraint {
        groups: vec![
            ChildGroup {
                kinds: vec![ChildKind::Element(super::rich_content_profile::name(
                    "details-summary",
                ))],
                minimum: 1,
                maximum: Some(1),
            },
            ChildGroup { kinds: flow_kinds(true), minimum: 1, maximum: None },
        ],
    }
}

/// Slice 7: the document root additionally admits explicit page breaks. They are a
/// root-only flow kind: list items, quotes, task items, sections and cells never admit them.
fn document() -> ChildConstraint {
    let mut kinds = flow_kinds(true);
    kinds.push(ChildKind::Element(super::rich_content_profile::name("page-break")));
    ChildConstraint { groups: vec![ChildGroup { kinds, minimum: 1, maximum: None }] }
}

/// Slice 6: a table is its rows (unchanged bounds) followed by at most one trailing
/// caption paragraph. Rows stay children `0..rows`, so every row index is unchanged.
fn table() -> ChildConstraint {
    let name = super::rich_content_profile::name;
    ChildConstraint {
        groups: vec![
            ChildGroup {
                kinds: vec![ChildKind::Element(name("table-row"))],
                minimum: 0,
                maximum: Some(256),
            },
            ChildGroup {
                kinds: vec![ChildKind::Element(name("paragraph"))],
                minimum: 0,
                maximum: Some(1),
            },
        ],
    }
}

pub(super) fn specification(spec: SchemaSpec) -> SchemaSpec {
    let mut spec = super::rich_content_profile_v3::specification(spec);
    spec.rich_content_contract = Some(4);
    // Every V2 flow container also admits a collapsible section.
    for element in &mut spec.elements {
        match element.kind.as_str() {
            "breditor/document" => element.children = document(),
            "breditor/list-item" | "breditor/blockquote" | "breditor/task-item" => {
                element.children = flow(true);
            }
            "breditor/table-cell" => element.children = flow(false),
            "breditor/table" => element.children = table(),
            _ => {}
        }
    }
    for (local, children) in [
        ("details", details()),
        ("details-summary", ChildConstraint::repeated(ChildKind::Text, 0, None)),
        // Slice 7: an atomic page break with no content (like the V2 horizontal rule).
        ("page-break", ChildConstraint::repeated(ChildKind::Text, 0, Some(0))),
    ] {
        spec.elements.push(ElementSpec {
            kind: super::rich_content_profile::name(local),
            owner: DeclarationOwner::Breditor,
            revision: PersistedTypeRevision::one(),
            allows_properties: true,
            property_contract: None,
            allows_entity_id: false,
            children,
        });
    }
    // The image element gains optional link properties (`image-href`,
    // `image-link-new-window`) and the "a linked image is never decorative" law.
    // Its persisted type revision records that changed property contract.
    for element in &mut spec.elements {
        if element.kind.as_str() == "breditor/image" {
            element.revision = PersistedTypeRevision::try_new(IMAGE_REVISION)
                .unwrap_or_else(|_| unreachable!("trusted nonzero image revision"));
        }
        // Slice 8: text blocks gain the optional, document-unique bookmark name; the
        // internal `#name` link-target law is a sealed V4 rich rule.
        if matches!(
            element.kind.as_str(),
            "breditor/paragraph" | "breditor/heading" | "breditor/code-block"
        ) {
            element.revision = PersistedTypeRevision::try_new(TEXT_BLOCK_REVISION)
                .unwrap_or_else(|_| unreachable!("trusted nonzero text-block revision"));
        }
    }
    let kind = QualifiedName::from_known_static(RICH_TEXT_LANGUAGE_FORMAT);
    let value_type = InlineFormatPropertyTypeV1::try_string(
        RICH_LANGUAGE_TAG_MIN_BYTES,
        RICH_LANGUAGE_TAG_MAX_BYTES,
    )
    .unwrap_or_else(|_| unreachable!("trusted language-tag bounds"));
    // The canonical BCP 47 grammar itself is a sealed V4 rich rule checked by validation.
    let contract = InlineFormatPropertyContractV1::new_core(
        kind.clone(),
        vec![InlineFormatPropertySpecV1::new(
            QualifiedName::from_known_static(RICH_TEXT_LANGUAGE_TAG_PROPERTY),
            PropertyPresenceV1::Required,
            value_type,
        )],
    );
    spec.inline_formats.push(InlineFormatSpec {
        kind,
        owner: DeclarationOwner::Breditor,
        revision: PersistedTypeRevision::one(),
        property_contract: Some(contract),
    });
    // Slice 5: the native mention entity format.
    spec.inline_formats.push(mention_format());
    spec
}

/// Candidate V4 mention: three required strings; their closed domains and the
/// whole-label immutability law are sealed V4 rich rules checked by validation.
fn mention_format() -> InlineFormatSpec {
    use crate::rich_content::mention;
    let kind = QualifiedName::from_known_static(mention::RICH_MENTION_FORMAT);
    let string = |minimum, maximum| {
        InlineFormatPropertyTypeV1::try_string(minimum, maximum)
            .unwrap_or_else(|_| unreachable!("trusted mention bounds"))
    };
    let property = |name, value_type| {
        InlineFormatPropertySpecV1::new(
            QualifiedName::from_known_static(name),
            PropertyPresenceV1::Required,
            value_type,
        )
    };
    let contract = InlineFormatPropertyContractV1::new_core(
        kind.clone(),
        vec![
            property(
                mention::RICH_MENTION_ID_PROPERTY,
                string(1, mention::RICH_MENTION_ID_MAX_BYTES),
            ),
            property(
                mention::RICH_MENTION_KIND_PROPERTY,
                string(mention::KIND_MIN_BYTES, mention::KIND_MAX_BYTES),
            ),
            property(
                mention::RICH_MENTION_LABEL_PROPERTY,
                string(1, mention::RICH_MENTION_LABEL_MAX_BYTES),
            ),
        ],
    );
    InlineFormatSpec {
        kind,
        owner: DeclarationOwner::Breditor,
        revision: PersistedTypeRevision::one(),
        property_contract: Some(contract),
    }
}
