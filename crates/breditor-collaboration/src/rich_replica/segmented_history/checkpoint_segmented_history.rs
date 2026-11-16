//! Explicit native segmented checkpoint: exact original root and every sealed/active input record.
use super::super::{RichReplica, session::MAX_JOURNAL_BYTES};
use super::{archive, encoding::encode, state::SegmentedHistory};
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
        self.selected_segmented_checkpoint(false)
    }

    /// Save the explicitly selected continuation with its exact migration boundary.
    ///
    /// # Errors
    /// Refuses a legacy owner or a checkpoint outside the continued history contract.
    pub fn continued_history_checkpoint(&self) -> Result<String, Error> {
        self.selected_segmented_checkpoint(true)
    }

    fn selected_segmented_checkpoint(&self, continued: bool) -> Result<String, Error> {
        let (state, active) = self.segmented_checkpoint_parts()?;
        if state.continuation.is_some() != continued {
            return Err(Error::Contract("select the matching segmented history checkpoint"));
        }
        archive::checkpoint(state, &active)
    }

    pub(in crate::rich_replica) fn check_segmented_checkpoint_budget(&self) -> Result<(), Error> {
        let (state, active) = self.segmented_checkpoint_parts()?;
        archive::check_size(state, &active, state.max_archive_bytes()).map(|_| ())
    }

    fn segmented_checkpoint_parts(&self) -> Result<(&SegmentedHistory, String), Error> {
        let state = self.segmented.as_ref().ok_or(Error::Contract("segmented history required"))?;
        if let Some(typing) = &self.typing {
            typing.validate_partition(&self.journal)?;
        }
        if let Some(reviewed) = &self.reviewed_history {
            reviewed.validate(self)?;
        }
        // A read needs the canonical active bytes, not a sealed record/hash.
        // Borrow entries while retaining every original prefix/family check.
        let active = encode(&state.active_ref(self)?, MAX_JOURNAL_BYTES)?;
        Ok((state, active))
    }
    pub(in crate::rich_replica) fn require_unsegmented_checkpoint(&self) -> Result<(), Error> {
        if self.segmented.is_some() {
            return Err(Error::Contract("use explicit segmented history checkpoint"));
        }
        Ok(())
    }
}
