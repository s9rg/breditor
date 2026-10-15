//! A column has an immutable ordered birth occurrence and a writer-owned visibility claim.
use crate::{Error, register::Stamp};
use loro::LoroDoc;
use serde::{Deserialize, Serialize};
use serde_json::json;

/// Insert one empty stable column; every existing/concurrent row derives its own cell.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct InsertColumn {
    /// Stable table block identity.
    pub block: String,
    /// Fresh table-scoped column identity, including hidden historical columns.
    pub column: String,
    /// Initial schema-bounded column width.
    pub width: u32,
    /// Existing column before-anchor, or append.
    pub before: Option<String>,
}
impl InsertColumn {
    pub(super) fn prepare(&self, doc: &LoroDoc) -> Result<(), Error> {
        super::super::creation::prepare_column(
            doc,
            &self.block,
            &json!(self.column),
            &json!(self.width),
            self.before.as_deref(),
        )
    }
    pub(super) fn apply(&self, doc: &LoroDoc, stamp: Stamp) -> Result<(), Error> {
        super::super::creation::publish_column(doc, &self.block, &self.column, stamp)
    }
}
