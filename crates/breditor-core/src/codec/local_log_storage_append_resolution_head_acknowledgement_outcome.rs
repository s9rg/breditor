use std::fmt;

use super::{
    LocalLogStorageAppendHeadAcknowledgedAtResolution,
    LocalLogStorageAppendQueueDrainedAtResolution,
};

/// Result of acknowledging one resolver-proven byte-identical final head.
///
/// Both branches use the same core-private structural FIFO advance as direct
/// terminal completion. Neither starts a successor, batches removal, proves
/// current writer authority, or turns the resolver snapshot into durability.
#[non_exhaustive]
#[must_use = "a resolution acknowledgement retains pending or drained queue state"]
pub enum LocalLogStorageAppendResolutionHeadAcknowledgementOutcome {
    /// At least one exact follower remains pending.
    Pending(LocalLogStorageAppendHeadAcknowledgedAtResolution),
    /// The resolved head was the queue's final pending frame.
    Drained(LocalLogStorageAppendQueueDrainedAtResolution),
}

impl fmt::Debug for LocalLogStorageAppendResolutionHeadAcknowledgementOutcome {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Pending(owner) => formatter.debug_tuple("Pending").field(owner).finish(),
            Self::Drained(owner) => formatter.debug_tuple("Drained").field(owner).finish(),
        }
    }
}
