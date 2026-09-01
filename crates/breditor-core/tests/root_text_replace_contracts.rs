//! Black-box contracts for atomic text replacement across direct-root paragraphs.

mod support;

use breditor_core::{
    codec::{DocumentCodecError, DocumentJsonCodec},
    document::{
        Document, Format, FormatSet, NodeLookupError, PropertyMap, TextFragment,
        TextFragmentSplitError, TextRun,
    },
    identity::QualifiedName,
    operation::{
        Change, Operation, OperationApplyError, RootTextBoundary, RootTextBoundaryError,
        RootTextFragmentRole, RootTextRange, RootTextRangeBoundary, RootTextRangeError,
        RootTextReplace, RootTextReplaceApplyError, RootTextReplaceError,
    },
    position::{Affinity, NodePath, Point, TextOffset},
    schema::{CompiledSchema, DocumentLimits, LimitKind, ValidationDetail, ValidationReport},
    selection::{RangeSelection, Selection},
    session::EditorSession,
    state::{EditorContext, EditorState, LineageId, Revision},
    transaction::{
        Commit, HistoryIntent, PendingFormatsUpdate, SelectionUpdate, Transaction,
        TransactionApplyError, TransactionMetadata, TransactionOutcome,
    },
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
    if runs.is_empty() {
        return Ok(TextFragment::empty());
    }
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

fn boundary(
    paragraph_index: u32,
    text_offset: u64,
) -> Result<RootTextBoundary, Box<dyn std::error::Error>> {
    RootTextBoundary::try_new(path(&[paragraph_index])?, offset(text_offset)?).map_err(Into::into)
}

fn range(
    start_paragraph: u32,
    start_offset: u64,
    end_paragraph: u32,
    end_offset: u64,
) -> Result<RootTextRange, Box<dyn std::error::Error>> {
    RootTextRange::try_new(
        boundary(start_paragraph, start_offset)?,
        boundary(end_paragraph, end_offset)?,
    )
    .map_err(Into::into)
}

fn state(
    context: &EditorContext,
    paragraphs: &[Value],
    lineage: &str,
) -> Result<EditorState, Box<dyn std::error::Error>> {
    state_with_cursor(context, paragraphs, lineage, None, None)
}

fn state_with_cursor(
    context: &EditorContext,
    paragraphs: &[Value],
    lineage: &str,
    selection: Option<Selection>,
    pending_formats: Option<FormatSet>,
) -> Result<EditorState, Box<dyn std::error::Error>> {
    let document = DocumentJsonCodec::new(context.schema().clone())
        .with_limits(context.limits().clone())
        .decode(&document_json(paragraphs))?;
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

fn root_replace_invalid_result(
    result: Result<TransactionOutcome, TransactionApplyError>,
) -> Result<ValidationReport, Box<dyn std::error::Error>> {
    match result {
        Err(TransactionApplyError::Operation {
            operation_index: 0,
            source:
                OperationApplyError::RootTextReplace(RootTextReplaceApplyError::InvalidResult(report)),
        }) => Ok(report),
        Err(error) => {
            Err(test_error(format!("expected invalid root-text result, got {error}")).into())
        }
        Ok(outcome) => {
            Err(test_error(format!("expected invalid root-text result, got {outcome:?}")).into())
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
    assert!(
        report.iter().any(|issue| {
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
        }),
        "missing {kind:?} ({actual} > {maximum}) at {issue_path:?} in {report:?}"
    );
}

fn collapsed_selection(
    paragraph: u32,
    child: u32,
    text_offset: u32,
    anchor_affinity: Affinity,
    focus_affinity: Affinity,
) -> Result<Selection, Box<dyn std::error::Error>> {
    let text_path = path(&[paragraph, child])?;
    Ok(RangeSelection::new(
        Point::Text {
            text_path: text_path.clone(),
            utf16_offset: text_offset,
            affinity: anchor_affinity,
        },
        Point::Text { text_path, utf16_offset: text_offset, affinity: focus_affinity },
    )
    .into())
}

#[test]
fn boundaries_and_ranges_enforce_direct_root_forward_coordinates() -> TestResult {
    assert_eq!(
        RootTextBoundary::try_new(NodePath::root(), TextOffset::ZERO),
        Err(RootTextBoundaryError::ParagraphPathDepth { actual: 0 })
    );
    assert_eq!(
        RootTextBoundary::try_new(path(&[1, 0])?, TextOffset::ZERO),
        Err(RootTextBoundaryError::ParagraphPathDepth { actual: 2 })
    );

    let start = boundary(2, 3)?;
    let end = boundary(4, 1)?;
    let forward = RootTextRange::try_new(start.clone(), end.clone())?;
    assert_eq!(forward.start(), &start);
    assert_eq!(forward.end(), &end);
    assert_eq!(forward.paragraph_count(), 3);
    assert!(!forward.is_empty());
    assert_eq!(forward.start().paragraph_path(), &path(&[2])?);
    assert_eq!(forward.start().paragraph_index(), 2);
    assert_eq!(forward.start().offset(), offset(3)?);

    let empty = RootTextRange::try_new(start.clone(), start.clone())?;
    assert_eq!(empty.paragraph_count(), 1);
    assert!(empty.is_empty());
    assert_eq!(
        RootTextRange::try_new(end.clone(), start.clone()),
        Err(RootTextRangeError::ReversedParagraphOrder { start: 4, end: 2 })
    );
    assert_eq!(
        RootTextRange::try_new(boundary(2, 4)?, boundary(2, 3)?),
        Err(RootTextRangeError::ReversedOffsets { start: offset(4)?, end: offset(3)? })
    );
    assert_eq!(
        RootTextRange::try_new(boundary(u32::MAX, 0)?, boundary(u32::MAX, 0)?),
        Err(RootTextRangeError::ParagraphSpanOverflow)
    );
    Ok(())
}

#[test]
fn capture_bounds_the_source_span_before_any_range_sized_allocation() -> TestResult {
    let context = EditorContext::default();
    let initial =
        state(&context, &[paragraph(&[text_node("only", false)])], "root-capture-range-bound")?;
    let huge_end = u32::MAX - 1;
    let huge_range = range(0, 0, huge_end, 0)?;
    assert_eq!(huge_range.paragraph_count(), u32::MAX);
    assert_eq!(
        RootTextReplace::capture(
            &context,
            initial.document(),
            huge_range,
            vec![TextFragment::empty()],
        ),
        Err(RootTextReplaceApplyError::NodeLookup(NodeLookupError::ChildIndexOutOfBounds {
            path: path(&[huge_end])?,
            depth: 0,
            child_index: huge_end,
            child_count: 1,
        },))
    );

    let exact = RootTextReplace::capture(
        &context,
        initial.document(),
        range(0, 0, 0, 4)?,
        vec![TextFragment::empty()],
    )?;
    assert_eq!(exact.expected_paragraphs(), &[fragment(&[("only", false)])?]);
    Ok(())
}

#[test]
fn constructor_enforces_guard_count_nonempty_replacement_and_scalar_boundaries() -> TestResult {
    let guarded = fragment(&[("a😀b", false)])?;
    assert_eq!(
        RootTextReplace::try_new(range(1, 0, 2, 0)?, vec![guarded.clone()], vec![fragment(&[])?]),
        Err(RootTextReplaceError::ExpectedParagraphCount { range_count: 2, actual: 1 })
    );
    assert_eq!(
        RootTextReplace::try_new(range(0, 0, 0, 0)?, vec![guarded.clone()], Vec::new()),
        Err(RootTextReplaceError::EmptyReplacement)
    );
    assert_eq!(
        RootTextReplace::try_new(
            range(u32::MAX - 1, 0, u32::MAX - 1, 0)?,
            vec![TextFragment::empty()],
            vec![TextFragment::empty(), TextFragment::empty()],
        ),
        Err(RootTextReplaceError::ResultParagraphRangeOverflow {
            start: u32::MAX - 1,
            replacement_count: 2,
        })
    );

    let split_start = offset(2)?;
    assert_eq!(
        RootTextReplace::try_new(range(0, 2, 0, 3)?, vec![guarded.clone()], vec![fragment(&[])?],),
        Err(RootTextReplaceError::BoundarySplit {
            boundary: RootTextRangeBoundary::Start,
            source: TextFragmentSplitError::OffsetSplitsScalar { requested: split_start },
        })
    );
    assert_eq!(
        RootTextReplace::try_new(range(0, 1, 0, 2)?, vec![guarded.clone()], vec![fragment(&[])?],),
        Err(RootTextReplaceError::BoundarySplit {
            boundary: RootTextRangeBoundary::End,
            source: TextFragmentSplitError::OffsetSplitsScalar { requested: offset(1)? },
        })
    );
    assert_eq!(
        RootTextReplace::try_new(range(0, 0, 0, 5)?, vec![guarded], vec![fragment(&[])?],),
        Err(RootTextReplaceError::BoundarySplit {
            boundary: RootTextRangeBoundary::End,
            source: TextFragmentSplitError::OffsetOutOfBounds {
                requested: offset(5)?,
                length: offset(4)?,
            },
        })
    );
    Ok(())
}

#[test]
fn capture_records_every_complete_guard_across_nonzero_paragraphs() -> TestResult {
    let context = EditorContext::default();
    let paragraphs = [
        paragraph(&[text_node("outside-left", false)]),
        paragraph(&[text_node("ab", false), text_node("CD", true)]),
        paragraph(&[text_node("middle", true)]),
        paragraph(&[text_node("EF", true), text_node("gh", false)]),
        paragraph(&[text_node("outside-right", false)]),
    ];
    let initial = state(&context, &paragraphs, "root-capture-guards")?;
    let replacement = vec![fragment(&[("insert", false)])?];
    let operation = RootTextReplace::capture(
        &context,
        initial.document(),
        range(1, 1, 3, 1)?,
        replacement.clone(),
    )?;
    assert_eq!(operation.range(), &range(1, 1, 3, 1)?);
    assert_eq!(
        operation.expected_paragraphs(),
        &[
            fragment(&[("ab", false), ("CD", true)])?,
            fragment(&[("middle", true)])?,
            fragment(&[("EF", true), ("gh", false)])?,
        ]
    );
    assert_eq!(operation.replacement_paragraphs(), replacement);
    Ok(())
}

#[test]
fn one_many_and_empty_replacement_paragraphs_have_native_structural_semantics() -> TestResult {
    let context = EditorContext::default();
    let source = [
        paragraph(&[text_node("keep", false)]),
        paragraph(&[text_node("ab", false)]),
        paragraph(&[text_node("middle", true)]),
        paragraph(&[text_node("ef", false)]),
        paragraph(&[text_node("tail", true)]),
    ];

    let one = state(&context, &source, "root-one")?;
    let one_op = RootTextReplace::capture(
        &context,
        one.document(),
        range(1, 1, 3, 1)?,
        vec![fragment(&[("X", true)])?],
    )?;
    let one_commit = committed(Transaction::new(&one, vec![one_op.into()]).apply(&context, &one)?)?;
    assert_paragraph_count(one_commit.after().document(), 3)?;
    assert_paragraph_runs(one_commit.after().document(), 0, &[("keep", false)])?;
    assert_paragraph_runs(
        one_commit.after().document(),
        1,
        &[("a", false), ("X", true), ("f", false)],
    )?;
    assert_paragraph_runs(one_commit.after().document(), 2, &[("tail", true)])?;

    let many = state(&context, &source, "root-many")?;
    let many_op = RootTextReplace::capture(
        &context,
        many.document(),
        range(1, 1, 3, 1)?,
        vec![fragment(&[("X", true)])?, fragment(&[("Y", false)])?, fragment(&[("Z", true)])?],
    )?;
    let many_commit =
        committed(Transaction::new(&many, vec![many_op.into()]).apply(&context, &many)?)?;
    assert_paragraph_count(many_commit.after().document(), 5)?;
    assert_paragraph_runs(many_commit.after().document(), 1, &[("a", false), ("X", true)])?;
    assert_paragraph_runs(many_commit.after().document(), 2, &[("Y", false)])?;
    assert_paragraph_runs(many_commit.after().document(), 3, &[("Z", true), ("f", false)])?;

    let empty = state(&context, &source, "root-empty-fragment")?;
    let empty_op = RootTextReplace::capture(
        &context,
        empty.document(),
        range(1, 1, 3, 1)?,
        vec![TextFragment::empty()],
    )?;
    let empty_commit =
        committed(Transaction::new(&empty, vec![empty_op.into()]).apply(&context, &empty)?)?;
    assert_paragraph_count(empty_commit.after().document(), 3)?;
    assert_paragraph_runs(empty_commit.after().document(), 1, &[("af", false)])?;
    Ok(())
}

#[test]
fn same_paragraph_source_has_an_exact_same_type_inverse_and_double_inverse() -> TestResult {
    let context = EditorContext::default();
    let source = [
        paragraph(&[text_node("off", true)]),
        paragraph(&[text_node("ab", false), text_node("CD", true), text_node("ef", false)]),
    ];
    let initial = state(&context, &source, "root-same-paragraph-inverse")?;
    let operation = RootTextReplace::capture(
        &context,
        initial.document(),
        range(1, 1, 1, 4)?,
        vec![fragment(&[("X", false)])?, fragment(&[("Y", true)])?],
    )?;
    let commit = committed(
        Transaction::new(&initial, vec![operation.clone().into()]).apply(&context, &initial)?,
    )?;
    assert_paragraph_count(commit.after().document(), 3)?;
    assert_paragraph_runs(commit.after().document(), 1, &[("aX", false)])?;
    assert_paragraph_runs(commit.after().document(), 2, &[("Y", true), ("ef", false)])?;
    assert_eq!(commit.inverse_operations().len(), 1);

    let inverse_commit = committed(
        Transaction::new(commit.after(), commit.inverse_operations().to_vec())
            .apply(&context, commit.after())?,
    )?;
    assert_eq!(inverse_commit.after().document(), initial.document());
    assert_eq!(inverse_commit.inverse_operations(), &[Operation::RootTextReplace(operation)]);
    Ok(())
}

#[test]
fn guards_report_the_first_source_order_mismatch_with_exact_index_and_path() -> TestResult {
    let context = EditorContext::default();
    let source = [
        paragraph(&[text_node("off", false)]),
        paragraph(&[text_node("one", false)]),
        paragraph(&[text_node("two", true)]),
        paragraph(&[text_node("three", false)]),
    ];
    let authored = state(&context, &source, "root-guard-authored")?;
    let operation = RootTextReplace::capture(
        &context,
        authored.document(),
        range(1, 1, 3, 2)?,
        vec![fragment(&[("X", false)])?],
    )?;
    let changed_source = [
        paragraph(&[text_node("off", false)]),
        paragraph(&[text_node("one", false)]),
        paragraph(&[text_node("TWO", true)]),
        paragraph(&[text_node("THREE", false)]),
    ];
    let actual = state(&context, &changed_source, "root-guard-actual")?;
    assert_eq!(
        transaction_error(
            Transaction::new(&actual, vec![operation.into()]).apply(&context, &actual),
        )?,
        TransactionApplyError::Operation {
            operation_index: 0,
            source: OperationApplyError::RootTextReplace(
                RootTextReplaceApplyError::ExpectedMismatch {
                    paragraph_offset: 1,
                    path: path(&[2])?,
                    expected: fragment(&[("two", true)])?,
                    actual: fragment(&[("TWO", true)])?,
                },
            ),
        }
    );
    Ok(())
}

#[test]
fn canonical_equal_format_seams_preserve_unicode_and_do_not_normalize() -> TestResult {
    let context = EditorContext::default();
    let decomposed = "e\u{301}";
    let source = [
        paragraph(&[text_node("a😀", false), text_node("B", true)]),
        paragraph(&[text_node("界", true), text_node(decomposed, false)]),
    ];
    let initial = state(&context, &source, "root-unicode-seams")?;
    let operation = RootTextReplace::capture(
        &context,
        initial.document(),
        range(0, 1, 1, 1)?,
        vec![fragment(&[("X", false)])?, fragment(&[("\n😀", false)])?],
    )?;
    let commit =
        committed(Transaction::new(&initial, vec![operation.into()]).apply(&context, &initial)?)?;
    assert_paragraph_runs(commit.after().document(), 0, &[("aX", false)])?;
    assert_paragraph_runs(
        commit.after().document(),
        1,
        &[(format!("\n😀{decomposed}").as_str(), false)],
    )?;
    let node = commit.after().document().node_at(&path(&[1, 0])?)?;
    assert_eq!(
        node.as_text().ok_or_else(|| test_error("missing Unicode text"))?.text(),
        "\n😀e\u{301}"
    );
    Ok(())
}

#[test]
fn changed_operation_emits_one_conservative_root_children_change() -> TestResult {
    let context = EditorContext::default();
    let initial = state(
        &context,
        &[
            paragraph(&[text_node("left", false)]),
            paragraph(&[text_node("ab", false)]),
            paragraph(&[text_node("cd", false)]),
            paragraph(&[text_node("right", false)]),
        ],
        "root-change",
    )?;
    let operation = RootTextReplace::capture(
        &context,
        initial.document(),
        range(1, 1, 2, 1)?,
        vec![fragment(&[("X", true)])?, fragment(&[("Y", false)])?, fragment(&[])?],
    )?;
    let commit = committed(
        Transaction::new(&initial, vec![operation.clone().into()]).apply(&context, &initial)?,
    )?;
    assert_eq!(commit.forward_operations(), &[Operation::RootTextReplace(operation)]);
    assert_eq!(commit.changes().len(), 1);
    let change = commit
        .changes()
        .iter()
        .next()
        .and_then(|change| change.as_children())
        .ok_or_else(|| test_error("root replacement omitted its children change"))?;
    assert_eq!(change.operation_index(), 0);
    assert_eq!(change.parent_path(), &NodePath::root());
    assert_eq!(change.old_child_range().start(), 1);
    assert_eq!(change.old_child_range().end(), 3);
    assert_eq!(change.new_child_range().start(), 1);
    assert_eq!(change.new_child_range().end(), 4);
    Ok(())
}

#[test]
fn unchanged_operations_are_filtered_and_changed_operation_indexes_are_dense() -> TestResult {
    let context = EditorContext::default();
    let initial = state(
        &context,
        &[paragraph(&[text_node("ab", false)]), paragraph(&[text_node("cd", false)])],
        "root-filtering",
    )?;
    let unchanged = RootTextReplace::capture(
        &context,
        initial.document(),
        range(0, 1, 0, 1)?,
        vec![TextFragment::empty()],
    )?;
    assert_eq!(
        Transaction::new(&initial, vec![unchanged.clone().into()]).apply(&context, &initial)?,
        TransactionOutcome::Unchanged
    );
    let changed = RootTextReplace::capture(
        &context,
        initial.document(),
        range(1, 1, 1, 1)?,
        vec![fragment(&[("X", true)])?],
    )?;
    let commit = committed(
        Transaction::new(&initial, vec![unchanged.into(), changed.clone().into()])
            .apply(&context, &initial)?,
    )?;
    assert_eq!(commit.forward_operations(), &[Operation::RootTextReplace(changed)]);
    assert_eq!(commit.changes().len(), 1);
    assert_eq!(commit.changes().iter().next().map(Change::operation_index), Some(0));
    Ok(())
}

#[test]
fn multiple_changed_root_operations_keep_transaction_operation_indexes() -> TestResult {
    let context = EditorContext::default();
    let initial = state(
        &context,
        &[paragraph(&[text_node("ab", false)]), paragraph(&[text_node("cd", false)])],
        "root-operation-indexes",
    )?;
    let first = RootTextReplace::capture(
        &context,
        initial.document(),
        range(0, 1, 0, 1)?,
        vec![fragment(&[("X", true)])?],
    )?;
    let second = RootTextReplace::capture(
        &context,
        initial.document(),
        range(1, 1, 1, 1)?,
        vec![fragment(&[("Y", true)])?],
    )?;
    let commit = committed(
        Transaction::new(&initial, vec![first.into(), second.into()]).apply(&context, &initial)?,
    )?;
    assert_eq!(
        commit.changes().iter().map(Change::operation_index).collect::<Vec<_>>(),
        vec![0, 1]
    );
    Ok(())
}

#[test]
fn rebuilding_shares_off_span_paragraph_allocations() -> TestResult {
    let context = EditorContext::default();
    let initial = state(
        &context,
        &[
            paragraph(&[text_node("left", false)]),
            paragraph(&[text_node("ab", false)]),
            paragraph(&[text_node("cd", true)]),
            paragraph(&[text_node("right", false)]),
        ],
        "root-sharing",
    )?;
    let operation = RootTextReplace::capture(
        &context,
        initial.document(),
        range(1, 1, 2, 1)?,
        vec![fragment(&[("X", false)])?, fragment(&[("Y", true)])?],
    )?;
    let commit =
        committed(Transaction::new(&initial, vec![operation.into()]).apply(&context, &initial)?)?;
    let before_root = initial.document().root().as_element().ok_or_else(|| test_error("root"))?;
    let after_root =
        commit.after().document().root().as_element().ok_or_else(|| test_error("root"))?;
    for index in [0, 3] {
        let before = before_root
            .children()
            .get(index)
            .and_then(|node| node.as_element())
            .ok_or_else(|| test_error("missing before paragraph"))?;
        let after = after_root
            .children()
            .get(index)
            .and_then(|node| node.as_element())
            .ok_or_else(|| test_error("missing after paragraph"))?;
        assert!(std::ptr::eq(before, after));
    }
    Ok(())
}

#[test]
fn replacement_fragment_envelope_limits_fail_before_publication() -> TestResult {
    let leaf_context = EditorContext::new(
        CompiledSchema::breditor_base(),
        DocumentLimits::default().with_max_text_bytes(5),
    );
    let leaf_state =
        state(&leaf_context, &[paragraph(&[text_node("a", false)])], "root-fragment-leaf")?;
    assert_eq!(
        RootTextReplace::capture(
            &leaf_context,
            leaf_state.document(),
            range(0, 0, 0, 1)?,
            vec![fragment(&[("123456", false)])?],
        ),
        Err(RootTextReplaceApplyError::FragmentTextBytesLimit {
            role: RootTextFragmentRole::Replacement,
            paragraph_index: 0,
            run_index: 0,
            actual: 6,
            maximum: 5,
        })
    );

    let count_context = EditorContext::new(
        CompiledSchema::breditor_base(),
        DocumentLimits::default().with_max_children_per_element(2),
    );
    let count_state =
        state(&count_context, &[paragraph(&[text_node("a", false)])], "root-fragment-count")?;
    assert_eq!(
        RootTextReplace::capture(
            &count_context,
            count_state.document(),
            range(0, 0, 0, 1)?,
            vec![TextFragment::empty(), TextFragment::empty(), TextFragment::empty()],
        ),
        Err(RootTextReplaceApplyError::ParagraphCountLimit {
            role: RootTextFragmentRole::Replacement,
            actual: 3,
            maximum: 2,
        })
    );
    Ok(())
}

#[test]
fn derived_leaf_and_paragraph_child_limits_match_authoritative_validation() -> TestResult {
    let leaf_context = EditorContext::new(
        CompiledSchema::breditor_base(),
        DocumentLimits::default().with_max_text_bytes(6),
    );
    let leaf_initial =
        state(&leaf_context, &[paragraph(&[text_node("abcd", false)])], "root-result-leaf")?;
    let leaf_original = leaf_initial.clone();
    let leaf_operation = RootTextReplace::capture(
        &leaf_context,
        leaf_initial.document(),
        range(0, 2, 0, 2)?,
        vec![fragment(&[("XYZ", false)])?],
    )?;
    let leaf_report = root_replace_invalid_result(
        Transaction::new(&leaf_initial, vec![leaf_operation.into()])
            .apply(&leaf_context, &leaf_initial),
    )?;
    let leaf_authoritative =
        authoritative_report(&leaf_context, &[paragraph(&[text_node("abXYZcd", false)])])?;
    assert_eq!(leaf_report, leaf_authoritative);
    assert_limit(&leaf_report, &path(&[0, 0])?, LimitKind::TextBytes, 7, 6);
    assert_eq!(leaf_initial, leaf_original);

    let child_context = EditorContext::new(
        CompiledSchema::breditor_base(),
        DocumentLimits::default().with_max_children_per_element(3),
    );
    let child_source = [paragraph(&[text_node("a", false), text_node("B", true)])];
    let child_initial = state(&child_context, &child_source, "root-result-child")?;
    let child_original = child_initial.clone();
    let child_operation = RootTextReplace::capture(
        &child_context,
        child_initial.document(),
        range(0, 2, 0, 2)?,
        vec![fragment(&[("c", false), ("D", true)])?],
    )?;
    let child_report = root_replace_invalid_result(
        Transaction::new(&child_initial, vec![child_operation.into()])
            .apply(&child_context, &child_initial),
    )?;
    let child_authoritative = authoritative_report(
        &child_context,
        &[paragraph(&[
            text_node("a", false),
            text_node("B", true),
            text_node("c", false),
            text_node("D", true),
        ])],
    )?;
    assert_eq!(child_report, child_authoritative);
    assert_limit(&child_report, &path(&[0])?, LimitKind::ChildCount, 4, 3);
    assert_eq!(child_initial, child_original);
    Ok(())
}

#[test]
fn derived_root_child_node_and_global_total_limits_are_atomic_and_authoritative() -> TestResult {
    let root_context = EditorContext::new(
        CompiledSchema::breditor_base(),
        DocumentLimits::default().with_max_children_per_element(3),
    );
    let root_source = [paragraph(&[]), paragraph(&[]), paragraph(&[])];
    let root_initial = state(&root_context, &root_source, "root-result-root-child")?;
    let root_original = root_initial.clone();
    let root_operation = RootTextReplace::capture(
        &root_context,
        root_initial.document(),
        range(1, 0, 1, 0)?,
        vec![TextFragment::empty(), TextFragment::empty()],
    )?;
    let root_report = root_replace_invalid_result(
        Transaction::new(&root_initial, vec![root_operation.into()])
            .apply(&root_context, &root_initial),
    )?;
    let four_empty = [paragraph(&[]), paragraph(&[]), paragraph(&[]), paragraph(&[])];
    let root_authoritative = authoritative_report(&root_context, &four_empty)?;
    assert_eq!(root_report, root_authoritative);
    assert_limit(&root_report, &NodePath::root(), LimitKind::ChildCount, 4, 3);
    assert_eq!(root_initial, root_original);

    let node_context = EditorContext::new(
        CompiledSchema::breditor_base(),
        DocumentLimits::default().with_max_nodes(2),
    );
    let node_initial = state(&node_context, &[paragraph(&[])], "root-result-node")?;
    let node_original = node_initial.clone();
    let node_operation = RootTextReplace::capture(
        &node_context,
        node_initial.document(),
        range(0, 0, 0, 0)?,
        vec![TextFragment::empty(), TextFragment::empty()],
    )?;
    let node_report = root_replace_invalid_result(
        Transaction::new(&node_initial, vec![node_operation.into()])
            .apply(&node_context, &node_initial),
    )?;
    let node_authoritative =
        authoritative_report(&node_context, &[paragraph(&[]), paragraph(&[])])?;
    assert_eq!(node_report, node_authoritative);
    assert_limit(&node_report, &path(&[1])?, LimitKind::NodeCount, 3, 2);
    assert_eq!(node_initial, node_original);

    let total_context = EditorContext::new(
        CompiledSchema::breditor_base(),
        DocumentLimits::default().with_max_total_text_bytes(6),
    );
    let total_source =
        [paragraph(&[text_node("off", false)]), paragraph(&[text_node("ab", false)])];
    let total_initial = state(&total_context, &total_source, "root-result-total")?;
    let total_original = total_initial.clone();
    let total_operation = RootTextReplace::capture(
        &total_context,
        total_initial.document(),
        range(1, 0, 1, 2)?,
        vec![fragment(&[("WXYZ", false)])?],
    )?;
    let total_report = root_replace_invalid_result(
        Transaction::new(&total_initial, vec![total_operation.into()])
            .apply(&total_context, &total_initial),
    )?;
    let total_candidate =
        [paragraph(&[text_node("off", false)]), paragraph(&[text_node("WXYZ", false)])];
    let total_authoritative = authoritative_report(&total_context, &total_candidate)?;
    assert_eq!(total_report, total_authoritative);
    assert_limit(&total_report, &path(&[1, 0])?, LimitKind::TotalTextBytes, 7, 6);
    assert_eq!(total_initial, total_original);
    Ok(())
}

#[test]
fn global_total_exact_boundary_succeeds_and_counts_off_span_bytes() -> TestResult {
    let context = EditorContext::new(
        CompiledSchema::breditor_base(),
        DocumentLimits::default().with_max_total_text_bytes(7),
    );
    let initial = state(
        &context,
        &[paragraph(&[text_node("off", false)]), paragraph(&[text_node("ab", false)])],
        "root-total-boundary",
    )?;
    let operation = RootTextReplace::capture(
        &context,
        initial.document(),
        range(1, 0, 1, 2)?,
        vec![fragment(&[("WXYZ", false)])?],
    )?;
    let commit =
        committed(Transaction::new(&initial, vec![operation.into()]).apply(&context, &initial)?)?;
    assert_eq!(commit.after().document().summary().total_text_bytes(), 7);
    assert_paragraph_runs(commit.after().document(), 0, &[("off", false)])?;
    assert_paragraph_runs(commit.after().document(), 1, &[("WXYZ", false)])?;
    Ok(())
}

#[test]
fn operation_budget_and_late_guard_failure_reject_the_whole_batch() -> TestResult {
    let context = EditorContext::default().with_max_operations_per_transaction(1);
    let initial = state(
        &context,
        &[paragraph(&[text_node("ab", false)]), paragraph(&[text_node("cd", false)])],
        "root-operation-budget",
    )?;
    let first = RootTextReplace::capture(
        &context,
        initial.document(),
        range(0, 1, 0, 1)?,
        vec![fragment(&[("X", true)])?],
    )?;
    let second = RootTextReplace::capture(
        &context,
        initial.document(),
        range(1, 1, 1, 1)?,
        vec![fragment(&[("Y", true)])?],
    )?;
    assert_eq!(
        transaction_error(
            Transaction::new(&initial, vec![first.into(), second.into()]).apply(&context, &initial),
        )?,
        TransactionApplyError::OperationLimit { actual: 2, maximum: 1 }
    );

    let atomic_context = EditorContext::default();
    let atomic = state(
        &atomic_context,
        &[paragraph(&[text_node("ab", false)]), paragraph(&[text_node("cd", false)])],
        "root-late-atomic",
    )?;
    let original = atomic.clone();
    let first = RootTextReplace::capture(
        &atomic_context,
        atomic.document(),
        range(0, 1, 0, 1)?,
        vec![fragment(&[("X", true)])?],
    )?;
    let wrong_expected = fragment(&[("wrong", false)])?;
    let late = RootTextReplace::try_new(
        range(1, 0, 1, 2)?,
        vec![wrong_expected.clone()],
        vec![fragment(&[("Y", true)])?],
    )?;
    assert_eq!(
        transaction_error(
            Transaction::new(&atomic, vec![first.into(), late.into()])
                .apply(&atomic_context, &atomic),
        )?,
        TransactionApplyError::Operation {
            operation_index: 1,
            source: OperationApplyError::RootTextReplace(
                RootTextReplaceApplyError::ExpectedMismatch {
                    paragraph_offset: 0,
                    path: path(&[1])?,
                    expected: wrong_expected,
                    actual: fragment(&[("cd", false)])?,
                },
            ),
        }
    );
    assert_eq!(atomic, original);
    assert_eq!(atomic.snapshot().revision(), Revision::ZERO);
    Ok(())
}

#[test]
fn session_undo_redo_restores_exact_document_selection_and_pending_formats() -> TestResult {
    let context = EditorContext::default();
    let source = [
        paragraph(&[text_node("keep", false)]),
        paragraph(&[text_node("ab", false)]),
        paragraph(&[text_node("cd", true)]),
    ];
    let before_selection = collapsed_selection(0, 0, 2, Affinity::After, Affinity::Before)?;
    let before_pending = formats(true)?;
    let initial = state_with_cursor(
        &context,
        &source,
        "root-session-history",
        Some(before_selection.clone()),
        Some(before_pending.clone()),
    )?;
    let operation = RootTextReplace::capture(
        &context,
        initial.document(),
        range(1, 1, 2, 1)?,
        vec![fragment(&[("X", false)])?, fragment(&[("Y", true)])?],
    )?;
    let after_selection = collapsed_selection(0, 0, 0, Affinity::Before, Affinity::After)?;
    let after_pending = FormatSet::default();
    let transaction = Transaction::new(&initial, vec![operation.into()])
        .with_selection_update(SelectionUpdate::Set(Some(after_selection.clone())))
        .with_pending_formats_update(PendingFormatsUpdate::Set(Some(after_pending.clone())))
        .with_metadata(TransactionMetadata::new(None, HistoryIntent::Record));
    let mut session = EditorSession::new(initial.clone());
    let edit = committed(session.apply_transaction(&transaction)?)?;
    let after_document = edit.after().document().clone();
    assert_eq!(session.state().selection(), Some(&after_selection));
    assert_eq!(session.state().pending_formats(), Some(&after_pending));

    session.undo()?.ok_or_else(|| test_error("undo unavailable"))?;
    assert_eq!(session.state().document(), initial.document());
    assert_eq!(session.state().selection(), Some(&before_selection));
    assert_eq!(session.state().pending_formats(), Some(&before_pending));

    session.redo()?.ok_or_else(|| test_error("redo unavailable"))?;
    assert_eq!(session.state().document(), &after_document);
    assert_eq!(session.state().selection(), Some(&after_selection));
    assert_eq!(session.state().pending_formats(), Some(&after_pending));
    Ok(())
}
