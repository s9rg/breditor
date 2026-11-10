//! Local source sealing from a serving host retained by the HTTP activation control.
use super::DurableNativeActivationControl;
use crate::{
    Result,
    server::{PreparedLogGenerationHandover, PreparedLogGenerationHandoverIdentity},
};
use std::sync::Arc;

impl DurableNativeActivationControl {
    /// Seal an independently retained next source choice with fresh native owner
    /// authentication. A successful seal fences this service's old epoch.
    /// Closing the control prevents new admissions. An already admitted worker
    /// can finish, so retain the actual intent to inspect uncertain completion.
    ///
    /// # Errors
    /// Uncommitted, uncertain or closed control, wrong credentials or choice,
    /// stale epoch or source, unavailable custody or storage uncertainty refuse.
    pub async fn seal_next_handover(
        &self,
        principal: &str,
        token: &str,
        prepared: &Arc<PreparedLogGenerationHandover>,
        expected: &PreparedLogGenerationHandoverIdentity,
    ) -> Result<()> {
        self.active_for_handover()?.seal_next_handover(principal, token, prepared, expected).await
    }
}
