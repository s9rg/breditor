//! Strict case-change intent JSON: `{"change": "upper"|"lower"|"title"|"cycle",
//! "locale"?: tag, "titleMinorWords"?: [word, ...]}`.
use super::RichCaseChangeError;
use serde::Deserialize;

/// Maximum configured title-case minor words.
pub const RICH_CASE_MAX_MINOR_WORDS: usize = 256;
/// Maximum UTF-8 bytes of one minor word.
pub const RICH_CASE_MAX_MINOR_WORD_BYTES: usize = 32;
const MAX_REQUEST_BYTES: usize = 16 * 1024;

/// Requested letter case.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum RichCaseChange {
    /// UPPERCASE (full Unicode mapping: `ß` → `SS`).
    Upper,
    /// lowercase (with Greek final sigma).
    Lower,
    /// Title Case: each word's first cased letter titlecased, the rest lowercased;
    /// configured minor words stay lowercase except at a sentence start or end.
    Title,
    /// Shift+F3: UPPER → lower → Title → UPPER, from the current selected text.
    Cycle,
}

/// Mapping options. The default is locale-independent Unicode mapping with the
/// built-in English minor-word list.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct RichCaseOptions {
    /// Turkish/Azerbaijani dotted and dotless i (`locale` tr or az).
    pub(super) turkic: bool,
    /// Lowercase minor words, sorted and unique.
    pub(super) minor_words: Vec<String>,
}
impl Default for RichCaseOptions {
    fn default() -> Self {
        Self {
            turkic: false,
            minor_words: default_title_minor_words().iter().map(|w| (*w).to_owned()).collect(),
        }
    }
}
impl RichCaseOptions {
    /// True when Turkic dotted/dotless i rules are active.
    #[must_use]
    pub const fn is_turkic(&self) -> bool {
        self.turkic
    }
    /// The effective lowercase minor words.
    #[must_use]
    pub fn minor_words(&self) -> &[String] {
        &self.minor_words
    }
    pub(super) fn is_minor(&self, word: &str) -> bool {
        let lower = word.to_lowercase();
        self.minor_words.binary_search(&lower).is_ok()
    }
}

/// The built-in English title-case minor words (the documented `CKEditor` example list).
#[must_use]
pub const fn default_title_minor_words() -> &'static [&'static str] {
    &[
        "a", "an", "and", "as", "at", "but", "by", "en", "for", "if", "in", "nor", "of", "on",
        "or", "per", "the", "to", "via", "vs",
    ]
}

/// A validated case-change intent.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct RichCaseRequest {
    change: RichCaseChange,
    options: RichCaseOptions,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct Wire {
    change: String,
    #[serde(default)]
    locale: Option<String>,
    #[serde(default)]
    title_minor_words: Option<Vec<String>>,
}

impl RichCaseRequest {
    /// A request with default options.
    #[must_use]
    pub fn new(change: RichCaseChange) -> Self {
        Self { change, options: RichCaseOptions::default() }
    }
    /// A request with explicit options.
    ///
    /// `locale` is a BCP 47 tag; only the primary subtags `tr` and `az` change the
    /// mapping. `minor_words` replaces the built-in list (an empty list disables it).
    /// # Errors
    /// A malformed tag, more than 256 words, an empty, overlong or non-letter word.
    pub fn with_options(
        change: RichCaseChange,
        locale: Option<&str>,
        minor_words: Option<&[String]>,
    ) -> Result<Self, RichCaseChangeError> {
        let turkic = match locale {
            None => false,
            Some(tag) => {
                let valid = !tag.is_empty()
                    && tag.len() <= 35
                    && tag.split('-').enumerate().all(|(index, part)| {
                        let letters = part.chars().all(|c| c.is_ascii_alphabetic());
                        let alnum = part.chars().all(|c| c.is_ascii_alphanumeric());
                        if index == 0 {
                            (2..=8).contains(&part.len()) && letters
                        } else {
                            (1..=8).contains(&part.len()) && alnum
                        }
                    });
                if !valid {
                    return Err(RichCaseChangeError::Request);
                }
                let primary = tag.split('-').next().unwrap_or_default().to_ascii_lowercase();
                primary == "tr" || primary == "az"
            }
        };
        let minor_words = match minor_words {
            None => RichCaseOptions::default().minor_words,
            Some(words) => {
                if words.len() > RICH_CASE_MAX_MINOR_WORDS {
                    return Err(RichCaseChangeError::Request);
                }
                let mut normalized = Vec::with_capacity(words.len());
                for word in words {
                    if word.is_empty()
                        || word.len() > RICH_CASE_MAX_MINOR_WORD_BYTES
                        || !word.chars().all(|c| c.is_alphabetic() || c == '\'' || c == '\u{2019}')
                    {
                        return Err(RichCaseChangeError::Request);
                    }
                    normalized.push(word.to_lowercase());
                }
                normalized.sort();
                normalized.dedup();
                normalized
            }
        };
        Ok(Self { change, options: RichCaseOptions { turkic, minor_words } })
    }
    /// Decode the strict JSON intent.
    /// # Errors
    /// Unknown fields, an unknown mode and every option failure of [`Self::with_options`].
    pub fn from_json(input: &str) -> Result<Self, RichCaseChangeError> {
        if input.len() > MAX_REQUEST_BYTES {
            return Err(RichCaseChangeError::Request);
        }
        let wire: Wire = serde_json::from_str(input).map_err(|_| RichCaseChangeError::Request)?;
        let change = match wire.change.as_str() {
            "upper" => RichCaseChange::Upper,
            "lower" => RichCaseChange::Lower,
            "title" => RichCaseChange::Title,
            "cycle" => RichCaseChange::Cycle,
            _ => return Err(RichCaseChangeError::Request),
        };
        Self::with_options(change, wire.locale.as_deref(), wire.title_minor_words.as_deref())
    }
    /// Requested mode.
    #[must_use]
    pub const fn change(&self) -> RichCaseChange {
        self.change
    }
    /// Mapping options.
    #[must_use]
    pub const fn options(&self) -> &RichCaseOptions {
        &self.options
    }
}
