//! Checked semantic replay input; no regex query or unchecked source-coordinate decoder.
use super::{RICH_SEARCH_MAX_INSERTED_BYTES, RichSearchError};
use crate::{position::TextOffset, rich_content::BlockId};
use std::fmt;

/// One requested source interval and exact inserted text for checked native replay.
///
/// This value alone proves neither a search match nor document/writer authority.
/// The plan constructor validates every target against the complete source and
/// derives formatting there; it never re-runs a persisted query.
#[derive(Clone, Eq, PartialEq)]
pub struct RichSearchTextReplacement {
    pub(super) block: BlockId,
    pub(super) start: TextOffset,
    pub(super) end: TextOffset,
    pub(super) text: String,
}
impl RichSearchTextReplacement {
    /// Capture bounded text and ordered syntactic coordinates; the native plan
    /// additionally checks existence, visibility, scalar alignment and ordering.
    /// # Errors
    /// Rejects reversed coordinates and per-request insertion overflow before copying.
    pub fn try_new(
        block: BlockId,
        start: TextOffset,
        end: TextOffset,
        text: impl AsRef<str>,
    ) -> Result<Self, RichSearchError> {
        if start > end {
            return Err(RichSearchError::ReplacementTarget);
        }
        let text = text.as_ref();
        if text.len() > RICH_SEARCH_MAX_INSERTED_BYTES {
            return Err(RichSearchError::ReplacementLimit);
        }
        Ok(Self { block, start, end, text: text.to_owned() })
    }
}
impl fmt::Debug for RichSearchTextReplacement {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("RichSearchTextReplacement")
            .field("block", &self.block)
            .field("start", &self.start)
            .field("end", &self.end)
            .field("text_bytes", &self.text.len())
            .finish_non_exhaustive()
    }
}
