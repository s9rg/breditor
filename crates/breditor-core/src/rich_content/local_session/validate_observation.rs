//! Read-only preflight for queued work before expensive payload/planning steps.

use super::{RichLocalSession, RichLocalSessionError, RichLocalSnapshot};

impl RichLocalSession {
    /// Check that an observation still belongs to this exact owner publication.
    ///
    /// This neither publishes nor rotates authority. Dispatch still performs its
    /// own final guard check; a successful preflight is not a reusable permit.
    ///
    /// # Errors
    /// Rejects stale or foreign observations, even for semantically equal content.
    pub fn validate_observation(
        &self,
        observation: &RichLocalSnapshot,
    ) -> Result<(), RichLocalSessionError> {
        self.check(observation)
    }
}
