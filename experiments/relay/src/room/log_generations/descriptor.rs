//! Detached inspection of held physical custody, not a lease, archive or activation capability.
use crate::{Result, Room, ServerLogGenerationDescriptor};
impl Room {
    /// Read the actual held physical head and original global cut after current read permission.
    /// This detached value is not a backup, active writer lease or activation capability.
    /// # Errors
    /// Missing current permission, original storage, changed/uncertain storage or I/O refuses.
    pub fn log_generation_descriptor(
        &self,
        principal: &str,
    ) -> Result<ServerLogGenerationDescriptor> {
        self.reader(principal)?;
        self.log.generation_descriptor()
    }
}
