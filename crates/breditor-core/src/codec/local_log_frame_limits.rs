/// Default maximum generation-specific Local Log Entry payload bytes in one frame.
///
/// This matches the default JSON ceiling while remaining an independent host
/// policy. The semantic entry codec's context limit is enforced separately;
/// scanning uses the smaller of the two ceilings.
pub const DEFAULT_LOCAL_LOG_FRAME_MAX_PAYLOAD_BYTES: u64 = 16 * 1024 * 1024;

/// Host-authoritative resource policy for one Local Log Frame payload.
///
/// The declared fixed-width payload length is checked against this limit and
/// the semantic codec's JSON limit before conversion to `usize`, payload
/// slicing, or checksumming. It does not bound the caller-owned input slice or
/// bytes following the first complete frame.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct LocalLogFrameLimits {
    max_payload_bytes: u64,
}

impl LocalLogFrameLimits {
    /// Creates one explicit frame payload policy.
    #[must_use]
    pub const fn new(max_payload_bytes: u64) -> Self {
        Self { max_payload_bytes }
    }

    /// Returns the maximum declared payload size accepted by this policy.
    #[must_use]
    pub const fn max_payload_bytes(self) -> u64 {
        self.max_payload_bytes
    }

    /// Replaces the maximum declared payload size.
    #[must_use]
    pub const fn with_max_payload_bytes(mut self, maximum: u64) -> Self {
        self.max_payload_bytes = maximum;
        self
    }
}

impl Default for LocalLogFrameLimits {
    fn default() -> Self {
        Self { max_payload_bytes: DEFAULT_LOCAL_LOG_FRAME_MAX_PAYLOAD_BYTES }
    }
}

#[cfg(test)]
mod tests {
    use super::{DEFAULT_LOCAL_LOG_FRAME_MAX_PAYLOAD_BYTES, LocalLogFrameLimits};

    #[test]
    fn default_and_explicit_payload_limits_are_exact() {
        assert_eq!(
            LocalLogFrameLimits::default().max_payload_bytes(),
            DEFAULT_LOCAL_LOG_FRAME_MAX_PAYLOAD_BYTES
        );
        assert_eq!(LocalLogFrameLimits::new(0).max_payload_bytes(), 0);
        assert_eq!(LocalLogFrameLimits::new(u64::MAX).max_payload_bytes(), u64::MAX);
    }
}
