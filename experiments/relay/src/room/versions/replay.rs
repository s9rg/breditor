//! Reconstruct catalog authorization, source cuts and receipts in original durable document order.
use super::{Room, prepare::Preparation};
use crate::{Error, Result, log::Event};
impl Room {
    pub(in crate::room) fn replay_document_versions(
        &mut self,
        sequence: u64,
        event: Event,
    ) -> Result<()> {
        match event {
            Event::EnableDocumentVersionsV1 { actor, binding } => {
                if actor != self.owner || self.versions.is_some() {
                    return Err(Error::Contract("version catalog activation lineage"));
                }
                self.versions = Some(Self::new_versions_state(&binding, sequence)?);
            }
            Event::PublishDocumentVersionV1 { principal, packet } => {
                let Preparation::New(version) =
                    self.prepare_document_version(&principal, &packet)?
                else {
                    return Err(Error::Contract("durable version did not prepare"));
                };
                self.remember_document_version(sequence, version, packet)?;
            }
            _ => return Err(Error::Contract("unexpected version catalog replay record")),
        }
        Ok(())
    }
}
