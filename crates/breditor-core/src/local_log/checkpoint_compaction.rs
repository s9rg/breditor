use std::collections::{BTreeMap, btree_map::Entry};

use super::{
    ContinuedLocalLog, LocalLogCheckpointAnchor, LocalLogCompactionError,
    LocalLogCompactionFailure, LocalLogCompactionLimits, LocalLogEntry, LocalLogId,
    LocalLogSequence, RecoveredLocalLog, ReplayId,
};

impl RecoveredLocalLog {
    /// Compacts this caller-sealed genesis generation into a runtime checkpoint.
    ///
    /// The lifetime policy is selected at this first proof-dropping boundary and
    /// is carried by the resulting anchor through every in-memory rotation.
    /// The transition replaces each retained full event with its exact
    /// replay-ID-to-sequence tombstone while moving the session and complete
    /// history unchanged. The caller still must seal storage and fence writers;
    /// this in-memory transition proves neither.
    ///
    /// # Errors
    ///
    /// Returns a [`LocalLogCompactionFailure`] containing this unchanged owner
    /// when the successor does not advance, the complete retained replay count
    /// exceeds `limits`, or a private topology invariant is violated. Limit and
    /// topology checks finish before any full event proof is dropped. A
    /// returned `Err` preserves ownership; allocation failure, panic, abort,
    /// and process crash are outside that typed atomicity contract.
    pub fn try_into_checkpoint_anchor(
        self,
        successor_log_id: LocalLogId,
        limits: LocalLogCompactionLimits,
    ) -> Result<LocalLogCheckpointAnchor, LocalLogCompactionFailure<Self>> {
        if self.active_log_id() == &successor_log_id {
            let error = LocalLogCompactionError::GenerationNotAdvanced {
                checkpoint_log_id: self.active_log_id().clone(),
                successor_log_id,
            };
            return Err(LocalLogCompactionFailure::new(self, error));
        }

        let active = match count_entries(self.entries()) {
            Ok(active) => active,
            Err(error) => return Err(LocalLogCompactionFailure::new(self, error)),
        };
        if let Err(error) = checked_cumulative_tombstone_count(0, active, limits) {
            return Err(LocalLogCompactionFailure::new(self, error));
        }
        if !self.compaction_topology_is_valid() {
            return Err(LocalLogCompactionFailure::new(
                self,
                LocalLogCompactionError::InvalidReplayTopology,
            ));
        }

        let parts = self.into_compaction_parts();
        let compacted_replays = tombstones_from_entries(parts.entries);
        Ok(LocalLogCheckpointAnchor::new(
            parts.session_id,
            parts.active_log_id,
            successor_log_id,
            limits,
            parts.session,
            compacted_replays,
            parts.covered_through,
        ))
    }
}

impl ContinuedLocalLog {
    /// Seals the active generation and rotates into another checkpoint anchor.
    ///
    /// Every prior tombstone and active first-seen replay becomes one cumulative
    /// exact tombstone set. The inherited lifetime ceiling is charged against
    /// that complete set before any active full proof is dropped; exact physical
    /// duplicates do not consume another slot. Session state, complete history,
    /// session-global sequence, and the lifetime policy move unchanged.
    ///
    /// The supplied successor must differ from both the active generation and
    /// the immediately preceding generation still known by this owner. Local
    /// Log Checkpoint V1 does not retain older generation IDs, so preventing
    /// lifetime generation reuse remains a host/storage obligation.
    ///
    /// # Errors
    ///
    /// Returns a [`LocalLogCompactionFailure`] containing this unchanged owner
    /// when generation rotation is invalid, cumulative accounting overflows or
    /// exceeds the inherited policy, or a private topology invariant is
    /// violated. Every typed validation completes before proof conversion. A
    /// returned `Err` preserves ownership; allocation failure, panic, abort,
    /// and process crash are outside that typed atomicity contract.
    pub fn try_into_checkpoint_anchor(
        self,
        successor_log_id: LocalLogId,
    ) -> Result<LocalLogCheckpointAnchor, LocalLogCompactionFailure<Self>> {
        let limits = self.compaction_limits();
        self.try_into_checkpoint_anchor_with_limits(successor_log_id, limits)
    }

