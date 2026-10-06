//! Public nested Enter behavior, exact selection and durable history.
use super::*;
use crate::{
    action::{Action, ActionDecision, ActionInvocation, ActionRegistration, ActionRegistry},
    block::TextBlockKind,
    codec::{
        SessionCheckpointJsonCodecV7,
        structural_codec_test_support::{
            TestResult, block, extensions, formats, heading, name, state,
        },
    },
    document::{ElementNode, NodeRef, PropertyInteger, PropertyMap, PropertyValue},
    position::{Affinity, NodePath, Point},
    schema::{CompiledSchema, DocumentLimits, SchemaId, SchemaVersion},
    selection::{RangeSelection, Selection},
    session::EditorSession,
    state::{EditorContext, EditorState},
};
use std::error::Error;
fn context(limits: DocumentLimits) -> Result<EditorContext, Box<dyn Error>> {
    Ok(EditorContext::new(
        CompiledSchema::try_compile_nested_list_profile(
            SchemaId::new(name("test/nested-enter")?, SchemaVersion::one()),
            &extensions()?,
        )?,
        limits,
    ))
}
fn text(value: &str, kind: TextBlockKind) -> Result<NodeRef, Box<dyn Error>> {
    block(kind, value, formats()?)
}
fn item(children: Vec<NodeRef>) -> Result<NodeRef, Box<dyn Error>> {
    Ok(NodeRef::element(ElementNode::try_new(
        name("breditor/list-item")?,
        None,
        PropertyMap::default(),
        children,
    )?))
}
fn list(items: Vec<NodeRef>, start: Option<u32>) -> Result<NodeRef, Box<dyn Error>> {
    let properties = if let Some(start) = start {
        PropertyMap::try_from_sorted(vec![(
            name("breditor/start")?,
            PropertyValue::from_integer(PropertyInteger::try_new(i64::from(start))?),
        )])?
    } else {
        PropertyMap::default()
    };
    Ok(NodeRef::element(ElementNode::try_new(
        name(if start.is_some() { "breditor/ordered-list" } else { "breditor/bullet-list" })?,
        None,
        properties,
        items,
    )?))
}
fn wrap(mut root: NodeRef, depth: usize) -> Result<NodeRef, Box<dyn Error>> {
    for _ in 0..depth {
        root = list(vec![item(vec![text("parent", TextBlockKind::Paragraph)?, root])?], None)?;
    }
    Ok(root)
}
fn path(depth: usize, index: u32) -> Result<NodePath, Box<dyn Error>> {
    let mut path = vec![0];
    for _ in 0..depth {
        path.extend([0, 1]);
    }
    path.extend([index, 0]);
    Ok(NodePath::try_from_indices(path)?)
}
fn registry() -> Result<ActionRegistry, Box<dyn Error>> {
    Ok(ActionRegistry::try_new(vec![ActionRegistration::new(
        insert_nested_list_break_action_id(),
        InsertNestedListBreakAction,
    )])?)
}
fn run(before: &EditorState) -> Result<EditorSession, Box<dyn Error>> {
    let mut session = EditorSession::new(before.clone());
    session.execute_prepared_action(registry()?.prepare(
        before,
        &ActionInvocation::without_input(insert_nested_list_break_action_id()),
    )?)?;
    Ok(session)
}
fn history(session: &EditorSession, before: &EditorState) -> TestResult {
    assert_eq!(session.undo_depth(), 1);
    let codec = SessionCheckpointJsonCodecV7::new(before.context().clone());
    let mut restored = codec.decode(&codec.encode(session)?)?;
    restored.undo()?.ok_or("undo")?;
    assert_eq!(restored.state().document(), before.document());
    assert_eq!(restored.state().selection(), before.selection());
    assert_eq!(restored.state().pending_formats(), before.pending_formats());
    restored.redo()?.ok_or("redo")?;
    assert_eq!(restored.state().document(), session.state().document());
    assert_eq!(restored.state().selection(), session.state().selection());
    assert_eq!(restored.state().pending_formats(), session.state().pending_formats());
    Ok(())
}
#[test]
fn nested_enter_splits_at_every_scalar_boundary_and_retains_descendants() -> TestResult {
    let context = context(DocumentLimits::default())?;
    let descendant = list(vec![item(vec![text("child", TextBlockKind::Paragraph)?])?], Some(23))?;
    for depth in [0, 1, 3] {
        for start in [None, Some(7)] {
            for kind in [TextBlockKind::Paragraph, heading(2)?] {
                for (left, right, prefix, suffix) in [
                    (0, 0, "", "a🙂b"),
                    (1, 1, "a", "🙂b"),
                    (3, 3, "a🙂", "b"),
                    (4, 4, "a🙂b", ""),
                    (1, 3, "a", "b"),
                ] {
                    for reverse in [false, true] {
                        let source = wrap(
                            list(
                                vec![
                                    item(vec![text("a🙂b", kind)?, descendant.clone()])?,
                                    item(vec![text("tail", TextBlockKind::Paragraph)?])?,
                                ],
                                start,
                            )?,
                            depth,
                        )?;
                        let block_path = path(depth, 0)?;
                        let a = Point::Text {
                            text_path: block_path.try_child(0)?,
                            utf16_offset: left,
                            affinity: Affinity::After,
                        };
                        let b = Point::Text {
                            text_path: block_path.try_child(0)?,
                            utf16_offset: right,
                            affinity: Affinity::After,
                        };
                        let selection = if reverse {
                            RangeSelection::new(b, a)
                        } else {
                            RangeSelection::new(a, b)
                        };
                        let before = state(
                            &context,
                            vec![source],
                            Selection::Range(selection),
                            if left == right { Some(formats()?) } else { None },
                        )?;
                        let expected = wrap(
                            list(
                                vec![
                                    item(vec![text(prefix, kind)?])?,
                                    item(vec![
                                        text(
                                            suffix,
                                            if right == 4 {
                                                TextBlockKind::Paragraph
                                            } else {
                                                kind
                                            },
                                        )?,
                                        descendant.clone(),
                                    ])?,
                                    item(vec![text("tail", TextBlockKind::Paragraph)?])?,
                                ],
                                start,
                            )?,
                            depth,
                        )?;
                        let session = run(&before)?;
                        assert_eq!(
                            session.state().document(),
                            state(&context, vec![expected], None, None)?.document()
                        );
                        let caret = Point::Children {
                            parent_path: path(depth, 1)?,
                            child_index: 0,
                            affinity: Affinity::After,
                        };
                        assert_eq!(
                            session.state().selection(),
                            Some(&Selection::Range(RangeSelection::new(caret.clone(), caret)))
                        );
                        assert_eq!(session.state().pending_formats(), before.pending_formats());
                        history(&session, &before)?;
                    }
                }
            }
        }
    }
    Ok(())
}
#[test]
fn nested_enter_empty_root_item_promotes_children_and_preserves_numbering() -> TestResult {
    let context = context(DocumentLimits::default())?;
    let child = list(vec![item(vec![text("child", TextBlockKind::Paragraph)?])?], Some(23))?;
    let before_roots = vec![list(
        vec![
            item(vec![text("prefix", TextBlockKind::Paragraph)?])?,
            item(vec![text("", heading(3)?)?, child.clone()])?,
            item(vec![text("tail", TextBlockKind::Paragraph)?])?,
        ],
        Some(7),
    )?];
    let point = Point::Children {
        parent_path: NodePath::try_from_indices(vec![0, 1, 0])?,
        child_index: 0,
        affinity: Affinity::After,
    };
    let before = state(
        &context,
        before_roots,
        Selection::Range(RangeSelection::new(point.clone(), point)),
        Some(formats()?),
    )?;
    let expected = vec![
        list(vec![item(vec![text("prefix", TextBlockKind::Paragraph)?])?], Some(7))?,
        text("", TextBlockKind::Paragraph)?,
        child,
        list(vec![item(vec![text("tail", TextBlockKind::Paragraph)?])?], Some(9))?,
    ];
    let session = run(&before)?;
    assert_eq!(session.state().document(), state(&context, expected, None, None)?.document());
    let caret = Point::Children {
        parent_path: NodePath::try_from_indices(vec![1])?,
        child_index: 0,
        affinity: Affinity::After,
    };
    assert_eq!(
        session.state().selection(),
        Some(&Selection::Range(RangeSelection::new(caret.clone(), caret)))
    );
    history(&session, &before)
}
#[test]
fn nested_enter_empty_nested_item_matches_one_level_outdent() -> TestResult {
    let context = context(DocumentLimits::default())?;
    let root = wrap(
        list(
            vec![
                item(vec![text("", TextBlockKind::Paragraph)?])?,
                item(vec![text("tail", TextBlockKind::Paragraph)?])?,
            ],
            Some(7),
        )?,
        1,
    )?;
    let caret =
        Point::Children { parent_path: path(1, 0)?, child_index: 0, affinity: Affinity::After };
    let before = state(
        &context,
        vec![root],
        Selection::Range(RangeSelection::new(caret.clone(), caret)),
        Some(formats()?),
    )?;
    assert_eq!(
        InsertNestedListBreakAction.evaluate(&before, &())?.decision(),
        OutdentListItemsAction.evaluate(&before, &())?.decision()
    );
    history(&run(&before)?, &before)
}
#[test]
fn nested_enter_handles_cross_block_selection_and_rejects_zero_budget() -> TestResult {
    let context = context(DocumentLimits::default())?.with_max_operations_per_transaction(0);
    let a = Point::Text {
        text_path: NodePath::try_from_indices(vec![0, 0])?,
        utf16_offset: 0,
        affinity: Affinity::After,
    };
    let before = state(
        &context,
        vec![text("abc", TextBlockKind::Paragraph)?],
        Selection::Range(RangeSelection::new(a.clone(), a)),
        None,
    )?;
    assert!(
        matches!(InsertNestedListBreakAction.evaluate(&before,&())?.decision(),ActionDecision::Disabled(reason) if reason.code().as_str()=="breditor/operation-budget-exceeded")
    );
    let enabled_context = context.clone().with_max_operations_per_transaction(1);
    let first = Point::Text {
        text_path: NodePath::try_from_indices(vec![0, 0])?,
        utf16_offset: 1,
        affinity: Affinity::After,
    };
    let last = Point::Text {
        text_path: NodePath::try_from_indices(vec![1, 0])?,
        utf16_offset: 1,
        affinity: Affinity::After,
    };
    let cross = state(
        &enabled_context,
        vec![text("abc", TextBlockKind::Paragraph)?, text("xyz", TextBlockKind::Paragraph)?],
        Selection::Range(RangeSelection::new(first, last)),
        None,
    )?;
    let session = run(&cross)?;
    assert_eq!(
        session.state().document(),
        state(
            &enabled_context,
            vec![text("a", TextBlockKind::Paragraph)?, text("yz", TextBlockKind::Paragraph)?],
            None,
            None
        )?
        .document()
    );
    history(&session, &cross)?;
    Ok(())
}

