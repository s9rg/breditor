//! Move one existing column occurrence; source cells retain their separate identities.
use crate::{Error, register::Stamp};
use loro::LoroDoc;
use serde::{Deserialize, Serialize};
/// Shared table column reordering.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct MoveColumn {
    /// Stable table block identity.
    pub block: String,
    /// Stable moved column identity.
    pub column: String,
    /// Stable before-anchor, or append.
    pub before: Option<String>,
}
impl MoveColumn {
    pub(super) fn apply(&self, doc: &LoroDoc, stamp: Stamp, ordinal: usize) -> Result<(), Error> {
        super::super::column_order::move_column(
            doc,
            &self.block,
            &self.column,
            self.before.as_deref(),
            stamp,
            ordinal,
        )
    }
}
