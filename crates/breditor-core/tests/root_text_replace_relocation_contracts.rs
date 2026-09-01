//! Black-box relocation contracts for native root-text replacement.

mod support;

use std::error::Error;

use breditor_core::{
    codec::DocumentJsonCodec,
    document::{Document, FormatSet, TextFragment, TextRun},
    operation::{
        Change, DeletedPointPolicy, PointRelocation, RootTextBoundary, RootTextRange,
        RootTextReplace, SelectionRelocationPolicy,
    },
    position::{Affinity, NodePath, Point, TextOffset},
    selection::{RangeSelection, Selection},
    state::{EditorContext, EditorState, LineageId},
    transaction::{Commit, Transaction, TransactionOutcome},
};
use serde_json::Value;
use support::{TestResult, document_json, paragraph, path, test_error, text_node};

fn state(
    context: &EditorContext,
    paragraphs: &[Value],
    lineage: &str,
) -> Result<EditorState, Box<dyn Error>> {
    let document = DocumentJsonCodec::new(context.schema().clone())
        .with_limits(context.limits().clone())
        .decode(&document_json(paragraphs))?;
    EditorState::try_new(context, LineageId::try_new(lineage)?, document, None, None)
        .map_err(Into::into)
}

fn fragment(text: &str) -> Result<TextFragment, Box<dyn Error>> {
    if text.is_empty() {
        return Ok(TextFragment::empty());
    }
    Ok(TextRun::try_new(text, FormatSet::default())?.into())
}

fn range(
    start_paragraph: u32,
    start_offset: u64,
    end_paragraph: u32,
    end_offset: u64,
) -> Result<RootTextRange, Box<dyn Error>> {
    let start =
        RootTextBoundary::try_new(path(&[start_paragraph])?, TextOffset::try_new(start_offset)?)?;
    let end = RootTextBoundary::try_new(path(&[end_paragraph])?, TextOffset::try_new(end_offset)?)?;
    RootTextRange::try_new(start, end).map_err(Into::into)
}

fn replace(
    context: &EditorContext,
    source: &EditorState,
    range: RootTextRange,
    replacement: &[&str],
) -> Result<Commit, Box<dyn Error>> {
    let replacement =
        replacement.iter().map(|text| fragment(text)).collect::<Result<Vec<_>, _>>()?;
    let operation = RootTextReplace::capture(context, source.document(), range, replacement)?;
    committed(Transaction::new(source, vec![operation.into()]).apply(context, source)?)
}

fn committed(outcome: TransactionOutcome) -> Result<Commit, Box<dyn Error>> {
    outcome.into_commit().ok_or_else(|| test_error("transaction unexpectedly unchanged").into())
}

fn text_point(
    paragraph_index: u32,
    run_index: u32,
    offset: u32,
    affinity: Affinity,
) -> Result<Point, Box<dyn Error>> {
    Ok(Point::Text {
        text_path: path(&[paragraph_index, run_index])?,
        utf16_offset: offset,
        affinity,
    })
}

fn paragraph_boundary(
    paragraph_index: u32,
    child_index: u32,
    affinity: Affinity,
) -> Result<Point, Box<dyn Error>> {
    Ok(Point::Children { parent_path: path(&[paragraph_index])?, child_index, affinity })
}

fn root_boundary(child_index: u32, affinity: Affinity) -> Point {
    Point::Children { parent_path: NodePath::root(), child_index, affinity }
}

fn assert_exact(
    commit: &Commit,
    source: &EditorState,
    source_point: &Point,
    expected: Point,
) -> TestResult {
    assert_eq!(
        commit.relocation().relocate_point(source, source_point)?,
        PointRelocation::Exact(expected)
    );
    Ok(())
}

fn assert_deleted(
    commit: &Commit,
    source: &EditorState,
    source_point: &Point,
    before: Point,
    after: Point,
) -> TestResult {
    assert_eq!(
        commit.relocation().relocate_point(source, source_point)?,
        PointRelocation::Deleted { before, after }
    );
    Ok(())
}

fn paragraph_text(document: &Document, paragraph_index: u32) -> Result<String, Box<dyn Error>> {
    let paragraph = document
        .node_at(&path(&[paragraph_index])?)?
        .as_element()
        .ok_or_else(|| test_error("paragraph path did not resolve to an element"))?;
    let mut text = String::new();
    for child in paragraph.children() {
        text.push_str(
            child
                .as_text()
                .ok_or_else(|| test_error("paragraph contained a non-text child"))?
                .text(),
        );
    }
    Ok(text)
}

