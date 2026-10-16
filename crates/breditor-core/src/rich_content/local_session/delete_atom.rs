//! Whole-atom deletion with native logical recovery and an exact original inverse.
use super::{
    RichLocalOutcome, RichLocalSession, RichLocalSessionError, RichLocalSnapshot,
    RichPendingFormatsUpdate, RichSelectionUpdate,
};
use crate::{
    document::TextFragment,
    position::{Affinity, TextOffset},
    rich_content::{
        BlockId, FlowMove, RichBlockDraft, RichSelectionError, RichSelectionKind, RichTextPoint,
        actions::{ReplaceBlocks, RichAction, RichActionError},
        plan_atom_deletion,
    },
};
impl RichLocalSession {
    /// Remove a selected whole image/table/rule and recover to an adjacent native stop.
    ///
    /// If its flow would be empty or has no visible stop, `paragraph` supplies a
    /// fresh plain floor at the atom's original slot. This identity is unused
    /// otherwise. One original replacement record retains the entire inverse;
    /// no image asset is removed. Pending typing styles are cleared explicitly.
    /// # Errors
    /// Stale/read-only, non-atoms, used floor IDs and active limits reject atomically.
    pub fn delete_atom(
        &mut self,
        snapshot: &RichLocalSnapshot,
        paragraph: &BlockId,
        movement: FlowMove,
    ) -> Result<RichLocalOutcome, RichLocalSessionError> {
        self.check(snapshot)?;
        self.require_writable()?;
        let source = self.state.selection.as_ref().ok_or(RichSelectionError::TargetKind)?;
        let plan = plan_atom_deletion(&self.state.document, source, movement)?;
        let (replacement, selection) = if let Some(recovery) = plan.recovery() {
            (vec![], recovery.clone())
        } else {
            if self.state.document.block_path(paragraph).is_some() {
                return Err(RichLocalSessionError::AtomIdentityReuse);
            }
            let draft = RichBlockDraft::paragraph(paragraph, &TextFragment::empty())
                .map_err(RichActionError::from)?;
            let point = RichTextPoint::new(paragraph.clone(), TextOffset::ZERO, Affinity::After);
            (vec![draft], RichSelectionKind::TextRange { anchor: point.clone(), focus: point })
        };
        let action = ReplaceBlocks::capture(
            &self.state.document,
            plan.target(),
            plan.target(),
            replacement,
        )?;
        self.dispatch_with_pending_formats(
            snapshot,
            &[RichAction::ReplaceBlocks(action)],
            RichSelectionUpdate::Set(Some(selection)),
            RichPendingFormatsUpdate::Set(None),
        )
    }
}
