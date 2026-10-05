//! Experimental nested-list admission only, not an editing capability.
//!
//! Items contain exactly one leading text block followed by zero or more lists.
//! Multiple child lists preserve mixed marker families and explicit restarts.
//! Existing document depth/node budgets bound recursion; no implicit repair or
//! migration from the flat profile is performed.

use super::{
    ChildKind, CompiledSchema, CompilerLimits, ExtensionSet, QualifiedName, SchemaCompilationError,
    SchemaId, base_text_profile_spec, compile, flat_list_profile::with_flat_lists,
};
use crate::schema::child_grammar::ChildGroup;

pub(in crate::schema) fn compile_nested_list_profile(
    schema_id: SchemaId,
    extensions: &ExtensionSet,
) -> Result<CompiledSchema, SchemaCompilationError> {
    let spec = with_nested_lists(base_text_profile_spec(schema_id, extensions)?)?;
    compile(spec, CompilerLimits::default()).map_err(|_| SchemaCompilationError::InternalInvariant)
}

fn with_nested_lists(spec: super::SchemaSpec) -> Result<super::SchemaSpec, SchemaCompilationError> {
    let mut spec = with_flat_lists(spec)?;
    let item_kind = QualifiedName::from_known_static("breditor/list-item");
    let item = spec
        .elements
        .iter_mut()
        .find(|element| element.kind == item_kind)
        .ok_or(SchemaCompilationError::InternalInvariant)?;
    item.children.groups.push(ChildGroup {
        kinds: vec![
            ChildKind::Element(QualifiedName::from_known_static("breditor/bullet-list")),
            ChildKind::Element(QualifiedName::from_known_static("breditor/ordered-list")),
        ],
        minimum: 0,
        maximum: None,
    });
    Ok(spec)
}

pub(in crate::schema) fn supports_nested_list_reframe(
    definition: &super::CompiledSchemaDefinition,
) -> bool {
    with_nested_lists(super::base_spec()).is_ok_and(|expected| {
        super::text_block_profile::supports_structural_profile(definition, &expected)
    })
}
