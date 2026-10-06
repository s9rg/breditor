//! Cross-block typing/Enter/deletion against independent text and exact-tree oracles.
use super::*;
use crate::{
    action::{ActionInput, ActionInvocation, ActionRegistration, ActionRegistry, ActionValue},
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
fn text(value: &str) -> Result<NodeRef, Box<dyn Error>> {
    block(TextBlockKind::Paragraph, value, formats()?)
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
    let props = if let Some(start) = start {
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
        props,
        items,
    )?))
}
fn roots() -> Result<Vec<NodeRef>, Box<dyn Error>> {
    Ok(vec![
        text("op")?,
        list(
            vec![
                item(vec![
                    block(heading(2)?, "ab", formats()?)?,
                    list(vec![item(vec![text("cd")?])?, item(vec![text("ef")?])?], Some(20))?,
                ])?,
                item(vec![text("gh")?, list(vec![item(vec![text("ij")?])?], None)?])?,
                item(vec![text("kl")?])?,
            ],
            Some(7),
        )?,
        text("mn")?,
    ])
}
fn paths() -> Vec<Vec<u32>> {
    vec![
        vec![0],
        vec![1, 0, 0],
        vec![1, 0, 1, 0, 0],
        vec![1, 0, 1, 1, 0],
        vec![1, 1, 0],
        vec![1, 1, 1, 0, 0],
        vec![1, 2, 0],
        vec![2],
    ]
}
fn context() -> Result<EditorContext, Box<dyn Error>> {
    Ok(EditorContext::new(
        CompiledSchema::try_compile_nested_list_profile(
            SchemaId::new(name("test/nested-range")?, SchemaVersion::one()),
            &extensions()?,
        )?,
        DocumentLimits::default(),
    )
    .with_max_operations_per_transaction(1))
}
fn selected(
    context: &EditorContext,
    first: usize,
    start: u32,
    last: usize,
    end: u32,
    reverse: bool,
) -> Result<EditorState, Box<dyn Error>> {
    let paths = paths();
    let a = Point::Text {
        text_path: NodePath::try_from_indices(paths[first].clone())?.try_child(0)?,
        utf16_offset: start,
        affinity: Affinity::After,
    };
    let b = Point::Text {
        text_path: NodePath::try_from_indices(paths[last].clone())?.try_child(0)?,
        utf16_offset: end,
        affinity: Affinity::Before,
    };
    state(
        context,
        roots()?,
        Selection::Range(if reverse {
            RangeSelection::new(b, a)
        } else {
            RangeSelection::new(a, b)
        }),
        None,
    )
}
fn registry() -> Result<ActionRegistry, Box<dyn Error>> {
    Ok(ActionRegistry::try_new(vec![
        ActionRegistration::with_input(
            insert_nested_list_text_action_id(),
            insert_text_input_contract(),
            InsertNestedListTextAction,
        ),
        ActionRegistration::new(insert_nested_list_break_action_id(), InsertNestedListBreakAction),
        ActionRegistration::new(
            delete_nested_list_selection_action_id(),
            DeleteNestedListSelectionAction,
        ),
    ])?)
}
fn invoke(mode: usize) -> Result<ActionInvocation, Box<dyn Error>> {
    Ok(match mode {
        0 => ActionInvocation::new(
            insert_nested_list_text_action_id(),
            ActionInput::typed(insert_text_input_contract(), ActionValue::try_from_string("X")?),
        ),
        1 => ActionInvocation::without_input(delete_nested_list_selection_action_id()),
        _ => ActionInvocation::without_input(insert_nested_list_break_action_id()),
    })
}
fn blocks(node: &NodeRef, result: &mut Vec<String>) -> TestResult {
    let element = node.as_element().ok_or("element")?;
    if matches!(element.kind().as_str(), "breditor/paragraph" | "breditor/heading") {
        result.push(
            element
                .children()
                .iter()
                .map(|node| node.as_text().map(|text| text.text()).ok_or("text"))
                .collect::<Result<String, _>>()?,
        );
    } else {
        for child in element.children().iter() {
            blocks(child, result)?;
        }
    }
    Ok(())
}
fn history(session: &EditorSession, before: &EditorState) -> TestResult {
    if session.state().document() == before.document() {
        assert_eq!(session.undo_depth(), 0);
        return Ok(());
    }
    assert_eq!(session.undo_depth(), 1);
    let codec = SessionCheckpointJsonCodecV7::new(before.context().clone());
    let mut restored = codec.decode(&codec.encode(session)?)?;
    restored.undo()?.ok_or("undo")?;
    assert_eq!(restored.state().document(), before.document());
    assert_eq!(restored.state().selection(), before.selection());
    restored.redo()?.ok_or("redo")?;
    assert_eq!(restored.state().document(), session.state().document());
    assert_eq!(restored.state().selection(), session.state().selection());
    Ok(())
}
#[test]
fn nested_range_all_endpoint_pairs_keep_text_order_and_recover() -> TestResult {
    let context = context()?;
    let registry = registry()?;
    let source = ["op", "ab", "cd", "ef", "gh", "ij", "kl", "mn"];
    for first in 0..source.len() {
        for last in first..source.len() {
            for (start, end) in [(0, 0), (1, 1), (2, 0), (0, 2)] {
                if first == last && start >= end {
                    continue;
                }
                for reverse in [false, true] {
                    for mode in 0..3 {
                        let before = selected(&context, first, start, last, end, reverse)?;
                        let mut session = EditorSession::new(before.clone());
                        session
                            .execute_prepared_action(registry.prepare(&before, &invoke(mode)?)?)?;
                        let prefix = &source[first][..usize::try_from(start)?];
                        let suffix = &source[last][usize::try_from(end)?..];
                        let mut expected = source[..first]
                            .iter()
                            .map(|text| (*text).to_owned())
                            .collect::<Vec<_>>();
                        if mode == 2 {
                            expected.extend([prefix.to_owned(), suffix.to_owned()]);
                        } else {
                            expected.push(format!(
                                "{prefix}{}{suffix}",
                                if mode == 0 { "X" } else { "" }
                            ));
                        }
                        expected.extend(source[last + 1..].iter().map(|text| (*text).to_owned()));
                        let mut actual = Vec::new();
                        blocks(session.state().document().root(), &mut actual)?;
                        assert_eq!(
                            actual, expected,
                            "endpoints {first}:{start}..{last}:{end}, mode {mode}"
                        );
                        let normalized =
                            crate::action::text_position::normalize_nested_list_range_selection(
                                session.state(),
                            )?;
                        assert!(normalized.is_collapsed());
                        assert_eq!(
                            normalized.start().offset().get(),
                            if mode == 2 { 0 } else { u64::from(start) + u64::from(mode == 0) }
                        );
                        history(&session, &before)?;
                    }
                }
            }
        }
    }
    Ok(())
}
#[test]
fn nested_range_exact_orphan_sections_and_numbering_policy() -> TestResult {
    let context = context()?;
    let registry = registry()?;
    let retained = list(vec![item(vec![text("ij")?])?], None)?;
    for (first, expected) in [
        (
            1,
            vec![
                text("op")?,
                list(
                    vec![
                        item(vec![block(heading(2)?, "aXh", formats()?)?, retained.clone()])?,
                        item(vec![text("kl")?])?,
                    ],
                    Some(7),
                )?,
                text("mn")?,
            ],
        ),
        (
            0,
            vec![
                text("oXh")?,
                retained.clone(),
                list(vec![item(vec![text("kl")?])?], Some(9))?,
                text("mn")?,
            ],
        ),
        (
            2,
            vec![
                text("op")?,
                list(
                    vec![
                        item(vec![
                            block(heading(2)?, "ab", formats()?)?,
                            list(vec![item(vec![text("cXh")?])?], Some(20))?,
                            retained,
                        ])?,
                        item(vec![text("kl")?])?,
                    ],
                    Some(7),
                )?,
                text("mn")?,
            ],
        ),
    ] {
        let before = selected(&context, first, 1, 4, 1, true)?;
        let mut session = EditorSession::new(before.clone());
        session.execute_prepared_action(registry.prepare(&before, &invoke(0)?)?)?;
        assert_eq!(session.state().document(), state(&context, expected, None, None)?.document());
        history(&session, &before)?;
    }
    Ok(())
}

