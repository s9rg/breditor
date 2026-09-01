use std::{fmt, sync::Arc};

use thiserror::Error;

/// Maximum number of child indexes in a structural path.
pub const MAX_PATH_DEPTH: usize = 256;

/// A root-relative sequence of child indexes.
///
/// The empty path addresses the document root. Paths are only meaningful
/// relative to the document snapshot against which they were validated.
#[derive(Clone, Default, Eq, Hash, Ord, PartialEq, PartialOrd)]
pub struct NodePath(Arc<[u32]>);

impl NodePath {
    /// Returns the path that addresses the document root.
    #[must_use]
    pub fn root() -> Self {
        Self::default()
    }

    /// Creates a path from child indexes.
    ///
    /// # Errors
    ///
    /// Returns [`NodePathError::TooDeep`] when the number of indexes exceeds
    /// [`MAX_PATH_DEPTH`].
    pub fn try_from_indices(indices: impl Into<Vec<u32>>) -> Result<Self, NodePathError> {
        let indices = indices.into();
        if indices.len() > MAX_PATH_DEPTH {
            return Err(NodePathError::TooDeep { actual: indices.len(), maximum: MAX_PATH_DEPTH });
        }
        Ok(Self(Arc::from(indices)))
    }

    /// Returns the number of indexes in this path.
    #[must_use]
    pub fn len(&self) -> usize {
        self.0.len()
    }

    /// Returns whether this path contains no child indexes.
    #[must_use]
    pub fn is_empty(&self) -> bool {
        self.0.is_empty()
    }

    /// Returns whether this path addresses the root.
    #[must_use]
    pub fn is_root(&self) -> bool {
        self.0.is_empty()
    }

    /// Iterates over child indexes from the root downward.
    #[must_use]
    pub fn iter(&self) -> impl ExactSizeIterator<Item = u32> + DoubleEndedIterator + '_ {
        self.0.iter().copied()
    }

    /// Returns a copied vector suitable for a versioned record.
    #[must_use]
    pub fn to_vec(&self) -> Vec<u32> {
        self.0.to_vec()
    }

    /// Returns the parent path, or `None` when this is the document root.
    #[must_use]
    pub fn parent(&self) -> Option<Self> {
        let (_, parent) = self.0.split_last()?;
        Some(Self(Arc::from(parent)))
    }

    /// Returns the last child index, or `None` for the document root.
    #[must_use]
    pub fn last_index(&self) -> Option<u32> {
        self.0.last().copied()
    }

    pub(crate) fn as_slice(&self) -> &[u32] {
        &self.0
    }

    /// Returns a path extended by one child index.
    ///
    /// # Errors
    ///
    /// Returns [`NodePathError::TooDeep`] when extending this path would exceed
    /// [`MAX_PATH_DEPTH`]. The limit is enforced in release builds as well as
    /// debug builds.
    pub fn try_child(&self, index: u32) -> Result<Self, NodePathError> {
        if self.len() >= MAX_PATH_DEPTH {
            return Err(NodePathError::TooDeep { actual: self.len() + 1, maximum: MAX_PATH_DEPTH });
        }
        let mut indices = self.to_vec();
        indices.push(index);
        Ok(Self(Arc::from(indices)))
    }
}

impl fmt::Debug for NodePath {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.debug_tuple("NodePath").field(&self.0).finish()
    }
}

/// Why a structural path could not be created.
#[derive(Clone, Debug, Eq, Error, PartialEq)]
pub enum NodePathError {
    /// The path has more indexes than the protocol permits.
    #[error("node path depth is {actual}; the limit is {maximum}")]
    TooDeep {
        /// Actual number of indexes.
        actual: usize,
        /// Maximum accepted number of indexes.
        maximum: usize,
    },
}

#[cfg(test)]
mod tests {
    use super::{MAX_PATH_DEPTH, NodePath, NodePathError};

    #[test]
    fn root_is_an_empty_path() {
        let root = NodePath::root();
        assert!(root.is_root());
        assert_eq!(root.iter().count(), 0);
    }

    #[test]
    fn depth_is_bounded() -> Result<(), NodePathError> {
        assert_eq!(
            NodePath::try_from_indices(vec![0; MAX_PATH_DEPTH + 1]),
            Err(NodePathError::TooDeep { actual: MAX_PATH_DEPTH + 1, maximum: MAX_PATH_DEPTH })
        );

        let maximum_path = NodePath::try_from_indices(vec![0; MAX_PATH_DEPTH])?;
        assert_eq!(
            maximum_path.try_child(0),
            Err(NodePathError::TooDeep { actual: MAX_PATH_DEPTH + 1, maximum: MAX_PATH_DEPTH })
        );
        Ok(())
    }
}
