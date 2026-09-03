use super::{
    LocalLogStorageAppendAttemptAborted, LocalLogStorageAppendHeadPresent,
    LocalLogStorageAppendNotAttempted, LocalLogStorageAppendTerminalAttestation,
    LocalLogStorageAppendTerminalAttestationKind, LocalLogStorageAppendTerminalFailure,
    LocalLogStorageAppendTerminalOutcome, LocalLogStorageAppendTransitionError,
    LocalLogStorageUncertainAppendAttempt,
    local_log_storage_issued_append_attempt::LocalLogStorageIssuedAppendAttempt,
    local_log_storage_retained_append_attempt::LocalLogStorageRetainedAppendAttempt,
};

impl LocalLogStorageUncertainAppendAttempt {
    /// Applies one matching host terminal attestation to this exact attempt.
    ///
    /// Transaction completion and abort are legal only after this state emitted
    /// its one request and must name that exact request allocation. A matching
    /// `NotAttempted` is legal before or after request egress when the host
    /// attests that the named invocation created no transaction.
    ///
    /// Matching completion moves the unchanged queue into
    /// [`LocalLogStorageAppendHeadPresent`]; it does not pop or acknowledge the
    /// head. Abort and not-attempted preserve the complete queue for exact
    /// resubmission. Timeout, cancellation, callback loss, and request-level
    /// events have no transition and leave this owner uncertain.
    ///
    /// # Errors
    ///
    /// Rejection preserves the complete unchanged owner and unapplied
    /// attestation. Precedence is attempt mismatch, request not issued, then
    /// request mismatch.
    pub fn observe_terminal_attestation(
        self,
        attestation: LocalLogStorageAppendTerminalAttestation,
    ) -> Result<LocalLogStorageAppendTerminalOutcome, LocalLogStorageAppendTerminalFailure<Self>>
    {
        if self.attempt_id != *attestation.attempt_id() {
            return Err(LocalLogStorageAppendTerminalFailure::new(
                self,
                attestation,
                LocalLogStorageAppendTransitionError::AttemptIdMismatch,
            ));
        }

        if attestation.kind() != LocalLogStorageAppendTerminalAttestationKind::NotAttempted {
            let Some(expected_request_id) = self.request_id.as_ref() else {
                return Err(LocalLogStorageAppendTerminalFailure::new(
                    self,
                    attestation,
                    LocalLogStorageAppendTransitionError::RequestNotIssued,
                ));
            };
            if attestation.request_id() != Some(expected_request_id) {
                return Err(LocalLogStorageAppendTerminalFailure::new(
                    self,
                    attestation,
                    LocalLogStorageAppendTransitionError::RequestIdMismatch,
                ));
            }
        }

        let kind = attestation.kind();
        let Self { queue, attempt_id, request_id } = self;
        match (kind, request_id) {
            (
                LocalLogStorageAppendTerminalAttestationKind::TransactionCompleted,
                Some(request_id),
            ) => Ok(LocalLogStorageAppendTerminalOutcome::HeadPresent(
                LocalLogStorageAppendHeadPresent::new(LocalLogStorageIssuedAppendAttempt::new(
                    queue, request_id,
                )),
            )),
            (
                LocalLogStorageAppendTerminalAttestationKind::TransactionAborted,
                Some(request_id),
            ) => Ok(LocalLogStorageAppendTerminalOutcome::AttemptAborted(
                LocalLogStorageAppendAttemptAborted::new(LocalLogStorageIssuedAppendAttempt::new(
                    queue, request_id,
                )),
            )),
            (LocalLogStorageAppendTerminalAttestationKind::NotAttempted, Some(request_id)) => {
                Ok(LocalLogStorageAppendTerminalOutcome::NotAttempted(
                    LocalLogStorageAppendNotAttempted::new(
                        LocalLogStorageRetainedAppendAttempt::issued(queue, request_id),
                    ),
                ))
            }
            (LocalLogStorageAppendTerminalAttestationKind::NotAttempted, None) => {
                Ok(LocalLogStorageAppendTerminalOutcome::NotAttempted(
                    LocalLogStorageAppendNotAttempted::new(
                        LocalLogStorageRetainedAppendAttempt::before_request(queue, attempt_id),
                    ),
                ))
            }
            (_, request_id) => Err(LocalLogStorageAppendTerminalFailure::new(
                LocalLogStorageUncertainAppendAttempt { queue, attempt_id, request_id },
                attestation,
                LocalLogStorageAppendTransitionError::RequestNotIssued,
            )),
        }
    }
}
