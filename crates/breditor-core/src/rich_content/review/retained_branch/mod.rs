//! Explicit same-author branch union. Saved data supplies no historical role grant.
mod commit;
mod input;
mod order;
mod prepare;
mod validate_event;
mod verify;
use super::{ReviewObservation, ReviewSession};

/// Opaque exact-owner candidate. Preparation changes neither original owner;
/// the independent host must retain durable inputs and approve recovery first.
/// There is no serialized permission or public candidate constructor.
pub struct PreparedReviewBranch {
    source: ReviewObservation,
    candidate: Option<ReviewSession>,
    incoming_bytes: usize,
}
impl PreparedReviewBranch {
    /// Canonical bytes of newly admitted events, not an acknowledgement.
    #[must_use]
    pub const fn incoming_bytes(&self) -> usize {
        self.incoming_bytes
    }
    /// Whether committing will publish peer events. Local history is unchanged.
    #[must_use]
    pub const fn changed(&self) -> bool {
        self.candidate.is_some()
    }
}
