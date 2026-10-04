//! Bounded scratch path for synchronous tree walks, never an owned document address.

use std::sync::Arc;

use super::{MAX_PATH_DEPTH, NodePath, NodePathError};

/// Reuses traversal storage while retaining independent paths only on demand.
/// All extension goes through `try_push`, preserving `NodePath`'s depth bound.
#[derive(Default)]
pub(crate) struct NodePathCursor {
    indices: Vec<u32>,
}

impl NodePathCursor {
    pub(crate) fn len(&self) -> usize {
        self.indices.len()
    }

    pub(crate) fn try_push(&mut self, index: u32) -> Result<(), NodePathError> {
        if self.len() >= MAX_PATH_DEPTH {
            return Err(NodePathError::TooDeep { actual: self.len() + 1, maximum: MAX_PATH_DEPTH });
        }
        self.indices.push(index);
        Ok(())
    }

    pub(crate) fn pop(&mut self) {
        self.indices.pop();
    }

    /// The private bounded buffer makes this snapshot a valid protocol path.
    pub(crate) fn snapshot(&self) -> NodePath {
        NodePath(Arc::from(self.indices.as_slice()))
    }
}

#[cfg(test)]
mod tests {
    use super::{MAX_PATH_DEPTH, NodePathCursor, NodePathError};

    #[test]
    fn snapshots_and_failed_extension_are_independent_of_cursor_reuse() -> Result<(), NodePathError>
    {
        let mut cursor = NodePathCursor::default();
        let root = cursor.snapshot();
        let mut saved = Vec::new();
        for depth in 0..MAX_PATH_DEPTH {
            cursor.try_push(u32::MAX)?;
            saved.push(cursor.snapshot());
            assert_eq!(cursor.len(), depth + 1);
        }
        assert_eq!(
            cursor.try_push(0),
            Err(NodePathError::TooDeep { actual: MAX_PATH_DEPTH + 1, maximum: MAX_PATH_DEPTH })
        );
        assert_eq!(cursor.snapshot(), saved[MAX_PATH_DEPTH - 1]);
        for depth in (0..MAX_PATH_DEPTH).rev() {
            cursor.pop();
            assert_eq!(cursor.len(), depth);
        }
        cursor.pop();
        cursor.try_push(1)?;
        assert_eq!(cursor.snapshot().to_vec(), vec![1]);
        assert!(root.is_root());
        for (index, path) in saved.iter().enumerate() {
            assert_eq!(path.to_vec(), vec![u32::MAX; index + 1]);
        }
        Ok(())
    }
}
