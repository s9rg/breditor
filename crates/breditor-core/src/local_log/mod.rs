//! Runtime values for one durable, ordered, single-writer local editor log.
//!
//! This module defines identities, sequence numbers, event values, and an
//! atomic genesis recovery boundary, checkpoint-linked batch and incremental
//! successor admission, and repeated consuming compaction. Incremental typed
//! rejection returns the unchanged active owner and exact rejected entry.
//! Runtime compaction retains exact replay-ID tombstones under a cumulative
//! lifetime policy while dropping old event proofs. The codec module can
//! serialize one independently valid entry and one complete expected-binding
//! checkpoint, and can encode or scan checksummed binary frames around entry
//! bytes. Its active-tail cursor composes one frame with one semantic
//! observation while retaining atomic ownership and byte progress. Cursor
//! compaction returns the checkpoint anchor together with runtime accepted-
//! prefix metadata, while typed failure returns the complete unchanged cursor.
//! It does not append, persist, authenticate, fence, prove EOF, or crash-recover
//! a stream; storage must preserve the scopes and ordering documented here.

mod application;
mod application_error;
mod checkpoint_anchor;
mod checkpoint_binding;
mod checkpoint_compaction;
mod compaction_error;
mod compaction_failure;
mod compaction_limits;
mod continued;
mod entry;
mod event;
mod identity;
mod incremental_observation;
mod local_log_id;
mod local_session_id;
mod observation_failure;
mod observation_outcome;
mod recovered;
mod recovery;
mod recovery_error;
mod recovery_limits;
mod replay_id;
mod sequence;
mod storage_attempt_id;
mod storage_attempt_request_id;
mod storage_database_incarnation_id;
mod storage_fence_id;
mod storage_head_id;
mod storage_profile_id;
mod storage_profile_version;
mod storage_root_resolution_request_id;
mod storage_rotation_resolution_request_id;
mod storage_scope_id;
mod storage_scope_incarnation_id;
mod storage_transaction_id;
mod storage_writer_epoch;
mod storage_writer_epoch_exhausted;
mod storage_writer_epoch_parse_error;
mod storage_writer_epoch_value_error;
mod successor_recovery;
#[cfg(test)]
mod test_support;

pub use application_error::{
    LocalLogEventApplicationError, LocalLogEventApplicationErrorCode,
    LocalLogReplayTransactionErrorCode,
};
pub use checkpoint_anchor::LocalLogCheckpointAnchor;
pub(crate) use checkpoint_anchor::{
    LocalLogCheckpointAnchorCheckpointParts, LocalLogCheckpointAnchorInvariantError,
};
pub use checkpoint_binding::{LocalLogCheckpointBinding, LocalLogCheckpointBindingError};
pub use compaction_error::{LocalLogCompactionError, LocalLogCompactionErrorCode};
pub use compaction_failure::LocalLogCompactionFailure;
pub use compaction_limits::{
    DEFAULT_LOCAL_LOG_COMPACTION_MAX_REPLAY_TOMBSTONES, LocalLogCompactionLimits,
};
pub use continued::ContinuedLocalLog;
pub use entry::LocalLogEntry;
pub use event::{LocalLogEvent, LocalLogEventError, LocalLogEventErrorCode, LocalLogEventKind};
pub use identity::{
    LocalLogIdentityError, LocalLogIdentityErrorCode, MAX_LOCAL_LOG_IDENTITY_BYTES,
};
pub use local_log_id::LocalLogId;
pub use local_session_id::LocalSessionId;
pub use observation_failure::LocalLogObservationFailure;
pub use observation_outcome::LocalLogObservationOutcome;
pub use recovered::RecoveredLocalLog;
pub use recovery::LocalLogRecovery;
pub use recovery_error::{
    LocalLogRecoveryCounter, LocalLogRecoveryError, LocalLogRecoveryErrorCode,
};
pub use recovery_limits::{
    DEFAULT_LOCAL_LOG_RECOVERY_MAX_APPLIED_OPERATIONS, DEFAULT_LOCAL_LOG_RECOVERY_MAX_OBSERVATIONS,
    DEFAULT_LOCAL_LOG_RECOVERY_MAX_UNIQUE_EVENTS, LocalLogRecoveryLimits,
};
pub use replay_id::ReplayId;
pub use sequence::{LocalLogSequence, LocalLogSequenceError};
pub use storage_attempt_id::LocalLogStorageAttemptId;
pub use storage_attempt_request_id::LocalLogStorageAttemptRequestId;
pub use storage_database_incarnation_id::LocalLogStorageDatabaseIncarnationId;
pub use storage_fence_id::LocalLogStorageFenceId;
pub use storage_head_id::LocalLogStorageHeadId;
pub use storage_profile_id::LocalLogStorageProfileId;
pub use storage_profile_version::{
    LocalLogStorageProfileVersion, LocalLogStorageProfileVersionError,
    LocalLogStorageProfileVersionErrorCode,
};
pub use storage_root_resolution_request_id::LocalLogStorageRootResolutionRequestId;
pub use storage_rotation_resolution_request_id::LocalLogStorageRotationResolutionRequestId;
pub use storage_scope_id::LocalLogStorageScopeId;
pub use storage_scope_incarnation_id::LocalLogStorageScopeIncarnationId;
pub use storage_transaction_id::LocalLogStorageTransactionId;
pub use storage_writer_epoch::{
    LocalLogStorageWriterEpoch, MAX_LOCAL_LOG_STORAGE_WRITER_EPOCH_DECIMAL_BYTES,
};
pub use storage_writer_epoch_exhausted::LocalLogStorageWriterEpochExhausted;
pub use storage_writer_epoch_parse_error::LocalLogStorageWriterEpochParseError;
pub use storage_writer_epoch_value_error::LocalLogStorageWriterEpochValueError;
