use std::fmt;

use crate::local_log::{
    LocalLogId, LocalLogStorageFenceId, LocalLogStorageHeadId, LocalLogStorageProfileId,
    LocalLogStorageProfileVersion, LocalLogStorageScopeId, LocalLogStorageTransactionId,
    LocalSessionId,
};
use crate::schema::{CompiledSchema, DurableSchemaBinding};

use super::{LocalLogStorageGenerationFrameV1, LocalLogStorageGenerationFrameV2};

/// One checked, canonicalizable Local Log Storage Generation rotation value.
///
/// This immutable value contains inspection data only. It does not own the
/// checkpoint anchor, quarantine a successor, carry a writer capability, prove
/// durability, or authorize storage publication. There is deliberately no
/// public constructor: strict rotation decode or borrowed preparation must
/// establish every association first.
#[must_use = "a storage-generation manifest is inspection data that must be explicitly handled"]
#[derive(Eq, PartialEq)]
pub struct LocalLogStorageGenerationManifest {
    schema_binding: DurableSchemaBinding,
    profile_id: LocalLogStorageProfileId,
    profile_version: LocalLogStorageProfileVersion,
    scope_id: LocalLogStorageScopeId,
    transaction_id: LocalLogStorageTransactionId,
    expected_head_id: LocalLogStorageHeadId,
    committed_head_id: LocalLogStorageHeadId,
    fence_id: LocalLogStorageFenceId,
    session_id: LocalSessionId,
    sealed_log_id: LocalLogId,
    successor_log_id: LocalLogId,
    accepted_prefix_bytes: u64,
    sealed_frame: LocalLogStorageGenerationFrameV1,
    sealed_frame_format_version: u32,
    successor_frame: LocalLogStorageGenerationFrameV1,
    successor_frame_format_version: u32,
    checkpoint_json: String,
}

pub(crate) struct LocalLogStorageGenerationManifestParts {
    pub(crate) profile_id: LocalLogStorageProfileId,
    pub(crate) profile_version: LocalLogStorageProfileVersion,
    pub(crate) scope_id: LocalLogStorageScopeId,
    pub(crate) transaction_id: LocalLogStorageTransactionId,
    pub(crate) expected_head_id: LocalLogStorageHeadId,
    pub(crate) committed_head_id: LocalLogStorageHeadId,
    pub(crate) fence_id: LocalLogStorageFenceId,
    pub(crate) session_id: LocalSessionId,
    pub(crate) sealed_log_id: LocalLogId,
    pub(crate) successor_log_id: LocalLogId,
    pub(crate) accepted_prefix_bytes: u64,
    pub(crate) sealed_frame: LocalLogStorageGenerationFrameV1,
    pub(crate) successor_frame: LocalLogStorageGenerationFrameV1,
    pub(crate) checkpoint_json: String,
}

impl LocalLogStorageGenerationManifest {
    pub(crate) fn from_parts(parts: LocalLogStorageGenerationManifestParts) -> Self {
        Self {
            schema_binding: CompiledSchema::breditor_base().durable_binding(),
            profile_id: parts.profile_id,
            profile_version: parts.profile_version,
            scope_id: parts.scope_id,
            transaction_id: parts.transaction_id,
            expected_head_id: parts.expected_head_id,
            committed_head_id: parts.committed_head_id,
            fence_id: parts.fence_id,
            session_id: parts.session_id,
            sealed_log_id: parts.sealed_log_id,
            successor_log_id: parts.successor_log_id,
            accepted_prefix_bytes: parts.accepted_prefix_bytes,
            sealed_frame: parts.sealed_frame,
            sealed_frame_format_version: parts.sealed_frame.format_version(),
            successor_frame: parts.successor_frame,
            successor_frame_format_version: parts.successor_frame.format_version(),
            checkpoint_json: parts.checkpoint_json,
        }
    }

