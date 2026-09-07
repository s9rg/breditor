use std::fmt;

use thiserror::Error;

use super::{CodecErrorCode, LocalLogStorageSelectionKind};

/// Role of one exact selection value in selected-root normalization.
#[non_exhaustive]
#[derive(Clone, Copy, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
pub enum LocalLogStorageSelectedRootValueRole {
    /// The value selected by the current scope control.
    Current,
    /// The one exact immediate predecessor retained by a rotation.
    Predecessor,
}

impl LocalLogStorageSelectedRootValueRole {
    /// Returns the stable diagnostic role spelling.
    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Current => "current",
            Self::Predecessor => "predecessor",
        }
    }
}

impl fmt::Display for LocalLogStorageSelectedRootValueRole {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(self.as_str())
    }
}

/// Receipt assertion checked independently after strict selection decode.
#[non_exhaustive]
#[derive(Clone, Copy, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
pub enum LocalLogStorageSelectedRootReceiptField {
    /// Exact selected transaction identity.
    TransactionId,
    /// Stable local-session identity.
    SessionId,
}

impl LocalLogStorageSelectedRootReceiptField {
    /// Returns the corresponding selection field spelling.
    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::TransactionId => "transactionId",
            Self::SessionId => "sessionId",
        }
    }
}

impl fmt::Display for LocalLogStorageSelectedRootReceiptField {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(self.as_str())
    }
}

/// Logical generation assertion checked against trusted generation records.
///
/// Root and rotation wire names differ, so these categories use their common
/// normalized meaning. For example, a rotation's `sealedLogId` is its
/// checkpoint log and its `successorLogId` is its active log.
#[non_exhaustive]
#[derive(Clone, Copy, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
pub enum LocalLogStorageSelectedRootGenerationField {
    /// Generation represented by the current checkpoint.
    CheckpointLogId,
    /// Frame V1 policy retained for the checkpoint generation.
    CheckpointFrame,
    /// Currently active generation identity.
    ActiveLogId,
    /// Frame V1 policy selected for the active generation.
    ActiveFrame,
    /// Immutable fence correlation identity that activated a generation.
    ActivationFenceId,
}

impl LocalLogStorageSelectedRootGenerationField {
    /// Returns the stable normalized field spelling.
    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::CheckpointLogId => "checkpoint.logId",
            Self::CheckpointFrame => "checkpoint.frame",
            Self::ActiveLogId => "active.logId",
            Self::ActiveFrame => "active.frame",
            Self::ActivationFenceId => "activationFenceId",
        }
    }
}

impl fmt::Display for LocalLogStorageSelectedRootGenerationField {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(self.as_str())
    }
}

/// Stable machine-readable category for selected-root normalization failure.
#[non_exhaustive]
#[derive(Clone, Copy, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
pub enum LocalLogStorageSelectedRootErrorCode {
    /// Retained schema identity differs from the receiving runtime context.
    SchemaBindingMismatch,
    /// The invoked action disagrees with the independently trusted current kind.
    SelectionKindMismatch,
    /// A current or predecessor selection failed its strict format codec.
    InvalidSelection,
    /// A decoded transaction or session assertion disagrees with its receipt.
    ReceiptMismatch,
    /// A decoded log, frame, or activation fence disagrees with generation facts.
    GenerationMismatch,
    /// The current active generation reuses the predecessor's known checkpoint generation.
    KnownGenerationIdReused,
    /// The already canonical current checkpoint could not publish its anchor.
    InvalidCheckpoint,
    /// Previously checked trusted facts could not form an internal binding.
    RuntimeInvariant,
}

impl LocalLogStorageSelectedRootErrorCode {
    /// Returns the stable namespaced error code.
    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::SchemaBindingMismatch => {
                "local_log_storage_selected_root.schema_binding_mismatch"
            }
            Self::SelectionKindMismatch => {
                "local_log_storage_selected_root.selection_kind_mismatch"
            }
            Self::InvalidSelection => "local_log_storage_selected_root.invalid_selection",
            Self::ReceiptMismatch => "local_log_storage_selected_root.receipt_mismatch",
            Self::GenerationMismatch => "local_log_storage_selected_root.generation_mismatch",
            Self::KnownGenerationIdReused => {
                "local_log_storage_selected_root.known_generation_id_reused"
            }
            Self::InvalidCheckpoint => "local_log_storage_selected_root.invalid_checkpoint",
            Self::RuntimeInvariant => "local_log_storage_selected_root.runtime_invariant",
        }
    }
}

