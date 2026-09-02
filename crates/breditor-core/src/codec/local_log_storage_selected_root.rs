use std::{fmt, sync::Arc};

use crate::local_log::{
    LocalLogCheckpointAnchor, LocalLogId, LocalLogStorageDatabaseIncarnationId,
    LocalLogStorageFenceId, LocalLogStorageHeadId, LocalLogStorageProfileId,
    LocalLogStorageProfileVersion, LocalLogStorageScopeId, LocalLogStorageScopeIncarnationId,
    LocalLogStorageTransactionId, LocalSessionId,
};

use super::{
    local_log_storage_generation_frame_v1::LocalLogStorageGenerationFrameV1,
    local_log_storage_selected_binding::LocalLogStorageSelectedBinding,
    local_log_storage_selected_root_error::LocalLogStorageSelectedRootError,
    local_log_storage_selection_kind::LocalLogStorageSelectionKind,
    local_log_storage_selection_receipt_binding::LocalLogStorageSelectionReceiptBinding,
};

/// One trusted, normalized exact envelope for the current selected storage root.
///
/// The value retains the complete independently trusted selected binding, the
/// byte-exact canonical current selection, the byte-exact immediate predecessor
/// for a rotation, and the complete decoded checkpoint anchor. Its retained
/// rotation history is O(1), but the exact current and predecessor values may
/// each contain a full checkpoint payload and therefore are not constant-size.
///
/// This type deliberately has neither `Clone` nor a public constructor. Its
/// inspection getters do not return the anchor, open a writable successor,
/// attest current storage state, carry a writer capability, or authorize
/// mutation. A caller must separately revalidate storage and acquire a
/// revocable writer token. The quarantine is ownership/API hygiene, not
/// secrecy: canonical checkpoint bytes and binding identities remain ordinary
/// inspection data and carry no storage authority.
#[must_use = "a selected storage root is inspection state that must be explicitly handled"]
pub struct LocalLogStorageSelectedRoot {
    binding: LocalLogStorageSelectedBinding,
    checkpoint_json: String,
    current_selection_json: Arc<str>,
    predecessor_selection_json: Option<Arc<str>>,
    _checkpoint_anchor: LocalLogCheckpointAnchor,
}

/// Exhaustive crate-private inputs for publishing a checked selected root.
pub(super) struct LocalLogStorageSelectedRootParts {
    pub(super) binding: LocalLogStorageSelectedBinding,
    pub(super) checkpoint_json: String,
    pub(super) current_selection_json: String,
    pub(super) predecessor_selection_json: Option<String>,
    pub(super) checkpoint_anchor: LocalLogCheckpointAnchor,
}

impl LocalLogStorageSelectedRoot {
    /// Publishes only crate-validated, kind-consistent normalized parts.
    pub(super) fn try_from_parts(
        parts: LocalLogStorageSelectedRootParts,
    ) -> Result<Self, LocalLogStorageSelectedRootError> {
        let requires_predecessor = parts.binding.current_receipt().selection_kind()
            == LocalLogStorageSelectionKind::Rotation;
        if requires_predecessor != parts.binding.predecessor_receipt().is_some()
            || requires_predecessor != parts.predecessor_selection_json.is_some()
        {
            return Err(LocalLogStorageSelectedRootError::RuntimeInvariant);
        }

        Ok(Self {
            binding: parts.binding,
            checkpoint_json: parts.checkpoint_json,
            current_selection_json: Arc::from(parts.current_selection_json),
            predecessor_selection_json: parts.predecessor_selection_json.map(Arc::from),
            _checkpoint_anchor: parts.checkpoint_anchor,
        })
    }

    /// Returns the selected storage-profile identity for inspection.
    #[must_use]
    pub const fn profile_id(&self) -> &LocalLogStorageProfileId {
        self.binding.current_receipt().profile_id()
    }

    /// Returns the selected storage-profile contract version for inspection.
    #[must_use]
    pub const fn profile_version(&self) -> LocalLogStorageProfileVersion {
        self.binding.current_receipt().profile_version()
    }

    /// Returns the selected physical profile-database incarnation.
    #[must_use]
    pub const fn database_incarnation_id(&self) -> &LocalLogStorageDatabaseIncarnationId {
        self.binding.current_receipt().database_incarnation_id()
    }

    /// Returns the selected logical storage scope.
    #[must_use]
    pub const fn scope_id(&self) -> &LocalLogStorageScopeId {
        self.binding.current_receipt().scope_id()
    }

    /// Returns the selected lifetime incarnation of the logical scope.
    #[must_use]
    pub const fn scope_incarnation_id(&self) -> &LocalLogStorageScopeIncarnationId {
        self.binding.current_receipt().scope_incarnation_id()
    }

    /// Returns the currently selected authoritative head identity.
    #[must_use]
    pub const fn selected_head_id(&self) -> &LocalLogStorageHeadId {
        self.binding.current_receipt().committed_head_id()
    }

