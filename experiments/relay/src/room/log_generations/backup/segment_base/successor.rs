//! Stage an empty WAL and durably fence its exact source before allowing writes.
use super::RelaySegmentBaseFile;
use crate::{Error, Recovery, Result, Room, log::Log};
use std::{path::Path, sync::Arc};

impl Room {
    /// Move the native append owner to a new, absent directory with a fresh physical WAL budget.
    /// Authenticate the principal before calling. Keep the old directory and archive files
    /// immutable and durably synced before calling. Existing client registrations remain valid and must resume to get fresh leases.
    ///
    /// An error after publication leaves the predecessor fenced. Use
    /// `open_relay_segment_successor` with the same paths and base to recover it.
    ///
    /// # Errors
    /// Refuses non-owner calls, stale or changed archives, reused generation IDs, occupied
    /// destinations and I/O failures. A partial destination is never adopted automatically.
    pub fn continue_into_relay_segment(
        &mut self,
        principal: &str,
        path: &Path,
        base: Arc<RelaySegmentBaseFile>,
        active_generation: &str,
    ) -> Result<Self> {
        self.recovery_inventory_owner(principal)?;
        self.log.check_segment_parent(&base)?;
        let selected = &base.identity.predecessor;
        let head = self.log.generation_descriptor()?;
        let records = head
            .next_sequence
            .parse()
            .map_err(|_| Error::Contract("relay segment absolute cut"))?;
        if selected.manifest != head.manifest
            || selected.source != self.native_identity_at(records, head.terminal_digest)
            || !self.log.verify_generation_archive(&base.selections(), selected.manifest, false)?
        {
            return Err(Error::Contract("relay segment base differs from live room"));
        }
        // Confirm the checkpoint's exact native state before the irreversible fence. The same
        // serialization is already used by both the source capture and cold recovery.
        let mut digest = crate::archive_digest::ArchiveDigest::new(
            crate::room::materialized_checkpoint::MAX_CHECKPOINT_BYTES as u64,
        );
        let observed = crate::room::materialized_checkpoint::Checkpoint::capture(
            self,
            selected.source.clone(),
            selected.manifest,
        )?;
        serde_json::to_writer(&mut digest, &observed)?;
        if digest.finish().0 != base.identity.checkpoint.sha256 {
            return Err(Error::Contract("relay segment checkpoint differs from live room"));
        }
        let (target, manifest) = self.log.prepare_segment(path, &base, active_generation)?;
        let custody = self.log.commit_segment(&target, manifest, base)?;
        let (log, recovery) = Log::open_segment_directory(target, custody)?;
        Self::replay_relay_segment(log, recovery, observed, false).map(|(room, _)| room)
    }

    /// Open the successor selected by the original directory's sync'd handoff marker.
    /// Validate its checkpoint and replay the complete local suffix before handling an ordinary
    /// interrupted rotation or incomplete final frame. Ephemeral connections start empty.
    ///
    /// # Errors
    /// Missing or divergent handoff, occupied or wrong directory, competing owners and corrupt
    /// storage refuse. This is local filesystem ownership; authenticate service activation
    /// separately. An externally restored copy requires a separate deployment fence.
    pub fn open_relay_segment_successor(
        predecessor: &Path,
        path: &Path,
        base: Arc<RelaySegmentBaseFile>,
    ) -> Result<(Self, Recovery)> {
        Self::open_relay_segment_chain(&[predecessor, path], base)
    }

    /// Cold-open a complete local chain. Supply every selected directory from the original
    /// through the writable successor, in handoff order. Each source marker remains guarded.
    ///
    /// # Errors
    /// Refuses missing, reordered or copied ownership markers, noncurrent endpoints and
    /// corrupt archives or replay. No tail is repaired before the entire chain is verified.
    pub fn open_relay_segment_chain(
        paths: &[&Path],
        base: Arc<RelaySegmentBaseFile>,
    ) -> Result<(Self, Recovery)> {
        let state = base.checkpoint_state()?;
        let (log, recovery) = Log::open_selected_segment(paths, base)?;
        Self::replay_relay_segment(log, recovery, state, true)
    }

    fn replay_relay_segment(
        log: Log,
        recovery: Recovery,
        state: crate::room::materialized_checkpoint::Checkpoint,
        repair: bool,
    ) -> Result<(Self, Recovery)> {
        let replay = log.open_generation_replay()?;
        let selected =
            log.segment_base().ok_or(Error::NeedsRecovery)?.identity().checkpoint.clone();
        let mut room = state.restore(log, &selected)?;
        replay.visit_suffix(selected.source.records, |record| room.replay(record))?;
        room.log.check_generation_replay()?;
        room.abandon_suggestion_revision_preparation();
        room.finish_replay(recovery, repair)
    }
}
