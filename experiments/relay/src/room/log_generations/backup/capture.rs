//! Capture exact held files under current owner access; no provider fetch or partial fallback.
use super::{
    ServerLogGenerationBackup,
    format::{self, Header},
};
use crate::{Result, Room};
impl Room {
    /// Export complete physical generation history through this actual exclusive native owner.
    /// Retains all selected files and bounded unpublished stages, but not the instance marker,
    /// ephemeral leases, raster bytes or client offline journals. No source event is appended.
    /// This detached archive is not native replay proof or authority to activate a service.
    /// # Errors
    /// Non-owner access, original storage, changed/uncertain files, pending rotation or bounds
    /// refuse. An uncertain storage read fences this owner until exact cold recovery.
    pub fn export_log_generation_backup(
        &mut self,
        principal: &str,
    ) -> Result<ServerLogGenerationBackup> {
        self.recovery_inventory_owner(principal)?;
        let files = self.log.capture_generation_files()?;
        self.generation_backup_from_files(files)
    }

    pub(in crate::room::log_generations) fn export_inspected_log_generation_prefix(
        &mut self,
        principal: &str,
    ) -> Result<(ServerLogGenerationBackup, Vec<u8>)> {
        self.recovery_inventory_owner(principal)?;
        let (files, suffix) = self.log.capture_inspected_generation_prefix()?;
        Ok((self.generation_backup_from_files(files)?, suffix))
    }

    fn generation_backup_from_files(
        &self,
        files: crate::log::generations::GenerationFiles,
    ) -> Result<ServerLogGenerationBackup> {
        let source = self.native_identity_at(files.cut.records, files.cut.previous);
        let header = Header {
            format: "breditor/relay-log-generation-backup".into(),
            format_version: 1,
            source,
            manifest: files.cut.manifest,
            files: files.sections,
        };
        format::finish(files.body, header)
    }
}
