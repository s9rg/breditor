use std::sync::Arc;

use thiserror::Error;

use crate::{
    document::{TextRun, TextRunError, Utf16BoundaryError},
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

    /// Splits this fragment at one aggregate UTF-16 scalar boundary.
    ///
    /// Either result may be empty. A split within a run preserves its exact
    /// format set on both sides; no Unicode normalization is performed.
    ///
    /// # Errors
    ///
    /// Returns [`TextFragmentSplitError`] when `offset` is outside this
    /// fragment, lands inside a surrogate pair, or rebuilding either canonical
    /// half violates the cross-language fragment contract.
    pub fn split_at(&self, offset: TextOffset) -> Result<(Self, Self), TextFragmentSplitError> {
        if offset > self.utf16_length {
            return Err(TextFragmentSplitError::OffsetOutOfBounds {
                requested: offset,
                length: self.utf16_length,
            });
        }

        let mut left = Vec::new();
        let mut right = Vec::new();
        let mut cursor = TextOffset::ZERO;
        for run in self.runs.iter() {
            let end = cursor.checked_add(u64::from(run.utf16_len()))?;
            if offset <= cursor {
                right.push(run.clone());
            } else if offset >= end {
                left.push(run.clone());
            } else {
                let local = u32::try_from(offset.get() - cursor.get())
                    .map_err(|_| TextFragmentSplitError::CoordinateOverflow)?;
                if let Some(run) =
                    run.slice_utf16(0, local).map_err(|error| map_split_boundary(error, offset))?
                {
                    left.push(run);
                }
                if let Some(run) = run
                    .slice_utf16(local, run.utf16_len())
                    .map_err(|error| map_split_boundary(error, offset))?
                {
                    right.push(run);
                }
            }
            cursor = end;
        }

        Ok((Self::try_from_runs(left)?, Self::try_from_runs(right)?))
    }

    /// Concatenates two canonical fragments and merges an equal-format seam.
    ///
    /// # Errors
    ///
    /// Returns [`TextFragmentError`] when the merged seam cannot fit one text
    /// leaf or the aggregate fragment exceeds a fixed-width protocol bound.
    pub fn try_concat(&self, other: &Self) -> Result<Self, TextFragmentError> {
        let mut runs: Vec<_> = self.iter().cloned().collect();
        for run in other {
            match runs.last_mut() {
                Some(left) if left.formats() == run.formats() => {
                    *left = left.clone().merge(run)?;
                }
                _ => runs.push(run.clone()),
            }
        }
        Self::try_from_runs(runs)
    }
}

fn map_split_boundary(error: Utf16BoundaryError, requested: TextOffset) -> TextFragmentSplitError {
    match error {
        Utf16BoundaryError::SplitsScalar { .. } => {
            TextFragmentSplitError::OffsetSplitsScalar { requested }
        }
        Utf16BoundaryError::OutOfBounds { .. } => TextFragmentSplitError::CoordinateOverflow,
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

/// Why a canonical text fragment cannot be split at a requested boundary.
#[derive(Clone, Debug, Eq, Error, PartialEq)]
pub enum TextFragmentSplitError {
    /// The aggregate offset exceeds the fragment length.
    #[error("text-fragment split offset {requested:?} exceeds fragment length {length:?}")]
    OffsetOutOfBounds {
        /// Rejected split boundary.
        requested: TextOffset,
        /// Complete fragment length.
        length: TextOffset,
    },
    /// The aggregate offset lands inside a non-BMP scalar's surrogate pair.
    #[error("text-fragment split offset {requested:?} splits a Unicode scalar")]
    OffsetSplitsScalar {
        /// Rejected split boundary.
        requested: TextOffset,
    },
    /// Checked local-run coordinate conversion failed.
    #[error("text-fragment split coordinate arithmetic overflowed")]
    CoordinateOverflow,
    /// Aggregate UTF-16 arithmetic exceeded the protocol boundary.
    #[error(transparent)]
    TextOffset(#[from] TextOffsetError),
    /// Rebuilding one canonical half failed.
    #[error(transparent)]
    Fragment(#[from] TextFragmentError),
}
