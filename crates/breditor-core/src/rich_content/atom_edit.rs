//! Snapshot-proved whole-atom edits. Recovery is logical, never DOM-selected.
use super::{
    BlockId, FlowMove, FlowNavigationOutcome, RichDocument, RichSelection, RichSelectionError,
    RichSelectionKind, navigate_flow, rich_selection::block,
};

/// Deletion intent with a proved surviving stop, or a required explicit paragraph.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AtomDeletionPlan {
    target: BlockId,
    recovery: Option<RichSelectionKind>,
}
impl AtomDeletionPlan {
    /// Whole image, visible table or rule to remove. Assets are not deleted.
    #[must_use]
    pub const fn target(&self) -> &BlockId {
        &self.target
    }
    /// Surviving logical stop; `None` requires a fresh empty paragraph at the old slot.
    #[must_use]
    pub const fn recovery(&self) -> Option<&RichSelectionKind> {
        self.recovery.as_ref()
    }
}

/// Prove a whole visible image/table/rule selection in an actual editable flow.
/// # Errors
/// Rejects foreign/stale proofs, text/grid/container selections and unsupported parents.
pub fn selected_flow_atom(
    document: &RichDocument,
    selection: &RichSelection,
) -> Result<BlockId, RichSelectionError> {
    selection.resolve(document)?;
    let RichSelectionKind::Node(id) = selection.kind() else {
        return Err(RichSelectionError::TargetKind);
    };
    if !matches!(
        block(document, id)?.kind().as_str(),
        "breditor/image" | "breditor/table" | "breditor/horizontal-rule"
    ) || document.flow_position_before(id).is_none()
    {
        return Err(RichSelectionError::TargetKind);
    }
    Ok(id.clone())
}

/// Plan whole-atom deletion, preferring the requested direction then its opposite.
///
/// A sole direct child always needs replacement even if an outer stop exists:
/// deletion must not empty a cell or quote. When hidden siblings leave no visible
/// stop inside their actual parent, recovery also requires a paragraph, even
/// when navigation could escape a quote. Otherwise a neighboring atom may
/// remain a node selection. Cells/captions retain the navigation domain boundary.
/// No identity allocation, mutation, normalization or asset-store work occurs.
/// # Errors
/// Invalid source proofs or contradictions of the admitted tree reject before editing.
pub fn plan_atom_deletion(
    document: &RichDocument,
    selection: &RichSelection,
    movement: FlowMove,
) -> Result<AtomDeletionPlan, RichSelectionError> {
    let target = selected_flow_atom(document, selection)?;
    let parent = document
        .block_path(&target)
        .and_then(crate::position::NodePath::parent)
        .ok_or(RichSelectionError::Invariant)?;
    let children = document
        .document()
        .node_at(&parent)
        .ok()
        .and_then(crate::document::NodeRef::as_element)
        .ok_or(RichSelectionError::Invariant)?
        .children();
    let mut recovery = None;
    let mut visible_sibling = false;
    if children.len() > 1 {
        let opposite = match movement {
            FlowMove::Before => FlowMove::After,
            FlowMove::After => FlowMove::Before,
        };
        for direction in [movement, opposite] {
            if let FlowNavigationOutcome::Moved(destination) =
                navigate_flow(document, selection, direction)?
            {
                let id = match destination.kind() {
                    RichSelectionKind::Node(id) => id,
                    RichSelectionKind::TextRange { focus, .. } => focus.block(),
                    RichSelectionKind::Grid { .. } | RichSelectionKind::Document => {
                        return Err(RichSelectionError::Invariant);
                    }
                };
                let path = document.block_path(id).ok_or(RichSelectionError::Invariant)?;
                visible_sibling |= path.as_slice().starts_with(parent.as_slice());
                if recovery.is_none() {
                    recovery = Some(destination.kind().clone());
                }
            }
        }
    }
    if !visible_sibling {
        recovery = None;
    }
    Ok(AtomDeletionPlan { target, recovery })
}
