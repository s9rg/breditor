//! Insertion validates UTF-16 scalar alignment before authoring any text effect.

use super::TextTarget;
use crate::{Error, anchor::event_offset};
use loro::LoroDoc;
use serde::{Deserialize, Serialize};

/// Insert text into one canonical body in the feasibility model.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct InsertText {
    /// Stable body or cell target.
    pub target: TextTarget,
    /// Scalar-aligned UTF-16 insertion offset in the admitted snapshot.
    pub offset: u32,
    /// Inserted text, bounded independently of the journal.
    pub text: String,
}

impl InsertText {
    pub(crate) fn apply(&self, doc: &LoroDoc) -> Result<(), Error> {
        if self.text.len() > 65_536 {
            return Err(Error::Limit("inserted text bytes"));
        }
        if self.text.is_empty() {
            return Err(Error::Contract("empty insertion"));
        }
        let body = self.target.text(doc)?;
        event_offset(&body, self.offset)?;
        body.insert_utf16(usize::try_from(self.offset).map_err(|_| Error::Offset)?, &self.text)?;
        Ok(())
    }
}
