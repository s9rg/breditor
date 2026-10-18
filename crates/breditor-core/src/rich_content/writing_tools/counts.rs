use super::RichWritingError;
use unicode_segmentation::UnicodeSegmentation;

/// Counts of accepted visible body text, without metadata or invented separators.
///
/// Each paragraph/heading/code domain is segmented after concatenating its format
/// runs. Blocks are never joined into a word or grapheme. Newlines and whitespace
/// present in the body count as characters; structural separators do not.
#[derive(Clone, Debug, Default, Eq, PartialEq)]
pub struct RichWritingCounts {
    words: u64,
    graphemes: u64,
    scalars: u64,
    utf16: u64,
    utf8: u64,
    blocks: u64,
}

impl RichWritingCounts {
    /// Unicode word segments containing letters/numbers, not language morphology.
    #[must_use]
    pub const fn words(&self) -> u64 {
        self.words
    }
    /// Extended graphemes, including body whitespace/newlines and emoji clusters.
    #[must_use]
    pub const fn graphemes(&self) -> u64 {
        self.graphemes
    }
    /// Unicode scalar count, distinct from graphemes and UTF-16 positions.
    #[must_use]
    pub const fn unicode_scalars(&self) -> u64 {
        self.scalars
    }
    /// UTF-16 code units in the accepted text, not cross-block editor positions.
    #[must_use]
    pub const fn utf16_units(&self) -> u64 {
        self.utf16
    }
    /// UTF-8 bytes in the accepted text, excluding structure and metadata.
    #[must_use]
    pub const fn utf8_bytes(&self) -> u64 {
        self.utf8
    }
    /// Paragraphs, headings and code blocks, including empty text domains.
    #[must_use]
    pub const fn text_blocks(&self) -> u64 {
        self.blocks
    }

    pub(super) fn add(&mut self, text: &str) -> Result<(), RichWritingError> {
        fn add(total: &mut u64, count: usize) -> Result<(), RichWritingError> {
            *total = total
                .checked_add(u64::try_from(count).map_err(|_| RichWritingError::DocumentLimit)?)
                .ok_or(RichWritingError::DocumentLimit)?;
            Ok(())
        }
        add(&mut self.words, text.unicode_words().count())?;
        add(&mut self.graphemes, text.graphemes(true).count())?;
        add(&mut self.scalars, text.chars().count())?;
        add(&mut self.utf16, text.encode_utf16().count())?;
        add(&mut self.utf8, text.len())?;
        add(&mut self.blocks, 1)
    }
}
