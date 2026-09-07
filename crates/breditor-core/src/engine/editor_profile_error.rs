use thiserror::Error;

/// Stable machine-readable category for [`EditorEngineProfileError`].
#[non_exhaustive]
#[derive(Clone, Copy, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
pub enum EditorEngineProfileErrorCode {
    /// The supplied session was created outside a compiled profile.
    MissingGeneration,
    /// The supplied session belongs to another compiled profile generation.
    GenerationMismatch,
    /// The supplied session was not proved by the profile's exact schema.
    SchemaProofMismatch,
}

impl EditorEngineProfileErrorCode {
    /// Returns the stable namespaced error code.
    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::MissingGeneration => "editor_engine.profile.missing_generation",
            Self::GenerationMismatch => "editor_engine.profile.generation_mismatch",
            Self::SchemaProofMismatch => "editor_engine.profile.schema_proof_mismatch",
        }
    }
}

/// Why a session and compiled profile could not become one guarded engine.
///
/// Generation values and schema-proof identities are deliberately absent from
/// every diagnostic because neither has a serializable representation.
#[non_exhaustive]
#[derive(Clone, Debug, Eq, Error, PartialEq)]
pub enum EditorEngineProfileError {
    /// The session context does not carry any compiled-profile generation.
    #[error("editor session context is not bound to a compiled profile generation")]
    MissingGeneration,
    /// The session context carries a different compiled-profile generation.
    #[error("editor session context belongs to another compiled profile generation")]
    GenerationMismatch,
    /// The session schema proof differs from the profile's compiled schema.
    #[error("editor session context does not share the compiled profile schema proof")]
    SchemaProofMismatch,
}

impl EditorEngineProfileError {
    /// Returns the stable machine-readable failure category.
    #[must_use]
    pub const fn code(&self) -> EditorEngineProfileErrorCode {
        match self {
            Self::MissingGeneration => EditorEngineProfileErrorCode::MissingGeneration,
            Self::GenerationMismatch => EditorEngineProfileErrorCode::GenerationMismatch,
            Self::SchemaProofMismatch => EditorEngineProfileErrorCode::SchemaProofMismatch,
        }
    }
}
