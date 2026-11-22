//! Optional first-party ruby (furigana) annotation extension, not a grammar change.
//!
//! Ruby is delivered through the existing typed inline-format extension seam: one
//! host-declared format `breditor-ruby/ruby` (revision 1) with exactly one required,
//! bounded string property `breditor-ruby/annotation`. The base text is the formatted
//! run; the annotation is the property. Hosts opt in by composing this manifest into a
//! profile (for example a rich V4 bootstrap). Such a profile compiles to its own schema
//! fingerprint; the frozen V1–V4 grammars, their fingerprints and every profile without
//! this manifest are unchanged. Commands, history, replay and shared merging are the
//! generic typed-format contracts (`SetInlineFormat`, shared `SetFormat`).
//!
//! The annotation text rules below (`RichRubyAnnotation`) are an authoring/import policy
//! applied by commands and converters; schema admission enforces only the byte bound.

use crate::{
    document::{Format, PropertyMap, PropertyValue},
    extension::{
        ExtensionId, ExtensionManifest, ExtensionVersion, InlineFormatPropertyContractV1,
        InlineFormatPropertySpecV1, InlineFormatPropertyTypeV1, InlineFormatSpecV1,
        PropertyPresenceV1,
    },
    identity::QualifiedName,
    schema::PersistedTypeRevision,
};
use thiserror::Error;

/// Extension identity (version 1). Outside the core-reserved `breditor/*` namespace.
pub const RICH_RUBY_EXTENSION_V1_NAME: &str = "breditor-ruby/ruby";
/// The inline format kind (revision 1) carried by ruby base text.
pub const RICH_RUBY_FORMAT_V1: &str = "breditor-ruby/ruby";
/// The required annotation (reading) property.
pub const RICH_RUBY_ANNOTATION_V1: &str = "breditor-ruby/annotation";
/// Inclusive UTF-8 byte bound of one annotation.
pub const RICH_RUBY_ANNOTATION_MAX_BYTES: u32 = 256;

fn trusted<T, E>(value: Result<T, E>) -> T {
    value.unwrap_or_else(|_| unreachable!("trusted ruby V1 declaration"))
}

/// Construct the immutable, behavior-free ruby manifest through normal validation.
///
/// It declares one format and its property contract only: no toggle or setter
/// registration, callbacks, DOM attributes or codecs. Rich owners edit it with the
/// generic typed-format commands.
#[must_use]
pub fn ruby_extension_v1() -> ExtensionManifest {
    let kind = QualifiedName::from_known_static(RICH_RUBY_FORMAT_V1);
    trusted(ExtensionManifest::try_new_with_inline_formats_and_property_contracts(
        ExtensionId::new(
            QualifiedName::from_known_static(RICH_RUBY_EXTENSION_V1_NAME),
            ExtensionVersion::one(),
        ),
        vec![],
        vec![],
        vec![InlineFormatSpecV1::new(kind.clone(), PersistedTypeRevision::one())],
        vec![trusted(InlineFormatPropertyContractV1::try_new(
            kind,
            vec![InlineFormatPropertySpecV1::new(
                QualifiedName::from_known_static(RICH_RUBY_ANNOTATION_V1),
                PropertyPresenceV1::Required,
                trusted(InlineFormatPropertyTypeV1::try_string(1, RICH_RUBY_ANNOTATION_MAX_BYTES)),
            )],
        ))],
    ))
}

/// Rejected ruby annotation text.
#[derive(Clone, Copy, Debug, Eq, Error, PartialEq)]
pub enum RichRubyError {
    /// Empty, over-long, edge whitespace, or a control/separator/bidi control character.
    #[error("ruby annotation must be 1-256 UTF-8 bytes without controls or edge whitespace")]
    Annotation,
}

/// One admitted annotation: 1–256 UTF-8 bytes, no leading/trailing whitespace, no
/// control characters, line/paragraph separators or bidi embedding/override/isolate
/// controls. No trimming or normalization is performed.
#[derive(Clone, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
pub struct RichRubyAnnotation(Box<str>);

fn forbidden(character: char) -> bool {
    character.is_control()
        || matches!(character, '\u{2028}' | '\u{2029}' | '\u{202A}'..='\u{202E}' | '\u{2066}'..='\u{2069}')
}

impl RichRubyAnnotation {
    /// Admit one exact annotation.
    /// # Errors
    /// [`RichRubyError::Annotation`] when the text breaks the rules above.
    pub fn try_new(value: &str) -> Result<Self, RichRubyError> {
        if !value.is_empty()
            && value.len() <= RICH_RUBY_ANNOTATION_MAX_BYTES as usize
            && !value.starts_with(char::is_whitespace)
            && !value.ends_with(char::is_whitespace)
            && !value.chars().any(forbidden)
        {
            Ok(Self(value.into()))
        } else {
            Err(RichRubyError::Annotation)
        }
    }
    /// Stored annotation text.
    #[must_use]
    pub fn as_str(&self) -> &str {
        &self.0
    }
    /// The complete format literal carrying this annotation.
    #[must_use]
    pub fn format(&self) -> Format {
        Format::new(
            QualifiedName::from_known_static(RICH_RUBY_FORMAT_V1),
            trusted(PropertyMap::try_from_sorted(vec![(
                QualifiedName::from_known_static(RICH_RUBY_ANNOTATION_V1),
                PropertyValue::from_string(self.as_str()),
            )])),
        )
    }
    /// The admitted annotation of one ruby format literal, if it is one.
    #[must_use]
    pub fn of(format: &Format) -> Option<Self> {
        if format.kind().as_str() != RICH_RUBY_FORMAT_V1 || format.properties().len() != 1 {
            return None;
        }
        let value = format
            .properties()
            .get(&QualifiedName::from_known_static(RICH_RUBY_ANNOTATION_V1))?
            .as_string()?;
        Self::try_new(value).ok()
    }
}
