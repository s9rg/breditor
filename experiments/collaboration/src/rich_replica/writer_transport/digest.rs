//! Pinned-engine canonical operation lineage, not a hash of variable binary packing.
use super::super::RichReplica;
use crate::Error;
use loro::IdSpan;
use serde_json::json;
use sha2::{Digest, Sha256};
use std::fmt::Write;
pub(super) fn bytes(bytes: &[u8]) -> String {
    let mut result = String::from("sha256:");
    for byte in Sha256::digest(bytes) {
        let _ = write!(result, "{byte:02x}");
    }
    result
}
pub(super) fn valid(value: &str) -> bool {
    value.len() == 71
        && value.starts_with("sha256:")
        && value.as_bytes()[7..].iter().all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(b))
}
pub(super) fn operations(
    owner: &RichReplica,
    writer: u64,
    from: i32,
    through: i32,
) -> Result<String, Error> {
    let changes = owner.doc.export_json_in_id_span(IdSpan::new(writer, from, through));
    let value = json!({"format":"breditor/shared-writer-lineage","formatVersion":1,
        "document":owner.document_id(),"schemaFingerprint":owner.codec.schema().fingerprint().to_string(),
        "modelVersion":super::super::MODEL_VERSION,"engine":super::ENGINE,
        "writer":writer.to_string(),"from":from.to_string(),"through":through.to_string(),"changes":changes});
    Ok(bytes(&serde_json::to_vec(&value)?))
}
