//! Black-box validation laws that a future text-splice fast path must preserve.

mod support;

use breditor_core::{
    codec::{DocumentCodecError, DocumentJsonCodec},
    document::{Document, Format, FormatSet, PropertyMap, TextFragment, TextRun},
    identity::QualifiedName,
    operation::{OperationApplyError, TextRange, TextSplice, TextSpliceApplyError},
    position::{NodePath, TextOffset},
    schema::{CompiledSchema, DocumentLimits, LimitKind, ValidationDetail, ValidationReport},
    state::{EditorContext, EditorState, LineageId, Revision},
    transaction::{Commit, Transaction, TransactionApplyError, TransactionOutcome},
};
use serde_json::Value;
use support::{TestResult, document_json, paragraph, path, test_error, text_node};

fn formats(strong: bool) -> Result<FormatSet, Box<dyn std::error::Error>> {
    if !strong {
        return Ok(FormatSet::default());
    }
    FormatSet::try_from_formats(vec![Format::new(
        QualifiedName::try_new("breditor/strong")?,
        PropertyMap::default(),
    )])
    .map_err(Into::into)
}

fn fragment(runs: &[(&str, bool)]) -> Result<TextFragment, Box<dyn std::error::Error>> {
    TextFragment::try_from_runs(
        runs.iter()
            .map(|(text, strong)| TextRun::try_new(*text, formats(*strong)?).map_err(Into::into))
            .collect::<Result<Vec<_>, Box<dyn std::error::Error>>>()?,
    )
    .map_err(Into::into)
}

fn state(
    context: &EditorContext,
    paragraphs: &[Value],
    lineage: &str,
) -> Result<EditorState, Box<dyn std::error::Error>> {
    let document = DocumentJsonCodec::new(context.schema().clone())
        .with_limits(context.limits().clone())
        .decode(&document_json(paragraphs))?;
    EditorState::try_new(context, LineageId::try_new(lineage)?, document, None, None)
        .map_err(Into::into)
}

fn range(
    paragraph_index: u32,
    start: u64,
    end: u64,
) -> Result<TextRange, Box<dyn std::error::Error>> {
    TextRange::try_new(
        path(&[paragraph_index])?,
        TextOffset::try_new(start)?,
        TextOffset::try_new(end)?,
    )
    .map_err(Into::into)
}

fn captured_splice(
    context: &EditorContext,
    state: &EditorState,
    paragraph_index: u32,
    start: u64,
    end: u64,
    replacement: TextFragment,
) -> Result<TextSplice, Box<dyn std::error::Error>> {
    TextSplice::capture(context, state.document(), range(paragraph_index, start, end)?, replacement)
        .map_err(Into::into)
}

fn committed(outcome: TransactionOutcome) -> Result<Commit, Box<dyn std::error::Error>> {
    outcome.into_commit().ok_or_else(|| test_error("transaction unexpectedly unchanged").into())
}

fn invalid_result_report(
    result: Result<TransactionOutcome, TransactionApplyError>,
) -> Result<(usize, ValidationReport), Box<dyn std::error::Error>> {
    match result {
        Err(TransactionApplyError::Operation {
            operation_index,
            source: OperationApplyError::TextSplice(TextSpliceApplyError::InvalidResult(report)),
        }) => Ok((operation_index, report)),
        Err(error) => {
            Err(test_error(format!("expected an invalid-result validation report, got {error}"))
                .into())
        }
        Ok(outcome) => Err(test_error(format!(
            "expected an invalid-result validation report, got {outcome:?}"
        ))
        .into()),
    }
}

fn authoritative_validation_report(
    context: &EditorContext,
    paragraphs: &[Value],
) -> Result<ValidationReport, Box<dyn std::error::Error>> {
    let result = DocumentJsonCodec::new(context.schema().clone())
        .with_limits(context.limits().clone())
        .decode(&document_json(paragraphs));
    match result {
        Err(DocumentCodecError::Validation(report)) => Ok(report),
        Err(error) => {
            Err(test_error(format!("expected authoritative validation report, got {error}")).into())
        }
        Ok(_) => Err(test_error("authoritative candidate unexpectedly decoded").into()),
    }
}

