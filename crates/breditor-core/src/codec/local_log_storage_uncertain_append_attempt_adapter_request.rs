use crate::local_log::LocalLogStorageAppendRequestId;

use super::{
    LocalLogStorageAppendRequest, LocalLogStorageAppendTransitionError,
    LocalLogStorageUncertainAppendAttempt,
};

impl LocalLogStorageUncertainAppendAttempt {
    /// Borrows the exact FIFO-head request for this physical append attempt.
    ///
    /// The first call permanently records request egress and mints the request
    /// identity reserved for future terminal correlation. The returned borrow
    /// cannot outlive or be consumed independently of this owner. It exposes
    /// no follower and performs no I/O.
    ///
    /// # Errors
    ///
    /// Returns [`LocalLogStorageAppendTransitionError::RequestAlreadyIssued`]
    /// after this attempt has yielded its request once.
    pub fn adapter_request(
        &mut self,
    ) -> Result<LocalLogStorageAppendRequest<'_>, LocalLogStorageAppendTransitionError> {
        if self.request_id.is_some() {
            return Err(LocalLogStorageAppendTransitionError::RequestAlreadyIssued);
        }

        let request_id =
            self.request_id.insert(LocalLogStorageAppendRequestId::new(&self.attempt_id));
        Ok(LocalLogStorageAppendRequest::from_queue(&self.queue, request_id))
    }
}
