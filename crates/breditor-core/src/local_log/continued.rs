use std::{
    collections::{BTreeMap, BTreeSet},
    fmt,
};

use crate::session::EditorSession;

use super::{
    LocalLogCompactionLimits, LocalLogEntry, LocalLogId, LocalLogSequence, LocalSessionId, ReplayId,
};

/// Atomically recovered successor generation linked to one checked checkpoint prefix.
///
/// The value owns the exact final session, every compacted replay tombstone,
/// and every first-seen full entry from the successor batch. Exact duplicates
/// inside that batch are counted but not retained twice. Consuming compaction
/// can rotate this owner into another anchor while enforcing the lifetime
/// replay-retention policy inherited from its checkpoint.
pub struct ContinuedLocalLog {
    session_id: LocalSessionId,
    checkpoint_log_id: LocalLogId,
    active_log_id: LocalLogId,
    compaction_limits: LocalLogCompactionLimits,
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
}

pub(super) struct ContinuedLocalLogCompactionParts {
    pub(super) session_id: LocalSessionId,
    pub(super) active_log_id: LocalLogId,
    pub(super) session: EditorSession,
    pub(super) compacted_replays: BTreeMap<ReplayId, LocalLogSequence>,
    pub(super) active_entries: Box<[LocalLogEntry]>,
    pub(super) covered_through: Option<LocalLogSequence>,
}

