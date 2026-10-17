//! Closed source-bound proposal family. A digest protects identity, not claimed author authority.
use crate::{
    Error,
    rich_replica::{Command, RichReplica, actions::ReplaceGeneralTextRangeV1},
};
use breditor_core::rich_content::review::ReviewPrincipalId;
use serde::{Deserialize, Serialize};
pub(super) const MAX_BYTES: usize = 1024 * 1024;

/// Explicit native scope; an absent editor selection never means the entire document.
#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum DocumentSuggestionScope {
    /// Explicit commands against their original stable targets.
    Commands,
    /// Explicit whole-document intent, including the separately declared document commands.
    Document,
}
/// Original native intent. Fresh IDs belong to the host and stay consumed after refusal/discard.
#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct DocumentSuggestionDraft {
    /// Declared operation scope, independent of the current caret or selection.
    pub scope: DocumentSuggestionScope,
    /// One explicit native edit; no plain-text fallback or implicit command grouping is inferred.
    pub edit: DocumentSuggestionEdit,
}
/// Original proposed semantic edit, separate from any accepted document journal entry.
#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(tag = "kind", content = "data", rename_all = "snake_case", deny_unknown_fields)]
pub enum DocumentSuggestionEdit {
    /// Ordered original semantic commands, bounded to 64 steps in one eventual accepted edit.
    Commands(Vec<Command>),
    /// One native partial-structure-preserving rich range replacement with exact fresh floors.
    GeneralText(ReplaceGeneralTextRangeV1),
}
impl DocumentSuggestionDraft {
    pub(super) fn check(&self) -> Result<(), Error> {
        if let DocumentSuggestionEdit::Commands(commands) = &self.edit
            && (commands.is_empty() || commands.len() > 64)
        {
            return Err(Error::Limit("suggestion action steps"));
        }
        Ok(())
    }
}
/// Read-only descriptive attribution. The host separately authenticates proposal publication.
#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct DocumentSuggestionInfo {
    /// Content-addressed immutable intent identity; never an authorization token.
    pub id: String,
    /// Plain display title, never interpreted markup.
    pub title: String,
    /// Claimed creator; authentic publication must match the current account separately.
    pub author: ReviewPrincipalId,
    /// Exact host-supplied u64 decimal time, not trusted server ordering.
    pub created_at_ms: String,
}
#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub(super) struct Data {
    pub format: String,
    pub format_version: u32,
    pub title: String,
    pub author: ReviewPrincipalId,
    pub created_at_ms: String,
    pub source_anchor_json: String,
    pub draft: DocumentSuggestionDraft,
}
#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub(super) struct Packet {
    pub id: String,
    pub data: Data,
}
pub(super) fn label(title: &str, time: &str) -> Result<(), Error> {
    if title.len() > 256 || title.trim().is_empty() || title.chars().any(char::is_control) {
        return Err(Error::Contract("suggestion title"));
    }
    let value = time.parse::<u64>().map_err(|_| Error::Contract("suggestion timestamp"))?;
    if value.to_string() != time {
        return Err(Error::Contract("canonical suggestion timestamp"));
    }
    Ok(())
}
pub(super) fn digest(data: &Data) -> Result<String, Error> {
    use sha2::{Digest, Sha256};
    use std::fmt::Write as _;
    let mut result = String::from("sha256:");
    for byte in Sha256::new()
        .chain_update(b"breditor/document-suggestion/1\0")
        .chain_update(serde_json::to_vec(data)?)
        .finalize()
    {
        write!(result, "{byte:02x}").map_err(|_| Error::Contract("suggestion digest"))?;
    }
    Ok(result)
}
impl Packet {
    pub fn info(&self) -> DocumentSuggestionInfo {
        DocumentSuggestionInfo {
            id: self.id.clone(),
            title: self.data.title.clone(),
            author: self.data.author.clone(),
            created_at_ms: self.data.created_at_ms.clone(),
        }
    }
    pub fn read(owner: &RichReplica, input: &str) -> Result<Self, Error> {
        if input.len() > MAX_BYTES {
            return Err(Error::Limit("document suggestion bytes"));
        }
        let packet: Self = serde_json::from_str(input)?;
        if packet.data.format != "breditor/document-suggestion"
            || packet.data.format_version != 1
            || packet.id != digest(&packet.data)?
        {
            return Err(Error::Contract("document suggestion family or digest"));
        }
        label(&packet.data.title, &packet.data.created_at_ms)?;
        packet.data.draft.check()?;
        owner.resolve_review_anchor(&packet.data.source_anchor_json)?;
        let source: serde_json::Value = serde_json::from_str(&packet.data.source_anchor_json)?;
        if source["anchors"]["kind"] != "document" {
            return Err(Error::Contract("suggestion source scope"));
        }
        Ok(packet)
    }
}
