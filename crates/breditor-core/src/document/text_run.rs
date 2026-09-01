use thiserror::Error;

use crate::document::{FormatSet, LocalInvariantError, TextNode, Utf16BoundaryError};

/// One non-empty formatted run in an operation fragment.
///
/// Text is preserved exactly; the core never performs Unicode normalization.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct TextRun(TextNode);

impl TextRun {
    /// Creates a non-empty formatted text run.
    ///
    /// # Errors
    ///
    /// Returns [`TextRunError`] when the text is empty or its UTF-16 length does
    /// not fit the leaf-point protocol.
    pub fn try_new(text: impl Into<String>, formats: FormatSet) -> Result<Self, TextRunError> {
        TextNode::try_new(text.into(), formats).map(Self).map_err(TextRunError::from)
    }

    /// Returns the exact Unicode text.
    #[must_use]
    pub fn text(&self) -> &str {
        self.0.text()
    }

    /// Returns the run's canonical semantic formats.
    #[must_use]
    pub fn formats(&self) -> &FormatSet {
        self.0.formats()
    }

    /// Returns the run length in UTF-16 code units.
    #[must_use]
    pub fn utf16_len(&self) -> u32 {
        self.0.utf16_len()
    }

    pub(crate) fn from_text_node(text: &TextNode) -> Self {
        Self(text.clone())
    }

    pub(crate) fn into_text_node(self) -> TextNode {
        self.0
    }

    pub(crate) fn slice_utf16(
        &self,
        start: u32,
        end: u32,
    ) -> Result<Option<Self>, Utf16BoundaryError> {
        if start == end {
            return Ok(None);
        }
        if start == 0 && end == self.utf16_len() {
            return Ok(Some(self.clone()));
        }
        self.0.slice_utf16(start, end).map(|slice| slice.map(Self))
    }

    pub(crate) fn merge(self, other: &Self) -> Result<Self, TextRunError> {
        debug_assert_eq!(self.formats(), other.formats());
        let mut text = String::with_capacity(self.text().len().saturating_add(other.text().len()));
        text.push_str(self.text());
        text.push_str(other.text());
        Self::try_new(text, self.formats().clone())
    }
}

/// Why a text run violates the operation-fragment contract.
#[derive(Clone, Copy, Debug, Eq, Error, PartialEq)]
pub enum TextRunError {
    /// Runs must contain at least one Unicode scalar.
    #[error("a text run cannot be empty")]
    Empty,
    /// The run cannot be addressed by the leaf-point protocol.
    #[error("text-run UTF-16 length exceeds the leaf-point protocol")]
    TooLong,
}

impl From<LocalInvariantError> for TextRunError {
    fn from(value: LocalInvariantError) -> Self {
        match value {
            LocalInvariantError::EmptyText => Self::Empty,
            LocalInvariantError::TextTooLong => Self::TooLong,
            _ => unreachable!("text-run construction checks only text-local invariants"),
        }
    }
}
