use std::sync::Arc;

use thiserror::Error;

use crate::{
    document::{Document, NodeLookupError},
    operation::TextRange,
    position::{Affinity, NodePath, Point, PointError, TextOffset, TextOffsetError},
    selection::{RangeEndpoint, RangeSelection, Selection},
    state::{EditorState, SnapshotId},
};

/// Explicit result of moving one point through committed content changes.
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum PointRelocation {
    /// The source boundary survived and has one exact result position.
    Exact(Point),
    /// The source boundary was strictly inside deleted content.
    Deleted {
        /// Nearest surviving position before replacement content.
        before: Point,
        /// Nearest surviving position after replacement content.
        after: Point,
    },
}

/// Policy for a selection endpoint strictly inside deleted content.
#[derive(Clone, Copy, Debug, Default, Eq, Hash, PartialEq)]
pub enum DeletedPointPolicy {
    /// Reject implicit loss; an action must make an explicit choice.
    #[default]
    Reject,
    /// Use the nearest surviving position before inserted replacement content.
    Before,
    /// Use the nearest surviving position after inserted replacement content.
    After,
}

/// Endpoint-specific policy used when relocating a range selection.
#[derive(Clone, Copy, Debug, Default, Eq, Hash, PartialEq)]
pub struct SelectionRelocationPolicy {
    anchor: DeletedPointPolicy,
    focus: DeletedPointPolicy,
}

impl SelectionRelocationPolicy {
    /// Creates an explicit policy for the directional endpoints.
    #[must_use]
    pub const fn new(anchor: DeletedPointPolicy, focus: DeletedPointPolicy) -> Self {
        Self { anchor, focus }
    }

    /// Returns the anchor policy.
    #[must_use]
    pub const fn anchor(self) -> DeletedPointPolicy {
        self.anchor
    }

    /// Returns the focus policy.
    #[must_use]
    pub const fn focus(self) -> DeletedPointPolicy {
        self.focus
    }
}

/// A composed, snapshot-bound point relocation produced by one transaction.
///
/// The initial implementation retains structurally shared intermediate
/// documents so each step can canonicalize text/child-boundary encodings without
/// depending on unstable text-leaf paths.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct RelocationMap {
    base: SnapshotId,
    result: SnapshotId,
    base_document: Document,
    result_document: Document,
    steps: Arc<[RelocationStep]>,
}

impl RelocationMap {
    /// Returns the source snapshot identity.
    #[must_use]
    pub const fn base_snapshot(&self) -> &SnapshotId {
        &self.base
    }

    /// Returns the result snapshot identity.
    #[must_use]
    pub const fn result_snapshot(&self) -> &SnapshotId {
        &self.result
    }

    /// Returns whether this map contains no content relocation steps.
    #[must_use]
    pub fn is_identity(&self) -> bool {
        self.steps.is_empty()
    }

    /// Relocates a point from the exact source state.
    ///
    /// # Errors
    ///
    /// Returns [`RelocationError`] for stale/reused state identity, an invalid
    /// source point, or an internal document/coordinate inconsistency.
    pub fn relocate_point(
        &self,
        source_state: &EditorState,
        point: &Point,
    ) -> Result<PointRelocation, RelocationError> {
        if source_state.snapshot() != &self.base {
            return Err(RelocationError::StaleSnapshot {
                expected: self.base.clone(),
                actual: source_state.snapshot().clone(),
            });
        }
        if source_state.document() != &self.base_document {
            return Err(RelocationError::SourceDocumentMismatch);
        }
        point.resolve(&self.base_document).map_err(RelocationError::InvalidSourcePoint)?;
        let mut outcome = PointRelocation::Exact(point.clone());
        for step in self.steps.iter() {
            outcome = step.relocate_outcome(outcome)?;
        }
        match &outcome {
            PointRelocation::Exact(point) => {
                point
                    .resolve(&self.result_document)
                    .map_err(RelocationError::InvalidResultPoint)?;
            }
            PointRelocation::Deleted { before, after } => {
                before
                    .resolve(&self.result_document)
                    .map_err(RelocationError::InvalidResultPoint)?;
                after
                    .resolve(&self.result_document)
                    .map_err(RelocationError::InvalidResultPoint)?;
            }
        }
        Ok(outcome)
    }

