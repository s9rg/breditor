use std::fmt;

use crate::local_log::{
    LocalLogId, LocalLogStorageFenceId, LocalLogStorageHeadId, LocalLogStorageProfileId,
    LocalLogStorageProfileVersion, LocalLogStorageScopeId, LocalLogStorageTransactionId,
    LocalSessionId,
};
use crate::schema::{CompiledSchema, DurableSchemaBinding};

use super::{LocalLogStorageGenerationFrameV1, LocalLogStorageGenerationFrameV2};

/// One checked, canonicalizable Local Log Storage Root selection.
///
/// This immutable value is inspection data only. It does not own the
/// checkpoint anchor, provision either generation, carry a writer capability,
/// establish current-head authority, or prove publication or durability.
/// There is deliberately no public constructor: strict decode or borrowed
/// preparation must establish every association first.
#[must_use = "a storage-root selection is inspection data that must be explicitly handled"]
#[derive(Eq, PartialEq)]
pub struct LocalLogStorageRootSelection {
    schema_binding: DurableSchemaBinding,
    profile_id: LocalLogStorageProfileId,
    profile_version: LocalLogStorageProfileVersion,
    scope_id: LocalLogStorageScopeId,
    transaction_id: LocalLogStorageTransactionId,
    committed_head_id: LocalLogStorageHeadId,
    fence_id: LocalLogStorageFenceId,
    session_id: LocalSessionId,
    checkpoint_log_id: LocalLogId,
    active_log_id: LocalLogId,
    active_frame: LocalLogStorageGenerationFrameV1,
    active_frame_format_version: u32,
    checkpoint_json: String,
}

pub(crate) struct LocalLogStorageRootSelectionParts {
    pub(crate) profile_id: LocalLogStorageProfileId,
    pub(crate) profile_version: LocalLogStorageProfileVersion,
    pub(crate) scope_id: LocalLogStorageScopeId,
    pub(crate) transaction_id: LocalLogStorageTransactionId,
    pub(crate) committed_head_id: LocalLogStorageHeadId,
    pub(crate) fence_id: LocalLogStorageFenceId,
    pub(crate) session_id: LocalSessionId,
    pub(crate) checkpoint_log_id: LocalLogId,
    pub(crate) active_log_id: LocalLogId,
    pub(crate) active_frame: LocalLogStorageGenerationFrameV1,
    pub(crate) checkpoint_json: String,
}

impl LocalLogStorageRootSelection {
    pub(crate) fn from_parts(parts: LocalLogStorageRootSelectionParts) -> Self {
        Self {
            schema_binding: CompiledSchema::breditor_base().durable_binding(),
            profile_id: parts.profile_id,
            profile_version: parts.profile_version,
            scope_id: parts.scope_id,
            transaction_id: parts.transaction_id,
            committed_head_id: parts.committed_head_id,
            fence_id: parts.fence_id,
            session_id: parts.session_id,
            checkpoint_log_id: parts.checkpoint_log_id,
            active_log_id: parts.active_log_id,
            active_frame: parts.active_frame,
            active_frame_format_version: parts.active_frame.format_version(),
            checkpoint_json: parts.checkpoint_json,
        }
    }

