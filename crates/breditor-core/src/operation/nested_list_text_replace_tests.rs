//! Nested split/replacement structure, Unicode, relocation and durable inverse laws.
use super::{NestedListTextRange, NestedListTextReplace, Operation};
use crate::{
    block::TextBlockKind,
    codec::{
        OperationJsonCodecV6, OperationJsonCodecV7, SessionCheckpointJsonCodecV7,
        structural_codec_test_support::{TestResult, block, extensions, formats, name, state},
    },
    document::{ElementNode, FormatSet, NodeRef, PropertyMap},
    position::{Affinity, NodePath, Point, TextOffset},
    schema::{CompiledSchema, DocumentLimits, SchemaId, SchemaVersion},
    selection::{RangeSelection, Selection},
    session::EditorSession,
    state::EditorContext,
    transaction::Transaction,
};
use std::error::Error;
fn element(kind: &str, children: Vec<NodeRef>) -> Result<NodeRef, Box<dyn Error>> {
    Ok(NodeRef::element(ElementNode::try_new(name(kind)?, None, PropertyMap::default(), children)?))
}
fn text(value: &str) -> Result<NodeRef, Box<dyn Error>> {
    block(TextBlockKind::Paragraph, value, formats()?)
}
fn item(children: Vec<NodeRef>) -> Result<NodeRef, Box<dyn Error>> {
    element("breditor/list-item", children)
}
fn list(children: Vec<NodeRef>) -> Result<NodeRef, Box<dyn Error>> {
    element("breditor/bullet-list", children)
}
fn document(items: Vec<NodeRef>) -> Result<Vec<NodeRef>, Box<dyn Error>> {
    Ok(vec![list(vec![item(vec![text("parent")?, list(items)?])?])?, text("outside")?])
}
fn path(index: u32) -> Result<NodePath, Box<dyn Error>> {
    Ok(NodePath::try_from_indices(vec![0, 0, 1, index, 0])?)
}
fn range(
    first: u32,
    start: u64,
    last: u32,
    end: u64,
) -> Result<NestedListTextRange, Box<dyn Error>> {
    Ok(NestedListTextRange::try_new(
        path(first)?,
        TextOffset::try_new(start)?,
        path(last)?,
        TextOffset::try_new(end)?,
    )?)
}
#[test]
#[allow(
    clippy::too_many_lines,
    reason = "Keep the complete exact-state/history regression scenario together."
)]
fn nested_structural_split_and_cross_descendant_replacement_restore_exactly() -> TestResult {
    let context = EditorContext::new(
        CompiledSchema::try_compile_nested_list_profile(
            SchemaId::new(name("test/nested-structural")?, SchemaVersion::one()),
            &extensions()?,
        )?,
        DocumentLimits::default(),
    );
    let descendant = list(vec![item(vec![text("child")?])?])?;
    for split in [true, false] {
        let source = document(vec![
            item(vec![text("a🙂b")?, descendant.clone()])?,
            item(vec![text("tail")?])?,
        ])?;
        let edit_range = if split { range(0, 1, 0, 3)? } else { range(0, 3, 1, 1)? };
        let first = Point::Text {
            text_path: edit_range.start_path().try_child(0)?,
            utf16_offset: u32::try_from(edit_range.start_offset().get())?,
            affinity: Affinity::Before,
        };
        let last = Point::Text {
            text_path: edit_range.end_path().try_child(0)?,
            utf16_offset: u32::try_from(edit_range.end_offset().get())?,
            affinity: Affinity::After,
        };
        let before = state(
            &context,
            source.clone(),
            Selection::Range(RangeSelection::new(last, first)),
            None,
        )?;
        let (inserted, expected) = if split {
            (
                vec![text("X")?, text("Y")?],
                document(vec![
                    item(vec![text("aX")?])?,
                    item(vec![text("Yb")?, descendant.clone()])?,
                    item(vec![text("tail")?])?,
                ])?,
            )
        } else {
            (vec![text("Z")?], document(vec![item(vec![text("a🙂Zail")?])?])?)
        };
        let layout = NestedListTextReplace::capture_layout(&expected[..1])?;
        let operation = NestedListTextReplace::capture(
            &context,
            before.document(),
            edit_range,
            inserted,
            layout,
        )?;
        // Capture's retained reconstruction must equal independent public
        // construction and validation, including Unicode and descendant layout.
        let independent = NestedListTextReplace::try_new(
            operation.guard_start(),
            operation.range().clone(),
            operation.expected().to_vec(),
            operation.inserted().to_vec(),
            operation.layout().to_vec(),
        )?;
        independent.validate(&context)?;
        assert_eq!(operation, independent);
        let operation = Operation::NestedListTextReplace(operation);
        let codec = OperationJsonCodecV7::new(context.clone());
        let encoded = codec.encode(&operation)?;
        assert_eq!(codec.decode(&encoded)?, operation);
        assert!(OperationJsonCodecV6::new(context.clone()).encode(&operation).is_err());
        if split {
            let descendant_point = Point::Text {
                text_path: NodePath::try_from_indices(vec![0, 0, 1, 0, 1, 0, 0, 0])?,
                utf16_offset: 1,
                affinity: Affinity::After,
            };
            let observer = state(
                &context,
                source.clone(),
                Selection::Range(RangeSelection::new(descendant_point.clone(), descendant_point)),
                None,
            )?;
            let mut observer_session = EditorSession::new(observer.clone());
            observer_session
                .apply_transaction(&Transaction::new(&observer, vec![operation.clone()]))?
                .into_commit()
                .ok_or("observer commit")?;
            let mapped = Point::Text {
                text_path: NodePath::try_from_indices(vec![0, 0, 1, 1, 1, 0, 0, 0])?,
                utf16_offset: 1,
                affinity: Affinity::After,
            };
            assert_eq!(
                observer_session.state().selection(),
                Some(&Selection::Range(RangeSelection::new(mapped.clone(), mapped)))
            );
        }
        let mut session = EditorSession::new(before.clone());
        session
            .apply_transaction(&Transaction::new(&before, vec![operation.clone()]))?
            .into_commit()
            .ok_or("commit")?;
        let after = session.state().clone();
        assert_eq!(after.document(), state(&context, expected, None, None)?.document());
        assert!(session.apply_transaction(&Transaction::new(&after, vec![operation])).is_err());
        assert_eq!(session.state(), &after);
        let sessions = SessionCheckpointJsonCodecV7::new(context.clone());
        let mut restored = sessions.decode(&sessions.encode(&session)?)?;
        restored.undo()?.ok_or("undo")?;
        assert_eq!(restored.state().document(), before.document());
        assert_eq!(restored.state().selection(), before.selection());
        restored.redo()?.ok_or("redo")?;
        assert_eq!(restored.state().document(), after.document());
        assert_eq!(restored.state().selection(), after.selection());
        let mut malformed: serde_json::Value = serde_json::from_str(&encoded)?;
        malformed["operation"]["start"]["block"] = serde_json::json!([0, 0, 0, 0, 0]);
        assert!(codec.decode(&serde_json::to_string(&malformed)?).is_err());
    }
    Ok(())
}
#[test]
fn nested_structural_recipe_rejects_invalid_ranges_and_template_slots() -> TestResult {
    let source = document(vec![item(vec![text("a🙂b")?])?])?;
    let layout = NestedListTextReplace::capture_layout(&source[..1])?;
    assert!(
        NestedListTextReplace::try_new(
            0,
            range(0, 2, 0, 3)?,
            source[..1].to_vec(),
            vec![text("")?],
            layout.clone()
        )
        .is_err()
    );
    // A layout is shape only: nonempty text must not be silently ignored.
    assert!(
        NestedListTextReplace::try_new(
            0,
            range(0, 1, 0, 3)?,
            source[..1].to_vec(),
            vec![text("")?],
            source[..1].to_vec()
        )
        .is_err()
    );
    assert!(
        NestedListTextReplace::try_new(
            0,
            range(0, 1, 0, 3)?,
            source[..1].to_vec(),
            vec![text("")?, text("")?],
            layout
        )
        .is_err()
    );
    assert!(
        NestedListTextRange::try_new(
            NodePath::try_from_indices(vec![0, 0, 0, 0, 0])?,
            TextOffset::ZERO,
            path(0)?,
            TextOffset::ZERO
        )
        .is_err()
    );
    let blank = block(TextBlockKind::Paragraph, "", FormatSet::default())?;
    assert!(
        NestedListTextReplace::try_new(
            0,
            range(0, 1, 0, 3)?,
            source[..1].to_vec(),
            vec![blank],
            vec![]
        )
        .is_err()
    );
    Ok(())
}

