use super::{RichHeadingOutlineEntry, RichWritingCounts};

/// Complete detached read of one immutable accepted rich-document snapshot.
///
/// It carries neither a live owner, a causal writer nor mutation authority.
/// Pending proposals, comments, asset metadata, list markers and hidden tables
/// are not body content. Captions, code and each visible merged source count once.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct RichWritingTools {
    pub(super) counts: RichWritingCounts,
    pub(super) outline: Vec<RichHeadingOutlineEntry>,
}
impl RichWritingTools {
    /// Whole accepted document counts, independent of the current selection.
    #[must_use]
    pub const fn counts(&self) -> &RichWritingCounts {
        &self.counts
    }
    /// Headings in presentation order; labels have explicit truncation metadata.
    #[must_use]
    pub fn outline(&self) -> &[RichHeadingOutlineEntry] {
        &self.outline
    }
}