    pub(crate) fn from_parts_v2(
        schema_binding: DurableSchemaBinding,
        parts: LocalLogStorageRootSelectionParts,
        active_frame: LocalLogStorageGenerationFrameV2,
    ) -> Self {
        Self {
            schema_binding,
            profile_id: parts.profile_id,
            profile_version: parts.profile_version,
            scope_id: parts.scope_id,
            transaction_id: parts.transaction_id,
            committed_head_id: parts.committed_head_id,
            fence_id: parts.fence_id,
            session_id: parts.session_id,
            checkpoint_log_id: parts.checkpoint_log_id,
            active_log_id: parts.active_log_id,
            active_frame: LocalLogStorageGenerationFrameV1::new(active_frame.limits()),
            active_frame_format_version: active_frame.format_version(),
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

    /// Returns the storage scope named by this root.
    #[must_use]
    pub const fn scope_id(&self) -> &LocalLogStorageScopeId {
        &self.scope_id
    }

    /// Returns the provisioning transaction identity.
    #[must_use]
    pub const fn transaction_id(&self) -> &LocalLogStorageTransactionId {
        &self.transaction_id
    }

    /// Returns the first proposed authoritative head identity.
    #[must_use]
    pub const fn committed_head_id(&self) -> &LocalLogStorageHeadId {
        &self.committed_head_id
    }

    /// Returns the immutable non-secret activation-fence correlation identity.
    #[must_use]
    pub const fn fence_id(&self) -> &LocalLogStorageFenceId {
        &self.fence_id
    }

    /// Returns the stable local-session identity derived from the checkpoint.
    #[must_use]
    pub const fn session_id(&self) -> &LocalSessionId {
        &self.session_id
    }

    /// Returns the generation represented by the nested checkpoint.
    #[must_use]
    pub const fn checkpoint_log_id(&self) -> &LocalLogId {
        &self.checkpoint_log_id
    }

    /// Returns the distinct active generation named by the nested checkpoint.
    #[must_use]
    pub const fn active_log_id(&self) -> &LocalLogId {
        &self.active_log_id
    }

    /// Returns the active generation's payload limits through the legacy Frame V1 view.
    ///
    /// For a V2 selection this is only a compatibility projection of the
    /// limits; it does not change or report the retained generation. Call
    /// [`Self::active_frame_format_version`] and [`Self::active_frame_v2`] when
    /// protocol generation matters. Every V1 codec rejects V2-tagged values
    /// before using this projection.
    #[must_use]
    pub const fn active_frame(&self) -> LocalLogStorageGenerationFrameV1 {
        self.active_frame
    }

    /// Returns the retained frame wire generation without projecting it away.
    #[must_use]
    pub const fn active_frame_format_version(&self) -> u32 {
        self.active_frame_format_version
    }

    /// Returns the active Frame V2 policy when this is a V2 selection.
    #[must_use]
    pub const fn active_frame_v2(&self) -> Option<LocalLogStorageGenerationFrameV2> {
        if self.active_frame_format_version == 2 {
            Some(LocalLogStorageGenerationFrameV2::new(self.active_frame.limits()))
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

impl fmt::Debug for LocalLogStorageRootSelection {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("LocalLogStorageRootSelection")
            .field("schema_binding", &self.schema_binding)
            .field("profile_id", &self.profile_id)
            .field("profile_version", &self.profile_version)
            .field("scope_id", &self.scope_id)
            .field("transaction_id", &self.transaction_id)
            .field("committed_head_id", &self.committed_head_id)
            .field("fence_id", &self.fence_id)
            .field("session_id", &self.session_id)
            .field("checkpoint_log_id", &self.checkpoint_log_id)
            .field("active_log_id", &self.active_log_id)
            .field("active_frame", &self.active_frame)
            .field("active_frame_format_version", &self.active_frame_format_version)
            .field("checkpoint_json_bytes", &self.checkpoint_json.len())
            .finish_non_exhaustive()
    }
}

#[cfg(test)]
mod tests {
    use super::{LocalLogStorageRootSelection, LocalLogStorageRootSelectionParts};
    use crate::{
        codec::{LocalLogFrameLimits, LocalLogStorageGenerationFrameV1},
        local_log::{
            LocalLogId, LocalLogStorageFenceId, LocalLogStorageHeadId, LocalLogStorageProfileId,
            LocalLogStorageProfileVersion, LocalLogStorageScopeId, LocalLogStorageTransactionId,
            LocalSessionId,
        },
    };

    #[test]
    fn debug_reports_checkpoint_size_without_checkpoint_bytes()
    -> Result<(), Box<dyn std::error::Error>> {
        let selection =
            LocalLogStorageRootSelection::from_parts(LocalLogStorageRootSelectionParts {
                profile_id: LocalLogStorageProfileId::try_new("breditor/test-storage")?,
                profile_version: LocalLogStorageProfileVersion::try_new(1)?,
                scope_id: LocalLogStorageScopeId::try_new("scope:test")?,
                transaction_id: LocalLogStorageTransactionId::try_new("transaction:root")?,
                committed_head_id: LocalLogStorageHeadId::try_new("head:root")?,
                fence_id: LocalLogStorageFenceId::try_new("fence:root")?,
                session_id: LocalSessionId::try_new("session:test")?,
                checkpoint_log_id: LocalLogId::try_new("log:checkpoint")?,
                active_log_id: LocalLogId::try_new("log:active")?,
                active_frame: LocalLogStorageGenerationFrameV1::new(LocalLogFrameLimits::new(1)),
                checkpoint_json: "checkpoint-secret-payload".to_owned(),
            });

        let debug = format!("{selection:?}");
        assert!(!debug.contains("checkpoint-secret-payload"));
        assert!(debug.contains("checkpoint_json_bytes: 25"));
        Ok(())
    }
}
