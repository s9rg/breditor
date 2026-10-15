//! Bounded inert code-language tokens, never HTML, CSS or executable provider configuration.

/// Invalid code-language token, without exposing supplied content.
#[derive(Clone, Copy, Debug, Eq, PartialEq, thiserror::Error)]
#[error("code language must be a 1–64 byte ASCII token beginning with a letter or digit")]
pub struct CodeLanguageError;

/// Case-preserving language identifier. `None` means unlabelled code; empty strings are invalid.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct CodeLanguage(String);

impl CodeLanguage {
    /// Admit `[A-Za-z0-9][A-Za-z0-9+_.#-]{0,63}` without trimming or normalization.
    ///
    /// # Errors
    /// Rejects empty, over-budget, non-ASCII, whitespace, markup and control values.
    pub fn try_new(value: impl Into<String>) -> Result<Self, CodeLanguageError> {
        let value = value.into();
        if !Self::accepts(&value) {
            return Err(CodeLanguageError);
        }
        Ok(Self(value))
    }
    pub(crate) fn accepts(value: &str) -> bool {
        !value.is_empty()
            && value.len() <= 64
            && value.as_bytes()[0].is_ascii_alphanumeric()
            && value.bytes().all(|byte| byte.is_ascii_alphanumeric() || b"+_.#-".contains(&byte))
    }
    /// Original admitted token, suitable only as data for a separately selected highlighter.
    #[must_use]
    pub fn as_str(&self) -> &str {
        &self.0
    }
}
