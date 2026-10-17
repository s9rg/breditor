//! Explicit original-character formatting revision, not implicit V1 acceptance or guard weakening.
use super::{
    DocumentSuggestionDraft, DocumentSuggestionEdit, evaluate_commands,
    packet::Packet,
    rebase_format_steps::{FormatRebaseSteps, plan},
};
use crate::{
    Error,
    rich_replica::{
        AffineTextRangeConflict, Command, RichReplica, SharedObservation, WriterDependency,
    },
};
use serde::Serialize;

/// An explicit reason why a formatting proposal cannot be carried onto the current source.
#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum DocumentSuggestionFormatRebaseConflict {
    /// The complete original character set or one of its endpoints no longer survives safely.
    Range {
        /// No surviving subset or guessed replacement is returned.
        reason: AffineTextRangeConflict,
    },
    /// A selected original character's current value for the edited format kind has changed.
    FormatChanged,
}
/// Pure revision capture. A captured child still needs authenticated publication and Accept.
#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(tag = "kind", rename_all = "snake_case", rename_all_fields = "camelCase")]
pub enum DocumentSuggestionFormatRebase {
    /// Original source operations must be retained before the edit can be proved.
    Pending {
        /// Exclusive original native operation ends.
        missing: Vec<WriterDependency>,
    },
    /// Only batches composed entirely of `SetFormat` are supported; no step is silently dropped.
    Unsupported,
    /// The old proposal remains unchanged and no replacement packet is captured.
    Conflict {
        /// Exact range or touched-format conflict, not browser-inferred eligibility.
        reason: DocumentSuggestionFormatRebaseConflict,
    },
    /// An ordinary immutable V1 replacement at the current source, inside a revision envelope.
    Captured {
        /// Exact bytes for the existing revision outbox, never independent child publication.
        revision_packet_json: String,
    },
}
impl RichReplica {
    /// Carry an ordered formatting-only batch onto surviving originals as a new revision.
    /// Newly inserted text is excluded. Unrelated format kinds are preserved; a changed value
    /// for the edited kind conflicts. Existing V1 packets and whole-block guards stay unchanged.
    /// Capture is pure in read-only mode and grants no publication, finality or Accept authority.
    /// # Errors
    /// Stale/foreign observations, malformed or invalid original intent, no-op source edits,
    /// excessive fragmentation, invalid labels and normal revision limits refuse atomically.
    pub fn rebase_document_suggestion_format_guarded(
        &self,
        observed: &SharedObservation,
        previous: &str,
        title: &str,
        created_at_ms: &str,
    ) -> Result<DocumentSuggestionFormatRebase, Error> {
        use DocumentSuggestionFormatRebase as Rebase;
        self.check(observed)?;
        let packet = Packet::read(self, previous)?;
        let DocumentSuggestionEdit::Commands(commands) = &packet.data.draft.edit else {
            return Ok(Rebase::Unsupported);
        };
        let actions = commands
            .iter()
            .map(|command| match command {
                Command::SetFormat(action) => Some(action),
                _ => None,
            })
            .collect::<Option<Vec<_>>>();
        let Some(actions) = actions else {
            return Ok(Rebase::Unsupported);
        };
        let Some(source) = self.historical_review_document(&packet.data.source_anchor_json)? else {
            return Ok(Rebase::Pending {
                missing: self
                    .review_anchor_missing_dependencies(&packet.data.source_anchor_json)?,
            });
        };
        let original = evaluate_commands::evaluate(
            self,
            &source.doc,
            &source.document,
            &source.canonical,
            &packet.data.draft,
        )?;
        if original == source.canonical {
            return Err(Error::Contract("format rebase requires original source effect"));
        }
        let commands =
            match plan(self, &packet.data.source_anchor_json, &source.canonical, &actions)? {
                FormatRebaseSteps::Planned(commands) => commands,
                FormatRebaseSteps::NotReady(result) => return Ok(result),
            };
        let draft = DocumentSuggestionDraft {
            scope: packet.data.draft.scope,
            edit: DocumentSuggestionEdit::Commands(commands),
        };
        let revision_packet_json = self.capture_document_suggestion_revision_guarded(
            observed,
            previous,
            title,
            created_at_ms,
            draft,
        )?;
        Ok(Rebase::Captured { revision_packet_json })
    }
}
