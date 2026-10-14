//! All-or-nothing local action grouping; no history mutation before publication.

use super::{RichAction, RichActionError};
use crate::{rich_content::RichDocument, state::EditorContext};

/// One admitted local action group and its inverse actions in undo order.
#[derive(Clone, Debug)]
pub struct RichBatchEdit {
    before: RichDocument,
    document: RichDocument,
    inverse: Vec<RichAction>,
}

impl RichBatchEdit {
    /// Map a source selection through the complete admitted group, not partial steps.
    ///
    /// # Errors
    /// Rejects stale source selections, binding mismatches or unsupported text edits.
    pub fn map_selection(
        &self,
        selection: &crate::rich_content::RichSelection,
    ) -> Result<crate::rich_content::RichSelectionMapping, crate::rich_content::RichSelectionError>
    {
        let maps = self
            .inverse
            .iter()
            .rev()
            .filter_map(|inverse| {
                inverse.text_map().map(crate::rich_content::rich_text_mapping::RichTextMap::inverse)
            })
            .collect::<Result<Vec<_>, _>>()?;
        crate::rich_content::rich_selection_mapping::rebase_with_text_maps(
            &self.before,
            &self.document,
            selection,
            &maps,
        )
    }
    /// Fully admitted candidate, never an intermediate partially applied tree.
    #[must_use]
    pub const fn document(&self) -> &RichDocument {
        &self.document
    }
    /// Guarded inverse actions already ordered for undoing this whole group.
    #[must_use]
    pub fn inverse(&self) -> &[RichAction] {
        &self.inverse
    }
    /// Transfer the candidate and one inverse group to a local coordinator.
    #[must_use]
    pub fn into_parts(self) -> (RichDocument, Vec<RichAction>) {
        (self.document, self.inverse)
    }
}

/// Stage a bounded local group and publish a result only if every step succeeds.
///
/// Dependent actions must be planned/captured against their preceding staged
/// snapshot. Unchanged steps add no inverse. No-op/empty groups return `None`
/// only after current schema/policy admission. This does not implement a queue,
/// durable history or collaboration-owned undo, and never emits shared root JSON.
///
/// # Errors
/// Rejects oversized groups, incompatible documents, stale/missing targets or
/// host-policy violations. Even a late failure leaves the caller's document untouched.
pub fn apply_batch(
    context: &EditorContext,
    document: &RichDocument,
    actions: &[RichAction],
) -> Result<Option<RichBatchEdit>, RichActionError> {
    if actions.len()
        > usize::try_from(context.max_operations_per_transaction()).unwrap_or(usize::MAX)
    {
        return Err(RichActionError::TooManyActions);
    }
    let mut candidate =
        RichDocument::try_admit(context.schema(), document.document().clone(), context.limits())?;
    let mut inverse = Vec::new();
    for action in actions {
        if let Some(edit) = action.apply(context, &candidate)? {
            let (next, undo) = edit.into_parts();
            candidate = next;
            inverse.push(undo);
        }
    }
    if inverse.is_empty() {
        return Ok(None);
    }
    inverse.reverse();
    Ok(Some(RichBatchEdit { before: document.clone(), document: candidate, inverse }))
}
