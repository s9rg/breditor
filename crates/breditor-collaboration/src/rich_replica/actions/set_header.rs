//! Header flags are owned per-base-cell contributions, never a replacement table payload.
use crate::{Error, register::Stamp};
use loro::LoroDoc;
use serde::{Deserialize, Serialize};
use serde_json::json;

/// Set admitted visible source cells' header flags in one shared group.
/// The caller supplies the merge-closed source-cell set, not just presentation masters.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct SetHeader {
    /// Existing stable base cell block identities.
    pub cells: Vec<String>,
    /// Whether the selected cells are headers.
    pub header: bool,
}
impl SetHeader {
    pub(super) fn prepare(&self, doc: &LoroDoc) -> Result<(), Error> {
        for cell in &self.cells {
            super::super::creation::activate_cell(doc, cell)?;
            super::super::model::metadata(doc, cell)?
                .ensure_mergeable_map("effects")?
                .ensure_mergeable_map("property:breditor/header")?;
        }
        Ok(())
    }
    pub(super) fn apply(&self, doc: &LoroDoc, stamp: Stamp) -> Result<(), Error> {
        for cell in &self.cells {
            super::super::model::write_patch(
                doc,
                cell,
                "property:breditor/header",
                &super::super::model::Patch::set("breditor/header", json!(self.header)),
                stamp,
            )?;
        }
        Ok(())
    }
}