#[test]
fn same_paragraph_replacement_canonicalizes_aliases_utf16_and_affinity_sides() -> TestResult {
    let context = EditorContext::default();
    let source = state(
        &context,
        &[
            paragraph(&[text_node("head", false)]),
            paragraph(&[text_node("a😀", false), text_node("BC", true), text_node("def", false)]),
            paragraph(&[text_node("tail", false)]),
        ],
        "root-replace-same-paragraph",
    )?;
    let commit = replace(&context, &source, range(1, 3, 1, 5)?, &["😀"])?;
    assert_eq!(paragraph_text(commit.after().document(), 1)?, "a😀😀def");

    for affinity in [Affinity::Before, Affinity::After] {
        let a = text_point(1, 0, 3, affinity)?;
        let b = text_point(1, 0, 5, affinity)?;
        let start_result = match affinity {
            Affinity::Before => a.clone(),
            Affinity::After => b.clone(),
        };
        for alias in [
            text_point(1, 0, 3, affinity)?,
            paragraph_boundary(1, 1, affinity)?,
            text_point(1, 1, 0, affinity)?,
        ] {
            assert_exact(&commit, &source, &alias, start_result.clone())?;
        }
        for alias in [
            text_point(1, 1, 2, affinity)?,
            paragraph_boundary(1, 2, affinity)?,
            text_point(1, 2, 0, affinity)?,
        ] {
            assert_exact(&commit, &source, &alias, b.clone())?;
        }
        assert_deleted(&commit, &source, &text_point(1, 1, 1, affinity)?, a, b)?;
        assert_exact(
            &commit,
            &source,
            &text_point(1, 0, 1, affinity)?,
            text_point(1, 0, 1, affinity)?,
        )?;
        assert_exact(
            &commit,
            &source,
            &text_point(1, 2, 1, affinity)?,
            text_point(1, 0, 6, affinity)?,
        )?;
        assert_exact(
            &commit,
            &source,
            &text_point(0, 0, 2, affinity)?,
            text_point(0, 0, 2, affinity)?,
        )?;
        assert_exact(
            &commit,
            &source,
            &text_point(2, 0, 2, affinity)?,
            text_point(2, 0, 2, affinity)?,
        )?;
        for boundary in 0..=3 {
            assert_exact(
                &commit,
                &source,
                &root_boundary(boundary, affinity),
                root_boundary(boundary, affinity),
            )?;
        }
    }
    Ok(())
}

#[test]
fn shrinking_multi_paragraph_replacement_maps_deleted_sides_root_boundaries_and_policies()
-> TestResult {
    let context = EditorContext::default();
    let source = state(
        &context,
        &[
            paragraph(&[text_node("pre", false)]),
            paragraph(&[text_node("ab", false)]),
            paragraph(&[text_node("😀Q", false)]),
            paragraph(&[text_node("CD", false)]),
            paragraph(&[text_node("post", false)]),
        ],
        "root-replace-shrink",
    )?;
    let commit = replace(&context, &source, range(1, 1, 3, 1)?, &["X"])?;
    assert_eq!(paragraph_text(commit.after().document(), 0)?, "pre");
    assert_eq!(paragraph_text(commit.after().document(), 1)?, "aXD");
    assert_eq!(paragraph_text(commit.after().document(), 2)?, "post");

    for affinity in [Affinity::Before, Affinity::After] {
        let a = text_point(1, 0, 1, affinity)?;
        let b = text_point(1, 0, 2, affinity)?;
        assert_exact(
            &commit,
            &source,
            &text_point(1, 0, 1, affinity)?,
            match affinity {
                Affinity::Before => a.clone(),
                Affinity::After => b.clone(),
            },
        )?;
        for deleted in [
            text_point(1, 0, 2, affinity)?,
            text_point(2, 0, 2, affinity)?,
            text_point(3, 0, 0, affinity)?,
            root_boundary(2, affinity),
            root_boundary(3, affinity),
        ] {
            assert_deleted(&commit, &source, &deleted, a.clone(), b.clone())?;
        }
        assert_exact(&commit, &source, &text_point(3, 0, 1, affinity)?, b.clone())?;
        assert_exact(
            &commit,
            &source,
            &text_point(3, 0, 2, affinity)?,
            text_point(1, 0, 3, affinity)?,
        )?;
        assert_exact(
            &commit,
            &source,
            &text_point(4, 0, 2, affinity)?,
            text_point(2, 0, 2, affinity)?,
        )?;
        assert_exact(&commit, &source, &root_boundary(0, affinity), root_boundary(0, affinity))?;
        assert_exact(&commit, &source, &root_boundary(1, affinity), root_boundary(1, affinity))?;
        assert_exact(&commit, &source, &root_boundary(4, affinity), root_boundary(2, affinity))?;
        assert_exact(&commit, &source, &root_boundary(5, affinity), root_boundary(3, affinity))?;
    }

    let deleted_selection = Selection::from(RangeSelection::new(
        root_boundary(2, Affinity::Before),
        text_point(2, 0, 2, Affinity::After)?,
    ));
    assert!(
        commit
            .relocation()
            .relocate_selection(&source, &deleted_selection, SelectionRelocationPolicy::default(),)
            .is_err()
    );
    for (choice, expected_offset) in
        [(DeletedPointPolicy::Before, 1), (DeletedPointPolicy::After, 2)]
    {
        let relocated = commit.relocation().relocate_selection(
            &source,
            &deleted_selection,
            SelectionRelocationPolicy::new(choice, choice),
        )?;
        assert_eq!(
            relocated,
            Selection::from(RangeSelection::new(
                text_point(1, 0, expected_offset, Affinity::Before)?,
                text_point(1, 0, expected_offset, Affinity::After)?,
            ))
        );
    }
    Ok(())
}

