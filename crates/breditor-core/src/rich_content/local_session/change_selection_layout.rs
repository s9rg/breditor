//! Native coverage owns text-block targets; no caller interval or property map is accepted.
use super::{
    RichLocalOutcome, RichLocalSession, RichLocalSessionError, RichLocalSnapshot,
    RichSelectionUpdate,
};
use crate::rich_content::{
    RichBlockLayoutError, RichBlockLayoutPatch, RichSelectionCoverage,
    actions::{RichAction, RichActionError, SetBlockLayout},
};
impl RichLocalSession {
    /// Patch every covered text block, including empty boundaries and code, in one history unit.
    ///
    /// A caret changes block metadata, not pending inline formats. Node/grid coverage
    /// retains captions and original base-cell domains. No selection or an atom
    /// with no text target rejects instead of inventing a block or default style.
    /// # Errors
    /// Stale/read-only, non-V3 context, no text targets or any action/resource failure is atomic.
    pub fn change_selection_layout(
        &mut self,
        snapshot: &RichLocalSnapshot,
        patch: &RichBlockLayoutPatch,
    ) -> Result<RichLocalOutcome, RichLocalSessionError> {
        self.check(snapshot)?;
        self.require_writable()?;
        if !self.context.schema().supports_rich_block_layout() {
            return Err(RichActionError::from(RichBlockLayoutError::Profile).into());
        }
        let selection = self.state.selection.as_ref().ok_or(RichActionError::SelectionKind)?;
        let coverage = RichSelectionCoverage::capture(&self.state.document, selection)?;
        // A V4 section summary carries no block layout and is skipped.
        let spans: Vec<_> = coverage
            .text()
            .iter()
            .filter(|span| crate::rich_content::block_layout::supports_kind(span.kind().as_str()))
            .collect();
        if spans.is_empty() {
            return Err(RichActionError::SelectionKind.into());
        }
        if spans.len()
            > usize::try_from(self.context.max_operations_per_transaction()).unwrap_or(usize::MAX)
        {
            return Err(RichActionError::TooManyActions.into());
        }
        let actions = spans
            .into_iter()
            .map(|span| {
                SetBlockLayout::capture(&self.state.document, span.block(), patch)
                    .map(RichAction::SetBlockLayout)
            })
            .collect::<Result<Vec<_>, _>>()?;
        self.dispatch(snapshot, &actions, RichSelectionUpdate::Map)
    }
}
