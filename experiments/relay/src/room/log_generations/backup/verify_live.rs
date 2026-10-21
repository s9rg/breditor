//! Actual owner/source checks. A stale selection refuses without poisoning a valid newer room.
use super::ServerLogGenerationBackup;
use crate::{Error, Result, Room};
impl ServerLogGenerationBackup {
    /// Compare this complete archive with an actual current native room and its held files.
    /// Uses bounded streaming reads rather than a second complete archive buffer. Requires the
    /// host to authenticate the owner first. Changes no history, permissions, lease or provider.
    /// # Errors
    /// Original storage, non-owner access, stale/foreign selection or uncertain storage refuses.
    /// Detected actual storage uncertainty fences the owner until explicit cold recovery.
    pub fn check_live(&self, room: &mut Room, principal: &str) -> Result<()> {
        self.check_owner(room, principal, false)
    }
    pub(in crate::room) fn check_retained(&self, room: &mut Room, principal: &str) -> Result<()> {
        self.check_owner(room, principal, true)
    }
    fn check_owner(&self, room: &mut Room, principal: &str, retained: bool) -> Result<()> {
        room.recovery_inventory_owner(principal)?;
        let physical = room.log.generation_descriptor()?;
        let expected = &self.identity.source;
        let current = physical
            .next_sequence
            .parse::<u64>()
            .map_err(|_| Error::Contract("archive live global cut"))?;
        if room.native_identity_at(expected.records, expected.terminal_log_digest) != *expected
            || if retained {
                current < expected.records
            } else {
                current != expected.records
                    || physical.terminal_digest != expected.terminal_log_digest
                    || physical.manifest != self.identity.manifest
            }
        {
            return Err(Error::Contract("archive selection differs from actual native owner"));
        }
        if !room.log.verify_generation_archive(
            &self.selected_files()?,
            self.identity.manifest,
            retained,
        )? {
            return Err(Error::Contract("selected archive files differ from native source"));
        }
        Ok(())
    }
}
