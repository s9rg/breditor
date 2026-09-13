use super::LocalLogFrameTruncationStage;

/// Recoverable incomplete-tail observation from one borrowed Frame V3 scan.
///
/// This type is deliberately distinct from
/// [`super::LocalLogFrameTruncation`]. A caller cannot accidentally carry a
/// earlier-generation scanner result into a V3 tail transition.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct LocalLogFrameTruncationV3 {
    stage: LocalLogFrameTruncationStage,
    available_bytes: usize,
    required_bytes: usize,
}

impl LocalLogFrameTruncationV3 {
    pub(super) const fn new(
        stage: LocalLogFrameTruncationStage,
        available_bytes: usize,
        required_bytes: usize,
    ) -> Self {
        Self { stage, available_bytes, required_bytes }
    }

    /// Returns which fixed frame section is incomplete.
    #[must_use]
    pub const fn stage(&self) -> LocalLogFrameTruncationStage {
        self.stage
    }

    /// Returns all bytes supplied to this scan.
    #[must_use]
    pub const fn available_bytes(&self) -> usize {
        self.available_bytes
    }

    /// Returns the minimum or exact byte count needed to continue this frame.
    #[must_use]
    pub const fn required_bytes(&self) -> usize {
        self.required_bytes
    }

    /// Returns the additional bytes currently required.
    #[must_use]
    pub const fn missing_bytes(&self) -> usize {
        self.required_bytes.saturating_sub(self.available_bytes)
    }
}

/// One structurally complete, checksummed Frame V3 borrowed from an input.
///
/// Only [`super::LocalLogFrameCodecV3::scan`] constructs this value. It proves
/// V3 binary framing and both accidental-corruption checks, but its payload is
/// not yet UTF-8 or a semantic Local Log Entry V3.
#[derive(Clone, Copy)]
pub struct BorrowedLocalLogFrameV3<'a> {
    payload: &'a [u8],
    remaining: &'a [u8],
    consumed_bytes: usize,
}

impl<'a> BorrowedLocalLogFrameV3<'a> {
    pub(super) const fn new(payload: &'a [u8], remaining: &'a [u8], consumed_bytes: usize) -> Self {
        Self { payload, remaining, consumed_bytes }
    }

    /// Returns the exact checksummed payload bytes without copying them.
    #[must_use]
    pub const fn payload_bytes(&self) -> &'a [u8] {
        self.payload
    }

    /// Returns the exact prefix length occupied by this frame.
    #[must_use]
    pub const fn consumed_bytes(&self) -> usize {
        self.consumed_bytes
    }

    /// Returns trailing bytes not inspected by this one-frame scan.
    #[must_use]
    pub const fn remaining_bytes(&self) -> &'a [u8] {
        self.remaining
    }
}

impl std::fmt::Debug for BorrowedLocalLogFrameV3<'_> {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter
            .debug_struct("BorrowedLocalLogFrameV3")
            .field("payload_bytes", &self.payload.len())
            .field("consumed_bytes", &self.consumed_bytes)
            .field("remaining_bytes", &self.remaining.len())
            .finish()
    }
}

/// Result of structurally scanning at most one borrowed Frame V3.
#[non_exhaustive]
#[derive(Clone, Copy, Debug)]
pub enum LocalLogFrameScanV3<'a> {
    /// The supplied slice is empty at a clean V3 frame boundary.
    EndOfInput,
    /// A valid nonempty V3 prefix could be completed with more bytes.
    Truncated(LocalLogFrameTruncationV3),
    /// One complete checksummed V3 frame; trailing bytes remain uninspected.
    Complete(BorrowedLocalLogFrameV3<'a>),
}

impl<'a> LocalLogFrameScanV3<'a> {
    /// Returns whether the scan observed a clean empty boundary.
    #[must_use]
    pub const fn is_end_of_input(&self) -> bool {
        matches!(self, Self::EndOfInput)
    }

    /// Returns incomplete-tail details when more bytes are required.
    #[must_use]
    pub const fn truncation(&self) -> Option<&LocalLogFrameTruncationV3> {
        match self {
            Self::Truncated(truncation) => Some(truncation),
            Self::EndOfInput | Self::Complete(_) => None,
        }
    }

    /// Returns the complete borrowed V3 frame when one was published.
    #[must_use]
    pub const fn frame(&self) -> Option<&BorrowedLocalLogFrameV3<'a>> {
        match self {
            Self::Complete(frame) => Some(frame),
            Self::EndOfInput | Self::Truncated(_) => None,
        }
    }

    /// Consumes the scan result and returns the complete frame when present.
    #[must_use]
    pub const fn into_frame(self) -> Option<BorrowedLocalLogFrameV3<'a>> {
        match self {
            Self::Complete(frame) => Some(frame),
            Self::EndOfInput | Self::Truncated(_) => None,
        }
    }
}
