use thiserror::Error;

use crate::{
    codec::LocalLogCheckpointV3CodecError,
    document::DocumentSchemaAdmissionError,
    local_log::LocalSessionId,
    schema::SchemaFingerprint,
    state::{EditorStateError, LineageId},
};

use super::SchemaAdmissionErrorCode;

/// Why an explicit structural schema admission could not be prepared.
#[derive(Debug, Error)]
#[non_exhaustive]
pub enum SchemaAdmissionV3Error {
    /// Admission is reserved for a change in durable content meaning.
    #[error("schema admission target reuses source fingerprint {fingerprint}")]
    UnchangedFingerprint {
        /// Fingerprint shared by source and requested target.
        fingerprint: SchemaFingerprint,
    },
    /// A new history must not reuse the source snapshot lineage.
    #[error("schema admission target reuses source lineage {lineage}")]
    ReusedLineage {
        /// Reused bounded lineage identity.
        lineage: LineageId,
    },
    /// A new persistence root must not reuse the source local session.
    #[error("schema admission target reuses source local session {session_id}")]
    ReusedSession {
        /// Reused bounded local-session identity.
        session_id: LocalSessionId,
    },
    /// Complete source or target AST validation rejected the unchanged tree.
    #[error("schema admission document validation failed: {0}")]
    Document(#[source] Box<DocumentSchemaAdmissionError>),
    /// Construction of the target revision-zero state failed.
    #[error("schema admission target state is invalid: {0}")]
    TargetState(#[source] Box<EditorStateError>),
    /// The core's freshly created empty checkpoint violated a private invariant.
    #[error("schema admission could not construct its empty target checkpoint")]
    CheckpointInvariant,
    /// The complete target checkpoint could not be encoded canonically as V3.
    #[error("schema admission checkpoint encoding failed: {0}")]
    CheckpointEncoding(#[source] Box<LocalLogCheckpointV3CodecError>),
}

impl SchemaAdmissionV3Error {
    /// Returns the stable machine-readable failure category.
    #[must_use]
    pub const fn code(&self) -> SchemaAdmissionErrorCode {
        match self {
            Self::UnchangedFingerprint { .. } => SchemaAdmissionErrorCode::UnchangedFingerprint,
            Self::ReusedLineage { .. } => SchemaAdmissionErrorCode::ReusedLineage,
            Self::ReusedSession { .. } => SchemaAdmissionErrorCode::ReusedSession,
            Self::Document(_) => SchemaAdmissionErrorCode::Document,
            Self::TargetState(_) => SchemaAdmissionErrorCode::TargetState,
            Self::CheckpointInvariant => SchemaAdmissionErrorCode::CheckpointInvariant,
            Self::CheckpointEncoding(_) => SchemaAdmissionErrorCode::CheckpointEncoding,
        }
    }
}
