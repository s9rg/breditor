//! Narrow, synchronous WebAssembly boundary for Breditor's Rust editor engine.
//!
//! The crate deliberately owns no DOM, browser event, clock, queue, framework,
//! or storage API. JavaScript holds opaque engine observations and presents one
//! back with every command. The wrapped [`breditor_core::engine::EditorEngine`]
//! remains authoritative and repeats its complete observation check immediately
//! before every mutation.
//!
//! All public failures are returned as structured, payload-redacting result
//! objects. Commit, state, and checkpoint encoding are separate read operations:
//! a serialization failure can therefore never disguise an already-published
//! editor mutation.

mod action_state;
mod action_value_json;
mod command;
mod command_result;
mod engine;
mod engine_result;
mod error;
mod from_document_json;
mod from_session_checkpoint_json;
mod observation;
mod projection;
mod read_observation;
mod selection;
mod session_checkpoint_json;
mod state_json;
mod string_result;
mod typescript;
mod version;

pub use action_state::{BreditorActionStateSnapshot, BreditorActionStatesResult};
pub use command_result::BreditorCommandResult;
pub use engine::BreditorEngine;
pub use engine_result::BreditorEngineResult;
pub use error::BreditorError;
pub use observation::BreditorObservation;
pub use projection::{BreditorProjection, BreditorProjectionResult, BreditorProjectionUpdate};
pub use selection::{BreditorSelection, BreditorSelectionResult};
pub use string_result::BreditorStringResult;
pub use version::{BREDITOR_WASM_ABI_VERSION, breditor_version, breditor_wasm_abi_version};
