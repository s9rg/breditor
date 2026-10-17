//! Closed revision relation around two unchanged immutable V1 proposal identities.
use super::{DocumentSuggestionInfo, packet::Packet};
use crate::{Error, rich_replica::RichReplica};
use serde::{Deserialize, Serialize};

// The embedded JSON string may escape an entire maximum-size V1 packet a second time.
pub(super) const MAX_BYTES: usize = 2 * super::packet::MAX_BYTES + 4096;

/// Descriptive immutable revision lineage, not a final decision or an editing permission.
#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct DocumentSuggestionRevisionInfo {
    /// Content-addressed revision envelope identity, distinct from either proposal identity.
    pub id: String,
    /// Exact predecessor; the authenticated host must prove that it is still pending.
    pub previous_suggestion_id: String,
    /// Replacement's unchanged native V1 identity and descriptive attribution.
    pub suggestion: DocumentSuggestionInfo,
}

#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub(super) struct Data {
    pub format: String,
    pub format_version: u32,
    pub previous_suggestion_id: String,
    pub suggestion_packet_json: String,
}
#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub(super) struct Revision {
    pub id: String,
    pub data: Data,
}
pub(super) fn digest(data: &Data) -> Result<String, Error> {
    use sha2::{Digest, Sha256};
    use std::fmt::Write as _;
    let mut result = String::from("sha256:");
    for byte in Sha256::new()
        .chain_update(b"breditor/document-suggestion-revision/1\0")
        .chain_update(serde_json::to_vec(data)?)
        .finalize()
    {
        write!(result, "{byte:02x}").map_err(|_| Error::Contract("suggestion revision digest"))?;
    }
    Ok(result)
}
impl Revision {
    pub fn read(owner: &RichReplica, previous: &str, input: &str) -> Result<Self, Error> {
        if input.len() > MAX_BYTES {
            return Err(Error::Limit("suggestion revision bytes"));
        }
        let revision: Self = serde_json::from_str(input)?;
        if revision.data.format != "breditor/document-suggestion-revision"
            || revision.data.format_version != 1
            || revision.id != digest(&revision.data)?
        {
            return Err(Error::Contract("suggestion revision family or digest"));
        }
        let parent = Packet::read(owner, previous)?;
        let child = Packet::read(owner, &revision.data.suggestion_packet_json)?;
        if revision.data.previous_suggestion_id != parent.id
            || child.id == parent.id
            || child.data.author != parent.data.author
        {
            return Err(Error::Contract("suggestion revision predecessor or attribution"));
        }
        Ok(revision)
    }
    pub fn info(&self, owner: &RichReplica) -> Result<DocumentSuggestionRevisionInfo, Error> {
        Ok(DocumentSuggestionRevisionInfo {
            id: self.id.clone(),
            previous_suggestion_id: self.data.previous_suggestion_id.clone(),
            suggestion: owner.read_document_suggestion(&self.data.suggestion_packet_json)?,
        })
    }
}
impl RichReplica {
    /// Read the closed relation against an exact predecessor packet. This validates native binding
    /// and descriptive attribution, not source completeness, author authentication or finality.
    /// # Errors
    /// Foreign/malformed/oversized packets, digest mismatch, equal identities or changed author reject.
    pub fn read_document_suggestion_revision(
        &self,
        previous: &str,
        input: &str,
    ) -> Result<DocumentSuggestionRevisionInfo, Error> {
        Revision::read(self, previous, input)?.info(self)
    }
    /// Return the exact immutable V1 replacement after relation admission. It is not an accepted edit.
    /// # Errors
    /// The same binding, identity, closed-field and budget checks as the descriptive read apply.
    pub fn document_suggestion_revision_packet(
        &self,
        previous: &str,
        input: &str,
    ) -> Result<String, Error> {
        Ok(Revision::read(self, previous, input)?.data.suggestion_packet_json)
    }
}
