//! Explicit checked list presentation; the core owns ordinal and shape admission.
use crate::Error;
use breditor_core::{block::OrderedListStart, rich_content::RichListKind};
use serde::{Deserialize, Serialize};

/// Complete list presentation, never a partial kind/start update.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case", deny_unknown_fields)]
pub enum ListStyle {
    /// Unnumbered bullet list.
    Bullet,
    /// Numbered list with an explicit positive first ordinal.
    Ordered {
        /// First ordinal; the core also checks the resulting final ordinal.
        start: u32,
    },
}
impl ListStyle {
    pub(super) fn core(&self) -> Result<RichListKind, Error> {
        match self {
            Self::Bullet => Ok(RichListKind::Bullet),
            Self::Ordered { start } => Ok(RichListKind::Ordered(
                OrderedListStart::try_new(*start)
                    .map_err(|_| Error::Contract("shared list ordinal"))?,
            )),
        }
    }
}
/// Explicit identity and presentation for a newly needed nested list.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct NestedList {
    /// Fresh historical block identity.
    pub block: String,
    /// Complete admitted style, compatible with the source list.
    pub style: ListStyle,
}
