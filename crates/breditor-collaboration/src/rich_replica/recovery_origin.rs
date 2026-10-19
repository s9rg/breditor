//! Exact native journal continuity, not AST equality or a causal counter-only claim.
use super::{RichReplica, SharedObservation, session::publication};
use crate::Error;
#[cfg(test)]
#[path = "recovery_origin_tests.rs"]
mod tests;

impl RichReplica {
    /// Verify this native same-writer journal extends the selected native origin without
    /// rewriting its seed/join, retained actions, remote inputs or typing partition.
    /// Native replay already derives each owner's causal state and selective Undo/Redo from
    /// those records. Later genuine actions, Undo/Redo, imports and UI/policy publications are
    /// allowed; changing an earlier action or regrouping old inputs is not a continuation.
    /// This pure check grants no current account, writer, provider or activation authority.
    ///
    /// # Errors
    /// Rejects stale/foreign observations, different native profile/scope/history modes,
    /// room/writer/schema, changed origin, shortened/forked journal or publication rollback.
    /// Neither owner is imported into, published, upgraded or otherwise modified.
    pub fn verify_recovery_origin_guarded(
        &self,
        observed: &SharedObservation,
        origin: &Self,
        origin_observed: &SharedObservation,
    ) -> Result<(), Error> {
        if self.segmented.is_some() || origin.segmented.is_some() {
            return Err(Error::Contract("use explicit segmented recovery origin"));
        }
        self.verify_native_origin_prefix_guarded(observed, origin, origin_observed)
    }

    pub(super) fn verify_native_origin_prefix_guarded(
        &self,
        observed: &SharedObservation,
        origin: &Self,
        origin_observed: &SharedObservation,
    ) -> Result<(), Error> {
        self.check(observed)?;
        origin.check(origin_observed)?;
        if self.protocol != origin.protocol
            || self.codec.schema().fingerprint() != origin.codec.schema().fingerprint()
            || self.replay_contract != origin.replay_contract
            || self.search_contract != origin.search_contract
            || self.reviewed_contract != origin.reviewed_contract
            || self.typing.is_some() != origin.typing.is_some()
            || self.document_id() != origin.document_id()
            || self.writer() != origin.writer()
            || self.journal.format != origin.journal.format
            || self.journal.version != origin.journal.version
        {
            return Err(Error::Contract("shared recovery origin identity differs"));
        }
        if serde_json::to_vec(&self.journal.origin)? != serde_json::to_vec(&origin.journal.origin)?
            || self.journal.entries.len() < origin.journal.entries.len()
            || publication(&self.journal.publication)? < publication(&origin.journal.publication)?
        {
            return Err(Error::Contract("shared recovery origin lineage differs"));
        }
        for (before, current) in origin.journal.entries.iter().zip(&self.journal.entries) {
            if serde_json::to_vec(before)? != serde_json::to_vec(current)? {
                return Err(Error::Contract("shared recovery origin entry differs"));
            }
        }
        if let (Some(current), Some(before)) = (&self.typing, &origin.typing) {
            let boundary = u32::try_from(origin.journal.entries.len())
                .map_err(|_| Error::Limit("shared recovery origin entries"))?;
            if !current
                .joins
                .iter()
                .copied()
                .take_while(|index| *index < boundary)
                .eq(before.joins.iter().copied())
            {
                return Err(Error::Contract("shared recovery origin typing partition differs"));
            }
        }
        Ok(())
    }
}
