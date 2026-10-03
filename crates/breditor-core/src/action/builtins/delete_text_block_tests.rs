//! Registry/session qualification for heading-aware deletion.
use super::*;
use crate::{
    action::{Action, ActionDecision, ActionId, ActionInvocation},
    block::TextBlockKind,
    codec::structural_codec_test_support::{TestResult, block, context, formats, heading, state},
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
fn exact(actual: &EditorState, expected: &EditorState) {
    assert_eq!(actual.document(), expected.document());
    assert_eq!(actual.selection(), expected.selection());
    assert_eq!(actual.pending_formats(), expected.pending_formats());
}
fn with_runs(kind: TextBlockKind, runs: &[(&str, FormatSet)]) -> Result<NodeRef, Box<dyn Error>> {
    let template = block(kind, "", FormatSet::default())?;
    let children = runs
        .iter()
        .map(|(text, formats)| {
            TextNode::try_new((*text).to_owned(), formats.clone()).map(NodeRef::text)
        })
        .collect::<Result<Vec<_>, _>>()?;
    Ok(NodeRef::element(template.as_element().ok_or("template")?.try_with_children(children)?))
}

#[test]
fn all_ranks_delete_complete_graphemes_and_restore_exact_history() -> TestResult {
    let context = context(DocumentLimits::default())?;
    for rank in 0..=6 {
        let kind = if rank == 0 { TextBlockKind::Paragraph } else { heading(rank)? };
        for cluster in ["🙂", "e\u{301}", "👨‍👩‍👧‍👦", "🇺🇸", "👍🏽", "\r\n"]
        {
            for backward in [false, true] {
                let offset =
                    if backward { 1 + u32::try_from(cluster.encode_utf16().count())? } else { 1 };
                let before = state(
                    &context,
                    vec![block(kind, &format!("a{cluster}b"), formats()?)?],
                    caret(point(0, 0, offset, Affinity::Before)?),
                    Some(FormatSet::default()),
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
                    vec![block(kind, "ab", formats()?)?],
                    caret(point(
                        0,
                        0,
                        1,
                        if backward { Affinity::After } else { Affinity::Before },
                    )?),
                    before.pending_formats().cloned(),
                )?;
                exact(session.state(), &expected);
                session.undo()?.ok_or("undo")?;
                exact(session.state(), &before);
                session.redo()?.ok_or("redo")?;
                exact(session.state(), &expected);
            }
        }
    }
    Ok(())
}

#[test]
fn format_seams_do_not_split_graphemes_and_empty_heading_keeps_rank() -> TestResult {
    let context = context(DocumentLimits::default())?;
    for backward in [false, true] {
        let before = state(
            &context,
            vec![with_runs(heading(3)?, &[("e", formats()?), ("\u{301}", FormatSet::default())])?],
            caret(if backward {
                point(0, 1, 1, Affinity::After)?
            } else {
                point(0, 0, 0, Affinity::After)?
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
        let expected = state(
            &context,
            vec![block(heading(3)?, "", FormatSet::default())?],
            caret(Point::Children {
                parent_path: NodePath::try_from_indices(vec![0])?,
                child_index: 0,
                affinity: if backward { Affinity::After } else { Affinity::Before },
            }),
            Some(formats()?),
        )?;
        exact(session.state(), &expected);
        session.undo()?.ok_or("undo")?;
        exact(session.state(), &before);
    }
    Ok(())
}

#[test]
fn deletion_snaps_new_regional_indicator_cluster_in_directional_policy() -> TestResult {
    let context = context(DocumentLimits::default())?;
    for backward in [false, true] {
        let before = state(
            &context,
            vec![block(heading(5)?, "🇦x🇧", formats()?)?],
            caret(point(0, 0, if backward { 3 } else { 2 }, Affinity::After)?),
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
            vec![block(heading(5)?, "🇦🇧", formats()?)?],
            caret(point(
                0,
                0,
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
fn every_deletion_action_uses_exact_spatial_selection_not_grapheme_expansion() -> TestResult {
    let context = context(DocumentLimits::default())?;
    for id in [
        delete_text_block_backward_action_id(),
        delete_text_block_forward_action_id(),
        delete_text_block_selection_action_id(),
    ] {
        for backward in [false, true] {
            let start = point(0, 0, 1, Affinity::Before)?;
            let end = point(0, 0, 2, Affinity::After)?;
            let selection = if backward {
                RangeSelection::new(end, start)
            } else {
                RangeSelection::new(start, end)
            };
            let before = state(
                &context,
                vec![block(heading(2)?, "e\u{301}🙂", formats()?)?],
                Selection::Range(selection),
                None,
            )?;
            let mut session = EditorSession::new(before.clone());
            apply(&mut session, id.clone())?;
            let expected = state(
                &context,
                vec![block(heading(2)?, "e🙂", formats()?)?],
                caret(point(0, 0, 1, Affinity::After)?),
                None,
            )?;
            exact(session.state(), &expected);
            session.undo()?.ok_or("undo")?;
            exact(session.state(), &before);
        }
    }
    Ok(())
}

#[test]
fn interior_cluster_carets_and_unsupported_boundaries_are_disabled() -> TestResult {
    let context = context(DocumentLimits::default())?;
    let before = state(
        &context,
        vec![block(heading(1)?, "e\u{301}", formats()?)?],
        caret(point(0, 0, 1, Affinity::After)?),
        None,
    )?;
    for evaluation in [
        DeleteTextBlockBackwardAction.evaluate(&before, &())?,
        DeleteTextBlockForwardAction.evaluate(&before, &())?,
    ] {
        assert!(
            matches!(evaluation.decision(), ActionDecision::Disabled(reason) if reason.code().as_str() == "breditor/caret-not-grapheme-boundary")
        );
    }
    for (index, offset, backward, code) in [
        (0, 0, true, "breditor/at-document-start"),
        (1, 1, false, "breditor/at-document-end"),
        (0, 1, false, "breditor/unsupported-block-boundary"),
        (1, 0, true, "breditor/unsupported-block-boundary"),
    ] {
        let before = state(
            &context,
            vec![block(heading(1)?, "a", formats()?)?, block(heading(2)?, "b", formats()?)?],
            caret(point(index, 0, offset, Affinity::After)?),
            None,
        )?;
        let evaluation = if backward {
            DeleteTextBlockBackwardAction.evaluate(&before, &())?
        } else {
            DeleteTextBlockForwardAction.evaluate(&before, &())?
        };
        assert!(
            matches!(evaluation.decision(), ActionDecision::Disabled(reason) if reason.code().as_str() == code)
        );
        let mut session = EditorSession::new(before.clone());
        assert!(
            apply(
                &mut session,
                if backward {
                    delete_text_block_backward_action_id()
                } else {
                    delete_text_block_forward_action_id()
                }
            )
            .is_err()
        );
        assert_eq!(session.state(), &before);
    }
    Ok(())
}

#[test]
fn deletion_can_exceed_leaf_budget_when_retained_format_seams_merge() -> TestResult {
    let context = context(DocumentLimits::default().with_max_text_bytes(2))?;
    let before = state(
        &context,
        vec![with_runs(
            heading(2)?,
            &[("aa", formats()?), ("x", FormatSet::default()), ("bb", formats()?)],
        )?],
        caret(point(0, 1, 1, Affinity::After)?),
        None,
    )?;
    let evaluation = DeleteTextBlockBackwardAction.evaluate(&before, &())?;
    assert!(
        matches!(evaluation.decision(), ActionDecision::Disabled(reason) if reason.code().as_str() == "breditor/result-limit-exceeded")
    );
    let mut session = EditorSession::new(before.clone());
    assert!(apply(&mut session, delete_text_block_backward_action_id()).is_err());
    assert_eq!(session.state(), &before);
    assert_eq!(session.undo_depth(), 0);
    Ok(())
}

#[test]
fn repeated_directional_deletion_merges_and_stale_preparation_preserves_redo() -> TestResult {
    let context = context(DocumentLimits::default())?;
    for backward in [false, true] {
        let before = state(
            &context,
            vec![block(heading(4)?, "abc", formats()?)?],
            caret(point(0, 0, if backward { 3 } else { 0 }, Affinity::After)?),
            Some(formats()?),
        )?;
        let mut session = EditorSession::new(before.clone());
        let id = if backward {
            delete_text_block_backward_action_id()
        } else {
            delete_text_block_forward_action_id()
        };
        let stale =
            registry()?.prepare(session.state(), &ActionInvocation::without_input(id.clone()))?;
        apply(&mut session, id.clone())?;
        apply(&mut session, id)?;
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
    }
    Ok(())
}

#[test]
fn selection_deletion_is_an_independent_history_event_and_cross_block_rejects() -> TestResult {
    let context = context(DocumentLimits::default())?;
    for cross in [false, true] {
        let before = state(
            &context,
            vec![block(heading(1)?, "ab", formats()?)?, block(heading(2)?, "cd", formats()?)?],
            Selection::Range(RangeSelection::new(
                point(0, 0, 0, Affinity::Before)?,
                point(u32::from(cross), 0, 1, Affinity::After)?,
            )),
            None,
        )?;
        for evaluation in [
            DeleteTextBlockBackwardAction.evaluate(&before, &())?,
            DeleteTextBlockForwardAction.evaluate(&before, &())?,
            DeleteTextBlockSelectionAction.evaluate(&before, &())?,
        ] {
            if cross {
                assert!(
                    matches!(evaluation.decision(), ActionDecision::Disabled(reason) if reason.code().as_str() == "breditor/unsupported-cross-block-selection")
                );
            } else {
                let ActionDecision::Enabled(plan) = evaluation.decision() else {
                    return Err("selection unexpectedly disabled".into());
                };
                assert_eq!(plan.history(), &crate::transaction::HistoryIntent::Record);
            }
        }
    }
    Ok(())
}

#[test]
fn missing_selection_collapsed_selection_and_zero_operation_budget_are_disabled() -> TestResult {
    let context = context(DocumentLimits::default())?;
    let before = state(&context, vec![block(heading(1)?, "a", formats()?)?], None, None)?;
    for evaluation in [
        DeleteTextBlockBackwardAction.evaluate(&before, &())?,
        DeleteTextBlockForwardAction.evaluate(&before, &())?,
        DeleteTextBlockSelectionAction.evaluate(&before, &())?,
    ] {
        assert!(
            matches!(evaluation.decision(), ActionDecision::Disabled(reason) if reason.code().as_str() == "breditor/no-selection")
        );
    }
    let before = state(
        &context,
        vec![block(heading(1)?, "a", formats()?)?],
        caret(point(0, 0, 0, Affinity::After)?),
        None,
    )?;
    assert!(
        matches!(DeleteTextBlockSelectionAction.evaluate(&before, &())?.decision(), ActionDecision::Disabled(reason) if reason.code().as_str() == "breditor/collapsed-selection")
    );
    let context = context.with_max_operations_per_transaction(0);
    let before = state(
        &context,
        vec![block(heading(1)?, "ab", formats()?)?],
        caret(point(0, 0, 1, Affinity::After)?),
        None,
    )?;
    for evaluation in [
        DeleteTextBlockBackwardAction.evaluate(&before, &())?,
        DeleteTextBlockForwardAction.evaluate(&before, &())?,
    ] {
        assert!(
            matches!(evaluation.decision(), ActionDecision::Disabled(reason) if reason.code().as_str() == "breditor/operation-budget-exceeded")
        );
    }
    Ok(())
}

proptest! {
    #[test]
    fn directional_grapheme_deletion_matches_independent_expected_text(
        prefix in "[a-z]{0,16}", suffix in "[a-z]{1,16}", backward in any::<bool>(),
        rank in 1_u32..7,
        cluster in prop::sample::select(vec!["🙂", "e\u{301}", "👨‍👩‍👧‍👦", "🇺🇸", "👍🏽", "\r\n"]),
    ) {
        let result = (|| -> TestResult {
            let context = context(DocumentLimits::default())?;
            let kind = heading(rank)?;
            let offset = u32::try_from(prefix.len() + if backward { cluster.encode_utf16().count() } else { 0 })?;
            let before = state(&context, vec![block(kind, &format!("{prefix}{cluster}{suffix}"), formats()?)?], caret(point(0, 0, offset, Affinity::After)?), None)?;
            let mut session = EditorSession::new(before.clone());
            apply(&mut session, if backward { delete_text_block_backward_action_id() } else { delete_text_block_forward_action_id() })?;
            let expected = state(&context, vec![block(kind, &format!("{prefix}{suffix}"), formats()?)?], caret(point(0, 0, u32::try_from(prefix.len())?, if backward { Affinity::After } else { Affinity::Before })?), None)?;
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
