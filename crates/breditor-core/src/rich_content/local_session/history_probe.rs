//! Process-local history event counters for an external ordering coordinator.
//!
//! A multi-root set owns the global order of Undo units across several local
//! owners without mutating them. These monotonic counters let it classify what
//! happened between two reads. They are never persisted, compared for document
//! equality or used for permission; a restored owner starts at zero.

use super::RichLocalSession;

/// Monotonic counts of history events since this owner was created or restored.
#[derive(Clone, Copy, Debug, Default, Eq, PartialEq)]
pub struct RichHistoryProbe {
    /// Content groups published (each initially opens one Undo unit).
    pub commits: u64,
    /// Published groups merged into the previous unit by natural typing history.
    pub joins: u64,
    /// Undo units undone.
    pub undos: u64,
    /// Undo units redone.
    pub redos: u64,
}

impl RichLocalSession {
    /// Exact process-local history counters; see [`RichHistoryProbe`].
    #[must_use]
    pub const fn history_probe(&self) -> RichHistoryProbe {
        self.probe
    }
}
