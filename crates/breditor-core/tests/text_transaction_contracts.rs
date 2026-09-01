//! Black-box contracts for formatted text splices and atomic commits.

mod support;

use breditor_core::{
    codec::DocumentJsonCodec,
    document::{
        Document, Format, FormatSet, PropertyMap, TextFragment, TextFragmentError, TextRun,
        TextRunError,
    },
    identity::QualifiedName,
    operation::{
        Operation, OperationApplyError, TextRange, TextRangeError, TextSplice,
        TextSpliceApplyError, TextSpliceError,
    },
    position::{NodePath, TextOffset},
    state::{EditorContext, EditorState, LineageId, Revision},
    transaction::{Commit, Transaction, TransactionApplyError, TransactionOutcome},
};
use support::{TestResult, document_json, paragraph, path, test_error, text_node};

fn formats(strong: bool) -> Result<FormatSet, Box<dyn std::error::Error>> {
    if !strong {
        return Ok(FormatSet::default());
    }
    let format = Format::new(QualifiedName::try_new("breditor/strong")?, PropertyMap::default());
    FormatSet::try_from_formats(vec![format]).map_err(Into::into)
}

fn run(text: &str, strong: bool) -> Result<TextRun, Box<dyn std::error::Error>> {
    TextRun::try_new(text, formats(strong)?).map_err(Into::into)
}

fn fragment(runs: &[(&str, bool)]) -> Result<TextFragment, Box<dyn std::error::Error>> {
    TextFragment::try_from_runs(
        runs.iter().map(|(text, strong)| run(text, *strong)).collect::<Result<Vec<_>, _>>()?,
    )
    .map_err(Into::into)
}

fn offset(value: u64) -> Result<TextOffset, Box<dyn std::error::Error>> {
    TextOffset::try_new(value).map_err(Into::into)
}

fn text_range(
    container: &[u32],
    start: u64,
    end: u64,
) -> Result<TextRange, Box<dyn std::error::Error>> {
    TextRange::try_new(path(container)?, offset(start)?, offset(end)?).map_err(Into::into)
}

fn state(
    context: &EditorContext,
    json: &str,
    lineage: &str,
) -> Result<EditorState, Box<dyn std::error::Error>> {
    let document = DocumentJsonCodec::new(context.schema().clone())
        .with_limits(context.limits().clone())
        .decode(json)?;
    EditorState::try_new(context, LineageId::try_new(lineage)?, document, None, None)
        .map_err(Into::into)
}

fn committed(outcome: TransactionOutcome) -> Result<Commit, Box<dyn std::error::Error>> {
    match outcome {
        TransactionOutcome::Committed(commit) => Ok(*commit),
        TransactionOutcome::Unchanged => {
            Err(test_error("transaction unexpectedly unchanged").into())
        }
    }
}

fn transaction_error(
    result: Result<TransactionOutcome, TransactionApplyError>,
) -> Result<TransactionApplyError, Box<dyn std::error::Error>> {
    match result {
        Ok(_) => Err(test_error("transaction unexpectedly succeeded").into()),
        Err(error) => Ok(error),
    }
}

fn assert_paragraph_runs(
    document: &Document,
    paragraph_index: u32,
    expected: &[(&str, bool)],
) -> TestResult {
    let paragraph_path = path(&[paragraph_index])?;
    let Some(paragraph) = document.node_at(&paragraph_path)?.as_element() else {
        return Err(test_error("paragraph path did not resolve to an element").into());
    };
    assert_eq!(paragraph.children().len(), expected.len());
    for (child, (expected_text, expected_strong)) in
        paragraph.children().iter().zip(expected.iter())
    {
        let Some(text) = child.as_text() else {
            return Err(test_error("paragraph child did not resolve to text").into());
        };
        assert_eq!(text.text(), *expected_text);
        assert_eq!(!text.formats().is_empty(), *expected_strong);
    }
    Ok(())
}

