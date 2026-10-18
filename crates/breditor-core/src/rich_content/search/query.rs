//! Explicit native query semantics; literal input cannot select regex by shape.
use super::{RICH_SEARCH_MAX_PATTERN_BYTES, RichSearchError};
use std::fmt;

/// Explicit interpretation of the query string.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum RichSearchMode {
    /// Exact literal substring, optionally using Unicode simple case folding.
    Literal,
    /// UTF-8-safe native regular expressions without backreferences or lookaround.
    Regex,
}

/// Bounded query values, independent of a document, browser or shared writer.
#[derive(Clone, Eq, PartialEq)]
pub struct RichSearchQuery {
    pattern: String,
    mode: RichSearchMode,
    case_sensitive: bool,
    whole_words: bool,
}

impl RichSearchQuery {
    /// Construct an explicit query. Empty input is inactive and yields no matches.
    ///
    /// Whole-word filtering uses Unicode word-segment boundaries after ordinary
    /// leftmost-first matching; it does not change regex alternative priority.
    /// Regex syntax is admitted when searching, even for a no-text document.
    /// # Errors
    /// Rejects oversized input before retaining or compiling the query.
    pub fn try_new(
        pattern: impl AsRef<str>,
        mode: RichSearchMode,
        case_sensitive: bool,
        whole_words: bool,
    ) -> Result<Self, RichSearchError> {
        let pattern = pattern.as_ref();
        if pattern.len() > RICH_SEARCH_MAX_PATTERN_BYTES {
            return Err(RichSearchError::QueryLimit);
        }
        Ok(Self { pattern: pattern.to_owned(), mode, case_sensitive, whole_words })
    }
    /// Exact caller-supplied pattern; no Unicode normalization is performed.
    #[must_use]
    pub fn pattern(&self) -> &str {
        &self.pattern
    }
    /// Explicit literal/regex interpretation.
    #[must_use]
    pub const fn mode(&self) -> RichSearchMode {
        self.mode
    }
    /// Whether native matching preserves letter case.
    #[must_use]
    pub const fn case_sensitive(&self) -> bool {
        self.case_sensitive
    }
    /// Whether complete matches require Unicode word-segment boundary endpoints.
    #[must_use]
    pub const fn whole_words(&self) -> bool {
        self.whole_words
    }
}

impl fmt::Debug for RichSearchQuery {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("RichSearchQuery")
            .field("pattern_bytes", &self.pattern.len())
            .field("mode", &self.mode)
            .field("case_sensitive", &self.case_sensitive)
            .field("whole_words", &self.whole_words)
            .finish_non_exhaustive()
    }
}
