//! Black-box contracts for structural paragraph relocation and composition.

mod support;

use std::cmp::Ordering;

use breditor_core::{
    codec::DocumentJsonCodec,
    document::{Document, FormatSet, TextFragment, TextRun},
    operation::{
        ParagraphJoin, ParagraphSplit, PointRelocation, SelectionRelocationPolicy, TextRange,
        TextSplice,
    },
    position::{Affinity, Point, TextOffset, compare_points},
    selection::{RangeOrder, RangeSelection, ResolvedSelection, Selection},
    state::{EditorContext, EditorState, EditorStateError, LineageId},
    transaction::{
        Commit, SelectionUpdate, Transaction, TransactionApplyError, TransactionOutcome,
    },
};
use serde_json::Value;
use support::{TestResult, document_json, paragraph, path, test_error, text_node};

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

fn fragment(text: &str) -> Result<TextFragment, Box<dyn std::error::Error>> {
    if text.is_empty() {
        return Ok(TextFragment::empty());
    }
    Ok(TextRun::try_new(text, FormatSet::default())?.into())
}

fn text_point(
    paragraph_index: u32,
    run_index: u32,
    offset: u32,
    affinity: Affinity,
) -> Result<Point, Box<dyn std::error::Error>> {
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
) -> Result<Point, Box<dyn std::error::Error>> {
    Ok(Point::Children { parent_path: path(&[paragraph_index])?, child_index, affinity })
}

fn root_boundary(child_index: u32, affinity: Affinity) -> Point {
    Point::Children {
        parent_path: breditor_core::position::NodePath::root(),
        child_index,
        affinity,
    }
}

fn exact(outcome: PointRelocation) -> Result<Point, Box<dyn std::error::Error>> {
    match outcome {
        PointRelocation::Exact(point) => Ok(point),
        PointRelocation::Deleted { .. } => {
            Err(test_error("point unexpectedly relocated as deleted").into())
        }
    }
}

fn assert_exact(
    commit: &Commit,
    source: &EditorState,
    point: &Point,
    expected: Point,
) -> TestResult {
    assert_eq!(
        commit.relocation().relocate_point(source, point)?,
        PointRelocation::Exact(expected)
    );
    Ok(())
}

fn paragraph_text(
    document: &Document,
    paragraph_index: u32,
) -> Result<String, Box<dyn std::error::Error>> {
    let Some(paragraph) = document.node_at(&path(&[paragraph_index])?)?.as_element() else {
        return Err(test_error("paragraph path did not resolve to an element").into());
    };
    let mut text = String::new();
    for child in paragraph.children() {
        let Some(run) = child.as_text() else {
            return Err(test_error("paragraph contained a non-text child").into());
        };
        text.push_str(run.text());
    }
    Ok(text)
}

