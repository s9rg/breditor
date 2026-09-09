//! Typed failures for property-preserving transaction envelopes.

use thiserror::Error;

use crate::{
    operation::OperationValidationError,
    schema::{SchemaBindingError, SchemaFingerprintParseError, SchemaVersionError},
    state::SnapshotId,
};

use super::{
    BoundedDiagnostic, CodecErrorCode, JsonFailure, OperationRecordError, TransactionRecordError,
};

/// A typed failure while decoding or encoding one V3 transaction request.
#[derive(Debug, Error)]
#[non_exhaustive]
pub enum TransactionV3CodecError {
    /// The supplied base was proved under a different runtime context.
    #[error("transaction V3 codec context differs from the supplied base-state context")]
    ContextConfigurationMismatch,
    /// The input exceeds the configured UTF-8 byte limit.
    #[error("transaction V3 JSON is {actual} bytes; the configured maximum is {maximum}")]
    InputTooLarge {
        /// Actual input size.
        actual: usize,
        /// Maximum accepted input size.
        maximum: usize,
    },
    /// A deterministic encoding would exceed the codec's decoding budget.
    #[error(
        "encoded transaction V3 JSON exceeds the configured maximum {maximum}; at least {minimum} bytes were observed"
    )]
    OutputTooLarge {
        /// Lower bound observed before serialization stopped, saturated at `usize::MAX`.
        minimum: usize,
        /// Maximum accepted input size for the same codec.
        maximum: usize,
    },
    /// The JSON syntax or strict V3 record shape is invalid.
    #[error("invalid transaction V3 JSON: {0}")]
    InvalidJson(#[source] JsonFailure),
    /// One property-preserving operation payload has invalid strict JSON shape.
    #[error("invalid transaction V3 operation JSON at index {operation_index}: {source}")]
    InvalidOperationJson {
        /// Zero-based operation index.
        operation_index: u64,
        /// Strict JSON record failure.
        #[source]
        source: JsonFailure,
    },
    /// The envelope does not identify Breditor's transaction-request format.
    #[error("unsupported transaction format `{found}`; expected `{expected}`")]
    UnsupportedFormat {
        /// Format found in the input.
        found: BoundedDiagnostic,
        /// Format accepted by this codec.
        expected: &'static str,
    },
    /// The envelope does not use the V3 transaction wire version.
    #[error("unsupported transaction format version {found}; this codec supports {supported}")]
    UnsupportedFormatVersion {
        /// Version found in the input.
        found: u32,
        /// Version accepted by this codec.
        supported: u32,
    },
    /// The encoded schema name is malformed.
    #[error("invalid encoded schema name `{value}`: {source}")]
    InvalidSchemaName {
        /// Encoded schema-name preview.
        value: BoundedDiagnostic,
        /// Qualified-name validation failure.
        #[source]
        source: crate::identity::QualifiedNameError,
    },
    /// The encoded schema version is reserved or invalid.
    #[error("invalid encoded schema version {value}: {source}")]
    InvalidSchemaVersion {
        /// Encoded schema version.
        value: u32,
        /// Version validation failure.
        #[source]
        source: SchemaVersionError,
    },
    /// The encoded fingerprint violates the canonical lowercase SHA-256 text contract.
    #[error("invalid encoded schema fingerprint: {0}")]
    InvalidSchemaFingerprint(#[from] SchemaFingerprintParseError),
    /// The parsed durable binding does not match this codec's compiled schema.
    #[error(transparent)]
    SchemaBinding(#[from] SchemaBindingError),
    /// The encoded request targets a different base snapshot.
    #[error("base snapshot mismatch: input targets {found:?}, supplied base is {expected:?}")]
    BaseSnapshotMismatch {
        /// Snapshot owned by the supplied base state.
        expected: SnapshotId,
        /// Snapshot encoded by the request.
        found: SnapshotId,
    },
    /// The request exceeds the configured atomic operation budget.
    #[error("transaction has {actual} operations; the configured maximum is {maximum}")]
    OperationLimit {
        /// Actual operation count.
        actual: u64,
        /// Configured maximum.
        maximum: u32,
    },
    /// A non-operation field could not pass checked runtime reconstruction.
    #[error(transparent)]
    InvalidTransaction(#[from] TransactionRecordError),
    /// One operation could not pass checked runtime construction.
    #[error("invalid operation at transaction V3 index {operation_index}: {source}")]
    InvalidOperation {
        /// Zero-based operation index.
        operation_index: u64,
        /// Checked primitive operation-record failure.
        #[source]
        source: OperationRecordError,
    },
    /// One reconstructed or supplied operation violates the active context.
    #[error("operation at transaction V3 index {operation_index} failed validation: {source}")]
    OperationValidation {
        /// Zero-based operation index.
        operation_index: u64,
        /// Context-static operation failure.
        #[source]
        source: OperationValidationError,
    },
    /// Serialization of a checked transaction failed.
    #[error("could not encode transaction V3 JSON: {0}")]
    Encoding(#[source] JsonFailure),
}

impl TransactionV3CodecError {
    /// Returns the stable machine-readable failure category.
    #[must_use]
    pub const fn code(&self) -> CodecErrorCode {
        match self {
            Self::ContextConfigurationMismatch => CodecErrorCode::ContextMismatch,
            Self::InputTooLarge { .. } => CodecErrorCode::InputTooLarge,
            Self::OutputTooLarge { .. } => CodecErrorCode::OutputTooLarge,
            Self::InvalidJson(_) | Self::InvalidOperationJson { .. } => CodecErrorCode::InvalidJson,
            Self::UnsupportedFormat { .. } => CodecErrorCode::UnsupportedFormat,
            Self::UnsupportedFormatVersion { .. } => CodecErrorCode::UnsupportedFormatVersion,
            Self::InvalidSchemaName { .. } => CodecErrorCode::InvalidSchemaName,
            Self::InvalidSchemaVersion { .. } => CodecErrorCode::InvalidSchemaVersion,
            Self::InvalidSchemaFingerprint(_) => CodecErrorCode::InvalidSchemaFingerprint,
            Self::SchemaBinding(_) => CodecErrorCode::SchemaMismatch,
            Self::BaseSnapshotMismatch { .. } => CodecErrorCode::SnapshotMismatch,
            Self::OperationLimit { .. } => CodecErrorCode::ResourceLimit,
            Self::InvalidTransaction(_) => CodecErrorCode::InvalidTransaction,
            Self::InvalidOperation { .. } => CodecErrorCode::InvalidOperation,
            Self::OperationValidation { .. } => CodecErrorCode::ValidationFailed,
            Self::Encoding(_) => CodecErrorCode::EncodingFailed,
        }
    }
}
