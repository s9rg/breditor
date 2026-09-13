use super::{
    LocalLogStorageRootPublicationAttemptV3, LocalLogStorageRootPublicationTerminalV3,
    LocalLogStorageRootReadbackV3,
};

impl LocalLogStorageRootPublicationAttemptV3 {
    /// Begins observational readback without resolving the original uncertainty.
    pub fn begin_readback(self) -> LocalLogStorageRootReadbackV3 {
        LocalLogStorageRootReadbackV3 { source: self, source_terminal_kind: None, request_id: None }
    }
}

impl LocalLogStorageRootPublicationTerminalV3 {
    /// Begins readback retaining the original terminal claim as provenance only.
    pub fn begin_readback(self) -> LocalLogStorageRootReadbackV3 {
        LocalLogStorageRootReadbackV3 {
            source: self.owner,
            source_terminal_kind: Some(self.kind),
            request_id: None,
        }
    }
}
