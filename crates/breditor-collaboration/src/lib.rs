//! Optional original shared rich editor with one canonical Rust implementation.
//!
//! The application build excludes research schemas, probes and fixture exports.
//! The old feasibility manifest deliberately compiles this source with `research`
//! for compatibility qualification. Neither build changes the original default
//! editor dependency graph, document protocol, shared model or selective history.

#[cfg(feature = "research")]
pub mod actions;
pub mod anchor;
#[cfg(feature = "research")]
pub mod engine_history_fixture;
#[cfg(feature = "research")]
pub mod feature_action_fixture;
mod identity;
mod register;
#[cfg(feature = "research")]
pub mod rich_ast_fixture;
#[cfg(feature = "research")]
pub mod rich_clipboard_fixture;
#[cfg(feature = "research")]
pub mod rich_fixture;
#[cfg(feature = "research")]
pub mod rich_flow_fixture;
#[cfg(feature = "research")]
pub mod rich_local_fixture;
#[cfg(feature = "research")]
pub mod rich_navigation_fixture;
#[cfg(feature = "research")]
pub mod rich_paste_fixture;
#[cfg(feature = "research")]
pub mod rich_recovery_fixture;
pub mod rich_replica;
#[cfg(feature = "research")]
pub mod session;
#[cfg(feature = "research")]
pub mod table_axis_fixture;
#[cfg(feature = "research")]
mod text_projection;
#[cfg(feature = "research")]
pub use rich_replica::text_flow::fixture as text_flow_fixture;
#[cfg(feature = "research")]
mod validation;

#[cfg(all(target_arch = "wasm32", feature = "research"))]
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
    /// The live host policy forbids authoring content, history or pending styles.
    #[error("shared editor is read-only")]
    ReadOnly,
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
