//! Character identity witnesses detect delete/reinsert even when canonical text/formats are equal.
use crate::{Error, anchor::event_offset, rich_replica::text_flow};
use loro::{LoroDoc, cursor::Side};
use serde_json::Value;
use sha2::{Digest, Sha256};
#[cfg(test)]
#[path = "text_witness_tests.rs"]
mod tests;

pub(super) fn blocks(node: &Value, result: &mut Vec<String>) {
    if matches!(
        node["type"].as_str(),
        Some("breditor/paragraph" | "breditor/heading" | "breditor/code-block")
    ) {
        if let Some(block) = node["properties"]["breditor/block-id"].as_str() {
            result.push(block.into());
        }
    } else if let Some(children) = node["children"].as_array() {
        for child in children {
            blocks(child, result);
        }
    }
}
pub(super) fn capture(doc: &LoroDoc, block: &str, node: &Value) -> Result<Value, Error> {
    let mut digest = Sha256::new().chain_update(b"breditor/suggestion-characters/1\0");
    let mut count = 0_usize;
    // Empty derived text blocks are admitted projections, not necessarily activated text
    // roots. They have no character identities to hash. Do not create infrastructure during this
    // read, and do not turn a missing/malformed real or nonempty flow into an empty witness.
    let unactivated_empty_floor = block.starts_with(super::super::model::VIRTUAL_PREFIX)
        && matches!(
            node["type"].as_str(),
            Some("breditor/paragraph" | "breditor/heading" | "breditor/code-block")
        )
        && node["properties"]["breditor/block-id"].as_str() == Some(block)
        && node["children"].as_array().is_some_and(Vec::is_empty)
        && !text_flow::prepared(doc, block)
        // A later peer edit can register this container in retained history while the historical
        // source cut is still empty and unactivated. Container knowledge is not character presence.
        && super::super::model::existing_text(doc, block).is_none_or(|text| text.len_unicode() == 0);
    let chunks = if unactivated_empty_floor { vec![] } else { text_flow::view(doc, block)?.chunks };
    for chunk in chunks {
        let text = super::super::model::existing_text(doc, &chunk.source).ok_or(Error::Anchor)?;
        let mut offset = chunk.start;
        for scalar in chunk.text.chars() {
            count += 1;
            if count > 4 * 1024 * 1024 {
                return Err(Error::Limit("suggestion character witnesses"));
            }
            let cursor =
                text.get_cursor(event_offset(&text, offset)?, Side::Middle).ok_or(Error::Anchor)?;
            if cursor.id.is_none() {
                return Err(Error::Contract("suggestion character has no native identity"));
            }
            let bytes = cursor.encode();
            digest.update(
                u64::try_from(bytes.len())
                    .map_err(|_| Error::Limit("suggestion character identity bytes"))?
                    .to_le_bytes(),
            );
            digest.update(bytes);
            offset = offset
                .checked_add(u32::try_from(scalar.len_utf16()).map_err(|_| Error::Offset)?)
                .ok_or(Error::Offset)?;
        }
    }
    // Internal comparison only, not a serialized authority, CRDT or replacement for retained history.
    Ok(Value::Array(digest.finalize().iter().map(|value| Value::from(*value)).collect()))
}
