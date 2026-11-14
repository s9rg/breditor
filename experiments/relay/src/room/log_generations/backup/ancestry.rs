//! Whole immutable native transport prefix; actual native replay/owner checks stay mandatory.
use super::{ServerLogGenerationBackup, ServerLogGenerationBackupIdentity};
use crate::{
    Error, Result, archive_input::ArchiveSlice, log::generations::verify_archive_sections,
};
use std::collections::BTreeMap;

impl ServerLogGenerationBackup {
    pub(in crate::room::log_generations) fn check_archive_ancestor(
        &self,
        ancestor: &Self,
    ) -> Result<()> {
        check_native_ancestry(
            &self.identity,
            &self.archive_sections()?,
            &ancestor.identity,
            &ancestor.archive_sections()?,
        )
    }

    pub(in crate::room::log_generations) fn archive_sections(
        &self,
    ) -> Result<BTreeMap<&str, ArchiveSlice<'_>>> {
        Ok(self
            .selected_files()?
            .into_iter()
            .map(|(name, bytes)| (name, ArchiveSlice::Bytes(bytes)))
            .collect())
    }

    #[cfg(feature = "server")]
    pub(in crate::room::log_generations) fn selected_identity(
        &self,
    ) -> &ServerLogGenerationBackupIdentity {
        &self.identity
    }
}

pub(in crate::room::log_generations) fn check_native_ancestry(
    current: &ServerLogGenerationBackupIdentity,
    sections: &BTreeMap<&str, ArchiveSlice<'_>>,
    ancestor_identity: &ServerLogGenerationBackupIdentity,
    ancestor: &BTreeMap<&str, ArchiveSlice<'_>>,
) -> Result<()> {
    let mut source = current.source.clone();
    source.records = ancestor_identity.source.records;
    source.terminal_log_digest = ancestor_identity.source.terminal_log_digest;
    if source != ancestor_identity.source {
        return Err(Error::Contract("archive ancestor immutable native identity differs"));
    }
    verify_archive_sections(sections, ancestor)
}
