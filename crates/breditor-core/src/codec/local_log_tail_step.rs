use std::fmt;

use crate::local_log::LocalLogObservationOutcome;

use super::{LocalLogFrameTruncation, LocalLogTailCursor};

/// Non-failing result of scanning and possibly admitting one active-tail frame.
#[non_exhaustive]
#[derive(Clone, Copy, Eq, PartialEq)]
pub enum LocalLogTailStatus {
    /// The supplied slice is empty at the exact accepted frame boundary.
    EndOfInput,
    /// The supplied bytes are one valid incomplete frame prefix.
    Truncated(LocalLogFrameTruncation),
    /// One complete frame was semantically accepted.
    Accepted {
        /// Incremental admission result, including exact duplicates.
        observation: LocalLogObservationOutcome,
        /// Inclusive generation-relative byte offset where this frame began.
        frame_start: u64,
        /// Exclusive generation-relative byte offset after this frame.
        frame_end: u64,
        /// Platform-sized frame prefix consumed from the supplied slice.
        frame_bytes: usize,
    },
}

impl LocalLogTailStatus {
    /// Returns whether the supplied slice was empty at the accepted boundary.
    #[must_use]
    pub const fn is_end_of_input(self) -> bool {
        matches!(self, Self::EndOfInput)
    }

    /// Returns valid incomplete-frame details when more bytes are required.
    #[must_use]
    pub const fn truncation(self) -> Option<LocalLogFrameTruncation> {
        match self {
            Self::Truncated(truncation) => Some(truncation),
            Self::EndOfInput | Self::Accepted { .. } => None,
        }
    }

    /// Returns the admission result for one accepted complete frame.
    #[must_use]
    pub const fn observation_outcome(self) -> Option<LocalLogObservationOutcome> {
        match self {
            Self::Accepted { observation, .. } => Some(observation),
            Self::EndOfInput | Self::Truncated(_) => None,
        }
    }

    /// Returns the accepted frame's generation-relative half-open byte range.
    #[must_use]
    pub const fn accepted_range(self) -> Option<(u64, u64)> {
        match self {
            Self::Accepted { frame_start, frame_end, .. } => Some((frame_start, frame_end)),
            Self::EndOfInput | Self::Truncated(_) => None,
        }
    }

    /// Returns the platform-sized accepted prefix length.
    #[must_use]
    pub const fn frame_bytes(self) -> Option<usize> {
        match self {
            Self::Accepted { frame_bytes, .. } => Some(frame_bytes),
            Self::EndOfInput | Self::Truncated(_) => None,
        }
    }
}

impl fmt::Debug for LocalLogTailStatus {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::EndOfInput => formatter.write_str("EndOfInput"),
            Self::Truncated(truncation) => {
                formatter.debug_tuple("Truncated").field(truncation).finish()
            }
            Self::Accepted { observation, frame_start, frame_end, frame_bytes } => formatter
                .debug_struct("Accepted")
                .field("observation", observation)
                .field("frame_start", frame_start)
                .field("frame_end", frame_end)
                .field("frame_bytes", frame_bytes)
                .finish(),
        }
    }
}

/// Complete owned cursor plus one non-failing tail observation status.
pub struct LocalLogTailStep {
    cursor: LocalLogTailCursor,
    status: LocalLogTailStatus,
}

impl LocalLogTailStep {
    pub(super) const fn new(cursor: LocalLogTailCursor, status: LocalLogTailStatus) -> Self {
        Self { cursor, status }
    }

    /// Returns the unchanged or advanced cursor published by this step.
    #[must_use]
    pub const fn cursor(&self) -> &LocalLogTailCursor {
        &self.cursor
    }

    /// Returns clean-end, truncation, or accepted-frame details.
    #[must_use]
    pub const fn status(&self) -> LocalLogTailStatus {
        self.status
    }

    /// Separates the cursor from its clean-end, truncation, or acceptance status.
    #[must_use]
    pub fn into_parts(self) -> (LocalLogTailCursor, LocalLogTailStatus) {
        (self.cursor, self.status)
    }
}

impl fmt::Debug for LocalLogTailStep {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("LocalLogTailStep")
            .field("cursor", &self.cursor)
            .field("status", &self.status)
            .finish()
    }
}
