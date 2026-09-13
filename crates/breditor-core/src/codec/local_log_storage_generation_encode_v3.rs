use super::{
    LocalLogStorageGenerationJsonCodecV3, LocalLogStorageGenerationJsonFailure,
    LocalLogStorageGenerationManifest, LocalLogStorageGenerationManifestV3,
    LocalLogStorageGenerationV3CodecError, LocalLogStorageSelectedRootV3,
    local_log_storage_generation_encoding_v3::LocalLogStorageGenerationEncodingV3,
};

impl LocalLogStorageGenerationJsonCodecV3 {
    /// Encodes one checked ordinary rotation as deterministic compact V3 JSON.
    ///
    /// # Errors
    ///
    /// Returns [`LocalLogStorageGenerationV3CodecError`] without changing
    /// either caller-owned manifest.
    pub fn encode_rotation(
        &self,
        manifest: &LocalLogStorageGenerationManifestV3,
        prior: &LocalLogStorageGenerationManifestV3,
    ) -> Result<String, LocalLogStorageGenerationV3CodecError> {
        self.validate_rotation(manifest.inner(), prior.inner())?;
        self.encode_validated(manifest.inner())
    }

    /// Encodes one checked rotation from a normalized current V3 selection.
    ///
    /// # Errors
    ///
    /// Returns [`LocalLogStorageGenerationV3CodecError`] for schema/frame,
    /// selected-edge, checkpoint, resource, or serialization failure.
    pub fn encode_rotation_from_selected(
        &self,
        manifest: &LocalLogStorageGenerationManifestV3,
        selected: &LocalLogStorageSelectedRootV3,
    ) -> Result<String, LocalLogStorageGenerationV3CodecError> {
        self.validate_rotation_from_selected_root(manifest.inner(), selected)?;
        self.encode_validated(manifest.inner())
    }

    fn encode_validated(
        &self,
        manifest: &LocalLogStorageGenerationManifest,
    ) -> Result<String, LocalLogStorageGenerationV3CodecError> {
        self.validate_nested_checkpoint(manifest)?;
        self.validate_output_size(manifest)?;
        serde_json::to_string(&LocalLogStorageGenerationEncodingV3::new(manifest))
            .map_err(|error| LocalLogStorageGenerationJsonFailure::from_serde(&error))
            .map_err(LocalLogStorageGenerationV3CodecError::Encoding)
    }
}
