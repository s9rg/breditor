//! Public registry/session contracts for experimental heading typing.
use super::*;
use crate::{
    action::{Action, ActionDecision, ActionInput, ActionInvocation, ActionValue},
    block::TextBlockKind,
    codec::structural_codec_test_support::{TestResult, block, context, formats, heading, state},
    document::{FormatSet, NodeRef, TextFragment, TextRun},
    position::{Affinity, NodePath, Point, TextOffset},
    schema::{CompiledSchema, DocumentLimits},
    selection::{RangeSelection, Selection},
    session::EditorSession,
    state::{EditorContext, EditorState},
};
use proptest::prelude::*;
use std::error::Error;

fn registry() -> Result<ActionRegistry, Box<dyn Error>> {
    Ok(ActionRegistry::try_new(vec![ActionRegistration::with_input(
        insert_text_block_text_action_id(),
        insert_text_input_contract(),
        InsertTextBlockTextAction,
    )])?)
}
fn invocation(text: &str) -> Result<ActionInvocation, Box<dyn Error>> {
    Ok(ActionInvocation::new(
        insert_text_block_text_action_id(),
        ActionInput::typed(insert_text_input_contract(), ActionValue::try_from_string(text)?),
    ))
}
fn apply(session: &mut EditorSession, text: &str) -> TestResult {
    let prepared = registry()?.prepare(session.state(), &invocation(text)?)?;
    session.execute_prepared_action(prepared)?;
    Ok(())
}
fn point(block: u32, run: u32, offset: u32, affinity: Affinity) -> Result<Point, Box<dyn Error>> {
    Ok(Point::Text {
        text_path: NodePath::try_from_indices(vec![block, run])?,
        utf16_offset: offset,
        affinity,
    })
}
fn caret(point: Point) -> Selection {
    RangeSelection::new(point.clone(), point).into()
}
fn empty_caret() -> Result<Selection, Box<dyn Error>> {
    Ok(caret(Point::Children {
        parent_path: NodePath::try_from_indices(vec![0])?,
        child_index: 0,
        affinity: Affinity::After,
    }))
}
fn assert_exact_values(actual: &EditorState, expected: &EditorState) {
    assert_eq!(actual.document(), expected.document());
    assert_eq!(actual.selection(), expected.selection());
    assert_eq!(actual.pending_formats(), expected.pending_formats());
}
fn mixed_block() -> Result<NodeRef, Box<dyn Error>> {
    let left = block(heading(2)?, "ab", formats()?)?;
    let right = block(heading(2)?, "CD", FormatSet::default())?;
    let children = left
        .as_element()
        .ok_or("left")?
        .children()
        .iter()
        .chain(right.as_element().ok_or("right")?.children().iter())
        .cloned()
        .collect();
    Ok(NodeRef::element(left.as_element().ok_or("left")?.try_with_children(children)?))
}
fn runs(state: &EditorState) -> Result<Vec<TextRun>, Box<dyn Error>> {
    Ok(state
        .document()
        .node_at(&NodePath::try_from_indices(vec![0])?)?
        .as_element()
        .ok_or("block")?
        .children()
        .iter()
        .map(|node| node.as_text().map(TextRun::from_text_node).ok_or("text"))
        .collect::<Result<Vec<_>, _>>()?)
}

#[test]
fn typing_all_ranks_preserves_kind_unicode_formats_caret_and_exact_history() -> TestResult {
    let context = context(DocumentLimits::default())?;
    for rank in 0..=6 {
        let kind = if rank == 0 { TextBlockKind::Paragraph } else { heading(rank)? };
        let before = state(
            &context,
            vec![block(kind, "ae\u{301}", formats()?)?],
            caret(point(0, 0, 1, Affinity::After)?),
            None,
        )?;
        let mut session = EditorSession::new(before.clone());
        apply(&mut session, "🙂")?;
        let expected = state(
            &context,
            vec![block(kind, "a🙂e\u{301}", formats()?)?],
            caret(point(0, 0, 3, Affinity::Before)?),
            None,
        )?;
        assert_exact_values(session.state(), &expected);
        assert_eq!(session.undo_depth(), 1);
        session.undo()?.ok_or("undo")?;
        assert_exact_values(session.state(), &before);
        session.redo()?.ok_or("redo")?;
        assert_exact_values(session.state(), &expected);
    }
    Ok(())
}

