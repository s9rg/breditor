//! Fingerprint and capability isolation for the sealed rich rule revision.

use super::{
    CompiledSchemaDefinition, compiler_contract_version, fingerprint, supports_rich_content,
};
use crate::{
    extension::{ExtensionLimits, ExtensionSet},
    identity::QualifiedName,
    schema::{CompiledSchema, SchemaId, SchemaVersion},
};

type TestResult = Result<(), Box<dyn std::error::Error>>;

fn schemas() -> Result<(CompiledSchema, CompiledSchema, CompiledSchema), Box<dyn std::error::Error>>
{
    let id =
        SchemaId::new(QualifiedName::try_new("example/same-selector")?, SchemaVersion::try_new(1)?);
    let extensions = ExtensionSet::try_new(vec![], ExtensionLimits::default())?;
    Ok((
        CompiledSchema::try_compile_base_text_profile(id.clone(), &extensions)?,
        CompiledSchema::try_compile_nested_list_profile(id.clone(), &extensions)?,
        CompiledSchema::try_compile_rich_content_profile(id, &extensions)?,
    ))
}

#[test]
fn rich_rules_have_an_explicit_fingerprint_revision_without_changing_old_contracts() -> TestResult {
    let (base, nested, rich) = schemas()?;
    assert_eq!(compiler_contract_version(base.definition()), 1);
    assert_eq!(compiler_contract_version(nested.definition()), 5);
    assert_eq!(compiler_contract_version(rich.definition()), 6);
    assert_ne!(base.fingerprint(), rich.fingerprint());
    assert_ne!(nested.fingerprint(), rich.fingerprint());
    let mut next: CompiledSchemaDefinition = rich.definition().as_ref().clone();
    next.rich_content_contract = Some(2);
    assert_ne!(rich.fingerprint(), fingerprint(&next));
    assert!(!supports_rich_content(&next));
    let mut missing = rich.definition().as_ref().clone();
    missing.rich_content_contract = None;
    assert!(!supports_rich_content(&missing));
    assert_ne!(rich.fingerprint(), fingerprint(&missing));
    Ok(())
}

#[test]
fn rich_profile_does_not_grant_legacy_editing_capabilities() -> TestResult {
    let (base, nested, rich) = schemas()?;
    assert!(base.supports_text_splice_operations());
    assert!(nested.supports_nested_list_reframe());
    assert!(!rich.supports_text_splice_operations());
    assert!(!rich.supports_paragraph_structure_operations());
    assert!(!rich.supports_base_text_operations());
    assert!(!rich.supports_text_block_kind_operations());
    assert!(!rich.supports_flat_list_operations());
    assert!(!rich.supports_nested_list_reframe());
    assert!(!base.is_rich_content_profile());
    assert!(!nested.is_rich_content_profile());
    assert!(rich.is_rich_content_profile());
    assert_eq!(rich, schemas()?.2);
    Ok(())
}

#[test]
fn rich_rule_one_fixture_schema_fingerprint_is_locked() -> TestResult {
    let schema = CompiledSchema::try_compile_rich_content_profile(
        SchemaId::new(
            QualifiedName::try_new("breditor-probe/rich-content")?,
            SchemaVersion::try_new(1)?,
        ),
        &ExtensionSet::try_new(vec![], ExtensionLimits::default())?,
    )?;
    assert_eq!(
        schema.fingerprint().to_string(),
        "sha256:6b9ac97d51e454591c16ae61a95f2cdd2fb91df67fe217f490a5024000aed958"
    );
    Ok(())
}
