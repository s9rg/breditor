use super::{ActionStateId, ActionStateSource};

/// One observable control registration before immutable catalog construction.
///
/// Registrations contain no labels, icons, shortcuts, toolbar placement, or
/// callbacks. Those are host presentation concerns keyed by [`ActionStateId`].
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ActionStateRegistration {
    id: ActionStateId,
    source: ActionStateSource,
}

impl ActionStateRegistration {
    /// Registers one stable observable identity over one immutable source.
    #[must_use]
    pub const fn new(id: ActionStateId, source: ActionStateSource) -> Self {
        Self { id, source }
    }

    /// Returns the observable-state identity.
    #[must_use]
    pub const fn id(&self) -> &ActionStateId {
        &self.id
    }

    /// Returns the exact source evaluated for this entry.
    #[must_use]
    pub const fn source(&self) -> &ActionStateSource {
        &self.source
    }

    pub(crate) fn into_parts(self) -> (ActionStateId, ActionStateSource) {
        (self.id, self.source)
    }
}
