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
        if let Some(parent) = &self.parent {
            let raw = super::super::materialize::envelope(doc)?;
            let node = super::super::creation::find(&raw["root"], &self.block)
                .ok_or(Error::Contract("visible move source"))?;
            if super::super::creation::find(node, parent).is_some() {
                return Err(Error::Contract("move destination inside source subtree"));
            }
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
