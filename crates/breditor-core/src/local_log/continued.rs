use std::{collections::BTreeMap, fmt};

use crate::session::EditorSession;

use super::{LocalLogEntry, LocalLogId, LocalLogSequence, LocalSessionId, ReplayId};

/// Atomically recovered successor generation linked to one checked checkpoint prefix.
///
/// The value owns the exact final session, every compacted replay tombstone,
/// and every first-seen full entry from the successor batch. Exact duplicates
/// inside that batch are counted but not retained twice. This checkpoint does
/// not expose another generation transition; indefinitely repeated compaction
/// needs a separate lifetime replay-retention contract.
pub struct ContinuedLocalLog {
    session_id: LocalSessionId,
    checkpoint_log_id: LocalLogId,
    active_log_id: LocalLogId,
    session: EditorSession,
    compacted_replays: BTreeMap<ReplayId, LocalLogSequence>,
    active_entries: Box<[LocalLogEntry]>,
    active_replay_index: BTreeMap<ReplayId, usize>,
    observation_count: u64,
    unique_event_count: u64,
    exact_duplicate_count: u64,
    applied_operation_count: u64,
    checkpoint_covered_through: Option<LocalLogSequence>,
    covered_through: Option<LocalLogSequence>,
    next_sequence: Option<LocalLogSequence>,
}

impl ContinuedLocalLog {
    #[allow(clippy::too_many_arguments)]
    pub(super) fn new(
        session_id: LocalSessionId,
        checkpoint_log_id: LocalLogId,
        active_log_id: LocalLogId,
        session: EditorSession,
        compacted_replays: BTreeMap<ReplayId, LocalLogSequence>,
        active_entries: Box<[LocalLogEntry]>,
        active_replay_index: BTreeMap<ReplayId, usize>,
        observation_count: u64,
        unique_event_count: u64,
        exact_duplicate_count: u64,
        applied_operation_count: u64,
        checkpoint_covered_through: Option<LocalLogSequence>,
        covered_through: Option<LocalLogSequence>,
        next_sequence: Option<LocalLogSequence>,
    ) -> Self {
        Self {
            session_id,
            checkpoint_log_id,
            active_log_id,
            session,
            compacted_replays,
            active_entries,
            active_replay_index,
            observation_count,
            unique_event_count,
            exact_duplicate_count,
            applied_operation_count,
            checkpoint_covered_through,
            covered_through,
            next_sequence,
        }
    }

    /// Returns the durable session identity bound across checkpoint and successor.
    #[must_use]
    pub const fn session_id(&self) -> &LocalSessionId {
        &self.session_id
    }

    /// Returns the sealed generation represented by the checkpoint prefix.
    #[must_use]
    pub const fn checkpoint_log_id(&self) -> &LocalLogId {
        &self.checkpoint_log_id
    }

    /// Returns the recovered successor generation.
    #[must_use]
    pub const fn active_log_id(&self) -> &LocalLogId {
        &self.active_log_id
    }

    /// Returns the privately recovered final editor session.
    #[must_use]
    pub const fn session(&self) -> &EditorSession {
        &self.session
    }

    /// Consumes the owner and returns its final editor session.
    ///
    /// This deliberately drops compacted tombstones and active full replay
    /// bindings. The returned bare session cannot safely continue the log.
    #[must_use]
    pub fn into_session(self) -> EditorSession {
        self.session
    }

    /// Returns the checkpoint prefix's represented last covered sequence.
    #[must_use]
    pub const fn checkpoint_covered_through(&self) -> Option<LocalLogSequence> {
        self.checkpoint_covered_through
    }

    /// Returns the last sequence represented across checkpoint and successor.
    #[must_use]
    pub const fn covered_through(&self) -> Option<LocalLogSequence> {
        self.covered_through
    }

    /// Returns the next session-global sequence, or `None` after `u64::MAX`.
    #[must_use]
    pub const fn next_sequence(&self) -> Option<LocalLogSequence> {
        self.next_sequence
    }

    /// Returns the number of replay-ID tombstones from the checkpoint prefix.
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

    /// Returns first-seen successor entries in contiguous sequence order.
    #[must_use]
    pub const fn active_entries(&self) -> &[LocalLogEntry] {
        &self.active_entries
    }

    /// Returns the exact successor entry for one active replay identity.
    #[must_use]
    pub fn active_entry_for_replay_id(&self, replay_id: &ReplayId) -> Option<&LocalLogEntry> {
        self.active_replay_index.get(replay_id).and_then(|index| self.active_entries.get(*index))
    }

    /// Returns physical observations admitted in the successor batch.
    #[must_use]
    pub const fn observation_count(&self) -> u64 {
        self.observation_count
    }

    /// Returns first-seen events applied from the successor batch.
    #[must_use]
    pub const fn unique_event_count(&self) -> u64 {
        self.unique_event_count
    }

    /// Returns exact active-batch duplicates skipped before application.
    #[must_use]
    pub const fn exact_duplicate_count(&self) -> u64 {
        self.exact_duplicate_count
    }

    /// Returns aggregate forward operations charged in the successor batch.
    #[must_use]
    pub const fn applied_operation_count(&self) -> u64 {
        self.applied_operation_count
    }
}

impl fmt::Debug for ContinuedLocalLog {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("ContinuedLocalLog")
            .field("session_id", &self.session_id)
            .field("checkpoint_log_id", &self.checkpoint_log_id)
            .field("active_log_id", &self.active_log_id)
            .field("checkpoint_covered_through", &self.checkpoint_covered_through)
            .field("covered_through", &self.covered_through)
            .field("next_sequence", &self.next_sequence)
            .field("compacted_replay_count", &self.compacted_replay_count())
            .field("observation_count", &self.observation_count)
            .field("unique_event_count", &self.unique_event_count)
            .field("exact_duplicate_count", &self.exact_duplicate_count)
            .field("applied_operation_count", &self.applied_operation_count)
            .field("current_revision", &self.session.state().snapshot().revision())
            .field("undo_depth", &self.session.undo_depth())
            .field("redo_depth", &self.session.redo_depth())
            .finish_non_exhaustive()
    }
}
