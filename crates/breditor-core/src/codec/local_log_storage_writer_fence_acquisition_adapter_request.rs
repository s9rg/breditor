use crate::local_log::LocalLogStorageWriterFenceAcquisitionRequestId;

use super::{
    LocalLogStorageUncertainWriterFenceAcquisition, LocalLogStorageWriterFenceAcquisitionRequest,
    LocalLogStorageWriterFenceAcquisitionTransitionError,
};

impl LocalLogStorageUncertainWriterFenceAcquisition {
    /// Borrows the exact request for this physical acquisition attempt.
    ///
    /// The first call permanently records request egress and mints the request
    /// identity used by terminal correlation. The borrow cannot outlive or be
    /// consumed independently of this owner.
    ///
    /// # Errors
    ///
    /// Returns
    /// [`LocalLogStorageWriterFenceAcquisitionTransitionError::RequestAlreadyIssued`]
    /// after this attempt has yielded its request once.
    pub fn adapter_request(
        &mut self,
    ) -> Result<
        LocalLogStorageWriterFenceAcquisitionRequest<'_>,
        LocalLogStorageWriterFenceAcquisitionTransitionError,
    > {
        if self.request_id.is_some() {
            return Err(LocalLogStorageWriterFenceAcquisitionTransitionError::RequestAlreadyIssued);
        }
        let request_id = self
            .request_id
            .insert(LocalLogStorageWriterFenceAcquisitionRequestId::new(&self.attempt_id));
        Ok(LocalLogStorageWriterFenceAcquisitionRequest::from_plan(&self.plan, request_id))
    }
}
