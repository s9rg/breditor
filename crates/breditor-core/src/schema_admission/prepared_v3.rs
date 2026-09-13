use std::fmt;

use crate::{
    local_log::{LocalLogCheckpointAnchor, LocalSessionId},
    schema::DurableSchemaBinding,
    state::LineageId,
};

/// Complete in-memory result of a successful structural schema admission.
///
/// This non-`Clone` value keeps the target checkpoint owner and its exact
/// canonical V3 JSON together until the host deliberately separates them for
/// adoption. It is not proof of storage publication, durability, freshness,
/// authorization, or writer ownership.
///
/// An older root codec cannot accept this V3 preparation:
///
/// ```compile_fail
/// use breditor_core::{codec::{LocalLogStorageRootJsonCodecV2, LocalLogStorageRootPreparationInputs}, schema_admission::PreparedSchemaAdmissionV3};
/// fn cannot_downgrade(codec: &LocalLogStorageRootJsonCodecV2, prepared: &PreparedSchemaAdmissionV3, inputs: &LocalLogStorageRootPreparationInputs) {
///     let _ = codec.prepare_root_from_schema_admission(prepared, inputs);
/// }
/// ```
#[must_use = "a prepared schema admission must be explicitly adopted or discarded"]
pub struct PreparedSchemaAdmissionV3 {
    pub(super) source_schema_binding: DurableSchemaBinding,
    pub(super) target_schema_binding: DurableSchemaBinding,
    pub(super) source_lineage: LineageId,
    pub(super) target_lineage: LineageId,
    pub(super) source_session_id: LocalSessionId,
    pub(super) target_checkpoint: LocalLogCheckpointAnchor,
    pub(super) target_checkpoint_json: String,
}

impl PreparedSchemaAdmissionV3 {
    /// Returns the exact durable schema identity validated at the source.
    #[must_use]
    pub const fn source_schema_binding(&self) -> &DurableSchemaBinding {
        &self.source_schema_binding
    }

    /// Returns the exact durable schema identity installed at the target.
    #[must_use]
    pub const fn target_schema_binding(&self) -> &DurableSchemaBinding {
        &self.target_schema_binding
    }

    /// Returns the source lineage observed at admission; the source is not closed.
    #[must_use]
    pub const fn source_lineage(&self) -> &LineageId {
        &self.source_lineage
    }

    /// Returns the distinct revision-zero target lineage.
    #[must_use]
    pub const fn target_lineage(&self) -> &LineageId {
        &self.target_lineage
    }

    /// Returns the source durable local-session identity that was not reused.
    #[must_use]
    pub const fn source_session_id(&self) -> &LocalSessionId {
        &self.source_session_id
    }

    /// Returns the prepared target checkpoint owner.
    #[must_use]
    pub const fn target_checkpoint(&self) -> &LocalLogCheckpointAnchor {
        &self.target_checkpoint
    }

    /// Returns exact canonical Local Log Checkpoint V3 JSON.
    #[must_use]
    pub fn target_checkpoint_json(&self) -> &str {
        &self.target_checkpoint_json
    }

    /// Separates the target checkpoint owner from its exact canonical V3 JSON.
    ///
    /// Calling this does not publish either value. A storage host must keep
    /// them coupled to a new root and apply its own atomicity, integrity,
    /// freshness, and writer-fencing policy.
    #[must_use]
    pub fn into_target_parts(self) -> (LocalLogCheckpointAnchor, String) {
        (self.target_checkpoint, self.target_checkpoint_json)
    }
}

impl fmt::Debug for PreparedSchemaAdmissionV3 {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("PreparedSchemaAdmissionV3")
            .field("source_schema_binding", &self.source_schema_binding)
            .field("target_schema_binding", &self.target_schema_binding)
            .field("source_lineage", &self.source_lineage)
            .field("target_lineage", &self.target_lineage)
            .field("source_session_id", &self.source_session_id)
            .field("target_session_id", self.target_checkpoint.session_id())
            .field("target_checkpoint_json_bytes", &self.target_checkpoint_json.len())
            .finish_non_exhaustive()
    }
}
