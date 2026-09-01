use super::ActionStateDomains;

/// Declared observation dependencies and possible state effects of one action.
///
/// `reads` supports conservative invalidation. Ordinary action handlers receive
/// no session history, so action and intent construction rejects `HISTORY` in
/// their read sets. Synthesized history observations may read it. `may_write`
/// is checked against enabled preflight commits, but declarations do not
/// sandbox trusted native handlers.
#[derive(Clone, Copy, Debug, Eq, Hash, PartialEq)]
pub struct ActionEffects {
    reads: ActionStateDomains,
    may_write: ActionStateDomains,
}

impl ActionEffects {
    /// Creates an exact effects declaration.
    ///
    /// This value is context-free. Registries enforce which source kinds may
    /// truthfully declare each read domain.
    #[must_use]
    pub const fn new(reads: ActionStateDomains, may_write: ActionStateDomains) -> Self {
        Self { reads, may_write }
    }

    /// Returns observable domains that can affect evaluation.
    #[must_use]
    pub const fn reads(self) -> ActionStateDomains {
        self.reads
    }

    /// Returns observable domains an enabled action may change.
    #[must_use]
    pub const fn may_write(self) -> ActionStateDomains {
        self.may_write
    }

    /// Returns whether this declaration conservatively covers `other`.
    #[must_use]
    pub const fn covers(self, other: Self) -> bool {
        self.reads.contains(other.reads) && self.may_write.contains(other.may_write)
    }

    /// Returns the conservative default for extension-safe actions.
    #[must_use]
    pub const fn conservative() -> Self {
        Self::new(
            ActionStateDomains::DOCUMENT
                .union(ActionStateDomains::SELECTION)
                .union(ActionStateDomains::PENDING_FORMATS)
                .union(ActionStateDomains::CONTEXT),
            ActionStateDomains::DOCUMENT
                .union(ActionStateDomains::SELECTION)
                .union(ActionStateDomains::PENDING_FORMATS)
                .union(ActionStateDomains::HISTORY),
        )
    }
}

impl Default for ActionEffects {
    fn default() -> Self {
        Self::conservative()
    }
}
