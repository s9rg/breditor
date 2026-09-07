use super::{
    LocalLogStorageGenerationJsonCodecV2, LocalLogStorageGenerationManifestV2,
    LocalLogStorageGenerationV2CodecError, LocalLogStorageSelectedRootV2,
};

impl LocalLogStorageGenerationJsonCodecV2 {
    /// Strictly decodes one canonical V2 rotation from a normalized V2 selection.
    ///
    /// # Errors
    ///
    /// Returns [`LocalLogStorageGenerationV2CodecError`] for any intrinsic or
    /// selected-edge mismatch. Neither input is consumed or modified.
    pub fn decode_rotation_from_selected(
        &self,
        json: &str,
        selected: &LocalLogStorageSelectedRootV2,
    ) -> Result<LocalLogStorageGenerationManifestV2, LocalLogStorageGenerationV2CodecError> {
        self.validate_selected_binding(selected)?;
        let manifest = self.decode_bound_rotation(json)?;
        self.validate_rotation_from_selected_root(manifest.inner(), selected)?;
        Ok(manifest)
    }
}
