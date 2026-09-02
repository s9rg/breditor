use std::{error::Error, fmt};

use super::{
    CodecErrorCode, LocalLogStorageSelectedBindingErrorCode, LocalLogStorageSelectedRootErrorCode,
    LocalLogStorageSelectionKind, LocalLogStorageSelectionReceiptBindingErrorCode,
};

/// Stable category for failure to close one exact storage-attempt plan.
#[non_exhaustive]
#[derive(Clone, Copy, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
pub enum LocalLogStorageAttemptPreparationErrorCode {
    /// The checked candidate failed strict canonical revalidation.
    InvalidCandidate,
    /// Candidate facts could not form one complete trusted receipt binding.
    InvalidCandidateReceipt,
    /// Candidate receipt and generation facts did not form one selected binding.
    InvalidCandidateBinding,
    /// Final strict normalization rejected the complete candidate envelope.
    InvalidCandidateEnvelope,
    /// A private checked plan-shape invariant failed after validation.
    RuntimeInvariant,
}

impl LocalLogStorageAttemptPreparationErrorCode {
    /// Returns the stable namespaced error code.
    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::InvalidCandidate => "local_log_storage_attempt_preparation.invalid_candidate",
            Self::InvalidCandidateReceipt => {
                "local_log_storage_attempt_preparation.invalid_candidate_receipt"
            }
            Self::InvalidCandidateBinding => {
                "local_log_storage_attempt_preparation.invalid_candidate_binding"
            }
            Self::InvalidCandidateEnvelope => {
                "local_log_storage_attempt_preparation.invalid_candidate_envelope"
            }
            Self::RuntimeInvariant => "local_log_storage_attempt_preparation.runtime_invariant",
        }
    }
}

/// Payload-free failure to prepare one immutable exact storage-attempt plan.
///
/// The source codec error is deliberately projected to its stable broad code.
/// This boundary never retains candidate, checkpoint, current-selection, or
/// predecessor-selection bytes.
#[non_exhaustive]
#[derive(Clone, Copy, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
pub enum LocalLogStorageAttemptPreparationError {
    /// Strict canonical revalidation of the candidate failed.
    InvalidCandidate {
        /// Root or rotation candidate shape.
        kind: LocalLogStorageSelectionKind,
        /// Stable broad source-codec category.
        code: CodecErrorCode,
    },
    /// Validated candidate facts failed checked receipt construction.
    InvalidCandidateReceipt {
        /// Root or rotation candidate shape.
        kind: LocalLogStorageSelectionKind,
        /// Stable checked receipt-shape category.
        code: LocalLogStorageSelectionReceiptBindingErrorCode,
    },
    /// Candidate receipts and generations failed complete selected binding.
    InvalidCandidateBinding {
        /// Root or rotation candidate shape.
        kind: LocalLogStorageSelectionKind,
        /// Stable selected-binding category.
        code: LocalLogStorageSelectedBindingErrorCode,
    },
    /// Final normalization rejected the exact candidate and complete binding.
    InvalidCandidateEnvelope {
        /// Root or rotation candidate shape.
        kind: LocalLogStorageSelectionKind,
        /// Stable selected-envelope category.
        code: LocalLogStorageSelectedRootErrorCode,
    },
    /// A private plan-shape invariant failed after strict validation.
    RuntimeInvariant {
        /// Root or rotation plan shape being closed.
        kind: LocalLogStorageSelectionKind,
    },
}

impl LocalLogStorageAttemptPreparationError {
    /// Returns the stable top-level preparation category.
    #[must_use]
    pub const fn code(&self) -> LocalLogStorageAttemptPreparationErrorCode {
        match self {
            Self::InvalidCandidate { .. } => {
                LocalLogStorageAttemptPreparationErrorCode::InvalidCandidate
            }
            Self::InvalidCandidateReceipt { .. } => {
                LocalLogStorageAttemptPreparationErrorCode::InvalidCandidateReceipt
            }
            Self::InvalidCandidateBinding { .. } => {
                LocalLogStorageAttemptPreparationErrorCode::InvalidCandidateBinding
            }
            Self::InvalidCandidateEnvelope { .. } => {
                LocalLogStorageAttemptPreparationErrorCode::InvalidCandidateEnvelope
            }
            Self::RuntimeInvariant { .. } => {
                LocalLogStorageAttemptPreparationErrorCode::RuntimeInvariant
            }
        }
    }

