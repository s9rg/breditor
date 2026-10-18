//! Complete immutable match metadata, without copying matched text or captures into every row.
use super::RichSearchCodecError;
use crate::{
    codec::json_size::JsonByteCounter,
    rich_content::{RichDocument, RichSearchResults},
};
use serde::Serialize;

/// Optional immutable search read family, not a command/checkpoint or writer credential.
pub const RICH_SEARCH_RESULTS_FORMAT: &str = "breditor/rich-search-results";
/// Exact original metadata read revision.
pub const RICH_SEARCH_RESULTS_VERSION: u32 = 1;
/// Complete JSON metadata ceiling; oversized output fails rather than returning a prefix.
pub const RICH_SEARCH_RESULTS_MAX_JSON_BYTES: usize = 4 * 1024 * 1024;
#[derive(Serialize)]
struct Binding<'a> {
    name: &'a str,
    version: u32,
    fingerprint: String,
}
#[derive(Serialize)]
struct Match<'a> {
    block: &'a str,
    start: String,
    end: String,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Read<'a> {
    format: &'static str,
    format_version: u32,
    schema: Binding<'a>,
    document: &'a str,
    count: String,
    capture_count: String,
    matches: Vec<Match<'a>>,
}

/// Encode all matches after exact source proof. Indices/counts/UTF-16 offsets are decimal strings.
/// Matched text, query/templates and capture contents are deliberately absent.
/// # Errors
/// Rejects a stale/foreign source and encoded byte overflow without returning a truncated read.
pub fn encode_rich_search_results(
    document: &RichDocument,
    results: &RichSearchResults,
) -> Result<String, RichSearchCodecError> {
    results.validate_for(document)?;
    let schema = document.document().schema();
    let read = Read {
        format: RICH_SEARCH_RESULTS_FORMAT,
        format_version: RICH_SEARCH_RESULTS_VERSION,
        schema: Binding {
            name: schema.name().as_str(),
            version: schema.version().get(),
            fingerprint: document.document().schema_fingerprint().to_string(),
        },
        document: document.id().as_str(),
        count: results.matches().len().to_string(),
        capture_count: results.capture_count().to_string(),
        matches: results
            .matches()
            .iter()
            .map(|found| Match {
                block: found.block().as_str(),
                start: found.start().get().to_string(),
                end: found.end().get().to_string(),
            })
            .collect(),
    };
    let mut counter = JsonByteCounter::new(RICH_SEARCH_RESULTS_MAX_JSON_BYTES);
    let encoded = serde_json::to_writer(&mut counter, &read);
    if counter.exceeded() {
        return Err(RichSearchCodecError::ReadLimit);
    }
    encoded.map_err(|_| RichSearchCodecError::Encoding)?;
    serde_json::to_string(&read).map_err(|_| RichSearchCodecError::Encoding)
}
