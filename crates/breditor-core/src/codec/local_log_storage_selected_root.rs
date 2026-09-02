use std::fmt;

use crate::local_log::{
    LocalLogCheckpointAnchor, LocalLogId, LocalLogStorageDatabaseIncarnationId,
    LocalLogStorageFenceId, LocalLogStorageHeadId, LocalLogStorageProfileId,
    LocalLogStorageProfileVersion, LocalLogStorageScopeId, LocalLogStorageScopeIncarnationId,
    LocalLogStorageTransactionId, LocalSessionId,
};

use super::{
    local_log_storage_generation_frame_v1::LocalLogStorageGenerationFrameV1,
    local_log_storage_selection_kind::LocalLogStorageSelectionKind,
};

/// One trusted, normalized O(1) summary of the current selected storage root.
///
/// This value privately quarantines the complete decoded checkpoint anchor and
/// deliberately has neither `Clone` nor a public constructor. Its inspection
/// getters do not return the anchor, open a writable successor, attest current
/// storage state, carry a writer capability, or authorize mutation. A caller
/// must separately revalidate storage and acquire a revocable writer token.
/// This quarantine is ownership/API hygiene, not secrecy: the public canonical
/// checkpoint JSON and binding identities can reconstruct a separate,
/// structurally checked anchor, which still carries no storage authority.
#[must_use = "a selected storage root is inspection state that must be explicitly handled"]
pub struct LocalLogStorageSelectedRoot {
    profile_id: LocalLogStorageProfileId,
    profile_version: LocalLogStorageProfileVersion,
    database_incarnation_id: LocalLogStorageDatabaseIncarnationId,
    scope_id: LocalLogStorageScopeId,
    scope_incarnation_id: LocalLogStorageScopeIncarnationId,
    selected_head_id: LocalLogStorageHeadId,
    previous_head_id: Option<LocalLogStorageHeadId>,
    selection_kind: LocalLogStorageSelectionKind,
    transaction_id: LocalLogStorageTransactionId,
    activation_fence_id: LocalLogStorageFenceId,
    session_id: LocalSessionId,
    checkpoint_log_id: LocalLogId,
    active_log_id: LocalLogId,
    active_frame: LocalLogStorageGenerationFrameV1,
    checkpoint_json: String,
    _checkpoint_anchor: LocalLogCheckpointAnchor,
}

/// Exhaustive crate-private inputs for publishing a checked selected root.
pub(crate) struct LocalLogStorageSelectedRootParts {
    pub(crate) profile_id: LocalLogStorageProfileId,
    pub(crate) profile_version: LocalLogStorageProfileVersion,
    pub(crate) database_incarnation_id: LocalLogStorageDatabaseIncarnationId,
    pub(crate) scope_id: LocalLogStorageScopeId,
    pub(crate) scope_incarnation_id: LocalLogStorageScopeIncarnationId,
    pub(crate) selected_head_id: LocalLogStorageHeadId,
    pub(crate) previous_head_id: Option<LocalLogStorageHeadId>,
    pub(crate) selection_kind: LocalLogStorageSelectionKind,
    pub(crate) transaction_id: LocalLogStorageTransactionId,
    pub(crate) activation_fence_id: LocalLogStorageFenceId,
    pub(crate) session_id: LocalSessionId,
    pub(crate) checkpoint_log_id: LocalLogId,
    pub(crate) active_log_id: LocalLogId,
    pub(crate) active_frame: LocalLogStorageGenerationFrameV1,
    pub(crate) checkpoint_json: String,
    pub(crate) checkpoint_anchor: LocalLogCheckpointAnchor,
}

impl LocalLogStorageSelectedRoot {
    /// Publishes only crate-validated normalized parts.
    pub(crate) fn from_parts(parts: LocalLogStorageSelectedRootParts) -> Self {
        Self {
            profile_id: parts.profile_id,
            profile_version: parts.profile_version,
            database_incarnation_id: parts.database_incarnation_id,
            scope_id: parts.scope_id,
            scope_incarnation_id: parts.scope_incarnation_id,
            selected_head_id: parts.selected_head_id,
            previous_head_id: parts.previous_head_id,
            selection_kind: parts.selection_kind,
            transaction_id: parts.transaction_id,
            activation_fence_id: parts.activation_fence_id,
            session_id: parts.session_id,
            checkpoint_log_id: parts.checkpoint_log_id,
            active_log_id: parts.active_log_id,
            active_frame: parts.active_frame,
            checkpoint_json: parts.checkpoint_json,
            _checkpoint_anchor: parts.checkpoint_anchor,
        }
    }

