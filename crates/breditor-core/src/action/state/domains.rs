use std::{
    fmt,
    ops::{BitOr, BitOrAssign},
};

/// Fixed observable editor-state domains read or written by an action.
///
/// Domains are conservative invalidation and effect declarations, not a
/// permission boundary. Native action handlers remain trusted code.
#[derive(Clone, Copy, Default, Eq, Hash, Ord, PartialEq, PartialOrd)]
pub struct ActionStateDomains(u8);

impl ActionStateDomains {
    /// No observable state domains.
    pub const NONE: Self = Self(0);
    /// Immutable document content.
    pub const DOCUMENT: Self = Self(1 << 0);
    /// Current selection.
    pub const SELECTION: Self = Self(1 << 1);
    /// Pending typing formats.
    pub const PENDING_FORMATS: Self = Self(1 << 2);
    /// Validation context, schema, and active limits.
    pub const CONTEXT: Self = Self(1 << 3);
    /// Linear undo/redo history state.
    ///
    /// Session-backed history observation sources may read this domain.
    /// Ordinary actions and routed intents cannot observe history and their
    /// registries reject specs that claim otherwise.
    pub const HISTORY: Self = Self(1 << 4);
    /// Every currently defined observable domain.
    pub const ALL: Self = Self(
        Self::DOCUMENT.0
            | Self::SELECTION.0
            | Self::PENDING_FORMATS.0
            | Self::CONTEXT.0
            | Self::HISTORY.0,
    );

    /// Returns the union of two domain sets.
    #[must_use]
    pub const fn union(self, other: Self) -> Self {
        Self(self.0 | other.0)
    }

    /// Returns whether this set contains every domain in `other`.
    #[must_use]
    pub const fn contains(self, other: Self) -> bool {
        self.0 & other.0 == other.0
    }

    /// Returns whether this set contains no domains.
    #[must_use]
    pub const fn is_empty(self) -> bool {
        self.0 == 0
    }
}

impl BitOr for ActionStateDomains {
    type Output = Self;

    fn bitor(self, rhs: Self) -> Self::Output {
        self.union(rhs)
    }
}

impl BitOrAssign for ActionStateDomains {
    fn bitor_assign(&mut self, rhs: Self) {
        *self = self.union(rhs);
    }
}

impl fmt::Debug for ActionStateDomains {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        let mut set = formatter.debug_set();
        if self.contains(Self::DOCUMENT) {
            set.entry(&"DOCUMENT");
        }
        if self.contains(Self::SELECTION) {
            set.entry(&"SELECTION");
        }
        if self.contains(Self::PENDING_FORMATS) {
            set.entry(&"PENDING_FORMATS");
        }
        if self.contains(Self::CONTEXT) {
            set.entry(&"CONTEXT");
        }
        if self.contains(Self::HISTORY) {
            set.entry(&"HISTORY");
        }
        set.finish()
    }
}
