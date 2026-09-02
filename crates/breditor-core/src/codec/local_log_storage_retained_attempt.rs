use crate::local_log::{LocalLogStorageAttemptId, LocalLogStorageAttemptRequestId};

use super::local_log_storage_attempt_plan::LocalLogStorageAttemptPlan;

/// Shared private storage for a post-observation exact attempt state.
pub(super) struct LocalLogStorageRetainedAttempt {
    plan: LocalLogStorageAttemptPlan,
    correlation: LocalLogStorageRetainedAttemptCorrelation,
}

impl LocalLogStorageRetainedAttempt {
    pub(super) const fn before_request(
        plan: LocalLogStorageAttemptPlan,
        attempt_id: LocalLogStorageAttemptId,
    ) -> Self {
        Self {
            plan,
            correlation: LocalLogStorageRetainedAttemptCorrelation::BeforeRequest(attempt_id),
        }
    }

    pub(super) const fn issued(
        plan: LocalLogStorageAttemptPlan,
        request_id: LocalLogStorageAttemptRequestId,
    ) -> Self {
        Self { plan, correlation: LocalLogStorageRetainedAttemptCorrelation::Issued(request_id) }
    }

    pub(super) const fn plan(&self) -> &LocalLogStorageAttemptPlan {
        &self.plan
    }

    pub(super) const fn attempt_id(&self) -> &LocalLogStorageAttemptId {
        match &self.correlation {
            LocalLogStorageRetainedAttemptCorrelation::BeforeRequest(attempt_id) => attempt_id,
            LocalLogStorageRetainedAttemptCorrelation::Issued(request_id) => {
                request_id.attempt_id()
            }
        }
    }

    pub(super) const fn request_issued(&self) -> bool {
        matches!(self.correlation, LocalLogStorageRetainedAttemptCorrelation::Issued(_))
    }

    pub(super) fn into_plan(self) -> LocalLogStorageAttemptPlan {
        self.plan
    }
}

enum LocalLogStorageRetainedAttemptCorrelation {
    BeforeRequest(LocalLogStorageAttemptId),
    Issued(LocalLogStorageAttemptRequestId),
}
