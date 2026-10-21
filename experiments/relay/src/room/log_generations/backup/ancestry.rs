//! Whole immutable native transport prefix; actual native replay/owner checks stay mandatory.
use super::ServerLogGenerationBackup;
use crate::{Error, Result, log::generations::verify_archive_ancestor};
impl ServerLogGenerationBackup {
    pub(in crate::room::log_generations) fn check_archive_ancestor(
        &self,
        ancestor: &Self,
    ) -> Result<()> {
        let mut selected = self.identity.source.clone();
        selected.records = ancestor.identity.source.records;
        selected.terminal_log_digest = ancestor.identity.source.terminal_log_digest;
        if selected != ancestor.identity.source {
            return Err(Error::Contract("archive ancestor immutable native identity differs"));
        }
        verify_archive_ancestor(&self.selected_files()?, &ancestor.selected_files()?)
    }
}