    /// Returns the root-or-rotation candidate shape.
    #[must_use]
    pub const fn selection_kind(&self) -> LocalLogStorageSelectionKind {
        match self {
            Self::InvalidCandidate { kind, .. }
            | Self::InvalidCandidateReceipt { kind, .. }
            | Self::InvalidCandidateBinding { kind, .. }
            | Self::InvalidCandidateEnvelope { kind, .. }
            | Self::RuntimeInvariant { kind } => *kind,
        }
    }

    /// Returns the nested broad codec category when candidate validation failed.
    #[must_use]
    pub const fn codec_code(&self) -> Option<CodecErrorCode> {
        match self {
            Self::InvalidCandidate { code, .. } => Some(*code),
            Self::InvalidCandidateReceipt { .. }
            | Self::InvalidCandidateBinding { .. }
            | Self::InvalidCandidateEnvelope { .. }
            | Self::RuntimeInvariant { .. } => None,
        }
    }

    /// Returns the nested receipt-shape category when receipt construction failed.
    #[must_use]
    pub const fn receipt_code(&self) -> Option<LocalLogStorageSelectionReceiptBindingErrorCode> {
        match self {
            Self::InvalidCandidateReceipt { code, .. } => Some(*code),
            Self::InvalidCandidate { .. }
            | Self::InvalidCandidateBinding { .. }
            | Self::InvalidCandidateEnvelope { .. }
            | Self::RuntimeInvariant { .. } => None,
        }
    }

    /// Returns the nested selected-binding category when binding closure failed.
    #[must_use]
    pub const fn binding_code(&self) -> Option<LocalLogStorageSelectedBindingErrorCode> {
        match self {
            Self::InvalidCandidateBinding { code, .. } => Some(*code),
            Self::InvalidCandidate { .. }
            | Self::InvalidCandidateReceipt { .. }
            | Self::InvalidCandidateEnvelope { .. }
            | Self::RuntimeInvariant { .. } => None,
        }
    }

    /// Returns the nested selected-envelope category when normalization failed.
    #[must_use]
    pub const fn envelope_code(&self) -> Option<LocalLogStorageSelectedRootErrorCode> {
        match self {
            Self::InvalidCandidateEnvelope { code, .. } => Some(*code),
            Self::InvalidCandidate { .. }
            | Self::InvalidCandidateReceipt { .. }
            | Self::InvalidCandidateBinding { .. }
            | Self::RuntimeInvariant { .. } => None,
        }
    }
}

impl fmt::Display for LocalLogStorageAttemptPreparationError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::InvalidCandidate { kind, code } => {
                write!(formatter, "invalid {kind} storage-attempt candidate ({code:?})")
            }
            Self::InvalidCandidateReceipt { kind, code } => {
                write!(formatter, "invalid {kind} storage-attempt receipt ({code:?})")
            }
            Self::InvalidCandidateBinding { kind, code } => {
                write!(formatter, "invalid {kind} storage-attempt binding ({code:?})")
            }
            Self::InvalidCandidateEnvelope { kind, code } => {
                write!(formatter, "invalid {kind} storage-attempt envelope ({code:?})")
            }
            Self::RuntimeInvariant { kind } => {
                write!(formatter, "{kind} storage-attempt plan invariant failed")
            }
        }
    }
}

impl Error for LocalLogStorageAttemptPreparationError {}

#[cfg(test)]
mod tests {
    use std::error::Error as _;

    use super::{
        CodecErrorCode, LocalLogStorageAttemptPreparationError,
        LocalLogStorageAttemptPreparationErrorCode, LocalLogStorageSelectedBindingErrorCode,
        LocalLogStorageSelectedRootErrorCode, LocalLogStorageSelectionKind,
        LocalLogStorageSelectionReceiptBindingErrorCode,
    };

