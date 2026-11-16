//! Inspect and finish a continued WAL rotation without exporting an unlinked archive.
use super::{held_file::FileIdentity, inspection::PendingNativeLogRotation};
use crate::{Error, Result, log::Log};
use serde::{Deserialize, Serialize};
use std::fs;

/// The logical cut and exact intended local continuation, independent of rotation phase.
#[derive(Clone, Debug, Eq, PartialEq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct SelectedSegmentRotation {
    pub(crate) next_generation: String,
    pub(crate) after_manifest: [u8; 32],
    pub(crate) records: u64,
    terminal_digest: [u8; 32],
    continuation: FileIdentity,
}

impl Log {
    /// The segment prefix has already been semantically replayed under its original owner lock.
    pub(crate) fn inspect_segment_rotation(
        &self,
    ) -> Result<Option<(SelectedSegmentRotation, PendingNativeLogRotation)>> {
        self.check_generation_replay()?;
        if self.segment_base().is_none() || self.has_incomplete_generation_tail()? {
            return Err(Error::Contract("continued rotation requires a complete linked WAL"));
        }
        let state = self.generations.as_ref().ok_or(Error::NeedsRecovery)?;
        match fs::symlink_metadata(state.directory.path.join(".rotation.json")) {
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
            Err(error) => return Err(error.into()),
            Ok(_) => {}
        }
        let observation = state.inspect_pending_rotation(self)?.observation;
        let selected = SelectedSegmentRotation {
            next_generation: observation.next_generation.clone(),
            after_manifest: observation.after_manifest,
            records: self.next,
            terminal_digest: self.previous,
            continuation: observation.continuation,
        };
        Ok(Some((selected, observation)))
    }

    /// Confirm the exact empty successor on retry and synchronize any final directory update.
    pub(crate) fn sync_selected_segment_rotation(
        &mut self,
        selected: &SelectedSegmentRotation,
    ) -> Result<()> {
        self.check_generation_replay()?;
        let state = self.generations.as_ref().ok_or(Error::NeedsRecovery)?;
        state.directory.absent(".rotation.json")?;
        if self.segment_base().is_none()
            || state.current().hash != selected.after_manifest
            || state.current().value.active.generation != selected.next_generation
            || self.next != selected.records
            || self.previous != selected.terminal_digest
            || state.active_identity != selected.continuation
            || self.bytes != 0
            || self.has_incomplete_generation_tail()?
        {
            return Err(Error::Contract("continued rotation selected successor differs"));
        }
        self.file.sync_all()?;
        state.directory.sync()?;
        self.finish_complete_recovery(crate::Recovery::default())
    }
}
