//! Closed explicit V4 bookmark intents: set/clear one block's name, or rename one name.
use super::JsonFailure;
use crate::{
    rich_content::{BlockId, RichBookmarkError, RichBookmarkName},
    state::EditorContext,
};
use serde::{Deserialize, Deserializer};

/// Payload-free or bounded diagnostic failure for native bookmark intent.
#[derive(Debug, thiserror::Error)]
pub enum RichBookmarkCodecError {
    /// Old profiles never acquire bookmark semantics through an untrusted payload.
    #[error("bookmarks require the explicit rich V4 context")]
    UnsupportedContext,
    /// Complete input exceeds the independent 2 KiB boundary.
    #[error("bookmark payload exceeds its byte budget")]
    Limit,
    /// Strict decoding failed.
    #[error(transparent)]
    Json(#[from] JsonFailure),
    /// A native identity or name was rejected.
    #[error(transparent)]
    Value(#[from] RichBookmarkError),
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct SetRequest {
    block: String,
    #[serde(deserialize_with = "nullable")]
    name: Option<String>,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct RenameRequest {
    from: String,
    to: String,
}
/// `name` is required; `null` is its explicit clear value.
fn nullable<'de, D: Deserializer<'de>>(d: D) -> Result<Option<String>, D::Error> {
    Option::<String>::deserialize(d)
}

fn admit(context: &EditorContext, input: &str) -> Result<(), RichBookmarkCodecError> {
    if !context.schema().supports_rich_bookmarks() {
        return Err(RichBookmarkCodecError::UnsupportedContext);
    }
    if input.len() > 2 * 1024 {
        return Err(RichBookmarkCodecError::Limit);
    }
    Ok(())
}

/// Decode `{"block": id, "name": name}` (set or replace) or `{"block": id, "name": null}`
/// (clear). The name must already be in the bookmark grammar; nothing is repaired.
/// # Errors
/// Rejects non-V4 context, unknown/duplicate/missing fields, wrong types, an invalid
/// block identity or name and the byte budget.
pub fn decode_rich_set_bookmark_command(
    context: &EditorContext,
    input: &str,
) -> Result<(BlockId, Option<RichBookmarkName>), RichBookmarkCodecError> {
    admit(context, input)?;
    let r: SetRequest = serde_json::from_str(input).map_err(|e| JsonFailure::from_serde(&e))?;
    let block = BlockId::try_new(r.block).map_err(|_| RichBookmarkError::Target)?;
    Ok((block, r.name.map(RichBookmarkName::try_new).transpose()?))
}

/// Decode `{"from": name, "to": name}`.
/// # Errors
/// Rejects non-V4 context, unknown/duplicate/missing fields, wrong types, invalid names
/// and the byte budget.
pub fn decode_rich_rename_bookmark_command(
    context: &EditorContext,
    input: &str,
) -> Result<(RichBookmarkName, RichBookmarkName), RichBookmarkCodecError> {
    admit(context, input)?;
    let r: RenameRequest = serde_json::from_str(input).map_err(|e| JsonFailure::from_serde(&e))?;
    Ok((RichBookmarkName::try_new(r.from)?, RichBookmarkName::try_new(r.to)?))
}
