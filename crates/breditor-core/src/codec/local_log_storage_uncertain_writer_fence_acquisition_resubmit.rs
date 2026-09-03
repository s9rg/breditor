use crate::local_log::LocalLogStorageWriterFenceAcquisitionAttemptId;

use super::LocalLogStorageUncertainWriterFenceAcquisition;

impl LocalLogStorageUncertainWriterFenceAcquisition {
    /// Begins an exact resubmission with a fresh attempt identity.
    ///
    /// Every binding, JSON allocation, next epoch, and proposed fence remains
    /// unchanged. The previous transaction may still complete, so this remains
    /// uncertain and the adapter must serialize the comparison-and-write.
    pub fn begin_exact_resubmission(mut self) -> Self {
        self.attempt_id = LocalLogStorageWriterFenceAcquisitionAttemptId::new();
        self.request_id = None;
        self
    }
}
