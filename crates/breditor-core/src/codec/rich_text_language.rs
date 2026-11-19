//! Closed explicit V4 text-language intent over the native selection.
use super::JsonFailure;
use crate::{
    rich_content::{RichLanguageTag, RichTextLanguageError},
    state::EditorContext,
};
use serde::{Deserialize, Deserializer, de::Error as _};

/// Payload-free failure for native text-language intent.
#[derive(Debug, thiserror::Error)]
pub enum RichTextLanguageCodecError {
    /// Old profiles never acquire language semantics through an untrusted payload.
    #[error("text language requires the explicit rich V4 context")]
    UnsupportedContext,
    /// Complete input exceeds the independent 1 KiB boundary.
    #[error("text language payload exceeds its byte budget")]
    Limit,
    /// Strict decoding failed.
    #[error(transparent)]
    Json(#[from] JsonFailure),
    /// The tag is not a well-formed bounded language tag.
    #[error(transparent)]
    Value(#[from] RichTextLanguageError),
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Request {
    #[serde(deserialize_with = "required")]
    language: Option<String>,
}
/// The field is mandatory; `null` is the explicit clear intent.
fn required<'de, D: Deserializer<'de>>(d: D) -> Result<Option<String>, D::Error> {
    Option::<String>::deserialize(d)
}

/// Decode `{"language": "<tag>"}` (set) or `{"language": null}` (clear).
///
/// A tag is accepted in any ASCII letter case and returned in its canonical
/// form (language lowercase, script titlecase, region uppercase, variants
/// lowercase), so stored values always compare exactly.
/// # Errors
/// Rejects a non-V4 context, a missing/unknown/duplicate field, a wrong type,
/// a malformed or over-long tag and the byte budget.
pub fn decode_rich_text_language_command(
    context: &EditorContext,
    input: &str,
) -> Result<Option<RichLanguageTag>, RichTextLanguageCodecError> {
    if !context.schema().supports_rich_text_language() {
        return Err(RichTextLanguageCodecError::UnsupportedContext);
    }
    if input.len() > 1024 {
        return Err(RichTextLanguageCodecError::Limit);
    }
    // The request is one JSON object; serde's positional struct form is not an alias.
    if !input.trim_start().starts_with('{') {
        return Err(
            JsonFailure::from_serde(&serde_json::Error::custom("expected an object")).into()
        );
    }
    let r: Request = serde_json::from_str(input).map_err(|e| JsonFailure::from_serde(&e))?;
    Ok(r.language.as_deref().map(RichLanguageTag::canonicalize).transpose()?)
}
