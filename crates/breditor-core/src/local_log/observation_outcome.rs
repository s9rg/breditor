use super::LocalLogSequence;

/// Accepted result of one incremental physical local-log observation.
///
/// Both variants consume one observation slot. Only [`Self::Applied`] consumes
/// a unique-event slot, applies an event, advances the session-global sequence,
/// and charges the event's authoritative operation count. An exact duplicate
/// preserves the session and frontier while incrementing the duplicate count.
#[non_exhaustive]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum LocalLogObservationOutcome {
    /// A first-seen replay binding was applied and retained.
    Applied {
        /// Zero-based physical position accepted in the active generation.
        delivery_index: u64,
        /// Session-global logical sequence applied at that position.
        sequence: LocalLogSequence,
    },
    /// An exact replay binding was recognized without applying it again.
    ExactDuplicate {
        /// Zero-based physical position accepted for this duplicate.
        delivery_index: u64,
        /// Physical position where the binding was first accepted.
        first_delivery_index: u64,
        /// Existing session-global sequence retained for the binding.
        sequence: LocalLogSequence,
    },
}

impl LocalLogObservationOutcome {
    /// Returns the accepted physical position in the active generation.
    #[must_use]
    pub const fn delivery_index(self) -> u64 {
        match self {
            Self::Applied { delivery_index, .. } | Self::ExactDuplicate { delivery_index, .. } => {
                delivery_index
            }
        }
    }

    /// Returns the logical sequence represented by the accepted binding.
    #[must_use]
    pub const fn sequence(self) -> LocalLogSequence {
        match self {
            Self::Applied { sequence, .. } | Self::ExactDuplicate { sequence, .. } => sequence,
        }
    }

    /// Returns whether this observation applied a first-seen event.
    #[must_use]
    pub const fn was_applied(self) -> bool {
        matches!(self, Self::Applied { .. })
    }

    /// Returns the original physical position for an exact duplicate.
    #[must_use]
    pub const fn first_delivery_index(self) -> Option<u64> {
        match self {
            Self::Applied { .. } => None,
            Self::ExactDuplicate { first_delivery_index, .. } => Some(first_delivery_index),
        }
    }
}
