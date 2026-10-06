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
        assert_eq!(target.iter().map(crate::document::TextRun::text).collect::<String>(), "a🙂b");
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
    let before = fixture(false, 0)?;
    let result = ClearNestedListInlineFormatsAction.evaluate(&before, &())?;
    assert!(
        matches!(result.decision(), ActionDecision::Disabled(reason) if reason.code().as_str() == "breditor/operation-budget-exceeded")
    );
    Ok(())
}

#[test]
fn nested_format_valid_final_result_at_node_limit_is_atomic() -> TestResult {
    use crate::document::{Format, PropertyValue};
    let linked = |value: &str| -> Result<FormatSet, Box<dyn Error>> {
        Ok(FormatSet::try_from_formats(vec![Format::new(
            name("example/link")?,
            PropertyMap::try_from_sorted(vec![(
                name("example/href")?,
                PropertyValue::from_string(value),
            )])?,
        )])?)
    };
    let mixed = |parts: &[(&str, &str)]| -> Result<NodeRef, Box<dyn Error>> {
        let mut children = Vec::new();
        for (text, href) in parts {
            children.extend(
                block(TextBlockKind::Paragraph, text, linked(href)?)?
                    .as_element()
                    .ok_or("block")?
                    .children()
                    .iter()
                    .cloned(),
            );
        }
        element("breditor/paragraph", children)
    };
    let roots = |a: NodeRef, b: NodeRef| -> Result<Vec<NodeRef>, Box<dyn Error>> {
        Ok(vec![element(
            "breditor/bullet-list",
            vec![element(
                "breditor/list-item",
                vec![
                    block(TextBlockKind::Paragraph, "parent", FormatSet::default())?,
                    element(
                        "breditor/bullet-list",
                        vec![
                            element("breditor/list-item", vec![a])?,
                            element("breditor/list-item", vec![b])?,
                        ],
                    )?,
                ],
            )?],
        )?])
    };
    let source =
        roots(mixed(&[("abc", "old")])?, mixed(&[("a", "old"), ("b", "new"), ("c", "old")])?)?;
    let result =
        roots(mixed(&[("a", "old"), ("bc", "new")])?, mixed(&[("ab", "new"), ("c", "old")])?)?;
    let first = Point::Text {
        text_path: NodePath::try_from_indices(vec![0, 0, 1, 0, 0, 0])?,
        utf16_offset: 1,
        affinity: Affinity::After,
    };
    let last = Point::Text {
        text_path: NodePath::try_from_indices(vec![0, 0, 1, 1, 0, 1])?,
        utf16_offset: 1,
        affinity: Affinity::Before,
    };
    let selection = Selection::Range(RangeSelection::new(first, last));
    let base = fixture(false, 10)?;
    let measured = state(base.context(), source.clone(), selection.clone(), None)?;
    let context = EditorContext::new(
        base.context().schema().clone(),
        DocumentLimits::default()
            .with_max_nodes(usize::try_from(measured.document().summary().node_count())?),
    )
    .with_max_operations_per_transaction(1);
    let before = state(&context, source, selection, None)?;
    // Independently prove the complete desired document fits the exact source limit.
    let expected = state(&context, result, None, None)?;
    let registry = registry()?;
    let request = ActionInvocation::new(
        ActionId::try_new("test/link")?,
        ActionInput::typed(
            set_inline_format_input_contract(),
            ActionValue::try_object(vec![
                ("operation".into(), ActionValue::try_from_string("set")?),
                (
                    "properties".into(),
                    ActionValue::try_array(vec![ActionValue::try_object(vec![
                        ("name".into(), ActionValue::try_from_string("example/href")?),
                        ("value".into(), ActionValue::try_from_string("new")?),
                    ])?])?,
                ),
            ])?,
        ),
    );
    let mut session = EditorSession::new(before.clone());
    session.execute_prepared_action(registry.prepare(session.state(), &request)?)?;
    assert_eq!(session.state().document(), expected.document());
    assert_eq!(session.undo_depth(), 1);
    let codec = SessionCheckpointJsonCodecV7::new(context);
    let mut restored = codec.decode(&codec.encode(&session)?)?;
    restored.undo()?.ok_or("undo")?;
    assert_eq!(restored.state().document(), before.document());
    assert_eq!(restored.state().selection(), before.selection());
    restored.redo()?.ok_or("redo")?;
    assert_eq!(restored.state().document(), expected.document());
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

#[test]
fn nested_format_rewrite_guards_codecs_and_all_target_scalar_points() -> TestResult {
    use crate::{
        codec::{OperationJsonCodecV6, OperationJsonCodecV7},
        operation::{
            NestedListFormatRewrite, NestedListFormatRewriteError, Operation, PointRelocation,
        },
    };
    let before = fixture(false, 1)?;
    let mut session = EditorSession::new(before.clone());
    session.execute_prepared_action(registry()?.prepare(
        &before,
        &ActionInvocation::without_input(clear_nested_list_inline_formats_action_id()),
    )?)?;
    let roots = |state: &EditorState| -> Result<Vec<NodeRef>, Box<dyn Error>> {
        Ok(state.document().root().as_element().ok_or("root")?.children().to_vec())
    };
    let op = NestedListFormatRewrite::capture(
        before.context(),
        before.document(),
        0,
        1,
        roots(session.state())?,
    )?;
    let edit = op.apply(before.context(), before.document())?.ok_or("edit")?;
    assert!(matches!(
        op.apply(before.context(), edit.document()),
        Err(NestedListFormatRewriteError::ExpectedMismatch)
    ));
    let restored = edit.inverse().apply(before.context(), edit.document())?.ok_or("inverse")?;
    assert_eq!(restored.document(), before.document());
    for affinity in [Affinity::Before, Affinity::After] {
        for offset in [0, 1, 3, 4] {
            let original = Point::Text {
                text_path: NodePath::try_from_indices(vec![0, 0, 1, 0, 0, 0])?,
                utf16_offset: offset,
                affinity,
            };
            let PointRelocation::Exact(mapped) = edit.relocate(&original)? else {
                return Err("deleted formatting point".into());
            };
            assert_eq!(mapped.affinity(), affinity);
            let PointRelocation::Exact(roundtrip) = restored.relocate(&mapped)? else {
                return Err("deleted inverse point".into());
            };
            assert_eq!(roundtrip, original);
        }
    }
    // Structural gaps survive unchanged; only text-run coordinates need remapping.
    for path in [vec![], vec![0], vec![0, 0], vec![0, 0, 1]] {
        let point = Point::Children {
            parent_path: NodePath::try_from_indices(path)?,
            child_index: 0,
            affinity: Affinity::After,
        };
        assert_eq!(edit.relocate(&point)?, PointRelocation::Exact(point));
    }
    let wire = Operation::NestedListFormatRewrite(op);
    let codec = OperationJsonCodecV7::new(before.context().clone());
    let encoded = codec.encode(&wire)?;
    assert_eq!(codec.decode(&encoded)?, wire);
    assert!(OperationJsonCodecV6::new(before.context().clone()).encode(&wire).is_err());
    assert!(
        codec
            .decode(&encoded.replace("nestedListFormatRewrite", "nestedListFormatUnknown"))
            .is_err()
    );
    assert!(codec.decode(&encoded.replace("\"start\":0", "\"start\":0,\"start\":0")).is_err());
    let original = roots(&before)?;
    assert!(matches!(
        NestedListFormatRewrite::try_new(
            0,
            vec![block(TextBlockKind::Paragraph, "original", formats()?)?],
            vec![block(TextBlockKind::Paragraph, "modified", formats()?)?]
        ),
        Err(NestedListFormatRewriteError::ContentChanged)
    ));
    let replacement = vec![block(TextBlockKind::Paragraph, "different", FormatSet::default())?];
    assert!(matches!(
        NestedListFormatRewrite::try_new(0, original.clone(), replacement),
        Err(NestedListFormatRewriteError::ContentChanged)
    ));
    // Same text but a container removed is also forbidden.
    let changed = original[0].as_element().ok_or("list")?.children().get(0).ok_or("item")?.clone();
    assert!(NestedListFormatRewrite::try_new(0, original, vec![changed]).is_err());
    Ok(())
}
