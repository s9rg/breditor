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

#[test]
fn captured_fragment_proofs_preserve_value_equality_and_exact_inverse() -> TestResult {
    let context = context(DocumentLimits::default())?;
    let block = paragraph("ab🙂")?;
    let source = state(&context, vec![block.clone()], None, None)?;
    let replacement = vec![list(block)?];
    let captured =
        NestedListReframe::capture(&context, source.document(), 0, 1, replacement.clone())?;
    let uncached = NestedListReframe::try_new(0, captured.expected().to_vec(), replacement)?;
    assert_eq!(captured, uncached);
    let edit = captured.apply(&context, source.document())?.ok_or("unchanged")?;
    let fresh = uncached.apply(&context, source.document())?.ok_or("unchanged")?;
    assert_eq!(edit.document(), fresh.document());
    assert_eq!(edit.document().summary(), fresh.document().summary());
    let proofs = captured.admitted_fragments.as_ref().ok_or("missing proofs")?;
    assert!(edit.document().root().shares_allocation_with(proofs[1].root()));
    let undone = edit.inverse().apply(&context, edit.document())?.ok_or("unchanged inverse")?;
    assert_eq!(undone.document(), source.document());
    assert!(undone.document().root().shares_allocation_with(source.document().root()));
    Ok(())
}

#[test]
fn retained_fragment_proofs_never_admit_foreign_authority_or_stricter_limits() -> TestResult {
    let original = context(DocumentLimits::default())?;
    let block = paragraph("ab")?;
    let source = state(&original, vec![block.clone()], None, None)?;
    let operation =
        NestedListReframe::capture(&original, source.document(), 0, 1, vec![list(block.clone())?])?;
    let foreign = context(DocumentLimits::default())?;
    let foreign_source = state(&foreign, vec![block.clone()], None, None)?;
    let edit = operation.apply(&foreign, foreign_source.document())?.ok_or("unchanged")?;
    assert!(edit.document().is_proven_for(foreign.schema(), foreign.limits()));
    assert!(!edit.document().root().shares_allocation_with(
        operation.admitted_fragments.as_ref().ok_or("missing proofs")?[1].root(),
    ));
    let strict =
        EditorContext::new(original.schema().clone(), DocumentLimits::default().with_max_nodes(3));
    let strict_source = state(&strict, vec![block], None, None)?;
    assert!(matches!(
        operation.apply(&strict, strict_source.document()),
        Err(NestedListReframeError::Validation(_))
    ));
    Ok(())
}

#[test]
fn partial_replacement_proof_does_not_replace_the_complete_result() -> TestResult {
    let context = context(DocumentLimits::default())?;
    let first = paragraph("first")?;
    let last = paragraph("last")?;
    let source = state(&context, vec![first.clone(), last.clone()], None, None)?;
    let operation =
        NestedListReframe::capture(&context, source.document(), 0, 1, vec![list(first)?])?;
    let edit = operation.apply(&context, source.document())?.ok_or("unchanged")?;
    let root = edit.document().root().as_element().ok_or("missing root")?;
    assert_eq!(root.children().len(), 2);
    assert_eq!(root.children().iter().nth(1), Some(&last));
    assert!(!edit.document().root().shares_allocation_with(
        operation.admitted_fragments.as_ref().ok_or("missing proofs")?[1].root(),
    ));
    assert_eq!(
        edit.inverse().apply(&context, edit.document())?.ok_or("unchanged")?.document(),
        source.document()
    );
    Ok(())
}

#[test]
fn retained_complete_proof_cannot_hide_new_unselected_roots() -> TestResult {
    let context = context(DocumentLimits::default().with_max_nodes(5))?;
    let first = paragraph("first")?;
    let initial = state(&context, vec![first.clone()], None, None)?;
    let operation =
        NestedListReframe::capture(&context, initial.document(), 0, 1, vec![list(first.clone())?])?;
    // At capture this fragment is also the complete result and fits exactly.
    assert!(operation.apply(&context, initial.document())?.is_some());
    // The same guard still matches after an unrelated root is added. Its cached
    // result proof no longer covers the complete document, whose limit is lower
    // than the resulting aggregate. Revalidate rather than reuse that proof.
    let expanded = state(&context, vec![first, paragraph("outside")?], None, None)?;
    assert!(matches!(
        operation.apply(&context, expanded.document()),
        Err(NestedListReframeError::Validation(_))
    ));
    Ok(())
}
