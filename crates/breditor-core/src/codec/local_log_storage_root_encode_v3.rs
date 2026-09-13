use super::{
    LocalLogStorageRootJsonCodecV3, LocalLogStorageRootJsonFailure, LocalLogStorageRootSelectionV3,
    LocalLogStorageRootV3CodecError,
    local_log_storage_root_encoding_v3::LocalLogStorageRootEncodingV3,
};

impl LocalLogStorageRootJsonCodecV3 {
    /// Encodes one checked initial root as deterministic compact V3 JSON.
    ///
    /// The durable binding, trusted storage association, Frame V3 generation,
    /// and exact nested Checkpoint V3 are revalidated before serialization.
    ///
    /// # Errors
    ///
    /// Returns [`LocalLogStorageRootV3CodecError`] without changing the
    /// caller-owned selection.
    pub fn encode_root(
        &self,
        selection: &LocalLogStorageRootSelectionV3,
    ) -> Result<String, LocalLogStorageRootV3CodecError> {
        self.validate_selection(selection.inner())?;
        self.validate_nested_checkpoint(selection.inner())?;
        self.validate_output_size(selection.inner())?;
        serde_json::to_string(&LocalLogStorageRootEncodingV3::new(selection.inner()))
            .map_err(|error| LocalLogStorageRootJsonFailure::from_serde(&error))
            .map_err(LocalLogStorageRootV3CodecError::Encoding)
    }
}
