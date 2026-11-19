//! Closed explicit V4 list-numbering intent. Missing fields keep values; null clears a style.
use super::JsonFailure;
use crate::{
    block::OrderedListStart,
    rich_content::{
        BlockId, RichLayoutChange, RichListNumberStyle, RichListNumberingError,
        RichListNumberingPatch,
    },
    state::EditorContext,
};
use serde::{Deserialize, Deserializer};

/// Payload-free or bounded diagnostic failure for native list-numbering intent.
#[derive(Debug, thiserror::Error)]
pub enum RichListNumberingCodecError {
    /// Old profiles never acquire numbering semantics through an untrusted payload.
    #[error("list numbering requires the explicit rich V4 context")]
    UnsupportedContext,
    /// Complete input exceeds the independent 64 KiB boundary.
    #[error("list numbering payload exceeds its byte budget")]
    Limit,
    /// Strict decoding failed.
    #[error(transparent)]
    Json(#[from] JsonFailure),
    /// A native typed value, identity or empty patch was rejected.
    #[error(transparent)]
    Value(#[from] RichListNumberingError),
}

fn style<'de, D: Deserializer<'de>>(d: D) -> Result<RichLayoutChange<String>, D::Error> {
    Ok(Option::<String>::deserialize(d)?.map_or(RichLayoutChange::Clear, RichLayoutChange::Set))
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Request {
    list: String,
    #[serde(default, deserialize_with = "style")]
    style: RichLayoutChange<String>,
    #[serde(default, deserialize_with = "present")]
    reversed: Option<bool>,
    #[serde(default, deserialize_with = "present")]
    start: Option<u32>,
}
/// A present field must hold its value; `null` is not a synonym for keep.
fn present<'de, D: Deserializer<'de>, T: Deserialize<'de>>(d: D) -> Result<Option<T>, D::Error> {
    T::deserialize(d).map(Some)
}

/// Decode one target list and a nonempty bounded numbering intent.
///
/// `style` is one of `decimal`, `lower-alpha`, `upper-alpha`, `lower-roman`,
/// `upper-roman`, or `null` to remove an authored style. `reversed` is a Boolean;
/// `false` removes the flag. `start` is a positive ordinal. Omitted fields keep
/// their observed values. Native admission still checks the ordinal ceiling.
/// # Errors
/// Rejects non-V4 context, unknown/duplicate fields, wrong types/tokens, an
/// empty patch, invalid identities/ordinals and byte budgets.
pub fn decode_rich_list_numbering_command(
    context: &EditorContext,
    input: &str,
) -> Result<(BlockId, RichListNumberingPatch), RichListNumberingCodecError> {
    if !context.schema().supports_rich_list_numbering() {
        return Err(RichListNumberingCodecError::UnsupportedContext);
    }
    if input.len() > 64 * 1024 {
        return Err(RichListNumberingCodecError::Limit);
    }
    let r: Request = serde_json::from_str(input).map_err(|e| JsonFailure::from_serde(&e))?;
    let list = BlockId::try_new(r.list).map_err(|_| RichListNumberingError::Target)?;
    let style = match r.style {
        RichLayoutChange::Keep => RichLayoutChange::Keep,
        RichLayoutChange::Clear => RichLayoutChange::Clear,
        RichLayoutChange::Set(token) => RichLayoutChange::Set(
            RichListNumberStyle::from_token(&token).ok_or(RichListNumberingError::Value)?,
        ),
    };
    let start = r
        .start
        .map(|value| OrderedListStart::try_new(value).map_err(|_| RichListNumberingError::Value))
        .transpose()?;
    Ok((list, RichListNumberingPatch::try_new(style, r.reversed, start)?))
}
