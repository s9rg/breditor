//! Heading-aware paste: independent content oracle, exact history and V5 reload.
use super::*;
use crate::{
    action::{Action, ActionDecision, ActionInput, ActionInvocation, ActionValue},
    block::TextBlockKind,
    codec::{
        SessionCheckpointJsonCodecV5,
        structural_codec_test_support::{TestResult, block, context, formats, heading, state},
    },
    document::{FormatSet, NodeRef, TextNode},
    position::{Affinity, NodePath, Point},
    schema::DocumentLimits,
    selection::{RangeSelection, Selection},
    session::EditorSession,
    state::EditorState,
};
use proptest::prelude::*;
use std::error::Error;

fn registry() -> Result<ActionRegistry, Box<dyn Error>> {
    Ok(ActionRegistry::try_new(vec![ActionRegistration::with_input(
        insert_text_block_plain_text_action_id(),
        insert_plain_text_input_contract(),
        InsertTextBlockPlainTextAction,
    )])?)
}
fn invocation(text: &str) -> Result<ActionInvocation, Box<dyn Error>> {
    Ok(ActionInvocation::new(
        insert_text_block_plain_text_action_id(),
        ActionInput::typed(insert_plain_text_input_contract(), ActionValue::try_from_string(text)?),
    ))
}
fn apply(session: &mut EditorSession, text: &str) -> TestResult {
    session.execute_prepared_action(registry()?.prepare(session.state(), &invocation(text)?)?)?;
    Ok(())
}
fn point(block: u32, run: u32, offset: u32) -> Result<Point, Box<dyn Error>> {
    Ok(Point::Text {
        text_path: NodePath::try_from_indices(vec![block, run])?,
        utf16_offset: offset,
        affinity: Affinity::Before,
    })
}
fn empty(block: u32) -> Result<Point, Box<dyn Error>> {
    Ok(Point::Children {
        parent_path: NodePath::try_from_indices(vec![block])?,
        child_index: 0,
        affinity: Affinity::Before,
    })
}
fn caret(point: Point) -> Selection {
    RangeSelection::new(point.clone(), point).into()
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
    // The complete paste is one saved forward recipe and one undo step.
    let codec = SessionCheckpointJsonCodecV5::new(context(DocumentLimits::default())?);
    let writer = SessionCheckpointJsonCodecV5::new(before.context().clone());
    let encoded = writer.encode(&session)?;
    let value: serde_json::Value = serde_json::from_str(&encoded)?;
    assert_eq!(value["entries"][0]["forwardOperations"].as_array().ok_or("operations")?.len(), 1);
    let mut restored = codec.decode(&encoded)?;
    exact(restored.state(), expected);
    restored.undo()?.ok_or("undo")?;
    exact(restored.state(), before);
    let mut restored = codec.decode(&codec.encode(&restored)?)?;
    restored.redo()?.ok_or("redo")?;
    exact(restored.state(), expected);
    Ok(())
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
    Ok(NodeRef::element(template.as_element().ok_or("template")?.try_with_children(children)?))
}

#[test]
fn plain_text_all_kinds_offsets_empty_lines_and_newline_spellings_roundtrip() -> TestResult {
    let context = context(DocumentLimits::default())?;
    for rank in 0..=6 {
        let kind = if rank == 0 { TextBlockKind::Paragraph } else { heading(rank)? };
        for (text, prefix, suffix) in
            [("a🙂b", "", "a🙂b"), ("a🙂b", "a", "🙂b"), ("a🙂b", "a🙂b", ""), ("", "", "")]
        {
            for input in ["X", "X\r\nY\rZ\n", "\n", "\n\n", "🙂\u{2028}e\u{301}"] {
                let offset = u32::try_from(prefix.encode_utf16().count())?;
                let before = state(
                    &context,
                    vec![block(kind, text, formats()?)?],
                    caret(if text.is_empty() { empty(0)? } else { point(0, 0, offset)? }),
                    Some(formats()?),
                )?;
                let normalized = input.replace("\r\n", "\n").replace('\r', "\n");
                let lines = normalized.split('\n').collect::<Vec<_>>();
                let mut blocks = Vec::new();
                for (index, line) in lines.iter().enumerate() {
                    let last = index + 1 == lines.len();
                    let k = if index == 0 || (last && !suffix.is_empty()) {
                        kind
                    } else {
                        TextBlockKind::Paragraph
                    };
                    let text = format!(
                        "{}{}{}",
                        if index == 0 { prefix } else { "" },
                        line,
                        if last { suffix } else { "" }
                    );
                    blocks.push(block(k, &text, formats()?)?);
                }
                let last = u32::try_from(lines.len() - 1)?;
                let tail = lines.last().ok_or("line")?;
                let offset = u32::try_from(tail.encode_utf16().count())?
                    + if lines.len() == 1 { offset } else { 0 };
                let last_text_empty =
                    tail.is_empty() && suffix.is_empty() && (lines.len() > 1 || prefix.is_empty());
                let expected = state(
                    &context,
                    blocks,
                    caret(if last_text_empty { empty(last)? } else { point(last, 0, offset)? }),
                    None,
                )?;
                history(&before, &expected, input)?;
            }
        }
    }
    Ok(())
}

