//! Pure reconstruction reuse must never substitute for context admission.
use super::*;
use crate::{
    block::TextBlockKind,
    codec::{
        OperationJsonCodecV7,
        structural_codec_test_support::{TestResult, block, extensions, formats, name, state},
    },
    position::TextOffset,
    schema::{CompiledSchema, DocumentLimits, SchemaId, SchemaVersion},
};

fn context(limits: DocumentLimits) -> Result<EditorContext, Box<dyn std::error::Error>> {
    Ok(EditorContext::new(
        CompiledSchema::try_compile_nested_list_profile(
            SchemaId::new(name("test/nested-reconstruction-cache")?, SchemaVersion::one()),
            &extensions()?,
        )?,
        limits,
    ))
}
fn paragraph(text: &str) -> Result<NodeRef, Box<dyn std::error::Error>> {
    block(TextBlockKind::Paragraph, text, formats()?)
}
fn operation() -> Result<NestedListTextReplace, Box<dyn std::error::Error>> {
    Ok(NestedListTextReplace::try_new(
        0,
        NestedListTextRange::try_new(
            NodePath::try_from_indices(vec![0])?,
            TextOffset::try_new(1)?,
            NodePath::try_from_indices(vec![0])?,
            TextOffset::try_new(1)?,
        )?,
        vec![paragraph("ab")?],
        vec![paragraph("X")?, paragraph("Y")?],
        NestedListTextReplace::capture_layout(&[paragraph("")?, paragraph("")?])?,
    )?)
}

fn captured_operation(
    context: &EditorContext,
) -> Result<NestedListTextReplace, Box<dyn std::error::Error>> {
    let source = state(context, vec![paragraph("ab")?], None, None)?;
    let recipe = operation()?;
    Ok(NestedListTextReplace::capture(
        context,
        source.document(),
        recipe.range.clone(),
        recipe.inserted.to_vec(),
        recipe.layout.to_vec(),
    )?)
}

#[test]
fn retained_derivation_is_shared_but_not_semantic_or_wire_state() -> TestResult {
    let context = context(DocumentLimits::default())?;
    let cached = captured_operation(&context)?;
    let cloned = cached.clone();
    assert!(Arc::ptr_eq(
        cached.derived.as_ref().ok_or("missing derivation")?,
        cloned.derived.as_ref().ok_or("missing cloned derivation")?,
    ));
    assert!(Arc::ptr_eq(
        cached.admitted_fragments.as_ref().ok_or("missing fragment proofs")?,
        cloned.admitted_fragments.as_ref().ok_or("missing cloned proofs")?,
    ));
    let mut uncached = cached.clone();
    uncached.derived = None;
    uncached.admitted_fragments = None;
    assert_eq!(cached, uncached);
    assert_eq!(format!("{cached:?}"), format!("{uncached:?}"));
    let codec = OperationJsonCodecV7::new(context.clone());
    assert_eq!(
        codec.encode(&Operation::NestedListTextReplace(cached.clone()))?,
        codec.encode(&Operation::NestedListTextReplace(uncached.clone()))?,
    );
    let source = state(&context, vec![paragraph("ab")?], None, None)?;
    let cached_result = cached.apply(&context, source.document())?;
    let uncached_result = uncached.apply(&context, source.document())?;
    match (cached_result, uncached_result) {
        (AppliedOperation::Changed(left), AppliedOperation::Changed(right)) => {
            assert_eq!(left.document, right.document);
            assert_eq!(left.inverse, right.inverse);
            assert_eq!(left.relocation, right.relocation);
            assert_eq!(left.change, right.change);
            let Operation::NestedListTextReplace(inverse) = &left.inverse else {
                return Err("unexpected inverse type".into());
            };
            assert!(inverse.admitted_fragments.is_some());
            let AppliedOperation::Changed(restored) = inverse.apply(&context, &left.document)?
            else {
                return Err("expected inverse edit".into());
            };
            assert_eq!(&restored.document, source.document());
        }
        _ => return Err("expected changed results".into()),
    }
    Ok(())
}

#[test]
fn retained_derivation_still_rejects_stale_guards_and_aggregate_limits() -> TestResult {
    let context = context(DocumentLimits::default().with_max_nodes(5))?;
    let operation = captured_operation(&context)?;
    let stale = state(&context, vec![paragraph("zz")?], None, None)?;
    assert!(matches!(
        operation.apply(&context, stale.document()),
        Err(NestedListTextReplaceError::ExpectedMismatch)
    ));
    // Both source and replacement fragment fit five nodes separately; their
    // combination with an untouched sibling needs seven and must be rejected.
    let expanded = state(&context, vec![paragraph("ab")?, paragraph("tail")?], None, None)?;
    assert!(matches!(
        operation.apply(&context, expanded.document()),
        Err(NestedListTextReplaceError::Validation(_))
    ));
    Ok(())
}

#[test]
fn retained_derivation_is_not_a_foreign_schema_or_limit_proof() -> TestResult {
    let permissive = context(DocumentLimits::default())?;
    let restrictive = context(DocumentLimits::default().with_max_nodes(4))?;
    let operation = captured_operation(&permissive)?;
    operation.validate(&permissive)?;
    assert!(matches!(
        operation.validate(&restrictive),
        Err(NestedListTextReplaceError::Validation(_))
    ));
    let source = state(&permissive, vec![paragraph("ab")?], None, None)?;
    assert!(matches!(
        operation.apply(&restrictive, source.document()),
        Err(NestedListTextReplaceError::DocumentProof(_))
    ));
    Ok(())
}

#[test]
fn valid_fragment_hint_for_wrong_root_cannot_bypass_result_limits() -> TestResult {
    let permissive = context(DocumentLimits::default())?;
    let restrictive = context(DocumentLimits::default().with_max_nodes(4))?;
    let mut operation = captured_operation(&permissive)?;
    let source = state(&restrictive, vec![paragraph("ab")?], None, None)?;
    // This hint has the correct authority and limits but the wrong result root.
    // The actual two-block result needs five nodes and must validate afresh.
    operation.admitted_fragments =
        Some(Arc::new([source.document().clone(), source.document().clone()]));
    assert!(matches!(
        operation.apply(&restrictive, source.document()),
        Err(NestedListTextReplaceError::Validation(_))
    ));
    Ok(())
}
