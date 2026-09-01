use super::{HistoryCapacity, HistoryStamp};

/// Immutable observation of one session's bounded linear history.
///
/// [`HistoryStamp`] distinguishes changes that depths alone cannot represent,
/// including closing an open merge group. A cloned status remains an exact
/// observation of the instant at which it was obtained.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SessionHistoryStatus {
    stamp: HistoryStamp,
    capacity: HistoryCapacity,
    undo_depth: u32,
    redo_depth: u32,
}

impl SessionHistoryStatus {
    pub(crate) const fn new(
        stamp: HistoryStamp,
        capacity: HistoryCapacity,
        undo_depth: u32,
        redo_depth: u32,
    ) -> Self {
        Self { stamp, capacity, undo_depth, redo_depth }
    }

    /// Returns the opaque identity of this exact history observation.
    #[must_use]
    pub const fn stamp(&self) -> &HistoryStamp {
        &self.stamp
    }

    /// Returns the configured maximum number of retained entries.
    #[must_use]
    pub const fn capacity(&self) -> HistoryCapacity {
        self.capacity
    }

    /// Returns the number of entries that were undoable in this observation.
    #[must_use]
    pub const fn undo_depth(&self) -> u32 {
        self.undo_depth
    }

    /// Returns the number of entries that were redoable in this observation.
    #[must_use]
    pub const fn redo_depth(&self) -> u32 {
        self.redo_depth
    }

    /// Returns whether this observation contains an undoable entry.
    #[must_use]
    pub const fn can_undo(&self) -> bool {
        self.undo_depth != 0
    }

    /// Returns whether this observation contains a redoable entry.
    #[must_use]
    pub const fn can_redo(&self) -> bool {
        self.redo_depth != 0
    }
}