#[test]
fn equal_paragraph_count_keeps_after_span_root_indices_stable() -> TestResult {
    let context = EditorContext::default();
    let equal_source = state(
        &context,
        &[
            paragraph(&[text_node("pre", false)]),
            paragraph(&[text_node("ab", false)]),
            paragraph(&[text_node("CD", false)]),
            paragraph(&[text_node("tail", false)]),
        ],
        "root-replace-equal-count",
    )?;
    let equal = replace(&context, &equal_source, range(1, 1, 2, 1)?, &["X", "YY"])?;
    assert_eq!(paragraph_text(equal.after().document(), 1)?, "aX");
    assert_eq!(paragraph_text(equal.after().document(), 2)?, "YYD");
    for affinity in [Affinity::Before, Affinity::After] {
        assert_exact(
            &equal,
            &equal_source,
            &text_point(2, 0, 2, affinity)?,
            text_point(2, 0, 3, affinity)?,
        )?;
        assert_exact(
            &equal,
            &equal_source,
            &text_point(3, 0, 2, affinity)?,
            text_point(3, 0, 2, affinity)?,
        )?;
        assert_deleted(
            &equal,
            &equal_source,
            &root_boundary(2, affinity),
            text_point(1, 0, 1, affinity)?,
            text_point(2, 0, 2, affinity)?,
        )?;
        assert_exact(
            &equal,
            &equal_source,
            &root_boundary(3, affinity),
            root_boundary(3, affinity),
        )?;
    }
    Ok(())
}

#[test]
fn expanding_paragraph_count_shifts_after_span_root_indices() -> TestResult {
    let context = EditorContext::default();
    let expanded_source = state(
        &context,
        &[
            paragraph(&[text_node("pre", false)]),
            paragraph(&[text_node("abcd", false)]),
            paragraph(&[text_node("EF", false)]),
            paragraph(&[text_node("tail", false)]),
        ],
        "root-replace-expanded-count",
    )?;
    let expanded = replace(&context, &expanded_source, range(1, 1, 1, 3)?, &["X", "Y", "ZZ"])?;
    assert_eq!(paragraph_text(expanded.after().document(), 1)?, "aX");
    assert_eq!(paragraph_text(expanded.after().document(), 2)?, "Y");
    assert_eq!(paragraph_text(expanded.after().document(), 3)?, "ZZd");
    for affinity in [Affinity::Before, Affinity::After] {
        assert_exact(
            &expanded,
            &expanded_source,
            &text_point(1, 0, 1, affinity)?,
            match affinity {
                Affinity::Before => text_point(1, 0, 1, affinity)?,
                Affinity::After => text_point(3, 0, 2, affinity)?,
            },
        )?;
        assert_exact(
            &expanded,
            &expanded_source,
            &text_point(1, 0, 3, affinity)?,
            text_point(3, 0, 2, affinity)?,
        )?;
        assert_exact(
            &expanded,
            &expanded_source,
            &text_point(1, 0, 4, affinity)?,
            text_point(3, 0, 3, affinity)?,
        )?;
        assert_exact(
            &expanded,
            &expanded_source,
            &text_point(2, 0, 1, affinity)?,
            text_point(4, 0, 1, affinity)?,
        )?;
        assert_exact(
            &expanded,
            &expanded_source,
            &text_point(3, 0, 2, affinity)?,
            text_point(5, 0, 2, affinity)?,
        )?;
        assert_exact(
            &expanded,
            &expanded_source,
            &root_boundary(2, affinity),
            root_boundary(4, affinity),
        )?;
        assert_exact(
            &expanded,
            &expanded_source,
            &root_boundary(4, affinity),
            root_boundary(6, affinity),
        )?;
    }
    Ok(())
}

