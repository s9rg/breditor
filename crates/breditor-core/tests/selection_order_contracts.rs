//! Black-box contracts for document-aware point order and directional ranges.

mod support;

use std::cmp::Ordering;

use breditor_core::{
    document::Document,
    position::{
        Affinity, NodePath, Point, PointComparisonError, PointError, PointOperand, ResolvedPoint,
        compare_points,
    },
    schema::CompiledSchema,
    selection::{RangeEndpoint, RangeOrder, RangeSelection, SelectionEndpointRule, SelectionError},
};
use support::{TestResult, codec, fixture_document_json, path};

fn text_point(
    indices: &[u32],
    utf16_offset: u32,
    affinity: Affinity,
) -> Result<Point, Box<dyn std::error::Error>> {
    Ok(Point::Text { text_path: path(indices)?, utf16_offset, affinity })
}

fn child_point(
    indices: &[u32],
    child_index: u32,
    affinity: Affinity,
) -> Result<Point, Box<dyn std::error::Error>> {
    Ok(Point::Children { parent_path: path(indices)?, child_index, affinity })
}

fn selection_error(
    selection: &RangeSelection,
    schema: &CompiledSchema,
    document: &Document,
) -> Result<SelectionError, Box<dyn std::error::Error>> {
    match selection.resolve(schema, document) {
        Ok(_) => Err(support::test_error("selection unexpectedly resolved").into()),
        Err(error) => Ok(error),
    }
}

#[test]
fn coincident_text_and_child_encodings_compare_equal_without_becoming_equal_values() -> TestResult {
    let document = codec().decode(&fixture_document_json())?;

    let first_text_start = text_point(&[0, 0], 0, Affinity::Before)?;
    let first_text_end = text_point(&[0, 0], 4, Affinity::Before)?;
    let second_text_start = text_point(&[0, 1], 0, Affinity::After)?;
    let first_child_boundary = child_point(&[0], 0, Affinity::After)?;
    let shared_child_boundary = child_point(&[0], 1, Affinity::Before)?;

    assert_ne!(first_text_start, first_child_boundary);
    assert_eq!(
        compare_points(&document, &first_text_start, &first_child_boundary)?,
        Ordering::Equal
    );

    assert_ne!(first_text_end, shared_child_boundary);
    assert_ne!(second_text_start, shared_child_boundary);
    for point in [&first_text_end, &second_text_start] {
        assert_eq!(compare_points(&document, point, &shared_child_boundary)?, Ordering::Equal);
        assert_eq!(compare_points(&document, &shared_child_boundary, point)?, Ordering::Equal);
    }
    assert_eq!(compare_points(&document, &first_text_end, &second_text_start)?, Ordering::Equal);

    let other_affinity = text_point(&[0, 0], 4, Affinity::After)?;
    assert_ne!(first_text_end, other_affinity);
    assert_eq!(compare_points(&document, &first_text_end, &other_affinity)?, Ordering::Equal);
    Ok(())
}

#[test]
fn paragraph_exit_precedes_root_boundary_and_next_paragraph_entry() -> TestResult {
    let document = codec().decode(&fixture_document_json())?;
    let first_paragraph_end = child_point(&[0], 2, Affinity::After)?;
    let between_paragraphs = child_point(&[], 1, Affinity::Before)?;
    let second_paragraph_start = child_point(&[1], 0, Affinity::Before)?;

    assert_eq!(
        compare_points(&document, &first_paragraph_end, &between_paragraphs)?,
        Ordering::Less
    );
    assert_eq!(
        compare_points(&document, &between_paragraphs, &second_paragraph_start)?,
        Ordering::Less
    );
    assert_eq!(
        compare_points(&document, &first_paragraph_end, &second_paragraph_start)?,
        Ordering::Less
    );
    assert_eq!(
        compare_points(&document, &second_paragraph_start, &first_paragraph_end)?,
        Ordering::Greater
    );
    Ok(())
}