    /// Relocates a range selection using explicit deletion choices.
    ///
    /// Direction and affinity are preserved; endpoints are never sorted.
    ///
    /// # Errors
    ///
    /// Returns [`SelectionRelocationError`] when point relocation fails or a
    /// deleted endpoint has `Reject` policy.
    pub fn relocate_selection(
        &self,
        source_state: &EditorState,
        selection: &Selection,
        policy: SelectionRelocationPolicy,
    ) -> Result<Selection, SelectionRelocationError> {
        match selection {
            Selection::Range(range) => {
                let anchor =
                    self.relocate_point(source_state, range.anchor()).map_err(|source| {
                        SelectionRelocationError::Point { endpoint: RangeEndpoint::Anchor, source }
                    })?;
                let focus = self.relocate_point(source_state, range.focus()).map_err(|source| {
                    SelectionRelocationError::Point { endpoint: RangeEndpoint::Focus, source }
                })?;
                Ok(RangeSelection::new(
                    choose_endpoint(anchor, RangeEndpoint::Anchor, policy.anchor)?,
                    choose_endpoint(focus, RangeEndpoint::Focus, policy.focus)?,
                )
                .into())
            }
        }
    }

    pub(crate) fn from_steps(
        base: SnapshotId,
        result: SnapshotId,
        base_document: Document,
        result_document: Document,
        steps: Vec<RelocationStep>,
    ) -> Self {
        Self { base, result, base_document, result_document, steps: Arc::from(steps) }
    }
}

