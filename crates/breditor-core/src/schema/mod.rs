//! Compiled schema identity, limits, and complete document validation.

mod compiled_schema;
mod compiler;
mod fingerprint;
mod limits;
mod schema_id;
mod validation;

pub use compiled_schema::CompiledSchema;
pub(crate) use compiled_schema::CompiledSchemaProof;
pub use fingerprint::SchemaFingerprint;
pub use limits::DocumentLimits;
pub(crate) use limits::RuntimeValidationProfile;
pub(crate) use limits::{child_count_fits_point_protocol, point_protocol_child_count_maximum};
pub use schema_id::{SchemaId, SchemaVersion, SchemaVersionError};
pub use validation::{
    LimitKind, PropertyPathSegment, ValidationCode, ValidationDetail, ValidationIssue,
    ValidationReport, ValidationSubject,
};
