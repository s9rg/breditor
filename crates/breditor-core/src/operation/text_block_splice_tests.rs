//! Heading/paragraph text edit invariants before action or wire exposure.
use super::*;
use crate::{
    block::TextBlockKind,
    codec::{
        OperationJsonCodec, OperationJsonCodecV2, OperationJsonCodecV3, OperationJsonCodecV4,
        structural_codec_test_support::{
            TestResult, block, context, fixture, formats, heading, state,
        },
    },
    document::{FormatSet, TextFragment, TextRun},
    position::{NodePath, TextOffset},
    schema::{CompiledSchema, DocumentLimits},
    session::EditorSession,
    state::EditorContext,
    transaction::Transaction,
};
use proptest::prelude::*;
use std::error::Error;

fn range(index: u32, start: u64, end: u64) -> Result<TextRange, Box<dyn Error>> {
    Ok(TextRange::try_new(
        NodePath::try_from_indices(vec![index])?,
        TextOffset::try_new(start)?,
        TextOffset::try_new(end)?,
    )?)
}
fn text(value: &str) -> Result<TextFragment, Box<dyn Error>> {
    if value.is_empty() {
        Ok(TextFragment::empty())
    } else {
        Ok(TextFragment::from(TextRun::try_new(value, formats()?)?))
    }
}

#[test]
fn all_ranks_preserve_kind_typed_formats_selection_and_exact_history() -> TestResult {
    let (context, selected, _) = fixture()?;
    for rank in 0..=6 {
        let kind = if rank == 0 { TextBlockKind::Paragraph } else { heading(rank)? };
        let before = state(
            &context,
            vec![block(kind, "a🙂e\u{301}", formats()?)?],
            selected.selection().cloned(),
            selected.pending_formats().cloned(),
        )?;
        let splice =
            TextBlockSplice::capture(&context, before.document(), range(0, 1, 3)?, text("Z")?)?;
        let operation = Operation::TextBlockSplice(splice);
        operation.validate(&context)?;
        let mut session = EditorSession::new(before.clone());
        session.apply_transaction(&Transaction::new(&before, vec![operation]))?;
        let expected = state(
            &context,
            vec![block(kind, "aZe\u{301}", formats()?)?],
            before.selection().cloned(),
            before.pending_formats().cloned(),
        )?;
        assert_eq!(session.state().document(), expected.document());
        assert_eq!(session.state().selection(), before.selection());
        assert_eq!(session.state().pending_formats(), before.pending_formats());
        let after = session.state().clone();
        session.undo()?.ok_or("undo")?;
        assert_eq!(session.state().document(), before.document());
        assert_eq!(session.state().selection(), before.selection());
        session.redo()?.ok_or("redo")?;
        assert_eq!(session.state().document(), after.document());
    }
    Ok(())
}

#[test]
fn stale_source_rank_or_disjoint_text_rejects_atomically() -> TestResult {
    let (context, before, _) = fixture()?;
    let edit = TextBlockSplice::capture(&context, before.document(), range(0, 0, 0)?, text("x")?)?;
    for changed in [
        block(heading(1)?, "a🙂e\u{301}", formats()?)?,
        block(TextBlockKind::Paragraph, "a🙂changed", formats()?)?,
    ] {
        let current = state(
            &context,
            vec![changed],
            before.selection().cloned(),
            before.pending_formats().cloned(),
        )?;
        assert!(matches!(
            edit.apply(&context, current.document()),
            Err(TextBlockSpliceError::ExpectedMismatch)
        ));
    }
    let mut session = EditorSession::new(before.clone());
    session.apply_transaction(&Transaction::new(
        &before,
        vec![Operation::TextBlockSplice(edit.clone())],
    ))?;
    session.undo()?.ok_or("undo")?;
    let current = session.state().clone();
    let invalid = Transaction::new(
        &current,
        vec![Operation::TextBlockSplice(edit.clone()), Operation::TextBlockSplice(edit)],
    );
    assert!(session.apply_transaction(&invalid).is_err());
    assert_eq!(session.state(), &current);
    assert_eq!(session.redo_depth(), 1);
    Ok(())
}

