use thiserror::Error;

use crate::position::{NodePath, TextOffset};

/// A half-open UTF-16 range inside one logical text container.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct TextRange {
    container_path: NodePath,
    start: TextOffset,
    end: TextOffset,
}

impl TextRange {
    /// Creates a paragraph-local half-open range `[start, end)`.
    ///
    /// # Errors
    ///
    /// Returns [`TextRangeError::Reversed`] when `start` follows `end`.
    pub fn try_new(
        container_path: NodePath,
        start: TextOffset,
        end: TextOffset,
    ) -> Result<Self, TextRangeError> {
        if start > end {
            return Err(TextRangeError::Reversed { start, end });
        }
        Ok(Self { container_path, start, end })
    }

    /// Returns the text-container path.
    #[must_use]
    pub const fn container_path(&self) -> &NodePath {
        &self.container_path
    }

    /// Returns the inclusive start offset.
    #[must_use]
    pub const fn start(&self) -> TextOffset {
        self.start
    }

    /// Returns the exclusive end offset.
    #[must_use]
    pub const fn end(&self) -> TextOffset {
        self.end
    }

    /// Returns the checked range length.
    #[must_use]
    pub const fn len(&self) -> u64 {
        self.end.get() - self.start.get()
    }

    /// Returns whether this is an insertion boundary.
    #[must_use]
    pub const fn is_empty(&self) -> bool {
        self.start.get() == self.end.get()
    }
}

/// Why a logical text range is malformed.
#[derive(Clone, Copy, Debug, Eq, Error, PartialEq)]
pub enum TextRangeError {
    /// Half-open ranges cannot run backward.
    #[error("text range start {start:?} follows end {end:?}")]
    Reversed {
        /// Rejected start.
        start: TextOffset,
        /// Rejected end.
        end: TextOffset,
    },
}
