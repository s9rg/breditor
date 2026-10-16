//! Explicit user-intent boundary without an edit, redo discard or empty Undo entry.

use super::{RichLocalSession, RichLocalSessionError, RichLocalSnapshot};

impl RichLocalSession {
    /// End an active typing burst, for example on blur, pointer movement or a command.
    ///
    /// An effective boundary advances publication and its opaque observation so
    /// previously queued input cannot cross it. No active burst is a true no-op.
    /// # Errors
    /// Rejects stale observations or publication exhaustion before changing state.
    pub fn close_typing_group(
        &mut self,
        snapshot: &RichLocalSnapshot,
    ) -> Result<bool, RichLocalSessionError> {
        self.check(snapshot)?;
        if self.typing_history.as_ref().is_none_or(|history| history.continuation.is_none()) {
            return Ok(false);
        }
        let mut state = self.state.clone();
        state.revision = state.revision.successor()?;
        self.publish(state);
        Ok(true)
    }
}
