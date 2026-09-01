//! Black-box contracts for explicit selection and pending-format state updates.

mod support;

use breditor_core::{
    codec::DocumentJsonCodec,
    document::{Document, FormatSet, TextFragment, TextRun},
    operation::{TextRange, TextSplice},
    position::{Affinity, NodePath, Point, TextOffset},
    selection::{RangeEndpoint, RangeSelection, Selection, SelectionEndpointRule, SelectionError},
    state::{EditorContext, EditorState, EditorStateError, LineageId, Revision},
    transaction::{
        Commit, PendingFormatsUpdate, SelectionUpdate, Transaction, TransactionApplyError,
        TransactionOutcome,
    },
};
use support::{TestResult, document_json, paragraph, path, test_error, text_node};

fn selection(start: u32, end: u32) -> Result<Selection, Box<dyn std::error::Error>> {
    let text_path = path(&[0, 0])?;
    Ok(RangeSelection::new(
        Point::Text {
            text_path: text_path.clone(),
            utf16_offset: start,
            affinity: Affinity::Before,
        },
        Point::Text { text_path, utf16_offset: end, affinity: Affinity::After },
    )
    .into())
}

fn state(
    context: &EditorContext,
    json: &str,
    lineage: &str,
    selection: Option<Selection>,
    pending_formats: Option<FormatSet>,
) -> Result<EditorState, Box<dyn std::error::Error>> {
    let document = DocumentJsonCodec::new(context.schema().clone())
        .with_limits(context.limits().clone())
        .decode(json)?;
    EditorState::try_new(
        context,
        LineageId::try_new(lineage)?,
        document,
        selection,
        pending_formats,
    )
    .map_err(Into::into)
}

fn committed(outcome: TransactionOutcome) -> Result<Commit, Box<dyn std::error::Error>> {
    outcome.into_commit().ok_or_else(|| test_error("transaction unexpectedly unchanged").into())
}

fn transaction_error(
    result: Result<TransactionOutcome, TransactionApplyError>,
) -> Result<TransactionApplyError, Box<dyn std::error::Error>> {
    match result {
        Ok(_) => Err(test_error("transaction unexpectedly succeeded").into()),
        Err(error) => Ok(error),
    }
}

fn plain_fragment(text: &str) -> Result<TextFragment, Box<dyn std::error::Error>> {
    Ok(TextRun::try_new(text, FormatSet::default())?.into())
}

