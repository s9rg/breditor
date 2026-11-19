//! Explicit unreleased candidate rich V4: V3 grammar plus bounded ordered-list numbering,
//! one native text-language inline format and bounded image links.
//!
//! V1–V3 specifications and fingerprints stay exact. Later V4 candidate slices
//! change this revision's rules before release, so no V4 data is persisted yet.
use super::{DeclarationOwner, InlineFormatSpec, PersistedTypeRevision, SchemaSpec};
use crate::{
    extension::{
        InlineFormatPropertyContractV1, InlineFormatPropertySpecV1, InlineFormatPropertyTypeV1,
        PropertyPresenceV1,
    },
    identity::QualifiedName,
    rich_content::{
        RICH_LANGUAGE_TAG_MAX_BYTES, RICH_LANGUAGE_TAG_MIN_BYTES, RICH_TEXT_LANGUAGE_FORMAT,
        RICH_TEXT_LANGUAGE_TAG_PROPERTY,
    },
};

/// Persisted type revision of `breditor/image` in V4 (V1–V3 keep revision 1).
const IMAGE_REVISION: u32 = 2;

/// Native formats V4 adds to the extension-declared set (counted against the 256 ceiling).
pub(super) const NATIVE_INLINE_FORMATS: u32 = 1;

pub(super) fn specification(spec: SchemaSpec) -> SchemaSpec {
    let mut spec = super::rich_content_profile_v3::specification(spec);
    spec.rich_content_contract = Some(4);
    // The image element gains optional link properties (`image-href`,
    // `image-link-new-window`) and the "a linked image is never decorative" law.
    // Its persisted type revision records that changed property contract.
    for element in &mut spec.elements {
        if element.kind.as_str() == "breditor/image" {
            element.revision = PersistedTypeRevision::try_new(IMAGE_REVISION)
                .unwrap_or_else(|_| unreachable!("trusted nonzero image revision"));
        }
    }
    let kind = QualifiedName::from_known_static(RICH_TEXT_LANGUAGE_FORMAT);
    let value_type = InlineFormatPropertyTypeV1::try_string(
        RICH_LANGUAGE_TAG_MIN_BYTES,
        RICH_LANGUAGE_TAG_MAX_BYTES,
    )
    .unwrap_or_else(|_| unreachable!("trusted language-tag bounds"));
    // The canonical BCP 47 grammar itself is a sealed V4 rich rule checked by validation.
    let contract = InlineFormatPropertyContractV1::new_core(
        kind.clone(),
        vec![InlineFormatPropertySpecV1::new(
            QualifiedName::from_known_static(RICH_TEXT_LANGUAGE_TAG_PROPERTY),
            PropertyPresenceV1::Required,
            value_type,
        )],
    );
    spec.inline_formats.push(InlineFormatSpec {
        kind,
        owner: DeclarationOwner::Breditor,
        revision: PersistedTypeRevision::one(),
        property_contract: Some(contract),
    });
    spec
}