#[test]
fn plain_text_cross_block_direction_formats_and_boundary_kinds_are_preserved() -> TestResult {
    let context = context(DocumentLimits::default())?;
    for backward in [false, true] {
        let a = point(0, 0, 1)?;
        let b = point(2, 0, 0)?;
        let selection =
            if backward { RangeSelection::new(b, a) } else { RangeSelection::new(a, b) };
        let before = state(
            &context,
            vec![
                block(heading(1)?, "a", FormatSet::default())?,
                block(TextBlockKind::Paragraph, "selected", formats()?)?,
                block(heading(6)?, "b", FormatSet::default())?,
            ],
            Selection::Range(selection),
            None,
        )?;
        let expected = state(
            &context,
            vec![
                mixed(heading(1)?, &[("a", FormatSet::default()), ("X", formats()?)])?,
                block(TextBlockKind::Paragraph, "🙂", formats()?)?,
                mixed(heading(6)?, &[("Z", formats()?), ("b", FormatSet::default())])?,
            ],
            caret(point(2, 1, 0)?),
            None,
        )?;
        history(&before, &expected, "X\r\n🙂\rZ")?;
        let single = state(
            &context,
            vec![mixed(
                heading(1)?,
                &[("a", FormatSet::default()), ("X", formats()?), ("b", FormatSet::default())],
            )?],
            caret(point(0, 2, 0)?),
            None,
        )?;
        history(&before, &single, "X")?;
    }
    Ok(())
}

#[test]
fn plain_text_pending_formats_override_caret_but_not_selected_text() -> TestResult {
    let context = context(DocumentLimits::default())?;
    let before = state(
        &context,
        vec![block(heading(2)?, "ab", formats()?)?],
        caret(point(0, 0, 1)?),
        Some(FormatSet::default()),
    )?;
    let expected = state(
        &context,
        vec![
            mixed(heading(2)?, &[("a", formats()?), ("X", FormatSet::default())])?,
            mixed(heading(2)?, &[("Y", FormatSet::default()), ("b", formats()?)])?,
        ],
        caret(point(1, 1, 0)?),
        None,
    )?;
    history(&before, &expected, "X\nY")?;
    let before = state(
        &context,
        vec![block(heading(2)?, "ab", formats()?)?],
        Selection::Range(RangeSelection::new(point(0, 0, 2)?, point(0, 0, 0)?)),
        None,
    )?;
    let expected = state(
        &context,
        vec![
            block(heading(2)?, "X", formats()?)?,
            block(TextBlockKind::Paragraph, "Y", formats()?)?,
        ],
        caret(point(1, 0, 1)?),
        None,
    )?;
    history(&before, &expected, "X\nY")
}

#[test]
fn plain_text_result_limits_reject_without_state_or_history_changes() -> TestResult {
    for limits in [
        DocumentLimits::default().with_max_nodes(3),
        DocumentLimits::default().with_max_children_per_element(1),
        DocumentLimits::default().with_max_total_text_bytes(1),
        DocumentLimits::default().with_max_text_bytes(1),
        DocumentLimits::default().with_max_property_values(2),
    ] {
        let context = context(limits)?;
        let before = state(
            &context,
            vec![block(heading(1)?, "a", formats()?)?],
            caret(point(0, 0, 0)?),
            None,
        )?;
        let mut session = EditorSession::new(before.clone());
        let evaluation = InsertTextBlockPlainTextAction
            .evaluate(&before, &InsertPlainTextInput::try_new("XY\nZ")?)?;
        assert!(matches!(evaluation.decision(), ActionDecision::Disabled(reason)
            if reason.code().as_str() == "breditor/result-limit-exceeded"));
        assert!(apply(&mut session, "XY\nZ").is_err());
        assert_eq!(session.state(), &before);
        assert_eq!(session.undo_depth(), 0);
    }
    Ok(())
}