#[test]
fn split_relocates_all_point_encodings_affinities_and_structural_paths() -> TestResult {
    let context = EditorContext::default();
    let source = state(
        &context,
        &[
            paragraph(&[text_node("ab", false), text_node("CD", true), text_node("ef", false)]),
            paragraph(&[text_node("tail", false)]),
        ],
        "split-relocation-table",
    )?;
    let split =
        ParagraphSplit::capture(&context, source.document(), path(&[0])?, TextOffset::try_new(2)?)?;
    let commit =
        committed(Transaction::new(&source, vec![split.into()]).apply(&context, &source)?)?;

    assert_eq!(paragraph_text(commit.after().document(), 0)?, "ab");
    assert_eq!(paragraph_text(commit.after().document(), 1)?, "CDef");
    assert_eq!(paragraph_text(commit.after().document(), 2)?, "tail");

    for affinity in [Affinity::Before, Affinity::After] {
        assert_exact(
            &commit,
            &source,
            &paragraph_boundary(0, 0, affinity)?,
            text_point(0, 0, 0, affinity)?,
        )?;
        assert_exact(
            &commit,
            &source,
            &text_point(0, 0, 1, affinity)?,
            text_point(0, 0, 1, affinity)?,
        )?;

        let split_result = match affinity {
            Affinity::Before => text_point(0, 0, 2, affinity)?,
            Affinity::After => text_point(1, 0, 0, affinity)?,
        };
        for encoding in [
            text_point(0, 0, 2, affinity)?,
            paragraph_boundary(0, 1, affinity)?,
            text_point(0, 1, 0, affinity)?,
        ] {
            assert_exact(&commit, &source, &encoding, split_result.clone())?;
        }

        let after_result = match affinity {
            Affinity::Before => text_point(1, 0, 2, affinity)?,
            Affinity::After => text_point(1, 1, 0, affinity)?,
        };
        for encoding in [
            text_point(0, 1, 2, affinity)?,
            paragraph_boundary(0, 2, affinity)?,
            text_point(0, 2, 0, affinity)?,
        ] {
            assert_exact(&commit, &source, &encoding, after_result.clone())?;
        }

        assert_exact(
            &commit,
            &source,
            &text_point(1, 0, 2, affinity)?,
            text_point(2, 0, 2, affinity)?,
        )?;
        assert_exact(
            &commit,
            &source,
            &paragraph_boundary(1, 1, affinity)?,
            paragraph_boundary(2, 1, affinity)?,
        )?;
        assert_exact(&commit, &source, &root_boundary(0, affinity), root_boundary(0, affinity))?;
        assert_exact(&commit, &source, &root_boundary(1, affinity), root_boundary(2, affinity))?;
        assert_exact(&commit, &source, &root_boundary(2, affinity), root_boundary(3, affinity))?;
    }
    Ok(())
}

#[test]
fn nonzero_structural_targets_preserve_earlier_paths_and_shift_later_paths() -> TestResult {
    let context = EditorContext::default();
    let split_source = state(
        &context,
        &[
            paragraph(&[text_node("prefix", false)]),
            paragraph(&[text_node("abcd", false)]),
            paragraph(&[text_node("suffix", false)]),
        ],
        "split-relocation-nonzero",
    )?;
    let split = ParagraphSplit::capture(
        &context,
        split_source.document(),
        path(&[1])?,
        TextOffset::try_new(2)?,
    )?;
    let split_commit = committed(
        Transaction::new(&split_source, vec![split.into()]).apply(&context, &split_source)?,
    )?;
    for affinity in [Affinity::Before, Affinity::After] {
        assert_exact(
            &split_commit,
            &split_source,
            &text_point(0, 0, 2, affinity)?,
            text_point(0, 0, 2, affinity)?,
        )?;
        assert_exact(
            &split_commit,
            &split_source,
            &text_point(2, 0, 2, affinity)?,
            text_point(3, 0, 2, affinity)?,
        )?;
        let seam = match affinity {
            Affinity::Before => text_point(1, 0, 2, affinity)?,
            Affinity::After => text_point(2, 0, 0, affinity)?,
        };
        assert_exact(&split_commit, &split_source, &text_point(1, 0, 2, affinity)?, seam)?;
        assert_exact(
            &split_commit,
            &split_source,
            &root_boundary(1, affinity),
            root_boundary(1, affinity),
        )?;
        assert_exact(
            &split_commit,
            &split_source,
            &root_boundary(2, affinity),
            root_boundary(3, affinity),
        )?;
    }

    let join_source = state(
        &context,
        &[
            paragraph(&[text_node("prefix", false)]),
            paragraph(&[text_node("ab", false)]),
            paragraph(&[text_node("cd", false)]),
            paragraph(&[text_node("suffix", false)]),
        ],
        "join-relocation-nonzero",
    )?;
    let join = ParagraphJoin::capture(&context, join_source.document(), path(&[1])?)?;
    let join_commit = committed(
        Transaction::new(&join_source, vec![join.into()]).apply(&context, &join_source)?,
    )?;
    for affinity in [Affinity::Before, Affinity::After] {
        assert_exact(
            &join_commit,
            &join_source,
            &text_point(0, 0, 2, affinity)?,
            text_point(0, 0, 2, affinity)?,
        )?;
        assert_exact(
            &join_commit,
            &join_source,
            &text_point(3, 0, 2, affinity)?,
            text_point(2, 0, 2, affinity)?,
        )?;
        assert_exact(
            &join_commit,
            &join_source,
            &text_point(2, 0, 1, affinity)?,
            text_point(1, 0, 3, affinity)?,
        )?;
        assert_exact(
            &join_commit,
            &join_source,
            &root_boundary(2, affinity),
            text_point(1, 0, 2, affinity)?,
        )?;
        assert_exact(
            &join_commit,
            &join_source,
            &root_boundary(3, affinity),
            root_boundary(2, affinity),
        )?;
    }
    Ok(())
}

