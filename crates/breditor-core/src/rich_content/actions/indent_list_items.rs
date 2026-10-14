//! Indent a contiguous item range, retaining each complete rich body and identity.

use super::{
    OutdentListItems, RichAction, RichActionError, RichEdit,
    branch_patch::BranchPatch,
    list_helpers::{children, id, interval, list_node, with_children},
    node_patch::NodePatch,
};
use crate::{
    rich_content::{BlockId, RichDocument, RichListKind},
    state::EditorContext,
};

/// Exact guarded rich-list indentation, with an explicit new nested-list draft identity when needed.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct IndentListItems {
    patch: BranchPatch,
}

impl IndentListItems {
    /// Move selected items into the preceding item's trailing compatible nested list.
    ///
    /// If no compatible trailing list exists, supply its fresh ID and explicit kind/start.
    /// If one exists, `new_nested` must be `None`; its existing numbering is retained.
    ///
    /// # Errors
    /// Rejects absent/reversed items, the first item, unused/missing draft IDs or incompatible style.
    pub fn capture(
        document: &RichDocument,
        container: &BlockId,
        first: &BlockId,
        last: &BlockId,
        new_nested: Option<(BlockId, RichListKind)>,
    ) -> Result<Self, RichActionError> {
        let source = list_node(document, container)?;
        let kind = RichListKind::from_node(source)?;
        let (first, last) = interval(source, first, last)?;
        let previous = first.checked_sub(1).ok_or(RichActionError::ListBoundary)?;
        let mut items = children(source)?.to_vec();
        let selected = items[first..=last].to_vec();
        let parent = items[previous].clone();
        let mut body = children(&parent)?.to_vec();
        let existing =
            body.last().and_then(|node| RichListKind::from_node(node).ok()).filter(|nested| {
                matches!(
                    (kind, nested),
                    (RichListKind::Bullet, RichListKind::Bullet)
                        | (RichListKind::Ordered(_), RichListKind::Ordered(_))
                )
            });
        if let Some(nested_kind) = existing {
            if new_nested.is_some() {
                return Err(RichActionError::ListShape);
            }
            let old = body.pop().ok_or(RichActionError::ListShape)?;
            let mut nested = children(&old)?.to_vec();
            nested.extend(selected);
            body.push(nested_kind.node(&id(&old)?, nested)?);
        } else {
            let (nested_id, nested_kind) = new_nested.ok_or(RichActionError::ListShape)?;
            if !matches!(
                (kind, nested_kind),
                (RichListKind::Bullet, RichListKind::Bullet)
                    | (RichListKind::Ordered(_), RichListKind::Ordered(_))
            ) {
                return Err(RichActionError::ListShape);
            }
            body.push(nested_kind.node(&nested_id, selected)?);
        }
        items[previous] = with_children(&parent, body)?;
        items.drain(first..=last);
        Ok(Self {
            patch: BranchPatch::Node(NodePatch::capture(
                document,
                container,
                with_children(source, items)?,
            )?),
        })
    }
    pub(super) fn from_inverse(patch: BranchPatch) -> Self {
        Self { patch }
    }
    /// Publish one complete indentation and exact outdent restoration.
    ///
    /// # Errors
    /// Rejects stale lists, duplicate IDs, ordinal overflow or active host policy.
    pub fn apply(
        &self,
        context: &EditorContext,
        document: &RichDocument,
    ) -> Result<Option<RichEdit>, RichActionError> {
        self.patch.edit(
            context,
            document,
            RichAction::OutdentListItems(OutdentListItems::from_inverse(self.patch.inverse())),
        )
    }
}
