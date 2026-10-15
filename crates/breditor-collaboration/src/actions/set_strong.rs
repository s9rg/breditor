//! Strong formatting is an owned annotation contribution over stable text items.
//!
//! Each action uses a unique style key, so native selective undo never unmarks
//! another writer's annotation. Disabled contributions participate in the same
//! verified causal ordering as enabled ones; projection chooses the active value.

use super::TextTarget;
use crate::{Error, anchor::event_offset, register::Stamp};
use loro::LoroDoc;
use serde::{Deserialize, Serialize};

/// Apply explicit strong-format intent to a scalar-aligned UTF-16 range.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct SetStrong {
    /// Stable body/cell target.
    pub target: TextTarget,
    /// First UTF-16 boundary.
    pub offset: u32,
    /// UTF-16 range length; empty ranges need separate pending-format state.
    pub length: u32,
    /// Whether this authored contribution enables strong formatting.
    pub enabled: bool,
}

impl SetStrong {
    pub(crate) fn apply(&self, doc: &LoroDoc, stamp: Stamp) -> Result<(), Error> {
        if self.length == 0 {
            return Err(Error::Contract("empty format range"));
        }
        let end = self.offset.checked_add(self.length).ok_or(Error::Offset)?;
        let text = self.target.text(doc)?;
        event_offset(&text, self.offset)?;
        event_offset(&text, end)?;
        let key = format!("breditor_strong_{}", stamp.key().replace(':', "_"));
        text.mark_utf16(
            usize::try_from(self.offset).map_err(|_| Error::Offset)?
                ..usize::try_from(end).map_err(|_| Error::Offset)?,
            &key,
            stamp.contribution(self.enabled.into()),
        )?;
        Ok(())
    }
}