    pub(crate) fn from_parts_v2(
        schema_binding: DurableSchemaBinding,
        parts: LocalLogStorageGenerationManifestParts,
        sealed_frame: LocalLogStorageGenerationFrameV2,
        successor_frame: LocalLogStorageGenerationFrameV2,
    ) -> Self {
        Self {
            schema_binding,
            profile_id: parts.profile_id,
            profile_version: parts.profile_version,
            scope_id: parts.scope_id,
            transaction_id: parts.transaction_id,
            expected_head_id: parts.expected_head_id,
            committed_head_id: parts.committed_head_id,
            fence_id: parts.fence_id,
            session_id: parts.session_id,
            sealed_log_id: parts.sealed_log_id,
            successor_log_id: parts.successor_log_id,
            accepted_prefix_bytes: parts.accepted_prefix_bytes,
            sealed_frame: LocalLogStorageGenerationFrameV1::new(sealed_frame.limits()),
            sealed_frame_format_version: sealed_frame.format_version(),
            successor_frame: LocalLogStorageGenerationFrameV1::new(successor_frame.limits()),
            successor_frame_format_version: successor_frame.format_version(),
            checkpoint_json: parts.checkpoint_json,
        }
    }

    /// Returns the exact durable schema selector and fingerprint.
    #[must_use]
    pub const fn schema_binding(&self) -> &DurableSchemaBinding {
        &self.schema_binding
    }

    /// Returns the storage profile selected by trusted host configuration.
    #[must_use]
    pub const fn profile_id(&self) -> &LocalLogStorageProfileId {
        &self.profile_id
    }

    /// Returns the selected storage-profile contract version.
    #[must_use]
    pub const fn profile_version(&self) -> LocalLogStorageProfileVersion {
        self.profile_version
    }

    /// Returns the storage scope rotated by this value.
    #[must_use]
    pub const fn scope_id(&self) -> &LocalLogStorageScopeId {
        &self.scope_id
    }

    /// Returns the transaction identity the caller asserts is lifetime-unique.
    ///
    /// This value checks only immediate-prior reuse; lifetime uniqueness remains
    /// a storage-profile obligation.
    #[must_use]
    pub const fn transaction_id(&self) -> &LocalLogStorageTransactionId {
        &self.transaction_id
    }

    /// Returns the prior authoritative head expected by the plan.
    #[must_use]
    pub const fn expected_head_id(&self) -> &LocalLogStorageHeadId {
        &self.expected_head_id
    }

    /// Returns the proposed replacement authoritative head.
    #[must_use]
    pub const fn committed_head_id(&self) -> &LocalLogStorageHeadId {
        &self.committed_head_id
    }

    /// Returns the non-secret fence correlation identity.
    #[must_use]
    pub const fn fence_id(&self) -> &LocalLogStorageFenceId {
        &self.fence_id
    }

    /// Returns the stable local-session identity.
    #[must_use]
    pub const fn session_id(&self) -> &LocalSessionId {
        &self.session_id
    }

    /// Returns the generation sealed by this rotation.
    #[must_use]
    pub const fn sealed_log_id(&self) -> &LocalLogId {
        &self.sealed_log_id
    }

    /// Returns the distinct generation named as the proposed successor.
    ///
    /// The manifest does not establish that storage reserved it or that it is
    /// empty or absent.
    #[must_use]
    pub const fn successor_log_id(&self) -> &LocalLogId {
        &self.successor_log_id
    }

    /// Returns the generation-relative accepted prefix of the sealed tail.
    #[must_use]
    pub const fn accepted_prefix_bytes(&self) -> u64 {
        self.accepted_prefix_bytes
    }

    /// Returns sealed payload limits through the legacy Frame V1 view.
    ///
    /// On V2 manifests this is a compatibility projection only. Use
    /// [`Self::sealed_frame_format_version`] and [`Self::sealed_frame_v2`] to
    /// preserve the protocol generation. V1 codecs reject V2-tagged values.
    #[must_use]
    pub const fn sealed_frame(&self) -> LocalLogStorageGenerationFrameV1 {
        self.sealed_frame
    }

    /// Returns the retained sealed frame wire generation.
    #[must_use]
    pub const fn sealed_frame_format_version(&self) -> u32 {
        self.sealed_frame_format_version
    }

    /// Returns the sealed Frame V2 policy when this is a V2 manifest.
    #[must_use]
    pub const fn sealed_frame_v2(&self) -> Option<LocalLogStorageGenerationFrameV2> {
        if self.sealed_frame_format_version == 2 {
            Some(LocalLogStorageGenerationFrameV2::new(self.sealed_frame.limits()))
        } else {
            None
        }
    }

    /// Returns successor payload limits through the legacy Frame V1 view.
    ///
    /// On V2 manifests this is a compatibility projection only. Use
    /// [`Self::successor_frame_format_version`] and
    /// [`Self::successor_frame_v2`] when the generation matters.
    #[must_use]
    pub const fn successor_frame(&self) -> LocalLogStorageGenerationFrameV1 {
        self.successor_frame
    }

