use super::LocalLogStorageAppendResolution;

impl LocalLogStorageAppendResolution {
    /// Starts a fresh same-process resolver invocation around the exact source.
    ///
    /// This clears only volatile resolver-request correlation. The source
    /// attempt and optional append request IDs, complete queue, exact frame and
    /// follower allocations, token, limits, counters, and speculative cursor
    /// are preserved. Copied old append or resolver dispatches may still finish
    /// later; this is not crash recovery or cancellation.
    #[must_use = "the restarted append-resolution owner retains the exact source and queue"]
    pub fn restart_resolution(mut self) -> Self {
        self.request_id = None;
        self
    }
}