fn insert_at_start(text: &str) -> Result<TextSplice, Box<dyn std::error::Error>> {
    let zero = TextOffset::ZERO;
    TextSplice::try_new(
        TextRange::try_new(path(&[0])?, zero, zero)?,
        TextFragment::empty(),
        plain_fragment(text)?,
    )
    .map_err(Into::into)
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
fn selection_only_commit_advances_once_without_content_artifacts() -> TestResult {
    let context = EditorContext::default();
    let initial = state(
        &context,
        &document_json(&[paragraph(&[text_node("abc", false)])]),
        "selection-only",
        None,
        None,
    )?;
    let requested = selection(1, 1)?;
    let update = SelectionUpdate::Set(Some(requested.clone()));
    let transaction = Transaction::new(&initial, Vec::new()).with_selection_update(update.clone());
    assert_eq!(transaction.selection_update(), &update);
    assert_eq!(transaction.pending_formats_update(), &PendingFormatsUpdate::Preserve);

    let commit = committed(transaction.apply(&context, &initial)?)?;
    assert_eq!(commit.before(), &initial);
    assert_eq!(commit.base_revision(), Revision::ZERO);
    assert_eq!(commit.revision(), Revision::new(1));
    assert_eq!(commit.after().document(), initial.document());
    assert_eq!(commit.after().selection(), Some(&requested));
    assert_eq!(commit.after().pending_formats(), None);
    assert!(commit.forward_operations().is_empty());
    assert!(commit.inverse_operations().is_empty());
    assert!(commit.changes().is_empty());
    assert!(commit.relocation().is_identity());
    assert_eq!(commit.relocation().base_snapshot(), initial.snapshot());
    assert_eq!(commit.relocation().result_snapshot(), commit.snapshot());
    Ok(())
}

#[test]
fn identical_explicit_selection_and_pending_formats_are_suppressed() -> TestResult {
    let context = EditorContext::default();
    let current_selection = selection(1, 1)?;
    let current_formats = FormatSet::default();
    let initial = state(
        &context,
        &document_json(&[paragraph(&[text_node("abc", false)])]),
        "identical-update",
        Some(current_selection.clone()),
        Some(current_formats.clone()),
    )?;
    let selection_update = SelectionUpdate::Set(Some(current_selection));
    let formats_update = PendingFormatsUpdate::Set(Some(current_formats));
    let transaction = Transaction::new(&initial, Vec::new())
        .with_selection_update(selection_update.clone())
        .with_pending_formats_update(formats_update.clone());
    assert_eq!(transaction.selection_update(), &selection_update);
    assert_eq!(transaction.pending_formats_update(), &formats_update);

    let outcome = transaction.apply(&context, &initial)?;
    assert!(outcome.is_unchanged());
    assert!(outcome.commit().is_none());
    assert_eq!(initial.snapshot().revision(), Revision::ZERO);
    Ok(())
}

#[test]
fn pending_formats_reject_an_extended_selection_but_accept_a_collapsed_result() -> TestResult {
    let context = EditorContext::default();
    let extended = selection(0, 2)?;
    let initial = state(
        &context,
        &document_json(&[paragraph(&[text_node("abc", false)])]),
        "pending-formats",
        Some(extended),
        None,
    )?;
    let explicit_unformatted = FormatSet::default();
    let invalid = Transaction::new(&initial, Vec::new())
        .with_pending_formats_update(PendingFormatsUpdate::Set(Some(explicit_unformatted.clone())));
    assert_eq!(
        transaction_error(invalid.apply(&context, &initial))?,
        TransactionApplyError::InvalidResultState(
            EditorStateError::PendingFormatsRequireCollapsedRange,
        )
    );
    assert_eq!(initial.snapshot().revision(), Revision::ZERO);
    assert_eq!(initial.pending_formats(), None);

    let collapsed = selection(1, 1)?;
    let valid = Transaction::new(&initial, Vec::new())
        .with_selection_update(SelectionUpdate::Set(Some(collapsed.clone())))
        .with_pending_formats_update(PendingFormatsUpdate::Set(Some(explicit_unformatted.clone())));
    let commit = committed(valid.apply(&context, &initial)?)?;
    assert_eq!(commit.after().selection(), Some(&collapsed));
    assert_eq!(commit.after().pending_formats(), Some(&explicit_unformatted));
    assert_eq!(commit.revision(), Revision::new(1));
    assert!(commit.forward_operations().is_empty());
    assert!(commit.changes().is_empty());
    Ok(())
}

#[test]
fn invalid_explicit_result_selection_rejects_a_content_change_atomically() -> TestResult {
    let context = EditorContext::default();
    let initial = state(
        &context,
        &document_json(&[paragraph(&[text_node("abc", false)])]),
        "invalid-result",
        None,
        None,
    )?;
    let original = initial.clone();
    let root_point = Point::Children {
        parent_path: NodePath::root(),
        child_index: 0,
        affinity: Affinity::Before,
    };
    let invalid_selection: Selection = RangeSelection::new(root_point.clone(), root_point).into();
    let insertion = insert_at_start("X")?;
    let transaction = Transaction::new(&initial, vec![insertion.clone().into()])
        .with_selection_update(SelectionUpdate::Set(Some(invalid_selection)));
    assert_eq!(
        transaction_error(transaction.apply(&context, &initial))?,
        TransactionApplyError::InvalidResultState(EditorStateError::InvalidSelection(
            SelectionError::EndpointNotAllowed {
                endpoint: RangeEndpoint::Anchor,
                path: NodePath::root(),
                rule: SelectionEndpointRule::RootBoundary,
            },
        ))
    );
    assert_eq!(initial, original);
    assert_single_text(initial.document(), "abc")?;

    let proof = Transaction::new(&initial, vec![insertion.into()]);
    let commit = committed(proof.apply(&context, &initial)?)?;
    assert_single_text(commit.after().document(), "Xabc")?;
    assert_eq!(commit.revision(), Revision::new(1));
    Ok(())
}

#[test]
fn transaction_operation_budget_rejects_work_before_execution() -> TestResult {
    let context = EditorContext::default().with_max_operations_per_transaction(0);
    let initial = state(
        &context,
        &document_json(&[paragraph(&[text_node("abc", false)])]),
        "operation-budget",
        None,
        None,
    )?;
    let configured_maximum: u32 = context.max_operations_per_transaction();
    assert_eq!(configured_maximum, 0);
    let transaction = Transaction::new(&initial, vec![insert_at_start("X")?.into()]);
    let error = transaction_error(transaction.apply(&context, &initial))?;
    let (actual, maximum) = match error {
        TransactionApplyError::OperationLimit { actual, maximum } => (actual, maximum),
        error => return Err(test_error(format!("expected operation limit, got {error}")).into()),
    };
    let actual: u64 = actual;
    let maximum: u32 = maximum;
    assert_eq!((actual, maximum), (1, 0));
    assert_single_text(initial.document(), "abc")?;
    assert_eq!(initial.snapshot().revision(), Revision::ZERO);
    Ok(())
}
