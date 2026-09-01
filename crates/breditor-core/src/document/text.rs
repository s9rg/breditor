use std::sync::Arc;

use crate::document::{FormatSet, LocalInvariantError};

/// An immutable non-empty text leaf.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct TextNode {
    text: Arc<str>,
    formats: FormatSet,
    utf16_length: u32,
}

impl TextNode {
    /// Returns the exact Unicode text without normalization.
    #[must_use]
    pub fn text(&self) -> &str {
        &self.text
    }

    /// Returns the canonical semantic format set.
    #[must_use]
    pub fn formats(&self) -> &FormatSet {
        &self.formats
    }

    /// Returns the text length in UTF-16 code units.
    #[must_use]
    pub fn utf16_len(&self) -> u32 {
        self.utf16_length
    }

    pub(crate) fn try_new(text: String, formats: FormatSet) -> Result<Self, LocalInvariantError> {
        if text.is_empty() {
            return Err(LocalInvariantError::EmptyText);
        }
        let utf16_length = u32::try_from(text.encode_utf16().count())
            .map_err(|_| LocalInvariantError::TextTooLong)?;
        Ok(Self { text: Arc::from(text), formats, utf16_length })
    }

    pub(crate) fn byte_offset_at_utf16(&self, requested: u32) -> Result<usize, Utf16BoundaryError> {
        let mut utf16_offset = 0_u32;
        for (byte_offset, character) in self.text.char_indices() {
            if requested == utf16_offset {
                return Ok(byte_offset);
            }

            let scalar_width = if u32::from(character) <= 0xFFFF { 1 } else { 2 };
            let next = utf16_offset + scalar_width;
            if requested < next {
                return Err(Utf16BoundaryError::SplitsScalar { offset: requested });
            }
            utf16_offset = next;
        }

        if requested == utf16_offset {
            Ok(self.text.len())
        } else {
            Err(Utf16BoundaryError::OutOfBounds { offset: requested, length: utf16_offset })
        }
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
        let start_byte = self.byte_offset_at_utf16(start)?;
        let end_byte = self.byte_offset_at_utf16(end)?;
        Ok(Some(Self {
            text: Arc::from(&self.text[start_byte..end_byte]),
            formats: self.formats.clone(),
            utf16_length: end - start,
        }))
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) enum Utf16BoundaryError {
    OutOfBounds { offset: u32, length: u32 },
    SplitsScalar { offset: u32 },
}
