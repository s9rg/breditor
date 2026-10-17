//! Original immutable proposal intents and pure native previews, separate from comments/decisions.
//! A proposal is not an accepted document operation, history checkpoint or authority credential.
mod capture_suggestion;
mod capture_suggestion_revision;
mod check_suggestion_effect_proof;
mod check_suggestion_preview;
mod commit_suggestion_effect;
mod evaluate_commands;
mod packet;
mod plan_suggestion_general_text;
mod prepare_suggestion_effect;
mod prepare_suggestion_preview;
mod read_set;
mod read_suggestion;
mod rebase_format_steps;
mod rebase_suggestion_format;
mod rebase_suggestion_text;
mod rebase_text_intent;
mod rebase_text_masked;
mod rebase_text_target;
mod revision_packet;
#[cfg(test)]
mod tests;
mod text_witness;
mod verify_suggestion_effect;
mod verify_suggestion_revision;
mod verify_suggestion_source;

pub use packet::{
    DocumentSuggestionDraft, DocumentSuggestionEdit, DocumentSuggestionInfo,
    DocumentSuggestionScope,
};
pub use prepare_suggestion_effect::{DocumentSuggestionEffect, PreparedDocumentSuggestionEffect};
pub use prepare_suggestion_preview::{DocumentSuggestionPreparation, DocumentSuggestionPreview};
pub use read_set::SuggestionConflictTarget;
pub use rebase_suggestion_format::{
    DocumentSuggestionFormatRebase, DocumentSuggestionFormatRebaseConflict,
};
pub use rebase_suggestion_text::{
    DocumentSuggestionTextRebase, DocumentSuggestionTextRebaseConflict,
    DocumentSuggestionTextRebasePolicy,
};
pub use revision_packet::DocumentSuggestionRevisionInfo;
pub use verify_suggestion_effect::{
    DocumentSuggestionEffectVerification, VerifiedDocumentSuggestionEffect,
};
pub use verify_suggestion_revision::DocumentSuggestionRevisionSource;
pub use verify_suggestion_source::DocumentSuggestionSource;
