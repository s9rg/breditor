use crate::state::{LineageId, Revision};

/// Exact identity of one immutable editor-state snapshot.
#[derive(Clone, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
pub struct SnapshotId {
    lineage: LineageId,
    revision: Revision,
}

impl SnapshotId {
    /// Creates a snapshot identity from a caller-supplied lineage and revision.
    #[must_use]
    pub const fn new(lineage: LineageId, revision: Revision) -> Self {
        Self { lineage, revision }
    }

    /// Returns the history lineage.
    #[must_use]
    pub const fn lineage(&self) -> &LineageId {
        &self.lineage
    }

    /// Returns the lineage-local revision.
    #[must_use]
    pub const fn revision(&self) -> Revision {
        self.revision
    }

    pub(crate) fn successor(&self) -> Result<Self, crate::state::RevisionError> {
        Ok(Self { lineage: self.lineage.clone(), revision: self.revision.successor()? })
    }
}
