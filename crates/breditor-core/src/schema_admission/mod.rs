//! Explicit, all-or-nothing structural admission between durable schemas.
//!
//! Admission borrows a checked source checkpoint, validates its unchanged AST
//! under both exact compiled schemas, and prepares a new revision-zero
//! checkpoint under a distinct lineage and durable session. It never runs as a
//! decoder fallback and performs no storage I/O.
//!
//! [`SchemaAdmissionRequest::try_prepare`] retains its exact V2 output.
//! [`SchemaAdmissionRequest::try_prepare_v3`] explicitly selects typed-property
//! preserving V3 output through a separate [`PreparedSchemaAdmissionV3`] owner.

mod error;
mod error_v3;
mod prepare;
mod prepare_v3;
mod prepared;
mod prepared_v3;
mod request;
mod request_prepare_v3;

#[cfg(test)]
mod tests;
#[cfg(test)]
mod tests_v3;

pub use error::{SchemaAdmissionError, SchemaAdmissionErrorCode};
pub use error_v3::SchemaAdmissionV3Error;
pub use prepared::PreparedSchemaAdmission;
pub use prepared_v3::PreparedSchemaAdmissionV3;
pub use request::SchemaAdmissionRequest;
