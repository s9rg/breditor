//! Bounded text-run language metadata of the explicit candidate rich V4.
//!
//! One native inline format, `breditor/text-language`, tags a run with one
//! canonical BCP 47 language tag so assistive technology, spell checking and
//! hyphenation use the right language. Like every valued inline format, a
//! character carries at most one value and setting a new value replaces the old
//! one. Language never changes block direction.
//!
//! The admitted tag grammar is a deliberately bounded, well-formed subset of
//! RFC 5646 `langtag` (no registry lookup):
//!
//! ```text
//! tag      = language ["-" script] ["-" region] *("-" variant)   ; ≤ 35 bytes
//! language = 2*3ALPHA / 5*8ALPHA                                  ; lowercase
//! script   = 4ALPHA                                               ; Titlecase
//! region   = 2ALPHA / 3DIGIT                                      ; UPPERCASE
//! variant  = 5*8alphanum / (DIGIT 3alphanum)                      ; lowercase, unique
//! ```
//!
//! Extended language subtags (`zh-yue`), extensions (`de-u-co-phonebk`),
//! private use (`x-…`, `en-x-…`) and grandfathered irregular tags (`i-klingon`)
//! are rejected; `_` is not a separator. Document admission is strict: only the
//! canonical case form is stored, so equal tags compare equal byte for byte.
//! Input boundaries (the native command, toolbar and HTML import) canonicalize
//! case first with [`RichLanguageTag::canonicalize`].
use crate::{
    document::{Format, PropertyMap, PropertyValue},
    identity::QualifiedName,
};

/// Native inline format kind (candidate rich V4 only).
pub const RICH_TEXT_LANGUAGE_FORMAT: &str = "breditor/text-language";
/// Its single required string property holding the canonical tag.
pub const RICH_TEXT_LANGUAGE_TAG_PROPERTY: &str = "breditor/language-tag";
/// Inclusive UTF-8 (ASCII) byte bounds of an admitted tag.
pub const RICH_LANGUAGE_TAG_MIN_BYTES: u32 = 2;
/// Inclusive maximum; RFC 5646 recommends supporting at least 35 characters.
pub const RICH_LANGUAGE_TAG_MAX_BYTES: u32 = 35;

/// Payload-free text-language admission failure.
#[derive(Clone, Copy, Debug, Eq, PartialEq, thiserror::Error)]
pub enum RichTextLanguageError {
    /// The explicit rich V4 candidate profile is required; old profiles never widen.
    #[error("text language requires the explicit rich V4 profile")]
    Profile,
    /// The value is not a well-formed bounded language tag (or not canonical where required).
    #[error("invalid bounded language tag")]
    Value,
}

/// One admitted canonical language tag.
#[derive(Clone, Debug, Eq, Ord, PartialEq, PartialOrd, Hash)]
pub struct RichLanguageTag(Box<str>);

impl RichLanguageTag {
    /// Admit an already canonical tag exactly (document admission rule).
    /// # Errors
    /// Rejects malformed, over-long or non-canonical-case values.
    pub fn try_new(value: &str) -> Result<Self, RichTextLanguageError> {
        let canonical = Self::canonicalize(value)?;
        if canonical.as_str() == value { Ok(canonical) } else { Err(RichTextLanguageError::Value) }
    }

    /// Admit a well-formed tag in any ASCII letter case and return its canonical form.
    /// # Errors
    /// Rejects malformed or over-long values; case is never a reason for rejection.
    pub fn canonicalize(value: &str) -> Result<Self, RichTextLanguageError> {
        canonical(value).map(|tag| Self(tag.into_boxed_str())).ok_or(RichTextLanguageError::Value)
    }

    /// Canonical tag text.
    #[must_use]
    pub fn as_str(&self) -> &str {
        &self.0
    }

    /// Native format kind.
    #[must_use]
    pub fn format_kind() -> QualifiedName {
        QualifiedName::from_known_static(RICH_TEXT_LANGUAGE_FORMAT)
    }

    /// Complete native format literal carrying this tag.
    #[must_use]
    pub fn format(&self) -> Format {
        let property = QualifiedName::from_known_static(RICH_TEXT_LANGUAGE_TAG_PROPERTY);
        let properties =
            PropertyMap::try_from_sorted(vec![(property, PropertyValue::from_string(&*self.0))])
                .unwrap_or_else(|_| unreachable!("one property is sorted"));
        Format::new(Self::format_kind(), properties)
    }

