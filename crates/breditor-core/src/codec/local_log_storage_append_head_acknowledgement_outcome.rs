use std::fmt;

use super::{LocalLogStorageAppendHeadAcknowledged, LocalLogStorageAppendQueueDrained};

/// Result of acknowledging exactly one host-attested FIFO head.
///
/// `Pending` owns the still-nonempty queue with exactly its first follower
/// promoted. `Drained` owns the token, final speculative cursor, and immutable
/// queue policy after the sole remaining head was removed. Neither case starts
/// another attempt, dispatches a successor, proves current writer authority,
/// or batches acknowledgements.
///
/// ```compile_fail
/// fn require_clone<T: Clone>() {}
/// require_clone::<breditor_core::codec::LocalLogStorageAppendHeadAcknowledgementOutcome>();
/// ```
#[non_exhaustive]
#[must_use = "an append-head acknowledgement retains queue state or drained authority"]
pub enum LocalLogStorageAppendHeadAcknowledgementOutcome {
    /// At least one exact follower remains pending.
    Pending(LocalLogStorageAppendHeadAcknowledged),
    /// The acknowledged head was the queue's final pending frame.
    Drained(LocalLogStorageAppendQueueDrained),
}

impl fmt::Debug for LocalLogStorageAppendHeadAcknowledgementOutcome {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Pending(owner) => formatter.debug_tuple("Pending").field(owner).finish(),
            Self::Drained(owner) => formatter.debug_tuple("Drained").field(owner).finish(),
        }
    }
}
