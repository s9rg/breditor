//! Public nested formatting: structure, endpoint direction, durable undo and limits.
use super::*;
use crate::{
    action::{Action, ActionDecision, ActionId, ActionInput, ActionInvocation, ActionValue},
    block::TextBlockKind,
    codec::{
        SessionCheckpointJsonCodecV7,
        structural_codec_test_support::{TestResult, block, extensions, formats, name, state},
    },
    document::{ElementNode, FormatSet, NodeRef, PropertyMap},
    position::{Affinity, NodePath, Point},
    schema::{CompiledSchema, DocumentLimits, SchemaId, SchemaVersion},
    selection::{RangeOrder, RangeSelection, Selection},
    session::EditorSession,
    state::{EditorContext, EditorState},
};
use std::error::Error;

fn element(kind: &str, children: Vec<NodeRef>) -> Result<NodeRef, Box<dyn Error>> {
    Ok(NodeRef::element(ElementNode::try_new(name(kind)?, None, PropertyMap::default(), children)?))
}
fn fixture(reverse: bool, budget: u32) -> Result<EditorState, Box<dyn Error>> {
    let context = EditorContext::new(
        CompiledSchema::try_compile_nested_list_profile(
            SchemaId::new(name("test/nested-format")?, SchemaVersion::one()),
            &extensions()?,
        )?,
        DocumentLimits::default(),
    )
    .with_max_operations_per_transaction(budget);
    let roots = vec![element(
        "breditor/bullet-list",
        vec![
            element(
                "breditor/list-item",
                vec![
                    block(TextBlockKind::Paragraph, "parent", formats()?)?,
                    element(
                        "breditor/bullet-list",
                        vec![element(
                            "breditor/list-item",
                            vec![
                                block(TextBlockKind::Paragraph, "a🙂b", formats()?)?,
                                element(
                                    "breditor/bullet-list",
                                    vec![element(
                                        "breditor/list-item",
                                        vec![block(TextBlockKind::Paragraph, "deep", formats()?)?],
                                    )?],
                                )?,
                            ],
                        )?],
                    )?,
                ],
            )?,
            element(
                "breditor/list-item",
                vec![block(TextBlockKind::Paragraph, "tail", formats()?)?],
            )?,
        ],
    )?];
    let first = Point::Text {
        text_path: NodePath::try_from_indices(vec![0, 0, 1, 0, 0, 0])?,
        utf16_offset: 1,
        affinity: Affinity::After,
    };
    let last = Point::Text {
        text_path: NodePath::try_from_indices(vec![0, 1, 0, 0])?,
        utf16_offset: 2,
        affinity: Affinity::Before,
    };
    let selection =
        if reverse { RangeSelection::new(last, first) } else { RangeSelection::new(first, last) };
    state(&context, roots, Selection::Range(selection), None)
}
fn registry() -> Result<ActionRegistry, Box<dyn Error>> {
    Ok(ActionRegistry::try_new(vec![
        ActionRegistration::new(
            clear_nested_list_inline_formats_action_id(),
            ClearNestedListInlineFormatsAction,
        ),
        ActionRegistration::new(
            ActionId::try_new("test/strong")?,
            ToggleNestedListInlineFormatAction::new(name("breditor/strong")?),
        ),
        ActionRegistration::with_input(
            ActionId::try_new("test/link")?,
            set_inline_format_input_contract(),
            SetNestedListInlineFormatAction::new(name("example/link")?),
        ),
    ])?)
}
fn fragment(
    state: &EditorState,
    path: &[u32],
) -> Result<crate::document::TextFragment, Box<dyn Error>> {
    let node = state.document().node_at(&NodePath::try_from_indices(path.to_vec())?)?;
    Ok(crate::document::TextFragment::try_from_runs(
        node.as_element()
            .ok_or("block")?
            .children()
            .iter()
            .map(|node| node.as_text().map(crate::document::TextRun::from_text_node).ok_or("text"))
            .collect::<Result<Vec<_>, _>>()?,
    )?)
}
#[test]
fn nested_format_cross_depth_preserves_logical_range_and_v7_history() -> TestResult {
    for reverse in [false, true] {
        let before = fixture(reverse, 10)?;
        let registry = registry()?;
        let mut session = EditorSession::new(before.clone());
        let clear = ActionInvocation::without_input(clear_nested_list_inline_formats_action_id());
        session.execute_prepared_action(registry.prepare(session.state(), &clear)?)?;
        let after = session.state().clone();
        assert_eq!(fragment(&after, &[0, 0, 0])?, fragment(&before, &[0, 0, 0])?);
        let target = fragment(&after, &[0, 0, 1, 0, 0])?;
        assert_eq!(target.iter().map(|run| run.text()).collect::<String>(), "a🙂b");
        let runs = target.iter().collect::<Vec<_>>();
        assert_eq!(runs.len(), 2);
        assert_eq!(runs[0].formats(), &formats()?);
        assert_eq!(runs[1].formats(), &FormatSet::default());
        assert!(
            fragment(&after, &[0, 0, 1, 0, 1, 0, 0])?
                .iter()
                .all(|run| run.formats() == &FormatSet::default())
        );
        let tail = fragment(&after, &[0, 1, 0])?;
        let runs = tail.iter().collect::<Vec<_>>();
        assert_eq!(runs[0].text(), "ta");
        assert_eq!(runs[0].formats(), &FormatSet::default());
        assert_eq!(runs[1].text(), "il");
        assert_eq!(runs[1].formats(), &formats()?);
        let normalized =
            crate::action::text_position::normalize_nested_list_range_selection(&after)?;
        let original =
            crate::action::text_position::normalize_nested_list_range_selection(&before)?;
        assert_eq!(normalized, original);
        assert_eq!(
            normalized.order(),
            if reverse { RangeOrder::Backward } else { RangeOrder::Forward }
        );
        let codec = SessionCheckpointJsonCodecV7::new(before.context().clone());
        let mut restored = codec.decode(&codec.encode(&session)?)?;
        assert_eq!(restored.undo_depth(), 1);
        restored.undo()?.ok_or("undo")?;
        assert_eq!(restored.state().document(), before.document());
        assert_eq!(restored.state().selection(), before.selection());
        restored.redo()?.ok_or("redo")?;
        assert_eq!(restored.state().document(), after.document());
        assert_eq!(restored.state().selection(), after.selection());
        // Typed link properties and toggle share the same cross-depth route.
        let link = ActionInvocation::new(
            ActionId::try_new("test/link")?,
            ActionInput::typed(
                set_inline_format_input_contract(),
                ActionValue::try_object(vec![
                    ("operation".into(), ActionValue::try_from_string("set")?),
                    (
                        "properties".into(),
                        ActionValue::try_array(vec![ActionValue::try_object(vec![
                            ("name".into(), ActionValue::try_from_string("example/href")?),
                            ("value".into(), ActionValue::try_from_string("https://example.org")?),
                        ])?])?,
                    ),
                ])?,
            ),
        );
        restored.execute_prepared_action(registry.prepare(restored.state(), &link)?)?;
        restored.execute_prepared_action(registry.prepare(
            restored.state(),
            &ActionInvocation::without_input(ActionId::try_new("test/strong")?),
        )?)?;
        let final_state = restored.state().clone();
        let mut recovered = codec.decode(&codec.encode(&restored)?)?;
        for _ in 0..3 {
            recovered.undo()?.ok_or("all undo")?;
        }
        assert_eq!(recovered.state().document(), before.document());
        for _ in 0..3 {
            recovered.redo()?.ok_or("all redo")?;
        }
        assert_eq!(recovered.state().document(), final_state.document());
        assert_eq!(recovered.state().selection(), final_state.selection());
    }
    Ok(())
}
#[test]
fn nested_format_operation_budget_rejection_is_atomic() -> TestResult {
    let before = fixture(false, 2)?;
    let result = ClearNestedListInlineFormatsAction.evaluate(&before, &())?;
    assert!(
        matches!(result.decision(), ActionDecision::Disabled(reason) if reason.code().as_str() == "breditor/operation-budget-exceeded")
    );
    Ok(())
}

