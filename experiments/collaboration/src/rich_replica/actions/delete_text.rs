//! Delete shared text items without destroying the canonical text container.
use crate::Error;
use loro::LoroDoc;
use serde::{Deserialize, Serialize};
/// Scalar-aligned shared text deletion.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct DeleteText {
    /// Stable text block identity.
    pub block: String,
    /// First UTF-16 boundary.
    pub offset: u32,
    /// UTF-16 length.
    pub length: u32,
}
impl DeleteText {
    pub(super) fn apply(&self, doc: &LoroDoc) -> Result<(), Error> {
        super::super::text_flow::delete(doc, &self.block, self.offset, self.length)
    }
}