#[test]
fn public_text_values_reject_noncanonical_and_malformed_inputs() -> TestResult {
    assert_eq!(TextRun::try_new("", FormatSet::default()), Err(TextRunError::Empty));

    let left = run("a", false)?;
    let right = run("b", false)?;
    assert_eq!(
        TextFragment::try_from_runs(vec![left, right]),
        Err(TextFragmentError::AdjacentEqualFormats { left_index: 0, right_index: 1 })
    );

    let reversed_start = offset(2)?;
    let reversed_end = offset(1)?;
    assert_eq!(
        TextRange::try_new(NodePath::root(), reversed_start, reversed_end),
        Err(TextRangeError::Reversed { start: reversed_start, end: reversed_end })
    );

    let canonical = fragment(&[("a", false), ("B", true)])?;
    assert_eq!(canonical.len(), 2);
    assert_eq!(canonical.utf16_len(), offset(2)?);
    assert_eq!(canonical.text_bytes(), 2);
    assert_eq!(canonical.iter().map(TextRun::text).collect::<Vec<_>>(), vec!["a", "B"]);

    let mismatched_range = text_range(&[0], 0, 2)?;
    assert_eq!(
        TextSplice::try_new(mismatched_range, fragment(&[("x", false)])?, TextFragment::empty(),),
        Err(TextSpliceError::ExpectedRemovedLength {
            range_length: 2,
            fragment_length: offset(1)?,
        })
    );
    Ok(())
}

#[test]
fn cross_run_deletion_merges_seams_and_inverse_replay_restores_the_exact_document() -> TestResult {
    let context = EditorContext::default();
    let initial = state(
        &context,
        &document_json(&[paragraph(&[
            text_node("ab", false),
            text_node("XY", true),
            text_node("cd", false),
        ])]),
        "cross-run",
    )?;
    let removed = fragment(&[("b", false), ("XY", true), ("c", false)])?;
    let range = text_range(&[0], 1, 5)?;
    let splice =
        TextSplice::capture(&context, initial.document(), range.clone(), TextFragment::empty())?;
    assert_eq!(splice.range(), &range);
    assert_eq!(splice.expected_removed(), &removed);
    assert!(splice.replacement().is_empty());

    let operation = Operation::from(splice);
    let transaction = Transaction::new(&initial, vec![operation.clone()]);
    assert_eq!(transaction.base_state(), &initial);
    assert_eq!(transaction.operations(), std::slice::from_ref(&operation));
    let commit = committed(transaction.apply(&context, &initial)?)?;

    assert_eq!(commit.before(), &initial);
    assert_eq!(commit.base_revision(), Revision::new(0));
    assert_eq!(commit.revision(), Revision::new(1));
    assert_eq!(commit.forward_operations(), &[operation]);
    assert_eq!(commit.changes().len(), 1);
    assert_eq!(commit.relocation().base_snapshot(), initial.snapshot());
    assert_eq!(commit.relocation().result_snapshot(), commit.snapshot());
    assert_paragraph_runs(commit.after().document(), 0, &[("ad", false)])?;

    let change = commit
        .changes()
        .iter()
        .next()
        .ok_or_else(|| test_error("commit omitted its text change"))?;
    assert_eq!(change.old_text_range(), &range);
    assert_eq!(change.new_text_range().start(), offset(1)?);
    assert_eq!(change.new_text_range().end(), offset(1)?);
    assert_eq!((change.old_child_range().start(), change.old_child_range().end()), (0, 3));
    assert_eq!((change.new_child_range().start(), change.new_child_range().end()), (0, 1));

    let inverse_operations = commit.inverse_operations().to_vec();
    assert_eq!(inverse_operations.len(), 1);
    let inverse_transaction = Transaction::new(commit.after(), inverse_operations);
    let inverse_commit = committed(inverse_transaction.apply(&context, commit.after())?)?;
    assert_eq!(inverse_commit.after().document(), initial.document());
    assert_paragraph_runs(
        inverse_commit.after().document(),
        0,
        &[("ab", false), ("XY", true), ("cd", false)],
    )?;
    Ok(())
}

