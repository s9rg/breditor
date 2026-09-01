//! Black-box contracts for history replay and composed point relocation.

mod support;

use breditor_core::{
    codec::DocumentJsonCodec,
    document::{Document, FormatSet, TextFragment, TextRun},
    identity::QualifiedName,
    operation::{PointRelocation, RelocationError, TextRange, TextSplice},
    position::{Affinity, Point, PointError, TextOffset},
    selection::{RangeSelection, Selection},
    state::{EditorContext, EditorState, LineageId, Revision},
    transaction::{
        Commit, HistoryIntent, PendingFormatsUpdate, SelectionUpdate, Transaction,
        TransactionOutcome,
    },
};
use support::{TestResult, document_json, paragraph, path, test_error, text_node};

fn state(
    context: &EditorContext,
    text: &str,
    lineage: &str,
    selection: Option<Selection>,
    pending_formats: Option<FormatSet>,
) -> Result<EditorState, Box<dyn std::error::Error>> {
    let document = DocumentJsonCodec::new(context.schema().clone())
        .with_limits(context.limits().clone())
        .decode(&document_json(&[paragraph(&[text_node(text, false)])]))?;
    EditorState::try_new(
        context,
        LineageId::try_new(lineage)?,
        document,
        selection,
        pending_formats,
    )
    .map_err(Into::into)
}

fn text_point(utf16_offset: u32, affinity: Affinity) -> Result<Point, Box<dyn std::error::Error>> {
    Ok(Point::Text { text_path: path(&[0, 0])?, utf16_offset, affinity })
}

fn collapsed_selection(utf16_offset: u32) -> Result<Selection, Box<dyn std::error::Error>> {
    Ok(RangeSelection::new(
        text_point(utf16_offset, Affinity::Before)?,
        text_point(utf16_offset, Affinity::After)?,
    )
    .into())
}

fn offset(value: u64) -> Result<TextOffset, Box<dyn std::error::Error>> {
    TextOffset::try_new(value).map_err(Into::into)
}

fn range(start: u64, end: u64) -> Result<TextRange, Box<dyn std::error::Error>> {
    TextRange::try_new(path(&[0])?, offset(start)?, offset(end)?).map_err(Into::into)
}

fn fragment(text: &str) -> Result<TextFragment, Box<dyn std::error::Error>> {
    Ok(TextRun::try_new(text, FormatSet::default())?.into())
}

fn splice(
    start: u64,
    end: u64,
    expected_removed: TextFragment,
    replacement: TextFragment,
) -> Result<TextSplice, Box<dyn std::error::Error>> {
    TextSplice::try_new(range(start, end)?, expected_removed, replacement).map_err(Into::into)
}

fn committed(outcome: TransactionOutcome) -> Result<Commit, Box<dyn std::error::Error>> {
    outcome.into_commit().ok_or_else(|| test_error("transaction unexpectedly unchanged").into())
}

fn assert_single_text(document: &Document, expected: &str) -> TestResult {
    let Some(paragraph) = document.node_at(&path(&[0])?)?.as_element() else {
        return Err(test_error("paragraph path did not resolve to an element").into());
    };
    assert_eq!(paragraph.children().len(), 1);
    let Some(text) = paragraph.children().get(0).and_then(|child| child.as_text()) else {
        return Err(test_error("paragraph did not contain one text leaf").into());
    };
    assert_eq!(text.text(), expected);
    Ok(())
}

