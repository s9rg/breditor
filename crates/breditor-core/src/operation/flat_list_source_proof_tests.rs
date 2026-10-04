//! Exact source-proof reuse and mandatory complete-validation fallbacks.
use super::{FlatListTextReplaceError, validate_roots};
use crate::{
    block::TextBlockKind,
    codec::structural_codec_test_support::{TestResult, block, extensions, name},
    document::{FormatSet, NodeRef},
    schema::{CompiledSchema, DocumentLimits, SchemaId, SchemaVersion},
    state::EditorContext,
};
use std::error::Error;

fn context(limits: DocumentLimits) -> Result<EditorContext, Box<dyn Error>> {
    Ok(EditorContext::new(
        CompiledSchema::try_compile_flat_list_profile(
            SchemaId::new(name("example/source-proof")?, SchemaVersion::one()),
            &extensions()?,
        )?,
        limits,
    ))
}

fn paragraph(value: &str) -> Result<NodeRef, Box<dyn Error>> {
    block(TextBlockKind::Paragraph, value, FormatSet::default())
}

#[test]
fn exactly_equal_complete_roots_reuse_only_the_current_document_proof() -> TestResult {
    let context = context(DocumentLimits::default())?;
    let source = validate_roots(&context, vec![paragraph("a🙂")?], None)?;
    // Independently allocated, equal children are sufficient: proof reuse is
    // content-based, never a caller-supplied pointer or identity assertion.
    let same = validate_roots(&context, vec![paragraph("a🙂")?], Some(&source))?;
    assert!(same.root().shares_allocation_with(source.root()));
    assert_eq!(same.summary(), source.summary());
    assert!(same.is_proven_for(context.schema(), context.limits()));
    let standalone = validate_roots(&context, vec![paragraph("a🙂")?], None)?;
    assert!(!standalone.root().shares_allocation_with(source.root()));
    assert_eq!(standalone, source);
    let changed = validate_roots(&context, vec![paragraph("b🙂")?], Some(&source))?;
    assert!(!changed.root().shares_allocation_with(source.root()));
    assert_ne!(changed, source);
    Ok(())
}

#[test]
fn partial_roots_cannot_inherit_whole_document_measurements() -> TestResult {
    let context = context(DocumentLimits::default())?;
    let source = validate_roots(&context, vec![paragraph("ab")?, paragraph("cde")?], None)?;
    let partial = validate_roots(&context, vec![paragraph("ab")?], Some(&source))?;
    let oracle = validate_roots(&context, vec![paragraph("ab")?], None)?;
    assert!(!partial.root().shares_allocation_with(source.root()));
    assert_eq!(partial, oracle);
    assert_eq!(partial.summary(), oracle.summary());
    assert_eq!(partial.summary().total_text_bytes(), 2);
    assert_eq!(source.summary().total_text_bytes(), 5);
    Ok(())
}

#[test]
fn equal_roots_cannot_bypass_compiled_authority_or_changed_limits() -> TestResult {
    let original = context(DocumentLimits::default())?;
    let source = validate_roots(&original, vec![paragraph("abcd")?], None)?;
    let foreign = context(DocumentLimits::default())?;
    let revalidated = validate_roots(&foreign, vec![paragraph("abcd")?], Some(&source))?;
    assert!(!revalidated.root().shares_allocation_with(source.root()));
    assert!(revalidated.is_proven_for(foreign.schema(), foreign.limits()));
    assert!(!revalidated.is_proven_for(original.schema(), original.limits()));
    for maximum in [3, 4] {
        let strict = EditorContext::new(
            original.schema().clone(),
            DocumentLimits::default().with_max_total_text_bytes(maximum),
        );
        let result = validate_roots(&strict, vec![paragraph("abcd")?], Some(&source));
        if maximum == 3 {
            assert!(matches!(result, Err(FlatListTextReplaceError::Validation(_))));
        } else {
            let result = result?;
            assert!(!result.root().shares_allocation_with(source.root()));
            assert!(result.is_proven_for(strict.schema(), strict.limits()));
            assert_eq!(result.summary(), source.summary());
        }
    }
    Ok(())
}
