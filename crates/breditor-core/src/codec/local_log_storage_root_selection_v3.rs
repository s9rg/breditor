use std::fmt;

use crate::{
    local_log::{
        LocalLogId, LocalLogStorageFenceId, LocalLogStorageHeadId, LocalLogStorageProfileId,
        LocalLogStorageProfileVersion, LocalLogStorageScopeId, LocalLogStorageTransactionId,
        LocalSessionId,
    },
    schema::DurableSchemaBinding,
};

use super::{LocalLogStorageGenerationFrameV3, LocalLogStorageRootSelection};

/// One checked, canonicalizable Storage Root V3 selection.
///
/// This opaque wrapper deliberately does not expose the legacy Frame V1
/// projection available on the internal compatibility representation.
///
/// V3 selections cannot be passed to an older codec:
///
/// ```compile_fail
/// use breditor_core::codec::{LocalLogStorageRootJsonCodecV2, LocalLogStorageRootSelectionV3};
/// fn cannot_downgrade(codec: &LocalLogStorageRootJsonCodecV2, value: &LocalLogStorageRootSelectionV3) {
///     let _ = codec.encode_root(value);
/// }
/// ```
#[must_use = "a V3 storage-root selection must be explicitly handled"]
#[derive(Eq, PartialEq)]
pub struct LocalLogStorageRootSelectionV3(LocalLogStorageRootSelection);

impl LocalLogStorageRootSelectionV3 {
    pub(super) const fn new(inner: LocalLogStorageRootSelection) -> Self {
        Self(inner)
    }

    pub(super) const fn inner(&self) -> &LocalLogStorageRootSelection {
        &self.0
    }

    /// Returns the exact durable schema selector and fingerprint.
    #[must_use]
    pub const fn schema_binding(&self) -> &DurableSchemaBinding {
        self.0.schema_binding()
    }

    /// Returns the storage profile identity.
    #[must_use]
    pub const fn profile_id(&self) -> &LocalLogStorageProfileId {
        self.0.profile_id()
    }

    /// Returns the storage profile version.
    #[must_use]
    pub const fn profile_version(&self) -> LocalLogStorageProfileVersion {
        self.0.profile_version()
    }

    /// Returns the storage scope identity.
    #[must_use]
    pub const fn scope_id(&self) -> &LocalLogStorageScopeId {
        self.0.scope_id()
    }

    /// Returns the provisioning transaction identity.
    #[must_use]
    pub const fn transaction_id(&self) -> &LocalLogStorageTransactionId {
        self.0.transaction_id()
    }

    /// Returns the committed head identity.
    #[must_use]
    pub const fn committed_head_id(&self) -> &LocalLogStorageHeadId {
        self.0.committed_head_id()
    }

    /// Returns the activation fence identity.
    #[must_use]
    pub const fn fence_id(&self) -> &LocalLogStorageFenceId {
        self.0.fence_id()
    }

    /// Returns the durable session identity.
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

    /// Returns the exact active Frame V3 policy.
    #[must_use]
    pub const fn active_frame(&self) -> LocalLogStorageGenerationFrameV3 {
        match self.0.active_frame_v3() {
            Some(frame) => frame,
            None => unreachable!(),
        }
    }

    /// Returns the exact canonical embedded Checkpoint V3 JSON.
    #[must_use]
    pub fn checkpoint_json(&self) -> &str {
        self.0.checkpoint_json()
    }

    /// Returns embedded checkpoint UTF-8 bytes.
    #[must_use]
    pub fn checkpoint_json_bytes(&self) -> usize {
        self.0.checkpoint_json_bytes()
    }
}

impl fmt::Debug for LocalLogStorageRootSelectionV3 {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("LocalLogStorageRootSelectionV3")
            .field("schema_binding", self.schema_binding())
            .field("profile_id", self.profile_id())
            .field("scope_id", self.scope_id())
            .field("transaction_id", self.transaction_id())
            .field("committed_head_id", self.committed_head_id())
            .field("session_id", self.session_id())
            .field("checkpoint_log_id", self.checkpoint_log_id())
            .field("active_log_id", self.active_log_id())
            .field("active_frame", &self.active_frame())
            .field("checkpoint_json_bytes", &self.checkpoint_json_bytes())
            .finish_non_exhaustive()
    }
}
