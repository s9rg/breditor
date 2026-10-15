//! A writer owns its placement occurrence; undo never relocates a later remote occurrence.
use crate::{Error, register::Stamp};
use loro::LoroDoc;
use serde::{Deserialize, Serialize};
/// Move one existing shared node before a sibling, or to the end of its parent.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct MoveBlock {
    /// Stable moved block.
    pub block: String,
    /// Stable destination parent, or the document root.
    pub parent: Option<String>,
    /// Stable sibling before-anchor, or append.
    pub before: Option<String>,
}
impl MoveBlock {
    pub(super) fn apply(&self, doc: &LoroDoc, stamp: Stamp, ordinal: usize) -> Result<(), Error> {
        if self.before.as_deref() == Some(&self.block) {
            return Ok(());
        }
        super::super::placement::move_block(
            doc,
            &self.block,
            self.parent.as_deref(),
            self.before.as_deref(),
            stamp,
            ordinal,
        )?;
        super::super::captions::inserted(doc, self.parent.as_deref(), &self.block, stamp)
    }
}