#[test]
fn nested_enter_bare_heading_exit_and_result_limit() -> TestResult {
    let context = context(DocumentLimits::default())?;
    let caret = Point::Children {
        parent_path: NodePath::try_from_indices(vec![0])?,
        child_index: 0,
        affinity: Affinity::After,
    };
    let before = state(
        &context,
        vec![text("", heading(4)?)?],
        Selection::Range(RangeSelection::new(caret.clone(), caret)),
        Some(formats()?),
    )?;
    let session = run(&before)?;
    assert_eq!(
        session.state().document(),
        state(&context, vec![text("", TextBlockKind::Paragraph)?], None, None)?.document()
    );
    history(&session, &before)?;
    let limited =
        EditorContext::new(context.schema().clone(), DocumentLimits::default().with_max_nodes(3));
    let caret = Point::Text {
        text_path: NodePath::try_from_indices(vec![0, 0])?,
        utf16_offset: 1,
        affinity: Affinity::After,
    };
    let before = state(
        &limited,
        vec![text("abc", TextBlockKind::Paragraph)?],
        Selection::Range(RangeSelection::new(caret.clone(), caret)),
        None,
    )?;
    assert!(
        matches!(InsertNestedListBreakAction.evaluate(&before,&())?.decision(),ActionDecision::Disabled(reason) if reason.code().as_str()=="breditor/result-limit-exceeded")
    );
    Ok(())
}
