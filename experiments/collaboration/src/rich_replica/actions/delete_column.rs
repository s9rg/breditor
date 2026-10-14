//! Column deletion hides cells by visibility, not by erasing their independently shared bodies.
use crate::{Error, register::Stamp};
use loro::LoroDoc;
use serde::{Deserialize, Serialize};
/// Hide one existing table column from semantic materialization.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct DeleteColumn {
    /// Stable table block identity.
    pub block: String,
    /// Stable column identity.
    pub column: String,
}
impl DeleteColumn {
    pub(super) fn apply(&self, doc: &LoroDoc, stamp: Stamp) -> Result<(), Error> {
        if !super::super::column_order::selected(doc, &self.block)?
            .iter()
            .any(|(column, _)| *column == self.column)
        {
            return Err(Error::Contract("shared column deletion target"));
        }
        doc.get_map("columns")
            .ensure_mergeable_map(&self.block)?
            .ensure_mergeable_map("deletions")?
            .ensure_mergeable_map(&self.column)?
            .insert(&stamp.key(), stamp.contribution(true.into()))?;
        Ok(())
    }
}
