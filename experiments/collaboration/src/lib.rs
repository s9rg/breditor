//! Isolated replication and history feasibility checks for Breditor.
//!
//! This crate is not a shipping editor API. It pins a released Rust dependency
//! while the existing workspace, codecs and packaged module graph stay intact.
//! Native and wasm32 results must agree before promoting the adapter.

pub mod actions;
pub mod anchor;
pub mod engine_history_fixture;
pub mod feature_action_fixture;
mod register;
pub mod rich_ast_fixture;
pub mod rich_clipboard_fixture;
pub mod rich_fixture;
pub mod rich_flow_fixture;
pub mod rich_local_fixture;
pub mod rich_navigation_fixture;
pub mod rich_paste_fixture;
pub mod rich_recovery_fixture;
pub mod rich_replica;
pub mod session;
pub mod table_axis_fixture;
mod text_projection;
pub use rich_replica::text_flow::fixture as text_flow_fixture;
mod validation;

#[cfg(target_arch = "wasm32")]
mod wasm;

#[cfg(target_arch = "wasm32")]
mod rich_clipboard_ids;
#[cfg(target_arch = "wasm32")]
mod rich_replica_wasm;

#[cfg(target_arch = "wasm32")]
mod shared_profile_wasm;

/// Failures isolated before a candidate session replaces published state.
#[derive(Debug, thiserror::Error)]
pub enum Error {
    /// Released replication engine rejected an operation.
    #[error(transparent)]
    Engine(#[from] loro::LoroError),
    /// Released replication codec could not export its changes.
    #[error(transparent)]
    Encode(#[from] loro::LoroEncodeError),
    /// A serialized envelope is malformed.
    #[error("invalid JSON envelope")]
    Json,
    /// A UTF-16 offset is outside text or splits a surrogate pair.
    #[error("invalid scalar-aligned UTF-16 offset")]
    Offset,
    /// A stable cursor is malformed or cannot be resolved.
    #[error("invalid or unresolvable stable text anchor")]
    Anchor,
    /// A command or journal violates a closed contract.
    #[error("contract violation: {0}")]
    Contract(&'static str),
    /// A provisional feasibility budget has been reached.
    #[error("feasibility budget exceeded: {0}")]
    Limit(&'static str),
    /// Another writer attempted to extend this writer's counter stream.
    #[error("remote update extends the exclusively owned writer identity")]
    WriterCollision,
    /// Replay did not generate precisely the saved causal changes.
    #[error("journal replay differs from the saved operation identities/effects")]
    ReplayMismatch,
}

impl From<serde_json::Error> for Error {
    fn from(_error: serde_json::Error) -> Self {
        Self::Json
    }
}
