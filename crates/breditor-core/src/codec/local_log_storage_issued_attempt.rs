use crate::local_log::{LocalLogStorageAttemptId, LocalLogStorageAttemptRequestId};

use super::local_log_storage_attempt_plan::LocalLogStorageAttemptPlan;

/// Shared private storage proven to have emitted one exact adapter request.
pub(super) struct LocalLogStorageIssuedAttempt {
    plan: LocalLogStorageAttemptPlan,
    request_id: LocalLogStorageAttemptRequestId,
}

impl LocalLogStorageIssuedAttempt {
    pub(super) const fn new(
        plan: LocalLogStorageAttemptPlan,
        request_id: LocalLogStorageAttemptRequestId,
    ) -> Self {
        Self { plan, request_id }
    }

    pub(super) const fn plan(&self) -> &LocalLogStorageAttemptPlan {
        &self.plan
    }

    pub(super) const fn attempt_id(&self) -> &LocalLogStorageAttemptId {
        self.request_id.attempt_id()
    }

    pub(super) const fn request_id(&self) -> &LocalLogStorageAttemptRequestId {
        &self.request_id
    }

    pub(super) fn into_plan(self) -> LocalLogStorageAttemptPlan {
        self.plan
    }
}