#[test]
fn an_empty_paragraph_accepts_insertion_and_becomes_empty_after_deletion() -> TestResult {
    let context = EditorContext::default();
    let initial = state(&context, &document_json(&[paragraph(&[])]), "empty-paragraph")?;
    assert_paragraph_runs(initial.document(), 0, &[])?;

    let inserted = fragment(&[("😀", false)])?;
    let insert =
        TextSplice::try_new(text_range(&[0], 0, 0)?, TextFragment::empty(), inserted.clone())?;
    let insert_commit =
        committed(Transaction::new(&initial, vec![insert.into()]).apply(&context, &initial)?)?;
    assert_paragraph_runs(insert_commit.after().document(), 0, &[("😀", false)])?;

    let delete = TextSplice::try_new(text_range(&[0], 0, 2)?, inserted, TextFragment::empty())?;
    let delete_commit = committed(
        Transaction::new(insert_commit.after(), vec![delete.into()])
            .apply(&context, insert_commit.after())?,
    )?;
    assert_eq!(delete_commit.revision(), Revision::new(2));
    assert_paragraph_runs(delete_commit.after().document(), 0, &[])?;
    Ok(())
}

#[test]
fn splice_rejects_a_utf16_boundary_inside_a_surrogate_pair() -> TestResult {
    let context = EditorContext::default();
    let initial =
        state(&context, &document_json(&[paragraph(&[text_node("a😀b", false)])]), "unicode")?;
    let split = offset(2)?;
    let splice = TextSplice::try_new(
        TextRange::try_new(path(&[0])?, split, split)?,
        TextFragment::empty(),
        fragment(&[("x", false)])?,
    )?;
    let error = transaction_error(
        Transaction::new(&initial, vec![splice.into()]).apply(&context, &initial),
    )?;
    assert_eq!(
        error,
        TransactionApplyError::Operation {
            operation_index: 0,
            source: OperationApplyError::TextSplice(TextSpliceApplyError::RangeSplitsScalar {
                requested: split,
            }),
        }
    );
    Ok(())
}

#[test]
fn transaction_rejects_stale_and_reused_snapshot_identities() -> TestResult {
    let context = EditorContext::default();
    let authored = state(&context, &document_json(&[paragraph(&[])]), "authored")?;
    let different_lineage =
        state(&context, &document_json(&[paragraph(&[])]), "different-lineage")?;
    let transaction = Transaction::new(&authored, Vec::new());
    assert_eq!(
        transaction_error(transaction.apply(&context, &different_lineage))?,
        TransactionApplyError::StaleSnapshot {
            expected: authored.snapshot().clone(),
            actual: different_lineage.snapshot().clone(),
        }
    );

    let reused_snapshot = state(
        &context,
        &document_json(&[paragraph(&[text_node("different", false)])]),
        "authored",
    )?;
    assert_eq!(reused_snapshot.snapshot(), authored.snapshot());
    assert_ne!(reused_snapshot, authored);
    assert_eq!(
        transaction_error(transaction.apply(&context, &reused_snapshot))?,
        TransactionApplyError::BaseStateMismatch { snapshot: authored.snapshot().clone() }
    );
    Ok(())
}

#[test]
fn a_late_operation_failure_rejects_the_entire_multi_operation_batch() -> TestResult {
    let context = EditorContext::default();
    let initial =
        state(&context, &document_json(&[paragraph(&[text_node("abc", false)])]), "atomic")?;
    let original_document = initial.document().clone();
    let insert_x = TextSplice::try_new(
        text_range(&[0], 0, 0)?,
        TextFragment::empty(),
        fragment(&[("X", false)])?,
    )?;
    let wrong_expected = fragment(&[("Y", false)])?;
    let delete_wrong_guard = TextSplice::try_new(
        text_range(&[0], 0, 1)?,
        wrong_expected.clone(),
        TextFragment::empty(),
    )?;
    let transaction =
        Transaction::new(&initial, vec![insert_x.clone().into(), delete_wrong_guard.into()]);
    let error = transaction_error(transaction.apply(&context, &initial))?;
    assert_eq!(
        error,
        TransactionApplyError::Operation {
            operation_index: 1,
            source: OperationApplyError::TextSplice(
                TextSpliceApplyError::ExpectedRemovedMismatch {
                    expected: wrong_expected,
                    actual: fragment(&[("X", false)])?,
                },
            ),
        }
    );
    assert_eq!(initial.document(), &original_document);
    assert_eq!(initial.snapshot().revision(), Revision::new(0));

    let proof_commit =
        committed(Transaction::new(&initial, vec![insert_x.into()]).apply(&context, &initial)?)?;
    assert_paragraph_runs(proof_commit.after().document(), 0, &[("Xabc", false)])?;
    Ok(())
}
