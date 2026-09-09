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
mod checkpoint_codec;
mod checkpointed_editor_engine;
mod checkpointed_editor_engine_error;
mod editor_engine;
mod editor_profile_error;
mod error;
mod event;
mod history_sequence_outcome;
mod instance_id;
mod intent_event_outcome;
mod intent_outcome;
mod local_log_event;
mod observation;

pub use action_outcome::{EditorActionOutcome, EditorDisabledAction};
pub use checkpointed_editor_engine::CheckpointedEditorEngine;
pub use checkpointed_editor_engine_error::{
    CheckpointedEditorEngineError, CheckpointedEditorEngineErrorCode,
};
pub use editor_engine::EditorEngine;
pub use editor_profile_error::{EditorEngineProfileError, EditorEngineProfileErrorCode};
pub use error::{EditorEngineError, EditorEngineErrorCode};
pub use event::{EditorEngineEvent, EditorEngineEventKind};
pub use history_sequence_outcome::EditorHistorySequenceOutcome;
pub use intent_event_outcome::{EditorCommittedIntentEvent, EditorIntentEventOutcome};
pub use intent_outcome::EditorIntentOutcome;
pub use local_log_event::EditorEngineLocalLogEvent;
pub use observation::EditorEngineObservation;
