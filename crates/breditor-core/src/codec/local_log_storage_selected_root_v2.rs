use std::fmt;

use crate::{
    local_log::{
        LocalLogId, LocalLogStorageDatabaseIncarnationId, LocalLogStorageFenceId,
        LocalLogStorageHeadId, LocalLogStorageProfileId, LocalLogStorageProfileVersion,
        LocalLogStorageScopeId, LocalLogStorageScopeIncarnationId, LocalLogStorageTransactionId,
        LocalSessionId,
    },
    schema::DurableSchemaBinding,
};

use super::{
    LocalLogStorageGenerationFrameV2, LocalLogStorageSelectedRoot, LocalLogStorageSelectionKind,
    LocalLogStorageSelectionReceiptBinding,
};

/// One trusted, normalized exact Storage V2 selection envelope.
///
/// The wrapper hides every legacy Frame V1 projection while retaining the
/// common internal normalized representation.
#[must_use = "a selected Storage V2 root must be explicitly handled"]
pub struct LocalLogStorageSelectedRootV2(LocalLogStorageSelectedRoot);

impl LocalLogStorageSelectedRootV2 {
    pub(super) const fn new(inner: LocalLogStorageSelectedRoot) -> Self {
        Self(inner)
    }

    pub(super) const fn inner(&self) -> &LocalLogStorageSelectedRoot {
        &self.0
    }

    /// Returns the retained durable schema binding.
    #[must_use]
    pub const fn schema_binding(&self) -> &DurableSchemaBinding {
        self.0.schema_binding()
    }

    /// Returns the selected storage profile.
    #[must_use]
    pub const fn profile_id(&self) -> &LocalLogStorageProfileId {
        self.0.profile_id()
    }

    /// Returns the selected storage profile version.
    #[must_use]
    pub const fn profile_version(&self) -> LocalLogStorageProfileVersion {
        self.0.profile_version()
    }

    /// Returns the selected database incarnation.
    #[must_use]
    pub const fn database_incarnation_id(&self) -> &LocalLogStorageDatabaseIncarnationId {
        self.0.database_incarnation_id()
    }

    /// Returns the selected scope.
    #[must_use]
    pub const fn scope_id(&self) -> &LocalLogStorageScopeId {
        self.0.scope_id()
    }

    /// Returns the selected scope incarnation.
    #[must_use]
    pub const fn scope_incarnation_id(&self) -> &LocalLogStorageScopeIncarnationId {
        self.0.scope_incarnation_id()
    }

    /// Returns the selected head.
    #[must_use]
    pub const fn selected_head_id(&self) -> &LocalLogStorageHeadId {
        self.0.selected_head_id()
    }

    /// Returns the previous head, absent for a root.
    #[must_use]
    pub const fn previous_head_id(&self) -> Option<&LocalLogStorageHeadId> {
        self.0.previous_head_id()
    }

    /// Returns the selection kind.
    #[must_use]
    pub const fn selection_kind(&self) -> LocalLogStorageSelectionKind {
        self.0.selection_kind()
    }

    /// Returns the selected transaction identity.
    #[must_use]
    pub const fn transaction_id(&self) -> &LocalLogStorageTransactionId {
        self.0.transaction_id()
    }

    /// Returns the active generation's activation fence.
    #[must_use]
    pub const fn activation_fence_id(&self) -> &LocalLogStorageFenceId {
        self.0.activation_fence_id()
    }

    /// Returns the selected session identity.
    #[must_use]
    pub const fn session_id(&self) -> &LocalSessionId {
        self.0.session_id()
    }

    /// Returns the checkpoint generation identity.
    #[must_use]
    pub const fn checkpoint_log_id(&self) -> &LocalLogId {
        self.0.checkpoint_log_id()
    }

    /// Returns the active generation identity.
    #[must_use]
    pub const fn active_log_id(&self) -> &LocalLogId {
        self.0.active_log_id()
    }

    /// Returns the exact active Frame V2 policy.
    #[must_use]
    pub const fn active_frame(&self) -> LocalLogStorageGenerationFrameV2 {
        match self.0.active_frame_v2() {
            Some(frame) => frame,
            None => unreachable!(),
        }
    }

    /// Returns the complete trusted current receipt.
    #[must_use]
    pub const fn current_receipt(&self) -> &LocalLogStorageSelectionReceiptBinding {
        self.0.current_receipt()
    }

    /// Returns the trusted immediate predecessor receipt.
    #[must_use]
    pub const fn predecessor_receipt(&self) -> Option<&LocalLogStorageSelectionReceiptBinding> {
        self.0.predecessor_receipt()
    }

    /// Returns exact canonical embedded Checkpoint V2 JSON.
    #[must_use]
    pub fn checkpoint_json(&self) -> &str {
        self.0.checkpoint_json()
    }

    /// Returns embedded checkpoint UTF-8 bytes.
    #[must_use]
    pub fn checkpoint_json_bytes(&self) -> usize {
        self.0.checkpoint_json_bytes()
    }

    /// Returns exact current selection JSON bytes.
    #[must_use]
    pub fn current_selection_json_bytes(&self) -> usize {
        self.0.current_selection_json_bytes()
    }

    /// Returns exact predecessor selection JSON bytes when present.
    #[must_use]
    pub fn predecessor_selection_json_bytes(&self) -> Option<usize> {
        self.0.predecessor_selection_json_bytes()
    }
}

impl fmt::Debug for LocalLogStorageSelectedRootV2 {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("LocalLogStorageSelectedRootV2")
            .field("schema_binding", self.schema_binding())
            .field("selection_kind", &self.selection_kind())
            .field("profile_id", self.profile_id())
            .field("scope_id", self.scope_id())
            .field("selected_head_id", self.selected_head_id())
            .field("session_id", self.session_id())
            .field("checkpoint_log_id", self.checkpoint_log_id())
            .field("active_log_id", self.active_log_id())
            .field("active_frame", &self.active_frame())
            .field("checkpoint_json_bytes", &self.checkpoint_json_bytes())
            .finish_non_exhaustive()
    }
}
