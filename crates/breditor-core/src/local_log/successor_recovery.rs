use super::{
    ContinuedLocalLog, LocalLogCheckpointAnchor, LocalLogEntry, LocalLogRecoveryCounter,
    LocalLogRecoveryError, LocalLogRecoveryLimits,
};

impl LocalLogCheckpointAnchor {
    /// Atomically verifies and applies the complete bound-successor batch.
    ///
    /// Every entry must name this anchor's session and successor generation.
    /// Reuse of a checkpoint-represented replay ID fails closed. For a trusted
    /// complete checkpoint this prevents a second application, but the anchor
    /// has no old full event proof with which to establish provenance or
    /// distinguish an exact retry from conflicting reuse. Exact duplicates
    /// first seen within `observations` are skipped. First-seen successor events
    /// continue at the session-global checkpoint frontier and preserve exact
    /// checkpointed history behavior.
    ///
    /// The complete vector's observation count is admitted before any entry is
    /// inspected, preserving the batch boundary's historical error precedence.
    /// After that preflight, this method delegates each entry to the same
    /// one-observation engine exposed by [`ContinuedLocalLog::try_observe`]. On
    /// any late error, the returned incremental owner and rejected entry are
    /// deliberately dropped so no privately applied batch prefix is published.
    /// Use [`Self::begin_successor`] when recoverable one-entry admission is
    /// required instead.
    ///
    /// `limits` become the fixed policy for the complete active generation.
    /// The supplied vector is its initial delivery segment; later
    /// [`ContinuedLocalLog::try_observe`] calls continue charging the same
    /// cumulative counters. Admission neither reserves nor charges the
    /// inherited compaction ceiling, so successful recovery may produce a log
    /// whose represented replay count exceeds that ceiling. Ordinary
    /// compaction then returns the unchanged log owner; the host must explicitly
    /// authorize a sufficient replacement ceiling before dropping those active
    /// proofs.
    ///
    /// # Errors
    ///
    /// Returns [`LocalLogRecoveryError`] for successor resource, membership,
    /// compacted-replay, active-replay, ordering, or application failures.
    pub fn recover_successor(
        self,
        observations: Vec<LocalLogEntry>,
        limits: LocalLogRecoveryLimits,
    ) -> Result<ContinuedLocalLog, LocalLogRecoveryError> {
        let observation_count = validate_observation_count(&observations, limits)?;
        let retained_capacity = match usize::try_from(limits.max_unique_events()) {
            Ok(limit) => observations.len().min(limit),
            Err(_) => observations.len(),
        };
        let mut continued = self.begin_successor_with_capacity(limits, retained_capacity);
        for entry in observations {
            match continued.try_observe(entry) {
                Ok((next, _)) => continued = next,
                Err(failure) => return Err(failure.into_error()),
            }
        }
        debug_assert_eq!(continued.observation_count(), observation_count);
        Ok(continued)
    }
}

fn validate_observation_count(
    observations: &[LocalLogEntry],
    limits: LocalLogRecoveryLimits,
) -> Result<u64, LocalLogRecoveryError> {
    let observation_count =
        u64::try_from(observations.len()).map_err(|_| LocalLogRecoveryError::CounterOverflow {
            delivery_index: None,
            counter: LocalLogRecoveryCounter::Observations,
        })?;
    if observation_count > limits.max_observations() {
        return Err(LocalLogRecoveryError::ObservationLimit {
            actual: observation_count,
            maximum: limits.max_observations(),
        });
    }
    Ok(observation_count)
}
