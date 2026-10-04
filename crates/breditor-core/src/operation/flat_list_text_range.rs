//! Actual block-path coordinates for text replacement in a flat-list document.
use crate::position::{NodePath, TextOffset};
use thiserror::Error;

/// A forward text range using real paragraph/heading paths, not flattened indexes.
///
/// Paths are either `[root]` or `[root, item, 0]`. Offsets are aggregate UTF-16
/// coordinates inside those blocks. Structural breaks between blocks are part
/// of the range. Scalar alignment and path resolution require source guards.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct FlatListTextRange {
    start_path: NodePath,
    start_offset: TextOffset,
    end_path: NodePath,
    end_offset: TextOffset,
}
impl FlatListTextRange {
    /// Checks the flat path grammar, forward ordering and representable root span.
    ///
    /// # Errors
    /// Rejects unsupported path shapes, reversed boundaries, or a root index
    /// without a representable exclusive end.
    pub fn try_new(
        start_path: NodePath,
        start_offset: TextOffset,
        end_path: NodePath,
        end_offset: TextOffset,
    ) -> Result<Self, FlatListTextRangeError> {
        for path in [&start_path, &end_path] {
            if !matches!(path.as_slice(), [_] | [_, _, 0]) || path.iter().next() == Some(u32::MAX) {
                return Err(FlatListTextRangeError::InvalidPath);
            }
        }
        if start_path > end_path || (start_path == end_path && start_offset > end_offset) {
            return Err(FlatListTextRangeError::Reversed);
        }
        Ok(Self { start_path, start_offset, end_path, end_offset })
    }
    /// Real path of the first touched text block.
    #[must_use]
    pub const fn start_path(&self) -> &NodePath {
        &self.start_path
    }
    /// Inclusive aggregate UTF-16 start offset.
    #[must_use]
    pub const fn start_offset(&self) -> TextOffset {
        self.start_offset
    }
    /// Real path of the last touched text block.
    #[must_use]
    pub const fn end_path(&self) -> &NodePath {
        &self.end_path
    }
    /// Exclusive aggregate UTF-16 end offset.
    #[must_use]
    pub const fn end_offset(&self) -> TextOffset {
        self.end_offset
    }
    pub(super) fn root_start(&self) -> u32 {
        self.start_path.as_slice()[0]
    }
    pub(super) fn root_end(&self) -> u32 {
        self.end_path.as_slice()[0] + 1
    }
}
/// Invalid source-independent flat-list text coordinates.
#[derive(Clone, Copy, Debug, Eq, Error, PartialEq)]
pub enum FlatListTextRangeError {
    /// Path is not a bare or flat-list block, or its exclusive root end overflows.
    #[error("invalid flat-list text boundary path")]
    InvalidPath,
    /// Spatial end precedes start.
    #[error("flat-list text range is reversed")]
    Reversed,
}
