//! Explicit atom-lineage V2 transport uses the same validated retained storage factory.
use crate::{AtomicTransportProfile, Result, Room, ServerLogGenerationOptions};
use std::path::Path;
impl Room {
    /// Create the explicit Unix generation layout with atom-lineage writer transport V2.
    /// # Errors
    /// Wrong compiler/source/owner/IDs, occupied destinations, native or storage failures refuse.
    pub fn create_atomic_log_generations_v2(
        path: &Path,
        configuration: &str,
        document: &str,
        owner: &str,
        profile: AtomicTransportProfile,
        options: &ServerLogGenerationOptions,
    ) -> Result<Self> {
        Self::create_generation_room(path, configuration, document, owner, profile, options, true)
    }
}
