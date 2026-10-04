//! Split/join/mixed-kind replacement and inverse contracts.
use super::*;
use crate::{
    block::TextBlockKind,
    codec::{
        OperationJsonCodec, OperationJsonCodecV2, OperationJsonCodecV3, OperationJsonCodecV4,
        structural_codec_test_support::{TestResult, block, context, formats, heading, state},
    },
    document::FormatSet,
    position::{Affinity, NodePath, Point, TextOffset},
    schema::DocumentLimits,
    selection::{RangeSelection, Selection},
    session::EditorSession,
    state::EditorState,
    transaction::Transaction,
};
use proptest::prelude::*;
use std::error::Error;

fn range(first: u32, start: u64, last: u32, end: u64) -> Result<RootTextRange, Box<dyn Error>> {
    Ok(RootTextRange::try_new(
        RootTextBoundary::try_new(
            NodePath::try_from_indices(vec![first])?,
            TextOffset::try_new(start)?,
        )?,
        RootTextBoundary::try_new(
            NodePath::try_from_indices(vec![last])?,
            TextOffset::try_new(end)?,
        )?,
    )?)
}
fn point(index: u32, offset: u32, affinity: Affinity) -> Result<Point, Box<dyn Error>> {
    Ok(Point::Text {
        text_path: NodePath::try_from_indices(vec![index, 0])?,
        utf16_offset: offset,
        affinity,
    })
}
fn exact(actual: &EditorState, expected: &EditorState) {
    assert_eq!(actual.document(), expected.document());
    assert_eq!(actual.selection(), expected.selection());
    assert_eq!(actual.pending_formats(), expected.pending_formats());
}

#[test]
fn format_only_cross_block_replace_preserves_interior_selection() -> TestResult {
    let context = context(DocumentLimits::default())?;
    let before = state(
        &context,
        vec![
            block(heading(1)?, "a🙂b", formats()?)?,
            block(heading(2)?, "e\u{301}z", formats()?)?,
            block(TextBlockKind::Paragraph, "tail", formats()?)?,
        ],
        Selection::Range(RangeSelection::new(
            point(1, 2, Affinity::Before)?,
            point(0, 3, Affinity::After)?,
        )),
        None,
    )?;
    let operation = TextBlockReplace::capture(
        &context,
        before.document(),
        range(0, 0, 2, 4)?,
        vec![
            block(heading(1)?, "a🙂b", FormatSet::default())?,
            block(heading(2)?, "e\u{301}z", FormatSet::default())?,
            block(TextBlockKind::Paragraph, "tail", FormatSet::default())?,
        ],
    )?;
    let mut session = EditorSession::new(before.clone());
    session.apply_transaction(&Transaction::new(
        &before,
        vec![Operation::TextBlockReplace(operation)],
    ))?;
    assert_eq!(session.state().selection(), before.selection());
    assert_eq!(session.state().pending_formats(), before.pending_formats());
    let after = session.state().clone();
    session.undo()?.ok_or("undo")?;
    exact(session.state(), &before);
    session.redo()?.ok_or("redo")?;
    exact(session.state(), &after);
    Ok(())
}

