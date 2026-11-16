//! Rotate a serving continued room's native WAL under its current deployment permit.
use super::ContinuedAssetServerHandle;
use crate::{Error, Result, ServerLogGenerationReceipt, server::deployment_fence};

impl ContinuedAssetServerHandle {
    /// Seal the active native file and continue at the same absolute event and history cut.
    /// Execute off asynchronous I/O workers.
    ///
    /// # Errors
    /// Refuses a stale lease, non-owner credentials, uncertain custody or invalid rotation.
    pub fn rotate_log_generation(
        &self,
        principal: &str,
        token: &str,
        next: &str,
    ) -> Result<ServerLogGenerationReceipt> {
        let host = &self.host;
        host.authentication.authenticate(principal, token)?;
        host.deployment.fenced(|lease| {
            deployment_fence::transaction(Some(lease), || {
                let mut room = host.room.lock().map_err(|_| Error::NeedsRecovery)?;
                room.recovery_inventory_owner(principal)?;
                if let Some(custody) = &host.continued_custody {
                    custody.check(&room)?;
                }
                let rasters = host
                    .continued_assets
                    .as_ref()
                    .ok_or(Error::NeedsRecovery)?
                    .lock()
                    .map_err(|_| Error::NeedsRecovery)?;
                rasters.guard()?;
                let receipt = room.rotate_log_generation(principal, next)?;
                if let Some(custody) = &host.continued_custody {
                    custody.check(&room)?;
                }
                rasters.guard()?;
                Ok(receipt)
            })
        })
    }
}