    /// Returns the retained successor frame wire generation.
    #[must_use]
    pub const fn successor_frame_format_version(&self) -> u32 {
        self.successor_frame_format_version
    }

    /// Returns the successor Frame V2 policy when this is a V2 manifest.
    #[must_use]
    pub const fn successor_frame_v2(&self) -> Option<LocalLogStorageGenerationFrameV2> {
        if self.successor_frame_format_version == 2 {
            Some(LocalLogStorageGenerationFrameV2::new(self.successor_frame.limits()))
        } else {
            None
        }
    }

    /// Returns the exact canonical embedded Local Log Checkpoint V1 JSON.
    #[must_use]
    pub fn checkpoint_json(&self) -> &str {
        &self.checkpoint_json
    }

    /// Returns the decoded UTF-8 byte length of the embedded checkpoint.
    #[must_use]
    pub fn checkpoint_json_bytes(&self) -> usize {
        self.checkpoint_json.len()
    }
}

impl fmt::Debug for LocalLogStorageGenerationManifest {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("LocalLogStorageGenerationManifest")
            .field("schema_binding", &self.schema_binding)
            .field("profile_id", &self.profile_id)
            .field("profile_version", &self.profile_version)
            .field("scope_id", &self.scope_id)
            .field("transaction_id", &self.transaction_id)
            .field("expected_head_id", &self.expected_head_id)
            .field("committed_head_id", &self.committed_head_id)
            .field("fence_id", &self.fence_id)
            .field("session_id", &self.session_id)
            .field("sealed_log_id", &self.sealed_log_id)
            .field("successor_log_id", &self.successor_log_id)
            .field("accepted_prefix_bytes", &self.accepted_prefix_bytes)
            .field("sealed_frame", &self.sealed_frame)
            .field("sealed_frame_format_version", &self.sealed_frame_format_version)
            .field("successor_frame", &self.successor_frame)
            .field("successor_frame_format_version", &self.successor_frame_format_version)
            .field("checkpoint_json_bytes", &self.checkpoint_json.len())
            .finish_non_exhaustive()
    }
}

#[cfg(test)]
mod tests {
    use super::{
        LocalLogId, LocalLogStorageFenceId, LocalLogStorageGenerationFrameV1,
        LocalLogStorageGenerationManifest, LocalLogStorageGenerationManifestParts,
        LocalLogStorageHeadId, LocalLogStorageProfileId, LocalLogStorageProfileVersion,
        LocalLogStorageScopeId, LocalLogStorageTransactionId, LocalSessionId,
    };
    use crate::codec::LocalLogFrameLimits;

    #[test]
    fn debug_reports_checkpoint_size_without_checkpoint_bytes()
    -> Result<(), Box<dyn std::error::Error>> {
        let checkpoint_json = "checkpoint-secret-payload".to_owned();
        let manifest =
            LocalLogStorageGenerationManifest::from_parts(LocalLogStorageGenerationManifestParts {
                profile_id: LocalLogStorageProfileId::try_new("breditor/test-storage")?,
                profile_version: LocalLogStorageProfileVersion::try_new(1)?,
                scope_id: LocalLogStorageScopeId::try_new("scope:test")?,
                transaction_id: LocalLogStorageTransactionId::try_new("transaction:test")?,
                expected_head_id: LocalLogStorageHeadId::try_new("head:old")?,
                committed_head_id: LocalLogStorageHeadId::try_new("head:new")?,
                fence_id: LocalLogStorageFenceId::try_new("fence:test")?,
                session_id: LocalSessionId::try_new("session:test")?,
                sealed_log_id: LocalLogId::try_new("log:sealed")?,
                successor_log_id: LocalLogId::try_new("log:successor")?,
                accepted_prefix_bytes: 0,
                sealed_frame: LocalLogStorageGenerationFrameV1::new(LocalLogFrameLimits::new(1)),
                successor_frame: LocalLogStorageGenerationFrameV1::new(LocalLogFrameLimits::new(2)),
                checkpoint_json,
            });

        let debug = format!("{manifest:?}");
        assert!(!debug.contains("checkpoint-secret-payload"));
        assert!(debug.contains("checkpoint_json_bytes: 25"));
        Ok(())
    }
}
