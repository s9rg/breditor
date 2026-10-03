//! End-to-end action/session contracts for heading Enter.
use super::*;
use crate::{
    action::{ActionId, ActionInvocation},
    block::TextBlockKind,
    codec::structural_codec_test_support::{TestResult, block, context, formats, heading, state},
    document::FormatSet,
    position::{Affinity, NodePath, Point},
    schema::DocumentLimits,
    selection::{RangeSelection, Selection},
    session::EditorSession,
    state::EditorState,
};
use std::error::Error;
fn point(offset: u32) -> Result<Point, Box<dyn Error>> {
    Ok(Point::Text {
        text_path: NodePath::try_from_indices(vec![0, 0])?,
        utf16_offset: offset,
        affinity: Affinity::Before,
    })
}
fn caret(point: Point) -> Selection {
    RangeSelection::new(point.clone(), point).into()
}
fn boundary(index: u32) -> Result<Selection, Box<dyn Error>> {
    Ok(caret(Point::Children {
        parent_path: NodePath::try_from_indices(vec![index])?,
        child_index: 0,
        affinity: Affinity::After,
    }))
}
fn apply(session: &mut EditorSession) -> TestResult {
    let id: ActionId = insert_text_block_break_action_id();
    let registry = ActionRegistry::try_new(vec![ActionRegistration::new(
        id.clone(),
        InsertTextBlockBreakAction,
    )])?;
    let prepared = registry.prepare(session.state(), &ActionInvocation::without_input(id))?;
    session.execute_prepared_action(prepared)?;
    Ok(())
}
fn exact(actual: &EditorState, expected: &EditorState) {
    assert_eq!(actual.document(), expected.document());
    assert_eq!(actual.selection(), expected.selection());
    assert_eq!(actual.pending_formats(), expected.pending_formats());
}

#[test]
fn enter_start_middle_end_and_empty_all_ranks_has_exact_history() -> TestResult {
    let context = context(DocumentLimits::default())?;
    for rank in 1..=6 {
        for (text, offset, left, right) in [
            ("a🙂b", 0, "", "a🙂b"),
            ("a🙂b", 1, "a", "🙂b"),
            ("a🙂b", 4, "a🙂b", ""),
            ("", 0, "", ""),
        ] {
            let before = state(
                &context,
                vec![block(heading(rank)?, text, formats()?)?],
                if text.is_empty() { boundary(0)? } else { caret(point(offset)?) },
                Some(formats()?),
            )?;
            let mut session = EditorSession::new(before.clone());
            apply(&mut session)?;
            let blocks = if text.is_empty() {
                vec![block(TextBlockKind::Paragraph, "", FormatSet::default())?]
            } else {
                vec![
                    block(heading(rank)?, left, formats()?)?,
                    block(
                        if right.is_empty() { TextBlockKind::Paragraph } else { heading(rank)? },
                        right,
                        formats()?,
                    )?,
                ]
            };
            let expected =
                state(&context, blocks, boundary(u32::from(!text.is_empty()))?, Some(formats()?))?;
            exact(session.state(), &expected);
            assert_eq!(session.undo_depth(), 1);
            session.undo()?.ok_or("undo")?;
            exact(session.state(), &before);
            session.redo()?.ok_or("redo")?;
            exact(session.state(), &expected);
        }
    }
    Ok(())
}

#[test]
fn selected_cross_block_break_preserves_both_boundary_kinds_and_direction_on_undo() -> TestResult {
    let context = context(DocumentLimits::default())?;
    for backward in [false, true] {
        let start = point(1)?;
        let end = Point::Text {
            text_path: NodePath::try_from_indices(vec![2, 0])?,
            utf16_offset: 1,
            affinity: Affinity::After,
        };
        let selection = if backward {
            RangeSelection::new(end, start)
        } else {
            RangeSelection::new(start, end)
        };
        let before = state(
            &context,
            vec![
                block(heading(1)?, "ab", formats()?)?,
                block(TextBlockKind::Paragraph, "middle", formats()?)?,
                block(heading(5)?, "cd", formats()?)?,
            ],
            Selection::Range(selection),
            None,
        )?;
        let mut session = EditorSession::new(before.clone());
        apply(&mut session)?;
        let expected = state(
            &context,
            vec![block(heading(1)?, "a", formats()?)?, block(heading(5)?, "d", formats()?)?],
            boundary(1)?,
            None,
        )?;
        exact(session.state(), &expected);
        session.undo()?.ok_or("undo")?;
        exact(session.state(), &before);
        session.redo()?.ok_or("redo")?;
        exact(session.state(), &expected);
    }
    Ok(())
}

#[test]
fn entering_an_empty_paragraph_adds_a_second_paragraph() -> TestResult {
    let context = context(DocumentLimits::default())?;
    let before = state(
        &context,
        vec![block(TextBlockKind::Paragraph, "", FormatSet::default())?],
        boundary(0)?,
        None,
    )?;
    let mut session = EditorSession::new(before.clone());
    apply(&mut session)?;
    let expected = state(
        &context,
        vec![
            block(TextBlockKind::Paragraph, "", FormatSet::default())?,
            block(TextBlockKind::Paragraph, "", FormatSet::default())?,
        ],
        boundary(1)?,
        None,
    )?;
    exact(session.state(), &expected);
    session.undo()?.ok_or("undo")?;
    exact(session.state(), &before);
    Ok(())
}

#[test]
fn enter_rejects_full_tree_and_property_limits_without_mutation() -> TestResult {
    for limits in [
        DocumentLimits::default().with_max_nodes(3),
        DocumentLimits::default().with_max_children_per_element(1),
        DocumentLimits::default().with_max_property_values(2),
    ] {
        let context = context(limits)?;
        let before =
            state(&context, vec![block(heading(1)?, "ab", formats()?)?], caret(point(1)?), None)?;
        let mut session = EditorSession::new(before.clone());
        assert!(apply(&mut session).is_err());
        assert_eq!(session.state(), &before);
        assert_eq!(session.undo_depth(), 0);
    }
    Ok(())
}
