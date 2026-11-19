//! Explicit unreleased candidate rich V4: V3 grammar plus bounded ordered-list numbering.
//!
//! V1–V3 specifications and fingerprints stay exact. Later V4 candidate slices
//! change this revision's rules before release, so no V4 data is persisted yet.
use super::SchemaSpec;
pub(super) fn specification(spec: SchemaSpec) -> SchemaSpec {
    let mut spec = super::rich_content_profile_v3::specification(spec);
    spec.rich_content_contract = Some(4);
    spec
}
