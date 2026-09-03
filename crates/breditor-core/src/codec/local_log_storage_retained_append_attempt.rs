use crate::local_log::{LocalLogStorageAppendAttemptId, LocalLogStorageAppendRequestId};

use super::LocalLogStorageAppendQueue;

/// Private queue ownership retained by a terminal negative append state.
pub(super) struct LocalLogStorageRetainedAppendAttempt {
    queue: LocalLogStorageAppendQueue,
    correlation: LocalLogStorageRetainedAppendAttemptCorrelation,
}

impl LocalLogStorageRetainedAppendAttempt {
    pub(super) const fn before_request(
        queue: LocalLogStorageAppendQueue,
        attempt_id: LocalLogStorageAppendAttemptId,
    ) -> Self {
        Self {
            queue,
            correlation: LocalLogStorageRetainedAppendAttemptCorrelation::BeforeRequest(attempt_id),
        }
    }

    pub(super) const fn issued(
        queue: LocalLogStorageAppendQueue,
        request_id: LocalLogStorageAppendRequestId,
    ) -> Self {
        Self {
            queue,
            correlation: LocalLogStorageRetainedAppendAttemptCorrelation::Issued(request_id),
        }
    }

    pub(super) const fn queue(&self) -> &LocalLogStorageAppendQueue {
        &self.queue
    }

    pub(super) const fn attempt_id(&self) -> &LocalLogStorageAppendAttemptId {
        match &self.correlation {
            LocalLogStorageRetainedAppendAttemptCorrelation::BeforeRequest(attempt_id) => {
                attempt_id
            }
            LocalLogStorageRetainedAppendAttemptCorrelation::Issued(request_id) => {
                request_id.attempt_id()
            }
        }
    }

    pub(super) const fn request_issued(&self) -> bool {
        matches!(self.correlation, LocalLogStorageRetainedAppendAttemptCorrelation::Issued(_))
    }

    pub(super) fn into_queue(self) -> LocalLogStorageAppendQueue {
        self.queue
    }
}

enum LocalLogStorageRetainedAppendAttemptCorrelation {
    BeforeRequest(LocalLogStorageAppendAttemptId),
    Issued(LocalLogStorageAppendRequestId),
}
