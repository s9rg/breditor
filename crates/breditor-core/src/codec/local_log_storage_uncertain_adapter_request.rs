use super::{
    LocalLogStorageAttemptRequest, LocalLogStorageAttemptTransitionError,
    LocalLogStorageUncertainAttempt,
};
use crate::local_log::LocalLogStorageAttemptRequestId;

impl LocalLogStorageUncertainAttempt {
    /// Borrows the exact payload-bearing request for the current attempt.
    ///
    /// One physical attempt yields at most one request view. The borrow cannot
    /// outlive or be consumed independently of this `Uncertain` owner. A host
    /// can still copy bytes or dispatch them more than once, so this API shape
    /// reduces accidental duplication but is not proof of single dispatch. Any
    /// copied dispatch is outside this attempt ID's singular terminal-event
    /// correlation and must be discovered through storage resolution.
    ///
    /// # Errors
    ///
    /// Returns [`LocalLogStorageAttemptTransitionError::RequestAlreadyBorrowed`]
    /// after this physical attempt has yielded its one request view. Exact
    /// resubmission creates a fresh identity and restores request eligibility.
    pub fn adapter_request(
        &mut self,
    ) -> Result<LocalLogStorageAttemptRequest<'_>, LocalLogStorageAttemptTransitionError> {
        if self.request_id.is_some() {
            return Err(LocalLogStorageAttemptTransitionError::RequestAlreadyBorrowed);
        }
        let request_id =
            self.request_id.insert(LocalLogStorageAttemptRequestId::new(&self.attempt_id));
        Ok(LocalLogStorageAttemptRequest::from_plan(&self.plan, request_id))
    }
}
