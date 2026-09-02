use super::{
    LocalLogStorageGenerationCodecError, LocalLogStorageGenerationJsonCodec,
    LocalLogStorageGenerationManifest, LocalLogStorageSelectedRoot,
};

impl LocalLogStorageGenerationJsonCodec {
    /// Strictly decodes one canonical rotation from a normalized current
    /// storage selection.
    ///
    /// Strict intrinsic binding, nested-checkpoint replay, and byte-canonical
    /// validation run before the decoded candidate is checked against the
    /// selected profile, scope, head, session, active generation/frame, and
    /// immediately known identity history.
    ///
    /// Successful decode proves value and O(1) selected-edge consistency only.
    /// It performs no storage I/O, current-head attestation, compare-and-swap,
    /// durability decision, generation reservation, causal-history proof, or
    /// writer authorization.
    ///
    /// # Errors
    ///
    /// Returns [`LocalLogStorageGenerationCodecError`] for oversized or
    /// malformed input, unsupported routing, invalid fields or topology,
    /// trusted binding or selected-edge mismatch, nested checkpoint failure,
    /// or noncanonical bytes.
    pub fn decode_rotation_from_selected(
        &self,
        json: &str,
        selected: &LocalLogStorageSelectedRoot,
    ) -> Result<LocalLogStorageGenerationManifest, LocalLogStorageGenerationCodecError> {
        let manifest = self.decode_bound_rotation(json)?;
        self.validate_rotation_from_selected_root(&manifest, selected)?;
        Ok(manifest)
    }
}
