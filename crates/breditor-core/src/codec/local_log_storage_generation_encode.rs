use super::{
    LocalLogStorageGenerationCodecError, LocalLogStorageGenerationJsonCodec,
    LocalLogStorageGenerationJsonFailure, LocalLogStorageGenerationManifest,
    local_log_storage_generation_json::manifest_record,
};

impl LocalLogStorageGenerationJsonCodec {
    /// Encodes one checked ordinary rotation as deterministic compact V1 JSON.
    ///
    /// The supplied prior manifest is rechecked for rotation continuity. The
    /// embedded checkpoint is independently replayed and required to be exact
    /// canonical Checkpoint V1 output before outer serialization.
    ///
    /// # Errors
    ///
    /// Returns [`LocalLogStorageGenerationCodecError`] for binding, topology,
    /// continuity, context, nested-checkpoint, resource, or serialization
    /// failure.
    pub fn encode_rotation(
        &self,
        manifest: &LocalLogStorageGenerationManifest,
        prior: &LocalLogStorageGenerationManifest,
    ) -> Result<String, LocalLogStorageGenerationCodecError> {
        self.validate_rotation(manifest, prior)?;
        self.validate_nested_checkpoint(manifest)?;
        self.validate_output_size(manifest)?;
        serde_json::to_string(&manifest_record(manifest))
            .map_err(|error| LocalLogStorageGenerationJsonFailure::from_serde(&error))
            .map_err(LocalLogStorageGenerationCodecError::Encoding)
    }
}
