use super::LocalLogStorageRootResolution;

impl LocalLogStorageRootResolution {
    /// Starts a fresh resolver invocation around the exact retained source.
    ///
    /// This consumes the owner and clears only its volatile resolver-request
    /// correlation. The exact original attempt-state object, plan allocations,
    /// and candidate bytes are preserved. The next [`Self::adapter_request`]
    /// mints a distinct request identity; completion carrying the old identity
    /// is stale for the restarted owner.
    ///
    /// Restart performs no I/O, creates no storage evidence, and grants no
    /// retry, currentness, durability, writer, or successor-owner authority.
    /// A copied old dispatch can still publish later.
    #[must_use = "the restarted root-resolution owner retains the exact source plan"]
    pub fn restart_resolution(mut self) -> Self {
        self.request_id = None;
        self
    }
}
