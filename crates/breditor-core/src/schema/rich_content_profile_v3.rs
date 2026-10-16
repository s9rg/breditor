//! Explicit bounded block layout; V1/V2 specifications and fingerprints stay exact.
use super::SchemaSpec;
pub(super) fn specification(spec: SchemaSpec) -> SchemaSpec {
    let mut spec = super::rich_content_profile_v2::specification(spec);
    spec.rich_content_contract = Some(3);
    spec
}