#[test]
fn split_preserves_range_direction_and_exposes_affinity_owned_caret_sides() -> TestResult {
    let context = EditorContext::default();
    let source = state(
        &context,
        &[paragraph(&[text_node("ab", false), text_node("CD", true), text_node("ef", false)])],
        "split-selection-direction",
    )?;
    let split =
        ParagraphSplit::capture(&context, source.document(), path(&[0])?, TextOffset::try_new(2)?)?;
    let commit =
        committed(Transaction::new(&source, vec![split.into()]).apply(&context, &source)?)?;

    let earlier = text_point(0, 0, 1, Affinity::Before)?;
    let later = text_point(0, 2, 0, Affinity::After)?;
    for (selection, expected_order) in [
        (RangeSelection::new(earlier.clone(), later.clone()), RangeOrder::Forward),
        (RangeSelection::new(later.clone(), earlier.clone()), RangeOrder::Backward),
    ] {
        let relocated = commit.relocation().relocate_selection(
            &source,
            &Selection::from(selection),
            SelectionRelocationPolicy::default(),
        )?;
        let ResolvedSelection::Range(resolved) =
            relocated.resolve(context.schema(), commit.after().document())?;
        assert_eq!(resolved.order(), expected_order);
    }

    let caret = RangeSelection::new(
        text_point(0, 0, 2, Affinity::Before)?,
        paragraph_boundary(0, 1, Affinity::After)?,
    );
    assert!(caret.resolve(context.schema(), source.document())?.is_collapsed());
    let relocated = commit.relocation().relocate_selection(
        &source,
        &Selection::from(caret),
        SelectionRelocationPolicy::default(),
    )?;
    let ResolvedSelection::Range(resolved) =
        relocated.resolve(context.schema(), commit.after().document())?;
    assert_eq!(resolved.order(), RangeOrder::Forward);
    assert!(!resolved.is_collapsed());
    Ok(())
}

#[test]
fn split_actions_must_resolve_affinity_expansion_when_pending_formats_exist() -> TestResult {
    let context = EditorContext::default();
    let document = DocumentJsonCodec::new(context.schema().clone())
        .decode(&document_json(&[paragraph(&[text_node("ab", false), text_node("CD", true)])]))?;
    let source_caret = RangeSelection::new(
        text_point(0, 0, 2, Affinity::Before)?,
        paragraph_boundary(0, 1, Affinity::After)?,
    );
    assert!(source_caret.resolve(context.schema(), &document)?.is_collapsed());
    let source = EditorState::try_new(
        &context,
        LineageId::try_new("split-pending-formats")?,
        document,
        Some(source_caret.into()),
        Some(FormatSet::default()),
    )?;
    let split =
        ParagraphSplit::capture(&context, source.document(), path(&[0])?, TextOffset::try_new(2)?)?;
    assert_eq!(
        Transaction::new(&source, vec![split.clone().into()]).apply(&context, &source),
        Err(TransactionApplyError::InvalidResultState(
            EditorStateError::PendingFormatsRequireCollapsedRange,
        ))
    );

    let right_start = text_point(1, 0, 0, Affinity::After)?;
    let explicit_caret = Selection::from(RangeSelection::new(right_start.clone(), right_start));
    let commit = committed(
        Transaction::new(&source, vec![split.into()])
            .with_selection_update(SelectionUpdate::Set(Some(explicit_caret)))
            .apply(&context, &source)?,
    )?;
    assert!(commit.after().pending_formats().is_some());
    let Some(selection) = commit.after().selection() else {
        return Err(test_error("explicit split caret was not published").into());
    };
    let ResolvedSelection::Range(resolved) =
        selection.resolve(context.schema(), commit.after().document())?;
    assert!(resolved.is_collapsed());
    Ok(())
}

