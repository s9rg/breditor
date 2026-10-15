//! Create original Breditor flow records, decomposed into stable independently shared primitives.
use crate::{Error, register::Stamp};
use loro::LoroDoc;
use serde::{Deserialize, Serialize};
use serde_json::Value;

/// Insert admitted Document V2 flow element records, not HTML or a shared AST replacement.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct InsertBlocks {
    /// Existing cell/list-item/image parent, or the document root.
    pub parent: Option<String>,
    /// Existing sibling before-anchor, or append.
    pub before: Option<String>,
    /// Fresh schema-bound paragraph/heading/list/table/image records, including descendants.
    pub nodes: Vec<Value>,
}
impl InsertBlocks {
    pub(super) fn prepare(&self, doc: &LoroDoc) -> Result<(), Error> {
        if let Some(parent) = &self.parent {
            super::super::creation::activate_cell(doc, parent)?;
            super::super::captions::prepare_parent(doc, Some(parent))?;
        }
        for node in &self.nodes {
            super::super::creation::prepare(
                doc,
                node,
                self.parent.as_deref(),
                self.before.as_deref(),
            )?;
        }
        Ok(())
    }
    pub(super) fn apply(&self, doc: &LoroDoc, stamp: Stamp, ordinal: usize) -> Result<(), Error> {
        for node in &self.nodes {
            super::super::creation::publish(doc, node, stamp, ordinal)?;
            super::super::captions::inserted(
                doc,
                self.parent.as_deref(),
                super::super::creation::block(node)?,
                stamp,
            )?;
        }
        Ok(())
    }
}
