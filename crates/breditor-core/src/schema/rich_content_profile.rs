//! Sealed rich AST admission; no existing editing capability is broadened.

use super::{
    ChildConstraint, ChildKind, CompiledSchema, CompiledSchemaDefinition, CompilerLimits,
    DeclarationOwner, ElementSpec, ExtensionSet, PersistedTypeRevision, QualifiedName,
    SchemaCompilationError, SchemaId, SchemaSpec, base_spec, base_text_profile_spec, compile,
};
use crate::schema::child_grammar::ChildGroup;

// Change this revision whenever a property, cross-node or canonicality law
// changes. It is encoded by compiler contract 6, leaving contracts 1–5 exact.
const RICH_RULE_REVISION: u32 = 1;

fn name(local: &str) -> QualifiedName {
    QualifiedName::try_new(format!("breditor/{local}"))
        .unwrap_or_else(|_| unreachable!("trusted rich element name"))
}

fn flow(include_tables: bool) -> ChildConstraint {
    let mut kinds = ["paragraph", "heading", "bullet-list", "ordered-list", "image"]
        .map(|local| ChildKind::Element(name(local)))
        .to_vec();
    if include_tables {
        kinds.push(ChildKind::Element(name("table")));
    }
    ChildConstraint { groups: vec![ChildGroup { kinds, minimum: 1, maximum: None }] }
}

fn with_rich_content(mut spec: SchemaSpec) -> SchemaSpec {
    spec.rich_content_contract = Some(RICH_RULE_REVISION);
    spec.elements[0].children = flow(true);
    // Rich validation supplies closed typed property rules, including heading
    // rank and ordered start, instead of the legacy one-integer contract.
    for element in &mut spec.elements {
        element.allows_properties = true;
        element.property_contract = None;
    }
    for (local, children) in [
        ("heading", ChildConstraint::repeated(ChildKind::Text, 0, None)),
        ("bullet-list", ChildConstraint::repeated(ChildKind::Element(name("list-item")), 1, None)),
        ("ordered-list", ChildConstraint::repeated(ChildKind::Element(name("list-item")), 1, None)),
        // The rich rule separately requires the first child to be a text block.
        // A single group permits subsequent paragraphs as well as nested lists.
        ("list-item", flow(true)),
        ("table", ChildConstraint::repeated(ChildKind::Element(name("table-row")), 0, Some(256))),
        (
            "table-row",
            ChildConstraint::repeated(ChildKind::Element(name("table-cell")), 0, Some(128)),
        ),
        ("table-cell", flow(false)),
        ("image", ChildConstraint::repeated(ChildKind::Element(name("paragraph")), 0, Some(1))),
    ] {
        spec.elements.push(ElementSpec {
            kind: name(local),
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

pub(in crate::schema) fn compile_rich_content_profile(
    schema_id: SchemaId,
    extensions: &ExtensionSet,
) -> Result<CompiledSchema, SchemaCompilationError> {
    let spec = with_rich_content(base_text_profile_spec(schema_id, extensions)?);
    compile(spec, CompilerLimits::default()).map_err(|_| SchemaCompilationError::InternalInvariant)
}

pub(in crate::schema) fn supports_rich_content(definition: &CompiledSchemaDefinition) -> bool {
    super::text_block_profile::supports_structural_profile(
        definition,
        &with_rich_content(base_spec()),
    )
}
