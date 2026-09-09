//! Compiled schema identity, limits, and complete document validation.

mod binding;
mod binding_error;
mod compilation_error;
mod compiled_schema;
mod compiler;
mod durable_binding;
mod fingerprint;
mod fingerprint_parse_error;
mod limits;
mod persisted_type_revision;
mod schema_id;
mod validation;

pub(crate) use binding::{
    require_exact_breditor_base, require_schema_binding, require_schema_fingerprint,
    require_schema_id,
};
pub use binding_error::SchemaBindingError;
pub use compilation_error::SchemaCompilationError;
pub use compiled_schema::CompiledSchema;
pub(crate) use compiled_schema::CompiledSchemaProof;
pub use compiler::MAX_BASE_TEXT_EXTENSION_INLINE_FORMATS;
pub use durable_binding::DurableSchemaBinding;
pub use fingerprint::SchemaFingerprint;
pub use fingerprint_parse_error::SchemaFingerprintParseError;
pub use limits::DocumentLimits;
pub(crate) use limits::RuntimeValidationProfile;
pub(crate) use limits::{child_count_fits_point_protocol, point_protocol_child_count_maximum};
pub use persisted_type_revision::{PersistedTypeRevision, PersistedTypeRevisionError};
pub use schema_id::{SchemaId, SchemaVersion, SchemaVersionError};
pub use validation::{
    IntegerRangeViolation, LimitKind, MAX_VALIDATION_REPORT_ISSUES, PropertyPathSegment,
    ValidationCode, ValidationDetail, ValidationIssue, ValidationReport, ValidationSubject,
};
