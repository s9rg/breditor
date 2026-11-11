//! Actual live generation source capability, separate from inactive recovery hosts.
use super::Host;
mod capture;
pub(in crate::server) mod durable;
mod handover;
mod prepare;
mod storage_capacity;
pub use durable::{
    LogGenerationHandoverStatus, PreparedLogGenerationHandover,
    PreparedLogGenerationHandoverIdentity,
};
pub use handover::SealedLogGenerationHandover;
pub use prepare::router_with_log_generation_backups_and_deployment_lease;

/// Host-only capture and fencing for the exact generation room actually served.
/// No archived identity, inactive prepared snapshot or account DTO constructs it.
/// This constructor does not approve recovered-room participant/provider closure.
/// Clones retain the actual native/raster owner and current deployment authority.
#[derive(Clone)]
pub struct LogGenerationServerBackupHandle {
    host: Host,
}

#[cfg(test)]
mod tests;
