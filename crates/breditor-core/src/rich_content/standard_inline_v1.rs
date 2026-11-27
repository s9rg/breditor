//! Optional, versioned everyday inline declarations, not a new document protocol.
//!
//! The ordinary rich constructor never installs this manifest implicitly.
//! Preset V1 names, property domains and numeric font-family meanings are durable
//! schema semantics. A future incompatible preset needs another explicit version.

use crate::{
    document::PropertyInteger,
    extension::{
        ExtensionId, ExtensionManifest, ExtensionVersion, InlineFormatPropertyContractV1,
        InlineFormatPropertySpecV1, InlineFormatPropertyTypeV1, InlineFormatSpecV1,
        PropertyPresenceV1,
    },
    identity::QualifiedName,
    schema::PersistedTypeRevision,
};

/// This optional library extension does not claim the core-reserved namespace.
pub const STANDARD_INLINE_EXTENSION_V1_NAME: &str = "breditor-inline/standard";
/// Required URL property; URL rendering policy is separate from schema admission.
pub const STANDARD_INLINE_HREF_V1: &str = "breditor-inline/href";
/// Required link target flag; href and target remain one complete semantic format.
pub const STANDARD_INLINE_NEW_WINDOW_V1: &str = "breditor-inline/new-window";
/// Required RGB24 integer used by text and background color formats.
pub const STANDARD_INLINE_RGB24_V1: &str = "breditor-inline/rgb24";
/// Required integer CSS-pixel size, inclusively bounded to 8 through 96.
pub const STANDARD_INLINE_PIXELS_V1: &str = "breditor-inline/pixels";
/// Required font preset: 1 system, 2 sans-serif, 3 serif, 4 monospace.
pub const STANDARD_INLINE_FAMILY_V1: &str = "breditor-inline/family";

/// Original semantic identities for the complete V1 standard inline set.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum StandardInlineFormatV1 {
    /// Existing built-in strong format; not redeclared by the extension.
    Strong,
    /// Emphasis.
    Italic,
    /// Underlined text.
    Underline,
    /// Struck-through text.
    Strike,
    /// Inline code, not a structural code block.
    Code,
    /// Subscript. Commands treat it as exclusive with superscript: applying it
    /// removes superscript in the same intent (see `inspect_standard_script_v1`).
    Subscript,
    /// Superscript. Admission does not silently delete subscript; a stored run with
    /// both reads as a conflicting mixed script and resolves to superscript on export.
    Superscript,
    /// Required href and new-window flag.
    Link,
    /// RGB24 text color.
    TextColor,
    /// RGB24 background color/highlight.
    BackgroundColor,
    /// Integer pixel size.
    TextSize,
    /// Bounded host-rendered font-family preset.
    FontFamily,
}
impl StandardInlineFormatV1 {
    /// Exact qualified identity; independent from DOM tags or toolbar labels.
    #[must_use]
    pub fn kind(self) -> QualifiedName {
        QualifiedName::from_known_static(match self {
            Self::Strong => "breditor/strong",
            Self::Italic => "breditor-inline/italic",
            Self::Underline => "breditor-inline/underline",
            Self::Strike => "breditor-inline/strike",
            Self::Code => "breditor-inline/code",
            Self::Subscript => "breditor-inline/subscript",
            Self::Superscript => "breditor-inline/superscript",
            Self::Link => "breditor-inline/link",
            Self::TextColor => "breditor-inline/text-color",
            Self::BackgroundColor => "breditor-inline/background-color",
            Self::TextSize => "breditor-inline/text-size",
            Self::FontFamily => "breditor-inline/font-family",
        })
    }
}

fn trusted<T, E>(value: Result<T, E>) -> T {
    value.unwrap_or_else(|_| unreachable!("trusted standard inline V1 declaration"))
}
fn property(
    name: &'static str,
    value_type: InlineFormatPropertyTypeV1,
) -> InlineFormatPropertySpecV1 {
    InlineFormatPropertySpecV1::new(
        QualifiedName::from_known_static(name),
        PropertyPresenceV1::Required,
        value_type,
    )
}
fn integer(minimum: i64, maximum: i64) -> InlineFormatPropertyTypeV1 {
    trusted(InlineFormatPropertyTypeV1::try_integer(
        Some(trusted(PropertyInteger::try_new(minimum))),
        Some(trusted(PropertyInteger::try_new(maximum))),
    ))
}

/// Construct the immutable, behavior-free standard manifest through normal validation.
///
/// Hosts compose this with their own declarations before resolving the complete
/// extension graph. There are no callbacks, codecs, command registrations, DOM
/// attributes, arbitrary CSS strings or executable validators in this manifest.
/// The rich grammar, existing profiles and original wire families are unchanged.
#[must_use]
pub fn standard_inline_extension_v1() -> ExtensionManifest {
    use StandardInlineFormatV1 as F;
    let free = [F::Italic, F::Underline, F::Strike, F::Code, F::Subscript, F::Superscript];
    let typed = [
        (
            F::Link,
            vec![
                property(
                    STANDARD_INLINE_HREF_V1,
                    trusted(InlineFormatPropertyTypeV1::try_string(1, 2048)),
                ),
                property(STANDARD_INLINE_NEW_WINDOW_V1, InlineFormatPropertyTypeV1::boolean()),
            ],
        ),
        (F::TextColor, vec![property(STANDARD_INLINE_RGB24_V1, integer(0, 0x00ff_ffff))]),
        (F::BackgroundColor, vec![property(STANDARD_INLINE_RGB24_V1, integer(0, 0x00ff_ffff))]),
        (F::TextSize, vec![property(STANDARD_INLINE_PIXELS_V1, integer(8, 96))]),
        (F::FontFamily, vec![property(STANDARD_INLINE_FAMILY_V1, integer(1, 4))]),
    ];
    let mut formats: Vec<_> = free
        .into_iter()
        .map(|kind| InlineFormatSpecV1::new(kind.kind(), PersistedTypeRevision::one()))
        .collect();
    let mut contracts = Vec::new();
    for (kind, properties) in typed {
        formats.push(InlineFormatSpecV1::new(kind.kind(), PersistedTypeRevision::one()));
        contracts.push(trusted(InlineFormatPropertyContractV1::try_new(kind.kind(), properties)));
    }
    trusted(ExtensionManifest::try_new_with_inline_formats_and_property_contracts(
        ExtensionId::new(
            QualifiedName::from_known_static(STANDARD_INLINE_EXTENSION_V1_NAME),
            ExtensionVersion::one(),
        ),
        vec![],
        vec![],
        formats,
        contracts,
    ))
}
