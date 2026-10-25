//! Actual authority-file ownership. Semantic operations live in their own modules.
use super::{identity::RoomDeploymentIdentity, state::State};
use std::{fs::OpenOptions, sync::Arc};
/// Host-owned append-only serving authority. Provision its namespace separately
/// from room backups; every participating serving host must select it explicitly.
/// It is not client authentication or a complete recovery activation decision.
#[derive(Clone)]
pub struct RoomDeploymentAuthority {
    pub(super) state: Arc<State>,
}
pub(super) fn options() -> OpenOptions {
    let mut options = OpenOptions::new();
    options.read(true).write(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    options
}
impl RoomDeploymentAuthority {
    /// Detached namespace identity. It grants no serving permission.
    #[must_use]
    pub fn identity(&self) -> RoomDeploymentIdentity {
        self.state.identity.clone()
    }
}