/// Why trusted receipt, generation, and exact selection facts did not
/// normalize to one selected root.
///
/// This boundary is deliberately payload-free. Nested codec errors are
/// collapsed to [`CodecErrorCode`], and no variant retains candidate JSON,
/// parser diagnostics, nested errors, or a source chain.
#[non_exhaustive]
#[derive(Clone, Copy, Debug, Eq, Error, PartialEq)]
pub enum LocalLogStorageSelectedRootError {
    /// Retained receipt and checkpoint schema identity differ.
    #[error("selected-root durable schema binding does not match its checkpoint context")]
    SchemaBindingMismatch,
    /// The caller chose the root or rotation action contrary to trusted routing.
    #[error("selected-root action expected {expected} but the trusted current receipt is {actual}")]
    SelectionKindMismatch {
        /// Selection kind accepted by the invoked action.
        expected: LocalLogStorageSelectionKind,
        /// Independently trusted current receipt kind.
        actual: LocalLogStorageSelectionKind,
    },
    /// One exact value failed its kind-specific strict codec.
    #[error("invalid {role} {selection_kind} selection ({code:?})")]
    InvalidSelection {
        /// Whether the rejected bytes were current or predecessor bytes.
        role: LocalLogStorageSelectedRootValueRole,
        /// Trusted receipt kind used to route the bytes.
        selection_kind: LocalLogStorageSelectionKind,
        /// Stable broad category retained from the nested codec.
        code: CodecErrorCode,
    },
    /// A decoded transaction or session assertion disagrees with its receipt.
    #[error("decoded {role} selection disagrees with its trusted receipt at {field}")]
    ReceiptMismatch {
        /// Whether the mismatch belongs to the current or predecessor value.
        role: LocalLogStorageSelectedRootValueRole,
        /// Receipt-backed assertion that disagreed.
        field: LocalLogStorageSelectedRootReceiptField,
    },
    /// A decoded generation assertion disagrees with trusted generation facts.
    #[error("decoded {role} selection disagrees with trusted generation facts at {field}")]
    GenerationMismatch {
        /// Whether the mismatch belongs to the current or predecessor value.
        role: LocalLogStorageSelectedRootValueRole,
        /// Logical generation assertion that disagreed.
        field: LocalLogStorageSelectedRootGenerationField,
    },
    /// The current active generation reuses the predecessor's known checkpoint generation.
    #[error("current active generation reuses predecessor checkpoint generation")]
    KnownGenerationIdReused,
    /// Reconstructing the privately quarantined anchor unexpectedly failed.
    #[error("invalid selected-root checkpoint ({code:?})")]
    InvalidCheckpoint {
        /// Stable broad category retained from the checkpoint codec.
        code: CodecErrorCode,
    },
    /// A previously validated trusted invariant could not be reconstructed.
    #[error("selected-root runtime invariant failed")]
    RuntimeInvariant,
}

impl LocalLogStorageSelectedRootError {
    /// Returns the stable machine-readable normalization category.
    #[must_use]
    pub const fn code(&self) -> LocalLogStorageSelectedRootErrorCode {
        match self {
            Self::SchemaBindingMismatch => {
                LocalLogStorageSelectedRootErrorCode::SchemaBindingMismatch
            }
            Self::SelectionKindMismatch { .. } => {
                LocalLogStorageSelectedRootErrorCode::SelectionKindMismatch
            }
            Self::InvalidSelection { .. } => LocalLogStorageSelectedRootErrorCode::InvalidSelection,
            Self::ReceiptMismatch { .. } => LocalLogStorageSelectedRootErrorCode::ReceiptMismatch,
            Self::GenerationMismatch { .. } => {
                LocalLogStorageSelectedRootErrorCode::GenerationMismatch
            }
            Self::KnownGenerationIdReused => {
                LocalLogStorageSelectedRootErrorCode::KnownGenerationIdReused
            }
            Self::InvalidCheckpoint { .. } => {
                LocalLogStorageSelectedRootErrorCode::InvalidCheckpoint
            }
            Self::RuntimeInvariant => LocalLogStorageSelectedRootErrorCode::RuntimeInvariant,
        }
    }
}
