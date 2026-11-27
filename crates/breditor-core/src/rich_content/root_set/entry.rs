//! Global journal entries: one root's content unit, or one undoable set-structure step.

use super::RichRootId;
use std::collections::BTreeMap;

/// One position in the single global Undo/Redo order of a root set.
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum RichRootJournalEntry {
    /// One exact Undo unit held by that root's own session history.
    Unit(RichRootId),
    /// One undoable change of the set's structure or of a root's attributes.
    Structure(RichRootStructureStep),
}

impl RichRootJournalEntry {
    /// The root this entry belongs to.
    #[must_use]
    pub const fn root(&self) -> &RichRootId {
        match self {
            Self::Unit(id) => id,
            Self::Structure(step) => step.root(),
        }
    }
    /// Whether this is a set-structure step rather than a root content unit.
    #[must_use]
    pub const fn is_structure(&self) -> bool {
        matches!(self, Self::Structure(_))
    }
}

/// An undoable set-structure step, recorded in its forward (redo) direction.
///
/// Positions are exact set-order indexes at the moment the step was applied. A
/// set whose roots change only through undoable steps keeps every recorded
/// position exact; a root added or removed outside history is a barrier that
/// drops every positional step first (see `docs/MULTIPLE_ROOTS.md`).
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum RichRootStructureStep {
    /// The root was attached at `index`. Undo detaches it (its owner is retained).
    Add {
        /// Added root.
        id: RichRootId,
        /// Set-order position it was attached at.
        index: usize,
    },
    /// The root was detached from `index`. Undo re-attaches the same retained owner there.
    Remove {
        /// Removed root.
        id: RichRootId,
        /// Set-order position it was detached from.
        index: usize,
    },
    /// The root moved from `from` to `to` in set order.
    Move {
        /// Moved root.
        id: RichRootId,
        /// Position before the move.
        from: usize,
        /// Position after the move.
        to: usize,
    },
    /// The root's host attributes changed from `before` to `after`.
    Attributes {
        /// Root whose attributes changed.
        id: RichRootId,
        /// Complete attributes before the step.
        before: BTreeMap<String, String>,
        /// Complete attributes after the step.
        after: BTreeMap<String, String>,
    },
}

impl RichRootStructureStep {
    /// The root this step changes.
    #[must_use]
    pub const fn root(&self) -> &RichRootId {
        match self {
            Self::Add { id, .. }
            | Self::Remove { id, .. }
            | Self::Move { id, .. }
            | Self::Attributes { id, .. } => id,
        }
    }
    /// Whether the step records set-order positions (add, remove, move).
    #[must_use]
    pub const fn is_positional(&self) -> bool {
        !matches!(self, Self::Attributes { .. })
    }
    /// Stable wire name: `add`, `remove`, `move` or `attributes`.
    #[must_use]
    pub const fn kind(&self) -> &'static str {
        match self {
            Self::Add { .. } => "add",
            Self::Remove { .. } => "remove",
            Self::Move { .. } => "move",
            Self::Attributes { .. } => "attributes",
        }
    }
}
