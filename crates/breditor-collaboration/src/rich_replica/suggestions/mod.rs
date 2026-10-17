//! Original immutable proposal intents and pure native previews, separate from comments/decisions.
//! A proposal is not an accepted document operation, history checkpoint or authority credential.
mod capture_suggestion;
mod check_suggestion_effect_proof;
mod check_suggestion_preview;
mod commit_suggestion_effect;
mod evaluate_commands;
mod packet;
mod prepare_suggestion_effect;
mod prepare_suggestion_preview;
mod read_set;
mod read_suggestion;
#[cfg(test)]
mod tests;
mod text_witness;
mod verify_suggestion_effect;
mod verify_suggestion_source;

pub use packet::{
    DocumentSuggestionDraft, DocumentSuggestionEdit, DocumentSuggestionInfo,
    DocumentSuggestionScope,
};
pub use prepare_suggestion_effect::{DocumentSuggestionEffect, PreparedDocumentSuggestionEffect};
pub use prepare_suggestion_preview::{DocumentSuggestionPreparation, DocumentSuggestionPreview};
pub use read_set::SuggestionConflictTarget;
pub use verify_suggestion_effect::{
    DocumentSuggestionEffectVerification, VerifiedDocumentSuggestionEffect,
};
pub use verify_suggestion_source::DocumentSuggestionSource;
