use std::fmt;

use crate::{
    action::{
        ActionId, ActionStateDomains, ActionStateIndicator, DisabledReason,
        routing::{BindingId, IntentBinding, IntentFallThrough, IntentId},
    },
    transaction::ReplayDirection,
};

use super::{ActionStateDescriptor, ActionStateFault};

/// Authoritative availability observed through the source's execution path.
#[derive(Clone, Eq, PartialEq)]
pub enum ObservedAvailability {
    /// The source produced one successfully preflighted state transition.
    Enabled,
    /// A direct or history source is expectedly unavailable.
    Disabled(DisabledReason),
    /// One routed binding deliberately stopped disabled fallback.
    Blocked(DisabledReason),
}

impl ObservedAvailability {
    /// Returns whether the exact source was enabled.
    #[must_use]
    pub const fn is_enabled(&self) -> bool {
        matches!(self, Self::Enabled)
    }

    /// Returns the stable reason for a disabled or blocked observation.
    #[must_use]
    pub const fn reason(&self) -> Option<&DisabledReason> {
        match self {
            Self::Enabled => None,
            Self::Disabled(reason) | Self::Blocked(reason) => Some(reason),
        }
    }
}

impl fmt::Debug for ObservedAvailability {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Enabled => formatter.write_str("Enabled"),
            Self::Disabled(reason) => formatter
                .debug_struct("Disabled")
                .field("code", reason.code())
                .field("detail", &"<redacted>")
                .finish(),
            Self::Blocked(reason) => formatter
                .debug_struct("Blocked")
                .field("code", reason.code())
                .field("detail", &"<redacted>")
                .finish(),
        }
    }
}

/// Exact execution-path provenance of one resolved observation.
#[derive(Clone, Eq, PartialEq)]
pub enum ActionStateProvenance {
    /// The catalog evaluated a registered action directly.
    Direct {
        /// Evaluated action identity.
        action: ActionId,
    },
    /// The catalog evaluated a semantic route to a selected or blocking binding.
    Routed {
        /// Evaluated semantic intent.
        intent: IntentId,
        /// Selected or blocking binding.
        binding: IntentBinding,
        /// Earlier expected-disabled candidates in priority order.
        fallthroughs: Box<[IntentFallThrough]>,
    },
    /// The catalog preflighted one linear-history direction.
    History {
        /// Evaluated replay direction.
        direction: ReplayDirection,
    },
}

impl ActionStateProvenance {
    /// Returns route fallthroughs, or an empty slice for non-routed sources.
    #[must_use]
    pub const fn fallthroughs(&self) -> &[IntentFallThrough] {
        match self {
            Self::Routed { fallthroughs, .. } => fallthroughs,
            Self::Direct { .. } | Self::History { .. } => &[],
        }
    }

    /// Returns the selected or blocking binding identity for a routed source.
    #[must_use]
    pub const fn binding_id(&self) -> Option<&BindingId> {
        match self {
            Self::Routed { binding, .. } => Some(binding.id()),
            Self::Direct { .. } | Self::History { .. } => None,
        }
    }
}

impl fmt::Debug for ActionStateProvenance {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Direct { action } => {
                formatter.debug_struct("Direct").field("action", action).finish()
            }
            Self::Routed { intent, binding, fallthroughs } => formatter
                .debug_struct("Routed")
                .field("intent", intent)
                .field("binding", binding)
                .field("fallthrough_count", &fallthroughs.len())
                .finish(),
            Self::History { direction } => {
                formatter.debug_struct("History").field("direction", direction).finish()
            }
        }
    }
}

/// Complete resolved state for an enabled, disabled, or blocked source.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ResolvedActionState {
    availability: ObservedAvailability,
    indicator: ActionStateIndicator,
    actual_writes: Option<ActionStateDomains>,
    provenance: ActionStateProvenance,
}

impl ResolvedActionState {
    pub(crate) const fn new(
        availability: ObservedAvailability,
        indicator: ActionStateIndicator,
        actual_writes: Option<ActionStateDomains>,
        provenance: ActionStateProvenance,
    ) -> Self {
        Self { availability, indicator, actual_writes, provenance }
    }

    /// Returns authoritative availability from preparation, routing, or replay preflight.
    #[must_use]
    pub const fn availability(&self) -> &ObservedAvailability {
        &self.availability
    }

    /// Returns activation and typed value observed in the same evaluation.
    #[must_use]
    pub const fn indicator(&self) -> &ActionStateIndicator {
        &self.indicator
    }

    /// Returns proven write domains for an enabled transition.
    ///
    /// Disabled and blocked outcomes return `None`. Enabled publication always
    /// includes snapshot identity and history: every changed state advances its
    /// revision, and the session's history boundary can also change.
    #[must_use]
    pub const fn actual_writes(&self) -> Option<ActionStateDomains> {
        self.actual_writes
    }

    /// Returns the exact source path that produced this observation.
    #[must_use]
    pub const fn provenance(&self) -> &ActionStateProvenance {
        &self.provenance
    }
}

/// A declared intent for which every evaluated binding fell through.
#[derive(Clone, Eq, PartialEq)]
pub struct UnhandledActionState {
    intent: IntentId,
    fallthroughs: Box<[IntentFallThrough]>,
}

impl UnhandledActionState {
    pub(crate) const fn new(intent: IntentId, fallthroughs: Box<[IntentFallThrough]>) -> Self {
        Self { intent, fallthroughs }
    }

    /// Returns the declared semantic intent.
    #[must_use]
    pub const fn intent(&self) -> &IntentId {
        &self.intent
    }

    /// Returns every expected-disabled candidate in priority order.
    #[must_use]
    pub const fn fallthroughs(&self) -> &[IntentFallThrough] {
        &self.fallthroughs
    }
}

impl fmt::Debug for UnhandledActionState {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("UnhandledActionState")
            .field("intent", &self.intent)
            .field("fallthrough_count", &self.fallthroughs.len())
            .finish()
    }
}

/// Entry-local result of deriving one observable source.
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum ActionStateOutcome {
    /// The source produced authoritative availability and indicator state.
    Resolved(ResolvedActionState),
    /// Every binding of a declared semantic intent fell through.
    Unhandled(UnhandledActionState),
    /// Evaluation failed without invalidating sibling entries.
    Fault(ActionStateFault),
}

/// One descriptor paired with its exact-source derived result.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ActionStateEntry {
    descriptor: ActionStateDescriptor,
    outcome: ActionStateOutcome,
}

impl ActionStateEntry {
    pub(crate) const fn new(
        descriptor: ActionStateDescriptor,
        outcome: ActionStateOutcome,
    ) -> Self {
        Self { descriptor, outcome }
    }

    /// Returns immutable source/schema metadata.
    #[must_use]
    pub const fn descriptor(&self) -> &ActionStateDescriptor {
        &self.descriptor
    }

    /// Returns the stable observable identity.
    #[must_use]
    pub const fn id(&self) -> &super::ActionStateId {
        self.descriptor.id()
    }

    /// Returns the entry-local derivation outcome.
    #[must_use]
    pub const fn outcome(&self) -> &ActionStateOutcome {
        &self.outcome
    }

    pub(crate) fn replace_with_fault(&mut self, fault: ActionStateFault) {
        self.outcome = ActionStateOutcome::Fault(fault);
    }
}