fn assert_limit(
    report: &ValidationReport,
    path: &NodePath,
    kind: LimitKind,
    actual: usize,
    maximum: usize,
) {
    assert!(report.iter().any(|issue| {
        issue.path() == path
            && matches!(
                issue.detail(),
                ValidationDetail::Limit {
                    kind: found_kind,
                    actual: found_actual,
                    maximum: found_maximum,
                } if *found_kind == kind
                    && *found_actual == actual
                    && *found_maximum == maximum
            )
    }));
}

fn assert_paragraph_runs(
    document: &Document,
    paragraph_index: u32,
    expected: &[(&str, bool)],
) -> TestResult {
    let Some(paragraph) = document.node_at(&path(&[paragraph_index])?)?.as_element() else {
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

fn assert_full_revalidation_parity(context: &EditorContext, document: &Document) -> TestResult {
    let codec =
        DocumentJsonCodec::new(context.schema().clone()).with_limits(context.limits().clone());
    let revalidated = codec.decode(&codec.encode(document)?)?;
    assert_eq!(revalidated, *document);
    assert_eq!(revalidated.summary(), document.summary());
    Ok(())
}

#[test]
fn seam_merge_cannot_hide_an_oversized_result_leaf() -> TestResult {
    let limits = DocumentLimits::default().with_max_text_bytes(5).with_max_total_text_bytes(100);
    let context = EditorContext::new(CompiledSchema::breditor_base(), limits);
    let source = state(
        &context,
        &[paragraph(&[text_node("aaa", false), text_node("X", true), text_node("bbb", false)])],
        "oversized-seam",
    )?;
    let original = source.clone();
    assert_eq!(source.document().summary().node_count(), 5);
    assert_eq!(source.document().summary().total_text_bytes(), 7);

    let splice = captured_splice(&context, &source, 0, 3, 4, fragment(&[("c", false)])?)?;
    let transaction = Transaction::new(&source, vec![splice.into()]);
    let (operation_index, report) = invalid_result_report(transaction.apply(&context, &source))?;
    assert_eq!(operation_index, 0);
    assert_limit(&report, &path(&[0, 0])?, LimitKind::TextBytes, 7, 5);
    let authoritative =
        authoritative_validation_report(&context, &[paragraph(&[text_node("aaacbbb", false)])])?;
    assert_eq!(report, authoritative);
    assert_eq!(source, original);
    assert_eq!(source.snapshot().revision(), Revision::ZERO);
    Ok(())
}

#[test]
fn total_text_limit_counts_off_spine_content_and_rejects_atomically() -> TestResult {
    let rejected_context = EditorContext::new(
        CompiledSchema::breditor_base(),
        DocumentLimits::default().with_max_total_text_bytes(10),
    );
    let paragraphs =
        [paragraph(&[text_node("abc", false)]), paragraph(&[text_node("tail", false)])];
    let source = state(&rejected_context, &paragraphs, "off-spine-rejected")?;
    let original = source.clone();
    assert_eq!(source.document().summary().node_count(), 5);
    assert_eq!(source.document().summary().total_text_bytes(), 7);

    let splice =
        captured_splice(&rejected_context, &source, 0, 3, 3, fragment(&[("WXYZ", false)])?)?;
    let (operation_index, report) = invalid_result_report(
        Transaction::new(&source, vec![splice.into()]).apply(&rejected_context, &source),
    )?;
    assert_eq!(operation_index, 0);
    assert_limit(&report, &path(&[1, 0])?, LimitKind::TotalTextBytes, 11, 10);
    let authoritative = authoritative_validation_report(
        &rejected_context,
        &[paragraph(&[text_node("abcWXYZ", false)]), paragraph(&[text_node("tail", false)])],
    )?;
    assert_eq!(report, authoritative);
    assert_eq!(source, original);
    assert_eq!(source.document().summary().total_text_bytes(), 7);

    let accepted_context = EditorContext::new(
        CompiledSchema::breditor_base(),
        DocumentLimits::default().with_max_total_text_bytes(11),
    );
    let accepted_source = state(&accepted_context, &paragraphs, "off-spine-accepted")?;
    let accepted_splice = captured_splice(
        &accepted_context,
        &accepted_source,
        0,
        3,
        3,
        fragment(&[("WXYZ", false)])?,
    )?;
    let commit = committed(
        Transaction::new(&accepted_source, vec![accepted_splice.into()])
            .apply(&accepted_context, &accepted_source)?,
    )?;
    assert_eq!(commit.after().document().summary().total_text_bytes(), 11);
    assert_paragraph_runs(commit.after().document(), 0, &[("abcWXYZ", false)])?;
    assert_paragraph_runs(commit.after().document(), 1, &[("tail", false)])?;
    assert_full_revalidation_parity(&accepted_context, commit.after().document())?;
    Ok(())
}

#[test]
fn final_child_limit_is_applied_after_canonical_seam_merging() -> TestResult {
    let context = EditorContext::new(
        CompiledSchema::breditor_base(),
        DocumentLimits::default().with_max_children_per_element(3),
    );
    let paragraphs = [paragraph(&[text_node("a", false), text_node("B", true)])];
    let source = state(&context, &paragraphs, "child-seams")?;

    let merging =
        captured_splice(&context, &source, 0, 2, 2, fragment(&[("C", true), ("d", false)])?)?;
    let commit =
        committed(Transaction::new(&source, vec![merging.into()]).apply(&context, &source)?)?;
    assert_paragraph_runs(
        commit.after().document(),
        0,
        &[("a", false), ("BC", true), ("d", false)],
    )?;
    assert_eq!(commit.after().document().summary().node_count(), 5);
    assert_full_revalidation_parity(&context, commit.after().document())?;

    let non_merging =
        captured_splice(&context, &source, 0, 2, 2, fragment(&[("c", false), ("D", true)])?)?;
    let (operation_index, report) = invalid_result_report(
        Transaction::new(&source, vec![non_merging.into()]).apply(&context, &source),
    )?;
    assert_eq!(operation_index, 0);
    assert_limit(&report, &path(&[0])?, LimitKind::ChildCount, 4, 3);
    assert_paragraph_runs(source.document(), 0, &[("a", false), ("B", true)])?;
    Ok(())
}

#[test]
fn paragraph_transitions_between_canonical_runs_and_no_children() -> TestResult {
    let context = EditorContext::default();
    let empty = state(&context, &[paragraph(&[])], "empty-transition")?;
    assert_paragraph_runs(empty.document(), 0, &[])?;
    assert_eq!(empty.document().summary().node_count(), 2);
    assert_eq!(empty.document().summary().max_node_depth(), 1);

    let insertion =
        captured_splice(&context, &empty, 0, 0, 0, fragment(&[("a", false), ("B", true)])?)?;
    let populated =
        committed(Transaction::new(&empty, vec![insertion.into()]).apply(&context, &empty)?)?;
    assert_paragraph_runs(populated.after().document(), 0, &[("a", false), ("B", true)])?;
    assert_eq!(populated.after().document().summary().node_count(), 4);
    assert_eq!(populated.after().document().summary().max_node_depth(), 2);
    assert_full_revalidation_parity(&context, populated.after().document())?;

    let deletion = captured_splice(&context, populated.after(), 0, 0, 2, TextFragment::empty())?;
    let emptied = committed(
        Transaction::new(populated.after(), vec![deletion.into()])
            .apply(&context, populated.after())?,
    )?;
    assert_paragraph_runs(emptied.after().document(), 0, &[])?;
    assert_eq!(emptied.after().document().summary().node_count(), 2);
    assert_eq!(emptied.after().document().summary().max_node_depth(), 1);
    assert_eq!(emptied.after().document().summary().total_text_bytes(), 0);
    assert_full_revalidation_parity(&context, emptied.after().document())?;
    Ok(())
}
