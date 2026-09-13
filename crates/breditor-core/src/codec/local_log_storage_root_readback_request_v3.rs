use super::{
    LocalLogStorageAttemptTransitionError, LocalLogStorageRootReadbackV3,
    LocalLogStorageSelectedBindingV3,
};
use crate::local_log::LocalLogStorageRootResolutionRequestId;
use std::fmt;

/// Borrowed exact candidate for one observational, never publication, probe.
///
/// The host must read the full selected graph, profile/scope incarnations and
/// committed-head index in one serialized fixed-scope transaction. This view
/// is not a write request. Copies do not establish independent correlated probes.
///
/// ```compile_fail
/// fn cannot_consume(mut owner: breditor_core::codec::LocalLogStorageRootReadbackV3) {
///     let request = owner.adapter_request().unwrap();
///     drop(owner);
///     let _ = request.candidate_json();
/// }
/// ```
pub struct LocalLogStorageRootReadbackRequestV3<'a> {
    binding: &'a LocalLogStorageSelectedBindingV3,
    candidate_json: &'a str,
    request_id: &'a LocalLogStorageRootResolutionRequestId,
}

impl LocalLogStorageRootReadbackRequestV3<'_> {
    /// Returns the exact canonical comparison bytes, not a mutation instruction.
    #[must_use]
    pub const fn candidate_json(&self) -> &str {
        self.candidate_json
    }
    /// Returns all prospective identity and generation facts to check.
    #[must_use]
    pub const fn candidate_binding(&self) -> &LocalLogStorageSelectedBindingV3 {
        self.binding
    }
    /// Returns correlation for the one completed read transaction.
    #[must_use]
    pub const fn request_id(&self) -> &LocalLogStorageRootResolutionRequestId {
        self.request_id
    }
}

impl fmt::Debug for LocalLogStorageRootReadbackRequestV3<'_> {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("LocalLogStorageRootReadbackRequestV3")
            .field("binding", &self.binding)
            .field("candidate_json_bytes", &self.candidate_json.len())
            .field("request_id", &self.request_id)
            .finish_non_exhaustive()
    }
}

impl LocalLogStorageRootReadbackV3 {
    /// Records a fresh probe identity before exposing its one borrowed view.
    ///
    /// # Errors
    /// Returns `RequestAlreadyBorrowed` on a second request, without mutation.
    pub fn adapter_request(
        &mut self,
    ) -> Result<LocalLogStorageRootReadbackRequestV3<'_>, LocalLogStorageAttemptTransitionError>
    {
        if self.request_id.is_some() {
            return Err(LocalLogStorageAttemptTransitionError::RequestAlreadyBorrowed);
        }
        let request_id = self.request_id.insert(LocalLogStorageRootResolutionRequestId::new());
        Ok(LocalLogStorageRootReadbackRequestV3 {
            binding: self.source.plan.candidate_binding(),
            candidate_json: &self.source.plan.candidate_json,
            request_id,
        })
    }
}
