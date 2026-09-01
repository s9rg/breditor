use thiserror::Error;

use crate::position::{NodePath, TextOffset};

/// One UTF-16 text boundary in a paragraph directly owned by the document root.
///
/// Boundaries deliberately omit affinity. A [`RootTextRange`] describes the
/// exact half-open content to replace; selection ownership is a separate host
/// concern handled by relocation policy.
#[derive(Clone, Debug, Eq, Hash, PartialEq)]
pub struct RootTextBoundary {
    paragraph_path: NodePath,
    paragraph_index: u32,
    offset: TextOffset,
}

impl RootTextBoundary {
    /// Creates a boundary in one direct-root paragraph.
    ///
    /// # Errors
    ///
    /// Returns [`RootTextBoundaryError::ParagraphPathDepth`] unless the path
    /// contains exactly one root-child index.
    pub fn try_new(
        paragraph_path: NodePath,
        offset: TextOffset,
    ) -> Result<Self, RootTextBoundaryError> {
        let Some(paragraph_index) = paragraph_path.last_index() else {
            return Err(RootTextBoundaryError::ParagraphPathDepth { actual: paragraph_path.len() });
        };
        if paragraph_path.len() != 1 {
            return Err(RootTextBoundaryError::ParagraphPathDepth { actual: paragraph_path.len() });
        }
        Ok(Self { paragraph_path, paragraph_index, offset })
    }

    /// Returns the direct-root paragraph path.
    #[must_use]
    pub const fn paragraph_path(&self) -> &NodePath {
        &self.paragraph_path
    }

    /// Returns the root-child paragraph index.
    #[must_use]
    pub const fn paragraph_index(&self) -> u32 {
        self.paragraph_index
    }

    /// Returns the aggregate UTF-16 boundary within the paragraph.
    #[must_use]
    pub const fn offset(&self) -> TextOffset {
        self.offset
    }
}

/// A forward, half-open text range across one or more direct-root paragraphs.
///
/// Paragraph breaks are structural: the start and end offsets address text in
/// their respective paragraphs, while every intervening paragraph is wholly
/// inside the range.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct RootTextRange {
    start: RootTextBoundary,
    end: RootTextBoundary,
    paragraph_count: u32,
}

impl RootTextRange {
    /// Creates a checked range in source document order.
    ///
    /// # Errors
    ///
    /// Returns [`RootTextRangeError`] when paragraph order is reversed, a
    /// same-paragraph range runs backward, or its inclusive/exclusive root
    /// coordinates cannot be represented by the `u32` child protocol.
    pub fn try_new(
        start: RootTextBoundary,
        end: RootTextBoundary,
    ) -> Result<Self, RootTextRangeError> {
        let start_index = start.paragraph_index();
        let end_index = end.paragraph_index();
        if start_index > end_index {
            return Err(RootTextRangeError::ReversedParagraphOrder {
                start: start_index,
                end: end_index,
            });
        }
        if start_index == end_index && start.offset() > end.offset() {
            return Err(RootTextRangeError::ReversedOffsets {
                start: start.offset(),
                end: end.offset(),
            });
        }

        // Both ChildrenChange and structural publication use an exclusive end.
        end_index.checked_add(1).ok_or(RootTextRangeError::ParagraphSpanOverflow)?;
        let paragraph_count = end_index
            .checked_sub(start_index)
            .and_then(|distance| distance.checked_add(1))
            .ok_or(RootTextRangeError::ParagraphSpanOverflow)?;
        Ok(Self { start, end, paragraph_count })
    }

    /// Returns the inclusive spatial start boundary.
    #[must_use]
    pub const fn start(&self) -> &RootTextBoundary {
        &self.start
    }

    /// Returns the exclusive spatial end boundary.
    #[must_use]
    pub const fn end(&self) -> &RootTextBoundary {
        &self.end
    }

    /// Returns the number of complete paragraph guards needed by the range.
    #[must_use]
    pub const fn paragraph_count(&self) -> u32 {
        self.paragraph_count
    }

    /// Returns whether both boundaries name the same text position.
    #[must_use]
    pub fn is_empty(&self) -> bool {
        self.start == self.end
    }
}

/// Why a root-text boundary is outside the base structural coordinate space.
#[derive(Clone, Copy, Debug, Eq, Error, PartialEq)]
pub enum RootTextBoundaryError {
    /// A root-text boundary must carry exactly one child index.
    #[error("root-text paragraph path has depth {actual}; expected depth 1")]
    ParagraphPathDepth {
        /// Actual path depth.
        actual: usize,
    },
}

/// Why two root-text boundaries cannot form one forward range.
#[derive(Clone, Copy, Debug, Eq, Error, PartialEq)]
pub enum RootTextRangeError {
    /// The start paragraph follows the end paragraph.
    #[error("root-text start paragraph {start} follows end paragraph {end}")]
    ReversedParagraphOrder {
        /// Rejected start paragraph index.
        start: u32,
        /// Rejected end paragraph index.
        end: u32,
    },
    /// A same-paragraph range runs backward in UTF-16 coordinates.
    #[error("root-text start offset {start:?} follows end offset {end:?}")]
    ReversedOffsets {
        /// Rejected start offset.
        start: TextOffset,
        /// Rejected end offset.
        end: TextOffset,
    },
    /// The inclusive paragraph span or its exclusive endpoint exceeded `u32`.
    #[error("root-text paragraph span exceeds the child-index protocol")]
    ParagraphSpanOverflow,
}
