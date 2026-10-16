//! Explicitly enable native natural history without reinterpreting existing entries.

use super::{
    RichLocalSession, RichLocalSessionError, RichLocalSnapshot, typing_history::TypingHistory,
};

impl RichLocalSession {
    /// Enable native natural history without merging existing retained entries.
    ///
    /// Existing explicit methods keep creating isolated groups. Only the named
    /// user-typing methods may extend a burst. Enabling is a guarded publication;
    /// repeating it is a no-op. The mode is immutable for this owner's lifetime.
    /// Persist it with `RichTypingSessionJsonCodec`, not the original local codec.
    /// # Errors
    /// Rejects stale observations, read-only policy or revision exhaustion atomically.
    pub fn enable_typing_history(
        &mut self,
        snapshot: &RichLocalSnapshot,
    ) -> Result<bool, RichLocalSessionError> {
        self.check(snapshot)?;
        if self.typing_history.is_some() {
            return Ok(false);
        }
        self.require_writable()?;
        let mut state = self.state.clone();
        state.revision = state.revision.successor()?;
        self.typing_history =
            Some(TypingHistory { groups: vec![1; self.entries.len()], continuation: None });
        self.publish(state);
        Ok(true)
    }
}
