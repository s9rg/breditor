use std::fmt;

use crate::local_log::LocalLogStorageAppendResolutionRequestId;

use super::LocalLogStorageAppendResolutionObservation;

/// Trusted host assertion for one terminal append-resolution observation.
///
/// Ordinary findings require the exact five-store `readonly` resolver
/// transaction to emit terminal `complete` after every read and full cursor
/// scan. That transaction has no durability option and performs no writes. Physical
/// database absence uses the narrower aborted non-creating versionless-open
/// boundary. Rust validates volatile correlation and retained facts but cannot
/// authenticate either host event.
///
/// This value is deliberately non-`Clone` and nonserializable. Its owned target
/// bytes are consumed exactly once by the core classifier and never emitted by
/// `Debug`.
#[must_use = "append-resolution evidence must be applied or explicitly retained"]
pub struct LocalLogStorageAppendResolutionEvidence {
    request_id: LocalLogStorageAppendResolutionRequestId,
    observation: LocalLogStorageAppendResolutionObservation,
}

impl LocalLogStorageAppendResolutionEvidence {
    /// Attests terminal completion of the exact correlated resolver transaction.
    pub fn transaction_completed(
        request_id: &LocalLogStorageAppendResolutionRequestId,
        observation: LocalLogStorageAppendResolutionObservation,
    ) -> Self {
        Self { request_id: request_id.clone(), observation }
    }

    /// Attests that a non-creating database-open probe found no database.
    ///
    /// This requires a versionless open, `oldVersion == 0`, synchronous upgrade
    /// abort, and terminal open-request `error`. It grants no database creation,
    /// deletion, migration, append, retry, or acknowledgement authority.
    pub fn database_open_absent(request_id: &LocalLogStorageAppendResolutionRequestId) -> Self {
        Self {
            request_id: request_id.clone(),
            observation: LocalLogStorageAppendResolutionObservation::database_physically_absent(),
        }
    }

    /// Returns the opaque request-issued resolver correlation.
    #[must_use]
    pub const fn request_id(&self) -> &LocalLogStorageAppendResolutionRequestId {
        &self.request_id
    }

    /// Returns the reported physical/profile finding.
    pub const fn observation(&self) -> &LocalLogStorageAppendResolutionObservation {
        &self.observation
    }

    pub(super) fn into_observation(self) -> LocalLogStorageAppendResolutionObservation {
        self.observation
    }
}

impl fmt::Debug for LocalLogStorageAppendResolutionEvidence {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("LocalLogStorageAppendResolutionEvidence")
            .field("request_id", &self.request_id)
            .field("observation", &self.observation)
            .finish_non_exhaustive()
    }
}