#[test]
fn range_direction_preserves_anchor_and_focus_and_uses_spatial_order() -> TestResult {
    let document = codec().decode(&fixture_document_json())?;
    let schema = CompiledSchema::breditor_base();
    let earlier = text_point(&[0, 0], 1, Affinity::After)?;
    let later = text_point(&[0, 0], 3, Affinity::Before)?;

    let forward = RangeSelection::new(earlier.clone(), later.clone());
    assert_eq!(forward.anchor(), &earlier);
    assert_eq!(forward.focus(), &later);
    let resolved_forward = forward.resolve(&schema, &document)?;
    assert_eq!(resolved_forward.order(), RangeOrder::Forward);
    assert!(!resolved_forward.is_collapsed());
    let ResolvedPoint::Text { utf16_offset: start, .. } = resolved_forward.start() else {
        return Err(support::test_error("forward range start did not resolve to text").into());
    };
    let ResolvedPoint::Text { utf16_offset: end, .. } = resolved_forward.end() else {
        return Err(support::test_error("forward range end did not resolve to text").into());
    };
    assert_eq!((start, end), (1, 3));

    let backward = RangeSelection::new(later.clone(), earlier.clone());
    assert_eq!(backward.anchor(), &later);
    assert_eq!(backward.focus(), &earlier);
    let resolved_backward = backward.resolve(&schema, &document)?;
    assert_eq!(resolved_backward.order(), RangeOrder::Backward);
    assert!(!resolved_backward.is_collapsed());
    let ResolvedPoint::Text { utf16_offset: start, .. } = resolved_backward.start() else {
        return Err(support::test_error("backward range start did not resolve to text").into());
    };
    let ResolvedPoint::Text { utf16_offset: end, .. } = resolved_backward.end() else {
        return Err(support::test_error("backward range end did not resolve to text").into());
    };
    assert_eq!((start, end), (1, 3));

    let coincident_child_boundary = child_point(&[0], 1, Affinity::Before)?;
    let coincident_text_end = text_point(&[0, 0], 4, Affinity::After)?;
    let collapsed = RangeSelection::new(coincident_text_end, coincident_child_boundary)
        .resolve(&schema, &document)?;
    assert_eq!(collapsed.order(), RangeOrder::Collapsed);
    assert!(collapsed.is_collapsed());
    Ok(())
}

#[test]
fn range_selection_rejects_a_root_boundary_at_the_correct_endpoint() -> TestResult {
    let document = codec().decode(&fixture_document_json())?;
    let schema = CompiledSchema::breditor_base();
    let root_boundary = Point::Children {
        parent_path: NodePath::root(),
        child_index: 1,
        affinity: Affinity::Before,
    };
    let text = text_point(&[0, 0], 1, Affinity::After)?;

    assert_eq!(
        selection_error(
            &RangeSelection::new(root_boundary.clone(), text.clone()),
            &schema,
            &document,
        )?,
        SelectionError::EndpointNotAllowed {
            endpoint: RangeEndpoint::Anchor,
            path: NodePath::root(),
            rule: SelectionEndpointRule::RootBoundary,
        }
    );
    assert_eq!(
        selection_error(&RangeSelection::new(text, root_boundary), &schema, &document,)?,
        SelectionError::EndpointNotAllowed {
            endpoint: RangeEndpoint::Focus,
            path: NodePath::root(),
            rule: SelectionEndpointRule::RootBoundary,
        }
    );
    Ok(())
}

#[test]
fn utf16_order_skips_surrogate_interiors_and_reports_the_failing_operand() -> TestResult {
    let document = codec().decode(&fixture_document_json())?;
    let before_emoji = text_point(&[0, 0], 1, Affinity::Before)?;
    let after_emoji = text_point(&[0, 0], 3, Affinity::After)?;
    let split_emoji = text_point(&[0, 0], 2, Affinity::Before)?;

    assert_eq!(compare_points(&document, &before_emoji, &after_emoji)?, Ordering::Less);
    let split_error = PointError::Utf16OffsetSplitsScalar { path: path(&[0, 0])?, offset: 2 };
    assert_eq!(
        compare_points(&document, &split_emoji, &after_emoji),
        Err(PointComparisonError::InvalidPoint {
            operand: PointOperand::Left,
            source: split_error.clone(),
        })
    );
    assert_eq!(
        compare_points(&document, &before_emoji, &split_emoji),
        Err(PointComparisonError::InvalidPoint {
            operand: PointOperand::Right,
            source: split_error.clone(),
        })
    );

    let schema = CompiledSchema::breditor_base();
    assert_eq!(
        selection_error(&RangeSelection::new(before_emoji, split_emoji), &schema, &document,)?,
        SelectionError::InvalidPoint { endpoint: RangeEndpoint::Focus, source: split_error }
    );
    Ok(())
}

#[test]
fn point_contract_exposes_no_intrinsic_partial_or_total_order() {
    trait AmbiguousIfPartialOrd<Marker> {
        fn check() {}
    }
    impl<T: ?Sized> AmbiguousIfPartialOrd<()> for T {}
    impl<T: ?Sized + PartialOrd> AmbiguousIfPartialOrd<u8> for T {}

    trait AmbiguousIfOrd<Marker> {
        fn check() {}
    }
    impl<T: ?Sized> AmbiguousIfOrd<()> for T {}
    impl<T: ?Sized + Ord> AmbiguousIfOrd<u8> for T {}

    let _ = <Point as AmbiguousIfPartialOrd<_>>::check;
    let _ = <Point as AmbiguousIfOrd<_>>::check;
}
