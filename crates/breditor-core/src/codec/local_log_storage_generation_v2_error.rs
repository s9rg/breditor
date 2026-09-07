use thiserror::Error;

use crate::{
    identity::QualifiedNameError,
    schema::{SchemaBindingError, SchemaFingerprintParseError, SchemaVersionError},
};

use super::{
    BoundedDiagnostic, CodecErrorCode, LocalLogCheckpointV2CodecError,
    LocalLogStorageGenerationBindingField, LocalLogStorageGenerationContinuityError,
    LocalLogStorageGenerationJsonFailure, LocalLogStorageGenerationRecordError,
    LocalLogStorageGenerationResourceLimit, LocalLogStorageGenerationTopologyError,
};

/// A typed failure while decoding, encoding, or preparing Storage Generation V2.
#[derive(Debug, Error)]
#[non_exhaustive]
pub enum LocalLogStorageGenerationV2CodecError {
    /// A retained value was proved under another runtime context.
    #[error("storage-generation V2 context differs from the retained checkpoint context")]
    ContextConfigurationMismatch,
    /// The complete input exceeds the manifest-input limit.
    #[error("storage-generation V2 JSON is {actual} bytes; the configured maximum is {maximum}")]
    InputTooLarge {
        /// Actual UTF-8 input bytes.
        actual: usize,
        /// Maximum accepted input bytes.
        maximum: usize,
    },
    /// A deterministic encoding exceeds the manifest-output limit.
    #[error(
        "encoded storage-generation V2 JSON exceeds {maximum}; at least {minimum} bytes were observed"
    )]
    OutputTooLarge {
        /// Exact size or observed lower bound.
        minimum: usize,
        /// Maximum accepted output bytes.
        maximum: usize,
    },
    /// Outer JSON syntax or strict object shape is invalid.
    #[error("invalid storage-generation V2 JSON: {0}")]
    InvalidJson(LocalLogStorageGenerationJsonFailure),
    /// The envelope does not identify Breditor's storage-generation format.
    #[error("unsupported storage-generation format; expected `{expected}`")]
    UnsupportedFormat {
        /// Format accepted by this codec.
        expected: &'static str,
    },
    /// The envelope does not use Storage Generation V2.
    #[error(
        "unsupported storage-generation format version {found}; this codec supports {supported}"
    )]
    UnsupportedFormatVersion {
        /// Version found in the input.
        found: u32,
        /// Version accepted by this codec.
        supported: u32,
    },
    /// The encoded schema selector name is malformed.
    #[error("invalid encoded schema name `{value}`: {source}")]
    InvalidSchemaName {
        /// Bounded rejected selector preview.
        value: BoundedDiagnostic,
        #[source]
        /// Selector-name validation failure.
        source: QualifiedNameError,
    },
    /// The encoded schema selector version is malformed.
    #[error("invalid encoded schema version {value}: {source}")]
    InvalidSchemaVersion {
        /// Numeric version found in the selector.
        value: u32,
        #[source]
        /// Selector-version validation failure.
        source: SchemaVersionError,
    },
    /// The fingerprint text is not canonical.
    #[error("invalid encoded schema fingerprint: {0}")]
    InvalidSchemaFingerprint(#[from] SchemaFingerprintParseError),
    /// The parsed durable binding differs from the trusted compiled schema.
    #[error(transparent)]
    SchemaBinding(#[from] SchemaBindingError),
    /// A wire or outcome assertion disagrees with trusted input.
    #[error("storage-generation V2 {field:?} does not match its trusted association")]
    BindingMismatch {
        /// Trusted storage field that disagreed.
        field: LocalLogStorageGenerationBindingField,
    },
    /// One scalar field failed checked reconstruction.
    #[error(transparent)]
    InvalidRecord(#[from] LocalLogStorageGenerationRecordError),
    /// One record or edge has impossible identity topology.
    #[error(transparent)]
    InvalidTopology(#[from] LocalLogStorageGenerationTopologyError),
    /// The value does not continue the supplied validated prior manifest.
    #[error(transparent)]
    InvalidContinuity(#[from] LocalLogStorageGenerationContinuityError),
    /// A host-authoritative resource ceiling was exceeded.
    #[error(transparent)]
    ResourceLimit(#[from] LocalLogStorageGenerationResourceLimit),
    /// The embedded Checkpoint V2 failed strict reconstruction or encoding.
    #[error("invalid nested Local Log Checkpoint V2: {0}")]
    InvalidCheckpoint(#[source] Box<LocalLogCheckpointV2CodecError>),
    /// The checkpoint string is not exact canonical Checkpoint V2 JSON.
    #[error("storage-generation checkpoint JSON is not canonical Checkpoint V2 output")]
    NonCanonicalCheckpointJson,
    /// The complete input is not exact canonical Storage Generation V2 JSON.
    #[error("storage-generation JSON is not its canonical V2 byte encoding")]
    NonCanonicalManifestJson,
    /// A checked runtime invariant failed after validation.
    #[error("storage-generation V2 runtime invariant failed: {diagnostic}")]
    RuntimeInvariant {
        /// Bounded payload-free invariant diagnostic.
        diagnostic: BoundedDiagnostic,
    },
    /// Serialization of a checked value failed.
    #[error("could not encode storage-generation V2 JSON: {0}")]
    Encoding(LocalLogStorageGenerationJsonFailure),
}

impl LocalLogStorageGenerationV2CodecError {
    /// Returns the stable machine-readable failure category.
    #[must_use]
    pub const fn code(&self) -> CodecErrorCode {
        match self {
            Self::ContextConfigurationMismatch => CodecErrorCode::ContextMismatch,
            Self::InputTooLarge { .. } => CodecErrorCode::InputTooLarge,
            Self::OutputTooLarge { .. } => CodecErrorCode::OutputTooLarge,
            Self::InvalidJson(_) => CodecErrorCode::InvalidJson,
            Self::UnsupportedFormat { .. } => CodecErrorCode::UnsupportedFormat,
            Self::UnsupportedFormatVersion { .. } => CodecErrorCode::UnsupportedFormatVersion,
            Self::InvalidSchemaName { .. } => CodecErrorCode::InvalidSchemaName,
            Self::InvalidSchemaVersion { .. } => CodecErrorCode::InvalidSchemaVersion,
            Self::InvalidSchemaFingerprint(_) => CodecErrorCode::InvalidSchemaFingerprint,
            Self::SchemaBinding(_) => CodecErrorCode::SchemaMismatch,
            Self::ResourceLimit(_) => CodecErrorCode::ResourceLimit,
            Self::InvalidCheckpoint(source) => source.code(),
            Self::Encoding(_) => CodecErrorCode::EncodingFailed,
            Self::BindingMismatch { .. }
            | Self::InvalidRecord(_)
            | Self::InvalidTopology(_)
            | Self::InvalidContinuity(_)
            | Self::NonCanonicalCheckpointJson
            | Self::NonCanonicalManifestJson
            | Self::RuntimeInvariant { .. } => CodecErrorCode::InvalidLocalLogStorageGeneration,
        }
    }
}
