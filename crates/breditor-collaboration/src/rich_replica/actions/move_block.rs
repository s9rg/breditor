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
        let raw = super::super::materialize::envelope(doc)?;
        let node = super::super::creation::find(&raw["root"], &self.block)
            .ok_or(Error::Contract("visible move source"))?;
        if let Some(parent) = &self.parent
            && super::super::creation::find(node, parent).is_some()
        {
            return Err(Error::Contract("move destination inside source subtree"));
        }
        if let Some(before) = &self.before {
            let (parent, _) = super::super::paragraphs::layout(&raw["root"], before)?;
            if parent != self.parent {
                return Err(Error::Contract("visible move before-anchor parent"));
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
        super::super::captions::inserted(doc, self.parent.as_deref(), &self.block, stamp)?;
        doc.commit();
        let after = super::super::materialize::envelope(doc)?;
        let (parent, before) = super::super::paragraphs::layout(&after["root"], &self.block)?;
        if parent != self.parent || before != self.before {
            return Err(Error::Contract("local move conflicts with rich grammar"));
        }
        Ok(())
    }
}
