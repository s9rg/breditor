//! Exact native segmented recovery. It contains no saved current-access grant.
use super::{
    super::{ReviewError, ReviewSession},
    encode_segment::encode_active,
    record::{ARCHIVE_FORMAT, ArchiveRef, MAX_ARCHIVE_BYTES, generation_budget},
};

impl ReviewSession {
    /// Whether this actual owner selected independent comment generations.
    #[must_use]
    pub const fn has_segmented_history(&self) -> bool {
        self.generations.is_some()
    }

    /// Retain the exact original root, immutable seals and active native event suffix.
    /// Local Undo/Redo and all historical anchors remain native replay inputs.
    /// # Errors
    /// An original owner, invalid internal offset or any explicit archive/file budget rejects.
    pub fn segmented_checkpoint_json(&self) -> Result<String, ReviewError> {
        let state =
            self.generations.as_ref().ok_or(ReviewError::Contract("review history family"))?;
        generation_budget(state.sealed.len() + 2, self.events.len())?;
        let active = encode_active(self)?;
        let json = serde_json::to_string(&ArchiveRef {
            format: ARCHIVE_FORMAT,
            format_version: 1,
            root_generation: &state.root_generation,
            root: &state.root_json,
            sealed: state.sealed.iter().map(|file| file.json.as_ref()).collect(),
            active: &active,
        })?;
        if json.len() > MAX_ARCHIVE_BYTES {
            return Err(ReviewError::Limit("review history archive bytes"));
        }
        Ok(json)
    }
}
