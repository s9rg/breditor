//! A completed resize is one typed register change, not a stream of CSS updates.

use super::validate_id;
use crate::{
    Error,
    register::{self, Stamp},
};
use loro::LoroDoc;
use serde::{Deserialize, Serialize};

/// Set a bounded integer width in the feasibility model.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ResizeColumn {
    /// Stable column identity (not its visible index).
    pub column: String,
    /// Logical pixels; the probe permits 32 through 4096 inclusive.
    pub width: u32,
}

impl ResizeColumn {
    pub(crate) fn apply(&self, doc: &LoroDoc, stamp: Stamp) -> Result<(), Error> {
        validate_id(&self.column)?;
        if !(32..=4096).contains(&self.width) {
            return Err(Error::Contract("column width"));
        }
        register::write(
            &doc.get_map("columns").ensure_mergeable_map(&self.column)?,
            "width",
            stamp,
            i64::from(self.width).into(),
        )?;
        Ok(())
    }
}
