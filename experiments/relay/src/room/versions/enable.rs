//! Explicit owner-controlled activation; no existing room or comment capability changes meaning.
use super::{DocumentVersionsDescriptor, Room, VersionsState};
use crate::{Error, Result, credentials, log::Event};
use std::collections::BTreeMap;

impl Room {
    /// Enable a shared immutable catalog once, independently of comments or writer transports.
    /// # Errors
    /// Rejects non-owner calls, uncertain storage and failed durable creation without publication.
    pub fn enable_document_versions(
        &mut self,
        principal: &str,
    ) -> Result<DocumentVersionsDescriptor> {
        self.reader(principal)?;
        if principal != self.owner {
            return Err(Error::Permission);
        }
        if self.versions.is_none() {
            let binding = credentials::issue()?;
            let mut state = Self::new_versions_state(&binding, 0)?;
            state.enabled_at = self
                .log
                .append(Event::EnableDocumentVersionsV1 { actor: principal.into(), binding })?;
            self.versions = Some(state);
        }
        self.document_versions_descriptor(principal)
    }
    pub(super) fn new_versions_state(binding: &str, enabled_at: u64) -> Result<VersionsState> {
        credentials::hash(binding)?;
        Ok(VersionsState {
            binding: binding.into(),
            enabled_at,
            bytes: 0,
            entries: BTreeMap::new(),
            order: BTreeMap::new(),
        })
    }
    /// Read the explicitly enabled catalog identity under current document-read permission.
    /// # Errors
    /// Rejects denied readers, disabled catalogs and unavailable durable storage.
    pub fn document_versions_descriptor(
        &self,
        principal: &str,
    ) -> Result<DocumentVersionsDescriptor> {
        self.reader(principal)?;
        Ok(DocumentVersionsDescriptor {
            format: "breditor/relay-document-versions",
            format_version: 1,
            document: self.replica.document_id().into(),
            binding: self.versions_state()?.binding.clone(),
        })
    }
    /// Current catalog publication right; never use a recovered or payload role as authorization.
    /// # Errors
    /// Rejects missing read permission, disabled catalogs and unavailable storage.
    pub fn document_versions_can_publish(&self, principal: &str) -> Result<bool> {
        self.document_versions_descriptor(principal)?;
        match self.editor(principal) {
            Ok(()) => Ok(true),
            Err(Error::Permission) => Ok(false),
            Err(error) => Err(error),
        }
    }
}
