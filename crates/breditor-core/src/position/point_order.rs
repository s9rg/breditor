use std::cmp::Ordering;

use thiserror::Error;

use crate::{
    document::{Children, Document, NodeRef},
    position::{Point, PointError},
};

/// Identifies one operand of a document-aware point comparison.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum PointOperand {
    /// The left operand.
    Left,
    /// The right operand.
    Right,
}

/// Compares two structurally valid points in one document snapshot.
///
/// Affinity does not affect spatial order. Text starts and ends coincide with
/// their direct parent's matching child boundary, while element entry and exit
/// remain distinct. Thus the end of one paragraph is before, rather than equal
/// to, the start of the next paragraph.
///
/// # Errors
///
/// Returns [`PointComparisonError`] when either point is invalid in `document`
/// or the internal traversal coordinate exceeds `u64`.
pub fn compare_points(
    document: &Document,
    left: &Point,
    right: &Point,
) -> Result<Ordering, PointComparisonError> {
    left.resolve(document).map_err(|source| PointComparisonError::InvalidPoint {
        operand: PointOperand::Left,
        source,
    })?;
    right.resolve(document).map_err(|source| PointComparisonError::InvalidPoint {
        operand: PointOperand::Right,
        source,
    })?;

    let left_offset = point_offset(document, left)?;
    let right_offset = point_offset(document, right)?;
    Ok(left_offset.cmp(&right_offset))
}

fn point_offset(document: &Document, point: &Point) -> Result<u64, PointComparisonError> {
    let root = document.root().as_element().ok_or(PointComparisonError::InvalidDocumentRoot)?;
    offset_in_element(root.children(), point.target_path().as_slice(), 0, 0, point)
}

fn offset_in_element(
    children: &Children,
    target_path: &[u32],
    depth: usize,
    content_start: u64,
    point: &Point,
) -> Result<u64, PointComparisonError> {
    if depth == target_path.len() {
        let Point::Children { child_index, .. } = point else {
            return Err(PointComparisonError::InvalidTargetKind);
        };
        let boundary =
            usize::try_from(*child_index).map_err(|_| PointComparisonError::CoordinateOverflow)?;
        return offset_before_child(children, boundary, content_start);
    }

    let child_index = usize::try_from(target_path[depth])
        .map_err(|_| PointComparisonError::CoordinateOverflow)?;
    let child_start = offset_before_child(children, child_index, content_start)?;
    let child = children.get(child_index).ok_or(PointComparisonError::InvalidTargetKind)?;

    if depth + 1 == target_path.len()
        && let Point::Text { utf16_offset, .. } = point
        && child.as_text().is_some()
    {
        return child_start
            .checked_add(u64::from(*utf16_offset))
            .ok_or(PointComparisonError::CoordinateOverflow);
    }

    let element = child.as_element().ok_or(PointComparisonError::InvalidTargetKind)?;
    let nested_start =
        child_start.checked_add(1).ok_or(PointComparisonError::CoordinateOverflow)?;
    offset_in_element(element.children(), target_path, depth + 1, nested_start, point)
}

fn offset_before_child(
    children: &Children,
    boundary: usize,
    content_start: u64,
) -> Result<u64, PointComparisonError> {
    let mut offset = content_start;
    for child in children.iter().take(boundary) {
        offset = offset
            .checked_add(node_span(child)?)
            .ok_or(PointComparisonError::CoordinateOverflow)?;
    }
    Ok(offset)
}

fn node_span(node: &NodeRef) -> Result<u64, PointComparisonError> {
    if let Some(text) = node.as_text() {
        return Ok(u64::from(text.utf16_len()));
    }
    let element = node.as_element().ok_or(PointComparisonError::InvalidTargetKind)?;
    let mut span = 2_u64;
    for child in element.children() {
        span =
            span.checked_add(node_span(child)?).ok_or(PointComparisonError::CoordinateOverflow)?;
    }
    Ok(span)
}

/// Why two points could not be compared in one snapshot.
#[derive(Clone, Debug, Eq, Error, PartialEq)]
pub enum PointComparisonError {
    /// One point is not structurally valid in the supplied document.
    #[error("{operand:?} point is invalid: {source}")]
    InvalidPoint {
        /// Failing operand.
        operand: PointOperand,
        /// Structural point error.
        source: PointError,
    },
    /// The document violated the published root invariant.
    #[error("validated document root is not an element")]
    InvalidDocumentRoot,
    /// The resolved point and traversed node variant disagreed.
    #[error("resolved point target has an unexpected node variant")]
    InvalidTargetKind,
    /// The internal traversal coordinate exceeded `u64`.
    #[error("document-order coordinate overflowed")]
    CoordinateOverflow,
}
