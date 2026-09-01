use std::sync::Arc;

use crate::{operation::TextRange, position::NodePath};

/// A half-open child-index range in one element snapshot.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct ChildRange {
    start: u32,
    end: u32,
}

impl ChildRange {
    pub(crate) const fn new(start: u32, end: u32) -> Self {
        Self { start, end }
    }

    /// Returns the inclusive start child index.
    #[must_use]
    pub const fn start(self) -> u32 {
        self.start
    }

    /// Returns the exclusive end child index.
    #[must_use]
    pub const fn end(self) -> u32 {
        self.end
    }
}

/// One logical text edit described in both source and result coordinates.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct TextChange {
    operation_index: usize,
    container_path: NodePath,
    old_text_range: TextRange,
    new_text_range: TextRange,
    old_child_range: ChildRange,
    new_child_range: ChildRange,
}

impl TextChange {
    /// Returns the index into the owning commit's applied forward operations.
    /// Unchanged request operations are absent from that list.
    #[must_use]
    pub const fn operation_index(&self) -> usize {
        self.operation_index
    }

    /// Returns the edited text-container path.
    #[must_use]
    pub const fn container_path(&self) -> &NodePath {
        &self.container_path
    }

    /// Returns the replaced range in this operation's immediate input.
    #[must_use]
    pub const fn old_text_range(&self) -> &TextRange {
        &self.old_text_range
    }

    /// Returns the inserted range in this operation's immediate output.
    #[must_use]
    pub const fn new_text_range(&self) -> &TextRange {
        &self.new_text_range
    }

    /// Returns the conservative seam-inclusive input child range.
    #[must_use]
    pub const fn old_child_range(&self) -> ChildRange {
        self.old_child_range
    }

    /// Returns the conservative seam-inclusive output child range.
    #[must_use]
    pub const fn new_child_range(&self) -> ChildRange {
        self.new_child_range
    }

    pub(crate) const fn new(
        container_path: NodePath,
        old_text_range: TextRange,
        new_text_range: TextRange,
        old_child_range: ChildRange,
        new_child_range: ChildRange,
    ) -> Self {
        Self {
            operation_index: 0,
            container_path,
            old_text_range,
            new_text_range,
            old_child_range,
            new_child_range,
        }
    }

    pub(crate) const fn with_operation_index(mut self, operation_index: usize) -> Self {
        self.operation_index = operation_index;
        self
    }
}

/// One logical child-sequence edit in an element.
///
/// The old range belongs to the operation's immediate input snapshot and the
/// new range belongs to its immediate output snapshot.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ChildrenChange {
    operation_index: usize,
    parent_path: NodePath,
    old_child_range: ChildRange,
    new_child_range: ChildRange,
}

impl ChildrenChange {
    /// Returns the index into the owning commit's applied forward operations.
    /// Unchanged request operations are absent from that list.
    #[must_use]
    pub const fn operation_index(&self) -> usize {
        self.operation_index
    }

    /// Returns the path of the element whose child sequence changed.
    #[must_use]
    pub const fn parent_path(&self) -> &NodePath {
        &self.parent_path
    }

    /// Returns the replaced child range in the operation's immediate input.
    #[must_use]
    pub const fn old_child_range(&self) -> ChildRange {
        self.old_child_range
    }

    /// Returns the inserted child range in the operation's immediate output.
    #[must_use]
    pub const fn new_child_range(&self) -> ChildRange {
        self.new_child_range
    }

    pub(crate) const fn new(
        parent_path: NodePath,
        old_child_range: ChildRange,
        new_child_range: ChildRange,
    ) -> Self {
        Self { operation_index: 0, parent_path, old_child_range, new_child_range }
    }

    pub(crate) const fn with_operation_index(mut self, operation_index: usize) -> Self {
        self.operation_index = operation_index;
        self
    }
}

/// One heterogeneous semantic change emitted by a document operation.
///
/// Variants keep their own coordinate contract so renderers and other
/// consumers can invalidate only the affected text or child sequence.
#[non_exhaustive]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum Change {
    /// A paragraph-local formatted-text replacement.
    Text(TextChange),
    /// A structural replacement in one element's child sequence.
    Children(ChildrenChange),
}

impl Change {
    /// Returns the index into the owning commit's applied forward operations.
    /// Unchanged request operations are absent from that list.
    #[must_use]
    pub const fn operation_index(&self) -> usize {
        match self {
            Self::Text(change) => change.operation_index(),
            Self::Children(change) => change.operation_index(),
        }
    }

    /// Returns the text-change payload when this is a text notification.
    #[must_use]
    pub const fn as_text(&self) -> Option<&TextChange> {
        match self {
            Self::Text(change) => Some(change),
            Self::Children(_) => None,
        }
    }

    /// Returns the child-change payload when this is a structural notification.
    #[must_use]
    pub const fn as_children(&self) -> Option<&ChildrenChange> {
        match self {
            Self::Text(_) => None,
            Self::Children(change) => Some(change),
        }
    }

    pub(crate) fn with_operation_index(self, operation_index: usize) -> Self {
        match self {
            Self::Text(change) => Self::Text(change.with_operation_index(operation_index)),
            Self::Children(change) => Self::Children(change.with_operation_index(operation_index)),
        }
    }
}

impl From<TextChange> for Change {
    fn from(value: TextChange) -> Self {
        Self::Text(value)
    }
}

impl From<ChildrenChange> for Change {
    fn from(value: ChildrenChange) -> Self {
        Self::Children(value)
    }
}

/// Ordered operation-relative semantic changes from one atomic transaction.
///
/// Each entry names its forward operation. Old/new coordinates refer to that
/// operation's immediate input/output snapshots, not necessarily the commit's
/// outer before/after snapshots.
#[derive(Clone, Debug, Default, Eq, PartialEq)]
pub struct ChangeSet(Arc<[Change]>);

impl ChangeSet {
    /// Returns the canonical empty change set.
    #[must_use]
    pub fn empty() -> Self {
        Self::default()
    }

    /// Returns whether no content changed.
    #[must_use]
    pub fn is_empty(&self) -> bool {
        self.0.is_empty()
    }

    /// Returns the number of operation-level changes.
    #[must_use]
    pub fn len(&self) -> usize {
        self.0.len()
    }

    /// Iterates in forward application order.
    pub fn iter(&self) -> std::slice::Iter<'_, Change> {
        self.0.iter()
    }

    pub(crate) fn from_changes<T>(changes: Vec<T>) -> Self
    where
        T: Into<Change>,
    {
        Self(Arc::from(changes.into_iter().map(Into::into).collect::<Vec<_>>()))
    }
}

impl<'a> IntoIterator for &'a ChangeSet {
    type Item = &'a Change;
    type IntoIter = std::slice::Iter<'a, Change>;

    fn into_iter(self) -> Self::IntoIter {
        self.iter()
    }
}