#[test]
fn empty_heading_consumes_pending_formats_and_adjacent_typing_merges() -> TestResult {
    let context = context(DocumentLimits::default())?;
    let before = state(
        &context,
        vec![block(heading(6)?, "", FormatSet::default())?],
        empty_caret()?,
        Some(formats()?),
    )?;
    let mut session = EditorSession::new(before.clone());
    apply(&mut session, "a")?;
    apply(&mut session, "🙂")?;
    assert_eq!(session.undo_depth(), 1);
    let expected = state(
        &context,
        vec![block(heading(6)?, "a🙂", formats()?)?],
        caret(point(0, 0, 3, Affinity::Before)?),
        None,
    )?;
    assert_exact_values(session.state(), &expected);
    session.undo()?.ok_or("undo")?;
    assert_exact_values(session.state(), &before);
    session.redo()?.ok_or("redo")?;
    assert_exact_values(session.state(), &expected);
    Ok(())
}

#[test]
fn seam_typing_uses_focus_affinity_unless_pending_override_exists() -> TestResult {
    let context = context(DocumentLimits::default())?;
    for affinity in [Affinity::Before, Affinity::After] {
        for pending in [None, Some(FormatSet::default()), Some(formats()?)] {
            let expected_formats = pending.clone().unwrap_or(if affinity == Affinity::Before {
                formats()?
            } else {
                FormatSet::default()
            });
            let before =
                state(&context, vec![mixed_block()?], caret(point(0, 1, 0, affinity)?), pending)?;
            let mut session = EditorSession::new(before.clone());
            apply(&mut session, "x")?;
            let fragment = TextFragment::try_from_runs(runs(session.state())?)?;
            let (_, tail) = fragment.split_at(TextOffset::try_new(2)?)?;
            let (inserted, _) = tail.split_at(TextOffset::try_new(1)?)?;
            assert_eq!(inserted, TextFragment::from(TextRun::try_new("x", expected_formats)?));
            assert_eq!(session.state().pending_formats(), None);
            let after = session.state().clone();
            session.undo()?.ok_or("undo")?;
            assert_exact_values(session.state(), &before);
            session.redo()?.ok_or("redo")?;
            assert_exact_values(session.state(), &after);
        }
    }
    Ok(())
}

#[test]
fn type_over_is_spatial_not_directional_and_restores_selection_on_undo() -> TestResult {
    let context = context(DocumentLimits::default())?;
    for backward in [false, true] {
        let start = point(0, 0, 1, Affinity::After)?;
        let end = point(0, 1, 1, Affinity::Before)?;
        let selection = if backward {
            RangeSelection::new(end, start)
        } else {
            RangeSelection::new(start, end)
        };
        let before = state(&context, vec![mixed_block()?], Selection::Range(selection), None)?;
        let mut session = EditorSession::new(before.clone());
        apply(&mut session, "🙂")?;
        assert_eq!(
            runs(session.state())?,
            vec![
                TextRun::try_new("a🙂", formats()?)?,
                TextRun::try_new("D", FormatSet::default())?
            ]
        );
        // Canonical seam point is the right leaf; affinity remains attached left.
        assert_eq!(session.state().selection(), Some(&caret(point(0, 1, 0, Affinity::Before)?)));
        session.undo()?.ok_or("undo")?;
        assert_exact_values(session.state(), &before);
    }
    Ok(())
}

fn assert_disabled(before: &EditorState, code: &str) -> TestResult {
    let evaluation =
        InsertTextBlockTextAction.evaluate(before, &InsertTextInput::try_new("xy")?)?;
    assert!(
        matches!(evaluation.decision(), ActionDecision::Disabled(reason) if reason.code().as_str() == code),
        "{evaluation:?}"
    );
    let mut session = EditorSession::new(before.clone());
    let prepared = registry()?.prepare(session.state(), &invocation("xy")?)?;
    assert!(session.execute_prepared_action(prepared).is_err());
    assert_eq!(session.state(), before);
    assert_eq!(session.undo_depth(), 0);
    Ok(())
}

#[test]
fn unsupported_states_are_disabled_without_mutation() -> TestResult {
    let context = context(DocumentLimits::default())?;
    let no_selection = state(&context, vec![block(heading(1)?, "a", formats()?)?], None, None)?;
    assert_disabled(&no_selection, "breditor/no-selection")?;
    let cross = state(
        &context,
        vec![
            block(heading(1)?, "a", formats()?)?,
            block(TextBlockKind::Paragraph, "b", formats()?)?,
        ],
        Selection::Range(RangeSelection::new(
            point(0, 0, 0, Affinity::Before)?,
            point(1, 0, 1, Affinity::After)?,
        )),
        None,
    )?;
    assert!(matches!(
        InsertTextBlockTextAction.evaluate(&cross, &InsertTextInput::try_new("x")?)?.decision(),
        ActionDecision::Enabled(_)
    ));
    let base = EditorContext::new(CompiledSchema::breditor_base(), DocumentLimits::default());
    let before = state(
        &base,
        vec![block(TextBlockKind::Paragraph, "a", FormatSet::default())?],
        caret(point(0, 0, 1, Affinity::After)?),
        None,
    )?;
    assert_disabled(&before, "breditor/unsupported-schema")?;
    let context = context.with_max_operations_per_transaction(0);
    let before = state(
        &context,
        vec![block(heading(1)?, "a", formats()?)?],
        caret(point(0, 0, 1, Affinity::After)?),
        None,
    )?;
    assert_disabled(&before, "breditor/operation-budget-exceeded")?;
    Ok(())
}

