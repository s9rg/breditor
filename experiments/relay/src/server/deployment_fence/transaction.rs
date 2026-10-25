//! Serving admission covers native work and actual fsync, not a preflight read.
use super::RoomDeploymentLease;
use crate::{Error, Result};
fn admission(error: Error) -> Error {
    match error {
        Error::Contract(_) | Error::Json(_) => Error::NeedsRecovery,
        other => other,
    }
}
pub(in crate::server) fn transaction<T>(
    lease: Option<&RoomDeploymentLease>,
    work: impl FnOnce() -> Result<T>,
) -> Result<T> {
    let Some(lease) = lease else {
        return work();
    };
    let mut held = lease.serving().map_err(admission)?;
    let result = work();
    // Actual native/provider work may have changed the namespace after initial
    // admission. Verify before releasing custody; uncertainty is not success
    // and must not erase work which was already appended durably.
    let current = lease.check_held(&mut held).map_err(admission);
    let released = held.finish().map_err(admission);
    match result {
        Err(error) => Err(error),
        Ok(value) => {
            current?;
            released?;
            lease.live()?;
            Ok(value)
        }
    }
}
