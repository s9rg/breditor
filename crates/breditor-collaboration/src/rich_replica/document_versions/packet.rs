//! Closed content-addressed semantic version envelope; authorship claims confer no permissions.
use crate::{Error, rich_replica::RichReplica};
use breditor_core::rich_content::{RichDocument, review::ReviewPrincipalId};
use serde::{Deserialize, Serialize};
pub(super) const MAX_BYTES: usize = 4 * 1024 * 1024;

/// Read-only named version identity and host-supplied creation attribution.
#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct DocumentVersionInfo {
    /// Hash of the complete immutable version payload, not a writer credential.
    pub id: String,
    /// Plain human name, not interpreted as markup.
    pub name: String,
    /// Host-authenticated creator when saved; imported claims still require host provenance.
    pub author: ReviewPrincipalId,
    /// Canonical unsigned decimal milliseconds supplied by the host, not trusted server time.
    pub created_at_ms: String,
}
#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub(super) struct Data {
    pub format: String,
    pub format_version: u32,
    pub name: String,
    pub author: ReviewPrincipalId,
    pub created_at_ms: String,
    pub source_anchor_json: String,
    pub document_json: String,
}
#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub(super) struct Packet {
    pub id: String,
    pub data: Data,
}
pub(super) fn label(name: &str, created: &str) -> Result<(), Error> {
    if name.len() > 256 || name.trim().is_empty() || name.chars().any(char::is_control) {
        return Err(Error::Contract("version name"));
    }
    let time = created.parse::<u64>().map_err(|_| Error::Contract("version timestamp"))?;
    if time.to_string() != created {
        return Err(Error::Contract("canonical version timestamp"));
    }
    Ok(())
}
pub(super) fn digest(data: &Data) -> Result<String, Error> {
    use sha2::{Digest, Sha256};
    use std::fmt::Write as _;
    let bytes = serde_json::to_vec(data)?;
    let mut text = String::from("sha256:");
    for byte in
        Sha256::new().chain_update(b"breditor/document-version/1\0").chain_update(bytes).finalize()
    {
        write!(text, "{byte:02x}").map_err(|_| Error::Contract("version digest"))?;
    }
    Ok(text)
}
impl Packet {
    pub fn info(&self) -> DocumentVersionInfo {
        DocumentVersionInfo {
            id: self.id.clone(),
            name: self.data.name.clone(),
            author: self.data.author.clone(),
            created_at_ms: self.data.created_at_ms.clone(),
        }
    }
    pub fn read(owner: &RichReplica, input: &str) -> Result<(Self, RichDocument), Error> {
        if input.len() > MAX_BYTES {
            return Err(Error::Limit("document version bytes"));
        }
        let packet: Self = serde_json::from_str(input)?;
        let data = &packet.data;
        if data.format != "breditor/document-version"
            || data.format_version != 1
            || packet.id != digest(data)?
        {
            return Err(Error::Contract("document version family or digest"));
        }
        label(&data.name, &data.created_at_ms)?;
        owner.resolve_review_anchor(&data.source_anchor_json)?;
        let anchor: serde_json::Value = serde_json::from_str(&data.source_anchor_json)?;
        if anchor["anchors"]["kind"] != "document" {
            return Err(Error::Contract("version source scope"));
        }
        let document = owner
            .codec
            .decode(&data.document_json)
            .map_err(|_| Error::Contract("version document admission"))?;
        let document =
            RichDocument::try_admit(owner.codec.schema(), document, owner.codec.limits())
                .map_err(|_| Error::Contract("version rich document admission"))?;
        if document.id().as_str() != owner.document_id() {
            return Err(Error::Contract("version document binding"));
        }
        if owner
            .codec
            .encode(document.document())
            .map_err(|_| Error::Contract("version encoding"))?
            != data.document_json
        {
            return Err(Error::Contract("canonical version content"));
        }
        Ok((packet, document))
    }
}
