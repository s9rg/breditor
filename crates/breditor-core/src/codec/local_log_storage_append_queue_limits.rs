/// Default maximum exact frames retained by one speculative append queue.
pub const DEFAULT_LOCAL_LOG_STORAGE_APPEND_QUEUE_MAX_PENDING_FRAMES: u64 = 1_024;

/// Default maximum aggregate encoded bytes retained by one append queue.
pub const DEFAULT_LOCAL_LOG_STORAGE_APPEND_QUEUE_MAX_PENDING_BYTES: u64 = 64 * 1024 * 1024;

/// Host-authoritative encoded-frame resource policy for one append queue.
///
/// Frame count and encoded bytes are independent limits. Both may be zero,
/// which rejects even the first append plan. Limits apply only to frames that
/// have not received a future durable acknowledgement; they neither change the
/// Frame V1 payload policy nor prove that retained bytes reached storage. They
/// do not bound total heap: the queue also retains its semantic cursor,
/// session, history, replay indexes, decoded entries, container metadata, and
/// allocation overhead under their own policies. Enqueue must encode one exact
/// candidate before applying the aggregate-byte limit, so transient peak memory
/// can also exceed `max_pending_bytes` within the separate Frame V1 policy.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct LocalLogStorageAppendQueueLimits {
    max_pending_frames: u64,
    max_pending_bytes: u64,
}

impl LocalLogStorageAppendQueueLimits {
    /// Creates one explicit pending-frame and aggregate-byte policy.
    #[must_use]
    pub const fn new(max_pending_frames: u64, max_pending_bytes: u64) -> Self {
        Self { max_pending_frames, max_pending_bytes }
    }

    /// Returns the maximum number of exact frames retained at once.
    #[must_use]
    pub const fn max_pending_frames(self) -> u64 {
        self.max_pending_frames
    }

    /// Returns the maximum aggregate encoded frame bytes retained at once.
    #[must_use]
    pub const fn max_pending_bytes(self) -> u64 {
        self.max_pending_bytes
    }

    /// Replaces the pending-frame ceiling.
    #[must_use]
    pub const fn with_max_pending_frames(mut self, maximum: u64) -> Self {
        self.max_pending_frames = maximum;
        self
    }

    /// Replaces the aggregate pending-byte ceiling.
    #[must_use]
    pub const fn with_max_pending_bytes(mut self, maximum: u64) -> Self {
        self.max_pending_bytes = maximum;
        self
    }
}

impl Default for LocalLogStorageAppendQueueLimits {
    fn default() -> Self {
        Self::new(
            DEFAULT_LOCAL_LOG_STORAGE_APPEND_QUEUE_MAX_PENDING_FRAMES,
            DEFAULT_LOCAL_LOG_STORAGE_APPEND_QUEUE_MAX_PENDING_BYTES,
        )
    }
}

#[cfg(test)]
mod tests {
    use super::{
        DEFAULT_LOCAL_LOG_STORAGE_APPEND_QUEUE_MAX_PENDING_BYTES,
        DEFAULT_LOCAL_LOG_STORAGE_APPEND_QUEUE_MAX_PENDING_FRAMES,
        LocalLogStorageAppendQueueLimits,
    };

    #[test]
    fn defaults_are_independent_and_zero_is_an_explicit_disabled_policy() {
        let defaults = LocalLogStorageAppendQueueLimits::default();
        assert_eq!(
            defaults.max_pending_frames(),
            DEFAULT_LOCAL_LOG_STORAGE_APPEND_QUEUE_MAX_PENDING_FRAMES
        );
        assert_eq!(
            defaults.max_pending_bytes(),
            DEFAULT_LOCAL_LOG_STORAGE_APPEND_QUEUE_MAX_PENDING_BYTES
        );

        let disabled = LocalLogStorageAppendQueueLimits::new(0, 0);
        assert_eq!(disabled.max_pending_frames(), 0);
        assert_eq!(disabled.max_pending_bytes(), 0);
    }
}
