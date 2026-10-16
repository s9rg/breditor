//! Separate bounded read family for independent exact layout fields; no mutation authority.
use super::{JsonFailure, RichBlockLayoutCodecError, json_size::JsonByteCounter};
use crate::{
    rich_content::{
        RichBlockAlignment, RichBlockDirection, RichBlockLayoutState, RichLayoutFieldState,
    },
    state::EditorContext,
};
use serde::Serialize;
/// Read-only exact field-state envelope.
pub const RICH_BLOCK_LAYOUT_STATE_FORMAT: &str = "breditor/rich-block-layout-state";
/// Original closed read revision, independent from saved documents and histories.
pub const RICH_BLOCK_LAYOUT_STATE_VERSION: u32 = 1;
#[derive(Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
enum Field<T> {
    Unavailable,
    Uniform { value: Option<T> },
    Mixed,
}
fn field<T: Copy, U>(
    s: RichLayoutFieldState<T>,
    count: u64,
    f: impl FnOnce(T) -> U,
) -> Result<Field<U>, RichBlockLayoutCodecError> {
    match s {
        RichLayoutFieldState::Unavailable if count == 0 => Ok(Field::Unavailable),
        RichLayoutFieldState::Uniform(value) if count > 0 => {
            Ok(Field::Uniform { value: value.map(f) })
        }
        RichLayoutFieldState::Mixed if count > 1 => Ok(Field::Mixed),
        _ => Err(RichBlockLayoutCodecError::Invariant),
    }
}
#[derive(Serialize)]
struct Binding<'a> {
    name: &'a str,
    version: u32,
    fingerprint: String,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Read<'a> {
    format: &'static str,
    format_version: u32,
    schema: Binding<'a>,
    blocks: String,
    alignment: Field<&'static str>,
    direction: Field<&'static str>,
    indent: Field<u8>,
    line_height_percent: Field<u16>,
}
/// Encode native exact field states, retaining inheritance as null and mixed values as mixed.
/// # Errors
/// Rejects non-V3 context, contradictory caller-built state and bounded serialization failure.
pub fn encode_rich_block_layout_state(
    context: &EditorContext,
    value: &RichBlockLayoutState,
) -> Result<String, RichBlockLayoutCodecError> {
    if context.schema().rich_content_revision() != Some(3) {
        return Err(RichBlockLayoutCodecError::UnsupportedContext);
    }
    let s = context.schema();
    let read = Read {
        format: RICH_BLOCK_LAYOUT_STATE_FORMAT,
        format_version: RICH_BLOCK_LAYOUT_STATE_VERSION,
        schema: Binding {
            name: s.id().name().as_str(),
            version: s.id().version().get(),
            fingerprint: s.fingerprint().to_string(),
        },
        blocks: value.blocks.to_string(),
        alignment: field(value.alignment, value.blocks, |a| match a {
            RichBlockAlignment::Start => "start",
            RichBlockAlignment::Center => "center",
            RichBlockAlignment::End => "end",
            RichBlockAlignment::Justify => "justify",
            RichBlockAlignment::Left => "left",
            RichBlockAlignment::Right => "right",
        })?,
        direction: field(value.direction, value.blocks, |d| match d {
            RichBlockDirection::LeftToRight => "ltr",
            RichBlockDirection::RightToLeft => "rtl",
            RichBlockDirection::Auto => "auto",
        })?,
        indent: field(value.indent, value.blocks, crate::rich_content::RichBlockIndent::get)?,
        line_height_percent: field(
            value.line_height,
            value.blocks,
            crate::rich_content::RichLineHeight::get,
        )?,
    };
    let mut counter = JsonByteCounter::new(64 * 1024);
    let result = serde_json::to_writer(&mut counter, &read);
    if counter.exceeded() {
        return Err(RichBlockLayoutCodecError::Limit);
    }
    result.map_err(|e| JsonFailure::from_serde(&e))?;
    serde_json::to_string(&read).map_err(|e| JsonFailure::from_serde(&e).into())
}
