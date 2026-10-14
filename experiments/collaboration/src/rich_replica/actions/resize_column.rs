//! Column width is an owned scalar contribution, not a replacement column array.
use crate::{Error, register::Stamp};
use loro::LoroDoc;
use serde::{Deserialize, Serialize};
/// Resize one stable shared table column.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ResizeColumn {
    /// Stable table block identity.
    pub block: String,
    /// Stable column identity.
    pub column: String,
    /// Bounded semantic width.
    pub width: u32,
}
impl ResizeColumn {
    pub(super) fn apply(&self, doc: &LoroDoc, stamp: Stamp) -> Result<(), Error> {
        crate::actions::validate_id(&self.column)?;
        let owner = doc
            .get_map("columns")
            .ensure_mergeable_map(&self.block)?
            .ensure_mergeable_map("widths")?
            .ensure_mergeable_map(&self.column)?;
        crate::register::write(&owner, "width", stamp, self.width.to_string().into())
    }
}
