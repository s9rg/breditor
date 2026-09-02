use super::{
    LocalLogStorageRootCodecError, LocalLogStorageRootJsonCodec, LocalLogStorageRootJsonFailure,
    LocalLogStorageRootSelection, local_log_storage_root_json::root_record,
};

impl LocalLogStorageRootJsonCodec {
    /// Encodes one checked initial root selection as deterministic compact V1
    /// JSON.
    ///
    /// The trusted binding and generation topology are rechecked. The embedded
    /// checkpoint is independently replayed and required to be exact canonical
    /// Checkpoint V1 output before outer serialization.
    ///
    /// # Errors
    ///
    /// Returns [`LocalLogStorageRootCodecError`] for binding, topology, context,
    /// nested-checkpoint, resource, or serialization failure.
    pub fn encode_root(
        &self,
        selection: &LocalLogStorageRootSelection,
    ) -> Result<String, LocalLogStorageRootCodecError> {
        self.validate_selection(selection)?;
        self.validate_nested_checkpoint(selection)?;
        self.validate_output_size(selection)?;
        serde_json::to_string(&root_record(selection))
            .map_err(|error| LocalLogStorageRootJsonFailure::from_serde(&error))
            .map_err(LocalLogStorageRootCodecError::Encoding)
    }
}
