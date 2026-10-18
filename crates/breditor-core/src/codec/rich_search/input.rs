//! Closed optional JSON intentions; neither query nor replacement is a saved command.
use super::RichSearchCodecError;
use crate::rich_content::{
    RICH_SEARCH_MAX_MATCHES, RICH_SEARCH_MAX_PATTERN_BYTES, RICH_SEARCH_MAX_REPLACEMENT_BYTES,
    RichSearchDirection, RichSearchMode, RichSearchQuery, RichSearchReplacement,
    RichSearchReplacementMode, RichSearchResults,
};
use serde::{Deserialize, Deserializer};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Query {
    pattern: String,
    mode: String,
    case_sensitive: bool,
    whole_words: bool,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Replacement {
    text: String,
    mode: String,
}
fn parse<'a, T: Deserialize<'a>>(
    input: &'a str,
    maximum: usize,
) -> Result<T, RichSearchCodecError> {
    if input.len() > maximum {
        return Err(RichSearchCodecError::InputLimit);
    }
    serde_json::from_str(input).map_err(|_| RichSearchCodecError::Input)
}
/// Decode explicit matching policy, admitting worst-case escaped JSON before native byte checks.
/// # Errors
/// Rejects unknown/duplicate/missing fields, wrong types and native pattern bounds.
pub fn decode_rich_search_query(input: &str) -> Result<RichSearchQuery, RichSearchCodecError> {
    let value: Query = parse(input, RICH_SEARCH_MAX_PATTERN_BYTES * 6 + 1024)?;
    Ok(RichSearchQuery::try_new(
        value.pattern,
        match value.mode.as_str() {
            "literal" => RichSearchMode::Literal,
            "regex" => RichSearchMode::Regex,
            _ => return Err(RichSearchCodecError::Input),
        },
        value.case_sensitive,
        value.whole_words,
    )?)
}
/// Decode explicit literal/capture replacement without executing or persisting it.
/// # Errors
/// Rejects encoded/native input bounds, unknown/duplicate/missing fields and wrong types.
pub fn decode_rich_search_replacement(
    input: &str,
) -> Result<RichSearchReplacement, RichSearchCodecError> {
    let value: Replacement = parse(input, RICH_SEARCH_MAX_REPLACEMENT_BYTES * 6 + 1024)?;
    Ok(RichSearchReplacement::try_new(
        value.text,
        match value.mode.as_str() {
            "literal" => RichSearchReplacementMode::Literal,
            "captures" => RichSearchReplacementMode::Captures,
            _ => return Err(RichSearchCodecError::Input),
        },
    )?)
}
/// Decode one canonical zero-based match index as text, never a numeric Wasm bridge value.
/// # Errors
/// Rejects leading zeros, signs, whitespace, nondecimal syntax and the fixed match ceiling.
pub fn decode_rich_search_index(input: &str) -> Result<usize, RichSearchCodecError> {
    if input.is_empty()
        || input.len() > 4
        || !input.bytes().all(|b| b.is_ascii_digit())
        || (input.len() > 1 && input.starts_with('0'))
    {
        return Err(RichSearchCodecError::Input);
    }
    let value = input.parse::<usize>().map_err(|_| RichSearchCodecError::Input)?;
    if value >= RICH_SEARCH_MAX_MATCHES {
        return Err(RichSearchCodecError::Input);
    }
    Ok(value)
}
fn nullable<'de, D: Deserializer<'de>>(reader: D) -> Result<Option<String>, D::Error> {
    Option::<String>::deserialize(reader)
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Navigation {
    #[serde(deserialize_with = "nullable")]
    active: Option<String>,
    direction: String,
    wrap: bool,
}
/// Choose a logical next/previous match in Rust, with explicit null active index and wrap policy.
/// This frozen read neither publishes selection nor grants edit authority.
/// # Errors
/// Rejects malformed/bounded input and indices outside the complete result.
pub fn decode_rich_search_navigation(
    results: &RichSearchResults,
    input: &str,
) -> Result<Option<String>, RichSearchCodecError> {
    let value: Navigation = parse(input, 1024)?;
    let active = value.active.as_deref().map(decode_rich_search_index).transpose()?;
    Ok(results
        .navigate(
            active,
            match value.direction.as_str() {
                "next" => RichSearchDirection::Next,
                "previous" => RichSearchDirection::Previous,
                _ => return Err(RichSearchCodecError::Input),
            },
            value.wrap,
        )?
        .map(|n| n.to_string()))
}
