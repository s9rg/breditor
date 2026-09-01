use std::{
    collections::{BTreeMap, BTreeSet},
    fmt,
};

use crate::session::EditorSession;

use super::{LocalLogId, LocalLogSequence, LocalSessionId, ReplayId};

/// Compact in-memory owner of one checked local-log checkpoint and successor scope.
///
/// The anchor binds one exact owned session and history to a declared sealed
/// generation, sequence frontier, and replay-tombstone set. Runtime compaction
/// creates it from a proved recovered prefix. Codec restoration proves strict
/// structure and equality with a trusted host binding, but cannot prove that
/// the session, frontier, and tombstones share causal history. Old full event
/// proofs are absent in either representation. The only checked transition
/// exposed by this checkpoint is recovery of its bound successor generation.
///
/// This value has no public constructor. Runtime recovery can compact into it,
/// and the strict, expected-binding
/// [`crate::codec::LocalLogCheckpointJsonCodec`] can restore it. A separately
/// encoded [`crate::codec::SessionCheckpointJsonCodec`] value omits every log
/// field here and cannot restore this anchor by itself.
pub struct LocalLogCheckpointAnchor {
    session_id: LocalSessionId,
    checkpoint_log_id: LocalLogId,
    successor_log_id: LocalLogId,
    session: EditorSession,
    compacted_replays: BTreeMap<ReplayId, LocalLogSequence>,
    checkpoint_covered_through: Option<LocalLogSequence>,
}

pub(super) struct LocalLogCheckpointAnchorParts {
    pub(super) session_id: LocalSessionId,
    pub(super) checkpoint_log_id: LocalLogId,
    pub(super) successor_log_id: LocalLogId,
    pub(super) session: EditorSession,
    pub(super) compacted_replays: BTreeMap<ReplayId, LocalLogSequence>,
    pub(super) checkpoint_covered_through: Option<LocalLogSequence>,
}

/// Exhaustive borrowed durable view used by the strict checkpoint codec.
pub(crate) struct LocalLogCheckpointAnchorCheckpointParts<'a> {
    pub(crate) session_id: &'a LocalSessionId,
    pub(crate) checkpoint_log_id: &'a LocalLogId,
    pub(crate) successor_log_id: &'a LocalLogId,
    pub(crate) session: &'a EditorSession,
    pub(crate) compacted_replays: &'a BTreeMap<ReplayId, LocalLogSequence>,
    pub(crate) checkpoint_covered_through: Option<LocalLogSequence>,
}

/// Private invariant rejected before a decoded anchor can be published.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) enum LocalLogCheckpointAnchorInvariantError {
    GenerationNotAdvanced,
    TombstoneCountMismatch,
    DuplicateSequence,
    SequenceOutOfRange,
    NonGenesisEmptyHistory,
}

impl LocalLogCheckpointAnchor {
    pub(super) fn new(
        session_id: LocalSessionId,
        checkpoint_log_id: LocalLogId,
        successor_log_id: LocalLogId,
        session: EditorSession,
        compacted_replays: BTreeMap<ReplayId, LocalLogSequence>,
        checkpoint_covered_through: Option<LocalLogSequence>,
    ) -> Self {
        Self {
            session_id,
            checkpoint_log_id,
            successor_log_id,
            session,
            compacted_replays,
            checkpoint_covered_through,
        }
    }

    /// Publishes a decoded anchor only after rechecking its complete topology.
    pub(crate) fn try_from_checkpoint_parts(
        session_id: LocalSessionId,
        checkpoint_log_id: LocalLogId,
        successor_log_id: LocalLogId,
        session: EditorSession,
        compacted_replays: BTreeMap<ReplayId, LocalLogSequence>,
        checkpoint_covered_through: Option<LocalLogSequence>,
    ) -> Result<Self, LocalLogCheckpointAnchorInvariantError> {
        if checkpoint_log_id == successor_log_id {
            return Err(LocalLogCheckpointAnchorInvariantError::GenerationNotAdvanced);
        }
        let expected_count = checkpoint_covered_through.map_or(0, LocalLogSequence::get);
        let actual_count = u64::try_from(compacted_replays.len())
            .map_err(|_| LocalLogCheckpointAnchorInvariantError::TombstoneCountMismatch)?;
        if actual_count != expected_count {
            return Err(LocalLogCheckpointAnchorInvariantError::TombstoneCountMismatch);
        }
        let mut sequences = BTreeSet::new();
        for sequence in compacted_replays.values().copied() {
            if sequence.get() > expected_count {
                return Err(LocalLogCheckpointAnchorInvariantError::SequenceOutOfRange);
            }
            if !sequences.insert(sequence) {
                return Err(LocalLogCheckpointAnchorInvariantError::DuplicateSequence);
            }
        }
        if expected_count == 0 && !session.has_genesis_empty_history() {
            return Err(LocalLogCheckpointAnchorInvariantError::NonGenesisEmptyHistory);
        }
        Ok(Self::new(
            session_id,
            checkpoint_log_id,
            successor_log_id,
            session,
            compacted_replays,
            checkpoint_covered_through,
        ))
    }

