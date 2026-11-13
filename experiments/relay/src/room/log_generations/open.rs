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
        let (log, recovery) = Log::open_generations(path)?;
        Self::replay_generation(log)?.finish_replay(recovery, true)
    }

    /// Rebuild privately under the log's exclusive lock, holding at most one
    /// source record at a time. Callers decide whether to repair or inspect.
    pub(in crate::room) fn replay_generation(log: Log) -> Result<Self> {
        let source = log.open_generation_replay()?;
        let mut opening_log = Some(log);
        let mut room = None;
        source.visit(|record| {
            if let Some(log) = opening_log.take() {
                room = Some(Self::replay_seed(log, record)?);
                return Ok(());
            }
            room.as_mut().ok_or(crate::Error::NeedsRecovery)?.replay(record)
        })?;
        let mut room = room.ok_or(crate::Error::Contract("log has no complete seed"))?;
        room.log.check_generation_replay()?;
        room.abandon_suggestion_revision_preparation();
        Ok(room)
    }
}
