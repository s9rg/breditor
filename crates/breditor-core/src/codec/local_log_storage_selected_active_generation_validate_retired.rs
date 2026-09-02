use crate::local_log::LocalLogStorageHeadId;

use super::{
    LocalLogStorageRetiredGenerationMismatchField, LocalLogStorageRetiredGenerationObservation,
    LocalLogStorageRetiredGenerationObservationError,
    LocalLogStorageSelectedActiveGenerationBinding,
    LocalLogStorageSelectedCheckpointGenerationBinding,
    LocalLogStorageSelectedCheckpointGenerationState,
};

impl LocalLogStorageSelectedActiveGenerationBinding {
    /// Validates a later retired/reclaimed checkpoint against this active state.
    ///
    /// Ordinary rotation transforms the formerly active generation atomically
    /// into a checkpoint tombstone. Every active fact must remain exact, and
    /// `retired_by_head_id` must name the superseding head. Cleanup may then
    /// advance only the record state from retired to reclaimed.
    ///
    /// This directional value check neither observes storage nor proves atomic
    /// publication. A resolver must separately validate the transaction graph,
    /// exact selection JSON, candidate record, known older tombstones, and its
    /// completed serialized transaction.
    ///
    /// # Errors
    ///
    /// Returns a payload-free error for a checkpoint-only state or the first
    /// changed immutable fact. Comparison order is state, head advancement,
    /// log, session, frame, activation fence, activating head, then retiring
    /// head.
    pub fn validate_retired_checkpoint_observation(
        &self,
        observed: &LocalLogStorageSelectedCheckpointGenerationBinding,
        retired_by_head_id: &LocalLogStorageHeadId,
    ) -> Result<
        LocalLogStorageRetiredGenerationObservation,
        LocalLogStorageRetiredGenerationObservationError,
    > {
        let state = match observed.state() {
            LocalLogStorageSelectedCheckpointGenerationState::Retired => {
                LocalLogStorageRetiredGenerationObservation::Retired
            }
            LocalLogStorageSelectedCheckpointGenerationState::Reclaimed => {
                LocalLogStorageRetiredGenerationObservation::Reclaimed
            }
            observed @ LocalLogStorageSelectedCheckpointGenerationState::CheckpointOnly => {
                return Err(LocalLogStorageRetiredGenerationObservationError::InvalidState {
                    observed,
                });
            }
        };

        if retired_by_head_id == self.activated_by_head_id() {
            return Err(LocalLogStorageRetiredGenerationObservationError::HeadNotAdvanced);
        }

        let mismatch = if self.log_id() != observed.log_id() {
            Some(LocalLogStorageRetiredGenerationMismatchField::LogId)
        } else if self.session_id() != observed.session_id() {
            Some(LocalLogStorageRetiredGenerationMismatchField::SessionId)
        } else if Some(self.frame()) != observed.frame() {
            Some(LocalLogStorageRetiredGenerationMismatchField::Frame)
        } else if Some(self.activated_fence_id()) != observed.activated_fence_id() {
            Some(LocalLogStorageRetiredGenerationMismatchField::ActivatedFenceId)
        } else if Some(self.activated_by_head_id()) != observed.activated_by_head_id() {
            Some(LocalLogStorageRetiredGenerationMismatchField::ActivatedByHeadId)
        } else if Some(retired_by_head_id) != observed.retired_by_head_id() {
            Some(LocalLogStorageRetiredGenerationMismatchField::RetiredByHeadId)
        } else {
            None
        };

        match mismatch {
            Some(field) => {
                Err(LocalLogStorageRetiredGenerationObservationError::FieldMismatch { field })
            }
            None => Ok(state),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::{
        LocalLogStorageRetiredGenerationMismatchField, LocalLogStorageRetiredGenerationObservation,
        LocalLogStorageRetiredGenerationObservationError,
        LocalLogStorageSelectedActiveGenerationBinding,
        LocalLogStorageSelectedCheckpointGenerationBinding,
        LocalLogStorageSelectedCheckpointGenerationState,
    };
    use crate::{
        codec::{
            LocalLogFrameLimits, LocalLogStorageGenerationFrameV1,
            LocalLogStorageRetiredGenerationObservationErrorCode,
        },
        local_log::{LocalLogId, LocalLogStorageFenceId, LocalLogStorageHeadId, LocalSessionId},
    };

    type TestResult<T = ()> = Result<T, Box<dyn std::error::Error>>;

    fn frame(max_payload_bytes: u64) -> LocalLogStorageGenerationFrameV1 {
        LocalLogStorageGenerationFrameV1::new(LocalLogFrameLimits::new(max_payload_bytes))
    }

    fn active() -> TestResult<LocalLogStorageSelectedActiveGenerationBinding> {
        Ok(LocalLogStorageSelectedActiveGenerationBinding::new(
            LocalLogId::try_new("log:active")?,
            LocalSessionId::try_new("session:retirement-tests")?,
            frame(8_192),
            LocalLogStorageFenceId::try_new("fence:active")?,
            LocalLogStorageHeadId::try_new("head:active")?,
        ))
    }

    #[allow(clippy::too_many_arguments)]
    fn checkpoint(
        state: LocalLogStorageSelectedCheckpointGenerationState,
        log_id: &str,
        session_id: &str,
        generation_frame: LocalLogStorageGenerationFrameV1,
        activated_fence_id: &str,
        activated_by_head_id: &str,
        retired_by_head_id: &str,
    ) -> TestResult<LocalLogStorageSelectedCheckpointGenerationBinding> {
        let args = (
            LocalLogId::try_new(log_id)?,
            LocalSessionId::try_new(session_id)?,
            generation_frame,
            LocalLogStorageFenceId::try_new(activated_fence_id)?,
            LocalLogStorageHeadId::try_new(activated_by_head_id)?,
            LocalLogStorageHeadId::try_new(retired_by_head_id)?,
        );
        Ok(match state {
            LocalLogStorageSelectedCheckpointGenerationState::Retired => {
                LocalLogStorageSelectedCheckpointGenerationBinding::retired(
                    args.0, args.1, args.2, args.3, args.4, args.5,
                )
            }
            LocalLogStorageSelectedCheckpointGenerationState::Reclaimed => {
                LocalLogStorageSelectedCheckpointGenerationBinding::reclaimed(
                    args.0, args.1, args.2, args.3, args.4, args.5,
                )
            }
            LocalLogStorageSelectedCheckpointGenerationState::CheckpointOnly => {
                return Err("use the checkpoint-only constructor directly".into());
            }
        })
    }

    fn exact_checkpoint(
        state: LocalLogStorageSelectedCheckpointGenerationState,
    ) -> TestResult<LocalLogStorageSelectedCheckpointGenerationBinding> {
        checkpoint(
            state,
            "log:active",
            "session:retirement-tests",
            frame(8_192),
            "fence:active",
            "head:active",
            "head:superseding",
        )
    }

    fn retiring_head() -> TestResult<LocalLogStorageHeadId> {
        Ok(LocalLogStorageHeadId::try_new("head:superseding")?)
    }

    #[test]
    fn exact_retired_and_reclaimed_tombstones_validate() -> TestResult {
        let active = active()?;
        let retiring_head = retiring_head()?;

        for (state, expected) in [
            (
                LocalLogStorageSelectedCheckpointGenerationState::Retired,
                LocalLogStorageRetiredGenerationObservation::Retired,
            ),
            (
                LocalLogStorageSelectedCheckpointGenerationState::Reclaimed,
                LocalLogStorageRetiredGenerationObservation::Reclaimed,
            ),
        ] {
            assert_eq!(
                active.validate_retired_checkpoint_observation(
                    &exact_checkpoint(state)?,
                    &retiring_head,
                )?,
                expected
            );
        }
        Ok(())
    }

    #[test]
    fn checkpoint_only_is_rejected_before_unrelated_fact_mismatches() -> TestResult {
        let observed = LocalLogStorageSelectedCheckpointGenerationBinding::checkpoint_only(
            LocalLogId::try_new("log:other")?,
            LocalSessionId::try_new("session:other")?,
            LocalLogStorageHeadId::try_new("head:other")?,
        );

        assert_eq!(
            active()?.validate_retired_checkpoint_observation(&observed, &retiring_head()?),
            Err(LocalLogStorageRetiredGenerationObservationError::InvalidState {
                observed: LocalLogStorageSelectedCheckpointGenerationState::CheckpointOnly,
            })
        );
        Ok(())
    }

    #[test]
    fn retiring_head_must_advance_for_retired_and_reclaimed_records() -> TestResult {
        let active = active()?;
        let same_head = LocalLogStorageHeadId::try_new("head:active")?;

        for state in [
            LocalLogStorageSelectedCheckpointGenerationState::Retired,
            LocalLogStorageSelectedCheckpointGenerationState::Reclaimed,
        ] {
            assert_eq!(
                active.validate_retired_checkpoint_observation(
                    &exact_checkpoint(state)?,
                    &same_head,
                ),
                Err(LocalLogStorageRetiredGenerationObservationError::HeadNotAdvanced)
            );
        }
        Ok(())
    }

    #[test]
    fn immutable_retirement_facts_fail_in_deterministic_order() -> TestResult {
        let active = active()?;
        let retiring_head = retiring_head()?;

        let cases = [
            (
                checkpoint(
                    LocalLogStorageSelectedCheckpointGenerationState::Retired,
                    "log:other",
                    "session:other",
                    frame(4_096),
                    "fence:other",
                    "head:other",
                    "head:other",
                )?,
                LocalLogStorageRetiredGenerationMismatchField::LogId,
            ),
            (
                checkpoint(
                    LocalLogStorageSelectedCheckpointGenerationState::Retired,
                    "log:active",
                    "session:other",
                    frame(4_096),
                    "fence:other",
                    "head:other",
                    "head:other",
                )?,
                LocalLogStorageRetiredGenerationMismatchField::SessionId,
            ),
            (
                checkpoint(
                    LocalLogStorageSelectedCheckpointGenerationState::Retired,
                    "log:active",
                    "session:retirement-tests",
                    frame(4_096),
                    "fence:other",
                    "head:other",
                    "head:other",
                )?,
                LocalLogStorageRetiredGenerationMismatchField::Frame,
            ),
            (
                checkpoint(
                    LocalLogStorageSelectedCheckpointGenerationState::Retired,
                    "log:active",
                    "session:retirement-tests",
                    frame(8_192),
                    "fence:other",
                    "head:other",
                    "head:other",
                )?,
                LocalLogStorageRetiredGenerationMismatchField::ActivatedFenceId,
            ),
            (
                checkpoint(
                    LocalLogStorageSelectedCheckpointGenerationState::Retired,
                    "log:active",
                    "session:retirement-tests",
                    frame(8_192),
                    "fence:active",
                    "head:other",
                    "head:other",
                )?,
                LocalLogStorageRetiredGenerationMismatchField::ActivatedByHeadId,
            ),
            (
                checkpoint(
                    LocalLogStorageSelectedCheckpointGenerationState::Retired,
                    "log:active",
                    "session:retirement-tests",
                    frame(8_192),
                    "fence:active",
                    "head:active",
                    "head:other",
                )?,
                LocalLogStorageRetiredGenerationMismatchField::RetiredByHeadId,
            ),
        ];

        for (observed, field) in cases {
            assert_eq!(
                active.validate_retired_checkpoint_observation(&observed, &retiring_head),
                Err(LocalLogStorageRetiredGenerationObservationError::FieldMismatch { field })
            );
        }
        Ok(())
    }

    #[test]
    fn outcome_names_errors_and_fields_are_stable_and_payload_free() {
        assert_eq!(LocalLogStorageRetiredGenerationObservation::Retired.as_str(), "retired");
        assert_eq!(LocalLogStorageRetiredGenerationObservation::Reclaimed.as_str(), "reclaimed");
        assert_eq!(
            LocalLogStorageRetiredGenerationObservationErrorCode::InvalidState.as_str(),
            "local_log_storage_retired_generation_observation.invalid_state"
        );
        assert_eq!(
            LocalLogStorageRetiredGenerationObservationErrorCode::HeadNotAdvanced.as_str(),
            "local_log_storage_retired_generation_observation.head_not_advanced"
        );
        assert_eq!(
            LocalLogStorageRetiredGenerationObservationErrorCode::FieldMismatch.as_str(),
            "local_log_storage_retired_generation_observation.field_mismatch"
        );

        for (field, expected_name) in [
            (LocalLogStorageRetiredGenerationMismatchField::LogId, "logId"),
            (LocalLogStorageRetiredGenerationMismatchField::SessionId, "sessionId"),
            (LocalLogStorageRetiredGenerationMismatchField::Frame, "frame"),
            (LocalLogStorageRetiredGenerationMismatchField::ActivatedFenceId, "activatedFenceId"),
            (LocalLogStorageRetiredGenerationMismatchField::ActivatedByHeadId, "activatedByHeadId"),
            (LocalLogStorageRetiredGenerationMismatchField::RetiredByHeadId, "retiredByHeadId"),
        ] {
            let error = LocalLogStorageRetiredGenerationObservationError::FieldMismatch { field };
            assert_eq!(
                error.code(),
                LocalLogStorageRetiredGenerationObservationErrorCode::FieldMismatch
            );
            assert!(!format!("{error:?} {error}").contains("PAYLOADSENTINEL"));
            assert_eq!(field.as_str(), expected_name);
        }

        let head_error = LocalLogStorageRetiredGenerationObservationError::HeadNotAdvanced;
        assert_eq!(
            head_error.code(),
            LocalLogStorageRetiredGenerationObservationErrorCode::HeadNotAdvanced
        );
        assert!(!format!("{head_error:?} {head_error}").contains("PAYLOADSENTINEL"));
    }
}