#[test]
fn unrelated_siblings_are_not_part_of_the_source_guard() -> TestResult {
    let context = context(DocumentLimits::default())?;
    let first = block(heading(3)?, "abc", formats()?)?;
    let before = state(
        &context,
        vec![first.clone(), block(TextBlockKind::Paragraph, "x", formats()?)?],
        None,
        None,
    )?;
    let edit = TextBlockSplice::capture(&context, before.document(), range(0, 0, 1)?, text("Z")?)?;
    let current =
        state(&context, vec![first, block(heading(6)?, "changed", formats()?)?], None, None)?;
    let mut session = EditorSession::new(current);
    session.apply_transaction(&Transaction::new(
        session.state(),
        vec![Operation::TextBlockSplice(edit)],
    ))?;
    let expected = state(
        &context,
        vec![block(heading(3)?, "Zbc", formats()?)?, block(heading(6)?, "changed", formats()?)?],
        None,
        None,
    )?;
    assert_eq!(session.state().document(), expected.document());
    Ok(())
}

#[test]
fn empty_heading_insert_delete_and_noop_keep_the_rank() -> TestResult {
    let context = context(DocumentLimits::default())?;
    let before = state(&context, vec![block(heading(4)?, "", FormatSet::default())?], None, None)?;
    let mut session = EditorSession::new(before.clone());
    let insert =
        TextBlockSplice::capture(&context, before.document(), range(0, 0, 0)?, text("🙂")?)?;
    session.apply_transaction(&Transaction::new(
        session.state(),
        vec![Operation::TextBlockSplice(insert)],
    ))?;
    let delete =
        TextBlockSplice::capture(&context, session.state().document(), range(0, 0, 2)?, text("")?)?;
    session.apply_transaction(&Transaction::new(
        session.state(),
        vec![Operation::TextBlockSplice(delete)],
    ))?;
    assert_eq!(session.state().document(), before.document());
    let noop =
        TextBlockSplice::capture(&context, session.state().document(), range(0, 0, 0)?, text("")?)?;
    let current = session.state().clone();
    assert!(
        session
            .apply_transaction(&Transaction::new(&current, vec![Operation::TextBlockSplice(noop)]))?
            .is_unchanged()
    );
    assert_eq!(session.state(), &current);
    Ok(())
}

#[test]
fn invalid_unicode_bounds_targets_and_foreign_proofs_fail() -> TestResult {
    let (context, before, _) = fixture()?;
    for invalid in [
        range(0, 2, 2)?,
        range(0, 0, 99)?,
        range(8, 0, 0)?,
        TextRange::try_new(NodePath::root(), TextOffset::ZERO, TextOffset::ZERO)?,
        TextRange::try_new(
            NodePath::try_from_indices(vec![0, 0])?,
            TextOffset::ZERO,
            TextOffset::ZERO,
        )?,
    ] {
        assert!(
            TextBlockSplice::capture(&context, before.document(), invalid, text("x")?).is_err()
        );
    }
    let foreign =
        super::super::codec::structural_codec_test_support::context(DocumentLimits::default())?;
    assert!(
        TextBlockSplice::capture(&foreign, before.document(), range(0, 0, 0)?, text("x")?).is_err()
    );
    let legacy = EditorContext::new(CompiledSchema::breditor_base(), DocumentLimits::default());
    assert!(matches!(
        TextBlockSplice::capture(&legacy, before.document(), range(0, 0, 0)?, text("x")?),
        Err(TextBlockSpliceError::UnsupportedSchema)
    ));
    Ok(())
}

#[test]
fn full_result_budget_counts_unchanged_siblings_and_preserves_state() -> TestResult {
    let context = context(DocumentLimits::default().with_max_total_text_bytes(4))?;
    let before = state(
        &context,
        vec![
            block(heading(1)?, "a", FormatSet::default())?,
            block(TextBlockKind::Paragraph, "bbb", FormatSet::default())?,
        ],
        None,
        None,
    )?;
    let edit = TextBlockSplice::capture(
        &context,
        before.document(),
        range(0, 1, 1)?,
        TextFragment::from(TextRun::try_new("x", FormatSet::default())?),
    )?;
    let mut session = EditorSession::new(before.clone());
    assert!(
        session
            .apply_transaction(&Transaction::new(&before, vec![Operation::TextBlockSplice(edit)]))
            .is_err()
    );
    assert_eq!(session.state(), &before);
    assert_eq!(session.undo_depth(), 0);
    Ok(())
}

