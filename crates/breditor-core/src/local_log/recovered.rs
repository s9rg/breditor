use std::{collections::BTreeMap, fmt};

use crate::session::EditorSession;

use super::{LocalLogEntry, LocalLogId, LocalLogSequence, LocalSessionId, ReplayId};

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

pub(super) struct RecoveredLocalLogCompactionParts {
    pub(super) session_id: LocalSessionId,
    pub(super) active_log_id: LocalLogId,
    pub(super) session: EditorSession,
    pub(super) entries: Box<[LocalLogEntry]>,
    pub(super) covered_through: Option<LocalLogSequence>,
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

    /// Returns the replay count that checkpoint compaction would retain.
    ///
    /// Exact physical duplicates do not add another represented replay.
    #[must_use]
    pub const fn represented_replay_count(&self) -> u64 {
        match self.covered_through {
            Some(sequence) => sequence.get(),
            None => 0,
        }
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

    pub(super) fn into_compaction_parts(self) -> RecoveredLocalLogCompactionParts {
        let Self {
            session_id,
            active_log_id,
            session,
            entries,
            replay_index: _,
            observation_count: _,
            unique_event_count: _,
            exact_duplicate_count: _,
            applied_operation_count: _,
            covered_through,
            next_sequence: _,
        } = self;
        RecoveredLocalLogCompactionParts {
            session_id,
            active_log_id,
            session,
            entries,
            covered_through,
        }
    }

    pub(super) fn compaction_topology_is_valid(&self) -> bool {
        let represented = self.represented_replay_count();
        let Ok(entry_count) = u64::try_from(self.entries.len()) else {
            return false;
        };
        if represented != entry_count
            || self.replay_index.len() != self.entries.len()
            || self.unique_event_count != entry_count
            || self.unique_event_count.checked_add(self.exact_duplicate_count)
                != Some(self.observation_count)
            || self.next_sequence != next_after(self.covered_through)
            || (represented == 0 && !self.session.has_genesis_empty_history())
        {
            return false;
        }
        for (index, entry) in self.entries.iter().enumerate() {
            let Ok(offset) = u64::try_from(index) else {
                return false;
            };
            let Some(expected) = offset.checked_add(1) else {
                return false;
            };
            if entry.session_id() != &self.session_id
                || entry.log_id() != &self.active_log_id
                || entry.sequence().get() != expected
                || self.replay_index.get(entry.replay_id()) != Some(&index)
            {
                return false;
            }
        }
        true
    }
}

const fn next_after(sequence: Option<LocalLogSequence>) -> Option<LocalLogSequence> {
    match sequence {
        None => Some(LocalLogSequence::FIRST),
        Some(sequence) => match sequence.successor() {
            Ok(successor) => Some(successor),
            Err(_) => None,
        },
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

#[cfg(test)]
mod tests {
    use std::{collections::BTreeMap, error::Error};

    use super::RecoveredLocalLog;
    use crate::local_log::{
        LocalLogCompactionErrorCode, LocalLogCompactionLimits, LocalLogEntry, LocalLogEvent,
        LocalLogId, LocalLogSequence, LocalSessionId, ReplayId, test_support::empty_session,
    };

    #[test]
    fn compaction_rejects_a_private_replay_index_mismatch_and_returns_the_owner()
    -> Result<(), Box<dyn Error>> {
        let session_id = LocalSessionId::try_new("session:invalid-recovered-index")?;
        let active_log_id = LocalLogId::try_new("log:invalid-recovered-index:g0")?;
        let successor_log_id = LocalLogId::try_new("log:invalid-recovered-index:g1")?;
        let replay_id = ReplayId::try_new("request:invalid-recovered-index")?;
        let entry = LocalLogEntry::new(
            session_id.clone(),
            active_log_id.clone(),
            LocalLogSequence::FIRST,
            replay_id.clone(),
            LocalLogEvent::close_history_group(),
        );
        let mut recovered = RecoveredLocalLog::new(
            session_id,
            active_log_id,
            empty_session("invalid-recovered-index")?,
            vec![entry].into_boxed_slice(),
            BTreeMap::from([(replay_id.clone(), 0)]),
            1,
            1,
            0,
            0,
            Some(LocalLogSequence::FIRST),
            Some(LocalLogSequence::try_new(2)?),
        );

        recovered.replay_index.clear();
        let failure = recovered
            .try_into_checkpoint_anchor(successor_log_id, LocalLogCompactionLimits::new(1))
            .err()
            .ok_or("malformed recovered topology unexpectedly compacted")?;
        assert_eq!(failure.code(), LocalLogCompactionErrorCode::InvalidReplayTopology);

        let recovered = failure.into_owner();
        assert_eq!(recovered.entries.len(), 1);
        assert!(recovered.replay_index.is_empty());
        assert_eq!(recovered.entries[0].replay_id(), &replay_id);
        Ok(())
    }
}
