//! Compiled schema identity, limits, and complete document validation.

mod compiled_schema;
mod limits;
mod schema_id;
mod validation;

pub use compiled_schema::CompiledSchema;
pub use limits::DocumentLimits;
pub use schema_id::{SchemaId, SchemaVersion, SchemaVersionError};
pub use validation::{
    LimitKind, PropertyPathSegment, ValidationCode, ValidationDetail, ValidationIssue,
    ValidationReport, ValidationSubject,
};
