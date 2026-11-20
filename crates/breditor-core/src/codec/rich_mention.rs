//! Closed explicit V4 mention entity intent: `{"kind", "id", "label"}`.
use super::JsonFailure;
use crate::{
    rich_content::{
        RichMention, RichMentionError, RichMentionId, RichMentionKind, RichMentionLabel,
    },
    state::EditorContext,
};
use serde::{Deserialize, de::Error as _};

/// Payload-free failure for native mention intent.
#[derive(Debug, thiserror::Error)]
pub enum RichMentionCodecError {
    /// Old profiles never acquire mention semantics through an untrusted payload.
    #[error("mentions require the explicit rich V4 context")]
    UnsupportedContext,
    /// Complete input exceeds the independent 2 KiB boundary.
    #[error("mention payload exceeds its byte budget")]
    Limit,
    /// Strict decoding failed.
    #[error(transparent)]
    Json(#[from] JsonFailure),
    /// A kind, id or label was rejected.
    #[error(transparent)]
    Value(#[from] RichMentionError),
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Request {
    kind: String,
    id: String,
    label: String,
}

/// Decode one entity reference `{"kind": "user"|"page"|"tag", "id": …, "label": …}`.
///
/// Values are admitted exactly: no case folding, trimming or normalization is
/// performed, so the stored identity is the host's own id.
/// # Errors
/// Rejects a non-V4 context, a non-object, missing/unknown/duplicate fields,
/// wrong types, out-of-domain values and the byte budget.
pub fn decode_rich_mention(
    context: &EditorContext,
    input: &str,
) -> Result<RichMention, RichMentionCodecError> {
    if !context.schema().supports_rich_mentions() {
        return Err(RichMentionCodecError::UnsupportedContext);
    }
    if input.len() > 2 * 1024 {
        return Err(RichMentionCodecError::Limit);
    }
    // The request is one JSON object; serde's positional struct form is not an alias.
    if !input.trim_start().starts_with('{') {
        return Err(
            JsonFailure::from_serde(&serde_json::Error::custom("expected an object")).into()
        );
    }
    let r: Request = serde_json::from_str(input).map_err(|e| JsonFailure::from_serde(&e))?;
    Ok(RichMention::new(
        RichMentionKind::parse(&r.kind)?,
        RichMentionId::try_new(&r.id)?,
        RichMentionLabel::try_new(&r.label)?,
    ))
}
