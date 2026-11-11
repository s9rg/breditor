//! Apply a verified suffix repair while retaining the same operational custody.
use super::OperationalLogGenerationServerRoom;
use crate::{Result, ServerLogGenerationRoomBackup};

impl OperationalLogGenerationServerRoom {
    pub(crate) fn complete_inspected_native_prefix(
        &mut self,
        original: &ServerLogGenerationRoomBackup,
        captured: &ServerLogGenerationRoomBackup,
        principal: &str,
        suffix_bytes: u64,
    ) -> Result<()> {
        self.check_live_source(original, principal)?;
        let (room, assets) = self.components_mut();
        room.log.complete_inspected_generation_prefix(suffix_bytes)?;
        captured.check_live(room, assets, principal)?;
        self.check_live_source(original, principal)
    }
}
