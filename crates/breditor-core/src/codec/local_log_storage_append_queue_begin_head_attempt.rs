use crate::local_log::LocalLogStorageAppendAttemptId;

use super::{LocalLogStorageAppendQueue, LocalLogStorageUncertainAppendAttempt};

impl LocalLogStorageAppendQueue {
    /// Conservatively begins one physical append attempt for the FIFO head.
    ///
    /// This consuming transition happens before request egress. It fixes the
    /// complete nonempty queue and its structurally distinguished head behind
    /// a fresh process-local attempt identity. Only the resulting uncertain
    /// owner can expose the raw head frame through a one-shot borrowed request.
    ///
    /// The transition performs no I/O and proves no dispatch, observation,
    /// currentness, completion, durability, or queue advancement.
    pub fn begin_head_append_attempt(self) -> LocalLogStorageUncertainAppendAttempt {
        LocalLogStorageUncertainAppendAttempt::new(self, LocalLogStorageAppendAttemptId::new())
    }
}
