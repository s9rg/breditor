//! Immutable packet admission: prepare -> append/fsync -> catalog publication -> durable receipt.
use super::{
    DocumentVersionAdmission, DocumentVersionCatalogEntry, DurableDocumentVersion, Room,
    StoredVersion, prepare::Preparation,
};
use crate::{Error, Result, log::Event};
use breditor_collab_feasibility::rich_replica::DocumentVersionInfo;

impl Room {
    pub(super) fn remember_document_version(
        &mut self,
        sequence: u64,
        version: DocumentVersionInfo,
        packet: String,
    ) -> Result<DocumentVersionCatalogEntry> {
        let state = self.versions.as_mut().ok_or(Error::NeedsRecovery)?;
        let entry = DocumentVersionCatalogEntry { sequence: sequence.to_string(), version };
        let id = entry.version.id.clone();
        state.bytes += packet.len();
        state.order.insert(sequence, id.clone());
        state.entries.insert(id, StoredVersion { entry: entry.clone(), packet });
        Ok(entry)
    }
    /// Publish an authenticated editor's named snapshot, never its arbitrary imported content claim.
    /// Missing document dependencies are not accepted. Exact retries retain the original packet and
    /// acceptance sequence, even after restart or different outer JSON whitespace.
    /// # Errors
    /// Rejects denied authors, forged attribution/source content/cuts, bounds and uncertain storage.
    pub fn publish_document_version(
        &mut self,
        principal: &str,
        packet: &str,
    ) -> Result<DocumentVersionAdmission> {
        match self.prepare_document_version(principal, packet)? {
            Preparation::Pending(missing) => Ok(DocumentVersionAdmission::Pending { missing }),
            Preparation::Duplicate(id) => {
                let entry = self
                    .versions_state()?
                    .entries
                    .get(&id)
                    .ok_or(Error::NeedsRecovery)?
                    .entry
                    .clone();
                Ok(DocumentVersionAdmission::Durable(DurableDocumentVersion {
                    descriptor: self.document_versions_descriptor(principal)?,
                    entry,
                    duplicate: true,
                }))
            }
            Preparation::New(version) => {
                let descriptor = self.document_versions_descriptor(principal)?;
                let sequence = self.log.append(Event::PublishDocumentVersionV1 {
                    principal: principal.into(),
                    packet: packet.into(),
                })?;
                let entry = self.remember_document_version(sequence, version, packet.into());
                match entry {
                    Ok(entry) => Ok(DocumentVersionAdmission::Durable(DurableDocumentVersion {
                        descriptor,
                        entry,
                        duplicate: false,
                    })),
                    Err(error) => {
                        self.log.invalidate();
                        Err(error)
                    }
                }
            }
        }
    }
}
