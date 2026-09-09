use crate::transaction::Commit;

/// Session-issued proof that one undo replay was published successfully.
///
/// The constructor is visible only to the owning `editor_session` module. Other
/// crate modules may carry, inspect, and consume the proof, but cannot classify
/// an arbitrary [`Commit`] as an executed undo.
#[derive(Eq, PartialEq)]
pub(crate) struct ExecutedUndo(Box<Commit>);

impl ExecutedUndo {
    pub(super) fn new(commit: Commit) -> Self {
        Self(Box::new(commit))
    }

    pub(crate) const fn commit(&self) -> &Commit {
        &self.0
    }

    pub(crate) fn into_commit(self) -> Commit {
        *self.0
    }
}

/// Session-issued proof that one redo replay was published successfully.
///
/// This is the direction-specific counterpart to [`ExecutedUndo`]. Distinct
/// types keep undo and redo classification intact through the guarded engine
/// and into local-log normalization.
#[derive(Eq, PartialEq)]
pub(crate) struct ExecutedRedo(Box<Commit>);

impl ExecutedRedo {
    pub(super) fn new(commit: Commit) -> Self {
        Self(Box::new(commit))
    }

    pub(crate) const fn commit(&self) -> &Commit {
        &self.0
    }

    pub(crate) fn into_commit(self) -> Commit {
        *self.0
    }
}
