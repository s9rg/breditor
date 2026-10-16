//! Closed explicit V3 layout intent. Missing fields keep values; null removes them.
use super::JsonFailure;
use crate::{
    rich_content::{
        RichBlockAlignment, RichBlockDirection, RichBlockIndent, RichBlockLayoutError,
        RichBlockLayoutPatch, RichLayoutChange, RichLineHeight,
    },
    state::EditorContext,
};
use serde::{Deserialize, Deserializer};

/// Payload-free or bounded diagnostic failure for native block-layout reads and intent.
#[derive(Debug, thiserror::Error)]
pub enum RichBlockLayoutCodecError {
    /// Old profiles never acquire layout semantics through an untrusted payload.
    #[error("block layout requires the explicit rich V3 context")]
    UnsupportedContext,
    /// Complete input/output exceeds the independent 64 KiB boundary.
    #[error("block layout payload exceeds its byte budget")]
    Limit,
    /// Strict decoding or bounded serialization failed.
    #[error(transparent)]
    Json(#[from] JsonFailure),
    /// A native typed value or empty patch was rejected.
    #[error(transparent)]
    Value(#[from] RichBlockLayoutError),
    /// A caller-built read contains contradictory availability or block counts.
    #[error("block layout read invariant failed")]
    Invariant,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
enum Align {
    Start,
    Center,
    End,
    Justify,
    Left,
    Right,
}
#[derive(Deserialize)]
#[serde(rename_all = "lowercase")]
enum Direction {
    Ltr,
    Rtl,
    Auto,
}
fn field<'de, D: Deserializer<'de>, T: Deserialize<'de>>(
    d: D,
) -> Result<RichLayoutChange<T>, D::Error> {
    Ok(Option::<T>::deserialize(d)?.map_or(RichLayoutChange::Clear, RichLayoutChange::Set))
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Request {
    #[serde(default, deserialize_with = "field")]
    alignment: RichLayoutChange<Align>,
    #[serde(default, deserialize_with = "field")]
    direction: RichLayoutChange<Direction>,
    #[serde(default, deserialize_with = "field")]
    indent: RichLayoutChange<u8>,
    #[serde(default, deserialize_with = "field")]
    line_height_percent: RichLayoutChange<u16>,
}
fn convert<T, U>(
    value: RichLayoutChange<T>,
    f: impl FnOnce(T) -> Result<U, RichBlockLayoutError>,
) -> Result<RichLayoutChange<U>, RichBlockLayoutError> {
    Ok(match value {
        RichLayoutChange::Keep => RichLayoutChange::Keep,
        RichLayoutChange::Clear => RichLayoutChange::Clear,
        RichLayoutChange::Set(v) => RichLayoutChange::Set(f(v)?),
    })
}
/// Decode only a nonempty bounded property intent, never caller block IDs or arbitrary CSS.
///
/// Alignment is start/center/end/justify/left/right; direction is ltr/rtl/auto. Indent is 0 through12;
/// line height is an integer percentage100 through300. Native constructors own bounds.
/// # Errors
/// Rejects non-V3 context, unknown/duplicate fields, wrong types/tokens, bounds and byte budgets.
pub fn decode_rich_block_layout_patch(
    context: &EditorContext,
    input: &str,
) -> Result<RichBlockLayoutPatch, RichBlockLayoutCodecError> {
    if context.schema().rich_content_revision() != Some(3) {
        return Err(RichBlockLayoutCodecError::UnsupportedContext);
    }
    if input.len() > 64 * 1024 {
        return Err(RichBlockLayoutCodecError::Limit);
    }
    let r: Request = serde_json::from_str(input).map_err(|e| JsonFailure::from_serde(&e))?;
    Ok(RichBlockLayoutPatch::try_new(
        convert(r.alignment, |v| {
            Ok(match v {
                Align::Start => RichBlockAlignment::Start,
                Align::Center => RichBlockAlignment::Center,
                Align::End => RichBlockAlignment::End,
                Align::Justify => RichBlockAlignment::Justify,
                Align::Left => RichBlockAlignment::Left,
                Align::Right => RichBlockAlignment::Right,
            })
        })?,
        convert(r.direction, |v| {
            Ok(match v {
                Direction::Ltr => RichBlockDirection::LeftToRight,
                Direction::Rtl => RichBlockDirection::RightToLeft,
                Direction::Auto => RichBlockDirection::Auto,
            })
        })?,
        convert(r.indent, RichBlockIndent::try_new)?,
        convert(r.line_height_percent, RichLineHeight::try_new)?,
    )?)
}

/// Encode one typed native intent canonically for exact shared command/journal replay.
///
/// Keep fields are absent, Clear fields are null. Only closed native values are
/// emitted; this never serializes caller targets or an arbitrary property map.
/// # Errors
/// Rejects non-V3 context or a bounded serialization failure.
pub fn encode_rich_block_layout_patch(
    context: &EditorContext,
    patch: &RichBlockLayoutPatch,
) -> Result<String, RichBlockLayoutCodecError> {
    if context.schema().rich_content_revision() != Some(3) {
        return Err(RichBlockLayoutCodecError::UnsupportedContext);
    }
    let mut values = serde_json::Map::new();
    encode_field(&mut values, "alignment", patch.alignment(), RichBlockAlignment::as_str);
    encode_field(&mut values, "direction", patch.direction(), RichBlockDirection::as_str);
    encode_field(&mut values, "indent", patch.indent(), RichBlockIndent::get);
    encode_field(&mut values, "lineHeightPercent", patch.line_height(), RichLineHeight::get);
    serde_json::to_string(&values).map_err(|e| JsonFailure::from_serde(&e).into())
}
fn encode_field<T, U: serde::Serialize>(
    values: &mut serde_json::Map<String, serde_json::Value>,
    name: &str,
    change: RichLayoutChange<T>,
    convert: impl FnOnce(T) -> U,
) {
    match change {
        RichLayoutChange::Keep => {}
        RichLayoutChange::Clear => {
            values.insert(name.into(), serde_json::Value::Null);
        }
        RichLayoutChange::Set(value) => {
            values.insert(name.into(), serde_json::json!(convert(value)));
        }
    }
}
