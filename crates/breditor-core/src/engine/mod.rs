//! Guarded product-level ownership for one synchronous editor instance.
//!
//! [`EditorEngine`] keeps one [`crate::session::EditorSession`] and one
//! immutable [`crate::action::ActionRegistry`] behind a narrow mutation
//! boundary. Every mutating entry point requires the caller's last complete
//! [`EditorEngineObservation`], preventing delayed browser work from silently
//! crossing engine instances or applying to newer state or history. Effective mutations return sealed
//! semantic [`EditorEngineEvent`] values. The engine owns no DOM, event queue,
//! clock, persistence, framework, or Wasm boundary.

mod action_outcome;
mod editor_engine;
mod error;
mod event;
mod instance_id;
mod observation;

pub use action_outcome::{EditorActionOutcome, EditorDisabledAction};
pub use editor_engine::EditorEngine;
pub use error::{EditorEngineError, EditorEngineErrorCode};
pub use event::{EditorEngineEvent, EditorEngineEventKind};
pub use observation::EditorEngineObservation;
