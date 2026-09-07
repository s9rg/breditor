//! Explicit, all-or-nothing structural admission between durable schemas.
//!
//! Admission borrows a checked source checkpoint, validates its unchanged AST
//! under both exact compiled schemas, and prepares a new revision-zero
//! checkpoint under a distinct lineage and durable session. It never runs as a
//! decoder fallback and performs no storage I/O.

mod error;
mod prepare;
mod prepared;
mod request;

#[cfg(test)]
mod tests;

pub use error::{SchemaAdmissionError, SchemaAdmissionErrorCode};
pub use prepared::PreparedSchemaAdmission;
pub use request::SchemaAdmissionRequest;
