//! Complete a selected rotation and recheck the exact physical change before returning its cut.
use super::{
    OperationalLogGenerationServerRoom, inspect_pending_rotation::CommittedPendingRotationCapture,
};
use crate::{
    Error, Result, ServerLogGenerationParticipantInventory, ServerLogGenerationRoomBackup,
};

impl OperationalLogGenerationServerRoom {
    pub(crate) fn complete_pending_rotation(
        &mut self,
        original: &ServerLogGenerationRoomBackup,
        captured: &CommittedPendingRotationCapture,
        principal: &str,
    ) -> Result<(ServerLogGenerationRoomBackup, ServerLogGenerationParticipantInventory)> {
        let before = captured.backup.info()?.identity;
        let (room, assets) = self.components_mut();
        room.log.complete_inspected_pending_rotation(captured.rotation.evidence_sha256)?;
        let after = ServerLogGenerationRoomBackup::capture(room, assets, principal)?;
        let selected = after.info()?.identity;
        if selected.native.source != before.native.source
            || selected.native.manifest != captured.rotation.after_manifest
            || selected.assets != before.assets
        {
            return Err(Error::Contract("completed sealed rotation cut differs"));
        }
        if captured.rotation.head_published {
            if selected != before {
                return Err(Error::Contract("completed sealed rotation changed selected files"));
            }
        } else {
            after.check_archive_ancestor(&captured.backup)?;
            // Only the intended manifest and empty continuation can join the selected archive.
            if after.native().info().files != captured.backup.native().info().files + 2 {
                return Err(Error::Contract("completed sealed rotation added unselected files"));
            }
        }
        let participants = room.capture_generation_inventory_at(principal, selected.native)?;
        self.check_live_source(original, principal)?;
        Ok((after, participants))
    }
}
