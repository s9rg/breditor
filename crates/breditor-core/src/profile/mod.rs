//! Immutable compilation of one complete editor semantic profile.
//!
//! A [`CompiledEditorProfile`] binds one resolved extension set to its sealed
//! schema, generated action registrations, semantic intent router, observable
//! action-state catalog, and an opaque process-local generation. Compilation
//! accepts data-only extension declarations; it never executes extension code
//! or accepts a browser-provided action planner.

mod compiled_editor_profile;
mod compiled_profile_action_state_descriptor;
mod compiled_profile_action_state_source;
mod compiled_profile_descriptor;
mod compiled_profile_generation;
mod compiled_profile_inline_format_descriptor;
mod compiled_profile_intent_descriptor;
mod compiler;
mod error;

pub use compiled_editor_profile::CompiledEditorProfile;
pub use compiled_profile_action_state_descriptor::CompiledProfileActionStateDescriptor;
pub use compiled_profile_action_state_source::CompiledProfileActionStateSource;
pub use compiled_profile_descriptor::CompiledProfileDescriptor;
pub use compiled_profile_generation::CompiledProfileGeneration;
pub use compiled_profile_inline_format_descriptor::CompiledProfileInlineFormatDescriptor;
pub use compiled_profile_intent_descriptor::CompiledProfileIntentDescriptor;
pub use compiler::{MAX_PROFILE_INLINE_FORMAT_SETS, MAX_PROFILE_INLINE_FORMAT_TOGGLES};
pub use error::ProfileCompilationError;
