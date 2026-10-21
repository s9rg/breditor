//! Rehash the whole retained closure before changing the selected physical head or exporting it.
use super::{format, held_file, state::Generations};
use crate::{Error, Result};

impl Generations {
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
        let metadata = std::iter::once(&selected.root).chain(&selected.sealed);
        if self.closed.len() != selected.sealed.len() + 1 {
            return Err(Error::Contract("retained physical owner count differs"));
        }
        for (held, metadata) in self.closed.iter().zip(metadata) {
            if held.generation != metadata.generation
                || held.bytes != metadata.bytes
                || held_file::digest(&held.file, held.bytes)? != metadata.sha256
            {
                return Err(Error::Contract("retained physical log digest differs"));
            }
            held.stamp.guard(&held.file)?;
        }
        Ok(())
    }
}
