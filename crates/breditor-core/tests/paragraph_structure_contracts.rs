//! Black-box contracts for direct-root paragraph split and join operations.

mod support;

use breditor_core::{
    codec::{DocumentCodecError, DocumentJsonCodec},
    document::{
        Document, Format, FormatSet, PropertyMap, TextFragment, TextFragmentSplitError, TextRun,
    },
    identity::QualifiedName,
    operation::{
        Operation, OperationApplyError, ParagraphJoin, ParagraphJoinApplyError, ParagraphJoinSide,
        ParagraphSplit, ParagraphSplitApplyError, ParagraphSplitError, TextRange, TextSplice,
    },
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

fn offset(value: u64) -> Result<TextOffset, Box<dyn std::error::Error>> {
    TextOffset::try_new(value).map_err(Into::into)
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

fn committed(outcome: TransactionOutcome) -> Result<Commit, Box<dyn std::error::Error>> {
    outcome.into_commit().ok_or_else(|| test_error("transaction unexpectedly unchanged").into())
}

fn transaction_error(
    result: Result<TransactionOutcome, TransactionApplyError>,
) -> Result<TransactionApplyError, Box<dyn std::error::Error>> {
    match result {
        Ok(outcome) => {
            Err(test_error(format!("transaction unexpectedly returned {outcome:?}")).into())
        }
        Err(error) => Ok(error),
    }
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

fn assert_paragraph_count(document: &Document, expected: usize) -> TestResult {
    let Some(root) = document.root().as_element() else {
        return Err(test_error("document root did not resolve to an element").into());
    };
    assert_eq!(root.children().len(), expected);
    Ok(())
}

fn assert_split_case(
    lineage: &str,
    source: Value,
    split_offset: u64,
    expected_left: &[(&str, bool)],
    expected_right: &[(&str, bool)],
) -> TestResult {
    let context = EditorContext::default();
    let initial = state(&context, &[source], lineage)?;
    let split =
        ParagraphSplit::capture(&context, initial.document(), path(&[0])?, offset(split_offset)?)?;
    let commit =
        committed(Transaction::new(&initial, vec![split.into()]).apply(&context, &initial)?)?;
    assert_paragraph_count(commit.after().document(), 2)?;
    assert_paragraph_runs(commit.after().document(), 0, expected_left)?;
    assert_paragraph_runs(commit.after().document(), 1, expected_right)?;
    Ok(())
}

fn assert_join_case(
    lineage: &str,
    left: Value,
    right: Value,
    expected: &[(&str, bool)],
) -> TestResult {
    let context = EditorContext::default();
    let initial = state(&context, &[left, right], lineage)?;
    let join = ParagraphJoin::capture(&context, initial.document(), path(&[0])?)?;
    let commit =
        committed(Transaction::new(&initial, vec![join.into()]).apply(&context, &initial)?)?;
    assert_paragraph_count(commit.after().document(), 1)?;
    assert_paragraph_runs(commit.after().document(), 0, expected)?;
    Ok(())
}

fn split_invalid_result(
    result: Result<TransactionOutcome, TransactionApplyError>,
) -> Result<ValidationReport, Box<dyn std::error::Error>> {
    match result {
        Err(TransactionApplyError::Operation {
            operation_index: 0,
            source:
                OperationApplyError::ParagraphSplit(ParagraphSplitApplyError::InvalidResult(report)),
        }) => Ok(report),
        Err(error) => Err(test_error(format!("expected invalid split result, got {error}")).into()),
        Ok(outcome) => {
            Err(test_error(format!("expected invalid split result, got {outcome:?}")).into())
        }
    }
}

fn join_invalid_result(
    result: Result<TransactionOutcome, TransactionApplyError>,
) -> Result<ValidationReport, Box<dyn std::error::Error>> {
    match result {
        Err(TransactionApplyError::Operation {
            operation_index: 0,
            source:
                OperationApplyError::ParagraphJoin(ParagraphJoinApplyError::InvalidResult(report)),
        }) => Ok(report),
        Err(error) => Err(test_error(format!("expected invalid join result, got {error}")).into()),
        Ok(outcome) => {
            Err(test_error(format!("expected invalid join result, got {outcome:?}")).into())
        }
    }
}

fn authoritative_report(
    context: &EditorContext,
    paragraphs: &[Value],
) -> Result<ValidationReport, Box<dyn std::error::Error>> {
    match DocumentJsonCodec::new(context.schema().clone())
        .with_limits(context.limits().clone())
        .decode(&document_json(paragraphs))
    {
        Err(DocumentCodecError::Validation(report)) => Ok(report),
        Err(error) => Err(test_error(format!("expected validation report, got {error}")).into()),
        Ok(_) => Err(test_error("authoritative codec accepted the invalid candidate").into()),
    }
}

fn assert_limit(
    report: &ValidationReport,
    issue_path: &NodePath,
    kind: LimitKind,
    actual: usize,
    maximum: usize,
) {
    assert!(report.iter().any(|issue| {
        issue.path() == issue_path
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

#[test]
fn split_accepts_start_end_run_seam_inside_run_empty_and_non_bmp_boundaries() -> TestResult {
    assert_split_case(
        "split-start",
        paragraph(&[text_node("ab", false)]),
        0,
        &[],
        &[("ab", false)],
    )?;
    assert_split_case("split-end", paragraph(&[text_node("ab", false)]), 2, &[("ab", false)], &[])?;
    assert_split_case(
        "split-run-seam",
        paragraph(&[text_node("ab", false), text_node("CD", true)]),
        2,
        &[("ab", false)],
        &[("CD", true)],
    )?;
    assert_split_case(
        "split-inside-run",
        paragraph(&[text_node("abcd", false)]),
        2,
        &[("ab", false)],
        &[("cd", false)],
    )?;
    assert_split_case("split-empty", paragraph(&[]), 0, &[], &[])?;
    assert_split_case(
        "split-non-bmp",
        paragraph(&[text_node("a😀b", false)]),
        3,
        &[("a😀", false)],
        &[("b", false)],
    )?;
    Ok(())
}

#[test]
fn split_rejects_a_boundary_inside_a_surrogate_pair() -> TestResult {
    let context = EditorContext::default();
    let initial = state(&context, &[paragraph(&[text_node("a😀b", false)])], "split-surrogate")?;
    let requested = offset(2)?;
    assert_eq!(
        ParagraphSplit::capture(&context, initial.document(), path(&[0])?, requested),
        Err(ParagraphSplitApplyError::Contract(ParagraphSplitError::FragmentSplit(
            TextFragmentSplitError::OffsetSplitsScalar { requested },
        )))
    );
    Ok(())
}

#[test]
fn join_merges_equal_format_seams_and_preserves_unequal_and_empty_sides() -> TestResult {
    assert_join_case(
        "join-equal-seam",
        paragraph(&[text_node("ab", false)]),
        paragraph(&[text_node("cd", false)]),
        &[("abcd", false)],
    )?;
    assert_join_case(
        "join-unequal-seam",
        paragraph(&[text_node("ab", false)]),
        paragraph(&[text_node("CD", true)]),
        &[("ab", false), ("CD", true)],
    )?;
    assert_join_case(
        "join-empty-left",
        paragraph(&[]),
        paragraph(&[text_node("right", false)]),
        &[("right", false)],
    )?;
    assert_join_case(
        "join-empty-right",
        paragraph(&[text_node("left", false)]),
        paragraph(&[]),
        &[("left", false)],
    )?;
    assert_join_case("join-both-empty", paragraph(&[]), paragraph(&[]), &[])?;
    Ok(())
}

#[test]
fn split_and_join_support_nonzero_root_indices_and_report_exact_child_ranges() -> TestResult {
    let context = EditorContext::default();
    let split_initial = state(
        &context,
        &[
            paragraph(&[text_node("prefix", false)]),
            paragraph(&[text_node("abcd", false)]),
            paragraph(&[text_node("suffix", false)]),
        ],
        "split-nonzero-index",
    )?;
    let split =
        ParagraphSplit::capture(&context, split_initial.document(), path(&[1])?, offset(2)?)?;
    let split_commit = committed(
        Transaction::new(&split_initial, vec![split.into()]).apply(&context, &split_initial)?,
    )?;
    assert_paragraph_runs(split_commit.after().document(), 0, &[("prefix", false)])?;
    assert_paragraph_runs(split_commit.after().document(), 1, &[("ab", false)])?;
    assert_paragraph_runs(split_commit.after().document(), 2, &[("cd", false)])?;
    assert_paragraph_runs(split_commit.after().document(), 3, &[("suffix", false)])?;
    let split_change = split_commit
        .changes()
        .iter()
        .next()
        .and_then(breditor_core::operation::Change::as_children)
        .ok_or_else(|| test_error("nonzero split omitted its child change"))?;
    assert_eq!(
        (split_change.old_child_range().start(), split_change.old_child_range().end()),
        (1, 2)
    );
    assert_eq!(
        (split_change.new_child_range().start(), split_change.new_child_range().end()),
        (1, 3)
    );

    let join_initial = state(
        &context,
        &[
            paragraph(&[text_node("prefix", false)]),
            paragraph(&[text_node("ab", false)]),
            paragraph(&[text_node("CD", true)]),
            paragraph(&[text_node("suffix", false)]),
        ],
        "join-nonzero-index",
    )?;
    let join = ParagraphJoin::capture(&context, join_initial.document(), path(&[1])?)?;
    let join_commit = committed(
        Transaction::new(&join_initial, vec![join.into()]).apply(&context, &join_initial)?,
    )?;
    assert_paragraph_runs(join_commit.after().document(), 0, &[("prefix", false)])?;
    assert_paragraph_runs(join_commit.after().document(), 1, &[("ab", false), ("CD", true)])?;
    assert_paragraph_runs(join_commit.after().document(), 2, &[("suffix", false)])?;
    let join_change = join_commit
        .changes()
        .iter()
        .next()
        .and_then(breditor_core::operation::Change::as_children)
        .ok_or_else(|| test_error("nonzero join omitted its child change"))?;
    assert_eq!(
        (join_change.old_child_range().start(), join_change.old_child_range().end()),
        (1, 3)
    );
    assert_eq!(
        (join_change.new_child_range().start(), join_change.new_child_range().end()),
        (1, 2)
    );
    Ok(())
}

#[test]
fn join_rejects_a_missing_right_sibling_and_an_exact_guard_mismatch() -> TestResult {
    let context = EditorContext::default();
    let single = state(&context, &[paragraph(&[text_node("only", false)])], "join-missing-right")?;
    let left_path = path(&[0])?;
    assert_eq!(
        ParagraphJoin::capture(&context, single.document(), left_path.clone()),
        Err(ParagraphJoinApplyError::MissingRightSibling { left_path: left_path.clone() })
    );

    let guarded = state(
        &context,
        &[paragraph(&[text_node("left", false)]), paragraph(&[text_node("right", false)])],
        "join-guard-mismatch",
    )?;
    let expected_left = fragment(&[("left", false)])?;
    let wrong_right = fragment(&[("wrong", false)])?;
    let join = ParagraphJoin::try_new(left_path, expected_left, wrong_right.clone())?;
    assert_eq!(
        transaction_error(Transaction::new(&guarded, vec![join.into()]).apply(&context, &guarded))?,
        TransactionApplyError::Operation {
            operation_index: 0,
            source: OperationApplyError::ParagraphJoin(ParagraphJoinApplyError::ExpectedMismatch {
                side: ParagraphJoinSide::Right,
                expected: wrong_right,
                actual: fragment(&[("right", false)])?,
            },),
        }
    );
    Ok(())
}

#[test]
fn split_and_join_inverses_support_exact_commit_undo_and_redo() -> TestResult {
    let context = EditorContext::default();
    let split_initial = state(
        &context,
        &[paragraph(&[text_node("ab", false), text_node("CD", true)])],
        "split-history",
    )?;
    let split =
        ParagraphSplit::capture(&context, split_initial.document(), path(&[0])?, offset(2)?)?;
    let split_commit = committed(
        Transaction::new(&split_initial, vec![split.into()]).apply(&context, &split_initial)?,
    )?;
    let Some(Operation::ParagraphJoin(split_inverse)) = split_commit.inverse_operations().first()
    else {
        return Err(test_error("split did not emit one paragraph-join inverse").into());
    };
    assert_eq!(split_inverse.expected_left(), &fragment(&[("ab", false)])?);
    assert_eq!(split_inverse.expected_right(), &fragment(&[("CD", true)])?);
    let split_undo = committed(
        split_commit
            .undo_transaction(split_commit.after())?
            .apply(&context, split_commit.after())?,
    )?;
    assert_eq!(split_undo.after().document(), split_initial.document());
    assert_eq!(split_undo.revision(), Revision::new(2));
    let split_redo = committed(
        split_commit.redo_transaction(split_undo.after())?.apply(&context, split_undo.after())?,
    )?;
    assert_eq!(split_redo.after().document(), split_commit.after().document());
    assert_eq!(split_redo.revision(), Revision::new(3));

    let join_initial = state(
        &context,
        &[paragraph(&[text_node("ab", false)]), paragraph(&[text_node("cd", false)])],
        "join-history",
    )?;
    let join = ParagraphJoin::capture(&context, join_initial.document(), path(&[0])?)?;
    let join_commit = committed(
        Transaction::new(&join_initial, vec![join.into()]).apply(&context, &join_initial)?,
    )?;
    let Some(Operation::ParagraphSplit(join_inverse)) = join_commit.inverse_operations().first()
    else {
        return Err(test_error("join did not emit one paragraph-split inverse").into());
    };
    assert_eq!(join_inverse.offset(), offset(2)?);
    assert_eq!(join_inverse.expected(), &fragment(&[("abcd", false)])?);
    let join_undo = committed(
        join_commit.undo_transaction(join_commit.after())?.apply(&context, join_commit.after())?,
    )?;
    assert_eq!(join_undo.after().document(), join_initial.document());
    let join_redo = committed(
        join_commit.redo_transaction(join_undo.after())?.apply(&context, join_undo.after())?,
    )?;
    assert_eq!(join_redo.after().document(), join_commit.after().document());
    Ok(())
}

#[test]
fn mixed_text_and_structure_changes_keep_variant_ranges_and_operation_indices() -> TestResult {
    let context = EditorContext::default();
    let initial = state(&context, &[paragraph(&[text_node("ab", false)])], "mixed-changes")?;
    let insert = TextSplice::try_new(
        TextRange::try_new(path(&[0])?, offset(0)?, offset(0)?)?,
        TextFragment::empty(),
        fragment(&[("X", true)])?,
    )?;
    let split =
        ParagraphSplit::try_new(path(&[0])?, offset(1)?, fragment(&[("X", true), ("ab", false)])?)?;
    let commit = committed(
        Transaction::new(&initial, vec![insert.into(), split.into()]).apply(&context, &initial)?,
    )?;
    assert_paragraph_runs(commit.after().document(), 0, &[("X", true)])?;
    assert_paragraph_runs(commit.after().document(), 1, &[("ab", false)])?;
    assert_eq!(commit.changes().len(), 2);

    let text = commit
        .changes()
        .iter()
        .next()
        .and_then(breditor_core::operation::Change::as_text)
        .ok_or_else(|| test_error("operation zero did not emit a text change"))?;
    assert_eq!(text.operation_index(), 0);
    assert_eq!(text.container_path(), &path(&[0])?);
    assert_eq!((text.old_child_range().start(), text.old_child_range().end()), (0, 1));
    assert_eq!((text.new_child_range().start(), text.new_child_range().end()), (0, 2));

    let children = commit
        .changes()
        .iter()
        .nth(1)
        .and_then(breditor_core::operation::Change::as_children)
        .ok_or_else(|| test_error("operation one did not emit a children change"))?;
    assert_eq!(children.operation_index(), 1);
    assert_eq!(children.parent_path(), &NodePath::root());
    assert_eq!((children.old_child_range().start(), children.old_child_range().end()), (0, 1));
    assert_eq!((children.new_child_range().start(), children.new_child_range().end()), (0, 2));
    Ok(())
}

#[test]
fn change_indices_address_the_filtered_forward_operation_list() -> TestResult {
    let context = EditorContext::default();
    let initial =
        state(&context, &[paragraph(&[text_node("ab", false)])], "filtered-change-index")?;
    let no_op = TextSplice::try_new(
        TextRange::try_new(path(&[0])?, TextOffset::ZERO, TextOffset::ZERO)?,
        TextFragment::empty(),
        TextFragment::empty(),
    )?;
    let split = ParagraphSplit::capture(&context, initial.document(), path(&[0])?, offset(1)?)?;
    let commit = committed(
        Transaction::new(&initial, vec![no_op.into(), split.clone().into()])
            .apply(&context, &initial)?,
    )?;

    assert_eq!(commit.forward_operations(), &[Operation::ParagraphSplit(split)]);
    let change = commit
        .changes()
        .iter()
        .next()
        .ok_or_else(|| test_error("split omitted its structural change"))?;
    assert_eq!(change.operation_index(), 0);
    assert!(commit.forward_operations().get(change.operation_index()).is_some());
    Ok(())
}

#[test]
fn a_late_structural_failure_rejects_the_entire_multi_operation_batch() -> TestResult {
    let context = EditorContext::default();
    let initial = state(&context, &[paragraph(&[text_node("ab", false)])], "structure-atomicity")?;
    let original = initial.clone();
    let split = ParagraphSplit::capture(&context, initial.document(), path(&[0])?, offset(1)?)?;
    let wrong_right = fragment(&[("wrong", false)])?;
    let join =
        ParagraphJoin::try_new(path(&[0])?, fragment(&[("a", false)])?, wrong_right.clone())?;
    assert_eq!(
        transaction_error(
            Transaction::new(&initial, vec![split.into(), join.into()]).apply(&context, &initial),
        )?,
        TransactionApplyError::Operation {
            operation_index: 1,
            source: OperationApplyError::ParagraphJoin(ParagraphJoinApplyError::ExpectedMismatch {
                side: ParagraphJoinSide::Right,
                expected: wrong_right,
                actual: fragment(&[("b", false)])?,
            },),
        }
    );
    assert_eq!(initial, original);
    assert_eq!(initial.snapshot().revision(), Revision::ZERO);
    Ok(())
}

#[test]
fn split_rejects_root_child_and_total_node_limit_overruns_atomically() -> TestResult {
    let child_limits = DocumentLimits::default().with_max_children_per_element(1);
    let child_context = EditorContext::new(CompiledSchema::breditor_base(), child_limits);
    let child_initial = state(&child_context, &[paragraph(&[])], "split-child-limit")?;
    let child_original = child_initial.clone();
    let child_split = ParagraphSplit::capture(
        &child_context,
        child_initial.document(),
        path(&[0])?,
        TextOffset::ZERO,
    )?;
    let child_report = split_invalid_result(
        Transaction::new(&child_initial, vec![child_split.into()])
            .apply(&child_context, &child_initial),
    )?;
    assert_limit(&child_report, &NodePath::root(), LimitKind::ChildCount, 2, 1);
    assert_eq!(child_initial, child_original);

    let node_limits = DocumentLimits::default().with_max_nodes(2);
    let node_context = EditorContext::new(CompiledSchema::breditor_base(), node_limits);
    let node_initial = state(&node_context, &[paragraph(&[])], "split-node-limit")?;
    let node_original = node_initial.clone();
    let node_split = ParagraphSplit::capture(
        &node_context,
        node_initial.document(),
        path(&[0])?,
        TextOffset::ZERO,
    )?;
    let node_report = split_invalid_result(
        Transaction::new(&node_initial, vec![node_split.into()])
            .apply(&node_context, &node_initial),
    )?;
    assert_limit(&node_report, &path(&[1])?, LimitKind::NodeCount, 3, 2);
    assert_eq!(node_initial, node_original);
    Ok(())
}

#[test]
fn join_seam_text_limit_returns_the_exact_authoritative_validation_report() -> TestResult {
    let context = EditorContext::new(
        CompiledSchema::breditor_base(),
        DocumentLimits::default().with_max_text_bytes(5),
    );
    let source_paragraphs =
        [paragraph(&[text_node("abc", false)]), paragraph(&[text_node("def", false)])];
    let initial = state(&context, &source_paragraphs, "join-text-limit")?;
    let original = initial.clone();
    let join = ParagraphJoin::capture(&context, initial.document(), path(&[0])?)?;
    let report = join_invalid_result(
        Transaction::new(&initial, vec![join.into()]).apply(&context, &initial),
    )?;
    let authoritative =
        authoritative_report(&context, &[paragraph(&[text_node("abcdef", false)])])?;
    assert_eq!(report, authoritative);
    assert_limit(&report, &path(&[0, 0])?, LimitKind::TextBytes, 6, 5);
    assert_eq!(initial, original);
    Ok(())
}

#[test]
fn join_child_limit_returns_the_exact_authoritative_validation_report() -> TestResult {
    let context = EditorContext::new(
        CompiledSchema::breditor_base(),
        DocumentLimits::default().with_max_children_per_element(2),
    );
    let source_paragraphs = [
        paragraph(&[text_node("a", false)]),
        paragraph(&[text_node("B", true), text_node("c", false)]),
    ];
    let initial = state(&context, &source_paragraphs, "join-child-limit")?;
    let original = initial.clone();
    let join = ParagraphJoin::capture(&context, initial.document(), path(&[0])?)?;
    let report = join_invalid_result(
        Transaction::new(&initial, vec![join.into()]).apply(&context, &initial),
    )?;
    let authoritative = authoritative_report(
        &context,
        &[paragraph(&[text_node("a", false), text_node("B", true), text_node("c", false)])],
    )?;
    assert_eq!(report, authoritative);
    assert_limit(&report, &path(&[0])?, LimitKind::ChildCount, 3, 2);
    assert_eq!(initial, original);
    Ok(())
}
