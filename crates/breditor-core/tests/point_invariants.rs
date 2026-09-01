//! Black-box conformance tests for structural paths and points.

mod support;

use breditor_core::{
    document::{Document, NodeLookupError},
    position::{
        Affinity, MAX_PATH_DEPTH, NodePath, NodePathError, Point, PointError, ResolvedPoint,
    },
};
use support::{TestResult, codec, fixture_document_json, path, test_error};

fn resolve_error(
    point: &Point,
    document: &Document,
) -> Result<PointError, Box<dyn std::error::Error>> {
    match point.resolve(document) {
        Ok(_) => Err(test_error("point unexpectedly resolved").into()),
        Err(error) => Ok(error),
    }
}

#[test]
fn root_and_bounded_paths_preserve_every_index() -> TestResult {
    let root = NodePath::root();
    assert!(root.is_root());
    assert_eq!(root.len(), 0);
    assert_eq!(root.to_vec(), Vec::<u32>::new());

    let indices = vec![0, 4, u32::MAX];
    let path = NodePath::try_from_indices(indices.clone())?;
    assert_eq!(path.to_vec(), indices);
    assert_eq!(path.iter().rev().collect::<Vec<_>>(), vec![u32::MAX, 4, 0]);

    assert_eq!(
        NodePath::try_from_indices(vec![0; MAX_PATH_DEPTH + 1]),
        Err(NodePathError::TooDeep { actual: MAX_PATH_DEPTH + 1, maximum: MAX_PATH_DEPTH })
    );
    Ok(())
}

#[test]
fn text_points_resolve_utf16_offsets_to_utf8_boundaries() -> TestResult {
    let document = codec().decode(&fixture_document_json())?;
    let text_path = path(&[0, 0])?;
    for affinity in [Affinity::Before, Affinity::After] {
        for (utf16_offset, expected_byte_offset) in [(0, 0), (1, 1), (3, 5), (4, 6)] {
            let point = Point::Text { text_path: text_path.clone(), utf16_offset, affinity };
            assert_eq!(point.affinity(), affinity);
            assert_eq!(point.target_path(), &text_path);
            let ResolvedPoint::Text {
                node,
                byte_offset,
                utf16_offset: resolved_offset,
                affinity: resolved_affinity,
            } = point.resolve(&document)?
            else {
                return Err(test_error("text point resolved as a child boundary").into());
            };
            assert_eq!(node.text(), "a😀b");
            assert_eq!(byte_offset, expected_byte_offset);
            assert_eq!(resolved_offset, utf16_offset);
            assert_eq!(resolved_affinity, affinity);
        }
    }
    Ok(())
}

#[test]
fn child_points_accept_every_inclusive_element_boundary() -> TestResult {
    let document = codec().decode(&fixture_document_json())?;
    for (parent_path, child_count) in [(&[][..], 2_usize), (&[0][..], 2), (&[1][..], 0)] {
        let parent_path = path(parent_path)?;
        for affinity in [Affinity::Before, Affinity::After] {
            for child_index in 0..=u32::try_from(child_count)? {
                let point =
                    Point::Children { parent_path: parent_path.clone(), child_index, affinity };
                let ResolvedPoint::Children {
                    node,
                    child_index: resolved_index,
                    affinity: resolved_affinity,
                } = point.resolve(&document)?
                else {
                    return Err(test_error("child point resolved as a text boundary").into());
                };
                assert_eq!(node.children().len(), child_count);
                assert_eq!(resolved_index, usize::try_from(child_index)?);
                assert_eq!(resolved_affinity, affinity);
            }
        }
    }
    Ok(())
}

#[test]
fn affinity_and_structural_variant_never_collapse_at_coincident_boundaries() -> TestResult {
    let document = codec().decode(&fixture_document_json())?;
    let text_end_before =
        Point::Text { text_path: path(&[0, 0])?, utf16_offset: 4, affinity: Affinity::Before };
    let text_end_after =
        Point::Text { text_path: path(&[0, 0])?, utf16_offset: 4, affinity: Affinity::After };
    let child_boundary =
        Point::Children { parent_path: path(&[0])?, child_index: 1, affinity: Affinity::Before };

    assert_ne!(text_end_before, text_end_after);
    assert_ne!(text_end_before, child_boundary);
    text_end_before.resolve(&document)?;
    text_end_after.resolve(&document)?;
    child_boundary.resolve(&document)?;
    Ok(())
}

#[test]
fn point_errors_distinguish_lookup_kind_range_and_scalar_failures() -> TestResult {
    let document = codec().decode(&fixture_document_json())?;

    let split_scalar =
        Point::Text { text_path: path(&[0, 0])?, utf16_offset: 2, affinity: Affinity::Before };
    assert_eq!(
        resolve_error(&split_scalar, &document)?,
        PointError::Utf16OffsetSplitsScalar { path: path(&[0, 0])?, offset: 2 }
    );

    let past_text =
        Point::Text { text_path: path(&[0, 0])?, utf16_offset: 5, affinity: Affinity::After };
    assert_eq!(
        resolve_error(&past_text, &document)?,
        PointError::Utf16OffsetOutOfBounds { path: path(&[0, 0])?, offset: 5, length: 4 }
    );

    let text_at_root =
        Point::Text { text_path: NodePath::root(), utf16_offset: 0, affinity: Affinity::Before };
    assert_eq!(
        resolve_error(&text_at_root, &document)?,
        PointError::ExpectedText { path: NodePath::root() }
    );

    let children_at_text =
        Point::Children { parent_path: path(&[0, 0])?, child_index: 0, affinity: Affinity::Before };
    assert_eq!(
        resolve_error(&children_at_text, &document)?,
        PointError::ExpectedElement { path: path(&[0, 0])? }
    );

    let past_children =
        Point::Children { parent_path: path(&[0])?, child_index: 3, affinity: Affinity::Before };
    assert_eq!(
        resolve_error(&past_children, &document)?,
        PointError::ChildIndexOutOfBounds { path: path(&[0])?, index: 3, child_count: 2 }
    );

    let missing_node =
        Point::Text { text_path: path(&[2, 0])?, utf16_offset: 0, affinity: Affinity::Before };
    assert_eq!(
        resolve_error(&missing_node, &document)?,
        PointError::NodeLookup(NodeLookupError::ChildIndexOutOfBounds {
            path: path(&[2, 0])?,
            depth: 0,
            child_index: 2,
            child_count: 2,
        })
    );

    let traverses_text =
        Point::Text { text_path: path(&[0, 0, 0])?, utf16_offset: 0, affinity: Affinity::Before };
    assert_eq!(
        resolve_error(&traverses_text, &document)?,
        PointError::NodeLookup(NodeLookupError::TraversesText {
            path: path(&[0, 0, 0])?,
            depth: 2,
        })
    );
    Ok(())
}
