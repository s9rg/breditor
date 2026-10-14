//! Sealed experimental paragraph/heading grammar and its operation capability.

use super::{
    ChildConstraint, ChildKind, CompiledSchema, CompiledSchemaDefinition, CompilerLimits,
    DeclarationOwner, ElementSpec, ExtensionSet, PersistedTypeRevision, QualifiedName,
    RequiredIntegerProperty, SchemaCompilationError, SchemaId, SchemaSpec, base_spec,
    base_text_profile_spec, compile,
};
use crate::document::PropertyInteger;
use crate::schema::child_grammar::ChildGroup;

pub(super) fn with_headings(mut spec: SchemaSpec) -> Result<SchemaSpec, SchemaCompilationError> {
    let heading = QualifiedName::from_known_static("breditor/heading");
    // This function receives the trusted base spec; element zero is its root.
    spec.elements.first_mut().ok_or(SchemaCompilationError::InternalInvariant)?.children =
        ChildConstraint {
            groups: vec![ChildGroup {
                kinds: vec![
                    ChildKind::Element(heading.clone()),
                    ChildKind::Element(spec.paragraph_kind.clone()),
                ],
                minimum: 1,
                maximum: None,
            }],
        };
    spec.elements.push(ElementSpec {
        kind: heading,
        owner: DeclarationOwner::Breditor,
        revision: PersistedTypeRevision::one(),
        allows_properties: true,
        property_contract: Some(RequiredIntegerProperty {
            child_ordinals: false,
            name: QualifiedName::from_known_static("breditor/level"),
            minimum: PropertyInteger::try_new(1)
                .map_err(|_| SchemaCompilationError::InternalInvariant)?,
            maximum: PropertyInteger::try_new(6)
                .map_err(|_| SchemaCompilationError::InternalInvariant)?,
        }),
        allows_entity_id: false,
        children: ChildConstraint::repeated(ChildKind::Text, 0, None),
    });
    Ok(spec)
}

pub(in crate::schema) fn compile_text_block_profile(
    schema_id: SchemaId,
    extensions: &ExtensionSet,
) -> Result<CompiledSchema, SchemaCompilationError> {
    let spec = with_headings(base_text_profile_spec(schema_id, extensions)?)?;
    compile(spec, CompilerLimits::default()).map_err(|_| SchemaCompilationError::InternalInvariant)
}

pub(in crate::schema) fn supports_text_block_kind_operations(
    definition: &CompiledSchemaDefinition,
) -> bool {
    let Ok(expected) = with_headings(base_spec()) else {
        return false;
    };
    supports_structural_profile(definition, &expected)
}

pub(super) fn supports_structural_profile(
    definition: &CompiledSchemaDefinition,
    expected: &SchemaSpec,
) -> bool {
    #[cfg(feature = "experimental-rich-content")]
    if definition.rich_content_contract != expected.rich_content_contract {
        return false;
    }
    definition.root_kind == expected.root_kind
        && definition.paragraph_kind == expected.paragraph_kind
        && definition.strong_kind == expected.strong_kind
        && definition.constraints == expected.constraints
        && definition.elements.len() == expected.elements.len()
        && expected.elements.iter().all(|element| {
            definition.elements.get(&element.kind).is_some_and(|compiled| {
                // Compilation sorts alternatives; declaration order is not
                // part of the admitted language or its capability proof.
                let mut children = element.children.clone();
                for group in &mut children.groups {
                    group.kinds.sort();
                }
                compiled.revision == element.revision
                    && compiled.allows_properties == element.allows_properties
                    && compiled.property_contract == element.property_contract
                    && compiled.allows_entity_id == element.allows_entity_id
                    && compiled.children == children
            })
        })
        && definition.inline_formats.get(&expected.strong_kind).is_some_and(|strong| {
            strong.revision == PersistedTypeRevision::one() && strong.property_contract.is_none()
        })
}