#[test]
fn full_document_and_leaf_limits_disable_before_publication() -> TestResult {
    for limits in [
        DocumentLimits::default().with_max_total_text_bytes(3),
        DocumentLimits::default().with_max_text_bytes(1),
        DocumentLimits::default().with_max_nodes(5),
    ] {
        let context = context(limits)?;
        let before = state(
            &context,
            vec![
                block(heading(1)?, "a", FormatSet::default())?,
                block(TextBlockKind::Paragraph, "b", FormatSet::default())?,
            ],
            caret(point(0, 0, 1, Affinity::Before)?),
            Some(formats()?),
        )?;
        assert_disabled(&before, "breditor/result-limit-exceeded")?;
    }
    Ok(())
}

#[test]
fn heading_rank_counts_toward_property_budget_when_typing_splits_a_run() -> TestResult {
    let context = context(DocumentLimits::default().with_max_property_values(2))?;
    let before = state(
        &context,
        vec![block(heading(1)?, "ab", formats()?)?],
        caret(point(0, 0, 1, Affinity::Before)?),
        Some(FormatSet::default()),
    )?;
    // One heading rank + one link property fit. Inserting plain text in the
    // middle duplicates the link into two runs: the resulting total is three.
    assert_disabled(&before, "breditor/result-limit-exceeded")
}

#[test]
fn stale_preparation_cannot_replace_newer_typing_or_destroy_redo() -> TestResult {
    let context = context(DocumentLimits::default())?;
    let before = state(
        &context,
        vec![block(heading(1)?, "a", formats()?)?],
        caret(point(0, 0, 1, Affinity::Before)?),
        None,
    )?;
    let mut session = EditorSession::new(before);
    let prepared = registry()?.prepare(session.state(), &invocation("stale")?)?;
    apply(&mut session, "b")?;
    session.undo()?.ok_or("undo")?;
    let current = session.state().clone();
    let history = session.history_status();
    assert!(session.execute_prepared_action(prepared).is_err());
    assert_eq!(session.state(), &current);
    assert_eq!(session.history_status(), history);
    session.redo()?.ok_or("redo")?;
    assert_eq!(runs(session.state())?, vec![TextRun::try_new("ab", formats()?)?]);
    Ok(())
}

proptest! {
    #[test]
    fn unicode_type_over_matches_independent_text_and_history(
        chars in prop::collection::vec(prop::sample::select(vec!['a', '🙂', '\u{301}', '界', '\n']), 1..32),
        left in any::<usize>(), right in any::<usize>(), backward in any::<bool>(), rank in 0_u32..7,
    ) {
        let result = (|| -> TestResult {
            let context = context(DocumentLimits::default())?;
            let kind = if rank == 0 { TextBlockKind::Paragraph } else { heading(rank)? };
            let left = left % (chars.len() + 1);
            let right = right % (chars.len() + 1);
            let start = left.min(right);
            let end = left.max(right);
            let start_offset = u32::try_from(chars[..start].iter().map(|c| c.len_utf16()).sum::<usize>())?;
            let end_offset = u32::try_from(chars[..end].iter().map(|c| c.len_utf16()).sum::<usize>())?;
            let first = point(0, 0, start_offset, Affinity::After)?;
            let last = point(0, 0, end_offset, Affinity::Before)?;
            let selection = if backward { RangeSelection::new(last, first) } else { RangeSelection::new(first, last) };
            let before = state(&context, vec![block(kind, &chars.iter().collect::<String>(), formats()?)?], Selection::Range(selection), None)?;
            let mut session = EditorSession::new(before.clone());
            apply(&mut session, "🙂!")?;
            let expected_text = chars[..start].iter().collect::<String>() + "🙂!" + &chars[end..].iter().collect::<String>();
            let expected = state(&context, vec![block(kind, &expected_text, formats()?)?], caret(point(0, 0, start_offset + 3, Affinity::Before)?), None)?;
            assert_exact_values(session.state(), &expected);
            session.undo()?.ok_or("undo")?;
            assert_exact_values(session.state(), &before);
            session.redo()?.ok_or("redo")?;
            assert_exact_values(session.state(), &expected);
            Ok(())
        })();
        prop_assert!(result.is_ok(), "{result:?}");
    }
}
