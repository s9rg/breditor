//! Pure freshness/actor proof for SDK presentation without trying an edit.
use super::{
    super::{RichReplica, SharedObservation},
    SharedSearchResults,
};
use crate::Error;
impl RichReplica {
    /// Validate live actor, complete source and both causal bases under a current observation.
    /// UI-only changes may retain the result. This read is available to read-only owners.
    /// # Errors
    /// Rejects stale/foreign observations or results, without publication or history changes.
    pub fn validate_search_results_guarded(
        &self,
        observed: &SharedObservation,
        results: &SharedSearchResults,
    ) -> Result<(), Error> {
        results.validate(self, observed)
    }
}
