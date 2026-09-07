use thiserror::Error;

use crate::{
    codec::LocalLogCheckpointV2CodecError,
    document::DocumentSchemaAdmissionError,
    local_log::LocalSessionId,
    schema::SchemaFingerprint,
    state::{EditorStateError, LineageId},
};

/// Stable machine-readable category for one structural-admission failure.
#[derive(Clone, Copy, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
#[non_exhaustive]
pub enum SchemaAdmissionErrorCode {
    /// The requested target has the same durable content meaning as the source.
    UnchangedFingerprint,
    /// The target reused the source editor-state lineage.
    ReusedLineage,
    /// The target reused the source durable local-session identity.
    ReusedSession,
    /// Source or target structural document validation failed.
    Document,
    /// The revision-zero target state could not be constructed.
    TargetState,
    /// A private empty-checkpoint invariant was unexpectedly rejected.
    CheckpointInvariant,
    /// Canonical Local Log Checkpoint V2 encoding failed.
    CheckpointEncoding,
}

impl SchemaAdmissionErrorCode {
    /// Returns the stable namespaced diagnostic code.
    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::UnchangedFingerprint => "schema_admission.unchanged_fingerprint",
            Self::ReusedLineage => "schema_admission.reused_lineage",
            Self::ReusedSession => "schema_admission.reused_session",
            Self::Document => "schema_admission.document",
            Self::TargetState => "schema_admission.target_state",
            Self::CheckpointInvariant => "schema_admission.checkpoint_invariant",
            Self::CheckpointEncoding => "schema_admission.checkpoint_encoding",
        }
    }
}

/// Why an explicit structural schema admission could not be prepared.
#[derive(Debug, Error)]
#[non_exhaustive]
pub enum SchemaAdmissionError {
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
    /// The complete target checkpoint could not be encoded canonically as V2.
    #[error("schema admission checkpoint encoding failed: {0}")]
    CheckpointEncoding(#[source] Box<LocalLogCheckpointV2CodecError>),
}

impl SchemaAdmissionError {
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
