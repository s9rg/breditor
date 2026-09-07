use std::fmt;

use crate::{
    local_log::{
        LocalLogId, LocalLogStorageFenceId, LocalLogStorageHeadId, LocalLogStorageProfileId,
        LocalLogStorageProfileVersion, LocalLogStorageScopeId, LocalLogStorageTransactionId,
        LocalSessionId,
    },
    schema::DurableSchemaBinding,
};

use super::{LocalLogStorageGenerationFrameV2, LocalLogStorageGenerationManifest};

/// One checked, canonicalizable Storage Generation V2 rotation.
///
/// The opaque wrapper exposes only Frame V2 policies and prevents callers from
/// projecting them through legacy Frame V1 accessors.
#[must_use = "a V2 storage-generation manifest must be explicitly handled"]
#[derive(Eq, PartialEq)]
pub struct LocalLogStorageGenerationManifestV2(LocalLogStorageGenerationManifest);

impl LocalLogStorageGenerationManifestV2 {
    pub(super) const fn new(inner: LocalLogStorageGenerationManifest) -> Self {
        Self(inner)
    }

    pub(super) const fn inner(&self) -> &LocalLogStorageGenerationManifest {
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

    /// Returns the rotation transaction identity.
    #[must_use]
    pub const fn transaction_id(&self) -> &LocalLogStorageTransactionId {
        self.0.transaction_id()
    }

    /// Returns the expected predecessor head.
    #[must_use]
    pub const fn expected_head_id(&self) -> &LocalLogStorageHeadId {
        self.0.expected_head_id()
    }

    /// Returns the proposed committed head.
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

    /// Returns the sealed generation identity.
    #[must_use]
    pub const fn sealed_log_id(&self) -> &LocalLogId {
        self.0.sealed_log_id()
    }

    /// Returns the successor generation identity.
    #[must_use]
    pub const fn successor_log_id(&self) -> &LocalLogId {
        self.0.successor_log_id()
    }

    /// Returns the accepted sealed-tail prefix length.
    #[must_use]
    pub const fn accepted_prefix_bytes(&self) -> u64 {
        self.0.accepted_prefix_bytes()
    }

    /// Returns the exact sealed Frame V2 policy.
    #[must_use]
    pub const fn sealed_frame(&self) -> LocalLogStorageGenerationFrameV2 {
        match self.0.sealed_frame_v2() {
            Some(frame) => frame,
            None => unreachable!(),
        }
    }

    /// Returns the exact successor Frame V2 policy.
    #[must_use]
    pub const fn successor_frame(&self) -> LocalLogStorageGenerationFrameV2 {
        match self.0.successor_frame_v2() {
            Some(frame) => frame,
            None => unreachable!(),
        }
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
}

impl fmt::Debug for LocalLogStorageGenerationManifestV2 {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("LocalLogStorageGenerationManifestV2")
            .field("schema_binding", self.schema_binding())
            .field("profile_id", self.profile_id())
            .field("scope_id", self.scope_id())
            .field("transaction_id", self.transaction_id())
            .field("expected_head_id", self.expected_head_id())
            .field("committed_head_id", self.committed_head_id())
            .field("session_id", self.session_id())
            .field("sealed_log_id", self.sealed_log_id())
            .field("successor_log_id", self.successor_log_id())
            .field("sealed_frame", &self.sealed_frame())
            .field("successor_frame", &self.successor_frame())
            .field("checkpoint_json_bytes", &self.checkpoint_json_bytes())
            .finish_non_exhaustive()
    }
}