#[test]
fn nested_structural_wire_does_not_treat_fragment_sequence_as_root_children() -> TestResult {
    let context = EditorContext::new(
        CompiledSchema::try_compile_nested_list_profile(
            SchemaId::new(name("test/nested-fanout")?, SchemaVersion::one()),
            &extensions()?,
        )?,
        DocumentLimits::default().with_max_children_per_element(2),
    );
    let before = state(&context, vec![text("ab")?], None, None)?;
    let expected = vec![list(vec![
        item(vec![text("a")?, list(vec![item(vec![text("")?])?])?])?,
        item(vec![text("b")?])?,
    ])?];
    let range = NestedListTextRange::try_new(
        NodePath::try_from_indices(vec![0])?,
        TextOffset::try_new(1)?,
        NodePath::try_from_indices(vec![0])?,
        TextOffset::try_new(1)?,
    )?;
    let op = Operation::NestedListTextReplace(NestedListTextReplace::capture(
        &context,
        before.document(),
        range.clone(),
        vec![text("")?, text("")?, text("")?],
        NestedListTextReplace::capture_layout(&expected)?,
    )?);
    let codec = OperationJsonCodecV7::new(context.clone());
    assert_eq!(codec.decode(&codec.encode(&op)?)?, op);
    let oversized_list =
        list(vec![item(vec![text("")?])?, item(vec![text("")?])?, item(vec![text("")?])?])?;
    assert!(
        NestedListTextReplace::capture(
            &context,
            before.document(),
            range,
            vec![text("")?, text("")?, text("")?],
            NestedListTextReplace::capture_layout(&[oversized_list])?
        )
        .is_err()
    );
    let mut session = EditorSession::new(before.clone());
    session
        .apply_transaction(&Transaction::new(&before, vec![op]))?
        .into_commit()
        .ok_or("commit")?;
    assert_eq!(session.state().document(), state(&context, expected, None, None)?.document());
    let sessions = SessionCheckpointJsonCodecV7::new(context);
    let mut recovered = sessions.decode(&sessions.encode(&session)?)?;
    recovered.undo()?.ok_or("undo")?;
    assert_eq!(recovered.state().document(), before.document());
    Ok(())
}
