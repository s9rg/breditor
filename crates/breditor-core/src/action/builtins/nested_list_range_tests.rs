//! Cross-block typing/Enter/deletion against independent text and exact-tree oracles.
#[path = "set_nested_list_block_kind_tests.rs"]
mod block_kind_tests;
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
#[test]
fn nested_directional_deletion_removes_whole_graphemes_and_recovers() -> TestResult {
    let context = context()?;
    for cluster in ["🙂", "e\u{301}", "🇨🇦", "👨‍👩‍👧‍👦"] {
        for backward in [true, false] {
            let value = format!("a{cluster}b");
            let offset = if backward { 1 + cluster.encode_utf16().count() as u32 } else { 1 };
            let point = Point::Text {
                text_path: NodePath::try_from_indices(vec![0, 0, 1, 0, 0, 0])?,
                utf16_offset: offset,
                affinity: Affinity::After,
            };
            let before = state(
                &context,
                vec![list(
                    vec![item(vec![
                        text("parent")?,
                        list(vec![item(vec![text(&value)?])?], Some(9))?,
                    ])?],
                    None,
                )?],
                Selection::Range(RangeSelection::new(point.clone(), point)),
                None,
            )?;
            let request = ActionInvocation::without_input(if backward {
                delete_nested_list_backward_action_id()
            } else {
                delete_nested_list_forward_action_id()
            });
            let mut session = EditorSession::new(before.clone());
            session.execute_prepared_action(registry()?.prepare(&before, &request)?)?;
            let mut actual = Vec::new();
            blocks(session.state().document().root(), &mut actual)?;
            assert_eq!(actual, vec!["parent", "ab"]);
            history(&session, &before)?;
        }
    }
    Ok(())
}
#[test]
fn nested_directional_boundaries_keep_order_and_restore_exactly() -> TestResult {
    use crate::action::{Action, ActionDecision};
    let context = context()?;
    let registry = registry()?;
    let source = ["op", "ab", "cd", "ef", "gh", "ij", "kl", "mn"];
    for index in 0..source.len() {
        for backward in [true, false] {
            let offset = if backward { 0 } else { 2 };
            let before = selected(&context, index, offset, index, offset, false)?;
            let action = if backward {
                delete_nested_list_backward_action_id()
            } else {
                delete_nested_list_forward_action_id()
            };
            let decision = if backward {
                DeleteNestedListBackwardAction.evaluate(&before, &())?
            } else {
                DeleteNestedListForwardAction.evaluate(&before, &())?
            };
            if (backward && index == 0) || (!backward && index == 7) {
                assert!(matches!(decision.decision(), ActionDecision::Disabled(_)));
                continue;
            }
            // First items remove structure without deleting any text.
            let lift = backward && matches!(index, 1 | 2 | 5);
            if backward && matches!(index, 2 | 5) {
                assert_eq!(
                    decision.decision(),
                    OutdentListItemsAction.evaluate(&before, &())?.decision()
                );
            }
            let mut expected = source.iter().map(|value| (*value).to_owned()).collect::<Vec<_>>();
            if !lift {
                let left = if backward { index - 1 } else { index };
                expected[left] = format!("{}{}", source[left], source[left + 1]);
                expected.remove(left + 1);
            }
            let mut session = EditorSession::new(before.clone());
            session.execute_prepared_action(
                registry.prepare(&before, &ActionInvocation::without_input(action))?,
            )?;
            let mut actual = Vec::new();
            blocks(session.state().document().root(), &mut actual)?;
            assert_eq!(actual, expected, "index={index}, backward={backward}");
            history(&session, &before)?;
        }
    }
    Ok(())
}