    /// Returns the selected storage-profile identity for inspection.
    #[must_use]
    pub const fn profile_id(&self) -> &LocalLogStorageProfileId {
        &self.profile_id
    }

    /// Returns the selected storage-profile contract version for inspection.
    #[must_use]
    pub const fn profile_version(&self) -> LocalLogStorageProfileVersion {
        self.profile_version
    }

    /// Returns the selected physical profile-database incarnation.
    #[must_use]
    pub const fn database_incarnation_id(&self) -> &LocalLogStorageDatabaseIncarnationId {
        &self.database_incarnation_id
    }

    /// Returns the selected logical storage scope.
    #[must_use]
    pub const fn scope_id(&self) -> &LocalLogStorageScopeId {
        &self.scope_id
    }

    /// Returns the selected lifetime incarnation of the logical scope.
    #[must_use]
    pub const fn scope_incarnation_id(&self) -> &LocalLogStorageScopeIncarnationId {
        &self.scope_incarnation_id
    }

    /// Returns the currently selected authoritative head identity.
    #[must_use]
    pub const fn selected_head_id(&self) -> &LocalLogStorageHeadId {
        &self.selected_head_id
    }

    /// Returns the known immediately preceding head, absent for a root.
    #[must_use]
    pub const fn previous_head_id(&self) -> Option<&LocalLogStorageHeadId> {
        self.previous_head_id.as_ref()
    }

    /// Returns whether the selected value is a root or ordinary rotation.
    #[must_use]
    pub const fn selection_kind(&self) -> LocalLogStorageSelectionKind {
        self.selection_kind
    }

    /// Returns the exact current transaction identity.
    #[must_use]
    pub const fn transaction_id(&self) -> &LocalLogStorageTransactionId {
        &self.transaction_id
    }

    /// Returns the immutable non-secret activation-fence correlation identity.
    ///
    /// This value is historical metadata and is not the mutable current writer
    /// fence or a writer capability.
    #[must_use]
    pub const fn activation_fence_id(&self) -> &LocalLogStorageFenceId {
        &self.activation_fence_id
    }

    /// Returns the stable local-session identity.
    #[must_use]
    pub const fn session_id(&self) -> &LocalSessionId {
        &self.session_id
    }

    /// Returns the generation represented by the selected checkpoint.
    #[must_use]
    pub const fn checkpoint_log_id(&self) -> &LocalLogId {
        &self.checkpoint_log_id
    }

    /// Returns the distinct currently active generation identity.
    #[must_use]
    pub const fn active_log_id(&self) -> &LocalLogId {
        &self.active_log_id
    }

    /// Returns the active generation's exact Frame V1 policy.
    #[must_use]
    pub const fn active_frame(&self) -> LocalLogStorageGenerationFrameV1 {
        self.active_frame
    }

    /// Returns the exact canonical embedded Local Log Checkpoint V1 JSON.
    ///
    /// The bytes are inspection and persistence data only. They do not expose
    /// the quarantined anchor or authorize opening its active successor.
    #[must_use]
    pub fn checkpoint_json(&self) -> &str {
        &self.checkpoint_json
    }

    /// Returns the UTF-8 byte length of the exact embedded checkpoint JSON.
    #[must_use]
    pub fn checkpoint_json_bytes(&self) -> usize {
        self.checkpoint_json.len()
    }
}

impl fmt::Debug for LocalLogStorageSelectedRoot {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("LocalLogStorageSelectedRoot")
            .field("profile_id", &self.profile_id)
            .field("profile_version", &self.profile_version)
            .field("database_incarnation_id", &self.database_incarnation_id)
            .field("scope_id", &self.scope_id)
            .field("scope_incarnation_id", &self.scope_incarnation_id)
            .field("selected_head_id", &self.selected_head_id)
            .field("previous_head_id", &self.previous_head_id)
            .field("selection_kind", &self.selection_kind)
            .field("transaction_id", &self.transaction_id)
            .field("activation_fence_id", &self.activation_fence_id)
            .field("session_id", &self.session_id)
            .field("checkpoint_log_id", &self.checkpoint_log_id)
            .field("active_log_id", &self.active_log_id)
            .field("active_frame", &self.active_frame)
            .field("checkpoint_json_bytes", &self.checkpoint_json.len())
            .finish_non_exhaustive()
    }
}
