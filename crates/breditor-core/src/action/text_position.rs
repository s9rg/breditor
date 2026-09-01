use thiserror::Error;

use crate::{
    document::{Document, TextFragment},
    position::{Affinity, NodePath, NodePathError, Point, TextOffset, TextOffsetError},
    selection::{RangeEndpoint, RangeOrder, Selection, SelectionError},
    state::EditorState,
};

/// One spatial position normalized into a direct-root paragraph coordinate.
#[derive(Clone, Debug, Eq, PartialEq)]
pub(crate) struct TextPosition {
    paragraph_path: NodePath,
    offset: TextOffset,
}

impl TextPosition {
    /// Returns the direct-root paragraph containing this position.
    pub(crate) const fn paragraph_path(&self) -> &NodePath {
        &self.paragraph_path
    }

    /// Returns the aggregate UTF-16 offset within the paragraph.
    pub(crate) const fn offset(&self) -> TextOffset {
        self.offset
    }
}

/// One range normalized into spatial start/end order without losing direction.
#[derive(Clone, Debug, Eq, PartialEq)]
pub(crate) struct TextRangeSelection {
    start: TextPosition,
    end: TextPosition,
    order: RangeOrder,
}

impl TextRangeSelection {
    /// Returns the spatially earlier endpoint.
    pub(crate) const fn start(&self) -> &TextPosition {
        &self.start
    }

    /// Returns the spatially later endpoint.
    pub(crate) const fn end(&self) -> &TextPosition {
        &self.end
    }

    /// Returns the source range's resolved anchor/focus direction.
    pub(crate) const fn order(&self) -> RangeOrder {
        self.order
    }

    /// Returns whether both endpoints occupy one spatial boundary.
    pub(crate) const fn is_collapsed(&self) -> bool {
        matches!(self.order, RangeOrder::Collapsed)
    }

    /// Returns whether both endpoints belong to the same paragraph.
    pub(crate) fn is_same_paragraph(&self) -> bool {
        self.start.paragraph_path == self.end.paragraph_path
    }
}

/// Normalizes the active range selection into direct-root paragraph coordinates.
///
/// Spatial start/end are derived from the resolved [`RangeOrder`], not from the
/// stored anchor/focus order. Affinity and coincident point encodings therefore
/// cannot reverse the action range.
pub(crate) fn normalize_range_selection(
    state: &EditorState,
) -> Result<TextRangeSelection, TextPositionError> {
    let selection = state.selection().ok_or(TextPositionError::NoSelection)?;
    #[allow(clippy::manual_let_else, unreachable_patterns)]
    let range = match selection {
        Selection::Range(range) => range,
        _ => return Err(TextPositionError::UnsupportedSelection),
    };
    let resolved = range
        .resolve(state.context().schema(), state.document())
        .map_err(TextPositionError::InvalidSelection)?;
    let order = resolved.order();
    let (start, start_endpoint, end, end_endpoint) = match order {
        RangeOrder::Collapsed | RangeOrder::Forward => {
            (range.anchor(), RangeEndpoint::Anchor, range.focus(), RangeEndpoint::Focus)
        }
        RangeOrder::Backward => {
            (range.focus(), RangeEndpoint::Focus, range.anchor(), RangeEndpoint::Anchor)
        }
    };

    Ok(TextRangeSelection {
        start: normalize_point(state.document(), start, start_endpoint)?,
        end: normalize_point(state.document(), end, end_endpoint)?,
        order,
    })
}

/// Normalizes a range and rejects one spanning multiple paragraphs.
pub(crate) fn normalize_same_paragraph_selection(
    state: &EditorState,
) -> Result<TextRangeSelection, TextPositionError> {
    let normalized = normalize_range_selection(state)?;
    if !normalized.is_same_paragraph() {
        return Err(TextPositionError::CrossParagraph {
            start: normalized.start.paragraph_path.clone(),
            end: normalized.end.paragraph_path.clone(),
        });
    }
    Ok(normalized)
}

