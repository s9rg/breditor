use super::{
    LocalLogStorageRootJsonCodecV2, LocalLogStorageRootJsonFailure, LocalLogStorageRootSelectionV2,
    LocalLogStorageRootV2CodecError,
    local_log_storage_root_encoding_v2::LocalLogStorageRootEncodingV2,
};

impl LocalLogStorageRootJsonCodecV2 {
    /// Encodes one checked initial root as deterministic compact V2 JSON.
    ///
    /// The durable binding, trusted storage association, Frame V2 generation,
    /// and exact nested Checkpoint V2 are revalidated before serialization.
    ///
    /// # Errors
    ///
    /// Returns [`LocalLogStorageRootV2CodecError`] without changing the
    /// caller-owned selection.
    pub fn encode_root(
        &self,
        selection: &LocalLogStorageRootSelectionV2,
    ) -> Result<String, LocalLogStorageRootV2CodecError> {
        self.validate_selection(selection.inner())?;
        self.validate_nested_checkpoint(selection.inner())?;
        self.validate_output_size(selection.inner())?;
        serde_json::to_string(&LocalLogStorageRootEncodingV2::new(selection.inner()))
            .map_err(|error| LocalLogStorageRootJsonFailure::from_serde(&error))
            .map_err(LocalLogStorageRootV2CodecError::Encoding)
    }
}
