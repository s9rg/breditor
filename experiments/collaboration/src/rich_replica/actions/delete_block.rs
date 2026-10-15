//! Writer-owned visibility deletion hides descendants without retracting another writer's deletion.
use crate::{Error, register::Stamp};
use loro::LoroDoc;
use serde::{Deserialize, Serialize};
/// Hide one stable shared node and its subtree.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct DeleteBlock {
    /// Stable node identity; live lookup is validated before authoring.
    pub block: String,
}
impl DeleteBlock {
    pub(in crate::rich_replica) fn apply(&self, doc: &LoroDoc, stamp: Stamp) -> Result<(), Error> {
        super::super::model::metadata(doc, &self.block)?
            .ensure_mergeable_map("deletions")?
            .insert(&stamp.key(), stamp.contribution(true.into()))?;
        Ok(())
    }
}
