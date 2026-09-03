use crate::local_log::{
    LocalLogStorageWriterFenceAcquisitionAttemptId, LocalLogStorageWriterFenceAcquisitionRequestId,
};

use super::LocalLogStorageWriterFenceAcquisitionPlan;

/// Private storage proven to have emitted one exact acquisition request.
pub(super) struct LocalLogStorageIssuedWriterFenceAcquisition {
    plan: LocalLogStorageWriterFenceAcquisitionPlan,
    request_id: LocalLogStorageWriterFenceAcquisitionRequestId,
}

impl LocalLogStorageIssuedWriterFenceAcquisition {
    pub(super) const fn new(
        plan: LocalLogStorageWriterFenceAcquisitionPlan,
        request_id: LocalLogStorageWriterFenceAcquisitionRequestId,
    ) -> Self {
        Self { plan, request_id }
    }

    pub(super) const fn plan(&self) -> &LocalLogStorageWriterFenceAcquisitionPlan {
        &self.plan
    }

    pub(super) const fn attempt_id(&self) -> &LocalLogStorageWriterFenceAcquisitionAttemptId {
        self.request_id.attempt_id()
    }

    pub(super) const fn request_id(&self) -> &LocalLogStorageWriterFenceAcquisitionRequestId {
        &self.request_id
    }

    pub(super) fn into_plan(self) -> LocalLogStorageWriterFenceAcquisitionPlan {
        self.plan
    }
}