    /// Returns the known immediately preceding head, absent for a root.
    #[must_use]
    pub const fn previous_head_id(&self) -> Option<&LocalLogStorageHeadId> {
        self.binding.current_receipt().expected_head_id()
    }

    /// Returns whether the selected value is a root or ordinary rotation.
    #[must_use]
    pub const fn selection_kind(&self) -> LocalLogStorageSelectionKind {
        self.binding.current_receipt().selection_kind()
    }

    /// Returns the exact current transaction identity.
    #[must_use]
    pub const fn transaction_id(&self) -> &LocalLogStorageTransactionId {
        self.binding.current_receipt().transaction_id()
    }

    /// Returns the immutable non-secret activation-fence correlation identity.
    ///
    /// This value is historical metadata and is not the mutable current writer
    /// fence or a writer capability.
    #[must_use]
    pub const fn activation_fence_id(&self) -> &LocalLogStorageFenceId {
        self.binding.active_generation().activated_fence_id()
    }

    /// Returns the stable local-session identity.
    #[must_use]
    pub const fn session_id(&self) -> &LocalSessionId {
        self.binding.current_receipt().session_id()
    }

    /// Returns the generation represented by the selected checkpoint.
    #[must_use]
    pub const fn checkpoint_log_id(&self) -> &LocalLogId {
        self.binding.checkpoint_generation().log_id()
    }

    /// Returns the distinct currently active generation identity.
    #[must_use]
    pub const fn active_log_id(&self) -> &LocalLogId {
        self.binding.active_generation().log_id()
    }

    /// Returns the active generation's exact Frame V1 policy.
    #[must_use]
    pub const fn active_frame(&self) -> LocalLogStorageGenerationFrameV1 {
        self.binding.active_generation().frame()
    }

    /// Returns the complete trusted current receipt for inspection.
    #[must_use]
    pub const fn current_receipt(&self) -> &LocalLogStorageSelectionReceiptBinding {
        self.binding.current_receipt()
    }

    /// Returns the trusted immediate-predecessor receipt for a rotation.
    #[must_use]
    pub const fn predecessor_receipt(&self) -> Option<&LocalLogStorageSelectionReceiptBinding> {
        self.binding.predecessor_receipt()
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

    /// Returns the UTF-8 byte length of the exact canonical current selection.
    #[must_use]
    pub fn current_selection_json_bytes(&self) -> usize {
        self.current_selection_json.len()
    }

    /// Returns the byte length of the exact predecessor, present for rotations.
    #[must_use]
    pub fn predecessor_selection_json_bytes(&self) -> Option<usize> {
        self.predecessor_selection_json.as_ref().map(|json| json.len())
    }

    /// Returns the byte-exact canonical current selection inside the core.
    pub(super) fn current_selection_json(&self) -> &str {
        &self.current_selection_json
    }

    /// Returns the byte-exact predecessor selection inside the core.
    pub(super) fn predecessor_selection_json(&self) -> Option<&str> {
        self.predecessor_selection_json.as_deref()
    }

    /// Atomically snapshots the non-authority facts required by an attempt plan.
    pub(super) fn snapshot_attempt_envelope(
        &self,
    ) -> (LocalLogStorageSelectedBinding, Arc<str>, Option<Arc<str>>) {
        (
            self.binding.clone(),
            Arc::clone(&self.current_selection_json),
            self.predecessor_selection_json.as_ref().map(Arc::clone),
        )
    }

    /// Consumes a normalized value into its non-authority attempt facts.
    pub(super) fn into_attempt_envelope(
        self,
    ) -> (LocalLogStorageSelectedBinding, Arc<str>, Option<Arc<str>>) {
        let Self {
            binding,
            checkpoint_json: _,
            current_selection_json,
            predecessor_selection_json,
            _checkpoint_anchor: _,
        } = self;
        (binding, current_selection_json, predecessor_selection_json)
    }
}

impl fmt::Debug for LocalLogStorageSelectedRoot {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("LocalLogStorageSelectedRoot")
            .field("profile_id", self.profile_id())
            .field("profile_version", &self.profile_version())
            .field("database_incarnation_id", self.database_incarnation_id())
            .field("scope_id", self.scope_id())
            .field("scope_incarnation_id", self.scope_incarnation_id())
            .field("selected_head_id", self.selected_head_id())
            .field("previous_head_id", &self.previous_head_id())
            .field("selection_kind", &self.selection_kind())
            .field("transaction_id", self.transaction_id())
            .field("activation_fence_id", self.activation_fence_id())
            .field("session_id", self.session_id())
            .field("checkpoint_log_id", self.checkpoint_log_id())
            .field("active_log_id", self.active_log_id())
            .field("active_frame", &self.active_frame())
            .field("checkpoint_json_bytes", &self.checkpoint_json.len())
            .field("current_selection_json_bytes", &self.current_selection_json.len())
            .field(
                "predecessor_selection_json_bytes",
                &self.predecessor_selection_json.as_ref().map(|json| json.len()),
            )
            .finish_non_exhaustive()
    }
}
