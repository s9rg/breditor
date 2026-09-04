use crate::local_log::LocalLogStorageAppendResolutionRequestId;

use super::{
    LocalLogStorageAppendResolution, LocalLogStorageAppendResolutionRequest,
    LocalLogStorageAppendResolutionTransitionError,
};

impl LocalLogStorageAppendResolution {
    /// Emits the one borrowed observational request for this resolver invocation.
    ///
    /// The opaque resolver identity is minted at this exact egress boundary.
    /// The request borrow cannot outlive or be consumed independently of this
    /// owner. A host can still copy its IDs or bytes and dispatch reads later or
    /// more than once, so this is not proof of single dispatch or storage state.
    ///
    /// # Errors
    ///
    /// Returns
    /// [`LocalLogStorageAppendResolutionTransitionError::RequestAlreadyIssued`]
    /// after this invocation has yielded its request. Consuming
    /// [`Self::restart_resolution`] clears only resolver correlation, allowing
    /// a later call to create a distinct request identity.
    pub fn adapter_request(
        &mut self,
    ) -> Result<
        LocalLogStorageAppendResolutionRequest<'_>,
        LocalLogStorageAppendResolutionTransitionError,
    > {
        if self.request_id.is_some() {
            return Err(LocalLogStorageAppendResolutionTransitionError::RequestAlreadyIssued);
        }

        let source = &self.source;
        let request_id = self.request_id.insert(LocalLogStorageAppendResolutionRequestId::new());
        Ok(LocalLogStorageAppendResolutionRequest::from_source(source, request_id))
    }
}
