//! Complete-root admission reuse cannot weaken partial guards or result limits.
use super::{NestedListReframe, NestedListReframeError, validate_roots};
use crate::{
    block::TextBlockKind,
    codec::structural_codec_test_support::{TestResult, block, extensions, name, state},
    document::{ElementNode, FormatSet, NodeRef, PropertyMap},
    schema::{CompiledSchema, DocumentLimits, SchemaId, SchemaVersion},
    state::EditorContext,
};
use std::error::Error;

fn context(limits: DocumentLimits) -> Result<EditorContext, Box<dyn Error>> {
    Ok(EditorContext::new(
        CompiledSchema::try_compile_nested_list_profile(
            SchemaId::new(name("test/nested-reframe-proof")?, SchemaVersion::one()),
            &extensions()?,
        )?,
        limits,
    ))
}
fn paragraph(text: &str) -> Result<NodeRef, Box<dyn Error>> {
    block(TextBlockKind::Paragraph, text, FormatSet::default())
}
fn list(block: NodeRef) -> Result<NodeRef, Box<dyn Error>> {
    let item = NodeRef::element(ElementNode::try_new(
        name("breditor/list-item")?,
        None,
        PropertyMap::default(),
        vec![block],
    )?);
    Ok(NodeRef::element(ElementNode::try_new(
        name("breditor/bullet-list")?,
        None,
        PropertyMap::default(),
        vec![item],
    )?))
}

#[test]
fn exact_complete_root_reuses_only_matching_admission() -> TestResult {
    let context = context(DocumentLimits::default())?;
    let roots = vec![paragraph("a🙂")?, list(paragraph("b")?)?];
    let source = validate_roots(&context, &roots, None)?;
    let reused = validate_roots(&context, &roots, Some(&source))?;
    let fresh = validate_roots(&context, &roots, None)?;
    assert!(reused.root().shares_allocation_with(source.root()));
    assert!(!fresh.root().shares_allocation_with(source.root()));
    assert_eq!(fresh, reused);
    assert_eq!(fresh.summary(), reused.summary());
    Ok(())
}

#[test]
fn partial_roots_have_independent_summaries() -> TestResult {
    let context = context(DocumentLimits::default())?;
    let roots = vec![paragraph("ab")?, paragraph("cde")?];
    let source = validate_roots(&context, &roots, None)?;
    let partial = validate_roots(&context, &roots[..1], Some(&source))?;
    assert_eq!(partial, validate_roots(&context, &roots[..1], None)?);
    assert_eq!(partial.summary().total_text_bytes(), 2);
    assert_eq!(source.summary().total_text_bytes(), 5);
    assert!(!partial.root().shares_allocation_with(source.root()));
    Ok(())
}

#[test]
fn equal_roots_cannot_reuse_foreign_authority_or_limits() -> TestResult {
    let original = context(DocumentLimits::default())?;
    let roots = vec![paragraph("abcd")?];
    let source = validate_roots(&original, &roots, None)?;
    let foreign = context(DocumentLimits::default())?;
    let fresh = validate_roots(&foreign, &roots, Some(&source))?;
    assert!(!fresh.root().shares_allocation_with(source.root()));
    assert!(fresh.is_proven_for(foreign.schema(), foreign.limits()));
    let strict = EditorContext::new(
        original.schema().clone(),
        DocumentLimits::default().with_max_total_text_bytes(3),
    );
    assert!(matches!(
        validate_roots(&strict, &roots, Some(&source)),
        Err(NestedListReframeError::Validation(_))
    ));
    assert!(matches!(
        NestedListReframe::capture(&foreign, &source, 0, 1, roots.clone()),
        Err(NestedListReframeError::DocumentProof(_))
    ));
    Ok(())
}

#[test]
fn replacement_and_complete_result_limits_remain_checked() -> TestResult {
    let shallow = context(DocumentLimits::default().with_max_node_depth(2))?;
    let block = paragraph("a")?;
    let source = state(&shallow, vec![block.clone()], None, None)?;
    assert!(matches!(
        NestedListReframe::capture(&shallow, source.document(), 0, 1, vec![list(block.clone())?]),
        Err(NestedListReframeError::Validation(_))
    ));
    let bounded = context(DocumentLimits::default().with_max_nodes(5))?;
    let source = state(&bounded, vec![block.clone(), paragraph("b")?], None, None)?;
    let operation =
        NestedListReframe::capture(&bounded, source.document(), 0, 1, vec![list(block)?])?;
    // The replacement's synthetic document fits; the complete result does not.
    assert!(matches!(
        operation.apply(&bounded, source.document()),
        Err(NestedListReframeError::Validation(_))
    ));
    Ok(())
}

#[test]
fn reused_admission_does_not_hide_a_stale_noop_guard() -> TestResult {
    let context = context(DocumentLimits::default())?;
    let roots = vec![paragraph("ab")?];
    let source = state(&context, roots.clone(), None, None)?;
    let operation = NestedListReframe::capture(&context, source.document(), 0, 1, roots)?;
    assert!(operation.apply(&context, source.document())?.is_none());
    let changed = state(&context, vec![paragraph("ac")?], None, None)?;
    assert!(matches!(
        operation.apply(&context, changed.document()),
        Err(NestedListReframeError::ExpectedMismatch)
    ));
    Ok(())
}