#[test]
fn nested_boundary_exact_root_lift_and_child_join() -> TestResult {
    let context = context()?;
    for backward in [true, false] {
        let offset = if backward { 0 } else { 2 };
        let before = selected(&context, 1, offset, 1, offset, false)?;
        let expected = if backward {
            vec![
                text("op")?,
                block(heading(2)?, "ab", formats()?)?,
                list(vec![item(vec![text("cd")?])?, item(vec![text("ef")?])?], Some(20))?,
                list(
                    vec![
                        item(vec![text("gh")?, list(vec![item(vec![text("ij")?])?], None)?])?,
                        item(vec![text("kl")?])?,
                    ],
                    Some(8),
                )?,
                text("mn")?,
            ]
        } else {
            vec![
                text("op")?,
                list(
                    vec![
                        item(vec![
                            block(heading(2)?, "abcd", formats()?)?,
                            list(vec![item(vec![text("ef")?])?], Some(21))?,
                        ])?,
                        item(vec![text("gh")?, list(vec![item(vec![text("ij")?])?], None)?])?,
                        item(vec![text("kl")?])?,
                    ],
                    Some(7),
                )?,
                text("mn")?,
            ]
        };
        let action = if backward {
            delete_nested_list_backward_action_id()
        } else {
            delete_nested_list_forward_action_id()
        };
        let mut session = EditorSession::new(before.clone());
        session.execute_prepared_action(
            registry()?.prepare(&before, &ActionInvocation::without_input(action))?,
        )?;
        assert_eq!(
            session
                .state()
                .document()
                .root()
                .as_element()
                .ok_or("root")?
                .children()
                .iter()
                .cloned()
                .collect::<Vec<_>>(),
            expected
        );
        history(&session, &before)?;
    }
    Ok(())
}
#[test]
fn nested_join_snaps_new_grapheme_by_direction() -> TestResult {
    let context = context()?;
    for backward in [true, false] {
        let path = if backward { vec![0, 1, 0, 0] } else { vec![0, 0, 0, 0] };
        let point = Point::Text {
            text_path: NodePath::try_from_indices(path)?,
            utf16_offset: u32::from(!backward),
            affinity: Affinity::After,
        };
        let before = state(
            &context,
            vec![list(vec![item(vec![text("e")?])?, item(vec![text("\u{301}b")?])?], Some(8))?],
            Selection::Range(RangeSelection::new(point.clone(), point)),
            None,
        )?;
        let mut session = EditorSession::new(before.clone());
        let action = if backward {
            delete_nested_list_backward_action_id()
        } else {
            delete_nested_list_forward_action_id()
        };
        session.execute_prepared_action(
            registry()?.prepare(&before, &ActionInvocation::without_input(action))?,
        )?;
        let range =
            crate::action::text_position::normalize_nested_list_range_selection(session.state())?;
        assert_eq!(range.start().offset().get(), if backward { 2 } else { 0 });
        let mut actual = Vec::new();
        blocks(session.state().document().root(), &mut actual)?;
        assert_eq!(actual, vec!["e\u{301}b"]);
        history(&session, &before)?;
    }
    Ok(())
}

