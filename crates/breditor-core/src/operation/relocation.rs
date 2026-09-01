use std::{cmp::Ordering, sync::Arc};

use thiserror::Error;

use crate::{
    document::{Document, NodeLookupError},
    operation::{RootTextRange, TextRange},
    position::{Affinity, NodePath, Point, PointError, TextOffset, TextOffsetError},
    selection::{RangeEndpoint, RangeSelection, Selection},
    state::{EditorState, SnapshotId},
};

/// Explicit result of moving one point through committed content changes.
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum PointRelocation {
    /// The source has one unambiguous result position.
    ///
    /// Structural representation or provenance need not survive. For example,
    /// a removed between-paragraph boundary maps unambiguously to a joined text
    /// seam.
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
    /// Anchor/focus roles and affinity are preserved; endpoints are never
    /// sorted. Spatial order and collapsedness may change when opposite
    /// affinities own different sides of a structural boundary.
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
    map: RelocationStepMap,
}

impl RelocationStep {
    pub(crate) fn new(
        before: Document,
        after: Document,
        map: impl Into<RelocationStepMap>,
    ) -> Self {
        Self { before, after, map: map.into() }
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

/// One primitive operation's point-relocation law.
#[derive(Clone, Debug, Eq, PartialEq)]
pub(crate) enum RelocationStepMap {
    TextSplice(TextSpliceMap),
    ParagraphSplit(ParagraphSplitMap),
    ParagraphJoin(ParagraphJoinMap),
    RootTextReplace(RootTextReplaceMap),
}

impl RelocationStepMap {
    fn relocate(
        &self,
        before: &Document,
        after: &Document,
        point: &Point,
    ) -> Result<PointRelocation, RelocationError> {
        match self {
            Self::TextSplice(map) => map.relocate(before, after, point),
            Self::ParagraphSplit(map) => map.relocate(before, after, point),
            Self::ParagraphJoin(map) => map.relocate(before, after, point),
            Self::RootTextReplace(map) => map.relocate(before, after, point),
        }
    }
}

impl From<TextSpliceMap> for RelocationStepMap {
    fn from(value: TextSpliceMap) -> Self {
        Self::TextSplice(value)
    }
}

impl From<ParagraphSplitMap> for RelocationStepMap {
    fn from(value: ParagraphSplitMap) -> Self {
        Self::ParagraphSplit(value)
    }
}

impl From<ParagraphJoinMap> for RelocationStepMap {
    fn from(value: ParagraphJoinMap) -> Self {
        Self::ParagraphJoin(value)
    }
}

impl From<RootTextReplaceMap> for RelocationStepMap {
    fn from(value: RootTextReplaceMap) -> Self {
        Self::RootTextReplace(value)
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

/// Relocation data for replacing one paragraph with its two split halves.
#[derive(Clone, Debug, Eq, PartialEq)]
pub(crate) struct ParagraphSplitMap {
    paragraph_path: NodePath,
    split_offset: TextOffset,
}

impl ParagraphSplitMap {
    pub(crate) const fn new(paragraph_path: NodePath, split_offset: TextOffset) -> Self {
        Self { paragraph_path, split_offset }
    }

    fn relocate(
        &self,
        before: &Document,
        after: &Document,
        point: &Point,
    ) -> Result<PointRelocation, RelocationError> {
        point.resolve(before).map_err(RelocationError::InvalidSourcePoint)?;
        let paragraph_index = direct_root_child_index(&self.paragraph_path)?;

        if let Point::Children { parent_path, child_index, affinity } = point
            && parent_path.is_root()
        {
            let mapped_index = if *child_index <= paragraph_index {
                *child_index
            } else {
                child_index.checked_add(1).ok_or(RelocationError::CoordinateOverflow)?
            };
            return exact_result_point(
                after,
                Point::Children {
                    parent_path: NodePath::root(),
                    child_index: mapped_index,
                    affinity: *affinity,
                },
            );
        }

        let point_index = point_root_child_index(point)?;
        if point_index < paragraph_index {
            return exact_result_point(after, point.clone());
        }
        if point_index > paragraph_index {
            return exact_result_point(after, shift_point_root_index(point, IndexShift::Next)?);
        }

        ensure_point_in_container(point, &self.paragraph_path)?;
        let offset = point_offset_in_container(before, &self.paragraph_path, point)?;
        let affinity = point.affinity();
        let (result_path, result_offset) = match offset.cmp(&self.split_offset) {
            Ordering::Less => (self.paragraph_path.clone(), offset),
            Ordering::Greater => (
                shift_root_child_path(&self.paragraph_path, IndexShift::Next)?,
                TextOffset::try_new(offset.get() - self.split_offset.get())?,
            ),
            Ordering::Equal => match affinity {
                Affinity::Before => (self.paragraph_path.clone(), self.split_offset),
                Affinity::After => (
                    shift_root_child_path(&self.paragraph_path, IndexShift::Next)?,
                    TextOffset::ZERO,
                ),
            },
        };
        point_at_offset(after, &result_path, result_offset, affinity).map(PointRelocation::Exact)
    }
}

/// Relocation data for replacing two adjacent paragraphs with their joined text.
#[derive(Clone, Debug, Eq, PartialEq)]
pub(crate) struct ParagraphJoinMap {
    left_path: NodePath,
    left_length: TextOffset,
}

impl ParagraphJoinMap {
    pub(crate) const fn new(left_path: NodePath, left_length: TextOffset) -> Self {
        Self { left_path, left_length }
    }

    fn relocate(
        &self,
        before: &Document,
        after: &Document,
        point: &Point,
    ) -> Result<PointRelocation, RelocationError> {
        point.resolve(before).map_err(RelocationError::InvalidSourcePoint)?;
        let left_index = direct_root_child_index(&self.left_path)?;
        let right_index = left_index.checked_add(1).ok_or(RelocationError::CoordinateOverflow)?;

        if let Point::Children { parent_path, child_index, affinity } = point
            && parent_path.is_root()
        {
            if *child_index == right_index {
                return point_at_offset(after, &self.left_path, self.left_length, *affinity)
                    .map(PointRelocation::Exact);
            }
            let mapped_index = if *child_index < right_index {
                *child_index
            } else {
                child_index.checked_sub(1).ok_or(RelocationError::CoordinateOverflow)?
            };
            return exact_result_point(
                after,
                Point::Children {
                    parent_path: NodePath::root(),
                    child_index: mapped_index,
                    affinity: *affinity,
                },
            );
        }

        let point_index = point_root_child_index(point)?;
        if point_index < left_index {
            return exact_result_point(after, point.clone());
        }
        if point_index > right_index {
            return exact_result_point(after, shift_point_root_index(point, IndexShift::Previous)?);
        }

        let source_path = if point_index == left_index {
            self.left_path.clone()
        } else {
            shift_root_child_path(&self.left_path, IndexShift::Next)?
        };
        ensure_point_in_container(point, &source_path)?;
        let source_offset = point_offset_in_container(before, &source_path, point)?;
        let result_offset = if point_index == left_index {
            source_offset
        } else {
            self.left_length.checked_add(source_offset.get())?
        };
        point_at_offset(after, &self.left_path, result_offset, point.affinity())
            .map(PointRelocation::Exact)
    }
}

/// Relocation data for replacing one root-level text range with paragraphs.
///
/// The replacement operation retains the source prefix before `range.start()`
/// in its first result paragraph and the source suffix after `range.end()` in
/// its last result paragraph. Only the replacement count and its boundary
/// paragraph lengths are needed to identify the two sides of deleted content.
#[derive(Clone, Debug, Eq, PartialEq)]
pub(crate) struct RootTextReplaceMap {
    range: RootTextRange,
    replacement_paragraph_count: u32,
    first_replacement_utf16_len: TextOffset,
    last_replacement_utf16_len: TextOffset,
}

impl RootTextReplaceMap {
    pub(crate) const fn new(
        range: RootTextRange,
        replacement_paragraph_count: u32,
        first_replacement_utf16_len: TextOffset,
        last_replacement_utf16_len: TextOffset,
    ) -> Self {
        Self {
            range,
            replacement_paragraph_count,
            first_replacement_utf16_len,
            last_replacement_utf16_len,
        }
    }

    fn relocate(
        &self,
        before: &Document,
        after: &Document,
        point: &Point,
    ) -> Result<PointRelocation, RelocationError> {
        point.resolve(before).map_err(RelocationError::InvalidSourcePoint)?;
        let start_index = self.range.start().paragraph_index();
        let end_index = self.range.end().paragraph_index();
        if end_index < start_index || self.replacement_paragraph_count == 0 {
            return Err(RelocationError::CoordinateOverflow);
        }

        if let Point::Children { parent_path, child_index, affinity } = point
            && parent_path.is_root()
        {
            if *child_index <= start_index {
                return exact_result_point(after, point.clone());
            }
            let source_after =
                end_index.checked_add(1).ok_or(RelocationError::CoordinateOverflow)?;
            if *child_index >= source_after {
                let mapped_index = self.map_after_root_index(*child_index)?;
                return exact_result_point(
                    after,
                    Point::Children {
                        parent_path: NodePath::root(),
                        child_index: mapped_index,
                        affinity: *affinity,
                    },
                );
            }
            return self.deleted_result(after, *affinity);
        }

        let point_index = point_root_child_index(point)?;
        if point_index < start_index {
            return exact_result_point(after, point.clone());
        }
        if point_index > end_index {
            return exact_result_point(
                after,
                map_point_root_index(point, self.map_after_root_index(point_index)?)?,
            );
        }

        let affinity = point.affinity();
        let source_path = if point_index == start_index {
            self.range.start().paragraph_path()
        } else if point_index == end_index {
            self.range.end().paragraph_path()
        } else {
            return self.deleted_result(after, affinity);
        };
        ensure_point_in_container(point, source_path)?;
        let offset = point_offset_in_container(before, source_path, point)?;

        if start_index == end_index {
            return self.relocate_same_paragraph(after, offset, affinity);
        }
        if point_index == start_index {
            return match offset.cmp(&self.range.start().offset()) {
                Ordering::Less => Self::exact_at(after, start_index, offset, affinity),
                Ordering::Equal => self.start_result(after, affinity),
                Ordering::Greater => self.deleted_result(after, affinity),
            };
        }

        match offset.cmp(&self.range.end().offset()) {
            Ordering::Less => self.deleted_result(after, affinity),
            Ordering::Equal => self.end_result(after, affinity),
            Ordering::Greater => self.suffix_result(after, offset, affinity),
        }
    }

    fn relocate_same_paragraph(
        &self,
        after: &Document,
        offset: TextOffset,
        affinity: Affinity,
    ) -> Result<PointRelocation, RelocationError> {
        let start = self.range.start().offset();
        let end = self.range.end().offset();
        if end < start {
            return Err(RelocationError::CoordinateOverflow);
        }
        if offset < start {
            return Self::exact_at(after, self.range.start().paragraph_index(), offset, affinity);
        }
        if offset > end {
            return self.suffix_result(after, offset, affinity);
        }
        if offset == start {
            return self.start_result(after, affinity);
        }
        if offset == end {
            return self.end_result(after, affinity);
        }
        self.deleted_result(after, affinity)
    }

    fn start_result(
        &self,
        after: &Document,
        affinity: Affinity,
    ) -> Result<PointRelocation, RelocationError> {
        match affinity {
            Affinity::Before => self.before_point(after, affinity).map(PointRelocation::Exact),
            Affinity::After => self.after_point(after, affinity).map(PointRelocation::Exact),
        }
    }

    fn end_result(
        &self,
        after: &Document,
        affinity: Affinity,
    ) -> Result<PointRelocation, RelocationError> {
        self.after_point(after, affinity).map(PointRelocation::Exact)
    }

    fn deleted_result(
        &self,
        after: &Document,
        affinity: Affinity,
    ) -> Result<PointRelocation, RelocationError> {
        Ok(PointRelocation::Deleted {
            before: self.before_point(after, affinity)?,
            after: self.after_point(after, affinity)?,
        })
    }

    fn suffix_result(
        &self,
        after: &Document,
        source_offset: TextOffset,
        affinity: Affinity,
    ) -> Result<PointRelocation, RelocationError> {
        let suffix_offset = source_offset
            .get()
            .checked_sub(self.range.end().offset().get())
            .ok_or(RelocationError::CoordinateOverflow)?;
        let result_offset = self.after_offset()?.checked_add(suffix_offset)?;
        Self::exact_at(after, self.result_last_index()?, result_offset, affinity)
    }

    fn before_point(&self, after: &Document, affinity: Affinity) -> Result<Point, RelocationError> {
        result_point_at_offset(
            after,
            self.range.start().paragraph_index(),
            self.range.start().offset(),
            affinity,
        )
    }

    fn after_point(&self, after: &Document, affinity: Affinity) -> Result<Point, RelocationError> {
        result_point_at_offset(after, self.result_last_index()?, self.after_offset()?, affinity)
    }

    fn exact_at(
        after: &Document,
        paragraph_index: u32,
        offset: TextOffset,
        affinity: Affinity,
    ) -> Result<PointRelocation, RelocationError> {
        result_point_at_offset(after, paragraph_index, offset, affinity).map(PointRelocation::Exact)
    }

    fn result_last_index(&self) -> Result<u32, RelocationError> {
        let replacement_tail = self
            .replacement_paragraph_count
            .checked_sub(1)
            .ok_or(RelocationError::CoordinateOverflow)?;
        self.range
            .start()
            .paragraph_index()
            .checked_add(replacement_tail)
            .ok_or(RelocationError::CoordinateOverflow)
    }

    fn after_offset(&self) -> Result<TextOffset, RelocationError> {
        if self.replacement_paragraph_count == 1 {
            self.range
                .start()
                .offset()
                .checked_add(self.first_replacement_utf16_len.get())
                .map_err(Into::into)
        } else {
            Ok(self.last_replacement_utf16_len)
        }
    }

    fn map_after_root_index(&self, source_index: u32) -> Result<u32, RelocationError> {
        let source_after = self
            .range
            .end()
            .paragraph_index()
            .checked_add(1)
            .ok_or(RelocationError::CoordinateOverflow)?;
        let distance =
            source_index.checked_sub(source_after).ok_or(RelocationError::CoordinateOverflow)?;
        let result_after = self
            .range
            .start()
            .paragraph_index()
            .checked_add(self.replacement_paragraph_count)
            .ok_or(RelocationError::CoordinateOverflow)?;
        result_after.checked_add(distance).ok_or(RelocationError::CoordinateOverflow)
    }
}

fn exact_result_point(after: &Document, point: Point) -> Result<PointRelocation, RelocationError> {
    point.resolve(after).map_err(RelocationError::InvalidResultPoint)?;
    Ok(PointRelocation::Exact(point))
}

fn direct_root_child_index(path: &NodePath) -> Result<u32, RelocationError> {
    if path.len() != 1 {
        return Err(RelocationError::CoordinateOverflow);
    }
    path.last_index().ok_or(RelocationError::CoordinateOverflow)
}

fn point_root_child_index(point: &Point) -> Result<u32, RelocationError> {
    point.target_path().iter().next().ok_or(RelocationError::CoordinateOverflow)
}

fn ensure_point_in_container(
    point: &Point,
    container_path: &NodePath,
) -> Result<(), RelocationError> {
    if point_container(point).as_ref() == Some(container_path) {
        Ok(())
    } else {
        Err(RelocationError::PointOutsideContainer { path: point.target_path().clone() })
    }
}

#[derive(Clone, Copy)]
enum IndexShift {
    Next,
    Previous,
}

fn shift_point_root_index(point: &Point, shift: IndexShift) -> Result<Point, RelocationError> {
    Ok(match point {
        Point::Text { text_path, utf16_offset, affinity } => Point::Text {
            text_path: shift_root_child_path(text_path, shift)?,
            utf16_offset: *utf16_offset,
            affinity: *affinity,
        },
        Point::Children { parent_path, child_index, affinity } => Point::Children {
            parent_path: shift_root_child_path(parent_path, shift)?,
            child_index: *child_index,
            affinity: *affinity,
        },
    })
}

fn map_point_root_index(point: &Point, root_index: u32) -> Result<Point, RelocationError> {
    Ok(match point {
        Point::Text { text_path, utf16_offset, affinity } => Point::Text {
            text_path: replace_root_child_index(text_path, root_index)?,
            utf16_offset: *utf16_offset,
            affinity: *affinity,
        },
        Point::Children { parent_path, child_index, affinity } => Point::Children {
            parent_path: replace_root_child_index(parent_path, root_index)?,
            child_index: *child_index,
            affinity: *affinity,
        },
    })
}

fn shift_root_child_path(path: &NodePath, shift: IndexShift) -> Result<NodePath, RelocationError> {
    let mut indices = path.to_vec();
    let first = indices.first_mut().ok_or(RelocationError::CoordinateOverflow)?;
    *first = match shift {
        IndexShift::Next => first.checked_add(1).ok_or(RelocationError::CoordinateOverflow)?,
        IndexShift::Previous => first.checked_sub(1).ok_or(RelocationError::CoordinateOverflow)?,
    };
    NodePath::try_from_indices(indices).map_err(|_| RelocationError::CoordinateOverflow)
}

fn replace_root_child_index(path: &NodePath, root_index: u32) -> Result<NodePath, RelocationError> {
    let mut indices = path.to_vec();
    let first = indices.first_mut().ok_or(RelocationError::CoordinateOverflow)?;
    *first = root_index;
    NodePath::try_from_indices(indices).map_err(|_| RelocationError::CoordinateOverflow)
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
    ensure_point_in_container(point, container_path)?;
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

fn result_point_at_offset(
    document: &Document,
    paragraph_index: u32,
    offset: TextOffset,
    affinity: Affinity,
) -> Result<Point, RelocationError> {
    let paragraph_path = NodePath::try_from_indices(vec![paragraph_index])
        .map_err(|_| RelocationError::CoordinateOverflow)?;
    point_at_offset(document, &paragraph_path, offset, affinity)
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
