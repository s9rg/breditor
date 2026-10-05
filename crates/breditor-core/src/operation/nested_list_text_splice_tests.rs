//! Nested text splice scalar, guard and history laws.
use super::{NestedListTextSplice, Operation, TextRange};
use crate::{
    block::TextBlockKind,
    codec::structural_codec_test_support::{TestResult, block, extensions, formats, name, state},
    document::{ElementNode, NodeRef, PropertyMap, TextFragment, TextRun},
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
#[test]
fn nested_text_splice_preserves_wrappers_and_exact_history() -> TestResult {
    let context = EditorContext::new(
        CompiledSchema::try_compile_nested_list_profile(
            SchemaId::new(name("test/nested-text")?, SchemaVersion::one()),
            &extensions()?,
        )?,
        DocumentLimits::default(),
    );
    let parent = block(TextBlockKind::Paragraph, "parent", formats()?)?;
    let target = block(TextBlockKind::Paragraph, "a🙂b", formats()?)?;
    let descendant = element(
        "breditor/bullet-list",
        vec![element(
            "breditor/list-item",
            vec![block(TextBlockKind::Paragraph, "child", formats()?)?],
        )?],
    )?;
    let root = element(
        "breditor/bullet-list",
        vec![element(
            "breditor/list-item",
            vec![
                parent.clone(),
                element(
                    "breditor/bullet-list",
                    vec![element("breditor/list-item", vec![target, descendant.clone()])?],
                )?,
            ],
        )?],
    )?;
    let path = NodePath::try_from_indices(vec![0, 0, 1, 0, 0])?;
    let point =
        Point::Text { text_path: path.try_child(0)?, utf16_offset: 3, affinity: Affinity::After };
    let before = state(
        &context,
        vec![root],
        Selection::Range(RangeSelection::new(point.clone(), point)),
        None,
    )?;
    let range = TextRange::try_new(path.clone(), TextOffset::try_new(1)?, TextOffset::try_new(3)?)?;
    {
        use crate::action::{
            ActionId, ActionInput, ActionInvocation, ActionRegistration, ActionRegistry,
            ActionValue,
            builtins::{InsertNestedListTextAction, insert_text_input_contract},
        };
        let id = ActionId::try_new("test/nested-type")?;
        let registry = ActionRegistry::try_new(vec![ActionRegistration::with_input(
            id.clone(),
            insert_text_input_contract(),
            InsertNestedListTextAction,
        )])?;
        let mut typing = EditorSession::new(before.clone());
        for text in ["X", "Y"] {
            let invocation = ActionInvocation::new(
                id.clone(),
                ActionInput::typed(
                    insert_text_input_contract(),
                    ActionValue::try_from_string(text)?,
                ),
            );
            typing.execute_prepared_action(registry.prepare(typing.state(), &invocation)?)?;
        }
        assert_eq!(
            typing.state().document().node_at(&path)?,
            &block(TextBlockKind::Paragraph, "a🙂XYb", formats()?)?
        );
        let caret = Point::Text {
            text_path: path.try_child(0)?,
            utf16_offset: 5,
            affinity: Affinity::Before,
        };
        assert_eq!(
            typing.state().selection(),
            Some(&Selection::Range(RangeSelection::new(caret.clone(), caret)))
        );
        assert_eq!(typing.undo_depth(), 1);
        let codec = crate::codec::SessionCheckpointJsonCodecV7::new(context.clone());
        let mut restored = codec.decode(&codec.encode(&typing)?)?;
        restored.undo()?.ok_or("typing undo")?;
        assert_eq!(restored.state().document(), before.document());
        assert_eq!(restored.state().selection(), before.selection());
        restored.redo()?.ok_or("typing redo")?;
        assert_eq!(restored.state().document(), typing.state().document());
        assert_eq!(restored.state().selection(), typing.state().selection());
    }
    let replacement = TextFragment::try_from_runs(vec![TextRun::try_new("日本", formats()?)?])?;
    let operation =
        NestedListTextSplice::capture(&context, before.document(), range, replacement.clone())?;
    let mut session = EditorSession::new(before.clone());
    session
        .apply_transaction(&Transaction::new(
            &before,
            vec![Operation::NestedListTextSplice(operation.clone())],
        ))?
        .into_commit()
        .ok_or("commit")?;
    let after = session.state().clone();
    assert_eq!(
        after.document().node_at(&path)?,
        &block(TextBlockKind::Paragraph, "a日本b", formats()?)?
    );
    assert_eq!(after.document().node_at(&NodePath::try_from_indices(vec![0, 0, 0])?)?, &parent);
    assert_eq!(
        after.document().node_at(&NodePath::try_from_indices(vec![0, 0, 1, 0, 1])?)?,
        &descendant
    );
    assert!(
        session
            .apply_transaction(&Transaction::new(
                &after,
                vec![Operation::NestedListTextSplice(operation)]
            ))
            .is_err()
    );
    assert_eq!(session.state(), &after);
    session.undo()?.ok_or("undo")?;
    assert_eq!(session.state().document(), before.document());
    assert_eq!(session.state().selection(), before.selection());
    session.redo()?.ok_or("redo")?;
    assert_eq!(session.state().document(), after.document());
    assert_eq!(session.state().selection(), after.selection());
    let invalid = TextRange::try_new(path, TextOffset::try_new(2)?, TextOffset::try_new(3)?)?;
    assert!(
        NestedListTextSplice::capture(&context, before.document(), invalid, replacement).is_err()
    );
    Ok(())
}
