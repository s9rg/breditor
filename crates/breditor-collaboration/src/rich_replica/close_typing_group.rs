//! History-only native intent fence; no content edit, causal operation or history record.
use super::{RichReplica, SharedObservation};
use crate::Error;
impl RichReplica {
    /// Close active native typing continuation, fencing old intents without clearing Redo.
    /// Disabled or inactive continuation is a true no-op; host read-only does not forbid a fence.
    /// # Errors
    /// Stale observations, replay/resource admission or revision exhaustion preserve the owner.
    pub fn close_typing_group_guarded(
        &mut self,
        observation: &SharedObservation,
    ) -> Result<bool, Error> {
        self.check(observation)?;
        if self.typing.as_ref().is_none_or(|history| history.continuation.is_none()) {
            return Ok(false);
        }
        let candidate = self.staged()?;
        self.adopt(candidate)?;
        Ok(true)
    }
}
