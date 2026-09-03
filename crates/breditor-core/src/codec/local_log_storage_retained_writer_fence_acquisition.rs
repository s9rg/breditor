use crate::local_log::{
    LocalLogStorageWriterFenceAcquisitionAttemptId, LocalLogStorageWriterFenceAcquisitionRequestId,
};

use super::LocalLogStorageWriterFenceAcquisitionPlan;

/// Private storage for a terminal negative acquisition state.
pub(super) struct LocalLogStorageRetainedWriterFenceAcquisition {
    plan: LocalLogStorageWriterFenceAcquisitionPlan,
    correlation: LocalLogStorageRetainedWriterFenceAcquisitionCorrelation,
}

impl LocalLogStorageRetainedWriterFenceAcquisition {
    pub(super) const fn before_request(
        plan: LocalLogStorageWriterFenceAcquisitionPlan,
        attempt_id: LocalLogStorageWriterFenceAcquisitionAttemptId,
    ) -> Self {
        Self {
            plan,
            correlation: LocalLogStorageRetainedWriterFenceAcquisitionCorrelation::BeforeRequest(
                attempt_id,
            ),
        }
    }

    pub(super) const fn issued(
        plan: LocalLogStorageWriterFenceAcquisitionPlan,
        request_id: LocalLogStorageWriterFenceAcquisitionRequestId,
    ) -> Self {
        Self {
            plan,
            correlation: LocalLogStorageRetainedWriterFenceAcquisitionCorrelation::Issued(
                request_id,
            ),
        }
    }

    pub(super) const fn plan(&self) -> &LocalLogStorageWriterFenceAcquisitionPlan {
        &self.plan
    }

    pub(super) const fn attempt_id(&self) -> &LocalLogStorageWriterFenceAcquisitionAttemptId {
        match &self.correlation {
            LocalLogStorageRetainedWriterFenceAcquisitionCorrelation::BeforeRequest(id) => id,
            LocalLogStorageRetainedWriterFenceAcquisitionCorrelation::Issued(id) => id.attempt_id(),
        }
    }

    pub(super) const fn request_issued(&self) -> bool {
        matches!(
            self.correlation,
            LocalLogStorageRetainedWriterFenceAcquisitionCorrelation::Issued(_)
        )
    }

    pub(super) fn into_plan(self) -> LocalLogStorageWriterFenceAcquisitionPlan {
        self.plan
    }
}

enum LocalLogStorageRetainedWriterFenceAcquisitionCorrelation {
    BeforeRequest(LocalLogStorageWriterFenceAcquisitionAttemptId),
    Issued(LocalLogStorageWriterFenceAcquisitionRequestId),
}
