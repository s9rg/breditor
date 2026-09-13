use super::{
    LocalLogStorageAttemptTerminalAttestationKind as Kind,
    LocalLogStorageAttemptTransitionError as Error, LocalLogStorageRootPublicationAttemptV3,
    LocalLogStorageRootPublicationAttestationV3, LocalLogStorageRootPublicationTerminalFailureV3,
    LocalLogStorageRootPublicationTerminalV3,
};

impl LocalLogStorageRootPublicationAttemptV3 {
    /// Consumes uncertainty only for a matching, explicitly terminal host claim.
    ///
    /// A rejection returns the unchanged owner and unapplied claim. Completion
    /// and rollback require the token issued for this exact request, while a
    /// not-attempted claim can close the invocation before or after issuance.
    ///
    /// # Errors
    ///
    /// Returns both unchanged inputs on attempt mismatch, missing request
    /// issuance, or request mismatch, in that validation order.
    ///
    /// ```compile_fail
    /// fn legacy_claim(
    ///     attempt: breditor_core::codec::LocalLogStorageRootPublicationAttemptV3,
    ///     claim: breditor_core::codec::LocalLogStorageAttemptTerminalAttestation,
    /// ) {
    ///     let _ = attempt.observe_terminal_attestation(claim);
    /// }
    /// ```
    pub fn observe_terminal_attestation(
        self,
        attestation: LocalLogStorageRootPublicationAttestationV3,
    ) -> Result<
        LocalLogStorageRootPublicationTerminalV3,
        LocalLogStorageRootPublicationTerminalFailureV3,
    > {
        let error = if attestation.attempt_id() != &self.attempt_id {
            Some(Error::AttemptIdMismatch)
        } else if attestation.kind() == Kind::NotAttempted {
            None
        } else {
            match self.request_id.as_ref() {
                None => Some(Error::RequestNotIssued),
                Some(id) if attestation.request_id() != Some(id) => Some(Error::RequestIdMismatch),
                Some(_) => None,
            }
        };
        if let Some(error) = error {
            return Err(LocalLogStorageRootPublicationTerminalFailureV3 {
                retained: Box::new((self, attestation)),
                error,
            });
        }
        Ok(LocalLogStorageRootPublicationTerminalV3 { kind: attestation.kind(), owner: self })
    }
}
