use super::{
    LocalLogStorageAttemptAborted, LocalLogStorageAttemptTerminalAttestation,
    LocalLogStorageAttemptTerminalAttestationKind, LocalLogStorageAttemptTerminalFailure,
    LocalLogStorageAttemptTerminalOutcome, LocalLogStorageAttemptTransitionError,
    LocalLogStorageHostAttestedCommitted, LocalLogStorageNotAttempted,
    LocalLogStorageUncertainAttempt,
    local_log_storage_issued_attempt::LocalLogStorageIssuedAttempt,
    local_log_storage_retained_attempt::LocalLogStorageRetainedAttempt,
};

impl LocalLogStorageUncertainAttempt {
    /// Applies one matching host terminal attestation to this exact attempt.
    ///
    /// A publication-complete or transaction-abort attestation is legal only
    /// after this state yielded its one adapter request. `NotAttempted` is also
    /// legal before request egress. Positive publication completion becomes
    /// historical commit evidence; abort and not-attempted remain unresolved
    /// at plan level and preserve the exact plan and attempt identity.
    ///
    /// Request success, `commit()` return, error events without a matching
    /// terminal event, timeout, cancellation, and callback loss have no action
    /// here and leave this state `Uncertain`.
    ///
    /// # Errors
    ///
    /// A stale or cross-plan attempt ID, or a transaction terminal event before
    /// request egress, returns the complete unchanged owner and unapplied
    /// attestation inside [`LocalLogStorageAttemptTerminalFailure`].
    pub fn observe_terminal_attestation(
        self,
        attestation: LocalLogStorageAttemptTerminalAttestation,
    ) -> Result<LocalLogStorageAttemptTerminalOutcome, LocalLogStorageAttemptTerminalFailure<Self>>
    {
        if self.attempt_id != *attestation.attempt_id() {
            return Err(LocalLogStorageAttemptTerminalFailure::new(
                self,
                attestation,
                LocalLogStorageAttemptTransitionError::AttemptIdMismatch,
            ));
        }
        if attestation.kind() != LocalLogStorageAttemptTerminalAttestationKind::NotAttempted {
            let Some(expected_request_id) = self.request_id.as_ref() else {
                return Err(LocalLogStorageAttemptTerminalFailure::new(
                    self,
                    attestation,
                    LocalLogStorageAttemptTransitionError::RequestNotIssued,
                ));
            };
            if attestation.request_id() != Some(expected_request_id) {
                return Err(LocalLogStorageAttemptTerminalFailure::new(
                    self,
                    attestation,
                    LocalLogStorageAttemptTransitionError::RequestIdMismatch,
                ));
            }
        }

        let kind = attestation.kind();
        let Self { plan, attempt_id, request_id } = self;
        match (kind, request_id) {
            (
                LocalLogStorageAttemptTerminalAttestationKind::PublicationCompleted,
                Some(request_id),
            ) => Ok(LocalLogStorageAttemptTerminalOutcome::HostAttestedCommitted(
                LocalLogStorageHostAttestedCommitted::new(LocalLogStorageIssuedAttempt::new(
                    plan, request_id,
                )),
            )),
            (
                LocalLogStorageAttemptTerminalAttestationKind::TransactionAborted,
                Some(request_id),
            ) => Ok(LocalLogStorageAttemptTerminalOutcome::AttemptAborted(
                LocalLogStorageAttemptAborted::new(LocalLogStorageIssuedAttempt::new(
                    plan, request_id,
                )),
            )),
            (LocalLogStorageAttemptTerminalAttestationKind::NotAttempted, Some(request_id)) => {
                Ok(LocalLogStorageAttemptTerminalOutcome::NotAttempted(
                    LocalLogStorageNotAttempted::new(LocalLogStorageRetainedAttempt::issued(
                        plan, request_id,
                    )),
                ))
            }
            (LocalLogStorageAttemptTerminalAttestationKind::NotAttempted, None) => {
                Ok(LocalLogStorageAttemptTerminalOutcome::NotAttempted(
                    LocalLogStorageNotAttempted::new(
                        LocalLogStorageRetainedAttempt::before_request(plan, attempt_id),
                    ),
                ))
            }
            (_, request_id) => Err(LocalLogStorageAttemptTerminalFailure::new(
                LocalLogStorageUncertainAttempt { plan, attempt_id, request_id },
                attestation,
                LocalLogStorageAttemptTransitionError::RequestNotIssued,
            )),
        }
    }
}
