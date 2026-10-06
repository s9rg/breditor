//! Actual block-path coordinates for text replacement in a nested-list document.
use crate::position::{NodePath, TextOffset};
use thiserror::Error;

/// A forward text range using real paragraph/heading paths, not flattened indexes.
///
/// Paths are `[root]` or `[root, item, child-list, item, ..., 0]`.
/// Child-list positions are positive; offsets are aggregate UTF-16
/// coordinates inside those blocks. Structural breaks between blocks are part
/// of the range. Scalar alignment and path resolution require source guards.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct NestedListTextRange {
    start_path: NodePath,
    start_offset: TextOffset,
    end_path: NodePath,
    end_offset: TextOffset,
}
impl NestedListTextRange {
    /// Checks the nested path grammar, forward ordering and representable root span.
    ///
    /// # Errors
    /// Rejects unsupported path shapes, reversed boundaries, or a root index
    /// without a representable exclusive end.
    pub fn try_new(
        start_path: NodePath,
        start_offset: TextOffset,
        end_path: NodePath,
        end_offset: TextOffset,
    ) -> Result<Self, NestedListTextRangeError> {
        for path in [&start_path, &end_path] {
            if !valid_path(path) || path.iter().next() == Some(u32::MAX) {
                return Err(NestedListTextRangeError::InvalidPath);
            }
        }
        if start_path > end_path || (start_path == end_path && start_offset > end_offset) {
            return Err(NestedListTextRangeError::Reversed);
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
/// Invalid source-independent nested-list text coordinates.
#[derive(Clone, Copy, Debug, Eq, Error, PartialEq)]
pub enum NestedListTextRangeError {
    /// Path is not a bare or nested-list block, or its exclusive root end overflows.
    #[error("invalid nested-list text boundary path")]
    InvalidPath,
    /// Spatial end precedes start.
    #[error("nested-list text range is reversed")]
    Reversed,
}

fn valid_path(path: &NodePath) -> bool {
    let indexes = path.as_slice();
    indexes.len() == 1
        || (indexes.len() >= 3
            && indexes.len() % 2 == 1
            && indexes.last() == Some(&0)
            && indexes[2..indexes.len() - 1].iter().step_by(2).all(|index| *index > 0))
}
