//! Explicit unreleased candidate rich V4: V3 grammar plus bounded ordered-list numbering
//! and one native text-language inline format.
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

/// Native formats V4 adds to the extension-declared set (counted against the 256 ceiling).
pub(super) const NATIVE_INLINE_FORMATS: u32 = 1;

pub(super) fn specification(spec: SchemaSpec) -> SchemaSpec {
    let mut spec = super::rich_content_profile_v3::specification(spec);
    spec.rich_content_contract = Some(4);
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