#[test]
fn collapsed_same_paragraph_range_uses_affinity_and_never_deletes_source_points() -> TestResult {
    let context = EditorContext::default();
    let source = state(
        &context,
        &[
            paragraph(&[text_node("head", false)]),
            paragraph(&[text_node("ab", false), text_node("CD", true)]),
            paragraph(&[text_node("tail", false)]),
        ],
        "root-replace-collapsed-multiline",
    )?;
    let commit = replace(&context, &source, range(1, 2, 1, 2)?, &["X", "YZ"])?;
    assert_eq!(paragraph_text(commit.after().document(), 1)?, "abX");
    assert_eq!(paragraph_text(commit.after().document(), 2)?, "YZCD");

    for affinity in [Affinity::Before, Affinity::After] {
        let a = text_point(1, 0, 2, affinity)?;
        let b = match affinity {
            Affinity::Before => text_point(2, 0, 2, affinity)?,
            Affinity::After => text_point(2, 1, 0, affinity)?,
        };
        let expected_boundary = match affinity {
            Affinity::Before => a,
            Affinity::After => b,
        };
        for alias in [
            text_point(1, 0, 2, affinity)?,
            paragraph_boundary(1, 1, affinity)?,
            text_point(1, 1, 0, affinity)?,
        ] {
            assert_exact(&commit, &source, &alias, expected_boundary.clone())?;
        }
        assert_exact(
            &commit,
            &source,
            &text_point(1, 1, 1, affinity)?,
            text_point(2, 1, 1, affinity)?,
        )?;

        let affected_points = [
            paragraph_boundary(1, 0, affinity)?,
            paragraph_boundary(1, 1, affinity)?,
            paragraph_boundary(1, 2, affinity)?,
            text_point(1, 0, 0, affinity)?,
            text_point(1, 0, 1, affinity)?,
            text_point(1, 0, 2, affinity)?,
            text_point(1, 1, 0, affinity)?,
            text_point(1, 1, 1, affinity)?,
            text_point(1, 1, 2, affinity)?,
        ];
        for point in affected_points {
            assert!(matches!(
                commit.relocation().relocate_point(&source, &point)?,
                PointRelocation::Exact(_)
            ));
        }

        for (source_boundary, result_boundary) in [(0, 0), (1, 1), (2, 3), (3, 4)] {
            assert_exact(
                &commit,
                &source,
                &root_boundary(source_boundary, affinity),
                root_boundary(result_boundary, affinity),
            )?;
        }
        assert_exact(
            &commit,
            &source,
            &text_point(2, 0, 2, affinity)?,
            text_point(3, 0, 2, affinity)?,
        )?;
    }
    Ok(())
}