#[test]
fn plain_text_invalid_input_and_stale_preparations_cannot_destroy_redo() -> TestResult {
    let context = context(DocumentLimits::default())?;
    let before =
        state(&context, vec![block(heading(2)?, "ab", formats()?)?], caret(point(0, 0, 1)?), None)?;
    let mut session = EditorSession::new(before);
    let stale = registry()?.prepare(session.state(), &invocation("old\ntext")?)?;
    apply(&mut session, "X\nY")?;
    session.undo()?.ok_or("undo")?;
    let before = session.state().clone();
    let status = session.history_status();
    for invalid in ["", &"\n".repeat(10_000)] {
        assert!(apply(&mut session, invalid).is_err());
        assert_eq!(session.state(), &before);
        assert_eq!(session.history_status(), status);
    }
    assert!(session.execute_prepared_action(stale).is_err());
    assert_eq!(session.state(), &before);
    assert_eq!(session.history_status(), status);
    session.redo()?.ok_or("redo")?;
    Ok(())
}

#[test]
fn plain_text_pastes_never_merge_with_each_other() -> TestResult {
    let context = context(DocumentLimits::default())?;
    let before =
        state(&context, vec![block(heading(1)?, "ab", formats()?)?], caret(point(0, 0, 1)?), None)?;
    let mut session = EditorSession::new(before.clone());
    apply(&mut session, "X")?;
    let first = session.state().clone();
    apply(&mut session, "Y")?;
    assert_eq!(session.undo_depth(), 2);
    session.undo()?.ok_or("undo")?;
    exact(session.state(), &first);
    session.undo()?.ok_or("undo")?;
    exact(session.state(), &before);
    Ok(())
}

#[test]
fn plain_text_caret_format_seams_respect_focus_affinity() -> TestResult {
    let context = context(DocumentLimits::default())?;
    for (affinity, inherited) in
        [(Affinity::Before, formats()?), (Affinity::After, FormatSet::default())]
    {
        let p = Point::Text {
            text_path: NodePath::try_from_indices(vec![0, 1])?,
            utf16_offset: 0,
            affinity,
        };
        let before = state(
            &context,
            vec![mixed(heading(3)?, &[("a", formats()?), ("b", FormatSet::default())])?],
            caret(p),
            None,
        )?;
        let (first, last, caret_point) = if inherited.is_empty() {
            (
                mixed(heading(3)?, &[("a", formats()?), ("X", inherited.clone())])?,
                block(heading(3)?, "Yb", inherited)?,
                point(1, 0, 1)?,
            )
        } else {
            (
                block(heading(3)?, "aX", inherited.clone())?,
                mixed(heading(3)?, &[("Y", inherited), ("b", FormatSet::default())])?,
                point(1, 1, 0)?,
            )
        };
        history(&before, &state(&context, vec![first, last], caret(caret_point), None)?, "X\nY")?;
    }
    Ok(())
}

#[test]
fn plain_text_empty_structural_range_uses_left_then_right_then_unformatted() -> TestResult {
    let context = context(DocumentLimits::default())?;
    for (left, right) in [("a", "b"), ("", "b"), ("", "")] {
        let first = if left.is_empty() { empty(0)? } else { point(0, 0, 1)? };
        let last = if right.is_empty() { empty(1)? } else { point(1, 0, 0)? };
        let before = state(
            &context,
            vec![
                block(heading(1)?, left, FormatSet::default())?,
                block(heading(6)?, right, formats()?)?,
            ],
            Selection::Range(RangeSelection::new(last, first)),
            None,
        )?;
        let inherited =
            if left.is_empty() && !right.is_empty() { formats()? } else { FormatSet::default() };
        let first = block(heading(1)?, &format!("{left}X"), inherited.clone())?;
        let (last, p) = if !left.is_empty() && !right.is_empty() {
            (mixed(heading(6)?, &[("Y", inherited), (right, formats()?)])?, point(1, 1, 0)?)
        } else {
            (
                block(
                    if right.is_empty() { TextBlockKind::Paragraph } else { heading(6)? },
                    &format!("Y{right}"),
                    inherited,
                )?,
                point(1, 0, 1)?,
            )
        };
        history(&before, &state(&context, vec![first, last], caret(p), None)?, "X\nY")?;
    }
    Ok(())
}

