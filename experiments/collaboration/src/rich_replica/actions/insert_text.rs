//! Insert into one stable shared text container, never an AST replacement register.
use crate::{Error, anchor::event_offset};
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
    pub(super) fn apply(&self, doc: &LoroDoc) -> Result<(), Error> {
        let text = super::super::model::text(doc, &self.block)?;
        event_offset(&text, self.offset)?;
        text.insert_utf16(usize::try_from(self.offset).map_err(|_| Error::Offset)?, &self.text)?;
        Ok(())
    }
}