    /// Returns the caller-supplied durable session scope.
    #[must_use]
    pub const fn session_id(&self) -> &LocalSessionId {
        &self.session_id
    }

    /// Returns the sealed generation represented at the checkpoint edge.
    #[must_use]
    pub const fn checkpoint_log_id(&self) -> &LocalLogId {
        &self.checkpoint_log_id
    }

    /// Returns the distinct generation admitted by checked continuation.
    #[must_use]
    pub const fn successor_log_id(&self) -> &LocalLogId {
        &self.successor_log_id
    }

    /// Returns the exact owned checkpoint session and retained history.
    #[must_use]
    pub const fn session(&self) -> &EditorSession {
        &self.session
    }

    /// Returns the represented prefix's last covered session-global sequence.
    #[must_use]
    pub const fn checkpoint_covered_through(&self) -> Option<LocalLogSequence> {
        self.checkpoint_covered_through
    }

    /// Returns the successor's required first sequence, or `None` after `u64::MAX`.
    #[must_use]
    pub const fn next_sequence(&self) -> Option<LocalLogSequence> {
        match self.checkpoint_covered_through {
            None => Some(LocalLogSequence::FIRST),
            Some(sequence) => match sequence.successor() {
                Ok(successor) => Some(successor),
                Err(_) => None,
            },
        }
    }

    /// Returns the number of replay-ID tombstones represented for the prefix.
    #[must_use]
    pub fn compacted_replay_count(&self) -> u64 {
        u64::try_from(self.compacted_replays.len()).unwrap_or(u64::MAX)
    }

    /// Returns the sequence represented for one compacted replay identity.
    #[must_use]
    pub fn compacted_sequence_for_replay_id(
        &self,
        replay_id: &ReplayId,
    ) -> Option<LocalLogSequence> {
        self.compacted_replays.get(replay_id).copied()
    }

    /// Consumes the anchor and returns its exact editor session.
    ///
    /// This deliberately drops the generation, sequence, and replay-tombstone
    /// bindings. The returned bare session cannot safely continue the log.
    #[must_use]
    pub fn into_session(self) -> EditorSession {
        self.session
    }

    pub(crate) fn checkpoint_parts(&self) -> LocalLogCheckpointAnchorCheckpointParts<'_> {
        let Self {
            session_id,
            checkpoint_log_id,
            successor_log_id,
            session,
            compacted_replays,
            checkpoint_covered_through,
        } = self;
        LocalLogCheckpointAnchorCheckpointParts {
            session_id,
            checkpoint_log_id,
            successor_log_id,
            session,
            compacted_replays,
            checkpoint_covered_through: *checkpoint_covered_through,
        }
    }

    pub(super) fn into_parts(self) -> LocalLogCheckpointAnchorParts {
        let Self {
            session_id,
            checkpoint_log_id,
            successor_log_id,
            session,
            compacted_replays,
            checkpoint_covered_through,
        } = self;
        LocalLogCheckpointAnchorParts {
            session_id,
            checkpoint_log_id,
            successor_log_id,
            session,
            compacted_replays,
            checkpoint_covered_through,
        }
    }
}

impl fmt::Debug for LocalLogCheckpointAnchor {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("LocalLogCheckpointAnchor")
            .field("session_id", &self.session_id)
            .field("checkpoint_log_id", &self.checkpoint_log_id)
            .field("successor_log_id", &self.successor_log_id)
            .field("checkpoint_covered_through", &self.checkpoint_covered_through)
            .field("next_sequence", &self.next_sequence())
            .field("compacted_replay_count", &self.compacted_replay_count())
            .field("current_revision", &self.session.state().snapshot().revision())
            .field("undo_depth", &self.session.undo_depth())
            .field("redo_depth", &self.session.redo_depth())
            .finish_non_exhaustive()
    }
}
