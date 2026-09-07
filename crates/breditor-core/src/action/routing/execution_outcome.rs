use std::fmt;

use crate::{
    action::{ActionStateIndicator, DisabledReason},
    state::SnapshotId,
    transaction::Commit,
};

use super::{IntentBinding, IntentFallThrough, IntentId};

/// Exact receipt produced by consuming one current semantic route outcome.
///
/// Routing provenance remains available for telemetry without being stamped
/// into transaction metadata or linear history. Blocked and unhandled are
/// expected successful receipts; only an unequal route base is an error.
#[must_use = "an intent execution receipt must be inspected or discarded explicitly"]
#[derive(Eq, PartialEq)]
pub enum IntentExecutionOutcome {
    /// A selected action's cached commit was published or is ready to publish.
    Committed {
        /// Routed semantic intent.
        intent: IntentId,
        /// Exact binding that selected the action.
        binding: IntentBinding,
        /// Cached proven commit produced by ordinary action preparation.
        commit: Box<Commit>,
        /// Earlier disabled candidates in priority evaluation order.
        fallthroughs: Box<[IntentFallThrough]>,
    },
    /// One expected-disabled binding deliberately stopped fallback.
    Blocked {
        /// Routed semantic intent.
        intent: IntentId,
        /// Exact snapshot on which the blocked result was evaluated.
        base_snapshot: SnapshotId,
        /// Exact binding that stopped fallback.
        binding: IntentBinding,
        /// Exact expected-disabled reason.
        reason: DisabledReason,
        /// Activation and optional typed value from the blocking evaluation.
        indicator: ActionStateIndicator,
        /// Earlier disabled candidates in priority evaluation order.
        fallthroughs: Box<[IntentFallThrough]>,
    },
    /// Every candidate deliberately fell through, or none were bound.
    Unhandled {
        /// Routed semantic intent.
        intent: IntentId,
        /// Exact snapshot on which the unhandled result was evaluated.
        base_snapshot: SnapshotId,
        /// Complete disabled fallthrough trace in priority evaluation order.
        fallthroughs: Box<[IntentFallThrough]>,
    },
}

impl IntentExecutionOutcome {
    /// Returns the routed semantic intent for every receipt.
    #[must_use]
    pub const fn intent_id(&self) -> &IntentId {
        match self {
            Self::Committed { intent, .. }
            | Self::Blocked { intent, .. }
            | Self::Unhandled { intent, .. } => intent,
        }
    }

    /// Returns the exact snapshot on which routing was evaluated.
    #[must_use]
    pub const fn base_snapshot(&self) -> &SnapshotId {
        match self {
            Self::Committed { commit, .. } => commit.base_snapshot(),
            Self::Blocked { base_snapshot, .. } | Self::Unhandled { base_snapshot, .. } => {
                base_snapshot
            }
        }
    }

    /// Returns the selected or blocking binding, when one was reached.
    #[must_use]
    pub const fn binding(&self) -> Option<&IntentBinding> {
        match self {
            Self::Committed { binding, .. } | Self::Blocked { binding, .. } => Some(binding),
            Self::Unhandled { .. } => None,
        }
    }

    /// Returns the published or publishable commit, when one was prepared.
    #[must_use]
    pub const fn commit(&self) -> Option<&Commit> {
        match self {
            Self::Committed { commit, .. } => Some(commit),
            Self::Blocked { .. } | Self::Unhandled { .. } => None,
        }
    }

    /// Returns the blocking expected-disabled reason, when routing was blocked.
    #[must_use]
    pub const fn blocked_reason(&self) -> Option<&DisabledReason> {
        match self {
            Self::Blocked { reason, .. } => Some(reason),
            Self::Committed { .. } | Self::Unhandled { .. } => None,
        }
    }

    /// Returns activation and optional typed value from a blocking evaluation.
    #[must_use]
    pub const fn blocked_indicator(&self) -> Option<&ActionStateIndicator> {
        match self {
            Self::Blocked { indicator, .. } => Some(indicator),
            Self::Committed { .. } | Self::Unhandled { .. } => None,
        }
    }

    /// Returns disabled fallthroughs in priority evaluation order.
    #[must_use]
    pub const fn fallthroughs(&self) -> &[IntentFallThrough] {
        match self {
            Self::Committed { fallthroughs, .. }
            | Self::Blocked { fallthroughs, .. }
            | Self::Unhandled { fallthroughs, .. } => fallthroughs,
        }
    }

    /// Consumes the receipt and returns its commit, when one was produced.
    #[must_use]
    pub fn into_commit(self) -> Option<Commit> {
        match self {
            Self::Committed { commit, .. } => Some(*commit),
            Self::Blocked { .. } | Self::Unhandled { .. } => None,
        }
    }
}

impl fmt::Debug for IntentExecutionOutcome {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Committed { intent, binding, commit, fallthroughs } => formatter
                .debug_struct("CommittedIntent")
                .field("intent", intent)
                .field("binding", binding)
                .field("base_snapshot", &commit.base_snapshot())
                .field("snapshot", &commit.snapshot())
                .field("fallthroughs", fallthroughs)
                .finish_non_exhaustive(),
            Self::Blocked { intent, base_snapshot, binding, reason, indicator, fallthroughs } => {
                formatter
                    .debug_struct("BlockedIntentExecution")
                    .field("intent", intent)
                    .field("base_snapshot", base_snapshot)
                    .field("binding", binding)
                    .field("reason", reason)
                    .field("indicator", indicator)
                    .field("fallthroughs", fallthroughs)
                    .finish()
            }
            Self::Unhandled { intent, base_snapshot, fallthroughs } => formatter
                .debug_struct("UnhandledIntentExecution")
                .field("intent", intent)
                .field("base_snapshot", base_snapshot)
                .field("fallthroughs", fallthroughs)
                .finish(),
        }
    }
}