#[test]
fn join_maps_both_paragraphs_and_the_removed_root_boundary_to_one_seam() -> TestResult {
    let context = EditorContext::default();
    let source = state(
        &context,
        &[
            paragraph(&[text_node("ab", false)]),
            paragraph(&[text_node("cd", false)]),
            paragraph(&[text_node("tail", false)]),
        ],
        "join-relocation-table",
    )?;
    let join = ParagraphJoin::capture(&context, source.document(), path(&[0])?)?;
    let commit = committed(Transaction::new(&source, vec![join.into()]).apply(&context, &source)?)?;
    assert_eq!(paragraph_text(commit.after().document(), 0)?, "abcd");
    assert_eq!(paragraph_text(commit.after().document(), 1)?, "tail");

    for affinity in [Affinity::Before, Affinity::After] {
        assert_exact(
            &commit,
            &source,
            &text_point(0, 0, 1, affinity)?,
            text_point(0, 0, 1, affinity)?,
        )?;
        let seam = text_point(0, 0, 2, affinity)?;
        let left_end = text_point(0, 0, 2, affinity)?;
        let between = root_boundary(1, affinity);
        let right_start = text_point(1, 0, 0, affinity)?;
        assert_eq!(compare_points(source.document(), &left_end, &between)?, Ordering::Less);
        assert_eq!(compare_points(source.document(), &between, &right_start)?, Ordering::Less);
        for source_point in [left_end, between, right_start] {
            assert_exact(&commit, &source, &source_point, seam.clone())?;
        }
        assert_exact(
            &commit,
            &source,
            &text_point(1, 0, 1, affinity)?,
            text_point(0, 0, 3, affinity)?,
        )?;
        assert_exact(
            &commit,
            &source,
            &text_point(2, 0, 2, affinity)?,
            text_point(1, 0, 2, affinity)?,
        )?;
        assert_exact(
            &commit,
            &source,
            &paragraph_boundary(2, 1, affinity)?,
            paragraph_boundary(1, 1, affinity)?,
        )?;
        assert_exact(&commit, &source, &root_boundary(0, affinity), root_boundary(0, affinity))?;
        assert_exact(&commit, &source, &root_boundary(2, affinity), root_boundary(1, affinity))?;
        assert_exact(&commit, &source, &root_boundary(3, affinity), root_boundary(2, affinity))?;
    }

    let earlier = text_point(0, 0, 1, Affinity::Before)?;
    let later = text_point(1, 0, 1, Affinity::After)?;
    for (selection, expected_order) in [
        (RangeSelection::new(earlier.clone(), later.clone()), RangeOrder::Forward),
        (RangeSelection::new(later, earlier), RangeOrder::Backward),
    ] {
        let relocated = commit.relocation().relocate_selection(
            &source,
            &Selection::from(selection),
            SelectionRelocationPolicy::default(),
        )?;
        let ResolvedSelection::Range(resolved) =
            relocated.resolve(context.schema(), commit.after().document())?;
        assert_eq!(resolved.order(), expected_order);
    }
    Ok(())
}

