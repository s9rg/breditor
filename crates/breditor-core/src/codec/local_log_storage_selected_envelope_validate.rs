use super::{
    LocalLogStorageSelectedEnvelopeError, LocalLogStorageSelectedRoot,
    LocalLogStorageSelectedRootValueRole, LocalLogStorageSelectionKind,
};

impl LocalLogStorageSelectedRoot {
    /// Validates one byte-exact current and optional predecessor envelope.
    ///
    /// This action compares UTF-8 bytes only. It deliberately does not parse,
    /// canonicalize, hash, or reinterpret either input. Successful validation
    /// proves equality with the values that already passed strict selected-root
    /// normalization; it does not attest that storage still selects them.
    ///
    /// # Errors
    ///
    /// Returns [`LocalLogStorageSelectedEnvelopeError`] when the predecessor
    /// shape disagrees with root-versus-rotation state or either exact value is
    /// byte-different from the retained normalized envelope. It also fails
    /// closed if private retained state violates its checked kind shape.
    pub fn validate_exact_selection_envelope(
        &self,
        current_json: &str,
        predecessor_json: Option<&str>,
    ) -> Result<(), LocalLogStorageSelectedEnvelopeError> {
        match (self.selection_kind(), predecessor_json) {
            (LocalLogStorageSelectionKind::Rotation, None) => {
                return Err(LocalLogStorageSelectedEnvelopeError::MissingPredecessor);
            }
            (LocalLogStorageSelectionKind::Root, Some(_)) => {
                return Err(LocalLogStorageSelectedEnvelopeError::UnexpectedPredecessor);
            }
            (LocalLogStorageSelectionKind::Root, None)
            | (LocalLogStorageSelectionKind::Rotation, Some(_)) => {}
        }

        if self.current_selection_json().as_bytes() != current_json.as_bytes() {
            return Err(LocalLogStorageSelectedEnvelopeError::SelectionMismatch {
                role: LocalLogStorageSelectedRootValueRole::Current,
            });
        }

        match (self.predecessor_selection_json(), predecessor_json) {
            (Some(expected), Some(actual)) if expected.as_bytes() != actual.as_bytes() => {
                return Err(LocalLogStorageSelectedEnvelopeError::SelectionMismatch {
                    role: LocalLogStorageSelectedRootValueRole::Predecessor,
                });
            }
            (None, None) | (Some(_), Some(_)) => {}
            (None, Some(_)) | (Some(_), None) => {
                return Err(LocalLogStorageSelectedEnvelopeError::RuntimeInvariant);
            }
        }

        Ok(())
    }
}