#[test]
fn join_all_rank_pairs_restores_individual_kinds_and_directional_selection() -> TestResult {
    let context = context(DocumentLimits::default())?;
    for left in 0..=6 {
        for right in 0..=6 {
            let left = if left == 0 { TextBlockKind::Paragraph } else { heading(left)? };
            let right = if right == 0 { TextBlockKind::Paragraph } else { heading(right)? };
            let before = state(
                &context,
                vec![block(left, "a🙂", formats()?)?, block(right, "e\u{301}b", formats()?)?],
                Selection::Range(RangeSelection::new(
                    point(1, 3, Affinity::After)?,
                    point(0, 0, Affinity::Before)?,
                )),
                None,
            )?;
            let op = TextBlockReplace::capture(
                &context,
                before.document(),
                range(0, 3, 1, 0)?,
                vec![block(left, "", FormatSet::default())?],
            )?;
            let mut session = EditorSession::new(before.clone());
            session.apply_transaction(&Transaction::new(
                &before,
                vec![Operation::TextBlockReplace(op)],
            ))?;
            let expected = state(
                &context,
                vec![block(left, "a🙂e\u{301}b", formats()?)?],
                Selection::Range(RangeSelection::new(
                    point(0, 6, Affinity::After)?,
                    point(0, 0, Affinity::Before)?,
                )),
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
fn split_heading_retains_prefix_suffix_and_relocates_following_siblings() -> TestResult {
    let context = context(DocumentLimits::default())?;
    let p = point(1, 1, Affinity::After)?;
    let before = state(
        &context,
        vec![
            block(heading(2)?, "a🙂b", formats()?)?,
            block(TextBlockKind::Paragraph, "z", formats()?)?,
        ],
        Selection::Range(RangeSelection::new(p.clone(), p)),
        Some(formats()?),
    )?;
    let op = TextBlockReplace::capture(
        &context,
        before.document(),
        range(0, 1, 0, 1)?,
        vec![block(heading(2)?, "", FormatSet::default())?, block(heading(3)?, "x", formats()?)?],
    )?;
    let mut session = EditorSession::new(before.clone());
    session.apply_transaction(&Transaction::new(&before, vec![Operation::TextBlockReplace(op)]))?;
    let p = point(2, 1, Affinity::After)?;
    let expected = state(
        &context,
        vec![
            block(heading(2)?, "a", formats()?)?,
            block(heading(3)?, "x🙂b", formats()?)?,
            block(TextBlockKind::Paragraph, "z", formats()?)?,
        ],
        Selection::Range(RangeSelection::new(p.clone(), p)),
        Some(formats()?),
    )?;
    exact(session.state(), &expected);
    session.undo()?.ok_or("undo")?;
    exact(session.state(), &before);
    Ok(())
}

#[test]
fn stale_guard_in_late_batch_rolls_back_and_preserves_redo() -> TestResult {
    let context = context(DocumentLimits::default())?;
    let before = state(&context, vec![block(heading(1)?, "ab", formats()?)?], None, None)?;
    let op = TextBlockReplace::capture(
        &context,
        before.document(),
        range(0, 1, 0, 1)?,
        vec![
            block(heading(1)?, "", FormatSet::default())?,
            block(TextBlockKind::Paragraph, "", FormatSet::default())?,
        ],
    )?;
    let mut session = EditorSession::new(before.clone());
    session.apply_transaction(&Transaction::new(
        &before,
        vec![Operation::TextBlockReplace(op.clone())],
    ))?;
    session.undo()?.ok_or("undo")?;
    let current = session.state().clone();
    let history = session.history_status();
    assert!(
        session
            .apply_transaction(&Transaction::new(
                &current,
                vec![Operation::TextBlockReplace(op.clone()), Operation::TextBlockReplace(op)]
            ))
            .is_err()
    );
    assert_eq!(session.state(), &current);
    assert_eq!(session.history_status(), history);
    session.redo()?.ok_or("redo")?;
    Ok(())
}

#[test]
fn retained_siblings_count_toward_full_result_budget() -> TestResult {
    let context = context(DocumentLimits::default().with_max_nodes(5))?;
    let before = state(
        &context,
        vec![
            block(heading(2)?, "ab", formats()?)?,
            block(TextBlockKind::Paragraph, "z", formats()?)?,
        ],
        None,
        None,
    )?;
    let op = TextBlockReplace::capture(
        &context,
        before.document(),
        range(0, 1, 0, 1)?,
        vec![
            block(heading(2)?, "", FormatSet::default())?,
            block(heading(2)?, "", FormatSet::default())?,
        ],
    )?;
    let mut session = EditorSession::new(before.clone());
    assert!(
        session
            .apply_transaction(&Transaction::new(&before, vec![Operation::TextBlockReplace(op)]))
            .is_err()
    );
    assert_eq!(session.state(), &before);
    assert_eq!(session.undo_depth(), 0);
    Ok(())
}

#[test]
fn malformed_spans_surrogates_empty_replacement_and_foreign_proofs_reject() -> TestResult {
    let context = context(DocumentLimits::default())?;
    let before = state(&context, vec![block(heading(2)?, "a🙂b", formats()?)?], None, None)?;
    assert!(range(0, 0, u32::MAX, 0).is_err());
    for invalid in
        [range(0, 2, 0, 2)?, range(0, 0, 5, 0)?, range(0, 0, u32::MAX - 1, 0)?, range(0, 0, 0, 99)?]
    {
        assert!(
            TextBlockReplace::capture(
                &context,
                before.document(),
                invalid,
                vec![block(heading(1)?, "", FormatSet::default())?]
            )
            .is_err()
        );
    }
    assert!(
        TextBlockReplace::capture(&context, before.document(), range(0, 0, 0, 0)?, vec![]).is_err()
    );
    let foreign = crate::codec::structural_codec_test_support::context(DocumentLimits::default())?;
    assert!(matches!(
        TextBlockReplace::capture(
            &foreign,
            before.document(),
            range(0, 0, 0, 0)?,
            vec![block(heading(2)?, "", FormatSet::default())?]
        ),
        Err(TextBlockReplaceError::DocumentProof(_))
    ));
    Ok(())
}

#[test]
fn existing_wire_languages_stay_closed() -> TestResult {
    let context = context(DocumentLimits::default())?;
    let before = state(&context, vec![block(heading(2)?, "ab", formats()?)?], None, None)?;
    let op = Operation::TextBlockReplace(TextBlockReplace::capture(
        &context,
        before.document(),
        range(0, 1, 0, 1)?,
        vec![
            block(heading(2)?, "", FormatSet::default())?,
            block(heading(2)?, "", FormatSet::default())?,
        ],
    )?);
    assert!(OperationJsonCodec::new(context.clone()).encode(&op).is_err());
    assert!(OperationJsonCodecV2::new(context.clone()).encode(&op).is_err());
    assert!(OperationJsonCodecV3::new(context.clone()).encode(&op).is_err());
    assert!(OperationJsonCodecV4::new(context.clone()).encode(&op).is_err());
    Ok(())
}

proptest! {
    #[test]
    fn mixed_block_replacement_matches_independent_text_and_inverse(
        left in "[a-z]{1,20}", right in "[a-z]{1,20}", start in any::<usize>(), end in any::<usize>(),
        a in 1_u32..7, b in 1_u32..7, target in 1_u32..7,
    ) {
        let result = (|| -> TestResult {
            let context = context(DocumentLimits::default())?;
            let start = start % (left.len()+1);
            let end = end % (right.len()+1);
            let before = state(&context, vec![block(heading(a)?, &left, formats()?)?, block(heading(b)?, &right, formats()?)?], None, None)?;
            let op = TextBlockReplace::capture(&context, before.document(), range(0, u64::try_from(start)?, 1, u64::try_from(end)?)?, vec![block(heading(target)?, "🙂", formats()?)?])?;
            let mut session = EditorSession::new(before.clone());
            session.apply_transaction(&Transaction::new(&before, vec![Operation::TextBlockReplace(op)]))?;
            let expected = state(&context, vec![block(heading(target)?, &format!("{}🙂{}", &left[..start], &right[end..]), formats()?)?], None, None)?;
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
