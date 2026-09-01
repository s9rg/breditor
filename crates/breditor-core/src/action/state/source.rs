use std::fmt;

use crate::{
    action::{ActionInvocation, routing::IntentInvocation},
    transaction::ReplayDirection,
};

/// Immutable source evaluated for one observable action-state entry.
///
/// Direct and routed sources retain their exact invocation inputs. History is
/// session-local and therefore needs only its replay direction. Source inputs
/// are catalog configuration, not mutable toolbar command objects.
#[derive(Clone, Eq, PartialEq)]
pub enum ActionStateSource {
    /// Evaluate one exact registered action invocation.
    Direct(ActionInvocation),
    /// Evaluate one exact declared semantic intent invocation.
    Routed(IntentInvocation),
    /// Evaluate whether one linear-history direction can replay.
    History(ReplayDirection),
}

impl ActionStateSource {
    /// Creates a direct action source.
    #[must_use]
    pub const fn direct(invocation: ActionInvocation) -> Self {
        Self::Direct(invocation)
    }

    /// Creates a routed semantic-intent source.
    #[must_use]
    pub const fn routed(invocation: IntentInvocation) -> Self {
        Self::Routed(invocation)
    }

    /// Creates a linear-history source.
    #[must_use]
    pub const fn history(direction: ReplayDirection) -> Self {
        Self::History(direction)
    }
}

impl fmt::Debug for ActionStateSource {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Direct(invocation) => formatter
                .debug_struct("Direct")
                .field("action", invocation.id())
                .field("input", &"<redacted>")
                .finish(),
            Self::Routed(invocation) => formatter
                .debug_struct("Routed")
                .field("intent", invocation.id())
                .field("input", &"<redacted>")
                .finish(),
            Self::History(direction) => formatter.debug_tuple("History").field(direction).finish(),
        }
    }
}
