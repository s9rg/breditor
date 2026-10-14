//! Bounded failures for the separately versioned local rich checkpoint.

/// Failure to encode or replay-admit a local rich session; no partial owner escapes.
#[derive(Debug, thiserror::Error)]
pub enum RichSessionCodecError {
    /// The checkpoint exceeds the independent byte or retained-entry budget.
    #[error("rich local checkpoint exceeds its active byte or entry budget")]
    Limit,
    /// The format family/version is not supported by this exact codec.
    #[error("unsupported rich local checkpoint format or version")]
    Format,
    /// A typed identity, text offset or capacity is outside its syntax contract.
    #[error("invalid rich local checkpoint identity, position or capacity")]
    Value,
    /// Strict JSON parsing or allocation preflight failed.
    #[error(transparent)]
    Json(#[from] super::JsonFailure),
    /// The fingerprint-bearing base document failed admission.
    #[error(transparent)]
    Document(#[from] super::DocumentV2CodecError),
    /// Node/format canonical construction failed.
    #[error(transparent)]
    Validation(#[from] crate::schema::ValidationReport),
    /// Rich snapshot admission failed under the active schema and resource policy.
    #[error(transparent)]
    RichDocument(#[from] crate::rich_content::RichDocumentError),
    /// Complete guarded replay, state admission or history coherence failed.
    #[error(transparent)]
    Replay(#[from] crate::rich_content::RichLocalSessionError),
}
