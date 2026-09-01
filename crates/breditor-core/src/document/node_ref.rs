use std::sync::Arc;

use crate::document::{ElementNode, TextNode};

/// The structural variant stored by a [`NodeRef`].
#[derive(Clone, Copy, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
pub enum NodeKind {
    /// A semantic element with children.
    Element,
    /// A text leaf.
    Text,
}

/// A cheap immutable reference to a content node.
///
/// Cloning a `NodeRef` shares content. Pointer identity is private and has no
/// semantic meaning; equality compares node content.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct NodeRef(Arc<Node>);

impl NodeRef {
    /// Returns the structural variant.
    #[must_use]
    pub fn kind(&self) -> NodeKind {
        match self.0.as_ref() {
            Node::Element(_) => NodeKind::Element,
            Node::Text(_) => NodeKind::Text,
        }
    }

    /// Returns this node as an element, if it is one.
    #[must_use]
    pub fn as_element(&self) -> Option<&ElementNode> {
        match self.0.as_ref() {
            Node::Element(element) => Some(element),
            Node::Text(_) => None,
        }
    }

    /// Returns this node as text, if it is one.
    #[must_use]
    pub fn as_text(&self) -> Option<&TextNode> {
        match self.0.as_ref() {
            Node::Element(_) => None,
            Node::Text(text) => Some(text),
        }
    }

    pub(crate) fn element(element: ElementNode) -> Self {
        Self(Arc::new(Node::Element(element)))
    }

    pub(crate) fn text(text: TextNode) -> Self {
        Self(Arc::new(Node::Text(text)))
    }

    #[cfg(test)]
    pub(crate) fn shares_allocation_with(&self, other: &Self) -> bool {
        Arc::ptr_eq(&self.0, &other.0)
    }
}

#[derive(Debug, Eq, PartialEq)]
enum Node {
    Element(ElementNode),
    Text(TextNode),
}

#[cfg(test)]
mod tests {
    use crate::document::{FormatSet, NodeRef, TextNode};

    #[test]
    fn cloning_shares_the_immutable_allocation() -> Result<(), crate::document::LocalInvariantError>
    {
        let original = NodeRef::text(TextNode::try_new("hello".to_owned(), FormatSet::default())?);
        let clone = original.clone();
        assert!(original.shares_allocation_with(&clone));
        assert_eq!(original, clone);
        Ok(())
    }
}
