use super::{
    ActionEffects, ActionStateContract, ActionStateDomains, ActionStateId, ActionStateSource,
};

/// Frozen schema and source of one observable action-state entry.
///
/// Effects are conservative invalidation metadata, not an authorization or
/// sandbox boundary. The source input is immutable catalog configuration and
/// is redacted by its [`std::fmt::Debug`] implementation.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ActionStateDescriptor {
    id: ActionStateId,
    source: ActionStateSource,
    contract: ActionStateContract,
    effects: ActionEffects,
}

impl ActionStateDescriptor {
    pub(crate) const fn new(
        id: ActionStateId,
        source: ActionStateSource,
        contract: ActionStateContract,
        effects: ActionEffects,
    ) -> Self {
        Self { id, source, contract, effects }
    }

    pub(crate) fn history(id: ActionStateId, source: ActionStateSource) -> Self {
        let publishable = ActionStateDomains::DOCUMENT
            .union(ActionStateDomains::SELECTION)
            .union(ActionStateDomains::PENDING_FORMATS)
            .union(ActionStateDomains::HISTORY);
        Self::new(
            id,
            source,
            ActionStateContract::stateless(),
            ActionEffects::new(ActionStateDomains::ALL, publishable),
        )
    }

    /// Returns the stable observable identity.
    #[must_use]
    pub const fn id(&self) -> &ActionStateId {
        &self.id
    }

    /// Returns the exact immutable evaluation source.
    #[must_use]
    pub const fn source(&self) -> &ActionStateSource {
        &self.source
    }

    /// Returns the exact activation/value shape promised by the source.
    #[must_use]
    pub const fn contract(&self) -> &ActionStateContract {
        &self.contract
    }

    /// Returns conservative read and possible-write domains.
    #[must_use]
    pub const fn effects(&self) -> ActionEffects {
        self.effects
    }
}
