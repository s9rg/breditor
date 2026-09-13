use crate::local_log::LocalLogCheckpointAnchor;

use super::{PreparedSchemaAdmissionV3, SchemaAdmissionRequest, SchemaAdmissionV3Error};

impl SchemaAdmissionRequest {
    /// Prepares an unchanged-AST admission with an explicit Checkpoint V3 result.
    ///
    /// The source remains borrowed and unchanged. The target must accept every
    /// existing document property without coercion or removal. Success starts
    /// a distinct session and revision-zero lineage with empty history,
    /// selection, pending formats, and replay tombstones. This is structural
    /// validation, not a transformation or automatic decoder fallback.
    ///
    /// The result keeps the target anchor coupled to its canonical Local Log
    /// Checkpoint V3 bytes. It grants no publication or writer authority.
    /// Source anchors are wire-neutral; this method selects only the output
    /// generation, not the source's original wire format.
    ///
    /// # Errors
    ///
    /// Returns [`SchemaAdmissionV3Error`] for an unchanged fingerprint, reused
    /// lineage/session, source or target document rejection, target state
    /// construction, or V3 checkpoint encoding failure. All inputs remain
    /// available unchanged on failure.
    pub fn try_prepare_v3(
        &self,
        source: &LocalLogCheckpointAnchor,
    ) -> Result<PreparedSchemaAdmissionV3, SchemaAdmissionV3Error> {
        super::prepare_v3::prepare(source, self)
    }
}
