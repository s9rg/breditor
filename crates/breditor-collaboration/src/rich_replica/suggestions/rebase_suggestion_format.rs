//! Explicit original-character formatting revision, not implicit V1 acceptance or guard weakening.
use super::{DocumentSuggestionDraft, DocumentSuggestionEdit, evaluate_commands, packet::Packet};
use crate::{
    Error,
    anchor::Affinity,
    rich_replica::{
        AffineTextRangeConflict, AffineTextRangeResolution, Command, RichReplica,
        SharedObservation, WriterDependency,
        actions::SetFormat,
        affine_text_range::resolve_source_selection,
        selection::{Selection, TextPoint},
    },
};
use serde::Serialize;
use serde_json::Value;

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
    /// Only one explicit `SetFormat` command is supported; no other step is silently dropped.
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
fn touched<'a>(formats: &'a [Value], kind: &str) -> Option<&'a Value> {
    formats.iter().find(|value| value["type"].as_str() == Some(kind))
}
impl RichReplica {
    /// Carry a single formatting intent onto surviving original characters as a new revision.
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
        let [Command::SetFormat(action)] = commands.as_slice() else {
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
        let selection = Selection::TextRange {
            anchor: TextPoint {
                block: action.block.clone(),
                offset: action.offset,
                affinity: Affinity::After,
            },
            focus: TextPoint {
                block: action.block.clone(),
                offset: action.offset.checked_add(action.length).ok_or(Error::Offset)?,
                affinity: Affinity::Before,
            },
        };
        let segments = match resolve_source_selection(
            self,
            &packet.data.source_anchor_json,
            &source.canonical,
            selection,
        )? {
            AffineTextRangeResolution::Pending { missing } => {
                return Ok(Rebase::Pending { missing });
            }
            AffineTextRangeResolution::Conflict { reason } => {
                return Ok(Rebase::Conflict {
                    reason: DocumentSuggestionFormatRebaseConflict::Range { reason },
                });
            }
            AffineTextRangeResolution::Resolved { segments, .. } => segments,
        };
        let kind = action.format["type"].as_str().ok_or(Error::Contract("format rebase kind"))?;
        if segments.iter().any(|segment| {
            touched(&segment.source_formats, kind) != touched(&segment.current_formats, kind)
        }) {
            return Ok(Rebase::Conflict {
                reason: DocumentSuggestionFormatRebaseConflict::FormatChanged,
            });
        }
        if segments.is_empty() || segments.len() > 64 {
            return Err(Error::Limit("format rebase action steps"));
        }
        // Bound repeated literal allocation before cloning it into up to 64 original V1 steps.
        // The original packet already bounds this one encoding; ordinary child packet admission
        // still checks the complete commands, source anchor, labels and revision envelope.
        if serde_json::to_vec(&action.format)?.len() > super::packet::MAX_BYTES / segments.len() {
            return Err(Error::Limit("format rebase repeated literal bytes"));
        }
        let commands = segments
            .into_iter()
            .map(|segment| {
                Command::SetFormat(SetFormat {
                    block: segment.current.block,
                    offset: segment.current.offset,
                    length: segment.length,
                    format: action.format.clone(),
                    enabled: action.enabled,
                })
            })
            .collect();
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