    #[test]
    fn codes_and_nested_projections_are_stable_and_payload_free() {
        let candidate = LocalLogStorageAttemptPreparationError::InvalidCandidate {
            kind: LocalLogStorageSelectionKind::Root,
            code: CodecErrorCode::InvalidLocalLogStorageRoot,
        };
        assert_eq!(candidate.code(), LocalLogStorageAttemptPreparationErrorCode::InvalidCandidate);
        assert_eq!(candidate.selection_kind(), LocalLogStorageSelectionKind::Root);
        assert_eq!(candidate.codec_code(), Some(CodecErrorCode::InvalidLocalLogStorageRoot));
        assert_eq!(candidate.receipt_code(), None);
        assert_eq!(candidate.binding_code(), None);
        assert_eq!(candidate.envelope_code(), None);
        assert!(candidate.source().is_none());
        assert_eq!(
            candidate.code().as_str(),
            "local_log_storage_attempt_preparation.invalid_candidate"
        );

        let receipt = LocalLogStorageAttemptPreparationError::InvalidCandidateReceipt {
            kind: LocalLogStorageSelectionKind::Rotation,
            code: LocalLogStorageSelectionReceiptBindingErrorCode::HeadNotAdvanced,
        };
        assert_eq!(
            receipt.code(),
            LocalLogStorageAttemptPreparationErrorCode::InvalidCandidateReceipt
        );
        assert_eq!(receipt.codec_code(), None);
        assert_eq!(
            receipt.receipt_code(),
            Some(LocalLogStorageSelectionReceiptBindingErrorCode::HeadNotAdvanced)
        );
        assert_eq!(receipt.binding_code(), None);
        assert_eq!(receipt.envelope_code(), None);
        assert_eq!(
            receipt.code().as_str(),
            "local_log_storage_attempt_preparation.invalid_candidate_receipt"
        );

        let binding = LocalLogStorageAttemptPreparationError::InvalidCandidateBinding {
            kind: LocalLogStorageSelectionKind::Root,
            code: LocalLogStorageSelectedBindingErrorCode::GenerationNotAdvanced,
        };
        assert_eq!(
            binding.code(),
            LocalLogStorageAttemptPreparationErrorCode::InvalidCandidateBinding
        );
        assert_eq!(binding.codec_code(), None);
        assert_eq!(binding.receipt_code(), None);
        assert_eq!(
            binding.binding_code(),
            Some(LocalLogStorageSelectedBindingErrorCode::GenerationNotAdvanced)
        );
        assert_eq!(binding.envelope_code(), None);
        assert_eq!(
            binding.code().as_str(),
            "local_log_storage_attempt_preparation.invalid_candidate_binding"
        );

        let envelope = LocalLogStorageAttemptPreparationError::InvalidCandidateEnvelope {
            kind: LocalLogStorageSelectionKind::Rotation,
            code: LocalLogStorageSelectedRootErrorCode::InvalidSelection,
        };
        assert_eq!(
            envelope.code(),
            LocalLogStorageAttemptPreparationErrorCode::InvalidCandidateEnvelope
        );
        assert_eq!(envelope.codec_code(), None);
        assert_eq!(envelope.receipt_code(), None);
        assert_eq!(envelope.binding_code(), None);
        assert_eq!(
            envelope.envelope_code(),
            Some(LocalLogStorageSelectedRootErrorCode::InvalidSelection)
        );
        assert_eq!(
            envelope.code().as_str(),
            "local_log_storage_attempt_preparation.invalid_candidate_envelope"
        );

        let runtime = LocalLogStorageAttemptPreparationError::RuntimeInvariant {
            kind: LocalLogStorageSelectionKind::Rotation,
        };
        assert_eq!(runtime.code(), LocalLogStorageAttemptPreparationErrorCode::RuntimeInvariant);
        assert_eq!(runtime.codec_code(), None);
        assert_eq!(runtime.receipt_code(), None);
        assert_eq!(runtime.binding_code(), None);
        assert_eq!(runtime.envelope_code(), None);
        assert_eq!(
            runtime.code().as_str(),
            "local_log_storage_attempt_preparation.runtime_invariant"
        );

        for error in [candidate, receipt, binding, envelope, runtime] {
            assert!(!format!("{error:?}").contains("PAYLOADSENTINEL"));
            assert!(!error.to_string().contains("PAYLOADSENTINEL"));
            assert!(error.source().is_none());
        }
    }
}
