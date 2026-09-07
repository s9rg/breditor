use super::{
    LocalLogStorageGenerationJsonCodecV2, LocalLogStorageGenerationJsonFailure,
    LocalLogStorageGenerationManifest, LocalLogStorageGenerationManifestV2,
    LocalLogStorageGenerationV2CodecError, LocalLogStorageSelectedRootV2,
    local_log_storage_generation_encoding_v2::LocalLogStorageGenerationEncodingV2,
};

impl LocalLogStorageGenerationJsonCodecV2 {
    /// Encodes one checked ordinary rotation as deterministic compact V2 JSON.
    ///
    /// # Errors
    ///
    /// Returns [`LocalLogStorageGenerationV2CodecError`] without changing
    /// either caller-owned manifest.
    pub fn encode_rotation(
        &self,
        manifest: &LocalLogStorageGenerationManifestV2,
        prior: &LocalLogStorageGenerationManifestV2,
    ) -> Result<String, LocalLogStorageGenerationV2CodecError> {
        self.validate_rotation(manifest.inner(), prior.inner())?;
        self.encode_validated(manifest.inner())
    }

    /// Encodes one checked rotation from a normalized current V2 selection.
    ///
    /// # Errors
    ///
    /// Returns [`LocalLogStorageGenerationV2CodecError`] for schema/frame,
    /// selected-edge, checkpoint, resource, or serialization failure.
    pub fn encode_rotation_from_selected(
        &self,
        manifest: &LocalLogStorageGenerationManifestV2,
        selected: &LocalLogStorageSelectedRootV2,
    ) -> Result<String, LocalLogStorageGenerationV2CodecError> {
        self.validate_rotation_from_selected_root(manifest.inner(), selected)?;
        self.encode_validated(manifest.inner())
    }

    fn encode_validated(
        &self,
        manifest: &LocalLogStorageGenerationManifest,
    ) -> Result<String, LocalLogStorageGenerationV2CodecError> {
        self.validate_nested_checkpoint(manifest)?;
        self.validate_output_size(manifest)?;
        serde_json::to_string(&LocalLogStorageGenerationEncodingV2::new(manifest))
            .map_err(|error| LocalLogStorageGenerationJsonFailure::from_serde(&error))
            .map_err(LocalLogStorageGenerationV2CodecError::Encoding)
    }
}
