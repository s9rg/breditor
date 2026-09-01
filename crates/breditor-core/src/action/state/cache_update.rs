use std::fmt;

use super::{ActionStateDelta, ActionStateObservation};

/// One immutable result published by an action-state cache refresh.
///
/// Every variant identifies the cache's current observation. `Full` publishes
/// a complete baseline, `Unchanged` confirms that the caller already has that
/// exact observation, and `Delta` publishes a complete new observation plus a
/// bounded change description relative to its prior identity.
#[derive(Clone, Eq, PartialEq)]
#[non_exhaustive]
pub enum ActionStateCacheUpdate {
    /// A complete observation with no usable prior baseline.
    #[non_exhaustive]
    Full {
        /// The complete current observation.
        observation: ActionStateObservation,
    },
    /// Confirmation that the requested observation remains current.
    #[non_exhaustive]
    Unchanged {
        /// The complete current observation.
        observation: ActionStateObservation,
    },
    /// A complete new observation and its bounded prior-relative delta.
    #[non_exhaustive]
    Delta {
        /// The complete newly published observation.
        observation: ActionStateObservation,
        /// The change description leading to `observation`.
        delta: ActionStateDelta,
    },
}

impl ActionStateCacheUpdate {
    pub(crate) const fn full(observation: ActionStateObservation) -> Self {
        Self::Full { observation }
    }

    pub(crate) const fn unchanged(observation: ActionStateObservation) -> Self {
        Self::Unchanged { observation }
    }

    /// Creates a delta update from cache-proved matching values.
    ///
    /// The cache must supply a delta whose new identity is the observation's
    /// identity. Violating that invariant indicates an internal cache defect.
    pub(crate) fn from_delta(observation: ActionStateObservation, delta: ActionStateDelta) -> Self {
        debug_assert_eq!(observation.id(), delta.new_id());
        Self::Delta { observation, delta }
    }

    /// Returns the complete current observation for this update.
    #[must_use]
    pub const fn observation(&self) -> &ActionStateObservation {
        match self {
            Self::Full { observation }
            | Self::Unchanged { observation }
            | Self::Delta { observation, .. } => observation,
        }
    }

    /// Returns the prior-relative delta when this is a delta update.
    #[must_use]
    pub const fn delta(&self) -> Option<&ActionStateDelta> {
        match self {
            Self::Delta { delta, .. } => Some(delta),
            Self::Full { .. } | Self::Unchanged { .. } => None,
        }
    }

    /// Returns whether this update publishes a complete baseline.
    #[must_use]
    pub const fn is_full(&self) -> bool {
        matches!(self, Self::Full { .. })
    }

    /// Returns whether the requested observation remains current.
    #[must_use]
    pub const fn is_unchanged(&self) -> bool {
        matches!(self, Self::Unchanged { .. })
    }

    /// Returns whether this update includes a prior-relative delta.
    #[must_use]
    pub const fn is_delta(&self) -> bool {
        matches!(self, Self::Delta { .. })
    }
}

impl fmt::Debug for ActionStateCacheUpdate {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        let (kind, observation, delta) = match self {
            Self::Full { observation } => ("Full", observation, None),
            Self::Unchanged { observation } => ("Unchanged", observation, None),
            Self::Delta { observation, delta } => ("Delta", observation, Some(delta)),
        };
        formatter
            .debug_struct("ActionStateCacheUpdate")
            .field("kind", &kind)
            .field("observation", observation)
            .field("delta", &delta)
            .finish_non_exhaustive()
    }
}
