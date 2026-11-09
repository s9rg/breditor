//! Explicit offline migration preparation, preserving the original log and its terminal hash.
use super::{
    ServerLogGenerationBackup,
    format::{self, Header},
};
use crate::{
    Error, Result, RoomBackup, RoomBackupIdentity, ServerLogGenerationOptions,
    log::generations::prepare_original_root,
};

impl RoomBackup {
    /// Prepare a deterministic generation archive with this exact original WAL as its sealed root.
    /// The selected native identity must come from trusted host configuration. This step checks
    /// the selected cut and complete framing. Use `ServerLogGenerationRecovery` with the resulting
    /// archive and selection to perform native replay and publish a separate destination.
    ///
    /// # Errors
    /// Wrong cut, invalid or repeated generation IDs, malformed framing or bounded allocation
    /// refuse. This operation performs no storage writes and confers no deployment authority.
    pub fn prepare_generation_migration(
        &self,
        expected: &RoomBackupIdentity,
        options: &ServerLogGenerationOptions,
    ) -> Result<ServerLogGenerationBackup> {
        let cut = self.selected_cut();
        if cut != (expected.records, expected.terminal_log_digest) {
            return Err(Error::Contract("original migration selected log cut"));
        }
        let files = prepare_original_root(self.original_log(), cut, options)?;
        let header = Header {
            format: "breditor/relay-log-generation-backup".into(),
            format_version: 1,
            source: expected.clone(),
            manifest: files.cut.manifest,
            files: files.sections,
        };
        format::finish(files.body, header)
    }
}
