//! Native replay precedes all durable-prefix completion and torn-tail repair.
use crate::{Recovery, Result, Room, log::Log};
use std::path::Path;
impl Room {
    /// Open only the explicit Unix generation directory and replay all original global events
    /// before resuming a pending physical head or trimming an incomplete active tail. Saved bytes
    /// grant no current account access or deployment authority; old ephemeral leases stay absent.
    /// # Errors
    /// Wrong layout, competing owners, malformed/forged manifests, semantic replay or I/O refuse.
    pub fn open_log_generations(path: &Path) -> Result<(Self, Recovery)> {
        let (log, records, recovery) = Log::open_generations(path)?;
        Self::replay_loaded(log, records, recovery, true)
    }
}
