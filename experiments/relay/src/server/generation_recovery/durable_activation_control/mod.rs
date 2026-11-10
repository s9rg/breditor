//! Explicit operator transport for an already durable native activation choice.
mod commit;
mod prepare;
mod prepare_next_handover;
mod publication;
mod routes;
mod seal_next_handover;
mod state;

pub use prepare::prepare_durable_native_activation_control;
pub use publication::{
    NativeRoomPublication, NativeRoomPublicationBinding, NativeRoomPublicationIdentity,
    NativeRoomPublicationReceipt, NativeRoomPublicationRequest, prepare_native_room_publication,
};
pub use state::DurableNativeActivationControl;

#[cfg(test)]
pub(super) use publication::{
    publication_block_for_test, publication_closed_for_test, publication_observation_for_test,
    publication_request_for_test,
};

use super::ServerLogGenerationRecoveryStateIdentity;
use crate::server::RoomDeploymentSelection;
use serde::{Deserialize, Serialize};

/// Independently retained control instance and exact durable checkpoint DATA.
/// Deserializing this choice never creates authentication, custody or a lease.
#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct DurableNativeActivationControlIdentity {
    /// Breditor-owned transport discriminator.
    pub format: String,
    /// Original revision of this separate transport contract.
    pub format_version: u32,
    /// Fresh instance selected by trusted host preparation.
    pub instance: String,
    /// Digest of the exact native checkpoint identity, including its private
    /// inode witnesses. Transport never converts those u64 witnesses to JS numbers.
    pub checkpoint_sha256: [u8; 32],
    /// Complete independently selected native target cut.
    pub current: ServerLogGenerationRecoveryStateIdentity,
    /// Exact prior authority and decimal-string epoch; never an old lease.
    pub previous: RoomDeploymentSelection,
    /// Exact planned target-bound epoch; data alone cannot publish it.
    pub planned: RoomDeploymentSelection,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Receipt<'a> {
    format: &'static str,
    format_version: u32,
    selection: &'a DurableNativeActivationControlIdentity,
    scope: &'static str,
}

#[cfg(test)]
pub(super) fn request_for_test(
    control: &DurableNativeActivationControl,
    request: axum::extract::Request,
) -> impl std::future::Future<Output = axum::response::Response> + Send + 'static {
    let weak = std::sync::Arc::downgrade(&control.state);
    async move { routes::commit(axum::extract::State(weak), request).await }
}

#[cfg(test)]
pub(super) fn worker_observation_for_test(
    control: &DurableNativeActivationControl,
) -> (usize, bool) {
    (
        control.state.requests.available_permits(),
        matches!(control.state.commit.try_lock(), Err(std::sync::TryLockError::WouldBlock)),
    )
}