#[test]
fn undo_and_redo_restore_exact_editor_values_with_monotonic_revisions() -> TestResult {
    let context = EditorContext::default();
    let before_selection = collapsed_selection(1)?;
    let before_formats = FormatSet::default();
    let initial = state(
        &context,
        "abc",
        "history",
        Some(before_selection.clone()),
        Some(before_formats.clone()),
    )?;
    let after_selection = collapsed_selection(3)?;
    let insertion = splice(0, 0, TextFragment::empty(), fragment("X")?)?;
    let edit = Transaction::new(&initial, vec![insertion.into()])
        .with_selection_update(SelectionUpdate::Set(Some(after_selection.clone())))
        .with_pending_formats_update(PendingFormatsUpdate::Set(None));
    let edit_commit = committed(edit.apply(&context, &initial)?)?;
    assert_eq!(edit_commit.revision(), Revision::new(1));
    assert_single_text(edit_commit.after().document(), "Xabc")?;
    assert_eq!(edit_commit.after().selection(), Some(&after_selection));
    assert_eq!(edit_commit.after().pending_formats(), None);

    let undo = edit_commit.undo_transaction(edit_commit.after())?;
    assert_eq!(undo.metadata().action().map(QualifiedName::as_str), Some("breditor/undo"));
    assert_eq!(undo.metadata().history(), &HistoryIntent::Ignore);
    let undo_commit = committed(undo.apply(&context, edit_commit.after())?)?;
    assert_eq!(undo_commit.base_revision(), Revision::new(1));
    assert_eq!(undo_commit.revision(), Revision::new(2));
    assert_eq!(undo_commit.after().document(), initial.document());
    assert_eq!(undo_commit.after().selection(), Some(&before_selection));
    assert_eq!(undo_commit.after().pending_formats(), Some(&before_formats));
    assert_eq!(undo_commit.metadata().history(), &HistoryIntent::Ignore);
    assert_ne!(undo_commit.after().snapshot(), initial.snapshot());

    let redo = edit_commit.redo_transaction(undo_commit.after())?;
    assert_eq!(redo.metadata().action().map(QualifiedName::as_str), Some("breditor/redo"));
    assert_eq!(redo.metadata().history(), &HistoryIntent::Ignore);
    let redo_commit = committed(redo.apply(&context, undo_commit.after())?)?;
    assert_eq!(redo_commit.base_revision(), Revision::new(2));
    assert_eq!(redo_commit.revision(), Revision::new(3));
    assert_eq!(redo_commit.after().document(), edit_commit.after().document());
    assert_eq!(redo_commit.after().selection(), edit_commit.after().selection());
    assert_eq!(redo_commit.after().pending_formats(), edit_commit.after().pending_formats());
    assert_eq!(redo_commit.metadata().history(), &HistoryIntent::Ignore);
    assert_ne!(redo_commit.after().snapshot(), edit_commit.after().snapshot());
    Ok(())
}

#[test]
fn identity_relocation_rejects_an_invalid_source_point() -> TestResult {
    let context = EditorContext::default();
    let initial = state(&context, "abc", "identity-map", None, None)?;
    let requested = collapsed_selection(1)?;
    let commit = committed(
        Transaction::new(&initial, Vec::new())
            .with_selection_update(SelectionUpdate::Set(Some(requested)))
            .apply(&context, &initial)?,
    )?;
    assert!(commit.relocation().is_identity());

    let invalid = text_point(99, Affinity::Before)?;
    assert_eq!(
        commit.relocation().relocate_point(&initial, &invalid),
        Err(RelocationError::InvalidSourcePoint(PointError::Utf16OffsetOutOfBounds {
            path: path(&[0, 0])?,
            offset: 99,
            length: 3,
        },))
    );
    Ok(())
}

#[test]
fn insertion_boundary_respects_before_and_after_affinity() -> TestResult {
    let context = EditorContext::default();
    let initial = state(&context, "ab", "affinity", None, None)?;
    let insertion = splice(1, 1, TextFragment::empty(), fragment("X")?)?;
    let commit =
        committed(Transaction::new(&initial, vec![insertion.into()]).apply(&context, &initial)?)?;
    assert_single_text(commit.after().document(), "aXb")?;

    let before = text_point(1, Affinity::Before)?;
    let after = text_point(1, Affinity::After)?;
    assert_eq!(
        commit.relocation().relocate_point(&initial, &before)?,
        PointRelocation::Exact(text_point(1, Affinity::Before)?),
    );
    assert_eq!(
        commit.relocation().relocate_point(&initial, &after)?,
        PointRelocation::Exact(text_point(2, Affinity::After)?),
    );
    Ok(())
}

#[test]
fn deleted_point_fallback_sides_survive_a_later_insertion() -> TestResult {
    let context = EditorContext::default();
    let initial = state(&context, "abcdef", "composed-delete", None, None)?;
    let deletion = splice(2, 4, fragment("cd")?, TextFragment::empty())?;
    let later_insertion = splice(2, 2, TextFragment::empty(), fragment("XY")?)?;
    let commit = committed(
        Transaction::new(&initial, vec![deletion.into(), later_insertion.into()])
            .apply(&context, &initial)?,
    )?;
    assert_eq!(commit.changes().len(), 2);
    assert_single_text(commit.after().document(), "abXYef")?;

    for affinity in [Affinity::Before, Affinity::After] {
        let deleted = text_point(3, affinity)?;
        assert_eq!(
            commit.relocation().relocate_point(&initial, &deleted)?,
            PointRelocation::Deleted {
                before: text_point(2, affinity)?,
                after: text_point(4, affinity)?,
            }
        );
    }
    Ok(())
}
