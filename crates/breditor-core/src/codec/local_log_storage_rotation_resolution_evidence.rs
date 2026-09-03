use std::fmt;

use crate::local_log::LocalLogStorageRotationResolutionRequestId;

use super::LocalLogStorageRotationResolutionObservation;

/// Trusted host assertion for one terminal rotation-resolution observation.
///
/// Ordinary findings require the exact fixed-scope serialized transaction to
/// emit terminal `complete` after every read and scan. Physical database
/// absence uses the narrower aborted versionless-open boundary. Rust validates
/// volatile correlation but cannot authenticate the host event itself.
#[must_use = "rotation-resolution evidence must be applied or explicitly retained"]
pub struct LocalLogStorageRotationResolutionEvidence {
    request_id: LocalLogStorageRotationResolutionRequestId,
    observation: LocalLogStorageRotationResolutionObservation,
}

impl LocalLogStorageRotationResolutionEvidence {
    /// Attests terminal completion of the exact correlated resolver transaction.
    pub fn transaction_completed(
        request_id: &LocalLogStorageRotationResolutionRequestId,
        observation: LocalLogStorageRotationResolutionObservation,
    ) -> Self {
        Self { request_id: request_id.clone(), observation }
    }

    /// Attests that a non-creating database-open probe found no database.
    ///
    /// This requires `oldVersion == 0`, synchronous upgrade abort, and terminal
    /// open-request `error`. It grants no creation, deletion, migration, or
    /// retry authority.
    pub fn database_open_absent(request_id: &LocalLogStorageRotationResolutionRequestId) -> Self {
        Self {
            request_id: request_id.clone(),
            observation: LocalLogStorageRotationResolutionObservation::database_physically_absent(),
        }
    }

    /// Returns the opaque request-issued resolver correlation.
    #[must_use]
    pub const fn request_id(&self) -> &LocalLogStorageRotationResolutionRequestId {
        &self.request_id
    }

    /// Returns the reported physical/profile finding.
    pub const fn observation(&self) -> &LocalLogStorageRotationResolutionObservation {
        &self.observation
    }

    pub(super) fn into_observation(self) -> LocalLogStorageRotationResolutionObservation {
        self.observation
    }
}

impl fmt::Debug for LocalLogStorageRotationResolutionEvidence {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("LocalLogStorageRotationResolutionEvidence")
            .field("request_id", &self.request_id)
            .field("observation", &self.observation)
            .finish_non_exhaustive()
    }
}
