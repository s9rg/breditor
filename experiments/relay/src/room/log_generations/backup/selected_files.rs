//! Borrowed exact sections for the native recovery coordinator; no raw-log public import.
use super::{ServerLogGenerationBackup, format};
use crate::{Error, Result};
use std::collections::BTreeMap;
impl ServerLogGenerationBackup {
    pub(in crate::room::log_generations) fn selected_files(&self) -> Result<BTreeMap<&str, &[u8]>> {
        let at = format::MAGIC.len();
        let size = usize::try_from(u32::from_be_bytes(
            self.bytes[at..at + 4]
                .try_into()
                .map_err(|_| Error::Contract("generation backup selected header"))?,
        ))
        .map_err(|_| Error::Contract("generation backup selected header"))?;
        let body = self
            .bytes
            .get(format::PREFIX + size..)
            .ok_or(Error::Contract("generation backup selected body"))?;
        self.header
            .files
            .iter()
            .map(|part| {
                let start = usize::try_from(part.offset)
                    .map_err(|_| Error::Contract("generation backup selected range"))?;
                let end = usize::try_from(
                    part.offset
                        .checked_add(part.bytes)
                        .ok_or(Error::Contract("generation backup selected range"))?,
                )
                .map_err(|_| Error::Contract("generation backup selected range"))?;
                Ok((
                    part.name.as_str(),
                    body.get(start..end)
                        .ok_or(Error::Contract("generation backup selected range"))?,
                ))
            })
            .collect()
    }
}
