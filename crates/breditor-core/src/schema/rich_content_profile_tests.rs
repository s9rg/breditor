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

#[test]
fn rich_language_two_does_not_grant_legacy_editing_or_accept_a_revision_only_lookalike()
-> TestResult {
    let schema = CompiledSchema::try_compile_rich_content_profile_v2(
        SchemaId::new(QualifiedName::try_new("example/structural")?, SchemaVersion::try_new(1)?),
        &ExtensionSet::try_new(vec![], ExtensionLimits::default())?,
    )?;
    assert_eq!(schema.rich_content_revision(), Some(2));
    assert!(!schema.supports_text_splice_operations());
    assert!(!schema.supports_paragraph_structure_operations());
    assert!(!schema.supports_base_text_operations());
    assert!(!schema.supports_text_block_kind_operations());
    assert!(!schema.supports_flat_list_operations());
    assert!(!schema.supports_nested_list_reframe());
    let mut unsupported = schema.definition().as_ref().clone();
    unsupported.rich_content_contract = Some(5);
    assert!(!supports_rich_content(&unsupported));
    assert_ne!(schema.fingerprint(), fingerprint(&unsupported));
    Ok(())
}

#[test]
fn explicit_rich_v3_keeps_legacy_editing_capabilities_sealed() -> TestResult {
    let schema = CompiledSchema::try_compile_rich_content_profile_v3(
        SchemaId::new(QualifiedName::try_new("example/layout")?, SchemaVersion::try_new(1)?),
        &ExtensionSet::try_new(vec![], ExtensionLimits::default())?,
    )?;
    assert_eq!(schema.rich_content_revision(), Some(3));
    assert!(!schema.supports_text_splice_operations());
    assert!(!schema.supports_paragraph_structure_operations());
    assert!(!schema.supports_base_text_operations());
    assert!(!schema.supports_text_block_kind_operations());
    assert!(!schema.supports_flat_list_operations());
    assert!(!schema.supports_nested_list_reframe());
    let mut future = schema.definition().as_ref().clone();
    future.rich_content_contract = Some(5);
    assert!(!supports_rich_content(&future));
    assert_ne!(schema.fingerprint(), fingerprint(&future));
    Ok(())
}

#[test]
fn explicit_candidate_v4_is_only_v3_grammar_with_its_own_rule_revision() -> TestResult {
    let id = SchemaId::new(QualifiedName::try_new("example/v4")?, SchemaVersion::try_new(1)?);
    let extensions = ExtensionSet::try_new(vec![], ExtensionLimits::default())?;
    let v3 = CompiledSchema::try_compile_rich_content_profile_v3(id.clone(), &extensions)?;
    let v4 = CompiledSchema::try_compile_rich_content_profile_v4(id, &extensions)?;
    assert_eq!(v4.rich_content_revision(), Some(4));
    assert_eq!(compiler_contract_version(v4.definition()), 6);
    assert_ne!(v3.fingerprint(), v4.fingerprint());
    assert!(!v4.supports_text_splice_operations());
    assert!(!v4.supports_base_text_operations());
    assert!(!v4.supports_flat_list_operations());
    // The only difference from V3 is the sealed rule revision.
    let mut lookalike = v3.definition().as_ref().clone();
    lookalike.rich_content_contract = Some(4);
    assert_eq!(fingerprint(&lookalike), v4.fingerprint());
    assert!(!v3.supports_rich_list_numbering());
    assert!(v4.supports_rich_list_numbering());
    assert!(v3.supports_rich_block_layout() && v4.supports_rich_block_layout());
    Ok(())
}