#[test]
fn plain_text_exact_replacement_clears_selection_without_inventing_history() -> TestResult {
    let context = context(DocumentLimits::default())?;
    let before = state(
        &context,
        vec![block(heading(2)?, "ab", formats()?)?],
        Selection::Range(RangeSelection::new(point(0, 0, 2)?, point(0, 0, 0)?)),
        None,
    )?;
    let mut session = EditorSession::new(before.clone());
    apply(&mut session, "ab")?;
    assert_eq!(session.state().document(), before.document());
    assert_eq!(session.state().selection(), Some(&caret(point(0, 0, 2)?)));
    assert_eq!(session.state().pending_formats(), None);
    assert_eq!(session.undo_depth(), 0);
    Ok(())
}

#[test]
fn plain_text_admission_counts_untouched_siblings() -> TestResult {
    let context = context(DocumentLimits::default().with_max_total_text_bytes(5))?;
    let before = state(
        &context,
        vec![
            block(heading(1)?, "a", formats()?)?,
            block(TextBlockKind::Paragraph, "bbbb", FormatSet::default())?,
        ],
        caret(point(0, 0, 1)?),
        None,
    )?;
    let evaluation = InsertTextBlockPlainTextAction
        .evaluate(&before, &InsertPlainTextInput::try_new("X\nY")?)?;
    assert!(matches!(evaluation.decision(),ActionDecision::Disabled(reason)
        if reason.code().as_str()=="breditor/result-limit-exceeded"));
    Ok(())
}

#[test]
fn plain_text_live_engine_admits_saved_paste_or_preserves_the_old_owner() -> TestResult {
    use crate::{
        codec::SessionCheckpointLimits,
        engine::{CheckpointedEditorEngine, EditorEngine},
    };
    let context = context(DocumentLimits::default())?;
    let before = state(
        &context,
        vec![block(heading(2)?, "ab", formats()?)?],
        caret(point(0, 0, 1)?),
        Some(FormatSet::default()),
    )?;
    for budget in [0, 1] {
        let mut engine = CheckpointedEditorEngine::try_new_v5(
            EditorEngine::new(EditorSession::new(before.clone()), registry()?),
            SessionCheckpointLimits::default().with_max_aggregate_forward_operations(budget),
        )?;
        let observation = engine.observation();
        let json = engine.session_checkpoint_json().to_owned();
        let result = engine.execute_action(&observation, &invocation("X\nY")?);
        if budget == 0 {
            let error = result.err().ok_or("expected checkpoint rejection")?;
            assert!(error.checkpoint_codec_code().is_some());
            assert_eq!(engine.observation(), observation);
            assert_eq!(engine.session_checkpoint_json(), json);
            exact(engine.state(), &before);
        } else {
            assert!(result?.event().is_some());
            let codec =
                SessionCheckpointJsonCodecV5::new(self::context(DocumentLimits::default())?);
            let mut saved = codec.decode(engine.session_checkpoint_json())?;
            exact(saved.state(), engine.state());
            saved.undo()?.ok_or("undo")?;
            exact(saved.state(), &before);
        }
    }
    Ok(())
}

#[test]
fn plain_text_unsupported_states_are_disabled_explicitly() -> TestResult {
    use crate::{schema::CompiledSchema, state::EditorContext};
    let context = context(DocumentLimits::default())?;
    let no_selection = state(&context, vec![block(heading(1)?, "a", formats()?)?], None, None)?;
    let base = EditorContext::new(CompiledSchema::breditor_base(), DocumentLimits::default());
    let old_profile = state(
        &base,
        vec![block(TextBlockKind::Paragraph, "a", FormatSet::default())?],
        caret(point(0, 0, 1)?),
        None,
    )?;
    let no_operations = state(
        &context.with_max_operations_per_transaction(0),
        vec![block(heading(1)?, "a", formats()?)?],
        caret(point(0, 0, 1)?),
        None,
    )?;
    for (before, code) in [
        (no_selection, "breditor/no-selection"),
        (old_profile, "breditor/unsupported-schema"),
        (no_operations, "breditor/operation-budget-exceeded"),
    ] {
        let evaluation = InsertTextBlockPlainTextAction
            .evaluate(&before, &InsertPlainTextInput::try_new("X\nY")?)?;
        assert!(
            matches!(evaluation.decision(),ActionDecision::Disabled(reason) if reason.code().as_str()==code)
        );
    }
    assert!(
        base_action_registry()?.descriptor(&insert_text_block_plain_text_action_id()).is_none()
    );
    Ok(())
}

