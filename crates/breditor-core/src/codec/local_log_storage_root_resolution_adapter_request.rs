use crate::local_log::LocalLogStorageRootResolutionRequestId;

use super::{
    LocalLogStorageRootResolution, LocalLogStorageRootResolutionRequest,
    LocalLogStorageRootResolutionTransitionError,
};

impl LocalLogStorageRootResolution {
    /// Emits the one borrowed payload-bearing request for this invocation.
    ///
    /// The opaque resolver identity is minted at this exact egress boundary.
    /// The request borrow cannot outlive or be consumed independently of this
    /// owner. A host can still copy its token or bytes and dispatch them later
    /// or more than once, so this is not proof of single dispatch or storage
    /// state. Only a later exactly correlated completed read or narrowly
    /// defined aborted database-open observation can be considered for
    /// application.
    ///
    /// # Errors
    ///
    /// Returns
    /// [`LocalLogStorageRootResolutionTransitionError::RequestAlreadyIssued`]
    /// after this invocation has yielded its request. Consuming
    /// [`Self::restart_resolution`] clears the correlation so a later call
    /// creates a distinct request identity.
    pub fn adapter_request(
        &mut self,
    ) -> Result<
        LocalLogStorageRootResolutionRequest<'_>,
        LocalLogStorageRootResolutionTransitionError,
    > {
        if self.request_id.is_some() {
            return Err(LocalLogStorageRootResolutionTransitionError::RequestAlreadyIssued);
        }

        let plan = self.source.plan();
        let request_id = self.request_id.insert(LocalLogStorageRootResolutionRequestId::new());
        Ok(LocalLogStorageRootResolutionRequest::from_plan(plan, request_id))
    }
}
