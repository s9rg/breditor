//! Search source proof tied to one live owner and exact causal content, not just a visible AST.
use super::super::{RichReplica, SharedObservation};
use crate::Error;
use breditor_core::rich_content::RichSearchResults;
use std::{fmt, sync::Arc};

/// Complete native matches owned by one live shared actor and causal basis.
///
/// UI-only changes may retain this read if mutation supplies the current exact
/// observation. A different/restored owner, new peer operations or Undo/Redo
/// reject it even when the visible text happens to be identical.
#[derive(Clone)]
pub struct SharedSearchResults {
    pub(super) owner: Arc<()>,
    pub(super) causal: String,
    pub(super) applied: loro::VersionVector,
    pub(super) core: RichSearchResults,
}
impl SharedSearchResults {
    /// Native complete match/capture/navigation values; this read grants no mutation authority.
    #[must_use]
    pub const fn results(&self) -> &RichSearchResults {
        &self.core
    }
    pub(super) fn validate(
        &self,
        owner: &RichReplica,
        observed: &SharedObservation,
    ) -> Result<(), Error> {
        owner.check(observed)?;
        if !Arc::ptr_eq(&self.owner, &owner.search_owner)
            || self.causal != owner.causal_version()
            || self.applied != owner.doc.state_vv()
        {
            return Err(Error::Contract("stale or foreign shared search source"));
        }
        self.core
            .validate_for(owner.document())
            .map_err(|_| Error::Contract("shared search source differs"))
    }
}
impl fmt::Debug for SharedSearchResults {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("SharedSearchResults")
            .field("matches", &self.core.matches().len())
            .finish_non_exhaustive()
    }
}
