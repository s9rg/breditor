use std::{collections::BTreeMap, fmt};

use crate::session::EditorSession;

use super::{
    LocalLogCheckpointAnchor, LocalLogEntry, LocalLogId, LocalLogRecoveryError, LocalLogSequence,
    LocalSessionId, ReplayId,
};

/// Fully applied, genesis-anchored prefix of one uncompacted local-log generation.
///
/// The value owns the recovered session and every first-seen logical entry.
/// Retaining those entries preserves exact replay bindings for a future checked
/// continuation or checkpoint protocol. Physical exact duplicates are counted
/// but not retained a second time.
pub struct RecoveredLocalLog {
    session_id: LocalSessionId,
    active_log_id: LocalLogId,
    session: EditorSession,
    entries: Box<[LocalLogEntry]>,
    replay_index: BTreeMap<ReplayId, usize>,
    observation_count: u64,
    unique_event_count: u64,
    exact_duplicate_count: u64,
    applied_operation_count: u64,
    covered_through: Option<LocalLogSequence>,
    next_sequence: Option<LocalLogSequence>,
}

impl RecoveredLocalLog {
    #[allow(clippy::too_many_arguments)]
    pub(super) fn new(
        session_id: LocalSessionId,
        active_log_id: LocalLogId,
        session: EditorSession,
        entries: Box<[LocalLogEntry]>,
        replay_index: BTreeMap<ReplayId, usize>,
        observation_count: u64,
        unique_event_count: u64,
        exact_duplicate_count: u64,
        applied_operation_count: u64,
        covered_through: Option<LocalLogSequence>,
        next_sequence: Option<LocalLogSequence>,
    ) -> Self {
        Self {
            session_id,
            active_log_id,
            session,
            entries,
            replay_index,
            observation_count,
            unique_event_count,
            exact_duplicate_count,
            applied_operation_count,
            covered_through,
            next_sequence,
        }
    }

    /// Returns the caller-supplied session scope checked on every observation.
    ///
    /// An empty prefix checks no entry, and this identity is never provenance
    /// or authenticity evidence.
    #[must_use]
    pub const fn session_id(&self) -> &LocalSessionId {
        &self.session_id
    }

    /// Returns the caller-supplied generation checked on every observation.
    ///
    /// An empty prefix checks no entry, and this identity is never provenance
    /// or authenticity evidence.
    #[must_use]
    pub const fn active_log_id(&self) -> &LocalLogId {
        &self.active_log_id
    }

    /// Returns the privately recovered editor session.
    #[must_use]
    pub const fn session(&self) -> &EditorSession {
        &self.session
    }

    /// Consumes the proof owner and returns its recovered editor session.
    ///
    /// This deliberately drops the retained replay bindings. A future checked
    /// continuation must retain the complete [`RecoveredLocalLog`] or persist a
    /// stronger checkpoint rather than recovering from this session alone.
    #[must_use]
    pub fn into_session(self) -> EditorSession {
        self.session
    }

    /// Compacts this caller-sealed recovered prefix into a runtime checkpoint
    /// anchor.
    ///
    /// The successor generation must have a distinct caller-supplied identity.
    /// The caller's transition declares the old prefix sealed; this value does
    /// not prove that storage has no later old-generation entries or fence a
    /// concurrent writer.
    /// On success, every retained full event proof is dropped and replaced by
    /// an exact replay-ID-to-sequence tombstone. The session, history, sequence
    /// frontier, and generation boundary remain owned together. Reuse of a
    /// compacted replay ID can therefore be rejected, but an old payload can no
    /// longer be classified as an exact retry versus a conflicting reuse.
    ///
    /// This is an in-memory ownership transition. It does not encode, persist,
    /// authenticate, flush, or atomically replace a checkpoint and log.
    ///
    /// # Errors
    ///
    /// Returns [`LocalLogRecoveryError::GenerationNotAdvanced`] when
    /// `successor_log_id` equals the recovered active generation. Because this
    /// method consumes `self`, either failure drops the recovered owner or
    /// success publishes the complete anchor; callers should compare the IDs
    /// before calling when they need to retain this value after bad input.
    pub fn try_into_checkpoint_anchor(
        self,
        successor_log_id: LocalLogId,
    ) -> Result<LocalLogCheckpointAnchor, LocalLogRecoveryError> {
        let Self {
            session_id,
            active_log_id,
            session,
            entries,
            replay_index,
            observation_count: _,
            unique_event_count: _,
            exact_duplicate_count: _,
            applied_operation_count: _,
            covered_through,
            next_sequence: _,
        } = self;
        if active_log_id == successor_log_id {
            return Err(LocalLogRecoveryError::GenerationNotAdvanced {
                checkpoint_log_id: active_log_id,
                successor_log_id,
            });
        }

        let retained_index_count = replay_index.len();
        let compacted_replays = entries
            .into_vec()
            .into_iter()
            .map(|entry| (entry.replay_id().clone(), entry.sequence()))
            .collect::<BTreeMap<_, _>>();
        debug_assert_eq!(compacted_replays.len(), retained_index_count);

        Ok(LocalLogCheckpointAnchor::new(
            session_id,
            active_log_id,
            successor_log_id,
            session,
            compacted_replays,
            covered_through,
        ))
    }

    /// Returns first-seen logical entries in contiguous sequence order.
    #[must_use]
    pub const fn entries(&self) -> &[LocalLogEntry] {
        &self.entries
    }

    /// Returns the exact retained entry for one accepted replay identity.
    #[must_use]
    pub fn entry_for_replay_id(&self, replay_id: &ReplayId) -> Option<&LocalLogEntry> {
        self.replay_index.get(replay_id).and_then(|index| self.entries.get(*index))
    }

    /// Returns the last applied logical sequence, or `None` for an empty prefix.
    #[must_use]
    pub const fn covered_through(&self) -> Option<LocalLogSequence> {
        self.covered_through
    }

    /// Returns the next available logical sequence, or `None` after `u64::MAX`.
    #[must_use]
    pub const fn next_sequence(&self) -> Option<LocalLogSequence> {
        self.next_sequence
    }

    /// Returns the number of physical inputs, including exact duplicates.
    #[must_use]
    pub const fn observation_count(&self) -> u64 {
        self.observation_count
    }

    /// Returns the number of first-seen logical events applied exactly once.
    #[must_use]
    pub const fn unique_event_count(&self) -> u64 {
        self.unique_event_count
    }

    /// Returns the number of physical exact duplicates skipped before application.
    #[must_use]
    pub const fn exact_duplicate_count(&self) -> u64 {
        self.exact_duplicate_count
    }

    /// Returns aggregate forward operations charged across applied events.
    #[must_use]
    pub const fn applied_operation_count(&self) -> u64 {
        self.applied_operation_count
    }
}

impl fmt::Debug for RecoveredLocalLog {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("RecoveredLocalLog")
            .field("session_id", &self.session_id)
            .field("active_log_id", &self.active_log_id)
            .field("covered_through", &self.covered_through)
            .field("next_sequence", &self.next_sequence)
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