#[test]
fn no_existing_durable_format_silently_accepts_the_new_primitive() -> TestResult {
    let (context, before, _) = fixture()?;
    let operation = Operation::TextBlockSplice(TextBlockSplice::capture(
        &context,
        before.document(),
        range(0, 1, 3)?,
        text("x")?,
    )?);
    assert!(OperationJsonCodec::new(context.clone()).encode(&operation).is_err());
    assert!(OperationJsonCodecV2::new(context.clone()).encode(&operation).is_err());
    assert!(OperationJsonCodecV3::new(context.clone()).encode(&operation).is_err());
    assert!(OperationJsonCodecV4::new(context).encode(&operation).is_err());
    Ok(())
}

#[test]
fn format_only_edit_preserves_backward_selection_and_replays_exact_formats() -> TestResult {
    use crate::{
        position::{Affinity, Point},
        selection::{RangeSelection, Selection},
    };
    let context = context(DocumentLimits::default())?;
    let point = |offset| -> Result<Point, Box<dyn Error>> {
        Ok(Point::Text {
            text_path: NodePath::try_from_indices(vec![0, 0])?,
            utf16_offset: offset,
            affinity: Affinity::Before,
        })
    };
    let selection = Selection::Range(RangeSelection::new(point(4)?, point(1)?));
    let before = state(&context, vec![block(heading(2)?, "a🙂z", formats()?)?], selection, None)?;
    let replacement = TextFragment::from(TextRun::try_new("a🙂z", FormatSet::default())?);
    let edit = TextBlockSplice::capture(&context, before.document(), range(0, 0, 4)?, replacement)?;
    let mut session = EditorSession::new(before.clone());
    session
        .apply_transaction(&Transaction::new(&before, vec![Operation::TextBlockSplice(edit)]))?;
    assert_eq!(session.state().selection(), before.selection());
    session.undo()?.ok_or("undo")?;
    assert_eq!(session.state().document(), before.document());
    assert_eq!(session.state().selection(), before.selection());
    Ok(())
}

proptest! {
    #[test]
    fn randomized_text_block_splices_restore_exact_typed_content(
        rank in 0_u32..=6,
        original in prop::collection::vec(prop::sample::select(vec!['a','🙂','e','\u{301}','界','\n']),0..20),
        replacement in prop::collection::vec(prop::sample::select(vec!['Z','🚀','\u{301}','\n']),0..12),
        start in 0_usize..30, width in 0_usize..30
    ) {
        let result = (|| -> TestResult {
            let context = context(DocumentLimits::default())?;
            let original: String = original.into_iter().collect();
            let replacement: String = replacement.into_iter().collect();
            let kind = if rank == 0 {TextBlockKind::Paragraph} else {heading(rank)?};
            let before = state(&context,vec![block(kind,&original,formats()?)?],None,None)?;
            let mut boundaries = original.char_indices().map(|(offset,_)|offset).collect::<Vec<_>>();
            boundaries.push(original.len());
            let start_index = start.min(boundaries.len()-1);
            let end_index = (start_index+width).min(boundaries.len()-1);
            let start = boundaries[start_index];
            let end = boundaries[end_index];
            let edit = TextBlockSplice::capture(&context,before.document(),range(0,
                u64::try_from(original[..start].encode_utf16().count())?,
                u64::try_from(original[..end].encode_utf16().count())?)?,text(&replacement)?)?;
            let mut session = EditorSession::new(before.clone());
            let outcome = session.apply_transaction(&Transaction::new(&before,vec![Operation::TextBlockSplice(edit)]))?;
            let expected_text = format!("{}{}{}",&original[..start],replacement,&original[end..]);
            let expected = state(&context,vec![block(kind,&expected_text,formats()?)?],None,None)?;
            assert_eq!(session.state().document(),expected.document());
            if !outcome.is_unchanged() {
                session.undo()?.ok_or("undo")?;
                assert_eq!(session.state().document(),before.document());
                session.redo()?.ok_or("redo")?;
                assert_eq!(session.state().document(),expected.document());
            }
            Ok(())
        })();
        result.map_err(|error|TestCaseError::fail(error.to_string()))?;
    }
}
