use std::{collections::BTreeMap, fmt};

use crate::session::EditorSession;

use super::{LocalLogId, LocalLogSequence, LocalSessionId, ReplayId};

/// Compact in-memory owner of one proved local-log prefix and its successor scope.
///
/// The anchor binds the exact recovered session and history to the
/// caller-declared sealed generation's sequence frontier. It retains every
/// compacted replay identity as a tombstone, but intentionally drops the old
/// full event proofs. The only checked transition exposed by this checkpoint
/// is recovery of its bound successor generation.
///
/// This value has no public constructor and no wire format. A separately
/// encoded [`crate::codec::SessionCheckpointJsonCodec`] value omits every log
/// field here and cannot restore this anchor by itself.
pub struct LocalLogCheckpointAnchor {
    session_id: LocalSessionId,
    checkpoint_log_id: LocalLogId,
    successor_log_id: LocalLogId,
    session: EditorSession,
    compacted_replays: BTreeMap<ReplayId, LocalLogSequence>,
    checkpoint_covered_through: Option<LocalLogSequence>,
    next_sequence: Option<LocalLogSequence>,
}

pub(super) struct LocalLogCheckpointAnchorParts {
    pub(super) session_id: LocalSessionId,
    pub(super) checkpoint_log_id: LocalLogId,
    pub(super) successor_log_id: LocalLogId,
    pub(super) session: EditorSession,
    pub(super) compacted_replays: BTreeMap<ReplayId, LocalLogSequence>,
    pub(super) checkpoint_covered_through: Option<LocalLogSequence>,
    pub(super) next_sequence: Option<LocalLogSequence>,
}

impl LocalLogCheckpointAnchor {
    pub(super) fn new(
        session_id: LocalSessionId,
        checkpoint_log_id: LocalLogId,
        successor_log_id: LocalLogId,
        session: EditorSession,
        compacted_replays: BTreeMap<ReplayId, LocalLogSequence>,
        checkpoint_covered_through: Option<LocalLogSequence>,
        next_sequence: Option<LocalLogSequence>,
    ) -> Self {
        Self {
            session_id,
            checkpoint_log_id,
            successor_log_id,
            session,
            compacted_replays,
            checkpoint_covered_through,
            next_sequence,
        }
    }

    /// Returns the caller-supplied durable session scope.
    #[must_use]
    pub const fn session_id(&self) -> &LocalSessionId {
        &self.session_id
    }

    /// Returns the caller-declared sealed generation at the checkpoint edge.
    #[must_use]
    pub const fn checkpoint_log_id(&self) -> &LocalLogId {
        &self.checkpoint_log_id
    }

    /// Returns the distinct generation admitted by checked continuation.
    #[must_use]
    pub const fn successor_log_id(&self) -> &LocalLogId {
        &self.successor_log_id
    }

    /// Returns the exact checkpointed editor session and retained history.
    #[must_use]
    pub const fn session(&self) -> &EditorSession {
        &self.session
    }

    /// Returns the caller-sealed prefix's last covered session-global sequence.
    #[must_use]
    pub const fn checkpoint_covered_through(&self) -> Option<LocalLogSequence> {
        self.checkpoint_covered_through
    }

    /// Returns the successor's required first sequence, or `None` after `u64::MAX`.
    #[must_use]
    pub const fn next_sequence(&self) -> Option<LocalLogSequence> {
        self.next_sequence
    }

    /// Returns the number of exact replay-ID tombstones retained from the prefix.
    #[must_use]
    pub fn compacted_replay_count(&self) -> u64 {
        u64::try_from(self.compacted_replays.len()).unwrap_or(u64::MAX)
    }

    /// Returns the original sequence for one compacted replay identity.
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

    pub(super) fn into_parts(self) -> LocalLogCheckpointAnchorParts {
        let Self {
            session_id,
            checkpoint_log_id,
            successor_log_id,
            session,
            compacted_replays,
            checkpoint_covered_through,
            next_sequence,
        } = self;
        LocalLogCheckpointAnchorParts {
            session_id,
            checkpoint_log_id,
            successor_log_id,
            session,
            compacted_replays,
            checkpoint_covered_through,
            next_sequence,
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
            .field("next_sequence", &self.next_sequence)
            .field("compacted_replay_count", &self.compacted_replay_count())
            .field("current_revision", &self.session.state().snapshot().revision())
            .field("undo_depth", &self.session.undo_depth())
            .field("redo_depth", &self.session.redo_depth())
            .finish_non_exhaustive()
    }
}
