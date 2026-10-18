//! One-way native shared history admission without changing causal operations or old factories.
use super::{RichReplica, SharedObservation, typing_history::TypingHistory};
use crate::Error;

impl RichReplica {
    /// Enable bounded native typing groups, retaining existing Undo/Redo as explicit units.
    /// This publication changes no content and requires the separate recovery family thereafter.
    /// # Errors
    /// Stale/read-only, replay, resource or publication exhaustion rejects atomically.
    pub fn enable_typing_history_guarded(
        &mut self,
        observation: &SharedObservation,
    ) -> Result<bool, Error> {
        self.check(observation)?;
        if self.typing.is_some() {
            return Ok(false);
        }
        self.require_writable()?;
        let mut candidate = self.staged()?;
        let (format, version) = candidate.history_family(true);
        candidate.journal.format = format.into();
        candidate.journal.version = version;
        candidate.typing = Some(TypingHistory { joins: vec![], continuation: None });
        self.adopt(candidate)?;
        Ok(true)
    }
}
