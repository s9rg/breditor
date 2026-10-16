//! One guarded whole-root rich paste with native re-keying, admission and a defined final caret.
use super::{
    RichClipboardError, RichClipboardFragment, RichClipboardIdAllocator, RichClipboardKind, rekey,
};
use crate::{
    document::TextFragment,
    position::{Affinity, TextOffset},
    rich_content::{
        BlockId, RichBlockDraft, RichDocument, RichTextPoint,
        actions::{ReplaceDocument, RichAction},
    },
    state::EditorContext,
};
/// Pure prepared intent, not published content or a replicated root-register replacement.
#[derive(Clone, Debug)]
pub struct RichDocumentClipboardPlan {
    action: RichAction,
    document: RichDocument,
    caret: RichTextPoint,
}
impl RichDocumentClipboardPlan {
    /// Re-key every clipboard identity while excluding all current receiving identities, including
    /// nodes that this replacement will remove. Text retains formats in one fresh paragraph;
    /// flow/grid retains all blocks and appends a fresh plain paragraph after them.
    /// # Errors
    /// Kind/schema, allocation/source/target reuse, draft or final resource failures reject the plan.
    /// Allocations remain consumed even after failure. Historical uniqueness is also host-owned.
    pub fn capture(
        context: &EditorContext,
        target: &RichDocument,
        clipboard: &RichClipboardFragment,
        allocator: &mut dyn RichClipboardIdAllocator,
    ) -> Result<Self, RichClipboardError> {
        let fresh = rekey::prepare_avoiding(context, clipboard, Some(target), allocator)?;
        let root =
            fresh.document.document().root().as_element().ok_or(RichClipboardError::Invariant)?;
        let mut blocks: Vec<_> =
            root.children().iter().cloned().map(RichBlockDraft::from_node).collect();
        let caret = if clipboard.kind == RichClipboardKind::Text {
            let node = root
                .children()
                .get(0)
                .and_then(crate::document::NodeRef::as_element)
                .ok_or(RichClipboardError::Invariant)?;
            let id = BlockId::try_new(
                super::super::ast_properties::string(node, "block-id")
                    .map_err(|_| RichClipboardError::Invariant)?,
            )
            .map_err(|_| RichClipboardError::Invariant)?;
            RichTextPoint::new(id, fresh.text_fragment(context)?.utf16_len(), Affinity::After)
        } else {
            let id = rekey::fresh_document_floor(target, clipboard, &fresh, allocator)?;
            blocks.push(RichBlockDraft::paragraph(&id, &TextFragment::empty())?);
            RichTextPoint::new(id, TextOffset::ZERO, Affinity::After)
        };
        let action = RichAction::ReplaceDocument(ReplaceDocument::capture(target, blocks)?);
        let document =
            action.apply(context, target)?.ok_or(RichClipboardError::Invariant)?.document().clone();
        Ok(Self { action, document, caret })
    }
    /// Exact native action with its source guard and inverse recipe.
    #[must_use]
    pub const fn action(&self) -> &RichAction {
        &self.action
    }
    /// Fully admitted result, suitable for checking a shared primitive lowering.
    #[must_use]
    pub const fn document(&self) -> &RichDocument {
        &self.document
    }
    /// Collapsed caret at inserted text's end or the fresh paragraph following rich flow.
    #[must_use]
    pub const fn insertion_end(&self) -> &RichTextPoint {
        &self.caret
    }
}
