use thiserror::Error;

use crate::{
    document::NodeRef,
    position::NodePath,
    schema::{CompiledSchema, DocumentLimits, SchemaId, ValidationReport},
};

/// A complete, immutable, schema-valid editor document.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Document {
    schema: SchemaId,
    root: NodeRef,
}

impl Document {
    /// Returns the schema identity against which this document was validated.
    #[must_use]
    pub fn schema(&self) -> &SchemaId {
        &self.schema
    }

    /// Returns the document root, which is guaranteed to be an element.
    #[must_use]
    pub fn root(&self) -> &NodeRef {
        &self.root
    }

    /// Resolves a snapshot-local structural path.
    ///
    /// # Errors
    ///
    /// Returns [`NodeLookupError`] when an index is out of bounds or the path
    /// tries to descend through text.
    pub fn node_at(&self, path: &NodePath) -> Result<&NodeRef, NodeLookupError> {
        let mut current = &self.root;
        for (depth, child_index) in path.iter().enumerate() {
            let Some(element) = current.as_element() else {
                return Err(NodeLookupError::TraversesText { path: path.clone(), depth });
            };
            let index = usize::try_from(child_index).map_err(|_| {
                NodeLookupError::ChildIndexOutOfBounds {
                    path: path.clone(),
                    depth,
                    child_index,
                    child_count: element.children().len(),
                }
            })?;
            let Some(child) = element.children().get(index) else {
                return Err(NodeLookupError::ChildIndexOutOfBounds {
                    path: path.clone(),
                    depth,
                    child_index,
                    child_count: element.children().len(),
                });
            };
            current = child;
        }
        Ok(current)
    }

    pub(crate) fn try_new(
        schema: &CompiledSchema,
        root: NodeRef,
        limits: &DocumentLimits,
    ) -> Result<Self, ValidationReport> {
        schema.validate_root(&root, limits)?;
        Ok(Self { schema: schema.id().clone(), root })
    }
}

/// Why a [`NodePath`] could not resolve within a [`Document`].
#[derive(Clone, Debug, Eq, Error, PartialEq)]
pub enum NodeLookupError {
    /// An intermediate path component targeted a text leaf.
    #[error("path {path:?} descends through text at depth {depth}")]
    TraversesText {
        /// Complete requested path.
        path: NodePath,
        /// Zero-based component at which traversal failed.
        depth: usize,
    },
    /// A child index does not exist.
    #[error(
        "path {path:?} uses child {child_index} at depth {depth}, but the element has {child_count} children"
    )]
    ChildIndexOutOfBounds {
        /// Complete requested path.
        path: NodePath,
        /// Zero-based component at which traversal failed.
        depth: usize,
        /// Requested child index.
        child_index: u32,
        /// Number of children in the targeted element.
        child_count: usize,
    },
}
