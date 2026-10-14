//! Delete shared text items without destroying the canonical text container.
use crate::{Error, anchor::event_offset};
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
        let text = super::super::model::text(doc, &self.block)?;
        event_offset(&text, self.offset)?;
        event_offset(&text, self.offset.checked_add(self.length).ok_or(Error::Offset)?)?;
        text.delete_utf16(
            usize::try_from(self.offset).map_err(|_| Error::Offset)?,
            usize::try_from(self.length).map_err(|_| Error::Offset)?,
        )?;
        Ok(())
    }
}
