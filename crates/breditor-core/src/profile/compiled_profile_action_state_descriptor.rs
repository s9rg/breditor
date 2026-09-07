use crate::action::{ActionStateContract, ActionStateId};

use super::CompiledProfileActionStateSource;

/// Owned declarative contract for one observable action-state entry.
///
/// A routed entry retains its semantic-intent cross-link so a host can prove
/// that a displayed control observes the same intent it will later invoke.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct CompiledProfileActionStateDescriptor {
    id: ActionStateId,
    source: CompiledProfileActionStateSource,
    contract: ActionStateContract,
}

impl CompiledProfileActionStateDescriptor {
    pub(super) fn new(
        id: ActionStateId,
        source: CompiledProfileActionStateSource,
        contract: ActionStateContract,
    ) -> Self {
        Self { id, source, contract }
    }

    /// Returns the stable observable identity.
    #[must_use]
    pub const fn id(&self) -> &ActionStateId {
        &self.id
    }

    /// Returns the exact command or history relationship evaluated by this entry.
    #[must_use]
    pub const fn source(&self) -> &CompiledProfileActionStateSource {
        &self.source
    }

    /// Returns the exact observable activation/value shape.
    #[must_use]
    pub const fn contract(&self) -> &ActionStateContract {
        &self.contract
    }
}
