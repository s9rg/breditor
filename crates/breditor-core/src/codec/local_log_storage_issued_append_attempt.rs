use crate::local_log::{LocalLogStorageAppendAttemptId, LocalLogStorageAppendRequestId};

use super::LocalLogStorageAppendQueue;

/// Private queue ownership proven to have emitted one exact append request.
pub(super) struct LocalLogStorageIssuedAppendAttempt {
    queue: LocalLogStorageAppendQueue,
    request_id: LocalLogStorageAppendRequestId,
}

impl LocalLogStorageIssuedAppendAttempt {
    pub(super) const fn new(
        queue: LocalLogStorageAppendQueue,
        request_id: LocalLogStorageAppendRequestId,
    ) -> Self {
        Self { queue, request_id }
    }

    pub(super) const fn queue(&self) -> &LocalLogStorageAppendQueue {
        &self.queue
    }

    pub(super) const fn attempt_id(&self) -> &LocalLogStorageAppendAttemptId {
        self.request_id.attempt_id()
    }

    pub(super) const fn request_id(&self) -> &LocalLogStorageAppendRequestId {
        &self.request_id
    }

    pub(super) fn into_parts(self) -> (LocalLogStorageAppendQueue, LocalLogStorageAppendRequestId) {
        (self.queue, self.request_id)
    }
}
