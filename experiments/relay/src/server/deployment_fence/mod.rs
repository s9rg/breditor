//! Separate host-owned serving epochs. No archive, receipt or editor token can
//! construct a lease; room recovery/reconciliation remains a separate decision.
mod activate_durable_generation;
pub(super) use activate_durable_generation::activate_durable_native_generation;
mod activate_generation;
pub(super) use activate_generation::activate_native_generation;
mod authority;
mod checkpoint_epoch;
mod claim;
mod close;
mod create;
mod handover_epoch;
mod identity;
mod journal;
mod lease;
mod location;
mod observation;
mod open;
mod open_selected;
mod permit;
mod portable_activation;
mod portable_seal;
mod read;
mod seal;
mod seal_generation;
mod seal_prepared_generation;
mod segment_handover;
pub(super) use segment_handover::{commit_segment_handover, resume_segment_handover};
mod serving;
mod slot;
mod state;
#[cfg(all(test, unix))]
mod tests;
#[cfg(all(test, unix))]
pub(in crate::server) use tests::network::Network as TestNetwork;
mod transaction;
pub use authority::RoomDeploymentAuthority;
pub(super) use handover_epoch::{
    handover_selection, prepared_decision_status, prepared_handover_status,
};
pub use identity::{RoomDeploymentIdentity, RoomDeploymentSelection};
pub use lease::RoomDeploymentLease;
pub(super) use portable_activation::activate_portable_segment;
pub(super) use portable_seal::seal_portable_segment;
pub(super) use seal::seal;
pub(super) use seal_generation::seal_log_generation;
pub(super) use seal_prepared_generation::{
    seal_prepared, seal_prepared_for_lease, seal_prepared_source,
};
pub(super) use serving::attach_host;
pub(super) use serving::prepare_host;
pub use serving::{router_with_assets_and_deployment_lease, router_with_deployment_lease};
pub(super) use slot::HostDeployment;
pub(super) use transaction::transaction;
