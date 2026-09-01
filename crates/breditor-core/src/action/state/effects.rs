use super::ActionStateDomains;

/// Declared observation dependencies and possible state effects of one action.
///
/// `reads` supports conservative invalidation. Ordinary action handlers receive
/// no session history, so action and intent construction rejects `HISTORY` in
/// their read sets. Synthesized history observations may read it. `SNAPSHOT`
/// means evaluation depends on the exact editor lineage and revision, not only
/// content-bearing domains. Every changed commit writes `SNAPSHOT` by advancing
/// its lineage-local revision. `may_write` is checked against enabled preflight
/// commits, but declarations do not sandbox trusted native handlers.
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
    ///
    /// Its reads include exact snapshot identity. A precise custom declaration
    /// may omit `SNAPSHOT` when evaluation is invariant across equal content at
    /// different lineages or revisions. Its possible writes include `SNAPSHOT`
    /// because every enabled action commit advances revision when published.
    #[must_use]
    pub const fn conservative() -> Self {
        Self::new(
            ActionStateDomains::DOCUMENT
                .union(ActionStateDomains::SELECTION)
                .union(ActionStateDomains::PENDING_FORMATS)
                .union(ActionStateDomains::CONTEXT)
                .union(ActionStateDomains::SNAPSHOT),
            ActionStateDomains::DOCUMENT
                .union(ActionStateDomains::SELECTION)
                .union(ActionStateDomains::PENDING_FORMATS)
                .union(ActionStateDomains::HISTORY)
                .union(ActionStateDomains::SNAPSHOT),
        )
    }
}

impl Default for ActionEffects {
    fn default() -> Self {
        Self::conservative()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn conservative_effects_include_exact_snapshot_identity() {
        let effects = ActionEffects::conservative();
        let reads = effects.reads();

        assert!(reads.contains(ActionStateDomains::SNAPSHOT));
        assert!(reads.intersects(ActionStateDomains::SNAPSHOT));
        assert!(effects.may_write().contains(ActionStateDomains::SNAPSHOT));
        assert!(ActionStateDomains::ALL.contains(ActionStateDomains::SNAPSHOT));
    }

    #[test]
    fn precise_custom_reads_can_omit_snapshot_identity() {
        let effects = ActionEffects::new(
            ActionStateDomains::DOCUMENT.union(ActionStateDomains::SELECTION),
            ActionStateDomains::DOCUMENT,
        );

        assert!(!effects.reads().contains(ActionStateDomains::SNAPSHOT));
        assert!(!effects.reads().intersects(ActionStateDomains::SNAPSHOT));
    }
}
