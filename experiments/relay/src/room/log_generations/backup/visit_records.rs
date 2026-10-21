//! Private complete packet-source traversal. Records never escape as a public import capability.
use super::ServerLogGenerationBackup;
use crate::{
    Error, Result,
    log::{Record, generations::visit_generation_records},
};
impl ServerLogGenerationBackup {
    pub(in crate::room) fn visit_records(
        &self,
        visit: impl FnMut(Record) -> Result<()>,
    ) -> Result<()> {
        let files = self.selected_files()?;
        let cut = visit_generation_records(&files, visit)?;
        if cut.manifest != self.header.manifest
            || cut.records != self.header.source.records
            || cut.previous != self.header.source.terminal_log_digest
        {
            return Err(Error::Contract("generation retained packet source differs"));
        }
        Ok(())
    }
}
