//! Reframe an admitted native archive without its unpublished rotation stages.
use super::{ServerLogGenerationBackup, format};
use crate::{Error, Result};

// Complete archive admission has already verified that these names cannot
// refer to the selected head, readiness record, a manifest, or a WAL.
fn is_stage(name: &str) -> bool {
    name.starts_with(".stage-")
}

impl ServerLogGenerationBackup {
    pub(in crate::room::log_generations) fn without_unpublished_stages(self) -> Result<Self> {
        if !self.header.files.iter().any(|part| is_stage(&part.name)) {
            return Err(Error::Contract("generation backup has no unpublished stages"));
        }
        let mut source_offset = self.body_offset()?;
        let Self { mut bytes, mut header, .. } = self;
        let mut destination_offset = 0;
        let mut files = Vec::with_capacity(header.files.len());
        for mut part in header.files {
            let length = usize::try_from(part.bytes)
                .map_err(|_| Error::Contract("generation stage reclamation range"))?;
            let source_end = source_offset
                .checked_add(length)
                .filter(|end| *end <= bytes.len())
                .ok_or(Error::Contract("generation stage reclamation range"))?;
            if !is_stage(&part.name) {
                // Canonical archive sections are contiguous and sorted. Moving each kept
                // section toward the front cannot overwrite a later source section.
                bytes.copy_within(source_offset..source_end, destination_offset);
                part.offset = destination_offset as u64;
                files.push(part);
                destination_offset += length;
            }
            source_offset = source_end;
        }
        header.files = files;
        bytes.truncate(destination_offset);
        format::finish(bytes, header)
    }

    pub(in crate::room::log_generations) fn check_unpublished_stages_removed(
        &self,
        original: &Self,
    ) -> Result<()> {
        if self.identity.source != original.identity.source
            || self.identity.manifest != original.identity.manifest
        {
            return Err(Error::Contract("generation stage reclamation selected cut differs"));
        }
        let before = original.selected_files()?;
        if !before.keys().any(|name| is_stage(name)) {
            return Err(Error::Contract("generation backup has no unpublished stages"));
        }
        let kept = before.into_iter().filter(|(name, _)| !is_stage(name));
        if !kept.eq(self.selected_files()?) {
            return Err(Error::Contract("generation stage reclamation retained files differ"));
        }
        Ok(())
    }
}
