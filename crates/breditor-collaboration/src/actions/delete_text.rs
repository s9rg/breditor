//! Deletion checks both scalar boundaries, including overflow, before mutation.

use super::TextTarget;
use crate::{Error, anchor::event_offset};
use loro::LoroDoc;
use serde::{Deserialize, Serialize};

/// Delete text without treating half a surrogate pair as an editable position.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct DeleteText {
    /// Stable body or cell target.
    pub target: TextTarget,
    /// Start in UTF-16 units.
    pub offset: u32,
    /// Length in UTF-16 units.
    pub length: u32,
}

impl DeleteText {
    pub(crate) fn apply(&self, doc: &LoroDoc) -> Result<(), Error> {
        if self.length == 0 {
            return Err(Error::Contract("empty deletion"));
        }
        let end = self.offset.checked_add(self.length).ok_or(Error::Offset)?;
        let body = self.target.text(doc)?;
        event_offset(&body, self.offset)?;
        event_offset(&body, end)?;
        body.delete_utf16(
            usize::try_from(self.offset).map_err(|_| Error::Offset)?,
            usize::try_from(self.length).map_err(|_| Error::Offset)?,
        )?;
        Ok(())
    }
}