#[test]
fn nested_deletion_rejects_interior_grapheme_carets_but_keeps_exact_ranges() -> TestResult {
    use crate::action::{Action, ActionDecision};
    let context = context()?;
    let point = |offset| -> Result<Point, Box<dyn Error>> {
        Ok(Point::Text {
            text_path: NodePath::try_from_indices(vec![0, 0, 0, 0])?,
            utf16_offset: offset,
            affinity: Affinity::After,
        })
    };
    let source = vec![list(vec![item(vec![text("e\u{301}")?])?], None)?];
    let before = state(
        &context,
        source.clone(),
        Selection::Range(RangeSelection::new(point(1)?, point(1)?)),
        None,
    )?;
    for decision in [
        DeleteNestedListBackwardAction.evaluate(&before, &())?,
        DeleteNestedListForwardAction.evaluate(&before, &())?,
    ] {
        assert!(matches!(decision.decision(), ActionDecision::Disabled(_)));
    }
    let before =
        state(&context, source, Selection::Range(RangeSelection::new(point(1)?, point(0)?)), None)?;
    for action in [delete_nested_list_backward_action_id(), delete_nested_list_forward_action_id()]
    {
        let mut session = EditorSession::new(before.clone());
        session.execute_prepared_action(
            registry()?.prepare(&before, &ActionInvocation::without_input(action))?,
        )?;
        let mut actual = Vec::new();
        blocks(session.state().document().root(), &mut actual)?;
        assert_eq!(actual, vec!["\u{301}"]);
        history(&session, &before)?;
    }
    Ok(())
}
#[test]
fn nested_multiline_paste_endpoint_matrix_and_recovery() -> TestResult {
    let context = context()?;
    let registry = registry()?;
    let source = ["op", "ab", "cd", "ef", "gh", "ij", "kl", "mn"];
    for first in 0..source.len() {
        for last in first..source.len() {
            for reverse in [false, true] {
                for input in ["X", "X\nY\n", "\r\nY\rZ", "\n"] {
                    let before = selected(&context, first, 1, last, 1, reverse)?;
                    let normalized = input.replace("\r\n", "\n").replace('\r', "\n");
                    let mut inserted =
                        normalized.split('\n').map(str::to_owned).collect::<Vec<_>>();
                    inserted[0].insert_str(0, &source[first][..1]);
                    inserted.last_mut().ok_or("last")?.push_str(&source[last][1..]);
                    let mut expected =
                        source[..first].iter().map(|v| (*v).to_owned()).collect::<Vec<_>>();
                    expected.extend(inserted);
                    expected.extend(source[last + 1..].iter().map(|v| (*v).to_owned()));
                    let request = ActionInvocation::new(
                        insert_nested_list_plain_text_action_id(),
                        ActionInput::typed(
                            insert_plain_text_input_contract(),
                            ActionValue::try_from_string(input)?,
                        ),
                    );
                    let mut session = EditorSession::new(before.clone());
                    session.execute_prepared_action(registry.prepare(&before, &request)?)?;
                    let mut actual = Vec::new();
                    blocks(session.state().document().root(), &mut actual)?;
                    assert_eq!(
                        actual, expected,
                        "first={first}, last={last}, reverse={reverse}, input={input:?}"
                    );
                    let range =
                        crate::action::text_position::normalize_nested_list_range_selection(
                            session.state(),
                        )?;
                    let tail =
                        normalized.split('\n').next_back().ok_or("tail")?.encode_utf16().count();
                    assert_eq!(
                        range.start().offset().get(),
                        (tail + usize::from(!normalized.contains('\n'))) as u64
                    );
                    assert!(range.is_collapsed());
                    history(&session, &before)?;
                }
            }
        }
    }
    Ok(())
}

