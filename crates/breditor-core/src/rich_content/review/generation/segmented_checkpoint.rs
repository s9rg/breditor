//! Exact native segmented recovery. It contains no saved current-access grant.
use super::{
    super::{ReviewError, ReviewSession},
    encode_segment::encode_active,
    record::{
        ARCHIVE_FORMAT, ArchiveRef, CONTINUED_MAX_ARCHIVE_BYTES, MAX_ARCHIVE_BYTES, check_budget,
    },
};

impl ReviewSession {
    /// Whether this actual owner selected independent comment generations.
    #[must_use]
    pub const fn has_segmented_history(&self) -> bool {
        self.generations.is_some()
    }

    /// Whether the selected comment archive has crossed its V1 continuation boundary.
    #[must_use]
    pub fn has_continued_history(&self) -> bool {
        self.generations.as_ref().is_some_and(|state| state.continued_after.is_some())
    }

    /// Retain the exact original root, immutable seals and active native event suffix.
    /// Local Undo/Redo and all historical anchors remain native replay inputs.
    /// # Errors
    /// An original owner, invalid internal offset or any explicit archive/file budget rejects.
    pub fn segmented_checkpoint_json(&self) -> Result<String, ReviewError> {
        self.generation_checkpoint_json(false)
    }

    /// Serialize the continued comment archive, including its exact V1 file boundary.
    /// # Errors
    /// Another review family or a native archive limit rejects.
    pub fn continued_checkpoint_json(&self) -> Result<String, ReviewError> {
        self.generation_checkpoint_json(true)
    }

    fn generation_checkpoint_json(&self, continued: bool) -> Result<String, ReviewError> {
        let state =
            self.generations.as_ref().ok_or(ReviewError::Contract("review history family"))?;
        if state.continued_after.is_some() != continued {
            return Err(ReviewError::Contract("review history family"));
        }
        check_budget(state.sealed.len() + 2, self.events.len(), continued)?;
        let active = encode_active(self)?;
        let json = serde_json::to_string(&ArchiveRef {
            format: ARCHIVE_FORMAT,
            format_version: if continued { 2 } else { 1 },
            root_generation: &state.root_generation,
            root: &state.root_json,
            sealed: state.sealed.iter().map(|file| file.json.as_ref()).collect(),
            active: &active,
            continued_after: state.continued_after,
        })?;
        let limit = if continued { CONTINUED_MAX_ARCHIVE_BYTES } else { MAX_ARCHIVE_BYTES };
        if json.len() > limit {
            return Err(ReviewError::Limit("review history archive bytes"));
        }
        Ok(json)
    }
}
