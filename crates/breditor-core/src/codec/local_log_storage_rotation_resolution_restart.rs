use super::LocalLogStorageRotationResolution;

impl LocalLogStorageRotationResolution {
    /// Starts a fresh resolver invocation around the exact retained source.
    ///
    /// This clears only volatile resolver correlation. Plan allocations,
    /// candidate bytes, and the exact prior selected envelope are preserved.
    /// Copied old dispatches may still publish later.
    #[must_use = "the restarted rotation-resolution owner retains the exact source plan"]
    pub fn restart_resolution(mut self) -> Self {
        self.request_id = None;
        self
    }
}
