//! Exact within-call proof reuse and independently validated fallbacks.
use super::{NestedListTextSpliceError, validate_root};
use crate::{
    block::TextBlockKind,
    codec::structural_codec_test_support::{TestResult, block, extensions, name, state},
    document::{FormatSet, NodeRef},
    schema::{CompiledSchema, DocumentLimits, SchemaId, SchemaVersion},
    state::EditorContext,
};
use std::error::Error;

fn context(limits: DocumentLimits) -> Result<EditorContext, Box<dyn Error>> {
    Ok(EditorContext::new(
        CompiledSchema::try_compile_nested_list_profile(
            SchemaId::new(name("test/nested-splice-helper-proof")?, SchemaVersion::one()),
            &extensions()?,
        )?,
        limits,
    ))
}
fn paragraph(value: &str) -> Result<NodeRef, Box<dyn Error>> {
    block(TextBlockKind::Paragraph, value, FormatSet::default())
}

#[test]
fn exact_complete_root_reuses_only_matching_proof() -> TestResult {
    let context = context(DocumentLimits::default())?;
    let source = validate_root(&context, paragraph("a🙂")?, None)?;
    let reused = validate_root(&context, paragraph("a🙂")?, Some(&source))?;
    assert!(reused.root().shares_allocation_with(source.root()));
    assert_eq!(reused.summary(), source.summary());
    let fresh = validate_root(&context, paragraph("a🙂")?, None)?;
    assert!(!fresh.root().shares_allocation_with(source.root()));
    assert_eq!(fresh, reused);
    let changed = validate_root(&context, paragraph("b🙂")?, Some(&source))?;
    assert!(!changed.root().shares_allocation_with(source.root()));
    assert_ne!(changed, source);
    Ok(())
}

#[test]
fn partial_root_cannot_inherit_whole_document_summary() -> TestResult {
    let context = context(DocumentLimits::default())?;
    let source = state(&context, vec![paragraph("ab")?, paragraph("cde")?], None, None)?;
    let partial = validate_root(&context, paragraph("ab")?, Some(source.document()))?;
    let fresh = validate_root(&context, paragraph("ab")?, None)?;
    assert_eq!(partial, fresh);
    assert_eq!(partial.summary(), fresh.summary());
    assert_eq!(partial.summary().total_text_bytes(), 2);
    assert_eq!(source.document().summary().total_text_bytes(), 5);
    assert!(!partial.root().shares_allocation_with(source.document().root()));
    Ok(())
}

#[test]
fn equal_content_cannot_bypass_compiled_authority_or_limits() -> TestResult {
    let original = context(DocumentLimits::default())?;
    let source = validate_root(&original, paragraph("abcd")?, None)?;
    let foreign = context(DocumentLimits::default())?;
    let result = validate_root(&foreign, paragraph("abcd")?, Some(&source))?;
    assert!(!result.root().shares_allocation_with(source.root()));
    assert!(result.is_proven_for(foreign.schema(), foreign.limits()));
    assert!(!result.is_proven_for(original.schema(), original.limits()));
    let strict = EditorContext::new(
        original.schema().clone(),
        DocumentLimits::default().with_max_total_text_bytes(3),
    );
    assert!(matches!(
        validate_root(&strict, paragraph("abcd")?, Some(&source)),
        Err(NestedListTextSpliceError::Validation(_))
    ));
    Ok(())
}
