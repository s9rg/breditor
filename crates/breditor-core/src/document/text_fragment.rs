use std::sync::Arc;

use thiserror::Error;

use crate::{
    document::{TextRun, TextRunError},
    position::{TextOffset, TextOffsetError},
};

/// A canonical sequence of formatted text runs used by text operations.
///
/// The empty fragment is valid and represents no text. Non-empty runs may not
/// be adjacent when their format sets are equal; such runs must be merged.
#[derive(Clone, Debug, Default, Eq, PartialEq)]
pub struct TextFragment {
    runs: Arc<[TextRun]>,
    utf16_length: TextOffset,
    text_bytes: usize,
}

impl TextFragment {
    /// Returns the canonical empty fragment.
    #[must_use]
    pub fn empty() -> Self {
        Self::default()
    }

    /// Creates a fragment from already-canonical runs.
    ///
    /// # Errors
    ///
    /// Returns [`TextFragmentError`] when adjacent runs have equal formats or
    /// their aggregate UTF-16 length exceeds the cross-language protocol bound.
    pub fn try_from_runs(runs: Vec<TextRun>) -> Result<Self, TextFragmentError> {
        for (left_index, pair) in runs.windows(2).enumerate() {
            if pair[0].formats() == pair[1].formats() {
                return Err(TextFragmentError::AdjacentEqualFormats {
                    left_index,
                    right_index: left_index + 1,
                });
            }
        }

        let mut utf16_length = TextOffset::ZERO;
        let mut text_bytes = 0_usize;
        for run in &runs {
            utf16_length = utf16_length.checked_add(u64::from(run.utf16_len()))?;
            text_bytes = text_bytes
                .checked_add(run.text().len())
                .ok_or(TextFragmentError::TextByteLengthOverflow)?;
        }
        Ok(Self { runs: Arc::from(runs), utf16_length, text_bytes })
    }

    /// Returns whether the fragment contains no text.
    #[must_use]
    pub fn is_empty(&self) -> bool {
        self.runs.is_empty()
    }

    /// Returns the number of canonical runs.
    #[must_use]
    pub fn len(&self) -> usize {
        self.runs.len()
    }

    /// Returns the aggregate length in UTF-16 code units.
    #[must_use]
    pub const fn utf16_len(&self) -> TextOffset {
        self.utf16_length
    }

    /// Returns the aggregate UTF-8 byte length.
    #[must_use]
    pub const fn text_bytes(&self) -> usize {
        self.text_bytes
    }

    /// Iterates over canonical runs.
    #[must_use]
    pub fn iter(&self) -> TextFragmentIter<'_> {
        TextFragmentIter(self.runs.iter())
    }
}

impl From<TextRun> for TextFragment {
    fn from(value: TextRun) -> Self {
        let utf16_length = TextOffset::from(value.utf16_len());
        let text_bytes = value.text().len();
        Self { runs: Arc::from([value]), utf16_length, text_bytes }
    }
}

/// Iterator over a canonical text fragment's runs.
pub struct TextFragmentIter<'a>(std::slice::Iter<'a, TextRun>);

impl<'a> Iterator for TextFragmentIter<'a> {
    type Item = &'a TextRun;

    fn next(&mut self) -> Option<Self::Item> {
        self.0.next()
    }

    fn size_hint(&self) -> (usize, Option<usize>) {
        self.0.size_hint()
    }
}

impl DoubleEndedIterator for TextFragmentIter<'_> {
    fn next_back(&mut self) -> Option<Self::Item> {
        self.0.next_back()
    }
}

impl ExactSizeIterator for TextFragmentIter<'_> {}
impl std::iter::FusedIterator for TextFragmentIter<'_> {}

impl<'a> IntoIterator for &'a TextFragment {
    type Item = &'a TextRun;
    type IntoIter = TextFragmentIter<'a>;

    fn into_iter(self) -> Self::IntoIter {
        self.iter()
    }
}

/// Why a run sequence cannot become a canonical [`TextFragment`].
#[derive(Clone, Debug, Eq, Error, PartialEq)]
pub enum TextFragmentError {
    /// Adjacent runs with equal formats must be represented as one run.
    #[error("text runs {left_index} and {right_index} have equal formats and must be merged")]
    AdjacentEqualFormats {
        /// Index of the left run.
        left_index: usize,
        /// Index of the right run.
        right_index: usize,
    },
    /// Aggregate UTF-16 length is not representable by the protocol.
    #[error(transparent)]
    TextOffset(#[from] TextOffsetError),
    /// Aggregate UTF-8 byte length exceeded the host's addressable size.
    #[error("text-fragment byte length overflowed")]
    TextByteLengthOverflow,
    /// Merging two canonical neighboring runs exceeded the leaf protocol.
    #[error(transparent)]
    TextRun(#[from] TextRunError),
}
