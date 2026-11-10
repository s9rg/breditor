//! Local preparation from a serving host retained by the HTTP activation control.
use super::DurableNativeActivationControl;
use crate::{Result, ServerLogGenerationRoomBackupIdentity, server::PreparedLogGenerationHandover};
use std::path::Path;

impl DurableNativeActivationControl {
    /// Prepare an exact next source cut from the actual committed host. This
    /// trusted host operation requires native owner credentials and an absent
    /// private intent directory. It keeps the current service available.
    /// Retain the returned identity independently before sealing.
    ///
    /// # Errors
    /// Uncommitted, uncertain or closed control, wrong credentials, stale
    /// epoch or source, unavailable custody or an occupied directory refuse.
    pub async fn prepare_next_handover(
        &self,
        principal: &str,
        token: &str,
        root: &Path,
        expected: ServerLogGenerationRoomBackupIdentity,
    ) -> Result<PreparedLogGenerationHandover> {
        self.active_for_handover()?.prepare_next_handover(principal, token, root, expected).await
    }
}
