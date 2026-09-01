use super::{ActionEffects, ActionStateContract};

/// Frozen observable shape and conservative effects advertised by an action.
#[derive(Clone, Debug, Default, Eq, Hash, PartialEq)]
pub struct ActionStateSpec {
    contract: ActionStateContract,
    effects: ActionEffects,
}

impl ActionStateSpec {
    /// Creates an exact state specification.
    ///
    /// Source registries subsequently reject read domains unavailable to that
    /// source, including session history for ordinary actions and intents.
    #[must_use]
    pub const fn new(contract: ActionStateContract, effects: ActionEffects) -> Self {
        Self { contract, effects }
    }

    /// Creates a stateless specification with conservative effects.
    #[must_use]
    pub const fn stateless() -> Self {
        Self::new(ActionStateContract::stateless(), ActionEffects::conservative())
    }

    /// Returns the exact indicator shape contract.
    #[must_use]
    pub const fn contract(&self) -> &ActionStateContract {
        &self.contract
    }

    /// Returns conservative read/write effects.
    #[must_use]
    pub const fn effects(&self) -> ActionEffects {
        self.effects
    }
}