/// Builds the canonical point encoding for an aggregate offset in a predicted fragment.
///
/// Empty fragments use child boundary zero. Non-empty fragments use the first
/// leaf at offset zero, the right leaf at run seams, and the last leaf's end at
/// the aggregate end boundary.
pub(crate) fn point_at_fragment_offset(
    paragraph_path: &NodePath,
    fragment: &TextFragment,
    offset: TextOffset,
    affinity: Affinity,
) -> Result<Point, TextPositionError> {
    direct_paragraph_index(paragraph_path)?;
    if fragment.is_empty() {
        if offset != TextOffset::ZERO {
            return Err(TextPositionError::FragmentOffsetOutOfBounds {
                requested: offset,
                length: TextOffset::ZERO,
            });
        }
        return Ok(Point::Children {
            parent_path: paragraph_path.clone(),
            child_index: 0,
            affinity,
        });
    }

    let mut cursor = TextOffset::ZERO;
    let mut last = None;
    for (index, run) in fragment.iter().enumerate() {
        let index = u32::try_from(index).map_err(|_| TextPositionError::CoordinateOverflow)?;
        if offset == cursor {
            return text_point(paragraph_path, index, 0, affinity);
        }
        let end = cursor.checked_add(u64::from(run.utf16_len()))?;
        if offset < end {
            let local = u32::try_from(offset.get() - cursor.get())
                .map_err(|_| TextPositionError::CoordinateOverflow)?;
            ensure_scalar_boundary(run.text(), local, offset)?;
            return text_point(paragraph_path, index, local, affinity);
        }
        cursor = end;
        last = Some((index, run.utf16_len()));
    }

    if offset == cursor {
        let (index, local) = last.ok_or(TextPositionError::CoordinateOverflow)?;
        return text_point(paragraph_path, index, local, affinity);
    }
    Err(TextPositionError::FragmentOffsetOutOfBounds { requested: offset, length: cursor })
}

/// Returns a checked direct-root paragraph index.
pub(crate) fn direct_paragraph_index(path: &NodePath) -> Result<u32, TextPositionError> {
    if path.len() != 1 {
        return Err(TextPositionError::NotDirectRootParagraph { path: path.clone() });
    }
    path.last_index()
        .ok_or_else(|| TextPositionError::NotDirectRootParagraph { path: path.clone() })
}

/// Returns the preceding direct-root paragraph path, or `None` at document start.
pub(crate) fn previous_paragraph_path(
    path: &NodePath,
) -> Result<Option<NodePath>, TextPositionError> {
    let index = direct_paragraph_index(path)?;
    let Some(previous) = index.checked_sub(1) else {
        return Ok(None);
    };
    NodePath::try_from_indices(vec![previous]).map(Some).map_err(Into::into)
}

/// Returns the checked right-neighbor paragraph path.
pub(crate) fn right_paragraph_path(path: &NodePath) -> Result<NodePath, TextPositionError> {
    let index = direct_paragraph_index(path)?;
    let right = index.checked_add(1).ok_or(TextPositionError::CoordinateOverflow)?;
    NodePath::try_from_indices(vec![right]).map_err(Into::into)
}

fn normalize_point(
    document: &Document,
    point: &Point,
    endpoint: RangeEndpoint,
) -> Result<TextPosition, TextPositionError> {
    let (paragraph_path, boundary) = match point {
        Point::Text { text_path, utf16_offset, .. } => {
            let Some(paragraph_path) = text_path.parent() else {
                return Err(unsupported_position(
                    endpoint,
                    text_path,
                    UnsupportedPositionRule::NotDirectRootParagraph,
                ));
            };
            if paragraph_path.len() != 1 || text_path.len() != 2 {
                return Err(unsupported_position(
                    endpoint,
                    text_path,
                    UnsupportedPositionRule::NotDirectRootParagraph,
                ));
            }
            let Some(child_index) = text_path.last_index() else {
                return Err(unsupported_position(
                    endpoint,
                    text_path,
                    UnsupportedPositionRule::PointOutsideParagraph,
                ));
            };
            (paragraph_path, PointBoundary::Text { child_index, local: *utf16_offset })
        }
        Point::Children { parent_path, child_index, .. } => {
            if parent_path.len() != 1 {
                return Err(unsupported_position(
                    endpoint,
                    parent_path,
                    UnsupportedPositionRule::NotDirectRootParagraph,
                ));
            }
            (parent_path.clone(), PointBoundary::Children { child_index: *child_index })
        }
    };
    direct_paragraph_index(&paragraph_path)?;
    let paragraph = document
        .node_at(&paragraph_path)
        .ok()
        .and_then(crate::document::NodeRef::as_element)
        .ok_or_else(|| {
            unsupported_position(
                endpoint,
                &paragraph_path,
                UnsupportedPositionRule::ExpectedParagraphElement,
            )
        })?;

    let (boundary_index, local) = match boundary {
        PointBoundary::Text { child_index, local } => (
            usize::try_from(child_index).map_err(|_| TextPositionError::CoordinateOverflow)?,
            Some(local),
        ),
        PointBoundary::Children { child_index } => {
            (usize::try_from(child_index).map_err(|_| TextPositionError::CoordinateOverflow)?, None)
        }
    };
    if boundary_index > paragraph.children().len()
        || local.is_some() && boundary_index == paragraph.children().len()
    {
        return Err(unsupported_position(
            endpoint,
            point.target_path(),
            UnsupportedPositionRule::PointOutsideParagraph,
        ));
    }

    let mut offset = TextOffset::ZERO;
    for (child_index, child) in paragraph.children().iter().take(boundary_index).enumerate() {
        let text = child.as_text().ok_or_else(|| {
            unsupported_position(
                endpoint,
                &paragraph_path,
                UnsupportedPositionRule::NonTextChild { child_index },
            )
        })?;
        offset = offset.checked_add(u64::from(text.utf16_len()))?;
    }
    if let Some(local) = local {
        let text = paragraph
            .children()
            .get(boundary_index)
            .and_then(crate::document::NodeRef::as_text)
            .ok_or_else(|| {
                unsupported_position(
                    endpoint,
                    point.target_path(),
                    UnsupportedPositionRule::PointOutsideParagraph,
                )
            })?;
        ensure_scalar_boundary(text.text(), local, offset.checked_add(u64::from(local))?)?;
        offset = offset.checked_add(u64::from(local))?;
    }
    Ok(TextPosition { paragraph_path, offset })
}

