//! Sealed beta grammar: direct-root text blocks or flat lists with one block per item.
//!
//! This is document admission only. The paragraph and heading operation
//! capabilities intentionally reject this schema until list-aware operations
//! prove path relocation, exact inverses and full-result resource accounting.

use super::{
    ChildConstraint, ChildKind, CompiledSchema, CompilerLimits, DeclarationOwner, ElementSpec,
    ExtensionSet, PersistedTypeRevision, QualifiedName, RequiredIntegerProperty,
    SchemaCompilationError, SchemaId, SchemaSpec, base_text_profile_spec, compile,
    text_block_profile::with_headings,
};
use crate::{
    block::MAX_ORDERED_LIST_ORDINAL, document::PropertyInteger, schema::child_grammar::ChildGroup,
};

pub(super) fn with_flat_lists(spec: SchemaSpec) -> Result<SchemaSpec, SchemaCompilationError> {
    let mut spec = with_headings(spec)?;
    let paragraph = spec.paragraph_kind.clone();
    let heading = QualifiedName::from_known_static("breditor/heading");
    let bullet = QualifiedName::from_known_static("breditor/bullet-list");
    let ordered = QualifiedName::from_known_static("breditor/ordered-list");
    let item = QualifiedName::from_known_static("breditor/list-item");
    spec.elements.first_mut().ok_or(SchemaCompilationError::InternalInvariant)?.children =
        ChildConstraint {
            groups: vec![ChildGroup {
                kinds: vec![
                    ChildKind::Element(paragraph.clone()),
                    ChildKind::Element(heading.clone()),
                    ChildKind::Element(bullet.clone()),
                    ChildKind::Element(ordered.clone()),
                ],
                minimum: 1,
                maximum: None,
            }],
        };
    for (kind, property_contract, children) in [
        (bullet, None, ChildConstraint::repeated(ChildKind::Element(item.clone()), 1, None)),
        (
            ordered,
            Some(RequiredIntegerProperty {
                name: QualifiedName::from_known_static("breditor/start"),
                minimum: PropertyInteger::try_new(1)
                    .map_err(|_| SchemaCompilationError::InternalInvariant)?,
                maximum: PropertyInteger::try_new(i64::from(MAX_ORDERED_LIST_ORDINAL))
                    .map_err(|_| SchemaCompilationError::InternalInvariant)?,
                child_ordinals: true,
            }),
            ChildConstraint::repeated(ChildKind::Element(item.clone()), 1, None),
        ),
        (
            item,
            None,
            ChildConstraint {
                groups: vec![ChildGroup {
                    kinds: vec![ChildKind::Element(paragraph), ChildKind::Element(heading)],
                    minimum: 1,
                    maximum: Some(1),
                }],
            },
        ),
    ] {
        spec.elements.push(ElementSpec {
            kind,
            owner: DeclarationOwner::Breditor,
            revision: PersistedTypeRevision::one(),
            allows_properties: property_contract.is_some(),
            property_contract,
            allows_entity_id: false,
            children,
        });
    }
    Ok(spec)
}

pub(in crate::schema) fn compile_flat_list_profile(
    schema_id: SchemaId,
    extensions: &ExtensionSet,
) -> Result<CompiledSchema, SchemaCompilationError> {
    let spec = with_flat_lists(base_text_profile_spec(schema_id, extensions)?)?;
    compile(spec, CompilerLimits::default()).map_err(|_| SchemaCompilationError::InternalInvariant)
}
