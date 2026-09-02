/// Scanner phase whose bytes ended before one complete frame was available.
#[non_exhaustive]
#[derive(Clone, Copy, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
pub enum LocalLogFrameTruncationStage {
    /// A nonempty prefix of the fixed magic needs more bytes.
    Magic,
    /// The complete magic is followed by an incomplete fixed header.
    Header,
    /// The validated header declares more payload bytes than were supplied.
    Payload,
}

impl LocalLogFrameTruncationStage {
    /// Returns the stable lower-camel-case phase name.
    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Magic => "magic",
            Self::Header => "header",
            Self::Payload => "payload",
        }
    }
}

/// Recoverable incomplete-tail observation from one borrowed scan.
///
/// For magic or header truncation, `required_bytes` is the fixed minimum needed
/// to enter the next phase. For payload truncation, it is the exact complete
/// frame length declared by a checksum-validated header.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct LocalLogFrameTruncation {
    stage: LocalLogFrameTruncationStage,
    available_bytes: usize,
    required_bytes: usize,
}

impl LocalLogFrameTruncation {
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

/// One structurally complete, checksummed frame borrowed from an input slice.
///
/// Only [`super::LocalLogFrameCodec::scan`] constructs this value. It proves
/// binary framing and both accidental-corruption checks, but its payload is not
/// yet UTF-8 or a semantic Local Log Entry V1. Use
/// [`super::LocalLogFrameCodec::decode_frame`] for that boundary.
#[derive(Clone, Copy)]
pub struct BorrowedLocalLogFrame<'a> {
    payload: &'a [u8],
    remaining: &'a [u8],
    consumed_bytes: usize,
}

impl<'a> BorrowedLocalLogFrame<'a> {
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

impl std::fmt::Debug for BorrowedLocalLogFrame<'_> {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter
            .debug_struct("BorrowedLocalLogFrame")
            .field("payload_bytes", &self.payload.len())
            .field("consumed_bytes", &self.consumed_bytes)
            .field("remaining_bytes", &self.remaining.len())
            .finish()
    }
}

/// Result of structurally scanning at most one borrowed frame.
#[non_exhaustive]
#[derive(Clone, Copy, Debug)]
pub enum LocalLogFrameScan<'a> {
    /// The supplied slice is empty at a clean frame boundary.
    EndOfInput,
    /// A valid nonempty prefix could be completed by supplying more bytes.
    Truncated(LocalLogFrameTruncation),
    /// One complete checksummed frame; trailing bytes remain uninspected.
    Complete(BorrowedLocalLogFrame<'a>),
}

impl<'a> LocalLogFrameScan<'a> {
    /// Returns whether the scan observed a clean empty boundary.
    #[must_use]
    pub const fn is_end_of_input(&self) -> bool {
        matches!(self, Self::EndOfInput)
    }

    /// Returns incomplete-tail details when more bytes are required.
    #[must_use]
    pub const fn truncation(&self) -> Option<&LocalLogFrameTruncation> {
        match self {
            Self::Truncated(truncation) => Some(truncation),
            Self::EndOfInput | Self::Complete(_) => None,
        }
    }

    /// Returns the complete borrowed frame when one was published.
    #[must_use]
    pub const fn frame(&self) -> Option<&BorrowedLocalLogFrame<'a>> {
        match self {
            Self::Complete(frame) => Some(frame),
            Self::EndOfInput | Self::Truncated(_) => None,
        }
    }

    /// Consumes the scan result and returns the complete frame when present.
    #[must_use]
    pub const fn into_frame(self) -> Option<BorrowedLocalLogFrame<'a>> {
        match self {
            Self::Complete(frame) => Some(frame),
            Self::EndOfInput | Self::Truncated(_) => None,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::{
        BorrowedLocalLogFrame, LocalLogFrameScan, LocalLogFrameTruncation,
        LocalLogFrameTruncationStage,
    };

    #[test]
    fn truncation_stage_names_and_counts_are_stable() {
        assert_eq!(LocalLogFrameTruncationStage::Magic.as_str(), "magic");
        assert_eq!(LocalLogFrameTruncationStage::Header.as_str(), "header");
        assert_eq!(LocalLogFrameTruncationStage::Payload.as_str(), "payload");

        let truncation =
            LocalLogFrameTruncation::new(LocalLogFrameTruncationStage::Payload, 31, 42);
        assert_eq!(truncation.available_bytes(), 31);
        assert_eq!(truncation.required_bytes(), 42);
        assert_eq!(truncation.missing_bytes(), 11);
    }

    #[test]
    fn borrowed_frame_debug_reports_lengths_without_payload_bytes() {
        let frame = BorrowedLocalLogFrame::new(b"private-frame-payload", b"tail", 49);
        let rendered = format!("{frame:?}");

        assert!(!rendered.contains("private-frame-payload"));
        assert!(rendered.contains("payload_bytes: 21"));
        assert!(rendered.contains("remaining_bytes: 4"));
        let scan = LocalLogFrameScan::Complete(frame);
        assert!(scan.frame().is_some());
        assert!(!scan.is_end_of_input());
    }
}
