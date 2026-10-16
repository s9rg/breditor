//! Explicit ephemeral document channel. Original room seeds, logs and presence bytes stay unchanged.
use super::Room;
use crate::{Error, Lease, PresencePeer, Result};
use breditor_collab_feasibility::rich_replica::DocumentPresenceResolution;
impl Room {
    /// Publish only a separately selected document-presence packet for the active authenticated lease.
    /// No presence data is durably logged or imported as document updates.
    /// # Errors
    /// Wrong lease/origin, room transport, packet family/binding, sequence or budgets reject.
    pub fn publish_document_presence(
        &mut self,
        principal: &str,
        lease: &Lease,
        sequence: &str,
        frame: &str,
    ) -> Result<bool> {
        self.validate_lease(principal, lease)?;
        if !self.atomic_transport_v2 {
            return Err(Error::Contract("document presence requires explicit transport V2"));
        }
        let resolved = self.replica.resolve_document_presence_frame(frame)?;
        let writer = match resolved {
            DocumentPresenceResolution::Resolved { writer, .. }
            | DocumentPresenceResolution::Pending { writer }
            | DocumentPresenceResolution::Cleared { writer, .. } => writer,
        };
        if writer != lease.writer {
            return Err(Error::Lease);
        }
        self.presence.publish_document(
            PresencePeer {
                writer,
                session: crate::presence::session(&lease.token),
                label: principal.into(),
                sequence: sequence.into(),
                frame: frame.into(),
            },
            std::time::Instant::now(),
        )
    }
    /// Read only current document-channel peers. Original consumers never receive these new packets.
    /// # Errors
    /// Missing read permission, replaced lease, wrong transport or uncertain storage rejects.
    pub fn document_presence_snapshot(
        &mut self,
        principal: &str,
        lease: Option<&Lease>,
    ) -> Result<Vec<PresencePeer>> {
        self.reader(principal)?;
        if let Some(lease) = lease {
            self.validate_lease(principal, lease)?;
        }
        if !self.atomic_transport_v2 {
            return Err(Error::Contract("document presence requires explicit transport V2"));
        }
        Ok(self.presence.snapshot_document(std::time::Instant::now()))
    }
}
