//! Optional bounded writing read; no command, checkpoint or editable source proof.
use super::json_size::JsonByteCounter;
use crate::rich_content::{RichDocument, RichWritingError, inspect_rich_writing_tools};
use serde::Serialize;

/// Independent immutable writing-read family, never a saved document setting.
pub const RICH_WRITING_TOOLS_FORMAT: &str = "breditor/rich-writing-tools";
/// Original writing-read contract revision.
pub const RICH_WRITING_TOOLS_VERSION: u32 = 1;
/// Complete encoded JSON ceiling; oversize rejects rather than returning a prefix.
pub const RICH_WRITING_TOOLS_MAX_JSON_BYTES: usize = 8 * 1024 * 1024;

/// Payload-free writing-read encoding failure.
#[derive(Debug, thiserror::Error)]
pub enum RichWritingCodecError {
    /// The complete native document read failed admission or traversal policy.
    #[error(transparent)]
    Read(#[from] RichWritingError),
    /// Escaped output exceeds the separate complete-read byte ceiling.
    #[error("writing read exceeds its encoded byte budget")]
    ReadLimit,
    /// A contradiction of the private serialization contract.
    #[error("writing read encoding failed")]
    Encoding,
}
#[derive(Serialize)]
struct Binding<'a> {
    name: &'a str,
    version: u32,
    fingerprint: String,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Counts {
    words: String,
    graphemes: String,
    unicode_scalars: String,
    utf16_units: String,
    utf8_bytes: String,
    text_blocks: String,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Heading<'a> {
    block: &'a str,
    level: u8,
    label: &'a str,
    label_truncated: bool,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Read<'a> {
    format: &'static str,
    format_version: u32,
    schema: Binding<'a>,
    document: &'a str,
    revision: String,
    counts: Counts,
    outline: Vec<Heading<'a>>,
}

/// Derive and encode complete writing metadata from this exact admitted document.
///
/// The revision is supplied by the guarded owner, not a whole-document text offset
/// or a transferable mutation credential. Computing counts here avoids accepting
/// an independently constructed summary bound to the wrong document.
/// # Errors
/// Rejects native traversal/encoded size limits and private serialization failures
/// before returning any output. Reading never changes the document or history.
pub fn encode_rich_writing_tools(
    document: &RichDocument,
    revision: u64,
) -> Result<String, RichWritingCodecError> {
    let tools = inspect_rich_writing_tools(document)?;
    let counts = tools.counts();
    let schema = document.document().schema();
    let value = Read {
        format: RICH_WRITING_TOOLS_FORMAT,
        format_version: RICH_WRITING_TOOLS_VERSION,
        schema: Binding {
            name: schema.name().as_str(),
            version: schema.version().get(),
            fingerprint: document.document().schema_fingerprint().to_string(),
        },
        document: document.id().as_str(),
        revision: revision.to_string(),
        counts: Counts {
            words: counts.words().to_string(),
            graphemes: counts.graphemes().to_string(),
            unicode_scalars: counts.unicode_scalars().to_string(),
            utf16_units: counts.utf16_units().to_string(),
            utf8_bytes: counts.utf8_bytes().to_string(),
            text_blocks: counts.text_blocks().to_string(),
        },
        outline: tools
            .outline()
            .iter()
            .map(|entry| Heading {
                block: entry.block().as_str(),
                level: entry.level(),
                label: entry.label(),
                label_truncated: entry.label_truncated(),
            })
            .collect(),
    };
    let mut counter = JsonByteCounter::new(RICH_WRITING_TOOLS_MAX_JSON_BYTES);
    let encoded = serde_json::to_writer(&mut counter, &value);
    if counter.exceeded() {
        return Err(RichWritingCodecError::ReadLimit);
    }
    encoded.map_err(|_| RichWritingCodecError::Encoding)?;
    serde_json::to_string(&value).map_err(|_| RichWritingCodecError::Encoding)
}
