use crate::local_log::LocalLogStorageWriterFenceAcquisitionAttemptId;

use super::{
    LocalLogStorageUncertainWriterFenceAcquisition, LocalLogStorageWriterFenceAcquisitionAborted,
};

impl LocalLogStorageWriterFenceAcquisitionAborted {
    /// Begins an allocation-preserving exact resubmission under a fresh identity.
    pub fn begin_exact_resubmission(self) -> LocalLogStorageUncertainWriterFenceAcquisition {
        LocalLogStorageUncertainWriterFenceAcquisition::new(
            self.retained.into_plan(),
            LocalLogStorageWriterFenceAcquisitionAttemptId::new(),
        )
    }
}