#[test]
fn plain_text_cross_block_kind_matrix_keeps_end_rank_only_when_suffix_survives() -> TestResult {
    let context = context(DocumentLimits::default())?;
    for a in 0..=6 {
        for b in 0..=6 {
            let first_kind = if a == 0 { TextBlockKind::Paragraph } else { heading(a)? };
            let last_kind = if b == 0 { TextBlockKind::Paragraph } else { heading(b)? };
            for end in [1, 2] {
                for backward in [false, true] {
                    let first = point(0, 0, 1)?;
                    let last = point(1, 0, end)?;
                    let selection = if backward {
                        RangeSelection::new(last, first)
                    } else {
                        RangeSelection::new(first, last)
                    };
                    let before = state(
                        &context,
                        vec![
                            block(first_kind, "ab", formats()?)?,
                            block(last_kind, "cd", formats()?)?,
                        ],
                        Selection::Range(selection),
                        None,
                    )?;
                    let suffix = if end == 1 { "d" } else { "" };
                    let expected = state(
                        &context,
                        vec![
                            block(first_kind, "aX", formats()?)?,
                            block(TextBlockKind::Paragraph, "M", formats()?)?,
                            block(
                                if suffix.is_empty() {
                                    TextBlockKind::Paragraph
                                } else {
                                    last_kind
                                },
                                &format!("Y{suffix}"),
                                formats()?,
                            )?,
                        ],
                        caret(point(2, 0, 1)?),
                        None,
                    )?;
                    history(&before, &expected, "X\nM\nY")?;
                }
            }
        }
    }
    Ok(())
}

proptest! {
    #[test]
    fn plain_text_unicode_selected_range_matches_independent_line_oracle(
        chars in prop::collection::vec(prop::sample::select(vec!['a','🙂','界','\u{301}']), 1..24),
        left in any::<usize>(), right in any::<usize>(), backward in any::<bool>(), rank in 0_u32..7,
        lines in prop::collection::vec("[a-z🙂]{0,8}", 2..6),
    ) {
        let result = (|| -> TestResult {
            let context = context(DocumentLimits::default())?;
            let kind = if rank == 0 { TextBlockKind::Paragraph } else { heading(rank)? };
            let left = left % (chars.len()+1); let right = right % (chars.len()+1);
            let start = left.min(right); let end = left.max(right);
            let prefix = chars[..start].iter().collect::<String>();
            let suffix = chars[end..].iter().collect::<String>();
            let first = point(0,0,u32::try_from(prefix.encode_utf16().count())?)?;
            let last = point(0,0,u32::try_from(chars[..end].iter().map(|c| c.len_utf16()).sum::<usize>())?)?;
            let selection = if backward { RangeSelection::new(last,first) } else { RangeSelection::new(first,last) };
            let before = state(&context, vec![block(kind, &chars.iter().collect::<String>(), formats()?)?], Selection::Range(selection), None)?;
            let mut expected = Vec::new();
            for (index,line) in lines.iter().enumerate() {
                let last = index+1 == lines.len();
                let target = if index == 0 || (last && !suffix.is_empty()) { kind } else { TextBlockKind::Paragraph };
                let text = format!("{}{}{}", if index==0 { &prefix } else { "" }, line, if last { &suffix } else { "" });
                expected.push(block(target,&text,formats()?)?);
            }
            let last = u32::try_from(lines.len()-1)?;
            let tail = lines.last().ok_or("tail")?;
            let selection = caret(if tail.is_empty() && suffix.is_empty() { empty(last)? } else { point(last,0,u32::try_from(tail.encode_utf16().count())?)? });
            let expected = state(&context, expected, selection, None)?;
            history(&before,&expected,&lines.join("\r\n"))
        })();
        prop_assert!(result.is_ok(), "{result:?}");
    }
}
