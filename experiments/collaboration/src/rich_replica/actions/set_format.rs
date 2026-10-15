//! Generic schema-bound format intent with one immutable writer-owned annotation key.
use crate::{Error, register::Stamp};
use loro::LoroDoc;
use serde::{Deserialize, Serialize};
use serde_json::Value;
/// Set/remove one typed format contribution over stable text items.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct SetFormat {
    /// Stable text block identity.
    pub block: String,
    /// First scalar-aligned UTF-16 boundary.
    pub offset: u32,
    /// Scalar-aligned UTF-16 length.
    pub length: u32,
    /// Canonical one-format literal, including typed properties.
    pub format: Value,
    /// Enable or remove this format kind according to causal priority.
    pub enabled: bool,
}
impl SetFormat {
    pub(super) fn apply(&self, doc: &LoroDoc, stamp: Stamp, ordinal: usize) -> Result<(), Error> {
        if self.length == 0 {
            return Err(Error::Contract("empty shared format range"));
        }
        let chunks =
            super::super::text_flow::intervals(doc, &self.block, self.offset, self.length)?;
        let annotation =
            super::super::text::Annotation { format: self.format.clone(), enabled: self.enabled };
        for chunk in chunks {
            super::super::text::mark(
                doc,
                &chunk.source,
                chunk.start,
                chunk.length,
                &annotation,
                stamp,
                ordinal,
            )?;
        }
        Ok(())
    }
}
