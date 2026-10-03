//! Cross-block typing format inheritance and exact history.
use super::*;
use crate::{
    action::{ActionInput, ActionInvocation, ActionValue},
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
fn apply(session: &mut EditorSession, text: &str) -> TestResult {
    let id = insert_text_block_text_action_id();
    let registry = ActionRegistry::try_new(vec![ActionRegistration::with_input(
        id.clone(),
        insert_text_input_contract(),
        InsertTextBlockTextAction,
    )])?;
    let invocation = ActionInvocation::new(
        id,
        ActionInput::typed(insert_text_input_contract(), ActionValue::try_from_string(text)?),
    );
    let prepared = registry.prepare(session.state(), &invocation)?;
    session.execute_prepared_action(prepared)?;
    Ok(())
}
fn point(block: u32, run: u32, offset: u32) -> Result<Point, Box<dyn Error>> {
    Ok(Point::Text {
        text_path: NodePath::try_from_indices(vec![block, run])?,
        utf16_offset: offset,
        affinity: Affinity::Before,
    })
}
fn empty(index: u32) -> Result<Point, Box<dyn Error>> {
    Ok(Point::Children {
        parent_path: NodePath::try_from_indices(vec![index])?,
        child_index: 0,
        affinity: Affinity::After,
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
fn mixed(runs: &[(&str, FormatSet)]) -> Result<NodeRef, Box<dyn Error>> {
    let template = block(heading(1)?, "", FormatSet::default())?;
    let children = runs
        .iter()
        .map(|(text, format)| {
            TextNode::try_new((*text).to_owned(), format.clone()).map(NodeRef::text)
        })
        .collect::<Result<Vec<_>, _>>()?;
    Ok(NodeRef::element(template.as_element().ok_or("template")?.try_with_children(children)?))
}

#[test]
fn middle_selected_format_wins_over_empty_boundary_fragments_in_both_directions() -> TestResult {
    let context = context(DocumentLimits::default())?;
    for backward in [false, true] {
        let first = point(0, 0, 2)?;
        let last = point(2, 0, 0)?;
        let selection = if backward {
            RangeSelection::new(last, first)
        } else {
            RangeSelection::new(first, last)
        };
        let before = state(
            &context,
            vec![
                block(heading(1)?, "aa", FormatSet::default())?,
                block(heading(3)?, "MM", formats()?)?,
                block(TextBlockKind::Paragraph, "bb", FormatSet::default())?,
            ],
            Selection::Range(selection),
            None,
        )?;
        let mut session = EditorSession::new(before.clone());
        apply(&mut session, "🙂")?;
        let expected = state(
            &context,
            vec![mixed(&[
                ("aa", FormatSet::default()),
                ("🙂", formats()?),
                ("bb", FormatSet::default()),
            ])?],
            caret(point(0, 2, 0)?),
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
fn text_empty_selection_inherits_left_then_right_then_plain_formats() -> TestResult {
    let context = context(DocumentLimits::default())?;
    for (left, right) in [("aa", "bb"), ("", "bb"), ("", "")] {
        let first = if left.is_empty() { empty(0)? } else { point(0, 0, 2)? };
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
        let mut session = EditorSession::new(before.clone());
        apply(&mut session, "X")?;
        let (node, selection) = if left.is_empty() {
            (
                block(
                    heading(1)?,
                    &format!("X{right}"),
                    if right.is_empty() { FormatSet::default() } else { formats()? },
                )?,
                caret(point(0, 0, 1)?),
            )
        } else {
            (mixed(&[("aaX", FormatSet::default()), ("bb", formats()?)])?, caret(point(0, 1, 0)?))
        };
        let expected = state(&context, vec![node], selection, None)?;
        exact(session.state(), &expected);
        session.undo()?.ok_or("undo")?;
        exact(session.state(), &before);
    }
    Ok(())
}

#[test]
fn failed_cross_block_type_over_preserves_the_published_state() -> TestResult {
    let context = context(DocumentLimits::default().with_max_text_bytes(2))?;
    let before = state(
        &context,
        vec![block(heading(1)?, "aa", formats()?)?, block(heading(2)?, "bb", formats()?)?],
        Selection::Range(RangeSelection::new(point(0, 0, 2)?, point(1, 0, 0)?)),
        None,
    )?;
    let mut session = EditorSession::new(before.clone());
    assert!(apply(&mut session, "🙂").is_err());
    assert_eq!(session.state(), &before);
    assert_eq!(session.undo_depth(), 0);
    Ok(())
}

proptest! {
    #[test]
    fn cross_block_type_over_matches_independent_text_and_exact_history(
        left in "[a-z]{1,16}", right in "[a-z]{1,16}", start in any::<usize>(), end in any::<usize>(),
        a in 1_u32..7, b in 1_u32..7, backward in any::<bool>(),
    ) {
        let result = (|| -> TestResult {
            let context = context(DocumentLimits::default())?;
            let start = start % (left.len()+1);
            let end = end % (right.len()+1);
            let first = point(0,0,u32::try_from(start)?)?;
            let last = point(1,0,u32::try_from(end)?)?;
            let selection = if backward { RangeSelection::new(last, first) } else { RangeSelection::new(first, last) };
            let before = state(&context, vec![block(heading(a)?, &left, formats()?)?, block(heading(b)?, &right, formats()?)?], Selection::Range(selection), None)?;
            let mut session = EditorSession::new(before.clone());
            apply(&mut session, "🙂")?;
            let text = format!("{}🙂{}", &left[..start], &right[end..]);
            let expected = state(&context, vec![block(heading(a)?, &text, formats()?)?], caret(point(0,0,u32::try_from(start)?+2)?), None)?;
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
