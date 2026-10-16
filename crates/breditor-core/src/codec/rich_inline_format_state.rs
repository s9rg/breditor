//! Bounded, read-only presentation of the native rich formatting-state result.
use super::{
    JsonFailure, RichFormatsCodecError, document_encoding::FormatEncoding,
    json_size::JsonByteCounter,
};
use crate::{
    document::FormatSet,
    identity::QualifiedName,
    rich_content::{RichInlineFormatState, local_session::typing_state::validate_formats},
    state::EditorContext,
};
use serde::Serialize;

/// Independent read format; it is not a document, command or persisted history record.
pub const RICH_INLINE_FORMAT_STATE_FORMAT: &str = "breditor/rich-inline-format-state";
/// Exact read envelope and closed state variants.
pub const RICH_INLINE_FORMAT_STATE_VERSION: u32 = 1;
/// Separate selection-coverage read; original node/grid-unavailable read semantics stay exact.
pub const RICH_SELECTION_FORMAT_STATE_FORMAT: &str = "breditor/rich-selection-format-state";
/// Independent selection-format read version, not an original read-family upgrade.
pub const RICH_SELECTION_FORMAT_STATE_VERSION: u32 = 1;
const MAX_BYTES: usize = 64 * 1024;

#[derive(Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
enum State<'a> {
    Unavailable,
    Unset,
    Uniform {
        format: FormatEncoding<'a>,
    },
    Mixed {
        #[serde(rename = "presentEverywhere")]
        present_everywhere: bool,
    },
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
    format_kind: &'a str,
    state: State<'a>,
}

/// Encode a complete exact-property result, with its compiled schema and queried kind.
///
/// A native result can be constructed by a caller, so uniform values are checked
/// against the queried kind and the same compiled property/resource policy.
/// This read contains no publication token and grants no mutation authority.
///
/// # Errors
/// Rejects unknown kinds, incompatible uniform literals and the 64 KiB read budget.
pub fn encode_rich_inline_format_state(
    context: &EditorContext,
    kind: &QualifiedName,
    value: &RichInlineFormatState,
) -> Result<String, RichFormatsCodecError> {
    encode(context, kind, value, RICH_INLINE_FORMAT_STATE_FORMAT, RICH_INLINE_FORMAT_STATE_VERSION)
}

/// Encode the distinct text/node/grid selection-format read using exact native property values.
/// # Errors
/// Rejects unknown kinds, invalid uniform values and the same 64 KiB read budget.
pub fn encode_rich_selection_format_state(
    context: &EditorContext,
    kind: &QualifiedName,
    value: &RichInlineFormatState,
) -> Result<String, RichFormatsCodecError> {
    encode(
        context,
        kind,
        value,
        RICH_SELECTION_FORMAT_STATE_FORMAT,
        RICH_SELECTION_FORMAT_STATE_VERSION,
    )
}
fn encode(
    context: &EditorContext,
    kind: &QualifiedName,
    value: &RichInlineFormatState,
    format: &'static str,
    version: u32,
) -> Result<String, RichFormatsCodecError> {
    if !context.schema().is_rich_content_profile() {
        return Err(RichFormatsCodecError::UnsupportedContext);
    }
    if !context.schema().allows_text_format(kind) {
        return Err(RichFormatsCodecError::Invariant);
    }
    let state = match value {
        RichInlineFormatState::Unavailable => State::Unavailable,
        RichInlineFormatState::Unset => State::Unset,
        RichInlineFormatState::Mixed { present_everywhere } => {
            State::Mixed { present_everywhere: *present_everywhere }
        }
        RichInlineFormatState::Uniform(format) => {
            if format.kind() != kind {
                return Err(RichFormatsCodecError::Invariant);
            }
            let formats = FormatSet::try_from_formats(vec![format.clone()])
                .map_err(|_| RichFormatsCodecError::Invariant)?;
            validate_formats(context, &formats)?;
            State::Uniform { format: FormatEncoding(format) }
        }
    };
    let schema = context.schema();
    let read = Read {
        format,
        format_version: version,
        schema: Binding {
            name: schema.id().name().as_str(),
            version: schema.id().version().get(),
            fingerprint: schema.fingerprint().to_string(),
        },
        format_kind: kind.as_str(),
        state,
    };
    let mut counter = JsonByteCounter::new(MAX_BYTES);
    let result = serde_json::to_writer(&mut counter, &read);
    if counter.exceeded() {
        return Err(RichFormatsCodecError::Limit);
    }
    result.map_err(|error| JsonFailure::from_serde(&error))?;
    serde_json::to_string(&read).map_err(|error| JsonFailure::from_serde(&error).into())
}
