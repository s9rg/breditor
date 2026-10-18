//! Explicit literal/capture replacement intent; no implicit regex substitution language.
use super::{RICH_SEARCH_MAX_REPLACEMENT_BYTES, RichSearchError};
use std::fmt;

/// How the admitted replacement request interprets dollar signs.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum RichSearchReplacementMode {
    /// Every scalar is inserted verbatim, including `$1` and `${name}`.
    Literal,
    /// Checked `$0`, `$12`, `${name}`, `${12}` and `$$` expansion.
    Captures,
}

/// Bounded replacement intention; capture references are checked against native results.
#[derive(Clone, Eq, PartialEq)]
pub struct RichSearchReplacement {
    text: String,
    mode: RichSearchReplacementMode,
}

impl RichSearchReplacement {
    /// Retain a request only after checking its UTF-8 size. No normalization is performed.
    /// # Errors
    /// Rejects oversized input before copying it. Template grammar/group checks happen
    /// when a complete native result is supplied to a replacement planner.
    pub fn try_new(
        text: impl AsRef<str>,
        mode: RichSearchReplacementMode,
    ) -> Result<Self, RichSearchError> {
        let text = text.as_ref();
        if text.len() > RICH_SEARCH_MAX_REPLACEMENT_BYTES {
            return Err(RichSearchError::ReplacementLimit);
        }
        Ok(Self { text: text.to_owned(), mode })
    }
    /// Exact request text, never a durable replay recipe.
    #[must_use]
    pub fn text(&self) -> &str {
        &self.text
    }
    /// Explicit replacement interpretation policy.
    #[must_use]
    pub const fn mode(&self) -> RichSearchReplacementMode {
        self.mode
    }
}

impl fmt::Debug for RichSearchReplacement {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("RichSearchReplacement")
            .field("mode", &self.mode)
            .finish_non_exhaustive()
    }
}
