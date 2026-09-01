use std::sync::Arc;

use crate::document::{LocalInvariantError, NodeRef};

/// An immutable sequence of child nodes.
///
/// The backing representation is intentionally hidden so it can evolve without
/// changing the public document API.
#[derive(Clone, Debug, Default, Eq, PartialEq)]
pub struct Children(Arc<[NodeRef]>);

impl Children {
    /// Returns the number of children.
    #[must_use]
    pub fn len(&self) -> usize {
        self.0.len()
    }

    /// Returns whether there are no children.
    #[must_use]
    pub fn is_empty(&self) -> bool {
        self.0.is_empty()
    }

    /// Returns the child at `index`.
    #[must_use]
    pub fn get(&self, index: usize) -> Option<&NodeRef> {
        self.0.get(index)
    }

    /// Iterates over children in document order.
    #[must_use]
    pub fn iter(&self) -> ChildrenIter<'_> {
        ChildrenIter(self.0.iter())
    }

    pub(crate) fn to_vec(&self) -> Vec<NodeRef> {
        self.0.to_vec()
    }

    pub(crate) fn try_from_nodes(nodes: Vec<NodeRef>) -> Result<Self, LocalInvariantError> {
        for (left_index, pair) in nodes.windows(2).enumerate() {
            if let (Some(left), Some(right)) = (pair[0].as_text(), pair[1].as_text())
                && left.formats() == right.formats()
            {
                return Err(LocalInvariantError::AdjacentEqualText {
                    left_index,
                    right_index: left_index + 1,
                });
            }
        }
        Ok(Self(Arc::from(nodes)))
    }
}

/// An iterator over immutable child references.
pub struct ChildrenIter<'a>(std::slice::Iter<'a, NodeRef>);

impl<'a> Iterator for ChildrenIter<'a> {
    type Item = &'a NodeRef;

    fn next(&mut self) -> Option<Self::Item> {
        self.0.next()
    }

    fn size_hint(&self) -> (usize, Option<usize>) {
        self.0.size_hint()
    }
}

impl DoubleEndedIterator for ChildrenIter<'_> {
    fn next_back(&mut self) -> Option<Self::Item> {
        self.0.next_back()
    }
}

impl ExactSizeIterator for ChildrenIter<'_> {}
impl std::iter::FusedIterator for ChildrenIter<'_> {}

impl<'a> IntoIterator for &'a Children {
    type Item = &'a NodeRef;
    type IntoIter = ChildrenIter<'a>;

    fn into_iter(self) -> Self::IntoIter {
        self.iter()
    }
}
