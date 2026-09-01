use std::{error::Error, fmt};

use thiserror::Error;

use crate::local_log::LocalLogEventError;

use super::{BoundedDiagnostic, CodecErrorCode, CommitCodecError, JsonFailure};

/// Stable category for a checked local-log-entry field failure.
#[derive(Clone, Copy, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
#[non_exhaustive]
pub enum LocalLogEntryRecordErrorCode {
    /// `sessionId` is not a valid opaque local-session identity.
    InvalidSessionId,
    /// `logId` is not a valid opaque local-log identity.
    InvalidLogId,
    /// `sequence` is not a canonical, one-based local-log sequence.
    InvalidSequence,
    /// `replayId` is not a valid opaque replay identity.
    InvalidReplayId,
}

impl LocalLogEntryRecordErrorCode {
    /// Returns the stable code used across language boundaries.
    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::InvalidSessionId => "local_log_entry_record.invalid_session_id",
            Self::InvalidLogId => "local_log_entry_record.invalid_log_id",
            Self::InvalidSequence => "local_log_entry_record.invalid_sequence",
            Self::InvalidReplayId => "local_log_entry_record.invalid_replay_id",
        }
    }
}

/// Stable location within a Local Log Entry V1 record.
#[derive(Clone, Copy, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
#[non_exhaustive]
pub enum LocalLogEntryRecordLocation {
    /// Top-level `sessionId`.
    SessionId,
    /// Top-level `logId`.
    LogId,
    /// Top-level `sequence`.
    Sequence,
    /// Top-level `replayId`.
    ReplayId,
}

/// Breditor-owned details for one invalid local-log-entry field.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct LocalLogEntryRecordError {
    code: LocalLogEntryRecordErrorCode,
    location: LocalLogEntryRecordLocation,
    diagnostic: BoundedDiagnostic,
}

impl LocalLogEntryRecordError {
    /// Returns the stable reconstruction failure category.
    #[must_use]
    pub const fn code(&self) -> LocalLogEntryRecordErrorCode {
        self.code
    }

    /// Returns the stable rejected-field location.
    #[must_use]
    pub const fn location(&self) -> LocalLogEntryRecordLocation {
        self.location
    }

    /// Returns the bounded human-readable diagnostic preview.
    #[must_use]
    pub fn diagnostic(&self) -> &str {
        self.diagnostic.preview()
    }

    /// Returns the bounded diagnostic and truncation metadata.
    #[must_use]
    pub const fn diagnostic_value(&self) -> &BoundedDiagnostic {
        &self.diagnostic
    }

    pub(crate) fn new(
        code: LocalLogEntryRecordErrorCode,
        location: LocalLogEntryRecordLocation,
        diagnostic: impl Into<BoundedDiagnostic>,
    ) -> Self {
        Self { code, location, diagnostic: diagnostic.into() }
    }
}

impl fmt::Display for LocalLogEntryRecordError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(
            formatter,
            "invalid local-log-entry record at {:?}: {}",
            self.location, self.diagnostic
        )
    }
}

impl Error for LocalLogEntryRecordError {}

/// Commit-bearing event whose nested Commit V1 boundary failed.
#[derive(Clone, Copy, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
#[non_exhaustive]
pub enum LocalLogCommitEventKind {
    /// An ordinary commit event.
    Commit,
    /// An undo replay event.
    Undo,
    /// A redo replay event.
    Redo,
}

impl LocalLogCommitEventKind {
    /// Returns the stable event-kind spelling used by Local Log Entry V1.
    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Commit => "commit",
            Self::Undo => "undo",
            Self::Redo => "redo",
        }
    }
}

impl fmt::Display for LocalLogCommitEventKind {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(self.as_str())
    }
}

/// A typed failure while decoding or encoding one durable local-log entry.
#[derive(Debug, Error)]
#[non_exhaustive]
pub enum LocalLogEntryCodecError {
    /// A nested event commit was proved under another runtime context.
    #[error("local-log-entry codec context differs from its event commit context")]
    ContextConfigurationMismatch,
    /// The input exceeds the configured UTF-8 byte limit.
    #[error("local-log-entry JSON is {actual} bytes; the configured maximum is {maximum}")]
    InputTooLarge {
        /// Actual input size.
        actual: usize,
        /// Maximum accepted input size.
        maximum: usize,
    },
    /// A deterministic encoding exceeds the codec's decoding budget.
    #[error(
        "encoded local-log-entry JSON exceeds the configured maximum {maximum}; at least {minimum} bytes were observed"
    )]
    OutputTooLarge {
        /// Lower bound observed before serialization stopped, saturated at `usize::MAX`.
        minimum: usize,
        /// Maximum accepted input size for the same codec.
        maximum: usize,
    },
    /// The outer JSON syntax or strict record/event shape is invalid.
    #[error("invalid local-log-entry JSON: {0}")]
    InvalidJson(#[source] JsonFailure),
    /// The envelope does not identify Breditor's local-log-entry format.
    #[error("unsupported local-log-entry format `{found}`; expected `{expected}`")]
    UnsupportedFormat {
        /// Format found in the input.
        found: BoundedDiagnostic,
        /// Format accepted by this codec.
        expected: &'static str,
    },
    /// The envelope uses an unsupported wire version.
    #[error("unsupported local-log-entry format version {found}; this codec supports {supported}")]
    UnsupportedFormatVersion {
        /// Version found in the input.
        found: u32,
        /// Version accepted by this codec.
        supported: u32,
    },
    /// One identity or sequence field failed checked reconstruction.
    #[error(transparent)]
    InvalidRecord(#[from] LocalLogEntryRecordError),
    /// A commit-bearing event failed the authoritative Commit V1 boundary.
    #[error("invalid {event_kind} event commit: {source}")]
    InvalidCommit {
        /// Event kind that owned the nested commit.
        event_kind: LocalLogCommitEventKind,
        /// Complete nested commit codec failure.
        #[source]
        source: CommitCodecError,
    },
    /// A proved nested commit violates its tagged undo or redo event contract.
    #[error("invalid local-log replay event commit: {0}")]
    InvalidEventCommit(#[source] LocalLogEventError),
    /// A private runtime event disagrees with its invariant-bearing discriminator.
    #[error("local-log-entry runtime invariant failed: {diagnostic}")]
    RuntimeInvariant {
        /// Bounded diagnostic that retains no commit or editor state.
        diagnostic: BoundedDiagnostic,
    },
    /// Serialization of a checked local-log entry failed.
    #[error("could not encode local-log-entry JSON: {0}")]
    Encoding(#[source] JsonFailure),
}

impl LocalLogEntryCodecError {
    /// Returns the stable machine-readable failure category.
    #[must_use]
    pub const fn code(&self) -> CodecErrorCode {
        match self {
            Self::ContextConfigurationMismatch => CodecErrorCode::ContextMismatch,
            Self::InputTooLarge { .. } => CodecErrorCode::InputTooLarge,
            Self::OutputTooLarge { .. } => CodecErrorCode::OutputTooLarge,
            Self::InvalidJson(_) => CodecErrorCode::InvalidJson,
            Self::UnsupportedFormat { .. } => CodecErrorCode::UnsupportedFormat,
            Self::UnsupportedFormatVersion { .. } => CodecErrorCode::UnsupportedFormatVersion,
            Self::InvalidRecord(_)
            | Self::InvalidCommit { .. }
            | Self::InvalidEventCommit(_)
            | Self::RuntimeInvariant { .. } => CodecErrorCode::InvalidLocalLogEntry,
            Self::Encoding(_) => CodecErrorCode::EncodingFailed,
        }
    }
}
