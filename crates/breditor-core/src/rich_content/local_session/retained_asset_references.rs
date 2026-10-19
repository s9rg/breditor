//! Exact local current/Undo/Redo image references; never mutate or walk history by dispatching it.
use super::{RichLocalSession, RichLocalSnapshot};
use crate::rich_content::{
    RichAssetReference, RichAssetReferenceError, asset_references::collect_document,
};
use std::collections::BTreeSet;

impl RichLocalSession {
    /// Union current content and every retained before/after state, including the Redo branch.
    ///
    /// Reads support read-only owners and leave history, selection, typing continuation and the
    /// observation intact. Dropped history is outside this owner's reach; saved versions, queued
    /// proposals and other owners require their own inventories. This is not a GC permit.
    /// # Errors
    /// Rejects stale/foreign observations, native contradictions or complete-result overflow.
    pub fn retained_asset_references(
        &self,
        observed: &RichLocalSnapshot,
    ) -> Result<Vec<RichAssetReference>, RichAssetReferenceError> {
        self.check_observation(observed).map_err(|_| RichAssetReferenceError::Observation)?;
        let mut output = BTreeSet::new();
        collect_document(self.state.document(), &mut output)?;
        for entry in &self.entries {
            collect_document(entry.before.document(), &mut output)?;
            collect_document(entry.after.document(), &mut output)?;
        }
        Ok(output.into_iter().collect())
    }
}