    /// Read the strict canonical tag of one `breditor/text-language` format.
    /// # Errors
    /// Rejects another kind, a missing/extra/ill-typed property or a non-canonical tag.
    pub fn from_format(format: &Format) -> Result<Self, RichTextLanguageError> {
        if format.kind().as_str() != RICH_TEXT_LANGUAGE_FORMAT || format.properties().len() != 1 {
            return Err(RichTextLanguageError::Value);
        }
        let property = QualifiedName::from_known_static(RICH_TEXT_LANGUAGE_TAG_PROPERTY);
        let value = format.properties().get(&property).and_then(PropertyValue::as_string);
        Self::try_new(value.ok_or(RichTextLanguageError::Value)?)
    }
}

/// Whether one admitted string property value is a canonical tag (validation hook).
pub(crate) fn is_canonical_tag(value: &str) -> bool {
    canonical(value).is_some_and(|tag| tag == value)
}

fn canonical(value: &str) -> Option<String> {
    let length = u32::try_from(value.len()).ok()?;
    if !(RICH_LANGUAGE_TAG_MIN_BYTES..=RICH_LANGUAGE_TAG_MAX_BYTES).contains(&length)
        || !value.bytes().all(|byte| byte.is_ascii_alphanumeric() || byte == b'-')
    {
        return None;
    }
    let mut subtags = value.split('-').peekable();
    let mut output = Vec::with_capacity(4);
    let language = subtags.next()?;
    if !(matches!(language.len(), 2 | 3 | 5..=8) && alpha(language)) {
        return None;
    }
    output.push(language.to_ascii_lowercase());
    if let Some(script) = subtags.next_if(|s| s.len() == 4 && alpha(s)) {
        let mut titled = script.to_ascii_lowercase();
        if let Some(first) = titled.get_mut(..1) {
            first.make_ascii_uppercase();
        }
        output.push(titled);
    }
    if let Some(region) =
        subtags.next_if(|s| (s.len() == 2 && alpha(s)) || (s.len() == 3 && digits(s)))
    {
        output.push(region.to_ascii_uppercase());
    }
    let first_variant = output.len();
    for variant in subtags {
        let bytes = variant.as_bytes();
        let shaped = matches!(bytes.len(), 5..=8)
            || (bytes.len() == 4 && bytes.first().is_some_and(u8::is_ascii_digit));
        let lower = variant.to_ascii_lowercase();
        if !shaped || output[first_variant..].contains(&lower) {
            return None;
        }
        output.push(lower);
    }
    Some(output.join("-"))
}

fn alpha(value: &str) -> bool {
    value.bytes().all(|byte| byte.is_ascii_alphabetic())
}

fn digits(value: &str) -> bool {
    value.bytes().all(|byte| byte.is_ascii_digit())
}

#[cfg(test)]
mod tests {
    use super::{RichLanguageTag, is_canonical_tag};

    #[test]
    fn canonicalizes_case_and_rejects_everything_outside_the_bounded_grammar() {
        for (input, canonical) in [
            ("en", "en"),
            ("EN", "en"),
            ("fr-ca", "fr-CA"),
            ("zh-hant-tw", "zh-Hant-TW"),
            ("sr-LATN-rs", "sr-Latn-RS"),
            ("es-419", "es-419"),
            ("de-CH-1996", "de-CH-1996"),
            ("sl-ROZAJ-BISKE", "sl-rozaj-biske"),
            ("hy-latn-it-arevela", "hy-Latn-IT-arevela"),
            ("art-lojban", "art-lojban"),
            ("abcde", "abcde"),
        ] {
            assert_eq!(
                RichLanguageTag::canonicalize(input).map(|t| t.0.into_string()),
                Ok(canonical.to_owned()),
                "{input}"
            );
            assert!(is_canonical_tag(canonical));
            assert_eq!(is_canonical_tag(input), input == canonical, "{input}");
        }
        for bad in [
            "",
            "e",
            "eng1",
            "abcd",
            "abcdefghi",
            "en_US",
            "en-",
            "-en",
            "en--US",
            "en-u-co-phonebk",
            "x-private",
            "en-x-foo",
            "i-klingon",
            "zh-yue",
            "en-US-US",
            "de-1996-1996",
            "en-a",
            "en-Latn-Latn",
            "en US",
            "é",
            "en-12",
            "en-1234a6789",
            "abcdefgh-abcdefgh-abcdefgh-abcdefg1",
        ] {
            assert!(RichLanguageTag::canonicalize(bad).is_err(), "{bad}");
        }
        // 35 bytes is admitted; 36 is not.
        let longest = "abcdefgh-Abcd-123-abcde-abcdf-abcdg";
        assert_eq!(longest.len(), 35);
        assert!(RichLanguageTag::try_new(longest).is_ok());
        assert!(RichLanguageTag::canonicalize("abcdefgh-Abcd-123-abcde-abcdf-abcdgh").is_err());
        assert!(RichLanguageTag::try_new("en-us").is_err());
        assert!(RichLanguageTag::try_new("en-US").is_ok());
    }
}
