//! Owner-selected physical rotation without a semantic event or history reset.
use crate::{Error, Result, Room, ServerLogGenerationReceipt};
impl Room {
    #[cfg(all(feature = "server", test))]
    pub(crate) fn interrupt_log_rotation_for_test(
        &mut self,
        point: crate::log::generations::RotationPoint,
    ) -> Result<()> {
        self.log.interrupt_rotation_for_test(point)
    }

    /// Seal a nonempty active file, retaining all original events and global receipt positions.
    /// No native operation/counter/history is reset. Exact retries return the original boundary;
    /// automatic full-file seals use this same protocol.
    /// # Errors
    /// Non-owner access, original storage, empty/reused IDs, retained limits or I/O refuse.
    /// An uncertain write fences all room reads/writes until exact native recovery succeeds.
    pub fn rotate_log_generation(
        &mut self,
        principal: &str,
        next: &str,
    ) -> Result<ServerLogGenerationReceipt> {
        self.reader(principal)?;
        if principal != self.owner {
            return Err(Error::Permission);
        }
        self.log.rotate_generations(next)
    }
}
