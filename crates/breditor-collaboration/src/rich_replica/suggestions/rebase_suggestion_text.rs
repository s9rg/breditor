//! Explicit source-character text revisions, without weakening original V1 acceptance guards.
use super::{
    SuggestionConflictTarget, evaluate_commands,
    packet::Packet,
    rebase_text_intent, rebase_text_masked,
    rebase_text_target::{self, Source, Target},
};
use crate::{
    Error,
    rich_replica::{AffineTextRangeConflict, RichReplica, SharedObservation, WriterDependency},
};
use serde::{Deserialize, Serialize};

/// Required opt-in policy. No default or guessed disposition of intervening peer text exists.
#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum DocumentSuggestionTextRebasePolicy {
    /// A nonempty replacement conflicts if its mapped selection includes any non-original text.
    RejectInterveningText,
    /// Remove only surviving selected originals and retain intervening native characters.
    /// Uses a new explicit masked compound, never a reinterpretation of old range commands.
    /// Whole atoms with changed text/structure still conflict; their contents are not flattened.
    PreserveInterveningText,
}
/// Native refusal, not permission to apply a surviving subset or copy foreign characters.
#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum DocumentSuggestionTextRebaseConflict {
    /// One or more selected original characters or boundaries no longer survive safely.
    Range {
        /// Exact original-character loss.
        reason: AffineTextRangeConflict,
    },
    /// An original selected character's complete formats have changed.
    FormattingChanged,
    /// The mapped selection includes characters outside the complete original selected set.
    InterveningText,
    /// A retained target header, whole atom or structural context changed.
    TargetsChanged {
        /// Native-derived source witnesses; no caller-supplied weakening.
        targets: Vec<SuggestionConflictTarget>,
    },
}
/// Pure capture of an ordinary original-V1 child in the existing immutable revision envelope.
#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(tag = "kind", rename_all = "snake_case", rename_all_fields = "camelCase")]
pub enum DocumentSuggestionTextRebase {
    /// Retain the exact original source operations before planning.
    Pending {
        /// Original exclusive native operation ends.
        missing: Vec<WriterDependency>,
    },
    /// Only one insertion, deletion, rich range, or a complete general-text intent is supported.
    /// Mixed and multi-step command batches are never partially reinterpreted.
    Unsupported,
    /// No child or edit is produced.
    Conflict {
        /// Specific complete-intent refusal.
        reason: DocumentSuggestionTextRebaseConflict,
    },
    /// Exact bytes for the existing revision outbox, not independent publication or Accept.
    Captured {
        /// Original author, current guarded source and exact fresh native floors.
        revision_packet_json: String,
    },
}
impl RichReplica {
    /// Rebase a complete text intent with an explicitly selected intervening-text policy.
    /// This supports the original joined-flow/list and protected-boundary general semantics,
    /// including fresh native floors, without lowering a rich range into a 64-command batch.
    /// Disjoint text/mark edits outside the selected originals are retained. Any changed selected
    /// marks or structural witnesses return an explicit conflict. Intervening text requires an
    /// explicit policy. Preserving children use a conservative exact-document native read set;
    /// further rebase of that masked child is unsupported. After server supersession, use an
    /// explicit manual revision of the child rather than superseding a finalized predecessor again.
    /// Collapsed original insertions stay collapsed, even if their two affinities map around peer
    /// text. The host permanently reserves `prefix`, including after refusal or discarded capture.
    /// # Errors
    /// Stale/foreign observations, invalid source intents/cuts, no original effect, invalid fresh
    /// identities or the existing source/range/packet limits refuse without live mutation.
    pub fn rebase_document_suggestion_text_guarded(
        &self,
        observed: &SharedObservation,
        previous: &str,
        title: &str,
        created_at_ms: &str,
        prefix: &str,
        policy: DocumentSuggestionTextRebasePolicy,
    ) -> Result<DocumentSuggestionTextRebase, Error> {
        use DocumentSuggestionTextRebase as Rebase;
        self.check(observed)?;
        let packet = Packet::read(self, previous)?;
        if !rebase_text_intent::supported(&packet.data.draft.edit) {
            return Ok(Rebase::Unsupported);
        }
        let Some(source) = self.historical_review_document(&packet.data.source_anchor_json)? else {
            return Ok(Rebase::Pending {
                missing: self
                    .review_anchor_missing_dependencies(&packet.data.source_anchor_json)?,
            });
        };
        let original = evaluate_commands::evaluate_as_writer(
            self,
            &source.doc,
            &source.document,
            &source.canonical,
            &packet.data.draft,
            self.doc.peer_id(),
        )?;
        if original.canonical == source.canonical {
            return Err(Error::Contract("text rebase requires original source effect"));
        }
        let request = rebase_text_intent::request(&packet.data.draft.edit, &original.doc)?;
        let (target, segments) = match rebase_text_target::resolve(
            self,
            &Source {
                doc: &source.doc,
                document: &source.document,
                canonical: &source.canonical,
                anchor: &packet.data.source_anchor_json,
                draft: &packet.data.draft,
            },
            &request,
            policy,
        )? {
            Target::Ready { selection, segments } => (selection, segments),
            Target::NotReady(result) => return Ok(result),
        };
        let inserted = request.fragment(&self.codec)?;
        let mut draft = match policy {
            DocumentSuggestionTextRebasePolicy::RejectInterveningText => {
                self.plan_suggestion_general_text_guarded(observed, &target, &inserted, prefix)?
            }
            DocumentSuggestionTextRebasePolicy::PreserveInterveningText => {
                rebase_text_masked::draft(self, &target, &segments, &inserted, prefix)?
            }
        };
        draft.scope = packet.data.draft.scope;
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
