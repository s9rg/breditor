use super::{LOCAL_LOG_FRAME_V3_FORMAT_VERSION, LocalLogFrameLimits};

/// Local Log Frame V3 policy recorded for one storage generation.
///
/// This value keeps the semantic payload ceiling statically associated with
/// Frame V3. It is inspection data only and does not prove that a generation
/// exists, is current, or contains valid frames.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct LocalLogStorageGenerationFrameV3 {
    limits: LocalLogFrameLimits,
}

impl LocalLogStorageGenerationFrameV3 {
    /// Creates one explicit Frame V3 policy.
    #[must_use]
    pub const fn new(limits: LocalLogFrameLimits) -> Self {
        Self { limits }
    }

    /// Returns the fixed JSON frame format version.
    #[must_use]
    pub const fn format_version(self) -> u32 {
        LOCAL_LOG_FRAME_V3_FORMAT_VERSION as u32
    }

    /// Returns the recorded payload policy.
    #[must_use]
    pub const fn limits(self) -> LocalLogFrameLimits {
        self.limits
    }
}

const _: () = assert!(LOCAL_LOG_FRAME_V3_FORMAT_VERSION == 3);

#[cfg(test)]
mod tests {
    use super::{LocalLogFrameLimits, LocalLogStorageGenerationFrameV3};

    #[test]
    fn frame_policy_fixes_v3_without_rejecting_zero_payloads() {
        let frame = LocalLogStorageGenerationFrameV3::new(LocalLogFrameLimits::new(0));
        assert_eq!(frame.format_version(), 3);
        assert_eq!(frame.limits().max_payload_bytes(), 0);
    }
}
