use super::{LOCAL_LOG_FRAME_FORMAT_VERSION, LocalLogFrameLimits};

/// Local Log Frame V1 policy recorded for one storage generation.
///
/// The value identifies a semantic payload ceiling, not a physical file-size
/// claim. Future frame versions require a new manifest contract rather than a
/// reinterpretation of this value.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct LocalLogStorageGenerationFrameV1 {
    limits: LocalLogFrameLimits,
}

impl LocalLogStorageGenerationFrameV1 {
    /// Creates one explicit Frame V1 policy.
    #[must_use]
    pub const fn new(limits: LocalLogFrameLimits) -> Self {
        Self { limits }
    }

    /// Returns the fixed JSON frame format version.
    #[must_use]
    pub const fn format_version(self) -> u32 {
        1
    }

    /// Returns the recorded payload policy.
    #[must_use]
    pub const fn limits(self) -> LocalLogFrameLimits {
        self.limits
    }
}

// The JSON value deliberately uses the protocol's u32 integer convention,
// while the fixed binary header carries the same version in a u16.
const _: () = assert!(LOCAL_LOG_FRAME_FORMAT_VERSION as u32 == 1);

#[cfg(test)]
mod tests {
    use super::{LocalLogFrameLimits, LocalLogStorageGenerationFrameV1};

    #[test]
    fn frame_policy_fixes_v1_without_rejecting_zero_payloads() {
        let frame = LocalLogStorageGenerationFrameV1::new(LocalLogFrameLimits::new(0));
        assert_eq!(frame.format_version(), 1);
        assert_eq!(frame.limits().max_payload_bytes(), 0);
    }
}
