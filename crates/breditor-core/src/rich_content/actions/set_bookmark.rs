//! Guarded candidate-V4 bookmark set/clear and link-preserving rename.
//!
//! One action is one ordered list of guarded node patches applied as a single
//! admitted edit with one exact inverse, so a rename that also rewrites every
//! referencing internal link is one history group.
use super::{
    RichAction, RichActionError, RichEdit, node_patch::NodePatch,
    rewrite_properties::with_properties, text_patch::block_node,
};
use crate::{
    document::PropertyValue,
    rich_content::{
        BlockId, RichBookmarkError, RichBookmarkName, RichDocument,
        bookmark::{self, BOOKMARK},
    },
    state::EditorContext,
};

/// Exact local bookmark edit over one or more text blocks, with guards and inverse.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SetBookmark {
    patches: Vec<NodePatch>,
}

impl SetBookmark {
    /// Set, replace or clear (`None`) the bookmark of one paragraph, heading or code block.
    ///
    /// Links are never rewritten here: replacing or clearing a referenced name leaves
    /// its links dangling (reported by [`crate::rich_content::RichBookmarkIndex`]).
    /// Use [`Self::rename`] to keep links attached.
    /// # Errors
    /// Rejects absent or non-text blocks ([`RichBookmarkError::Target`]) and a name that
    /// another block already carries ([`RichBookmarkError::Duplicate`]). Rich V4 proof
    /// and active limits are checked on apply.
    pub fn capture(
        document: &RichDocument,
        block: &BlockId,
        name: Option<&RichBookmarkName>,
    ) -> Result<Self, RichActionError> {
        let node = block_node(document, block).map_err(|_| RichBookmarkError::Target)?;
        let element = node.as_element().ok_or(RichBookmarkError::Target)?;
        if !bookmark::supports_kind(element.kind().as_str()) {
            return Err(RichBookmarkError::Target.into());
        }
        if let Some(name) = name
            && bookmark::RichBookmarkIndex::scan(document)
                .block_of(name.as_str())
                .is_some_and(|holder| holder != block)
        {
            return Err(RichBookmarkError::Duplicate.into());
        }
        let replacement = with_properties(
            node,
            [(BOOKMARK, name.map(|name| PropertyValue::from_string(name.as_str())))],
        )?;
        Ok(Self { patches: vec![NodePatch::capture(document, block, replacement)?] })
    }

    /// Rename bookmark `from` to `to` and retarget every internal link `#from` to `#to`.
    ///
    /// The anchor keeps its block; links in every text block (paragraphs, headings,
    /// section summaries, captions, cells) follow in the same edit. `from == to` is an
    /// admitted exact no-op.
    /// # Errors
    /// Rejects an absent `from` ([`RichBookmarkError::Missing`]) and a `to` that another
    /// block already carries ([`RichBookmarkError::Duplicate`]).
    pub fn rename(
        document: &RichDocument,
        from: &RichBookmarkName,
        to: &RichBookmarkName,
    ) -> Result<Self, RichActionError> {
        let index = bookmark::RichBookmarkIndex::scan(document);
        let holder = index.block_of(from.as_str()).ok_or(RichBookmarkError::Missing)?.clone();
        if from == to {
            return Ok(Self { patches: vec![] });
        }
        if index.block_of(to.as_str()).is_some() {
            return Err(RichBookmarkError::Duplicate.into());
        }
        let mut patches = Vec::new();
        let mut holder_done = false;
        for block in bookmark::referencing_blocks(document, from.as_str()) {
            let node = block_node(document, &block)?;
            let mut replacement = bookmark::retarget_block(node, from.as_str(), to)
                .ok_or(RichActionError::Rewrite)?;
            if block == holder {
                replacement = with_properties(
                    &replacement,
                    [(BOOKMARK, Some(PropertyValue::from_string(to.as_str())))],
                )?;
                holder_done = true;
            }
            patches.push(NodePatch::capture(document, &block, replacement)?);
        }
        if !holder_done {
            let node = block_node(document, &holder)?;
            let replacement =
                with_properties(node, [(BOOKMARK, Some(PropertyValue::from_string(to.as_str())))])?;
            patches.push(NodePatch::capture(document, &holder, replacement)?);
        }
        Ok(Self { patches })
    }

    /// Publish the whole edit or an exact no-op; original profiles never widen.
    /// # Errors
    /// Rejects non-V4 context, stale sources and complete-tree resource/policy failures.
    pub fn apply(
        &self,
        context: &EditorContext,
        document: &RichDocument,
    ) -> Result<Option<RichEdit>, RichActionError> {
        if !context.schema().supports_rich_bookmarks() {
            return Err(RichBookmarkError::Profile.into());
        }
        if self.patches.is_empty() {
            // An admitted exact no-op still proves the source belongs to this context.
            if !document.document().is_proven_for(context.schema(), context.limits()) {
                return Err(RichBookmarkError::Profile.into());
            }
            return Ok(None);
        }
        let mut current = document.clone();
        let mut applied = Vec::new();
        for patch in &self.patches {
            let placeholder = RichAction::SetBookmark(Self { patches: vec![] });
            if let Some(edit) = patch.edit(context, &current, placeholder)? {
                current = edit.document;
                applied.push(patch.inverse());
            }
        }
        if applied.is_empty() {
            return Ok(None);
        }
        applied.reverse();
        Ok(Some(RichEdit {
            before: document.clone(),
            document: current,
            inverse: RichAction::SetBookmark(Self { patches: applied }),
        }))
    }
}
