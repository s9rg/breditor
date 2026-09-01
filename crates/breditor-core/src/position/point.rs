use thiserror::Error;

use crate::{
    document::{Document, ElementNode, NodeLookupError, TextNode, Utf16BoundaryError},
    position::{Affinity, NodePath},
};

/// A validated structural position candidate.
///
/// A point remains snapshot-local until a future relocation explicitly moves it
/// through a commit.
#[derive(Clone, Debug, Eq, Hash, PartialEq)]
pub enum Point {
    /// A boundary in one text leaf, measured in UTF-16 code units.
    Text {
        /// Path resolving to the text leaf.
        text_path: NodePath,
        /// UTF-16 code-unit offset, including the end boundary.
        utf16_offset: u32,
        /// Ownership when content is inserted exactly at this boundary.
        affinity: Affinity,
    },
    /// A child boundary in one element.
    Children {
        /// Path resolving to the parent element.
        parent_path: NodePath,
        /// Boundary index, including the boundary after the last child.
        child_index: u32,
        /// Ownership when content is inserted exactly at this boundary.
        affinity: Affinity,
    },
}

impl Point {
    /// Resolves and structurally validates this point against `document`.
    ///
    /// Structural validity does not imply that a particular registered selection
    /// kind accepts the point.
    ///
    /// # Errors
    ///
    /// Returns [`PointError`] if the path does not resolve, targets the wrong
    /// node variant, exceeds a child/text boundary, or splits a Unicode scalar's
    /// UTF-16 surrogate pair.
    pub fn resolve<'a>(&self, document: &'a Document) -> Result<ResolvedPoint<'a>, PointError> {
        match self {
            Self::Text { text_path, utf16_offset, affinity } => {
                let node = document.node_at(text_path)?;
                let Some(text) = node.as_text() else {
                    return Err(PointError::ExpectedText { path: text_path.clone() });
                };
                match text.byte_offset_at_utf16(*utf16_offset) {
                    Ok(byte_offset) => Ok(ResolvedPoint::Text {
                        node: text,
                        byte_offset,
                        utf16_offset: *utf16_offset,
                        affinity: *affinity,
                    }),
                    Err(Utf16BoundaryError::OutOfBounds { offset, length }) => {
                        Err(PointError::Utf16OffsetOutOfBounds {
                            path: text_path.clone(),
                            offset,
                            length,
                        })
                    }
                    Err(Utf16BoundaryError::SplitsScalar { offset }) => {
                        Err(PointError::Utf16OffsetSplitsScalar { path: text_path.clone(), offset })
                    }
                }
            }
            Self::Children { parent_path, child_index, affinity } => {
                let node = document.node_at(parent_path)?;
                let Some(element) = node.as_element() else {
                    return Err(PointError::ExpectedElement { path: parent_path.clone() });
                };
                let index = usize::try_from(*child_index).map_err(|_| {
                    PointError::ChildIndexOutOfBounds {
                        path: parent_path.clone(),
                        index: *child_index,
                        child_count: element.children().len(),
                    }
                })?;
                if index > element.children().len() {
                    return Err(PointError::ChildIndexOutOfBounds {
                        path: parent_path.clone(),
                        index: *child_index,
                        child_count: element.children().len(),
                    });
                }
                Ok(ResolvedPoint::Children {
                    node: element,
                    child_index: index,
                    affinity: *affinity,
                })
            }
        }
    }

    /// Returns this point's affinity.
    #[must_use]
    pub const fn affinity(&self) -> Affinity {
        match self {
            Self::Text { affinity, .. } | Self::Children { affinity, .. } => *affinity,
        }
    }

    /// Returns the path to the point's target node.
    #[must_use]
    pub const fn target_path(&self) -> &NodePath {
        match self {
            Self::Text { text_path, .. } => text_path,
            Self::Children { parent_path, .. } => parent_path,
        }
    }
}

/// A structurally valid point resolved to runtime content.
#[derive(Clone, Copy, Debug)]
pub enum ResolvedPoint<'a> {
    /// A valid boundary in a text leaf.
    Text {
        /// Target text node.
        node: &'a TextNode,
        /// Equivalent UTF-8 byte boundary for Rust string operations.
        byte_offset: usize,
        /// Original UTF-16 boundary.
        utf16_offset: u32,
        /// Original boundary affinity.
        affinity: Affinity,
    },
    /// A valid boundary between an element's children.
    Children {
        /// Target parent element.
        node: &'a ElementNode,
        /// Checked native child boundary index.
        child_index: usize,
        /// Original boundary affinity.
        affinity: Affinity,
    },
}

/// Why a [`Point`] is not structurally valid in a document.
#[derive(Clone, Debug, Eq, Error, PartialEq)]
pub enum PointError {
    /// The target path did not resolve.
    #[error(transparent)]
    NodeLookup(#[from] NodeLookupError),
    /// A text point targeted an element.
    #[error("point path {path:?} must target text")]
    ExpectedText {
        /// Invalid target path.
        path: NodePath,
    },
    /// A children point targeted text.
    #[error("point path {path:?} must target an element")]
    ExpectedElement {
        /// Invalid target path.
        path: NodePath,
    },
    /// A child boundary exceeds the parent's child count.
    #[error("child boundary {index} at {path:?} exceeds the element's {child_count} children")]
    ChildIndexOutOfBounds {
        /// Target parent path.
        path: NodePath,
        /// Requested child boundary.
        index: u32,
        /// Number of children in the parent.
        child_count: usize,
    },
    /// A UTF-16 offset exceeds the target text length.
    #[error("UTF-16 offset {offset} at {path:?} exceeds text length {length}")]
    Utf16OffsetOutOfBounds {
        /// Target text path.
        path: NodePath,
        /// Requested UTF-16 boundary.
        offset: u32,
        /// Text length in UTF-16 code units.
        length: u32,
    },
    /// A UTF-16 offset lands inside a non-BMP scalar's surrogate pair.
    #[error("UTF-16 offset {offset} at {path:?} splits a Unicode scalar")]
    Utf16OffsetSplitsScalar {
        /// Target text path.
        path: NodePath,
        /// Requested invalid UTF-16 boundary.
        offset: u32,
    },
}
