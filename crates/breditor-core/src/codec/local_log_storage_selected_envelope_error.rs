use thiserror::Error;

use super::local_log_storage_selected_root_error::LocalLogStorageSelectedRootValueRole;

/// Stable machine-readable category for an exact selected-envelope mismatch.
#[non_exhaustive]
#[derive(Clone, Copy, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
pub enum LocalLogStorageSelectedEnvelopeErrorCode {
    /// A rotation comparison omitted its immediate predecessor value.
    MissingPredecessor,
    /// A root comparison supplied a predecessor value.
    UnexpectedPredecessor,
    /// One retained canonical selection differs byte-for-byte.
    SelectionMismatch,
    /// The private normalized envelope violated its checked kind shape.
    RuntimeInvariant,
}

impl LocalLogStorageSelectedEnvelopeErrorCode {
    /// Returns the stable namespaced error code.
    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::MissingPredecessor => "local_log_storage_selected_envelope.missing_predecessor",
            Self::UnexpectedPredecessor => {
                "local_log_storage_selected_envelope.unexpected_predecessor"
            }
            Self::SelectionMismatch => "local_log_storage_selected_envelope.selection_mismatch",
            Self::RuntimeInvariant => "local_log_storage_selected_envelope.runtime_invariant",
        }
    }
}

/// Why candidate selected-envelope bytes do not equal the normalized values.
///
/// This error deliberately carries no JSON, checkpoint, document, or byte
/// preview. The role is enough to diagnose which exact value must be reread.
#[non_exhaustive]
#[derive(Clone, Copy, Debug, Eq, Error, Hash, Ord, PartialEq, PartialOrd)]
pub enum LocalLogStorageSelectedEnvelopeError {
    /// The retained selection is a rotation but no predecessor was supplied.
    #[error("an exact selected rotation envelope requires its immediate predecessor")]
    MissingPredecessor,
    /// The retained selection is a root but a predecessor was supplied.
    #[error("an exact selected root envelope must not include a predecessor")]
    UnexpectedPredecessor,
    /// One supplied canonical selection is not byte-identical to the retained value.
    #[error("the exact {role} selection bytes differ from the normalized envelope")]
    SelectionMismatch {
        /// Current or immediate-predecessor value that differs.
        role: LocalLogStorageSelectedRootValueRole,
    },
    /// Private checked state no longer agrees with its trusted selection kind.
    #[error("the normalized exact selected envelope violated a runtime invariant")]
    RuntimeInvariant,
}

impl LocalLogStorageSelectedEnvelopeError {
    /// Returns the stable machine-readable error category.
    #[must_use]
    pub const fn code(&self) -> LocalLogStorageSelectedEnvelopeErrorCode {
        match self {
            Self::MissingPredecessor => {
                LocalLogStorageSelectedEnvelopeErrorCode::MissingPredecessor
            }
            Self::UnexpectedPredecessor => {
                LocalLogStorageSelectedEnvelopeErrorCode::UnexpectedPredecessor
            }
            Self::SelectionMismatch { .. } => {
                LocalLogStorageSelectedEnvelopeErrorCode::SelectionMismatch
            }
            Self::RuntimeInvariant => LocalLogStorageSelectedEnvelopeErrorCode::RuntimeInvariant,
        }
    }
}
