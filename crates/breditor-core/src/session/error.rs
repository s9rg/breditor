use thiserror::Error;

use crate::{
    state::SnapshotId,
    transaction::{CommitReplayError, ReplayDirection, TransactionApplyError},
};

/// Why a proven commit cannot become the session's current state.
#[derive(Clone, Debug, Eq, Error, PartialEq)]
pub enum SessionCommitError {
    /// The commit was authored before or after the session's current snapshot.
    #[error("session expects commit base {expected:?}, got {actual:?}")]
    StaleSnapshot {
        /// Authoritative current snapshot.
        expected: SnapshotId,
        /// Commit source snapshot.
        actual: SnapshotId,
    },
    /// A caller reused the current snapshot identity for different state.
    #[error("commit base state does not equal current state at snapshot {snapshot:?}")]
    BaseStateMismatch {
        /// Reused snapshot identity.
        snapshot: SnapshotId,
    },
}

/// Why an available linear-history entry could not replay atomically.
#[derive(Clone, Debug, Eq, Error, PartialEq)]
pub enum HistoryReplayError {
    /// Current content no longer matches the selected history boundary.
    #[error(transparent)]
    Boundary(#[from] CommitReplayError),
    /// Applying the complete replay transaction failed.
    #[error("{direction:?} history transaction failed: {source}")]
    Transaction {
        /// Attempted traversal direction.
        direction: ReplayDirection,
        /// Atomic transaction failure.
        source: Box<TransactionApplyError>,
    },
    /// A retained content entry unexpectedly produced no state change.
    #[error("{direction:?} history transaction was unexpectedly unchanged")]
    UnexpectedUnchanged {
        /// Attempted traversal direction.
        direction: ReplayDirection,
    },
    /// Applied operations did not restore the retained opposite boundary.
    #[error("{direction:?} history result did not match its retained boundary")]
    ResultMismatch {
        /// Attempted traversal direction.
        direction: ReplayDirection,
    },
}
