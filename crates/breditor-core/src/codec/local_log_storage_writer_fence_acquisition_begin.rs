use crate::local_log::LocalLogStorageWriterFenceAcquisitionAttemptId;

use super::{
    LocalLogStorageUncertainWriterFenceAcquisition, LocalLogStorageWriterFenceAcquisitionPlan,
};

impl LocalLogStorageWriterFenceAcquisitionPlan {
    /// Begins one physical acquisition attempt before request egress.
    ///
    /// The consuming transition installs a fresh opaque process-local attempt
    /// identity and moves the complete exact plan into an uncertain state. It
    /// performs no I/O and grants no mutation authority.
    pub fn begin_acquisition(self) -> LocalLogStorageUncertainWriterFenceAcquisition {
        LocalLogStorageUncertainWriterFenceAcquisition::new(
            self,
            LocalLogStorageWriterFenceAcquisitionAttemptId::new(),
        )
    }
}
