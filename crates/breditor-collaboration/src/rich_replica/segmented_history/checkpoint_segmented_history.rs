//! Explicit native segmented checkpoint: exact original root and every sealed/active input record.
use super::super::RichReplica;
use super::{archive, segment::Sealed};
use crate::Error;
impl RichReplica {
    /// Save the separately selected bounded segmented-history/v1 family, retaining old native IDs.
    /// Root/sealed files remain exact; active entries and joins keep their old per-segment limits.
    /// Native Undo capacity and causal/update budgets are unchanged. This is not a credential,
    /// portable author clone, durable commit acknowledgement, CRDT compaction or room activation.
    /// # Errors
    /// Disabled mode, altered retained prefix/family, invalid history or independent new archive
    /// bounds reject. Original-family save APIs never emit or reinterpret this new format.
    pub fn segmented_checkpoint(&self) -> Result<String, Error> {
        let state = self.segmented.as_ref().ok_or(Error::Contract("segmented history required"))?;
        if let Some(typing) = &self.typing {
            typing.validate_partition(&self.journal)?;
        }
        if let Some(reviewed) = &self.reviewed_history {
            reviewed.validate(self)?;
        }
        let active = Sealed::from_record(state.active(self)?)?;
        archive::checkpoint(state, &active.json)
    }
    pub(in crate::rich_replica) fn require_unsegmented_checkpoint(&self) -> Result<(), Error> {
        if self.segmented.is_some() {
            return Err(Error::Contract("use explicit segmented history checkpoint"));
        }
        Ok(())
    }
}
