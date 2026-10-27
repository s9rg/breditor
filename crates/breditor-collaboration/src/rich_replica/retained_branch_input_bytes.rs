//! Exact bounded input accounting for the explicit native branch operation.
use super::{RichReplica, SharedObservation, verify_retained_branch::compatible_local_prefix};
use crate::Error;
use std::collections::BTreeSet;
impl RichReplica {
    /// Count unique source input blobs not already retained verbatim by this target.
    /// This is an attempted-input budget, not an acknowledgement, author grant or
    /// claim that every counted input will produce new visible operations. No owner changes.
    /// # Errors
    /// Stale observations, incompatible own histories or a byte-count overflow reject.
    pub fn retained_branch_input_bytes_guarded(
        &self,
        observed: &SharedObservation,
        source: &Self,
        source_observed: &SharedObservation,
    ) -> Result<usize, Error> {
        self.check(observed)?;
        source.check(source_observed)?;
        compatible_local_prefix(self, source)?;
        let held: BTreeSet<&[u8]> = self.journal.retained_updates().collect();
        let incoming: BTreeSet<&[u8]> =
            source.journal.retained_updates().filter(|bytes| !held.contains(bytes)).collect();
        incoming.into_iter().try_fold(0_usize, |total, bytes| {
            total
                .checked_add(bytes.len())
                .ok_or(Error::Limit("retained branch incoming input bytes"))
        })
    }
}
