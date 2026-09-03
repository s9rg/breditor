use crate::local_log::LocalLogStorageRotationResolutionRequestId;

use super::{
    LocalLogStorageRotationResolution, LocalLogStorageRotationResolutionRequest,
    LocalLogStorageRotationResolutionTransitionError,
};

impl LocalLogStorageRotationResolution {
    /// Emits the one borrowed payload-bearing request for this invocation.
    ///
    /// The opaque resolver identity is minted at this exact egress boundary.
    /// A host may still copy and dispatch the token or bytes more than once.
    ///
    /// # Errors
    ///
    /// Returns `RequestAlreadyIssued` after this invocation yielded its request.
    pub fn adapter_request(
        &mut self,
    ) -> Result<
        LocalLogStorageRotationResolutionRequest<'_>,
        LocalLogStorageRotationResolutionTransitionError,
    > {
        if self.request_id.is_some() {
            return Err(LocalLogStorageRotationResolutionTransitionError::RequestAlreadyIssued);
        }

        let plan = self.source.plan();
        let request_id = self.request_id.insert(LocalLogStorageRotationResolutionRequestId::new());
        Ok(LocalLogStorageRotationResolutionRequest::from_plan(plan, request_id))
    }
}
