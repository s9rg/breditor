use super::LocalLogStorageSelectedRootV3;
use crate::local_log::{LocalLogStorageRootResolutionRequestId, LocalLogStorageTransactionId};

/// Host assertion of the exact normalized selection read by a completed probe.
///
/// Core checks correlation and candidate equality, not event provenance or
/// host honesty. This is not a publication terminal claim or writer capability.
///
/// ```compile_fail
/// fn require_clone<T: Clone>() {}
/// require_clone::<breditor_core::codec::LocalLogStorageRootReadbackEvidenceV3>();
/// ```
///
/// ```compile_fail
/// fn legacy_selected(id: &breditor_core::local_log::LocalLogStorageRootResolutionRequestId,
///     selected: breditor_core::codec::LocalLogStorageSelectedRoot,
///     tx: breditor_core::local_log::LocalLogStorageTransactionId) {
///     let _ = breditor_core::codec::LocalLogStorageRootReadbackEvidenceV3::transaction_completed(id, selected, tx);
/// }
/// ```
#[derive(Debug)]
#[must_use = "evidence must be correlated with its exact retained probe"]
pub struct LocalLogStorageRootReadbackEvidenceV3 {
    pub(super) request_id: LocalLogStorageRootResolutionRequestId,
    pub(super) selected: LocalLogStorageSelectedRootV3,
    pub(super) head_index_transaction_id: LocalLogStorageTransactionId,
}

impl LocalLogStorageRootReadbackEvidenceV3 {
    /// Attests `complete` for the exact serialized fixed-scope read transaction.
    ///
    /// The host must normalize the full selected graph and receipt facts read
    /// in that same transaction and supply its committed-head unique-index
    /// return value. Complete all reads before attesting; individual request
    /// success, `commit()` return, abort, timeout, and cached selections do not
    /// satisfy this contract. Core cannot authenticate the host's transaction.
    pub fn transaction_completed(
        request_id: &LocalLogStorageRootResolutionRequestId,
        selected: LocalLogStorageSelectedRootV3,
        head_index_transaction_id: LocalLogStorageTransactionId,
    ) -> Self {
        Self { request_id: request_id.clone(), selected, head_index_transaction_id }
    }

    /// Returns the probe named by this host assertion.
    #[must_use]
    pub const fn request_id(&self) -> &LocalLogStorageRootResolutionRequestId {
        &self.request_id
    }
    /// Returns the normalized selection as reported by the host.
    pub const fn selected(&self) -> &LocalLogStorageSelectedRootV3 {
        &self.selected
    }
}
