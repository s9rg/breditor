//! Full native replay and independently trusted identity precede the final readiness inode.
use super::super::ServerLogGenerationBackup;
use super::{RecoveredLogGenerationRoom, ServerLogGenerationRecovery, files};
use crate::{Error, Result, Room, log::Log};
impl ServerLogGenerationRecovery {
    /// Resume the selected owned prefixes, replay all native state, then publish readiness.
    /// Preserves registrations, receipts and native histories; old connection leases stay absent.
    /// No service, upload or provider operation starts. Retain the archive on failure for resume.
    /// # Errors
    /// Wrong source/custody, unrelated occupied targets, invalid native replay or I/O refuse.
    /// Files and intent records remain for inspection; no existing work is overwritten or deleted.
    pub fn finish(self, backup: &ServerLogGenerationBackup) -> Result<RecoveredLogGenerationRoom> {
        self.progress(backup)?;
        let (component, inner) = self.prepare_component()?;
        for (name, bytes) in backup.selected_files()? {
            self.restore_part(&component, &inner, name, bytes)?;
        }
        #[cfg(test)]
        self.interrupt(super::interruption::RestorePoint::FilesRestored)?;
        inner.guard_witness(&component.witness)?;
        let prepared = files::exists(&inner.path.join(".prepared.json"))?;
        let (log, records, recovery) = if prepared {
            Log::open_prepared_generations(inner)?
        } else {
            Log::open_owned_generations(inner)?
        };
        if recovery.truncated_bytes != 0 {
            return Err(Error::Contract("generation archive cannot repair a native tail"));
        }
        let (mut room, _) = Room::replay_loaded(log, records, recovery, false)?;
        let actual = room.log.generation_descriptor()?;
        let expected = &self.marker.identity;
        let records = actual
            .next_sequence
            .parse()
            .map_err(|_| Error::Contract("generation restored global cut"))?;
        if actual.manifest != expected.manifest
            || room.native_identity_at(records, actual.terminal_digest) != expected.source
        {
            return Err(Error::Contract("generation recovery native source identity differs"));
        }
        #[cfg(test)]
        self.interrupt(super::interruption::RestorePoint::NativeVerified)?;
        #[cfg(test)]
        if self.stop_after == Some(super::interruption::RestorePoint::ReadyLinked) {
            room.log.interrupt_readiness_after_link_for_test()?;
        }
        room.log.publish_generation_ready()?;
        #[cfg(test)]
        self.interrupt(super::interruption::RestorePoint::ReadyPublished)?;
        let completion = self.completion();
        let path = self.directory.path.join(".complete.json");
        if files::exists(&path)? {
            let actual: super::types::Marker = files::read(&path)?;
            if files::encode(&actual)? != files::encode(&completion)? {
                return Err(Error::Contract("generation recovery completion differs"));
            }
        } else {
            files::insert(&self.directory, ".complete.json", &files::encode(&completion)?)?;
        }
        self.directory.guard()?;
        #[cfg(test)]
        self.interrupt(super::interruption::RestorePoint::CompletionSynced)?;
        Ok(RecoveredLogGenerationRoom { room, directory: self.directory })
    }
}