#[test]
fn join_inverse_restores_content_but_affinity_not_removed_boundary_provenance() -> TestResult {
    let context = EditorContext::default();
    let source = state(
        &context,
        &[paragraph(&[text_node("ab", false)]), paragraph(&[text_node("cd", false)])],
        "join-inverse-relocation",
    )?;
    let join = ParagraphJoin::capture(&context, source.document(), path(&[0])?)?;
    let join_commit =
        committed(Transaction::new(&source, vec![join.into()]).apply(&context, &source)?)?;
    let inverse = Transaction::new(join_commit.after(), join_commit.inverse_operations().to_vec());
    let split_commit = committed(inverse.apply(&context, join_commit.after())?)?;
    assert_eq!(split_commit.after().document(), source.document());

    let cases = [
        (text_point(0, 0, 2, Affinity::Before)?, text_point(0, 0, 2, Affinity::Before)?),
        (text_point(0, 0, 2, Affinity::After)?, text_point(1, 0, 0, Affinity::After)?),
        (text_point(1, 0, 0, Affinity::Before)?, text_point(0, 0, 2, Affinity::Before)?),
        (text_point(1, 0, 0, Affinity::After)?, text_point(1, 0, 0, Affinity::After)?),
        (root_boundary(1, Affinity::Before), text_point(0, 0, 2, Affinity::Before)?),
        (root_boundary(1, Affinity::After), text_point(1, 0, 0, Affinity::After)?),
    ];
    for (source_point, expected_after_inverse) in cases {
        let joined = exact(join_commit.relocation().relocate_point(&source, &source_point)?)?;
        let restored =
            exact(split_commit.relocation().relocate_point(join_commit.after(), &joined)?)?;
        assert_eq!(restored, expected_after_inverse);
    }
    Ok(())
}

#[test]
fn deleted_point_sides_compose_through_later_split_and_join_steps() -> TestResult {
    let context = EditorContext::default();
    let split_source = state(
        &context,
        &[paragraph(&[text_node("abcdef", false)]), paragraph(&[text_node("tail", false)])],
        "deleted-then-split",
    )?;
    let deletion = TextSplice::capture(
        &context,
        split_source.document(),
        TextRange::try_new(path(&[0])?, TextOffset::try_new(2)?, TextOffset::try_new(4)?)?,
        TextFragment::empty(),
    )?;
    let split = ParagraphSplit::try_new(path(&[0])?, TextOffset::try_new(2)?, fragment("abef")?)?;
    let split_commit = committed(
        Transaction::new(&split_source, vec![deletion.into(), split.into()])
            .apply(&context, &split_source)?,
    )?;
    assert_eq!(paragraph_text(split_commit.after().document(), 0)?, "ab");
    assert_eq!(paragraph_text(split_commit.after().document(), 1)?, "ef");
    assert_eq!(paragraph_text(split_commit.after().document(), 2)?, "tail");
    for affinity in [Affinity::Before, Affinity::After] {
        assert_eq!(
            split_commit
                .relocation()
                .relocate_point(&split_source, &text_point(0, 0, 3, affinity)?)?,
            PointRelocation::Deleted {
                before: text_point(0, 0, 2, affinity)?,
                after: text_point(1, 0, 0, affinity)?,
            }
        );
    }

    let join_source = state(
        &context,
        &[
            paragraph(&[text_node("ab", false)]),
            paragraph(&[text_node("cd", false)]),
            paragraph(&[text_node("wxyz", false)]),
        ],
        "deleted-then-join",
    )?;
    let deletion = TextSplice::capture(
        &context,
        join_source.document(),
        TextRange::try_new(path(&[2])?, TextOffset::try_new(1)?, TextOffset::try_new(3)?)?,
        TextFragment::empty(),
    )?;
    let join = ParagraphJoin::capture(&context, join_source.document(), path(&[0])?)?;
    let join_commit = committed(
        Transaction::new(&join_source, vec![deletion.into(), join.into()])
            .apply(&context, &join_source)?,
    )?;
    assert_eq!(paragraph_text(join_commit.after().document(), 0)?, "abcd");
    assert_eq!(paragraph_text(join_commit.after().document(), 1)?, "wz");
    for affinity in [Affinity::Before, Affinity::After] {
        let mapped = text_point(1, 0, 1, affinity)?;
        assert_eq!(
            join_commit
                .relocation()
                .relocate_point(&join_source, &text_point(2, 0, 2, affinity)?)?,
            PointRelocation::Deleted { before: mapped.clone(), after: mapped }
        );
    }
    Ok(())
}
