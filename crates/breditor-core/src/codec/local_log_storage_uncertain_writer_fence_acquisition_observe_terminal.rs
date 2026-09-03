use super::{
    LocalLogStorageMutationToken, LocalLogStorageUncertainWriterFenceAcquisition,
    LocalLogStorageWriterFenceAcquisitionAborted,
    LocalLogStorageWriterFenceAcquisitionNotAttempted,
    LocalLogStorageWriterFenceAcquisitionTerminalAttestation,
    LocalLogStorageWriterFenceAcquisitionTerminalAttestationKind,
    LocalLogStorageWriterFenceAcquisitionTerminalFailure,
    LocalLogStorageWriterFenceAcquisitionTerminalOutcome,
    LocalLogStorageWriterFenceAcquisitionTransitionError,
    local_log_storage_issued_writer_fence_acquisition::LocalLogStorageIssuedWriterFenceAcquisition,
    local_log_storage_retained_writer_fence_acquisition::LocalLogStorageRetainedWriterFenceAcquisition,
};

impl LocalLogStorageUncertainWriterFenceAcquisition {
    /// Applies one matching host terminal attestation to this exact attempt.
    ///
    /// Complete and abort are legal only after this state emitted its one
    /// request, and must name that request allocation exactly. `NotAttempted`
    /// is legal before or after request egress when the host attests that this
    /// invocation created no acquisition transaction.
    ///
    /// A matching `AcquisitionCompleted` attestation creates a revocable token
    /// for the post-acquisition binding. This is deliberately trust-bearing:
    /// the core cannot authenticate the browser event or inspect the physical
    /// transaction. The token may already be stale when returned.
    ///
    /// # Errors
    ///
    /// Rejection preserves the complete unchanged owner and unapplied
    /// attestation. Precedence is attempt mismatch, request not issued, then
    /// request mismatch.
    pub fn observe_terminal_attestation(
        self,
        attestation: LocalLogStorageWriterFenceAcquisitionTerminalAttestation,
    ) -> Result<
        LocalLogStorageWriterFenceAcquisitionTerminalOutcome,
        LocalLogStorageWriterFenceAcquisitionTerminalFailure<Self>,
    > {
        if self.attempt_id != *attestation.attempt_id() {
            return Err(LocalLogStorageWriterFenceAcquisitionTerminalFailure::new(
                self,
                attestation,
                LocalLogStorageWriterFenceAcquisitionTransitionError::AttemptIdMismatch,
            ));
        }

        if attestation.kind()
            != LocalLogStorageWriterFenceAcquisitionTerminalAttestationKind::NotAttempted
        {
            let Some(expected_request_id) = self.request_id.as_ref() else {
                return Err(LocalLogStorageWriterFenceAcquisitionTerminalFailure::new(
                    self,
                    attestation,
                    LocalLogStorageWriterFenceAcquisitionTransitionError::RequestNotIssued,
                ));
            };
            if attestation.request_id() != Some(expected_request_id) {
                return Err(LocalLogStorageWriterFenceAcquisitionTerminalFailure::new(
                    self,
                    attestation,
                    LocalLogStorageWriterFenceAcquisitionTransitionError::RequestIdMismatch,
                ));
            }
        }

        let kind = attestation.kind();
        let Self { plan, attempt_id, request_id } = self;
        match (kind, request_id) {
            (
                LocalLogStorageWriterFenceAcquisitionTerminalAttestationKind::AcquisitionCompleted,
                Some(request_id),
            ) => Ok(LocalLogStorageWriterFenceAcquisitionTerminalOutcome::Acquired(
                LocalLogStorageMutationToken::from_acquired_plan(plan, request_id),
            )),
            (
                LocalLogStorageWriterFenceAcquisitionTerminalAttestationKind::TransactionAborted,
                Some(request_id),
            ) => Ok(LocalLogStorageWriterFenceAcquisitionTerminalOutcome::TransactionAborted(
                LocalLogStorageWriterFenceAcquisitionAborted::new(
                    LocalLogStorageIssuedWriterFenceAcquisition::new(plan, request_id),
                ),
            )),
            (
                LocalLogStorageWriterFenceAcquisitionTerminalAttestationKind::NotAttempted,
                Some(request_id),
            ) => Ok(LocalLogStorageWriterFenceAcquisitionTerminalOutcome::NotAttempted(
                LocalLogStorageWriterFenceAcquisitionNotAttempted::new(
                    LocalLogStorageRetainedWriterFenceAcquisition::issued(plan, request_id),
                ),
            )),
            (LocalLogStorageWriterFenceAcquisitionTerminalAttestationKind::NotAttempted, None) => {
                Ok(LocalLogStorageWriterFenceAcquisitionTerminalOutcome::NotAttempted(
                    LocalLogStorageWriterFenceAcquisitionNotAttempted::new(
                        LocalLogStorageRetainedWriterFenceAcquisition::before_request(
                            plan, attempt_id,
                        ),
                    ),
                ))
            }
            (_, request_id) => Err(LocalLogStorageWriterFenceAcquisitionTerminalFailure::new(
                LocalLogStorageUncertainWriterFenceAcquisition { plan, attempt_id, request_id },
                attestation,
                LocalLogStorageWriterFenceAcquisitionTransitionError::RequestNotIssued,
            )),
        }
    }
}
