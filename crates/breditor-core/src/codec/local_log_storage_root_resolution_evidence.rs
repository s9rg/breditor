use std::fmt;

use crate::local_log::LocalLogStorageRootResolutionRequestId;

use super::LocalLogStorageRootResolutionObservation;

/// Trusted host assertion for one terminal root-resolution observation.
///
/// Ordinary findings require the exact fixed-scope serialized transaction
/// associated with `request_id` to emit terminal `complete` after every read
/// and cursor scan. Physical database absence instead requires the narrowly
/// defined aborted versionless-open boundary in [`Self::database_open_absent`].
/// Individual request success, `commit()` return, callback loss, cancellation,
/// or another operation's terminal event is not this evidence. Rust validates
/// opaque process-local correlation but cannot inspect or authenticate the
/// browser event itself.
///
/// The request identity cannot be minted before request egress through the safe
/// public API, and this evidence deliberately has no serialization contract.
#[must_use = "root-resolution evidence must be applied or explicitly retained"]
pub struct LocalLogStorageRootResolutionEvidence {
    request_id: LocalLogStorageRootResolutionRequestId,
    observation: LocalLogStorageRootResolutionObservation,
}

impl LocalLogStorageRootResolutionEvidence {
    /// Attests terminal completion of the exact correlated resolver transaction.
    pub fn transaction_completed(
        request_id: &LocalLogStorageRootResolutionRequestId,
        observation: LocalLogStorageRootResolutionObservation,
    ) -> Self {
        Self { request_id: request_id.clone(), observation }
    }

    /// Attests that a non-creating database-open probe found no database.
    ///
    /// The host may construct this only after the exact request's versionless
    /// `IndexedDB` open emitted `upgradeneeded` with `oldVersion == 0`, the
    /// handler synchronously aborted that upgrade transaction, and the open
    /// request then emitted terminal `error`. This separate boundary is needed
    /// because an absent database cannot create the fixed-scope read transaction
    /// required by [`Self::transaction_completed`]. It grants no authority to
    /// create, migrate, delete, or retry storage.
    pub fn database_open_absent(request_id: &LocalLogStorageRootResolutionRequestId) -> Self {
        Self {
            request_id: request_id.clone(),
            observation: LocalLogStorageRootResolutionObservation::database_physically_absent(),
        }
    }

    /// Returns the opaque request-issued resolver correlation.
    #[must_use]
    pub const fn request_id(&self) -> &LocalLogStorageRootResolutionRequestId {
        &self.request_id
    }

    /// Returns the physical/profile finding reported by the terminal observation.
    pub const fn observation(&self) -> &LocalLogStorageRootResolutionObservation {
        &self.observation
    }

    pub(super) fn into_observation(self) -> LocalLogStorageRootResolutionObservation {
        self.observation
    }
}

impl fmt::Debug for LocalLogStorageRootResolutionEvidence {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("LocalLogStorageRootResolutionEvidence")
            .field("request_id", &self.request_id)
            .field("observation", &self.observation)
            .finish_non_exhaustive()
    }
}