#[test]
fn nested_format_caret_pending_and_excluded_end_are_preserved() -> TestResult {
    let template = fixture(false, 0)?;
    let roots = template.document().root().as_element().ok_or("root")?.children().to_vec();
    let path = NodePath::try_from_indices(vec![0, 0, 1, 0, 0, 0])?;
    let point = Point::Text { text_path: path, utf16_offset: 3, affinity: Affinity::After };
    let before = state(
        template.context(),
        roots,
        Selection::Range(RangeSelection::new(point.clone(), point)),
        None,
    )?;
    let mut session = EditorSession::new(before.clone());
    let registry = registry()?;
    let clear = ActionInvocation::without_input(clear_nested_list_inline_formats_action_id());
    session.execute_prepared_action(registry.prepare(session.state(), &clear)?)?;
    assert_eq!(session.state().document(), before.document());
    assert_eq!(session.state().selection(), before.selection());
    assert_eq!(session.state().pending_formats(), Some(&FormatSet::default()));
    assert_eq!(session.undo_depth(), 0);

    // The later block at offset zero is outside the formatted text range.
    let template = fixture(false, 2)?;
    let roots = template.document().root().as_element().ok_or("root")?.children().to_vec();
    let first = Point::Text {
        text_path: NodePath::try_from_indices(vec![0, 0, 1, 0, 0, 0])?,
        utf16_offset: 1,
        affinity: Affinity::After,
    };
    let last = Point::Text {
        text_path: NodePath::try_from_indices(vec![0, 1, 0, 0])?,
        utf16_offset: 0,
        affinity: Affinity::Before,
    };
    let before =
        state(template.context(), roots, Selection::Range(RangeSelection::new(first, last)), None)?;
    let mut session = EditorSession::new(before.clone());
    session.execute_prepared_action(registry.prepare(session.state(), &clear)?)?;
    assert_eq!(fragment(session.state(), &[0, 1, 0])?, fragment(&before, &[0, 1, 0])?);
    assert_eq!(
        crate::action::text_position::normalize_nested_list_range_selection(session.state())?,
        crate::action::text_position::normalize_nested_list_range_selection(&before)?
    );
    Ok(())
}
