//! Closed additive range packet. A caller cannot supply weaker character or formatting witnesses.
use super::{AffineTextRangeInfo, MAX_BYTES};
use crate::{
    Error,
    rich_replica::{RichReplica, selection::Selection},
};
use serde::{Deserialize, Serialize};
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct Data {
    pub format: String,
    pub format_version: u32,
    pub source_anchor_json: String,
    pub source_document_digest: String,
    pub selection: Selection,
}
#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub(super) struct Packet {
    pub id: String,
    pub data: Data,
}
pub(super) fn digest(data: &Data) -> Result<String, Error> {
    hash(b"breditor/shared-affine-text-range/1\0", &serde_json::to_vec(data)?)
}
pub(super) fn document_digest(canonical: &str) -> Result<String, Error> {
    hash(b"breditor/shared-affine-text-source/1\0", canonical.as_bytes())
}
fn hash(domain: &[u8], value: &[u8]) -> Result<String, Error> {
    use sha2::{Digest, Sha256};
    use std::fmt::Write as _;
    let mut result = String::from("sha256:");
    for byte in Sha256::new().chain_update(domain).chain_update(value).finalize() {
        write!(result, "{byte:02x}").map_err(|_| Error::Contract("affine range digest"))?;
    }
    Ok(result)
}
impl Packet {
    pub fn info(&self) -> AffineTextRangeInfo {
        AffineTextRangeInfo { id: self.id.clone(), selection: self.data.selection.clone() }
    }
    pub fn read(owner: &RichReplica, input: &str) -> Result<Self, Error> {
        if input.len() > MAX_BYTES {
            return Err(Error::Limit("affine range packet bytes"));
        }
        let packet: Self = serde_json::from_str(input)?;
        if packet.data.format != "breditor/shared-affine-text-range"
            || packet.data.format_version != 1
            || packet.id != digest(&packet.data)?
            || packet.data.source_document_digest.len() != 71
            || !packet.data.source_document_digest.starts_with("sha256:")
            || !packet.data.source_document_digest.as_bytes()[7..]
                .iter()
                .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(b))
            || !matches!(packet.data.selection, Selection::TextRange { .. })
        {
            return Err(Error::Contract("affine range family or digest"));
        }
        owner.resolve_review_anchor(&packet.data.source_anchor_json)?;
        let source: serde_json::Value = serde_json::from_str(&packet.data.source_anchor_json)?;
        if source["anchors"]["kind"] != "document" {
            return Err(Error::Contract("affine range source scope"));
        }
        Ok(packet)
    }
}
