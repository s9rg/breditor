//! Immutable compilation of one complete editor semantic profile.
//!
//! A [`CompiledEditorProfile`] binds one resolved extension set to its sealed
//! schema, generated action registrations, semantic intent router, observable
//! action-state catalog, and an opaque process-local generation. Compilation
//! accepts data-only extension declarations; it never executes extension code
//! or accepts a browser-provided action planner.

mod compiled_editor_profile;
mod compiled_profile_generation;
mod compiler;
mod error;

pub use compiled_editor_profile::CompiledEditorProfile;
pub use compiled_profile_generation::CompiledProfileGeneration;
pub use compiler::MAX_PROFILE_INLINE_FORMAT_TOGGLES;
pub use error::ProfileCompilationError;
