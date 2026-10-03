//! Structural heading deletion through real action preparation and history.
use super::*;
use crate::{
    action::{Action, ActionDecision, ActionId, ActionInvocation},
    block::TextBlockKind,
    codec::structural_codec_test_support::{TestResult, block, context, formats, heading, state},
    document::FormatSet,
    position::{Affinity, NodePath, Point},
    schema::DocumentLimits,
    selection::{RangeSelection, Selection},
    session::EditorSession,
    state::EditorState,
};
use proptest::prelude::*;
use std::error::Error;

fn registry() -> Result<ActionRegistry, Box<dyn Error>> {
    Ok(ActionRegistry::try_new(vec![
        ActionRegistration::new(
            delete_text_block_backward_action_id(),
            DeleteTextBlockBackwardAction,
        ),
        ActionRegistration::new(
            delete_text_block_forward_action_id(),
            DeleteTextBlockForwardAction,
        ),
        ActionRegistration::new(
            delete_text_block_selection_action_id(),
            DeleteTextBlockSelectionAction,
        ),
    ])?)
}
fn apply(session: &mut EditorSession, id: ActionId) -> TestResult {
    let prepared = registry()?.prepare(session.state(), &ActionInvocation::without_input(id))?;
    session.execute_prepared_action(prepared)?;
    Ok(())
}
fn point(index: u32, text: &str, offset: u32, affinity: Affinity) -> Result<Point, Box<dyn Error>> {
    Ok(if text.is_empty() {
        Point::Children {
            parent_path: NodePath::try_from_indices(vec![index])?,
            child_index: 0,
            affinity,
        }
    } else {
        Point::Text {
            text_path: NodePath::try_from_indices(vec![index, 0])?,
            utf16_offset: offset,
            affinity,
        }
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
fn kind(rank: u32) -> Result<TextBlockKind, Box<dyn Error>> {
    if rank == 0 { Ok(TextBlockKind::Paragraph) } else { heading(rank) }
}

#[test]
fn both_join_directions_all_kind_pairs_and_empty_sides_restore_exact_history() -> TestResult {
    let context = context(DocumentLimits::default())?;
    for left_rank in 0..=6 {
        for right_rank in 0..=6 {
            for left in ["a🙂", ""] {
                for right in ["e\u{301}", ""] {
                    for backward in [false, true] {
                        let left_len = u32::try_from(left.encode_utf16().count())?;
                        let before = state(
                            &context,
                            vec![
                                block(kind(left_rank)?, left, formats()?)?,
                                block(kind(right_rank)?, right, formats()?)?,
                            ],
                            caret(if backward {
                                point(1, right, 0, Affinity::Before)?
                            } else {
                                point(0, left, left_len, Affinity::After)?
                            }),
                            Some(formats()?),
                        )?;
                        let mut session = EditorSession::new(before.clone());
                        apply(
                            &mut session,
                            if backward {
                                delete_text_block_backward_action_id()
                            } else {
                                delete_text_block_forward_action_id()
                            },
                        )?;
                        let text = format!("{left}{right}");
                        let expected = state(
                            &context,
                            vec![block(kind(left_rank)?, &text, formats()?)?],
                            caret(point(
                                0,
                                &text,
                                left_len,
                                if backward { Affinity::After } else { Affinity::Before },
                            )?),
                            Some(formats()?),
                        )?;
                        exact(session.state(), &expected);
                        session.undo()?.ok_or("undo")?;
                        exact(session.state(), &before);
                        session.redo()?.ok_or("redo")?;
                        exact(session.state(), &expected);
                    }
                }
            }
        }
    }
    Ok(())
}

#[test]
fn all_selection_delete_routes_use_spatial_left_kind_and_restore_backward_selection() -> TestResult
{
    let context = context(DocumentLimits::default())?;
    for id in [
        delete_text_block_backward_action_id(),
        delete_text_block_forward_action_id(),
        delete_text_block_selection_action_id(),
    ] {
        for backward in [false, true] {
            let first = point(0, "a🙂x", 3, Affinity::Before)?;
            let last = point(2, "ye\u{301}", 1, Affinity::After)?;
            let selection = if backward {
                RangeSelection::new(last, first)
            } else {
                RangeSelection::new(first, last)
            };
            let before = state(
                &context,
                vec![
                    block(heading(1)?, "a🙂x", formats()?)?,
                    block(heading(4)?, "middle", formats()?)?,
                    block(heading(6)?, "ye\u{301}", formats()?)?,
                ],
                Selection::Range(selection),
                None,
            )?;
            let mut session = EditorSession::new(before.clone());
            apply(&mut session, id.clone())?;
            let expected = state(
                &context,
                vec![block(heading(1)?, "a🙂e\u{301}", formats()?)?],
                caret(point(0, "a🙂e\u{301}", 3, Affinity::After)?),
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
fn joining_regional_indicators_snaps_in_the_requested_deletion_direction() -> TestResult {
    let context = context(DocumentLimits::default())?;
    for backward in [false, true] {
        let before = state(
            &context,
            vec![block(heading(1)?, "🇦", formats()?)?, block(heading(5)?, "🇧", formats()?)?],
            caret(if backward {
                point(1, "🇧", 0, Affinity::After)?
            } else {
                point(0, "🇦", 2, Affinity::Before)?
            }),
            None,
        )?;
        let mut session = EditorSession::new(before.clone());
        apply(
            &mut session,
            if backward {
                delete_text_block_backward_action_id()
            } else {
                delete_text_block_forward_action_id()
            },
        )?;
        let expected = state(
            &context,
            vec![block(heading(1)?, "🇦🇧", formats()?)?],
            caret(point(
                0,
                "🇦🇧",
                if backward { 4 } else { 0 },
                if backward { Affinity::After } else { Affinity::Before },
            )?),
            None,
        )?;
        exact(session.state(), &expected);
        session.undo()?.ok_or("undo")?;
        exact(session.state(), &before);
    }
    Ok(())
}

#[test]
fn invalid_merged_leaf_budget_is_disabled_and_keeps_state() -> TestResult {
    let context = context(DocumentLimits::default().with_max_text_bytes(2))?;
    let before = state(
        &context,
        vec![block(heading(1)?, "aa", formats()?)?, block(heading(2)?, "bb", formats()?)?],
        caret(point(0, "aa", 2, Affinity::After)?),
        None,
    )?;
    let evaluation = DeleteTextBlockForwardAction.evaluate(&before, &())?;
    assert!(
        matches!(evaluation.decision(), ActionDecision::Disabled(reason) if reason.code().as_str() == "breditor/result-limit-exceeded")
    );
    let mut session = EditorSession::new(before.clone());
    assert!(apply(&mut session, delete_text_block_forward_action_id()).is_err());
    assert_eq!(session.state(), &before);
    assert_eq!(session.undo_depth(), 0);
    Ok(())
}

#[test]
fn repeated_joins_merge_and_stale_preparation_preserves_redo() -> TestResult {
    let context = context(DocumentLimits::default())?;
    let before = state(
        &context,
        vec![
            block(heading(2)?, "", FormatSet::default())?,
            block(heading(5)?, "", FormatSet::default())?,
            block(heading(6)?, "", FormatSet::default())?,
        ],
        caret(point(0, "", 0, Affinity::Before)?),
        None,
    )?;
    let mut session = EditorSession::new(before.clone());
    let stale = registry()?.prepare(
        session.state(),
        &ActionInvocation::without_input(delete_text_block_forward_action_id()),
    )?;
    apply(&mut session, delete_text_block_forward_action_id())?;
    apply(&mut session, delete_text_block_forward_action_id())?;
    assert_eq!(session.undo_depth(), 1);
    let after = session.state().clone();
    session.undo()?.ok_or("undo")?;
    exact(session.state(), &before);
    let current = session.state().clone();
    let history = session.history_status();
    assert!(session.execute_prepared_action(stale).is_err());
    assert_eq!(session.state(), &current);
    assert_eq!(session.history_status(), history);
    session.redo()?.ok_or("redo")?;
    exact(session.state(), &after);
    Ok(())
}

proptest! {
    #[test]
    fn selected_deletion_matches_independent_text_for_mixed_kinds(
        left in "[a-z]{1,16}", right in "[a-z]{1,16}", start in any::<usize>(), end in any::<usize>(),
        a in 0_u32..7, b in 0_u32..7, backward in any::<bool>(),
    ) {
        let result = (|| -> TestResult {
            let context = context(DocumentLimits::default())?;
            let start = start % (left.len()+1);
            let end = end % (right.len()+1);
            let first = point(0, &left, u32::try_from(start)?, Affinity::Before)?;
            let last = point(1, &right, u32::try_from(end)?, Affinity::After)?;
            let selection = if backward { RangeSelection::new(last, first) } else { RangeSelection::new(first, last) };
            let before = state(&context, vec![block(kind(a)?, &left, formats()?)?, block(kind(b)?, &right, formats()?)?], Selection::Range(selection), None)?;
            let mut session = EditorSession::new(before.clone());
            apply(&mut session, delete_text_block_selection_action_id())?;
            let text = format!("{}{}", &left[..start], &right[end..]);
            let expected = state(&context, vec![block(kind(a)?, &text, formats()?)?], caret(point(0, &text, u32::try_from(start)?, Affinity::After)?), None)?;
            exact(session.state(), &expected);
            session.undo()?.ok_or("undo")?;
            exact(session.state(), &before);
            session.redo()?.ok_or("redo")?;
            exact(session.state(), &expected);
            Ok(())
        })();
        prop_assert!(result.is_ok(), "{result:?}");
    }
}
