//! Read-only document-server projections. No method here appends, mutates history or leaks leases.
use super::Room;
use crate::{Result, Role};
use serde::Serialize;

/// Canonical accepted document state for an authenticated reader.
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DocumentSnapshot {
    /// Immutable document identity.
    pub document_id: String,
    /// Canonical admitted Document V2 JSON text of the accepted room state.
    pub document: String,
    /// Exact canonical causal version. Supply it as an injection `baseRevision`.
    pub revision: String,
    /// Room-bound writer transport contract (1 or 2).
    pub writer_transport_version: u32,
}

impl Room {
    /// Read the accepted canonical document and its causal revision under current read permission.
    /// # Errors
    /// Rejects missing read permission or uncertain storage.
    pub fn document_snapshot(&self, principal: &str) -> Result<DocumentSnapshot> {
        self.reader(principal)?;
        Ok(DocumentSnapshot {
            document_id: self.replica.document_id().into(),
            document: self.replica.document_json().into(),
            revision: self.replica.causal_version(),
            writer_transport_version: self.writer_transport_version(),
        })
    }
    /// Current account relation to this room: `owner`, `editor`, `reader` or none.
    #[must_use]
    pub fn account_role(&self, principal: &str) -> Option<&'static str> {
        if principal == self.owner {
            Some("owner")
        } else {
            match self.roles.get(principal) {
                Some(Role::Editor) => Some("editor"),
                Some(Role::Reader) => Some("reader"),
                None => None,
            }
        }
    }
}

#[cfg(feature = "server")]
impl Room {
    pub(crate) fn document_revision(&self) -> Result<String> {
        self.log.ready()?;
        Ok(self.replica.causal_version())
    }
    pub(crate) fn shared_profile(
        &self,
    ) -> &breditor_collab_feasibility::rich_replica::SharedRichProfile {
        &self.profile
    }
    pub(crate) fn shared_document_id(&self) -> &str {
        self.replica.document_id()
    }
    pub(crate) fn is_owner(&self, principal: &str) -> Result<bool> {
        self.log.ready()?;
        Ok(principal == self.owner)
    }
    pub(crate) fn require_editor(&self, principal: &str) -> Result<()> {
        self.editor(principal)
    }
}
