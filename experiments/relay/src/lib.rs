//! Isolated reference-relay transactions: authenticated principals, exclusive writer leases,
//! durable append before acknowledgement, and exact native rich-state recovery.
//!
//! Callers authenticate accounts before supplying a principal. This crate's room authority is
//! neither a browser-selected writer ID nor a full-state import. Networking and deployment are
//! separate adapters; a [`Room`] requires exclusive mutable access across each transaction.
mod access;
mod archive_digest;
pub mod assets;
mod credentials;
mod log;
mod presence;
mod protocol;
mod room;
#[cfg(feature = "server")]
pub mod server;

pub use access::Role;
pub use log::generations::{
    ServerLogGenerationDescriptor, ServerLogGenerationOptions, ServerLogGenerationReceipt,
    ServerSealedWalPacking,
};
pub use log::{ServerLogAllowance, ServerLogRotationCapacity, ServerLogStorageCapacity};
pub use presence::PresencePeer;
pub use protocol::{Admission, DurableReceipt, Lease, Receipt, Recovery, Registration};
pub use room::AtomicTransportProfile;
pub use room::InspectedNativeGenerationTail;
pub use room::Room;
pub use room::{
    DocumentSuggestionAdmission, DocumentSuggestionDecisionAdmission, DocumentSuggestionEntry,
    DocumentSuggestionPublication, DocumentSuggestionsCursor, DocumentSuggestionsDescriptor,
    DocumentSuggestionsPage, DurableDocumentSuggestion, DurableSuggestionDecision,
    DurableSuggestionRevision, StoredSuggestionDecision, StoredSuggestionRevision,
    SuggestionDecision, SuggestionDecisionRequest, SuggestionEffect, SuggestionPermissions,
    SuggestionRevisionAdmission, SuggestionRevisionRequest, SuggestionRevisionsCursor,
    SuggestionRevisionsDescriptor, SuggestionRevisionsPage, SuggestionRole, SuggestionUpdate,
};
pub use room::{
    DocumentVersionAdmission, DocumentVersionCatalogEntry, DocumentVersionCatalogPage,
    DocumentVersionsCursor, DocumentVersionsDescriptor, DurableDocumentVersion,
};
pub use room::{
    DurableReviewReceipt, ReviewAdmission, ReviewCatchup, ReviewCursor, ReviewCursorProof,
    ReviewDescriptor, ReviewLease, ReviewOriginalAuthorizationPending,
    ReviewOriginalAuthorizationPendingReason, ReviewOriginalAuthorizationRange,
    ReviewOriginalAuthorizationRead, ReviewOriginalAuthorizationStatus,
    ReviewOriginalAuthorizationWindow, ReviewPrefixProof, ReviewRegistration, ReviewRole,
    ReviewSource, StoredReviewBatch,
};
pub use room::{
    GenerationRecoveryRegistrationCoverage, MAX_GENERATION_PARTICIPANT_INVENTORY_BYTES,
    ServerLogGenerationParticipantIdentity, ServerLogGenerationParticipantInventory,
    ServerLogGenerationParticipantMetadata, VerifiedGenerationRecoveryRegistrations,
};
pub use room::{
    MAX_ROOM_BACKUP_BYTES, RoomBackup, RoomBackupIdentity, RoomBackupInfo, RoomRecoveryPolicy,
};
pub use room::{
    MAX_ROOM_PARTICIPANT_INVENTORY_BYTES, MissingRecoveryRegistration, RecoveryAccount,
    RecoveryDocumentClock, RecoveryDocumentCredential, RecoveryDocumentRegistration,
    RecoveryRegistrationCoverage, RecoveryRegistrationCredentials, RecoveryReviewCredential,
    RecoveryReviewInventory, RecoveryReviewRegistration, RecoveryServerAuthor,
    RecoveryServerAuthorKind, RoomParticipantInventory, RoomParticipantInventoryIdentity,
    RoomParticipantInventoryMetadata, VerifiedRecoveryRegistrations,
};
pub use room::{
    MAX_SERVER_ASSET_REFERENCE_BYTES, MAX_SERVER_ASSET_REFERENCE_PAIRS,
    ServerAssetReferenceOutcome, ServerAssetReferencePending, ServerAssetReferenceSource,
    ServerLogGenerationRetainedAssetReferences, ServerRetainedAssetReferences,
};
pub use room::{
    MAX_SERVER_LOG_GENERATION_BACKUP_BYTES, ServerLogGenerationBackup,
    ServerLogGenerationBackupIdentity, ServerLogGenerationBackupInfo,
};
pub use room::{
    MAX_SERVER_LOG_GENERATION_ROOM_BACKUP_BYTES, OperationalLogGenerationServerRoom,
    RecoveredLogGenerationServerRoom, ServerLogGenerationRoomBackup,
    ServerLogGenerationRoomBackupIdentity, ServerLogGenerationRoomBackupInfo,
    ServerLogGenerationRoomRecovery, ServerLogGenerationRoomRecoveryProgress,
};
pub use room::{
    MAX_SERVER_ROOM_BACKUP_BYTES, OperationalServerRoom, RecoveredServerRoom, ServerRoomBackup,
    ServerRoomBackupIdentity, ServerRoomBackupInfo, ServerRoomRecovery, ServerRoomRecoveryProgress,
};
pub use room::{
    RecoveredLogGenerationRoom, ServerLogGenerationRecovery, ServerLogGenerationRecoveryProgress,
};
pub use room::{RelayCheckpoint, RelayCheckpointIdentity};
pub use room::{
    ServerNativeHistoryBoundary, ServerNativeHistoryDescriptor, ServerNativeHistoryFamily,
    ServerNativeHistoryLane, ServerNativeHistoryReceipt,
};
pub use room::{ServerRasterStorageCapacity, ServerRoomStorageCapacity};

/// Explicit service rejection. An I/O failure may have reached storage without an acknowledgement;
/// reopen and retry the exact group instead of assuming that the write was lost.
#[derive(Debug, thiserror::Error)]
pub enum Error {
    /// The authenticated principal lacks the required room permission.
    #[error("room permission denied")]
    Permission,
    /// Resume credential, owner, or active session fencing does not match.
    #[error("writer credential or lease rejected")]
    Lease,
    /// Resource, disk-format or semantic service contract violation.
    #[error("relay contract: {0}")]
    Contract(&'static str),
    /// A prior uncertain persistence result requires reopening the room.
    #[error("relay storage requires recovery before further use")]
    NeedsRecovery,
    /// Exclusive file ownership could not be acquired.
    #[error("room log is already locked")]
    Locked,
    /// Native rich-state admission rejected this group or journal.
    #[error(transparent)]
    Core(#[from] breditor_collab_feasibility::Error),
    /// Native review metadata rejected this source, batch, lineage or permission.
    #[error(transparent)]
    Review(#[from] breditor_collab_feasibility::review::ReviewError),
    /// Bounded serialized record is invalid.
    #[error(transparent)]
    Json(#[from] serde_json::Error),
    /// Local filesystem operation failed.
    #[error(transparent)]
    Io(#[from] std::io::Error),
    /// OS entropy is unavailable. No credential is issued.
    #[error("operating-system entropy unavailable")]
    Entropy,
}

type Result<T> = std::result::Result<T, Error>;