    /// Seals the active generation with an explicit replacement lifetime policy.
    ///
    /// This is the deliberate escape hatch when an active generation has grown
    /// beyond the previously inherited compaction ceiling. The new policy is
    /// still charged against the complete cumulative replay set and is carried
    /// by the resulting anchor. Ordinary rotations should use
    /// [`Self::try_into_checkpoint_anchor`] so policy cannot drift accidentally.
    ///
    /// # Errors
    ///
    /// Returns a [`LocalLogCompactionFailure`] containing this unchanged owner
    /// under the same precedence and atomicity contract as the inherited-policy
    /// transition.
    pub fn try_into_checkpoint_anchor_with_limits(
        self,
        successor_log_id: LocalLogId,
        limits: LocalLogCompactionLimits,
    ) -> Result<LocalLogCheckpointAnchor, LocalLogCompactionFailure<Self>> {
        if self.active_log_id() == &successor_log_id {
            let error = LocalLogCompactionError::GenerationNotAdvanced {
                checkpoint_log_id: self.active_log_id().clone(),
                successor_log_id,
            };
            return Err(LocalLogCompactionFailure::new(self, error));
        }
        if self.checkpoint_log_id() == &successor_log_id {
            return Err(LocalLogCompactionFailure::new(
                self,
                LocalLogCompactionError::KnownGenerationReuse,
            ));
        }

        let Some(compacted) = self.checked_compacted_replay_count() else {
            return Err(LocalLogCompactionFailure::new(
                self,
                LocalLogCompactionError::ReplayTombstoneCountOverflow,
            ));
        };
        let active = match count_entries(self.active_entries()) {
            Ok(active) => active,
            Err(error) => return Err(LocalLogCompactionFailure::new(self, error)),
        };
        if let Err(error) = checked_cumulative_tombstone_count(compacted, active, limits) {
            return Err(LocalLogCompactionFailure::new(self, error));
        }
        if !self.compaction_topology_is_valid() {
            return Err(LocalLogCompactionFailure::new(
                self,
                LocalLogCompactionError::InvalidReplayTopology,
            ));
        }

        let parts = self.into_compaction_parts();
        let mut compacted_replays = parts.compacted_replays;
        extend_tombstones(&mut compacted_replays, parts.active_entries);
        Ok(LocalLogCheckpointAnchor::new(
            parts.session_id,
            parts.active_log_id,
            successor_log_id,
            limits,
            parts.session,
            compacted_replays,
            parts.covered_through,
        ))
    }
}

fn count_entries(entries: &[LocalLogEntry]) -> Result<u64, LocalLogCompactionError> {
    u64::try_from(entries.len()).map_err(|_| LocalLogCompactionError::ReplayTombstoneCountOverflow)
}

fn checked_cumulative_tombstone_count(
    compacted: u64,
    active: u64,
    limits: LocalLogCompactionLimits,
) -> Result<u64, LocalLogCompactionError> {
    let Some(attempted) = compacted.checked_add(active) else {
        return Err(LocalLogCompactionError::ReplayTombstoneCountOverflow);
    };
    let maximum = limits.max_replay_tombstones();
    if attempted > maximum {
        return Err(LocalLogCompactionError::ReplayTombstoneLimit {
            compacted,
            active,
            attempted,
            maximum,
        });
    }
    Ok(attempted)
}

fn tombstones_from_entries(entries: Box<[LocalLogEntry]>) -> BTreeMap<ReplayId, LocalLogSequence> {
    let mut tombstones = BTreeMap::new();
    extend_tombstones(&mut tombstones, entries.into_vec());
    tombstones
}

fn extend_tombstones(
    tombstones: &mut BTreeMap<ReplayId, LocalLogSequence>,
    entries: Vec<LocalLogEntry>,
) {
    for entry in entries {
        let (replay_id, sequence) = entry.into_replay_tombstone();
        match tombstones.entry(replay_id) {
            Entry::Vacant(slot) => {
                slot.insert(sequence);
            }
            Entry::Occupied(_) => {
                unreachable!("preflight proved replay tombstone uniqueness")
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::{LocalLogCompactionError, checked_cumulative_tombstone_count};
    use crate::local_log::LocalLogCompactionLimits;

    #[test]
    fn cumulative_arithmetic_accepts_exact_u64_max_and_rejects_its_successor() {
        let maximum = LocalLogCompactionLimits::new(u64::MAX);
        assert_eq!(checked_cumulative_tombstone_count(u64::MAX, 0, maximum), Ok(u64::MAX));
        assert_eq!(
            checked_cumulative_tombstone_count(u64::MAX, 1, maximum),
            Err(LocalLogCompactionError::ReplayTombstoneCountOverflow)
        );
    }

    #[test]
    fn zero_policy_accepts_only_the_empty_cumulative_set() {
        let disabled = LocalLogCompactionLimits::new(0);
        assert_eq!(checked_cumulative_tombstone_count(0, 0, disabled), Ok(0));
        assert_eq!(
            checked_cumulative_tombstone_count(0, 1, disabled),
            Err(LocalLogCompactionError::ReplayTombstoneLimit {
                compacted: 0,
                active: 1,
                attempted: 1,
                maximum: 0,
            })
        );
    }
}
