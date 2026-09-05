use std::{error::Error, fmt};

use crate::codec::CodecErrorCode;

use super::{EditorEngineError, EditorEngineErrorCode};

/// Stable top-level category for a [`super::CheckpointedEditorEngine`] failure.
#[derive(Clone, Copy, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
#[non_exhaustive]
pub enum CheckpointedEditorEngineErrorCode {
    /// The guarded editor command itself was rejected.
    EditorEngine,
    /// The command's candidate session could not cross the configured durable boundary.
    SessionCheckpointRepresentation,
}

impl CheckpointedEditorEngineErrorCode {
    /// Returns the stable namespaced error category.
    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::EditorEngine => "checkpointed_editor_engine.editor_engine",
            Self::SessionCheckpointRepresentation => {
                "checkpointed_editor_engine.session_checkpoint_representation"
            }
        }
    }
}

/// Why a checkpoint-constrained engine construction or command was rejected.
///
/// A session-checkpoint failure retains only its stable codec category, never
/// the candidate session, encoded JSON, document content, or source diagnostic.
/// An editor-engine failure keeps the existing typed error whose custom
/// [`fmt::Debug`] implementation already redacts guarded payloads.
#[derive(Clone, Eq, PartialEq)]
#[non_exhaustive]
pub enum CheckpointedEditorEngineError {
    /// The underlying guarded engine rejected the command before publication.
    EditorEngine(EditorEngineError),
    /// The candidate session was valid in memory but not representable under the checkpoint policy.
    SessionCheckpointRepresentation {
        /// Stable category from the rejected session-checkpoint encoding.
        codec_code: CodecErrorCode,
    },
}

impl CheckpointedEditorEngineError {
    /// Returns the stable top-level failure category.
    #[must_use]
    pub const fn code(&self) -> CheckpointedEditorEngineErrorCode {
        match self {
            Self::EditorEngine(_) => CheckpointedEditorEngineErrorCode::EditorEngine,
            Self::SessionCheckpointRepresentation { .. } => {
                CheckpointedEditorEngineErrorCode::SessionCheckpointRepresentation
            }
        }
    }

    /// Returns the underlying guarded-engine category, when that layer rejected the command.
    #[must_use]
    pub const fn editor_engine_code(&self) -> Option<EditorEngineErrorCode> {
        match self {
            Self::EditorEngine(error) => Some(error.code()),
            Self::SessionCheckpointRepresentation { .. } => None,
        }
    }

    /// Returns the complete existing guarded-engine error, when present.
    ///
    /// This borrowed access preserves finite typed subcategories such as the
    /// built-in action-input rejection codes without cloning or widening the
    /// checkpoint wrapper's representation-error surface.
    #[must_use]
    pub const fn editor_engine_error(&self) -> Option<&EditorEngineError> {
        match self {
            Self::EditorEngine(error) => Some(error),
            Self::SessionCheckpointRepresentation { .. } => None,
        }
    }

    /// Returns the underlying checkpoint codec category, when representation failed.
    #[must_use]
    pub const fn checkpoint_codec_code(&self) -> Option<CodecErrorCode> {
        match self {
            Self::SessionCheckpointRepresentation { codec_code } => Some(*codec_code),
            Self::EditorEngine(_) => None,
        }
    }

    pub(super) const fn checkpoint(codec_code: CodecErrorCode) -> Self {
        Self::SessionCheckpointRepresentation { codec_code }
    }
}

impl From<EditorEngineError> for CheckpointedEditorEngineError {
    fn from(error: EditorEngineError) -> Self {
        Self::EditorEngine(error)
    }
}

impl fmt::Debug for CheckpointedEditorEngineError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        let mut value = formatter.debug_struct("CheckpointedEditorEngineError");
        value.field("code", &self.code());
        if let Some(code) = self.editor_engine_code() {
            value.field("editor_engine_code", &code);
        }
        if let Some(code) = self.checkpoint_codec_code() {
            value.field("checkpoint_codec_code", &code);
        }
        value.finish_non_exhaustive()
    }
}

impl fmt::Display for CheckpointedEditorEngineError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::EditorEngine(_) => formatter.write_str("the guarded editor command was rejected"),
            Self::SessionCheckpointRepresentation { codec_code } => write!(
                formatter,
                "the candidate session checkpoint was not representable ({})",
                codec_code.as_str()
            ),
        }
    }
}

impl Error for CheckpointedEditorEngineError {}

#[cfg(test)]
mod tests {
    use crate::{
        codec::CodecErrorCode,
        engine::{CheckpointedEditorEngineError, CheckpointedEditorEngineErrorCode},
    };

    #[test]
    fn representation_error_is_stable_and_payload_free() {
        let error = CheckpointedEditorEngineError::checkpoint(CodecErrorCode::OutputTooLarge);

        assert_eq!(
            error.code(),
            CheckpointedEditorEngineErrorCode::SessionCheckpointRepresentation
        );
        assert_eq!(
            error.code().as_str(),
            "checkpointed_editor_engine.session_checkpoint_representation"
        );
        assert_eq!(error.editor_engine_code(), None);
        assert_eq!(error.editor_engine_error(), None);
        assert_eq!(error.checkpoint_codec_code(), Some(CodecErrorCode::OutputTooLarge));
        assert_eq!(
            format!("{error:?}"),
            "CheckpointedEditorEngineError { code: SessionCheckpointRepresentation, checkpoint_codec_code: OutputTooLarge, .. }"
        );
    }
}
