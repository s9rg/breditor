//! Complete actual held source capture surrounds native metadata; no old-reader fallback.
use super::{ServerLogGenerationParticipantInventory, ServerLogGenerationParticipantMetadata};
use crate::{Error, Result, Room};
impl Room {
    /// Capture every native account, author and registered document/review stream at an exact
    /// complete physical archive cut, including observers and revoked accounts. No history,
    /// permissions, active lease, receipt, source file or provider is changed.
    /// The host authenticates the owner first. Two serialized captures check the same whole
    /// archive before and after metadata; their large buffers are never retained together.
    /// # Errors
    /// Non-owner calls, original storage, changed/uncertain sources and complete bounds refuse.
    pub fn log_generation_participant_inventory(
        &mut self,
        principal: &str,
    ) -> Result<ServerLogGenerationParticipantInventory> {
        self.recovery_inventory_owner(principal)?;
        let source = self.export_log_generation_backup(principal)?.info().identity;
        let native = self.capture_participant_inventory_at(principal, source.source.clone())?;
        let metadata = ServerLogGenerationParticipantMetadata {
            format: "breditor/server-log-generation-participants".into(),
            format_version: 1,
            source: source.clone(),
            native: native.metadata(),
        };
        if self.export_log_generation_backup(principal)?.info().identity != source {
            return Err(Error::Contract("generation participant source changed"));
        }
        ServerLogGenerationParticipantInventory::encode(&metadata)
    }
}
impl ServerLogGenerationParticipantInventory {
    /// Recheck actual selected native registrations, grants, prefixes and entire physical source.
    /// Serialized metadata and valid checksums alone never qualify a recovered room.
    /// # Errors
    /// Non-owner access, changed/uncertain storage, omissions or divergent native state refuse.
    pub fn verify_native(&self, room: &mut Room, authenticated_owner: &str) -> Result<()> {
        let actual = room.log_generation_participant_inventory(authenticated_owner)?;
        if actual.identity() != self.identity() || actual.to_json() != self.to_json() {
            return Err(Error::Contract("generation participants differ from native source"));
        }
        Ok(())
    }
}
