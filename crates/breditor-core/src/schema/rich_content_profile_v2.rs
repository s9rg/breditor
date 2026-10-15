//! Explicit rich-language V2; the V1 element language and fingerprint remain exact.

use super::{
    ChildConstraint, ChildKind, DeclarationOwner, ElementSpec, PersistedTypeRevision, SchemaSpec,
};
use crate::schema::child_grammar::ChildGroup;

fn flow(include_tables: bool) -> ChildConstraint {
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
    ]
    .map(|local| ChildKind::Element(super::rich_content_profile::name(local)))
    .to_vec();
    if include_tables {
        kinds.push(ChildKind::Element(super::rich_content_profile::name("table")));
    }
    ChildConstraint { groups: vec![ChildGroup { kinds, minimum: 1, maximum: None }] }
}

pub(super) fn specification(spec: SchemaSpec) -> SchemaSpec {
    let mut spec = super::rich_content_profile::with_rich_content(spec);
    spec.rich_content_contract = Some(2);
    for element in &mut spec.elements {
        match element.kind.as_str() {
            "breditor/document" | "breditor/list-item" => element.children = flow(true),
            "breditor/table-cell" => element.children = flow(false),
            _ => {}
        }
    }
    for (local, children) in [
        ("blockquote", flow(true)),
        ("code-block", ChildConstraint::repeated(ChildKind::Text, 0, None)),
        ("horizontal-rule", ChildConstraint::repeated(ChildKind::Text, 0, Some(0))),
        (
            "task-list",
            ChildConstraint::repeated(
                ChildKind::Element(super::rich_content_profile::name("task-item")),
                1,
                None,
            ),
        ),
        ("task-item", flow(true)),
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
    spec
}