fn choose_endpoint(
    outcome: PointRelocation,
    endpoint: RangeEndpoint,
    policy: DeletedPointPolicy,
) -> Result<Point, SelectionRelocationError> {
    match outcome {
        PointRelocation::Exact(point) => Ok(point),
        PointRelocation::Deleted { before, after } => match policy {
            DeletedPointPolicy::Reject => {
                Err(SelectionRelocationError::DeletedEndpoint { endpoint })
            }
            DeletedPointPolicy::Before => Ok(before),
            DeletedPointPolicy::After => Ok(after),
        },
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub(crate) struct RelocationStep {
    before: Document,
    after: Document,
    map: TextSpliceMap,
}

impl RelocationStep {
    pub(crate) const fn new(before: Document, after: Document, map: TextSpliceMap) -> Self {
        Self { before, after, map }
    }

    fn relocate_outcome(
        &self,
        outcome: PointRelocation,
    ) -> Result<PointRelocation, RelocationError> {
        match outcome {
            PointRelocation::Exact(point) => self.map.relocate(&self.before, &self.after, &point),
            PointRelocation::Deleted { before, after } => {
                let source_affinity = before.affinity();
                let before = select_nested(
                    self.map.relocate(
                        &self.before,
                        &self.after,
                        &with_affinity(before, Affinity::Before),
                    )?,
                    DeletedPointPolicy::Before,
                );
                let after = select_nested(
                    self.map.relocate(
                        &self.before,
                        &self.after,
                        &with_affinity(after, Affinity::After),
                    )?,
                    DeletedPointPolicy::After,
                );
                Ok(PointRelocation::Deleted {
                    before: with_affinity(before, source_affinity),
                    after: with_affinity(after, source_affinity),
                })
            }
        }
    }
}

fn with_affinity(point: Point, affinity: Affinity) -> Point {
    match point {
        Point::Text { text_path, utf16_offset, .. } => {
            Point::Text { text_path, utf16_offset, affinity }
        }
        Point::Children { parent_path, child_index, .. } => {
            Point::Children { parent_path, child_index, affinity }
        }
    }
}

fn select_nested(outcome: PointRelocation, policy: DeletedPointPolicy) -> Point {
    match outcome {
        PointRelocation::Exact(point) => point,
        PointRelocation::Deleted { before, after } => match policy {
            DeletedPointPolicy::Before | DeletedPointPolicy::Reject => before,
            DeletedPointPolicy::After => after,
        },
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub(crate) struct TextSpliceMap {
    range: TextRange,
    inserted_length: TextOffset,
}

impl TextSpliceMap {
    pub(crate) const fn new(range: TextRange, inserted_length: TextOffset) -> Self {
        Self { range, inserted_length }
    }

    fn relocate(
        &self,
        before: &Document,
        after: &Document,
        point: &Point,
    ) -> Result<PointRelocation, RelocationError> {
        point.resolve(before).map_err(RelocationError::InvalidSourcePoint)?;
        if point_container(point).as_ref() != Some(self.range.container_path()) {
            point.resolve(after).map_err(RelocationError::InvalidResultPoint)?;
            return Ok(PointRelocation::Exact(point.clone()));
        }

        let offset = point_offset_in_container(before, self.range.container_path(), point)?;
        let affinity = point.affinity();
        match self.map_offset(offset, affinity)? {
            OffsetRelocation::Exact(offset) => {
                point_at_offset(after, self.range.container_path(), offset, affinity)
                    .map(PointRelocation::Exact)
            }
            OffsetRelocation::Deleted { before: before_offset, after: after_offset } => {
                Ok(PointRelocation::Deleted {
                    before: point_at_offset(
                        after,
                        self.range.container_path(),
                        before_offset,
                        affinity,
                    )?,
                    after: point_at_offset(
                        after,
                        self.range.container_path(),
                        after_offset,
                        affinity,
                    )?,
                })
            }
        }
    }

    fn map_offset(
        &self,
        offset: TextOffset,
        affinity: Affinity,
    ) -> Result<OffsetRelocation, RelocationError> {
        let value = offset.get();
        let start = self.range.start().get();
        let end = self.range.end().get();
        let inserted = self.inserted_length.get();
        let replacement_end = self.range.start().checked_add(inserted)?;

        if value < start {
            return Ok(OffsetRelocation::Exact(offset));
        }
        if value > end {
            let shifted = value
                .checked_sub(end - start)
                .and_then(|value| value.checked_add(inserted))
                .ok_or(RelocationError::CoordinateOverflow)?;
            return Ok(OffsetRelocation::Exact(TextOffset::try_new(shifted)?));
        }
        if start == end || value == start {
            return Ok(OffsetRelocation::Exact(match affinity {
                Affinity::Before => self.range.start(),
                Affinity::After => replacement_end,
            }));
        }
        if value == end {
            return Ok(OffsetRelocation::Exact(replacement_end));
        }
        Ok(OffsetRelocation::Deleted { before: self.range.start(), after: replacement_end })
    }
}

fn point_container(point: &Point) -> Option<NodePath> {
    match point {
        Point::Text { text_path, .. } => text_path.parent(),
        Point::Children { parent_path, .. } => Some(parent_path.clone()),
    }
}

fn point_offset_in_container(
    document: &Document,
    container_path: &NodePath,
    point: &Point,
) -> Result<TextOffset, RelocationError> {
    let container = document.node_at(container_path)?;
    let element = container
        .as_element()
        .ok_or_else(|| RelocationError::ExpectedTextContainer { path: container_path.clone() })?;
    let boundary = match point {
        Point::Text { text_path, utf16_offset, .. } => {
            let index = text_path.last_index().ok_or_else(|| {
                RelocationError::PointOutsideContainer { path: text_path.clone() }
            })?;
            (
                usize::try_from(index).map_err(|_| RelocationError::CoordinateOverflow)?,
                Some(*utf16_offset),
            )
        }
        Point::Children { child_index, .. } => {
            (usize::try_from(*child_index).map_err(|_| RelocationError::CoordinateOverflow)?, None)
        }
    };

    let mut offset = TextOffset::ZERO;
    for child in element.children().iter().take(boundary.0) {
        let text = child
            .as_text()
            .ok_or_else(|| RelocationError::NonTextChild { path: container_path.clone() })?;
        offset = offset.checked_add(u64::from(text.utf16_len()))?;
    }
    if let Some(local) = boundary.1 {
        offset = offset.checked_add(u64::from(local))?;
    }
    Ok(offset)
}

fn point_at_offset(
    document: &Document,
    container_path: &NodePath,
    offset: TextOffset,
    affinity: Affinity,
) -> Result<Point, RelocationError> {
    let container = document.node_at(container_path)?;
    let element = container
        .as_element()
        .ok_or_else(|| RelocationError::ExpectedTextContainer { path: container_path.clone() })?;
    if element.children().is_empty() {
        if offset != TextOffset::ZERO {
            return Err(RelocationError::OffsetOutOfBounds { offset, length: TextOffset::ZERO });
        }
        return Ok(Point::Children {
            parent_path: container_path.clone(),
            child_index: 0,
            affinity,
        });
    }

    let mut cursor = TextOffset::ZERO;
    let mut previous: Option<(u32, u32)> = None;
    for (index, child) in element.children().iter().enumerate() {
        let text = child
            .as_text()
            .ok_or_else(|| RelocationError::NonTextChild { path: container_path.clone() })?;
        let index = u32::try_from(index).map_err(|_| RelocationError::CoordinateOverflow)?;
        let end = cursor.checked_add(u64::from(text.utf16_len()))?;
        if offset == cursor {
            if matches!(affinity, Affinity::Before)
                && let Some((previous_index, previous_length)) = previous
            {
                return text_point(container_path, previous_index, previous_length, affinity);
            }
            return text_point(container_path, index, 0, affinity);
        }
        if offset < end {
            let local = u32::try_from(offset.get() - cursor.get())
                .map_err(|_| RelocationError::CoordinateOverflow)?;
            return text_point(container_path, index, local, affinity);
        }
        previous = Some((index, text.utf16_len()));
        cursor = end;
    }
    if offset == cursor {
        let Some((index, length)) = previous else {
            return Err(RelocationError::CoordinateOverflow);
        };
        return text_point(container_path, index, length, affinity);
    }
    Err(RelocationError::OffsetOutOfBounds { offset, length: cursor })
}

fn text_point(
    container_path: &NodePath,
    child_index: u32,
    utf16_offset: u32,
    affinity: Affinity,
) -> Result<Point, RelocationError> {
    Ok(Point::Text {
        text_path: container_path
            .try_child(child_index)
            .map_err(|_| RelocationError::CoordinateOverflow)?,
        utf16_offset,
        affinity,
    })
}

enum OffsetRelocation {
    Exact(TextOffset),
    Deleted { before: TextOffset, after: TextOffset },
}

/// Why a point cannot be relocated through a commit map.
#[derive(Clone, Debug, Eq, Error, PartialEq)]
pub enum RelocationError {
    /// The point was supplied for a different source snapshot.
    #[error("relocation expects snapshot {expected:?}, got {actual:?}")]
    StaleSnapshot {
        /// Required source snapshot.
        expected: SnapshotId,
        /// Supplied source snapshot.
        actual: SnapshotId,
    },
    /// The point is invalid in the map's source snapshot.
    #[error("source point is invalid: {0}")]
    InvalidSourcePoint(PointError),
    /// An unchanged point unexpectedly became invalid in the result snapshot.
    #[error("result point is invalid: {0}")]
    InvalidResultPoint(PointError),
    /// The source state reused the expected snapshot identity for other content.
    #[error("relocation source document does not match the map's base document")]
    SourceDocumentMismatch,
    /// A path needed for relocation did not resolve.
    #[error(transparent)]
    NodeLookup(#[from] NodeLookupError),
    /// A mapped container path did not resolve to an element.
    #[error("relocation path {path:?} does not target a text container")]
    ExpectedTextContainer {
        /// Invalid path.
        path: NodePath,
    },
    /// A supposedly validated text container contained a non-text child.
    #[error("relocation text container {path:?} contains a non-text child")]
    NonTextChild {
        /// Invalid container path.
        path: NodePath,
    },
    /// A text point was not directly owned by the edited container.
    #[error("point path {path:?} is outside the edited text container")]
    PointOutsideContainer {
        /// Invalid point path.
        path: NodePath,
    },
    /// A mapped offset exceeded the result container.
    #[error("mapped offset {offset:?} exceeds text-container length {length:?}")]
    OffsetOutOfBounds {
        /// Invalid offset.
        offset: TextOffset,
        /// Result container length.
        length: TextOffset,
    },
    /// Checked host/index arithmetic failed.
    #[error("relocation coordinate arithmetic overflowed")]
    CoordinateOverflow,
    /// Aggregate UTF-16 arithmetic violated the cross-language bound.
    #[error(transparent)]
    TextOffset(#[from] TextOffsetError),
}

/// Why a selection could not be relocated automatically.
#[derive(Clone, Debug, Eq, Error, PartialEq)]
pub enum SelectionRelocationError {
    /// One endpoint could not be mapped.
    #[error("{endpoint:?} could not be relocated: {source}")]
    Point {
        /// Failing directional endpoint.
        endpoint: RangeEndpoint,
        /// Point relocation failure.
        source: RelocationError,
    },
    /// An endpoint was deleted and its policy required explicit handling.
    #[error("{endpoint:?} was inside deleted content and has Reject policy")]
    DeletedEndpoint {
        /// Deleted directional endpoint.
        endpoint: RangeEndpoint,
    },
}
