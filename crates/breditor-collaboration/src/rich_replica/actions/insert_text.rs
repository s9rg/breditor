//! Insert into a logical block through its stable source fragment, never an AST replacement.
use crate::{Error, anchor::Affinity, register::Stamp};
use loro::LoroDoc;
use serde::{Deserialize, Serialize};
/// Scalar-aligned shared text insertion.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct InsertText {
    /// Stable paragraph/heading/caption identity.
    pub block: String,
    /// UTF-16 boundary in the current admitted shared view.
    pub offset: u32,
    /// Inserted text.
    pub text: String,
}
impl InsertText {
    pub(super) fn apply(&self, doc: &LoroDoc, activation: Stamp) -> Result<(), Error> {
        super::super::text_flow::insert_with_activation(
            doc,
            &self.block,
            self.offset,
            Affinity::After,
            &self.text,
            Some(activation),
        )
    }
}
