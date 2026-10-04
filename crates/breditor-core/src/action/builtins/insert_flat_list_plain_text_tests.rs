//! Plain-text paste laws for mixed flat-list documents and exact session history.
use super::*;
use crate::{
    action::{Action, ActionDecision, ActionId, ActionInput, ActionInvocation, ActionValue},
    block::TextBlockKind,
    codec::structural_codec_test_support::{
        TestResult, block, extensions, formats, heading, name, state,
    },
    document::{
        ElementNode, FormatSet, NodeRef, PropertyInteger, PropertyMap, PropertyValue, TextNode,
    },
    position::{Affinity, NodePath, Point},
    schema::{CompiledSchema, DocumentLimits, SchemaId, SchemaVersion},
    selection::{RangeSelection, Selection},
    session::EditorSession,
    state::{EditorContext, EditorState},
    transaction::{SelectionUpdate, Transaction},
};
use proptest::prelude::*;
use std::error::Error;

fn context(limits: DocumentLimits) -> Result<EditorContext, Box<dyn Error>> {
    Ok(EditorContext::new(
        CompiledSchema::try_compile_flat_list_profile(
            SchemaId::new(name("example/list-paste")?, SchemaVersion::one()),
            &extensions()?,
        )?,
        limits,
    ))
}
fn list(blocks: Vec<NodeRef>, start: Option<u32>) -> Result<NodeRef, Box<dyn Error>> {
    let items = blocks
        .into_iter()
        .map(|block| {
            Ok(NodeRef::element(ElementNode::try_new(
                name("breditor/list-item")?,
                None,
                PropertyMap::default(),
                vec![block],
            )?))
        })
        .collect::<Result<Vec<_>, Box<dyn Error>>>()?;
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
fn p(text: &str) -> Result<NodeRef, Box<dyn Error>> {
    block(TextBlockKind::Paragraph, text, formats()?)
}
fn mixed(kind: TextBlockKind, runs: &[(&str, FormatSet)]) -> Result<NodeRef, Box<dyn Error>> {
    let template = block(kind, "", FormatSet::default())?;
    let children = runs
        .iter()
        .filter(|(text, _)| !text.is_empty())
        .map(|(text, format)| {
            TextNode::try_new((*text).to_owned(), format.clone()).map(NodeRef::text)
        })
        .collect::<Result<Vec<_>, _>>()?;
    Ok(NodeRef::element(template.as_element().ok_or("block")?.try_with_children(children)?))
}
fn point(path: &[u32], offset: u32) -> Result<Point, Box<dyn Error>> {
    Ok(Point::Text {
        text_path: NodePath::try_from_indices(path.to_vec())?,
        utf16_offset: offset,
        affinity: Affinity::Before,
    })
}
fn gap(path: &[u32]) -> Result<Point, Box<dyn Error>> {
    Ok(Point::Children {
        parent_path: NodePath::try_from_indices(path.to_vec())?,
        child_index: 0,
        affinity: Affinity::Before,
    })
}
fn caret(point: Point) -> Selection {
    RangeSelection::new(point.clone(), point).into()
}
fn select(start: Point, end: Point, reverse: bool) -> Selection {
    if reverse {
        RangeSelection::new(end, start).into()
    } else {
        RangeSelection::new(start, end).into()
    }
}
fn registry() -> Result<ActionRegistry, Box<dyn Error>> {
    Ok(ActionRegistry::try_new(vec![ActionRegistration::with_input(
        insert_flat_list_plain_text_action_id(),
        insert_plain_text_input_contract(),
        InsertFlatListPlainTextAction,
    )])?)
}
fn invocation(text: &str) -> Result<ActionInvocation, Box<dyn Error>> {
    Ok(ActionInvocation::new(
        insert_flat_list_plain_text_action_id(),
        ActionInput::typed(insert_plain_text_input_contract(), ActionValue::try_from_string(text)?),
    ))
}
fn apply(session: &mut EditorSession, text: &str) -> TestResult {
    session.execute_prepared_action(registry()?.prepare(session.state(), &invocation(text)?)?)?;
    Ok(())
}
fn exact(actual: &EditorState, expected: &EditorState) {
    assert_eq!(actual.document(), expected.document());
    assert_eq!(actual.selection(), expected.selection());
    assert_eq!(actual.pending_formats(), expected.pending_formats());
}
fn history(before: &EditorState, expected: &EditorState, input: &str) -> TestResult {
    let mut session = EditorSession::new(before.clone());
    apply(&mut session, input)?;
    exact(session.state(), expected);
    assert_eq!(session.undo_depth(), 1);
    session.undo()?.ok_or("undo")?;
    exact(session.state(), before);
    session.redo()?.ok_or("redo")?;
    exact(session.state(), expected);
    Ok(())
}
fn disabled(state: &EditorState, input: &str, code: &str) -> TestResult {
    let result =
        InsertFlatListPlainTextAction.evaluate(state, &InsertPlainTextInput::try_new(input)?)?;
    assert!(
        matches!(result.decision(),ActionDecision::Disabled(reason)if reason.code().as_str()==code),
        "{:?}",
        result.decision()
    );
    Ok(())
}

#[test]
fn every_kind_and_family_supports_empty_lines_unicode_and_all_newline_spellings() -> TestResult {
    let context = context(DocumentLimits::default())?;
    for rank in 0..=6 {
        for family in 0..3 {
            let kind = if rank == 0 { TextBlockKind::Paragraph } else { heading(rank)? };
            for (value, prefix, suffix) in
                [("a🙂b", "", "a🙂b"), ("a🙂b", "a", "🙂b"), ("a🙂b", "a🙂b", ""), ("", "", "")]
            {
                for input in ["X", "X\r\nY\rZ\n", "\n", "\n\n", "🙂\u{2028}e\u{301}"] {
                    let offset = u32::try_from(prefix.encode_utf16().count())?;
                    let (roots, mut path) = if family == 0 {
                        (vec![block(kind, value, formats()?)?], vec![0])
                    } else {
                        (
                            vec![list(
                                vec![p("prefix")?, block(kind, value, formats()?)?, p("suffix")?],
                                (family == 2).then_some(12),
                            )?],
                            vec![0, 1, 0],
                        )
                    };
                    let selected = if value.is_empty() {
                        gap(&path)?
                    } else {
                        path.push(0);
                        point(&path, offset)?
                    };
                    let before = state(&context, roots, caret(selected), Some(formats()?))?;
                    let normalized = input.replace("\r\n", "\n").replace('\r', "\n");
                    let lines = normalized.split('\n').collect::<Vec<_>>();
                    let mut blocks = vec![];
                    for (index, line) in lines.iter().enumerate() {
                        let last = index + 1 == lines.len();
                        let kind = if index == 0 || (last && !suffix.is_empty()) {
                            kind
                        } else {
                            TextBlockKind::Paragraph
                        };
                        blocks.push(block(
                            kind,
                            &format!(
                                "{}{}{}",
                                if index == 0 { prefix } else { "" },
                                line,
                                if last { suffix } else { "" }
                            ),
                            formats()?,
                        )?);
                    }
                    let last = u32::try_from(lines.len() - 1)?;
                    let tail = lines.last().ok_or("line")?;
                    let offset = u32::try_from(tail.encode_utf16().count())?
                        + if lines.len() == 1 { offset } else { 0 };
                    let empty = tail.is_empty()
                        && suffix.is_empty()
                        && (lines.len() > 1 || prefix.is_empty());
                    let (roots, mut path) = if family == 0 {
                        (blocks, vec![last])
                    } else {
                        blocks.insert(0, p("prefix")?);
                        blocks.push(p("suffix")?);
                        (vec![list(blocks, (family == 2).then_some(12))?], vec![0, 1 + last, 0])
                    };
                    let point = if empty {
                        gap(&path)?
                    } else {
                        path.push(0);
                        point(&path, offset)?
                    };
                    history(&before, &state(&context, roots, caret(point), None)?, input)?;
                }
            }
        }
    }
    Ok(())
}

#[test]
fn cross_root_paste_inherits_start_family_and_retains_untouched_suffix_ordinals() -> TestResult {
    let context = context(DocumentLimits::default())?;
    for first in 0..3 {
        for last in 0..3 {
            for reverse in [false, true] {
                for suffix in [false, true] {
                    let left = block(heading(2)?, "ab", formats()?)?;
                    let right = block(heading(5)?, "cd", formats()?)?;
                    let mut roots = vec![
                        if first == 0 {
                            left
                        } else {
                            list(vec![p("prefix")?, left], (first == 2).then_some(8))?
                        },
                        p("middle")?,
                        if last == 0 {
                            right
                        } else {
                            list(vec![right, p("suffix")?], (last == 2).then_some(40))?
                        },
                        p("outside")?,
                    ];
                    let start = if first == 0 { vec![0, 0] } else { vec![0, 1, 0, 0] };
                    let end = if last == 0 { vec![2, 0] } else { vec![2, 0, 0, 0] };
                    let before = state(
                        &context,
                        roots.clone(),
                        select(
                            point(&start, 1)?,
                            point(&end, if suffix { 1 } else { 2 })?,
                            reverse,
                        ),
                        None,
                    )?;
                    let mut inserted = vec![
                        block(heading(2)?, "aX", formats()?)?,
                        p("")?,
                        block(
                            if suffix { heading(5)? } else { TextBlockKind::Paragraph },
                            if suffix { "Yd" } else { "Y" },
                            formats()?,
                        )?,
                    ];
                    roots = if first == 0 {
                        inserted
                    } else {
                        inserted.insert(0, p("prefix")?);
                        vec![list(inserted, (first == 2).then_some(8))?]
                    };
                    if last != 0 {
                        roots.push(list(vec![p("suffix")?], (last == 2).then_some(41))?);
                    }
                    roots.push(p("outside")?);
                    let path = if first == 0 { vec![2, 0] } else { vec![0, 3, 0, 0] };
                    history(
                        &before,
                        &state(&context, roots, caret(point(&path, 1)?), None)?,
                        "X\n\nY",
                    )?;
                }
            }
        }
    }
    Ok(())
}

#[test]
fn single_line_cross_item_paste_keeps_start_kind_and_is_independent_history() -> TestResult {
    let context = context(DocumentLimits::default())?;
    let before = state(
        &context,
        vec![list(
            vec![
                block(heading(6)?, "ab", formats()?)?,
                block(heading(1)?, "cd", formats()?)?,
                p("outside")?,
            ],
            Some(5),
        )?],
        select(point(&[0, 0, 0, 0], 1)?, point(&[0, 1, 0, 0], 1)?, true),
        None,
    )?;
    let expected = state(
        &context,
        vec![list(vec![block(heading(6)?, "aXd", formats()?)?, p("outside")?], Some(5))?],
        caret(point(&[0, 0, 0, 0], 2)?),
        None,
    )?;
    history(&before, &expected, "X")?;
    let mut session = EditorSession::new(before);
    apply(&mut session, "X")?;
    apply(&mut session, "Y")?;
    assert_eq!(session.undo_depth(), 2);
    session.undo()?.ok_or("undo")?;
    exact(session.state(), &expected);
    Ok(())
}

#[test]
fn middle_selected_formatting_wins_over_unselected_endpoint_context() -> TestResult {
    let context = context(DocumentLimits::default())?;
    for reverse in [false, true] {
        let before = state(
            &context,
            vec![list(
                vec![
                    block(heading(2)?, "a", FormatSet::default())?,
                    p("middle")?,
                    block(heading(4)?, "b", FormatSet::default())?,
                ],
                Some(10),
            )?],
            select(point(&[0, 0, 0, 0], 1)?, point(&[0, 2, 0, 0], 0)?, reverse),
            None,
        )?;
        let expected = state(
            &context,
            vec![list(
                vec![
                    mixed(heading(2)?, &[("a", FormatSet::default()), ("X", formats()?)])?,
                    mixed(heading(4)?, &[("Y", formats()?), ("b", FormatSet::default())])?,
                ],
                Some(10),
            )?],
            caret(point(&[0, 1, 0, 1], 0)?),
            None,
        )?;
        history(&before, &expected, "X\nY")?;
    }
    Ok(())
}

#[test]
fn caret_affinity_and_pending_override_apply_to_every_inserted_line() -> TestResult {
    let context = context(DocumentLimits::default())?;
    for affinity in [Affinity::Before, Affinity::After] {
        for pending in [None, Some(FormatSet::default()), Some(formats()?)] {
            let selected = Point::Text {
                text_path: NodePath::try_from_indices(vec![0, 0, 0, 0])?,
                utf16_offset: 1,
                affinity,
            };
            let before = state(
                &context,
                vec![list(
                    vec![mixed(heading(2)?, &[("a", formats()?), ("b", FormatSet::default())])?],
                    None,
                )?],
                caret(selected),
                pending.clone(),
            )?;
            let inserted = pending.unwrap_or(if affinity == Affinity::Before {
                formats()?
            } else {
                FormatSet::default()
            });
            let mut session = EditorSession::new(before.clone());
            apply(&mut session, "X\nY")?;
            let roots = if inserted == FormatSet::default() {
                vec![list(
                    vec![
                        mixed(heading(2)?, &[("a", formats()?), ("X", FormatSet::default())])?,
                        block(heading(2)?, "Yb", FormatSet::default())?,
                    ],
                    None,
                )?]
            } else {
                vec![list(
                    vec![
                        block(heading(2)?, "aX", formats()?)?,
                        mixed(heading(2)?, &[("Y", formats()?), ("b", FormatSet::default())])?,
                    ],
                    None,
                )?]
            };
            let expected = state(
                &context,
                roots,
                caret(point(
                    &[0, 1, 0, u32::from(inserted != FormatSet::default())],
                    u32::from(inserted == FormatSet::default()),
                )?),
                None,
            )?;
            exact(session.state(), &expected);
            session.undo()?.ok_or("undo")?;
            exact(session.state(), &before);
            session.redo()?.ok_or("redo")?;
            exact(session.state(), &expected);
        }
    }
    Ok(())
}

#[test]
fn text_empty_ranges_fall_back_to_left_then_right_then_plain() -> TestResult {
    let context = context(DocumentLimits::default())?;
    for case in 0..3 {
        let left = if case == 0 { "a" } else { "" };
        let right = if case < 2 { "b" } else { "" };
        let before = state(
            &context,
            vec![list(
                vec![
                    block(
                        heading(1)?,
                        left,
                        if case == 0 { formats()? } else { FormatSet::default() },
                    )?,
                    block(heading(4)?, right, formats()?)?,
                ],
                None,
            )?],
            select(
                if left.is_empty() { gap(&[0, 0, 0])? } else { point(&[0, 0, 0, 0], 1)? },
                if right.is_empty() { gap(&[0, 1, 0])? } else { point(&[0, 1, 0, 0], 0)? },
                true,
            ),
            None,
        )?;
        let inherited = if case < 2 { formats()? } else { FormatSet::default() };
        let expected = state(
            &context,
            vec![list(
                vec![
                    block(heading(1)?, &format!("{left}X"), inherited.clone())?,
                    block(
                        if right.is_empty() { TextBlockKind::Paragraph } else { heading(4)? },
                        &format!("Y{right}"),
                        inherited,
                    )?,
                ],
                None,
            )?],
            caret(point(&[0, 1, 0, 0], 1)?),
            None,
        )?;
        history(&before, &expected, "X\nY")?;
    }
    Ok(())
}

#[test]
fn limits_and_ordinal_overflow_reject_without_state_or_history_changes() -> TestResult {
    for (limits, start, input, code) in [
        (DocumentLimits::default(), Some(2_147_483_647), "X\nY", "breditor/list-ordinal-overflow"),
        (
            DocumentLimits::default().with_max_nodes(6),
            None,
            "X\nY",
            "breditor/result-limit-exceeded",
        ),
        (
            DocumentLimits::default().with_max_text_bytes(2),
            None,
            "XX",
            "breditor/result-limit-exceeded",
        ),
        (
            DocumentLimits::default().with_max_property_values(2),
            None,
            "X\nY",
            "breditor/result-limit-exceeded",
        ),
    ] {
        let context = context(limits)?;
        let before = state(
            &context,
            vec![list(vec![block(heading(2)?, "ab", formats()?)?], start)?],
            caret(point(&[0, 0, 0, 0], 1)?),
            None,
        )?;
        disabled(&before, input, code)?;
        let mut session = EditorSession::new(before.clone());
        assert!(apply(&mut session, input).is_err());
        assert_eq!(session.state(), &before);
        assert_eq!(session.undo_depth(), 0);
    }
    let context = context(DocumentLimits::default().with_max_nodes(7))?;
    let before = state(
        &context,
        vec![list(vec![p("a")?], None)?, p("outside")?],
        caret(point(&[0, 0, 0, 0], 1)?),
        None,
    )?;
    disabled(&before, "X\nY", "breditor/result-limit-exceeded")?;
    Ok(())
}

#[test]
fn replacement_succeeds_at_exact_final_budgets_without_transient_growth() -> TestResult {
    let context = context(DocumentLimits::default().with_max_nodes(8).with_max_property_values(2))?;
    let before = state(
        &context,
        vec![list(vec![p("a")?, p("b")?], None)?],
        select(point(&[0, 0, 0, 0], 0)?, point(&[0, 1, 0, 0], 1)?, true),
        None,
    )?;
    let expected = state(
        &context,
        vec![list(vec![p("X")?, p("Y")?], None)?],
        caret(point(&[0, 1, 0, 0], 1)?),
        None,
    )?;
    history(&before, &expected, "X\nY")
}

#[test]
fn exact_replacement_only_moves_selection_and_preserves_redo() -> TestResult {
    let context = context(DocumentLimits::default())?;
    let before = state(
        &context,
        vec![list(vec![p("a")?, p("b")?], Some(1))?],
        select(point(&[0, 0, 0, 0], 0)?, point(&[0, 1, 0, 0], 1)?, true),
        None,
    )?;
    let mut session = EditorSession::new(before.clone());
    apply(&mut session, "X")?;
    session.undo()?.ok_or("undo")?;
    apply(&mut session, "a\nb")?;
    assert_eq!(session.state().document(), before.document());
    assert_eq!(session.state().selection(), Some(&caret(point(&[0, 1, 0, 0], 1)?)));
    assert_eq!(session.undo_depth(), 0);
    assert_eq!(session.redo_depth(), 1);
    session.redo()?.ok_or("redo")?;
    Ok(())
}

#[test]
fn stale_and_disabled_paste_keep_newer_state_and_redo() -> TestResult {
    let context = context(DocumentLimits::default().with_max_text_bytes(3))?;
    let before = state(
        &context,
        vec![list(vec![p("abc")?], None)?],
        select(point(&[0, 0, 0, 0], 0)?, point(&[0, 0, 0, 0], 3)?, true),
        None,
    )?;
    let mut session = EditorSession::new(before.clone());
    let registry = registry()?;
    let stale = registry.prepare(&before, &invocation("X\nY")?)?;
    apply(&mut session, "Z")?;
    session.undo()?.ok_or("undo")?;
    let saved = session.state().clone();
    let history = session.history_status();
    assert!(session.execute_prepared_action(stale).is_err());
    assert_eq!(session.state(), &saved);
    assert_eq!(session.history_status(), history);
    session.apply_transaction(
        &Transaction::new(session.state(), vec![])
            .with_selection_update(SelectionUpdate::Set(Some(caret(point(&[0, 0, 0, 0], 3)?)))),
    )?;
    let saved = session.state().clone();
    let history = session.history_status();
    assert!(apply(&mut session, "X").is_err());
    assert_eq!(session.state(), &saved);
    assert_eq!(session.history_status(), history);
    session.redo()?.ok_or("redo")?;
    Ok(())
}

#[test]
fn schema_selection_operation_budget_and_input_admission_stay_closed() -> TestResult {
    let flat = context(DocumentLimits::default())?;
    for context in [
        EditorContext::new(CompiledSchema::breditor_base(), DocumentLimits::default()),
        crate::codec::structural_codec_test_support::context(DocumentLimits::default())?,
    ] {
        let before = state(
            &context,
            vec![block(TextBlockKind::Paragraph, "a", FormatSet::default())?],
            caret(point(&[0, 0], 0)?),
            None,
        )?;
        disabled(&before, "X\nY", "breditor/unsupported-schema")?;
    }
    let absent = state(&flat, vec![list(vec![p("a")?], None)?], None, None)?;
    disabled(&absent, "X", "breditor/no-selection")?;
    let zero = flat.clone().with_max_operations_per_transaction(0);
    let before =
        state(&zero, vec![list(vec![p("a")?], None)?], caret(point(&[0, 0, 0, 0], 0)?), None)?;
    disabled(&before, "X", "breditor/operation-budget-exceeded")?;
    let before =
        state(&flat, vec![list(vec![p("a")?], None)?], caret(point(&[0, 0, 0, 0], 0)?), None)?;
    for input in [String::new(), "\n".repeat(10_000)] {
        assert!(registry()?.prepare(&before, &invocation(&input)?).is_err());
    }
    let wrong = ActionInvocation::new(
        ActionId::try_new("breditor/insert-flat-list-plain-text")?,
        ActionInput::typed(insert_text_input_contract(), ActionValue::try_from_string("X")?),
    );
    assert!(registry()?.prepare(&before, &wrong).is_err());
    Ok(())
}

proptest! {
    #[test]
    fn unicode_cross_item_paste_matches_independent_content_and_exact_history(
        left in prop::collection::vec(prop::sample::select(vec!['a','🙂','é','\u{301}']),0..15),
        right in prop::collection::vec(prop::sample::select(vec!['b','🚀','界','\u{301}']),0..15),
        lines in prop::collection::vec("[a-z🙂]{0,8}",2..6),a in 0_usize..30,b in 0_usize..30,
        rank in 1_u32..7,reverse in any::<bool>(),ordered in any::<bool>(),
    ) {
        let result=(||->TestResult {
            let context=context(DocumentLimits::default())?;let a=a%(left.len()+1);let b=b%(right.len()+1);
            let prefix=left[..a].iter().collect::<String>();let suffix=right[b..].iter().collect::<String>();let left=left.iter().collect::<String>();let right=right.iter().collect::<String>();
            let start=if left.is_empty(){gap(&[0,1,0])?}else{point(&[0,1,0,0],u32::try_from(prefix.encode_utf16().count())?)?};
            let end=if right.is_empty(){gap(&[0,3,0])?}else{point(&[0,3,0,0],u32::try_from(right[..right.len()-suffix.len()].encode_utf16().count())?)?};
            let before=state(&context,vec![list(vec![p("before")?,block(heading(rank)?,&left,formats()?)?,p("middle")?,block(heading(4)?,&right,formats()?)?,p("after")?],ordered.then_some(50))?],select(start,end,reverse),None)?;
            let mut blocks=vec![p("before")?];for (index,line) in lines.iter().enumerate(){let last=index+1==lines.len();let kind=if index==0{heading(rank)?}else if last&&!suffix.is_empty(){heading(4)?}else{TextBlockKind::Paragraph};blocks.push(block(kind,&format!("{}{}{}",if index==0{prefix.as_str()}else{""},line,if last{suffix.as_str()}else{""}),formats()?)?);}blocks.push(p("after")?);
            let path=vec![0,u32::try_from(lines.len())?,0];let tail=lines.last().ok_or("line")?;let result_point=if tail.is_empty()&&suffix.is_empty(){gap(&path)?}else{let mut path=path;path.push(0);point(&path,u32::try_from(tail.encode_utf16().count())?)?};
            let expected=state(&context,vec![list(blocks,ordered.then_some(50))?],caret(result_point),None)?;
            history(&before,&expected,&lines.join("\r\n"))
        })();prop_assert!(result.is_ok(),"{result:?}");
    }
}