#[test]
fn nested_range_inherits_first_selected_text_not_empty_endpoint() -> TestResult {
    use crate::document::FormatSet;
    // A merged undo recipe contains both operations and respects the same cap.
    let context = context()?.with_max_operations_per_transaction(2);
    let first = block(TextBlockKind::Paragraph, "a", FormatSet::default())?;
    let last = block(TextBlockKind::Paragraph, "b", FormatSet::default())?;
    let middle = block(heading(3)?, "🙂", formats()?)?;
    let a = Point::Text {
        text_path: NodePath::try_from_indices(vec![0, 0])?,
        utf16_offset: 1,
        affinity: Affinity::After,
    };
    let b = Point::Text {
        text_path: NodePath::try_from_indices(vec![2, 0])?,
        utf16_offset: 0,
        affinity: Affinity::Before,
    };
    let before = state(
        &context,
        vec![first.clone(), list(vec![item(vec![middle])?], Some(19))?, last.clone()],
        Selection::Range(RangeSelection::new(b, a)),
        None,
    )?;
    let mut session = EditorSession::new(before.clone());
    session.execute_prepared_action(registry()?.prepare(&before, &invoke(0)?)?)?;
    let inserted = text("X")?;
    let children = [&first, &inserted, &last]
        .into_iter()
        .flat_map(|node| {
            node.as_element().into_iter().flat_map(|element| element.children().iter().cloned())
        })
        .collect();
    let expected =
        NodeRef::element(first.as_element().ok_or("first")?.try_with_children(children)?);
    assert_eq!(session.state().document(), state(&context, vec![expected], None, None)?.document());
    let caret = Point::Text {
        text_path: NodePath::try_from_indices(vec![0, 2])?,
        utf16_offset: 0,
        affinity: Affinity::Before,
    };
    assert_eq!(
        session.state().selection(),
        Some(&Selection::Range(RangeSelection::new(caret.clone(), caret)))
    );
    // Canonical seam points use the right run's start; Before affinity must
    // nevertheless inherit the formatted insertion immediately to its left.
    let request = ActionInvocation::new(
        insert_nested_list_text_action_id(),
        ActionInput::typed(insert_text_input_contract(), ActionValue::try_from_string("Y")?),
    );
    session.execute_prepared_action(registry()?.prepare(session.state(), &request)?)?;
    let inserted = text("XY")?;
    let children = [&first, &inserted, &last]
        .into_iter()
        .flat_map(|node| {
            node.as_element().into_iter().flat_map(|element| element.children().iter().cloned())
        })
        .collect();
    let expected =
        NodeRef::element(first.as_element().ok_or("first")?.try_with_children(children)?);
    assert_eq!(session.state().document(), state(&context, vec![expected], None, None)?.document());
    history(&session, &before)
}
