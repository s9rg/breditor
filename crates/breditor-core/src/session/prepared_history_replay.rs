use std::fmt;

use thiserror::Error;

use crate::transaction::{Commit, ReplayDirection};

use super::HistoryStamp;

/// One locally derived history replay bound to its exact session observation.
///
/// Only [`super::EditorSession`] can construct this token. It is deliberately
/// one-shot and retains the originating process-local history stamp so a later
/// publication cannot apply it after any effective session mutation.
#[must_use = "a prepared replay has no effect until it is published"]
pub(crate) struct PreparedHistoryReplay {
    direction: ReplayDirection,
    commit: Box<Commit>,
    origin_stamp: HistoryStamp,
}

impl PreparedHistoryReplay {
    pub(super) const fn new(
        direction: ReplayDirection,
        commit: Box<Commit>,
        origin_stamp: HistoryStamp,
    ) -> Self {
        Self { direction, commit, origin_stamp }
    }

    /// Returns the replay direction proved by this token.
    pub(crate) const fn direction(&self) -> ReplayDirection {
        self.direction
    }

    /// Returns the complete locally derived commit without consuming the token.
    pub(crate) const fn commit(&self) -> &Commit {
        &self.commit
    }

    pub(super) fn into_parts(self) -> (ReplayDirection, Box<Commit>, HistoryStamp) {
        (self.direction, self.commit, self.origin_stamp)
    }
}

impl fmt::Debug for PreparedHistoryReplay {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("PreparedHistoryReplay")
            .field("direction", &self.direction)
            .finish_non_exhaustive()
    }
}

/// Why a locally prepared replay can no longer publish.
///
/// This small projection retains neither the prepared commit nor any editor
/// state. It is crate-private because public [`super::EditorSession::undo`] and
/// [`super::EditorSession::redo`] prepare and publish synchronously. A value
/// means either the process-local history observation changed or the complete
/// current state no longer equals the prepared commit's source state.
#[derive(Clone, Copy, Debug, Eq, Error, PartialEq)]
#[error("prepared {direction:?} history replay is stale")]
pub(crate) struct PreparedHistoryReplayError {
    direction: ReplayDirection,
}

impl PreparedHistoryReplayError {
    pub(super) const fn new(direction: ReplayDirection) -> Self {
        Self { direction }
    }

    /// Returns the direction carried by the rejected preparation.
    pub(crate) const fn direction(self) -> ReplayDirection {
        self.direction
    }
}
