//! Rehash the whole retained closure before changing the selected physical head or exporting it.
use super::{format, held_file, manifest::ClosedFile, packed_wal::HeldWal, state::Generations};
use crate::{Error, Result};

impl Generations {
    pub(super) fn closed_wal(&self, name: &str) -> Option<(&HeldWal, &ClosedFile)> {
        let selected = &self.current().value;
        self.closed
            .iter()
            .zip(selected.closed_files().map(|(file, _)| file))
            .find(|(wal, _)| name == format::wal_name(&wal.generation))
            .map(|(wal, selected)| (wal.as_ref(), selected))
    }

    pub(super) fn verify_retained(&self) -> Result<()> {
        for manifest in &self.history {
            if held_file::read(&manifest.file, format::MAX_CONTROL)? != manifest.bytes
                || format::sha(&manifest.bytes) != manifest.hash
            {
                return Err(Error::Contract("retained physical manifest bytes differ"));
            }
            manifest.stamp.guard(&manifest.file)?;
        }
        let selected = &self.current().value;
        let metadata = selected.closed_files().map(|(file, _)| file);
        if self.closed.len() != selected.closed_count() {
            return Err(Error::Contract("retained physical owner count differs"));
        }
        for (held, metadata) in self.closed.iter().zip(metadata) {
            if held.generation != metadata.generation || held.bytes != metadata.bytes {
                return Err(Error::Contract("retained physical log digest differs"));
            }
            held.read(metadata.sha256, |reader| {
                std::io::copy(reader, &mut std::io::sink())?;
                Ok(())
            })?;
        }
        Ok(())
    }
}