#[test]
fn cross_paragraph_edge_range_deletes_the_distinct_structural_boundary() -> TestResult {
    let context = EditorContext::default();
    let source = state(
        &context,
        &[
            paragraph(&[text_node("ab", false)]),
            paragraph(&[text_node("CD", false)]),
            paragraph(&[text_node("tail", false)]),
        ],
        "root-replace-cross-edge",
    )?;
    let commit = replace(&context, &source, range(0, 2, 1, 0)?, &["X"])?;
    assert_eq!(paragraph_text(commit.after().document(), 0)?, "abXCD");
    assert_eq!(paragraph_text(commit.after().document(), 1)?, "tail");

    for affinity in [Affinity::Before, Affinity::After] {
        let a = text_point(0, 0, 2, affinity)?;
        let b = text_point(0, 0, 3, affinity)?;
        let start_result = match affinity {
            Affinity::Before => a.clone(),
            Affinity::After => b.clone(),
        };
        for start_alias in [text_point(0, 0, 2, affinity)?, paragraph_boundary(0, 1, affinity)?] {
            assert_exact(&commit, &source, &start_alias, start_result.clone())?;
        }
        for end_alias in [paragraph_boundary(1, 0, affinity)?, text_point(1, 0, 0, affinity)?] {
            assert_exact(&commit, &source, &end_alias, b.clone())?;
        }
        assert_deleted(&commit, &source, &root_boundary(1, affinity), a, b)?;
        assert_exact(
            &commit,
            &source,
            &text_point(1, 0, 1, affinity)?,
            text_point(0, 0, 4, affinity)?,
        )?;
        assert_exact(&commit, &source, &root_boundary(2, affinity), root_boundary(1, affinity))?;
        assert_exact(&commit, &source, &root_boundary(3, affinity), root_boundary(2, affinity))?;
    }

    let empty_source = state(
        &context,
        &[paragraph(&[text_node("ab", false)]), paragraph(&[text_node("CD", false)])],
        "root-replace-cross-edge-empty",
    )?;
    let empty = replace(&context, &empty_source, range(0, 2, 1, 0)?, &[""])?;
    for affinity in [Affinity::Before, Affinity::After] {
        let seam = text_point(0, 0, 2, affinity)?;
        assert_deleted(&empty, &empty_source, &root_boundary(1, affinity), seam.clone(), seam)?;
    }
    Ok(())
}

#[test]
fn composed_expansion_and_intermediate_shrink_preserve_inverse_and_deleted_sides() -> TestResult {
    let context = EditorContext::default();
    let source = state(
        &context,
        &[
            paragraph(&[text_node("pre", false)]),
            paragraph(&[text_node("abcd", false)]),
            paragraph(&[text_node("middle", false)]),
            paragraph(&[text_node("tail", false)]),
        ],
        "root-replace-composed-expand-shrink",
    )?;
    let expansion = RootTextReplace::capture(
        &context,
        source.document(),
        range(1, 1, 1, 3)?,
        vec![fragment("X")?, fragment("Y")?, fragment("Z")?],
    )?;
    let expanded = committed(
        Transaction::new(&source, vec![expansion.clone().into()]).apply(&context, &source)?,
    )?;
    assert_eq!(paragraph_text(expanded.after().document(), 1)?, "aX");
    assert_eq!(paragraph_text(expanded.after().document(), 2)?, "Y");
    assert_eq!(paragraph_text(expanded.after().document(), 3)?, "Zd");

    // This operation is deliberately authored against the first operation's
    // intermediate document, then replayed after it in one atomic transaction.
    let shrink = RootTextReplace::capture(
        &context,
        expanded.after().document(),
        range(2, 0, 4, 2)?,
        vec![fragment("Q")?],
    )?;
    let combined = committed(
        Transaction::new(&source, vec![expansion.into(), shrink.into()])
            .apply(&context, &source)?,
    )?;
    let result_root = combined
        .after()
        .document()
        .root()
        .as_element()
        .ok_or_else(|| test_error("result root was not an element"))?;
    assert_eq!(result_root.children().len(), 4);
    assert_eq!(paragraph_text(combined.after().document(), 0)?, "pre");
    assert_eq!(paragraph_text(combined.after().document(), 1)?, "aX");
    assert_eq!(paragraph_text(combined.after().document(), 2)?, "Qddle");
    assert_eq!(paragraph_text(combined.after().document(), 3)?, "tail");
    assert_eq!(combined.forward_operations().len(), 2);
    assert_eq!(
        combined.changes().iter().map(Change::operation_index).collect::<Vec<_>>(),
        vec![0, 1]
    );

    for affinity in [Affinity::Before, Affinity::After] {
        assert_deleted(
            &combined,
            &source,
            &text_point(1, 0, 2, affinity)?,
            text_point(1, 0, 1, affinity)?,
            text_point(2, 0, 1, affinity)?,
        )?;
        assert_exact(
            &combined,
            &source,
            &text_point(3, 0, 2, affinity)?,
            text_point(3, 0, 2, affinity)?,
        )?;
    }

    let restored = committed(
        Transaction::new(combined.after(), combined.inverse_operations().to_vec())
            .apply(&context, combined.after())?,
    )?;
    assert_eq!(restored.after().document(), source.document());
    assert_eq!(restored.inverse_operations(), combined.forward_operations());
    Ok(())
}
