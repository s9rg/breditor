use super::{
    LocalLogStorageGenerationCodecError, LocalLogStorageGenerationJsonCodec,
    LocalLogStorageGenerationJsonFailure, LocalLogStorageGenerationManifest,
    LocalLogStorageSelectedRoot, local_log_storage_generation_json::manifest_record,
};

impl LocalLogStorageGenerationJsonCodec {
    /// Encodes one checked rotation from a normalized current storage selection.
    ///
    /// The selected value replaces the older public API's prior-manifest
    /// argument. This action rechecks the candidate's trusted profile, scope,
    /// head, session, active generation/frame, and immediately known identity
    /// freshness before replaying its embedded checkpoint and emitting exact
    /// compact V1 JSON.
    ///
    /// Success is inspection and serialization only. It performs no storage
    /// I/O, current-head comparison, compare-and-swap, durability decision,
    /// generation reservation, or writer authorization.
    ///
    /// # Errors
    ///
    /// Returns [`LocalLogStorageGenerationCodecError`] for binding, topology,
    /// selected-edge continuity, nested-checkpoint, resource, or serialization
    /// failure.
    pub fn encode_rotation_from_selected(
        &self,
        manifest: &LocalLogStorageGenerationManifest,
        selected: &LocalLogStorageSelectedRoot,
    ) -> Result<String, LocalLogStorageGenerationCodecError> {
        crate::schema::require_exact_breditor_base(self.context().schema())
            .map_err(|_| LocalLogStorageGenerationCodecError::ContextConfigurationMismatch)?;
        self.validate_rotation_from_selected_root(manifest, selected)?;
        self.validate_nested_checkpoint(manifest)?;
        self.validate_output_size(manifest)?;
        serde_json::to_string(&manifest_record(manifest))
            .map_err(|error| LocalLogStorageGenerationJsonFailure::from_serde(&error))
            .map_err(LocalLogStorageGenerationCodecError::Encoding)
    }
}