impl ContinuedLocalLog {
    #[allow(clippy::too_many_arguments)]
    pub(super) fn new(
        session_id: LocalSessionId,
        checkpoint_log_id: LocalLogId,
        active_log_id: LocalLogId,
        compaction_limits: LocalLogCompactionLimits,
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
    ) -> Self {
        Self {
            session_id,
            checkpoint_log_id,
            active_log_id,
            compaction_limits,
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

    /// Returns the inherited lifetime replay-retention policy.
    #[must_use]
    pub const fn compaction_limits(&self) -> LocalLogCompactionLimits {
        self.compaction_limits
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
        match self.covered_through {
            None => Some(LocalLogSequence::FIRST),
            Some(sequence) => match sequence.successor() {
                Ok(successor) => Some(successor),
                Err(_) => None,
            },
        }
    }

    /// Returns the cumulative replay count that compaction would retain.
    ///
    /// Exact physical duplicates do not add another represented replay.
    #[must_use]
    pub const fn represented_replay_count(&self) -> u64 {
        match self.covered_through {
            Some(sequence) => sequence.get(),
            None => 0,
        }
    }

    /// Returns the number of replay-ID tombstones from the checkpoint prefix.
    #[must_use]
    pub fn compacted_replay_count(&self) -> u64 {
        u64::try_from(self.compacted_replays.len()).unwrap_or(u64::MAX)
    }

    pub(super) fn checked_compacted_replay_count(&self) -> Option<u64> {
        u64::try_from(self.compacted_replays.len()).ok()
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

    pub(super) fn into_compaction_parts(self) -> ContinuedLocalLogCompactionParts {
        let Self {
            session_id,
            checkpoint_log_id: _,
            active_log_id,
            compaction_limits: _,
            session,
            compacted_replays,
            active_entries,
            active_replay_index: _,
            observation_count: _,
            unique_event_count: _,
            exact_duplicate_count: _,
            applied_operation_count: _,
            checkpoint_covered_through: _,
            covered_through,
        } = self;
        ContinuedLocalLogCompactionParts {
            session_id,
            active_log_id,
            session,
            compacted_replays,
            active_entries,
            covered_through,
        }
    }

    pub(super) fn compaction_topology_is_valid(&self) -> bool {
        if self.checkpoint_log_id == self.active_log_id {
            return false;
        }
        let prefix = self.checkpoint_covered_through.map_or(0, LocalLogSequence::get);
        let Ok(compacted_count) = u64::try_from(self.compacted_replays.len()) else {
            return false;
        };
        let Ok(active_count) = u64::try_from(self.active_entries.len()) else {
            return false;
        };
        let Some(represented) = compacted_count.checked_add(active_count) else {
            return false;
        };
        if prefix != compacted_count
            || self.active_replay_index.len() != self.active_entries.len()
            || self.unique_event_count != active_count
            || self.unique_event_count.checked_add(self.exact_duplicate_count)
                != Some(self.observation_count)
            || self.represented_replay_count() != represented
            || compacted_count > self.compaction_limits.max_replay_tombstones()
            || (represented == 0 && !self.session.has_genesis_empty_history())
        {
            return false;
        }

        let mut compacted_sequences = BTreeSet::new();
        for sequence in self.compacted_replays.values().copied() {
            if sequence.get() > prefix || !compacted_sequences.insert(sequence) {
                return false;
            }
        }
        for (index, entry) in self.active_entries.iter().enumerate() {
            let Ok(offset) = u64::try_from(index) else {
                return false;
            };
            let Some(expected) = prefix.checked_add(offset).and_then(|value| value.checked_add(1))
            else {
                return false;
            };
            if entry.session_id() != &self.session_id
                || entry.log_id() != &self.active_log_id
                || entry.sequence().get() != expected
                || self.compacted_replays.contains_key(entry.replay_id())
                || self.active_replay_index.get(entry.replay_id()) != Some(&index)
            {
                return false;
            }
        }
        true
    }
}

impl fmt::Debug for ContinuedLocalLog {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("ContinuedLocalLog")
            .field("session_id", &self.session_id)
            .field("checkpoint_log_id", &self.checkpoint_log_id)
            .field("active_log_id", &self.active_log_id)
            .field("compaction_limits", &self.compaction_limits)
            .field("checkpoint_covered_through", &self.checkpoint_covered_through)
            .field("covered_through", &self.covered_through)
            .field("next_sequence", &self.next_sequence())
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

#[cfg(test)]
mod tests {
    use std::{collections::BTreeMap, error::Error};

    use super::ContinuedLocalLog;
    use crate::local_log::{
        LocalLogCompactionErrorCode, LocalLogCompactionLimits, LocalLogEntry, LocalLogEvent,
        LocalLogId, LocalLogSequence, LocalSessionId, ReplayId, test_support::empty_session,
    };

    fn entry(
        session_id: &LocalSessionId,
        log_id: &LocalLogId,
        sequence: u64,
        replay_id: &str,
    ) -> Result<LocalLogEntry, Box<dyn Error>> {
        Ok(LocalLogEntry::new(
            session_id.clone(),
            log_id.clone(),
            LocalLogSequence::try_new(sequence)?,
            ReplayId::try_new(replay_id)?,
            LocalLogEvent::close_history_group(),
        ))
    }

    fn fixture() -> Result<(ContinuedLocalLog, LocalLogId), Box<dyn Error>> {
        let session_id = LocalSessionId::try_new("session:invalid-continued-topology")?;
        let first_log = LocalLogId::try_new("log:invalid-continued-topology:g0")?;
        let active_log = LocalLogId::try_new("log:invalid-continued-topology:g1")?;
        let successor_log = LocalLogId::try_new("log:invalid-continued-topology:g2")?;
        let compacted_replay = ReplayId::try_new("request:compacted")?;
        let active_replay = ReplayId::try_new("request:active")?;
        let active_entry = entry(&session_id, &active_log, 2, active_replay.as_str())?;
        let continued = ContinuedLocalLog::new(
            session_id,
            first_log,
            active_log,
            LocalLogCompactionLimits::new(2),
            empty_session("invalid-continued-topology")?,
            BTreeMap::from([(compacted_replay, LocalLogSequence::FIRST)]),
            vec![active_entry].into_boxed_slice(),
            BTreeMap::from([(active_replay, 0)]),
            1,
            1,
            0,
            0,
            Some(LocalLogSequence::FIRST),
            Some(LocalLogSequence::try_new(2)?),
        );
        Ok((continued, successor_log))
    }

    fn assert_invalid_topology(
        continued: ContinuedLocalLog,
        successor_log: LocalLogId,
    ) -> Result<ContinuedLocalLog, Box<dyn Error>> {
        let failure = continued
            .try_into_checkpoint_anchor(successor_log)
            .err()
            .ok_or("malformed continued topology unexpectedly compacted")?;
        assert_eq!(failure.code(), LocalLogCompactionErrorCode::InvalidReplayTopology);
        Ok(failure.into_owner())
    }

    #[test]
    fn compaction_rejects_a_private_active_index_mismatch_and_returns_the_owner()
    -> Result<(), Box<dyn Error>> {
        let (mut continued, successor_log) = fixture()?;
        continued.active_replay_index.clear();

        let continued = assert_invalid_topology(continued, successor_log)?;
        assert!(continued.active_replay_index.is_empty());
        assert_eq!(continued.active_entries.len(), 1);
        Ok(())
    }

    #[test]
    fn compaction_rejects_a_private_noncontiguous_sequence_and_returns_the_owner()
    -> Result<(), Box<dyn Error>> {
        let (mut continued, successor_log) = fixture()?;
        let replay_id = ReplayId::try_new("request:active")?;
        continued.active_entries = vec![LocalLogEntry::new(
            continued.session_id.clone(),
            continued.active_log_id.clone(),
            LocalLogSequence::try_new(3)?,
            replay_id,
            LocalLogEvent::close_history_group(),
        )]
        .into_boxed_slice();

        let continued = assert_invalid_topology(continued, successor_log)?;
        assert_eq!(continued.active_entries[0].sequence().get(), 3);
        Ok(())
    }

    #[test]
    fn compaction_rejects_a_private_cross_set_replay_collision_and_returns_the_owner()
    -> Result<(), Box<dyn Error>> {
        let (mut continued, successor_log) = fixture()?;
        let replay_id = ReplayId::try_new("request:compacted")?;
        continued.active_entries = vec![LocalLogEntry::new(
            continued.session_id.clone(),
            continued.active_log_id.clone(),
            LocalLogSequence::try_new(2)?,
            replay_id.clone(),
            LocalLogEvent::close_history_group(),
        )]
        .into_boxed_slice();
        continued.active_replay_index = BTreeMap::from([(replay_id.clone(), 0)]);

        let continued = assert_invalid_topology(continued, successor_log)?;
        assert_eq!(continued.active_entries[0].replay_id(), &replay_id);
        assert_eq!(continued.compacted_replays.get(&replay_id), Some(&LocalLogSequence::FIRST));
        Ok(())
    }
}