fn unsupported_position(
    endpoint: RangeEndpoint,
    path: &NodePath,
    rule: UnsupportedPositionRule,
) -> TextPositionError {
    TextPositionError::UnsupportedPosition { endpoint, path: path.clone(), rule }
}

fn text_point(
    paragraph_path: &NodePath,
    child_index: u32,
    utf16_offset: u32,
    affinity: Affinity,
) -> Result<Point, TextPositionError> {
    Ok(Point::Text { text_path: paragraph_path.try_child(child_index)?, utf16_offset, affinity })
}

fn ensure_scalar_boundary(
    text: &str,
    requested_local: u32,
    requested_aggregate: TextOffset,
) -> Result<(), TextPositionError> {
    let mut cursor = 0_u32;
    for character in text.chars() {
        if requested_local == cursor {
            return Ok(());
        }
        let width = if u32::from(character) <= 0xFFFF { 1 } else { 2 };
        cursor = cursor.checked_add(width).ok_or(TextPositionError::CoordinateOverflow)?;
        if requested_local < cursor {
            return Err(TextPositionError::FragmentOffsetSplitsScalar {
                requested: requested_aggregate,
            });
        }
    }
    if requested_local == cursor {
        Ok(())
    } else {
        Err(TextPositionError::FragmentOffsetOutOfBounds {
            requested: requested_aggregate,
            length: TextOffset::from(cursor),
        })
    }
}

enum PointBoundary {
    Text { child_index: u32, local: u32 },
    Children { child_index: u32 },
}

/// Stable reason a point cannot become a direct-root paragraph coordinate.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) enum UnsupportedPositionRule {
    /// The point is not directly inside a root-owned paragraph.
    NotDirectRootParagraph,
    /// The direct-root target unexpectedly is not an element.
    ExpectedParagraphElement,
    /// A point boundary is not directly owned by the paragraph.
    PointOutsideParagraph,
    /// A purported paragraph contains a non-text child.
    NonTextChild { child_index: usize },
}

