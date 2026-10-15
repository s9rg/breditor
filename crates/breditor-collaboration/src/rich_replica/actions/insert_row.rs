//! A row owns its birth; missing intersections are canonical cells derived from stable axes.
use crate::{Error, register::Stamp};
use loro::LoroDoc;
use serde::{Deserialize, Serialize};

/// Insert one empty row into an existing table without copying existing cell bodies.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct InsertRow {
    /// Stable table block identity.
    pub block: String,
    /// Fresh globally unique row block identity.
    pub row_block: String,
    /// Fresh table-scoped logical row identity.
    pub row: String,
    /// Existing row block before-anchor, or append.
    pub before: Option<String>,
}
impl InsertRow {
    pub(super) fn prepare(&self, doc: &LoroDoc) -> Result<(), Error> {
        super::super::creation::prepare(
            doc,
            &super::super::creation::empty_row(&self.row_block, &self.row),
            Some(&self.block),
            self.before.as_deref(),
        )
    }
    pub(super) fn apply(&self, doc: &LoroDoc, stamp: Stamp, ordinal: usize) -> Result<(), Error> {
        super::super::creation::publish(
            doc,
            &super::super::creation::empty_row(&self.row_block, &self.row),
            stamp,
            ordinal,
        )
    }
}
