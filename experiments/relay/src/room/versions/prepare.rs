//! Native historical content proof plus authenticated author and durable semantic-group cuts.
use super::{MAX_CATALOG_BYTES, MAX_PACKET_BYTES, MAX_VERSIONS, Room};
use crate::{Error, Result};
use breditor_collab_feasibility::rich_replica::{
    DocumentVersionInfo, DocumentVersionSource, WriterDependency,
};

pub(super) enum Preparation {
    Duplicate(String),
    Pending(Vec<WriterDependency>),
    New(DocumentVersionInfo),
}
impl Room {
    pub(super) fn prepare_document_version(
        &self,
        principal: &str,
        packet: &str,
    ) -> Result<Preparation> {
        self.editor(principal)?;
        let state = self.versions_state()?;
        if packet.len() > MAX_PACKET_BYTES {
            return Err(Error::Contract("version packet byte budget"));
        }
        let info = self.replica.read_document_version(packet)?;
        if info.author.as_str() != principal {
            return Err(Error::Permission);
        }
        if state.entries.contains_key(&info.id) {
            return Ok(Preparation::Duplicate(info.id));
        }
        if state.entries.len() >= MAX_VERSIONS
            || packet.len() > MAX_CATALOG_BYTES.saturating_sub(state.bytes)
        {
            return Err(Error::Contract("version catalog budget"));
        }
        match self.replica.verify_document_version_source(packet)? {
            DocumentVersionSource::Pending { missing, .. } => {
                for clock in &missing {
                    self.check_version_writer(&clock.writer)?;
                }
                Ok(Preparation::Pending(missing))
            }
            DocumentVersionSource::Verified { version, clocks } => {
                self.check_version_cuts(&clocks)?;
                Ok(Preparation::New(version))
            }
        }
    }
    fn check_version_writer(&self, writer: &str) -> Result<()> {
        if writer != "1" && self.writers.get(writer).is_none_or(|author| author.observer) {
            return Err(Error::Contract("version source has no registered document author"));
        }
        Ok(())
    }
    fn check_version_cuts(&self, clocks: &[WriterDependency]) -> Result<()> {
        if !clocks.iter().any(|clock| clock.writer == "1") {
            return Err(Error::Contract("version source omits genesis"));
        }
        for clock in clocks {
            self.check_version_writer(&clock.writer)?;
            if clock.writer == "1" && clock.counter == self.seed_writer_through {
                continue;
            }
            if !self.receipts.values().any(|accepted| {
                accepted.receipt.writer == clock.writer && accepted.receipt.through == clock.counter
            }) {
                return Err(Error::Contract("version source cuts an unaccepted semantic group"));
            }
        }
        Ok(())
    }
}
