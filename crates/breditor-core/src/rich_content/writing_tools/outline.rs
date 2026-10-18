use super::RICH_WRITING_OUTLINE_LABEL_BYTES;
use crate::rich_content::BlockId;
use unicode_segmentation::UnicodeSegmentation;

/// A heading in semantic presentation order, with its durable content identity.
///
/// Levels may skip ranks; no synthetic parent headings are invented. This entry
/// is read data, not permission to edit or a fresh publication token.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct RichHeadingOutlineEntry {
    block: BlockId,
    level: u8,
    label: String,
    truncated: bool,
}
impl RichHeadingOutlineEntry {
    /// Stable admitted heading identity, never a snapshot-local DOM/path key.
    #[must_use]
    pub const fn block(&self) -> &BlockId {
        &self.block
    }
    /// Original heading rank, from one through six.
    #[must_use]
    pub const fn level(&self) -> u8 {
        self.level
    }
    /// Body label without format metadata, HTML, normalization or synthetic text.
    #[must_use]
    pub fn label(&self) -> &str {
        &self.label
    }
    /// Whether the label's explicit byte budget omitted any source graphemes.
    #[must_use]
    pub const fn label_truncated(&self) -> bool {
        self.truncated
    }

    pub(super) fn new(block: BlockId, level: u8, text: &str) -> Self {
        let mut bytes = 0;
        for grapheme in text.graphemes(true) {
            if grapheme.len() > RICH_WRITING_OUTLINE_LABEL_BYTES - bytes {
                break;
            }
            bytes += grapheme.len();
        }
        Self { block, level, label: text[..bytes].to_owned(), truncated: bytes < text.len() }
    }
}