#[test]
fn nested_multiline_paste_retains_descendants_under_last_inserted_item() -> TestResult {
    let context = context()?;
    let before = selected(&context, 1, 1, 1, 1, false)?;
    let request = ActionInvocation::new(
        insert_nested_list_plain_text_action_id(),
        ActionInput::typed(
            insert_plain_text_input_contract(),
            ActionValue::try_from_string("X\n\nY")?,
        ),
    );
    let mut session = EditorSession::new(before.clone());
    session.execute_prepared_action(registry()?.prepare(&before, &request)?)?;
    let expected = vec![
        text("op")?,
        list(
            vec![
                item(vec![block(heading(2)?, "aX", formats()?)?])?,
                item(vec![text("")?])?,
                item(vec![
                    block(heading(2)?, "Yb", formats()?)?,
                    list(vec![item(vec![text("cd")?])?, item(vec![text("ef")?])?], Some(20))?,
                ])?,
                item(vec![text("gh")?, list(vec![item(vec![text("ij")?])?], None)?])?,
                item(vec![text("kl")?])?,
            ],
            Some(7),
        )?,
        text("mn")?,
    ];
    assert_eq!(
        session
            .state()
            .document()
            .root()
            .as_element()
            .ok_or("root")?
            .children()
            .iter()
            .cloned()
            .collect::<Vec<_>>(),
        expected
    );
    history(&session, &before)?;
    Ok(())
}
#[test]
fn nested_paste_limit_failures_are_atomic() -> TestResult {
    use crate::action::{Action, ActionDecision};
    for (limits, ordinal, input) in [
        (DocumentLimits::default().with_max_nodes(8), None, "X\nY"),
        (DocumentLimits::default().with_max_text_bytes(2), None, "XX"),
        (DocumentLimits::default().with_max_children_per_element(2), None, "X\nY\nZ"),
        (DocumentLimits::default(), Some(2_147_483_647), "X\nY"),
    ] {
        let context = EditorContext::new(context()?.schema().clone(), limits);
        let point = Point::Text {
            text_path: NodePath::try_from_indices(vec![0, 0, 1, 0, 0, 0])?,
            utf16_offset: 1,
            affinity: Affinity::After,
        };
        let before = state(
            &context,
            vec![list(
                vec![item(vec![text("")?, list(vec![item(vec![text("ab")?])?], ordinal)?])?],
                None,
            )?],
            Selection::Range(RangeSelection::new(point.clone(), point)),
            None,
        )?;
        assert!(matches!(
            InsertNestedListPlainTextAction
                .evaluate(&before, &InsertPlainTextInput::try_new(input)?)?
                .decision(),
            ActionDecision::Disabled(_)
        ));
        let request = ActionInvocation::new(
            insert_nested_list_plain_text_action_id(),
            ActionInput::typed(
                insert_plain_text_input_contract(),
                ActionValue::try_from_string(input)?,
            ),
        );
        let mut session = EditorSession::new(before.clone());
        assert!(session.execute_prepared_action(registry()?.prepare(&before, &request)?).is_err());
        assert_eq!(session.state(), &before);
        assert_eq!(session.undo_depth(), 0);
    }
    let before = selected(&context()?, 2, 1, 2, 1, false)?;
    let empty = ActionInvocation::new(
        insert_nested_list_plain_text_action_id(),
        ActionInput::typed(insert_plain_text_input_contract(), ActionValue::try_from_string("")?),
    );
    assert!(registry()?.prepare(&before, &empty).is_err());
    Ok(())
}
#[test]
fn nested_paste_consumes_pending_formats_and_restores_them_on_undo() -> TestResult {
    use crate::document::{FormatSet, TextNode};
    let context = context()?;
    let plain = block(TextBlockKind::Paragraph, "ab", FormatSet::default())?;
    let point = Point::Text {
        text_path: NodePath::try_from_indices(vec![0, 0, 0, 0])?,
        utf16_offset: 1,
        affinity: Affinity::After,
    };
    let before = state(
        &context,
        vec![list(vec![item(vec![plain.clone()])?], None)?],
        Selection::Range(RangeSelection::new(point.clone(), point)),
        Some(formats()?),
    )?;
    let request = ActionInvocation::new(
        insert_nested_list_plain_text_action_id(),
        ActionInput::typed(
            insert_plain_text_input_contract(),
            ActionValue::try_from_string("X\nY")?,
        ),
    );
    let mut session = EditorSession::new(before.clone());
    session.execute_prepared_action(registry()?.prepare(&before, &request)?)?;
    let mixed = |runs: Vec<(&str, FormatSet)>| -> Result<NodeRef, Box<dyn Error>> {
        let children = runs
            .into_iter()
            .map(|(value, format)| TextNode::try_new(value.to_owned(), format).map(NodeRef::text))
            .collect::<Result<Vec<_>, _>>()?;
        Ok(NodeRef::element(plain.as_element().ok_or("plain")?.try_with_children(children)?))
    };
    let expected = vec![list(
        vec![
            item(vec![mixed(vec![("a", FormatSet::default()), ("X", formats()?)])?])?,
            item(vec![mixed(vec![("Y", formats()?), ("b", FormatSet::default())])?])?,
        ],
        None,
    )?];
    assert_eq!(
        session
            .state()
            .document()
            .root()
            .as_element()
            .ok_or("root")?
            .children()
            .iter()
            .cloned()
            .collect::<Vec<_>>(),
        expected
    );
    assert_eq!(session.state().pending_formats(), None);
    history(&session, &before)?;
    Ok(())
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
            insert_nested_list_plain_text_action_id(),
            insert_plain_text_input_contract(),
            InsertNestedListPlainTextAction,
        ),
        ActionRegistration::new(
            delete_nested_list_backward_action_id(),
            DeleteNestedListBackwardAction,
        ),
        ActionRegistration::new(
            delete_nested_list_forward_action_id(),
            DeleteNestedListForwardAction,
        ),
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
    assert_eq!(restored.state().pending_formats(), before.pending_formats());
    restored.redo()?.ok_or("redo")?;
    assert_eq!(restored.state().document(), session.state().document());
    assert_eq!(restored.state().selection(), session.state().selection());
    assert_eq!(restored.state().pending_formats(), session.state().pending_formats());
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