/// Why action text coordinates could not be normalized or constructed.
#[derive(Clone, Debug, Eq, Error, PartialEq)]
pub(crate) enum TextPositionError {
    /// The editor has no active selection.
    #[error("the action requires an active selection")]
    NoSelection,
    /// The active selection kind is not handled by text actions.
    #[error("the active selection kind is not supported by text actions")]
    UnsupportedSelection,
    /// A supposedly published editor selection no longer resolves.
    #[error("the active selection is invalid: {0}")]
    InvalidSelection(SelectionError),
    /// One endpoint is outside the first direct-root paragraph action contract.
    #[error("{endpoint:?} position at {path:?} violates text-position rule {rule:?}")]
    UnsupportedPosition { endpoint: RangeEndpoint, path: NodePath, rule: UnsupportedPositionRule },
    /// The action range crosses paragraph containers.
    #[error("text action range crosses paragraphs {start:?} and {end:?}")]
    CrossParagraph { start: NodePath, end: NodePath },
    /// A helper received a path outside the direct-root paragraph contract.
    #[error("path {path:?} is not a direct-root paragraph path")]
    NotDirectRootParagraph { path: NodePath },
    /// A predicted fragment offset exceeds its aggregate length.
    #[error("fragment offset {requested:?} exceeds aggregate length {length:?}")]
    FragmentOffsetOutOfBounds { requested: TextOffset, length: TextOffset },
    /// A predicted fragment offset lands inside a surrogate pair.
    #[error("fragment offset {requested:?} splits a Unicode scalar")]
    FragmentOffsetSplitsScalar { requested: TextOffset },
    /// Checked path construction failed.
    #[error(transparent)]
    Path(#[from] NodePathError),
    /// Checked aggregate UTF-16 arithmetic failed.
    #[error(transparent)]
    TextOffset(#[from] TextOffsetError),
    /// Checked child-index arithmetic failed.
    #[error("text-position coordinate arithmetic overflowed")]
    CoordinateOverflow,
}

#[cfg(test)]
mod tests {
    use std::error::Error;

    use serde_json::json;

    use super::{
        TextPositionError, direct_paragraph_index, normalize_range_selection,
        normalize_same_paragraph_selection, point_at_fragment_offset, previous_paragraph_path,
        right_paragraph_path,
    };
    use crate::{
        codec::DocumentJsonCodec,
        document::{Format, FormatSet, PropertyMap, TextFragment, TextRun},
        identity::QualifiedName,
        position::{Affinity, NodePath, Point, TextOffset},
        selection::{RangeOrder, RangeSelection},
        state::{EditorContext, EditorState, LineageId},
    };

    type TestResult = Result<(), Box<dyn Error>>;

    fn path(indices: &[u32]) -> Result<NodePath, Box<dyn Error>> {
        NodePath::try_from_indices(indices.to_vec()).map_err(Into::into)
    }

    fn text_point(
        indices: &[u32],
        utf16_offset: u32,
        affinity: Affinity,
    ) -> Result<Point, Box<dyn Error>> {
        Ok(Point::Text { text_path: path(indices)?, utf16_offset, affinity })
    }

    fn child_point(
        indices: &[u32],
        child_index: u32,
        affinity: Affinity,
    ) -> Result<Point, Box<dyn Error>> {
        Ok(Point::Children { parent_path: path(indices)?, child_index, affinity })
    }

    fn document_json() -> String {
        json!({
            "format": "breditor/document",
            "formatVersion": 1,
            "schema": { "name": "breditor/base", "version": 1 },
            "root": {
                "kind": "element",
                "type": "breditor/document",
                "entityId": null,
                "properties": {},
                "children": [
                    {
                        "kind": "element",
                        "type": "breditor/paragraph",
                        "entityId": null,
                        "properties": {},
                        "children": [
                            { "kind": "text", "text": "a😀", "formats": [] },
                            {
                                "kind": "text",
                                "text": "BC",
                                "formats": [{ "type": "breditor/strong", "properties": {} }]
                            }
                        ]
                    },
                    {
                        "kind": "element",
                        "type": "breditor/paragraph",
                        "entityId": null,
                        "properties": {},
                        "children": []
                    }
                ]
            }
        })
        .to_string()
    }

    fn state(
        selection: Option<RangeSelection>,
        lineage: &str,
    ) -> Result<EditorState, Box<dyn Error>> {
        let context = EditorContext::default();
        let document = DocumentJsonCodec::new(context.schema().clone()).decode(&document_json())?;
        EditorState::try_new(
            &context,
            LineageId::try_new(lineage)?,
            document,
            selection.map(Into::into),
            None,
        )
        .map_err(Into::into)
    }

    fn fragment() -> Result<TextFragment, Box<dyn Error>> {
        let strong = FormatSet::try_from_formats(vec![Format::new(
            QualifiedName::try_new("breditor/strong")?,
            PropertyMap::default(),
        )])?;
        Ok(TextFragment::try_from_runs(vec![
            TextRun::try_new("a😀", FormatSet::default())?,
            TextRun::try_new("BC", strong)?,
        ])?)
    }

    #[test]
    fn normalization_uses_spatial_order_and_aggregate_utf16_offsets() -> TestResult {
        for (selection, expected_order) in [
            (
                RangeSelection::new(
                    text_point(&[0, 0], 1, Affinity::Before)?,
                    text_point(&[0, 1], 1, Affinity::After)?,
                ),
                RangeOrder::Forward,
            ),
            (
                RangeSelection::new(
                    text_point(&[0, 1], 1, Affinity::After)?,
                    text_point(&[0, 0], 1, Affinity::Before)?,
                ),
                RangeOrder::Backward,
            ),
        ] {
            let state = state(Some(selection), "normalization-direction")?;
            let normalized = normalize_same_paragraph_selection(&state)?;
            assert_eq!(normalized.order(), expected_order);
            assert_eq!(normalized.start().paragraph_path(), &path(&[0])?);
            assert_eq!(normalized.start().offset(), TextOffset::try_new(1)?);
            assert_eq!(normalized.end().offset(), TextOffset::try_new(4)?);
        }
        Ok(())
    }

    #[test]
    fn coincident_encodings_normalize_to_one_collapsed_offset() -> TestResult {
        let selection = RangeSelection::new(
            text_point(&[0, 0], 3, Affinity::Before)?,
            child_point(&[0], 1, Affinity::After)?,
        );
        let state = state(Some(selection), "normalization-collapsed")?;
        let normalized = normalize_same_paragraph_selection(&state)?;
        assert!(normalized.is_collapsed());
        assert_eq!(normalized.start().offset(), TextOffset::try_new(3)?);
        assert_eq!(normalized.end().offset(), TextOffset::try_new(3)?);
        Ok(())
    }

    #[test]
    fn no_selection_and_cross_paragraph_are_distinct() -> TestResult {
        let no_selection = state(None, "normalization-none")?;
        assert_eq!(normalize_range_selection(&no_selection), Err(TextPositionError::NoSelection));

        let selection = RangeSelection::new(
            child_point(&[0], 0, Affinity::Before)?,
            child_point(&[1], 0, Affinity::After)?,
        );
        let cross = state(Some(selection), "normalization-cross")?;
        let normalized = normalize_range_selection(&cross)?;
        assert_eq!(normalized.start().paragraph_path(), &path(&[0])?);
        assert_eq!(normalized.end().paragraph_path(), &path(&[1])?);
        assert_eq!(
            normalize_same_paragraph_selection(&cross),
            Err(TextPositionError::CrossParagraph { start: path(&[0])?, end: path(&[1])? })
        );
        Ok(())
    }

    #[test]
    fn predicted_fragment_points_use_canonical_leaf_encodings() -> TestResult {
        let paragraph = path(&[3])?;
        let fragment = fragment()?;
        let cases = [
            (TextOffset::ZERO, text_point(&[3, 0], 0, Affinity::After)?),
            (TextOffset::try_new(3)?, text_point(&[3, 1], 0, Affinity::After)?),
            (TextOffset::try_new(5)?, text_point(&[3, 1], 2, Affinity::After)?),
        ];
        for (offset, expected) in cases {
            assert_eq!(
                point_at_fragment_offset(&paragraph, &fragment, offset, Affinity::After)?,
                expected
            );
        }
        assert_eq!(
            point_at_fragment_offset(
                &paragraph,
                &TextFragment::empty(),
                TextOffset::ZERO,
                Affinity::Before,
            )?,
            child_point(&[3], 0, Affinity::Before)?
        );
        Ok(())
    }

    #[test]
    fn predicted_fragment_points_reject_surrogate_interiors_and_bounds() -> TestResult {
        let paragraph = path(&[0])?;
        let fragment = fragment()?;
        assert_eq!(
            point_at_fragment_offset(
                &paragraph,
                &fragment,
                TextOffset::try_new(2)?,
                Affinity::After,
            ),
            Err(TextPositionError::FragmentOffsetSplitsScalar {
                requested: TextOffset::try_new(2)?
            })
        );
        assert_eq!(
            point_at_fragment_offset(
                &paragraph,
                &fragment,
                TextOffset::try_new(6)?,
                Affinity::After,
            ),
            Err(TextPositionError::FragmentOffsetOutOfBounds {
                requested: TextOffset::try_new(6)?,
                length: TextOffset::try_new(5)?
            })
        );
        Ok(())
    }

    #[test]
    fn direct_paragraph_neighbors_use_checked_index_arithmetic() -> TestResult {
        let first = path(&[0])?;
        assert_eq!(direct_paragraph_index(&first)?, 0);
        assert_eq!(previous_paragraph_path(&first)?, None);
        assert_eq!(right_paragraph_path(&first)?, path(&[1])?);
        assert_eq!(previous_paragraph_path(&path(&[7])?)?, Some(path(&[6])?));
        assert_eq!(
            right_paragraph_path(&path(&[u32::MAX])?),
            Err(TextPositionError::CoordinateOverflow)
        );
        assert_eq!(
            direct_paragraph_index(&NodePath::root()),
            Err(TextPositionError::NotDirectRootParagraph { path: NodePath::root() })
        );
        Ok(())
    }
}
