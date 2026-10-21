//! Closed independent comment-generation framing and explicit new-family budgets.
use super::super::{ReviewError, ReviewEventId, event::Event};
use serde::{Deserialize, Serialize};

pub(in crate::rich_content::review) const MAX_RETAINED_EVENTS: usize = 65_536;
pub(super) const MAX_GENERATIONS: usize = 64;
pub(super) const MAX_ARCHIVE_BYTES: usize = 64 * 1024 * 1024;
pub(super) const ARCHIVE_FORMAT: &str = "breditor/review-segmented-history-session";
pub(super) const SEGMENT_FORMAT: &str = "breditor/review-history-segment";

#[derive(Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub(super) struct Archive {
    pub format: String,
    pub format_version: u32,
    pub root_generation: String,
    pub root: String,
    pub sealed: Vec<String>,
    pub active: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct ArchiveRef<'a> {
    pub format: &'a str,
    pub format_version: u32,
    pub root_generation: &'a str,
    pub root: &'a str,
    pub sealed: Vec<&'a str>,
    pub active: &'a str,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub(super) struct Segment {
    pub format: String,
    pub format_version: u32,
    pub generation: String,
    pub parent_generation: String,
    pub parent_sha256: String,
    pub event_offset: usize,
    pub events: Vec<Event>,
    pub history: Vec<ReviewEventId>,
    pub cursor: usize,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct SegmentRef<'a> {
    pub format: &'a str,
    pub format_version: u32,
    pub generation: &'a str,
    pub parent_generation: &'a str,
    pub parent_sha256: &'a str,
    pub event_offset: usize,
    pub events: &'a [Event],
    pub history: &'a [ReviewEventId],
    pub cursor: usize,
}

pub(super) fn generation_id(value: &str) -> Result<(), ReviewError> {
    if value.is_empty()
        || value.len() > 128
        || !value.as_bytes()[0].is_ascii_alphanumeric()
        || !value.bytes().all(|b| b.is_ascii_alphanumeric() || b"._:-".contains(&b))
    {
        return Err(ReviewError::Identity);
    }
    Ok(())
}

pub(super) fn generation_budget(files: usize, events: usize) -> Result<(), ReviewError> {
    if files > MAX_GENERATIONS {
        return Err(ReviewError::Limit("review history generations"));
    }
    if events > MAX_RETAINED_EVENTS {
        return Err(ReviewError::Limit("retained review events"));
    }
    Ok(())
}
