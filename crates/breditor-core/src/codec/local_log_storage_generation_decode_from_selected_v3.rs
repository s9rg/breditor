use super::{
    LocalLogStorageGenerationJsonCodecV3, LocalLogStorageGenerationManifestV3,
    LocalLogStorageGenerationV3CodecError, LocalLogStorageSelectedRootV3,
};

impl LocalLogStorageGenerationJsonCodecV3 {
    /// Strictly decodes one canonical V3 rotation from a normalized V3 selection.
    ///
    /// # Errors
    ///
    /// Returns [`LocalLogStorageGenerationV3CodecError`] for any intrinsic or
    /// selected-edge mismatch. Neither input is consumed or modified.
    pub fn decode_rotation_from_selected(
        &self,
        json: &str,
        selected: &LocalLogStorageSelectedRootV3,
    ) -> Result<LocalLogStorageGenerationManifestV3, LocalLogStorageGenerationV3CodecError> {
        self.validate_selected_binding(selected)?;
        let manifest = self.decode_bound_rotation(json)?;
        self.validate_rotation_from_selected_root(manifest.inner(), selected)?;
        Ok(manifest)
    }
}
