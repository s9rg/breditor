//! Exact local node rewrite with stable identity, full-source guard and admission.

use super::{
    RichAction, RichActionError, RichEdit, guard::TargetGuard, rewrite_properties::replace_node,
};
use crate::{
    document::NodeRef,
    rich_content::{BlockId, RichDocument},
    state::EditorContext,
};

#[derive(Clone, Debug, Eq, PartialEq)]
pub(super) struct NodePatch {
    target: BlockId,
    guard: TargetGuard,
    expected: NodeRef,
    replacement: NodeRef,
}

impl NodePatch {
    pub(super) fn capture(
        document: &RichDocument,
        target: &BlockId,
        replacement: NodeRef,
    ) -> Result<Self, RichActionError> {
        let path = document.block_path(target).ok_or(RichActionError::MissingTarget)?;
        Ok(Self {
            target: target.clone(),
            guard: TargetGuard::capture(document, path)?,
            expected: document
                .document()
                .node_at(path)
                .map_err(|_| RichActionError::MissingTarget)?
                .clone(),
            replacement,
        })
    }
    pub(super) fn inverse(&self) -> Self {
        Self {
            target: self.target.clone(),
            guard: self.guard.clone(),
            expected: self.replacement.clone(),
            replacement: self.expected.clone(),
        }
    }
    pub(super) fn edit(
        &self,
        context: &EditorContext,
        document: &RichDocument,
        inverse: RichAction,
    ) -> Result<Option<RichEdit>, RichActionError> {
        let path = document.block_path(&self.target).ok_or(RichActionError::MissingTarget)?;
        self.guard.check(context, document, path)?;
        if document.document().node_at(path).map_err(|_| RichActionError::MissingTarget)?
            != &self.expected
        {
            return Err(RichActionError::StaleTarget);
        }
        let candidate = replace_node(context, document, path, &self.replacement)?;
        if candidate.document().root() == document.document().root() {
            return Ok(None);
        }
        Ok(Some(RichEdit { before: document.clone(), document: candidate, inverse }))
    }
}
