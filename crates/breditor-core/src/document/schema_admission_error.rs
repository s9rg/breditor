use thiserror::Error;

use crate::schema::{SchemaBindingError, ValidationReport};

/// Why a borrowed document could not be structurally admitted to a target schema.
#[derive(Debug, Error)]
#[non_exhaustive]
pub enum DocumentSchemaAdmissionError {
    /// The document's durable identity does not match the claimed source schema.
    #[error("source schema binding is invalid: {0}")]
    SourceBinding(#[source] SchemaBindingError),
    /// Complete validation under the exact source schema and policy failed.
    #[error("source document validation failed: {0}")]
    SourceValidation(#[source] ValidationReport),
    /// The unchanged source tree is not valid under the target schema and policy.
    #[error("target document validation failed: {0}")]
    TargetValidation(#[source] ValidationReport),
}
