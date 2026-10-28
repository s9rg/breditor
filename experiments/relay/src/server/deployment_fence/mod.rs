//! Separate host-owned serving epochs. No archive, receipt or editor token can
//! construct a lease; room recovery/reconciliation remains a separate decision.
mod authority;
mod claim;
mod close;
mod create;
mod identity;
mod journal;
mod lease;
mod location;
mod open;
mod permit;
mod read;
mod seal;
mod serving;
mod state;
#[cfg(all(test, unix))]
mod tests;
mod transaction;
pub use authority::RoomDeploymentAuthority;
pub use identity::{RoomDeploymentIdentity, RoomDeploymentSelection};
pub use lease::RoomDeploymentLease;
pub(super) use seal::seal;
pub(super) use serving::prepare_host;
pub use serving::{router_with_assets_and_deployment_lease, router_with_deployment_lease};
pub(super) use transaction::transaction;
