//! Exact local flow-branch splice, addressed by stable parent and sibling identities.

use super::{
    RichAction, RichActionError, RichEdit, guard::DocumentGuard, rewrite_properties::replace_node,
};
use crate::{
    document::NodeRef,
    rich_content::{
        BlockId, RichBlockDraft, RichDocument, RichFlowParent, RichFlowPosition, ast_properties,
    },
    state::EditorContext,
};

#[derive(Clone, Debug, Eq, PartialEq)]
pub(super) struct FlowPatch {
    scope: DocumentGuard,
    parent: RichFlowParent,
    expected: NodeRef,
    replacement: NodeRef,
}

fn node_at_parent<'a>(
    document: &'a RichDocument,
    parent: &RichFlowParent,
) -> Result<&'a NodeRef, RichActionError> {
    let path = parent.path(document).ok_or(RichActionError::FlowParent)?;
    document.document().node_at(&path).map_err(|_| RichActionError::MissingTarget)
}

impl FlowPatch {
    pub(super) fn rewrite_children(
        document: &RichDocument,
        parent: &RichFlowParent,
        children: Vec<NodeRef>,
    ) -> Result<Self, RichActionError> {
        let expected = node_at_parent(document, parent)?;
        let replacement = NodeRef::element(
            expected
                .as_element()
                .ok_or(RichActionError::Rewrite)?
                .try_with_children(children)
                .map_err(|_| RichActionError::Rewrite)?,
        );
        Ok(Self {
            scope: DocumentGuard::capture(document),
            parent: parent.clone(),
            expected: expected.clone(),
            replacement,
        })
    }
    pub(super) fn insert(
        document: &RichDocument,
        position: &RichFlowPosition,
        node: NodeRef,
    ) -> Result<Self, RichActionError> {
        let expected = node_at_parent(document, position.parent())?;
        let element = expected.as_element().ok_or(RichActionError::Rewrite)?;
        let mut children = element.children().to_vec();
        let index = position.before().map_or(Ok(children.len()), |id| {
            children
                .iter()
                .position(|node| {
                    node.as_element().and_then(|node| ast_properties::string(node, "block-id").ok())
                        == Some(id.as_str())
                })
                .ok_or(RichActionError::MissingTarget)
        })?;
        children.insert(index, node);
        let replacement = NodeRef::element(
            element.try_with_children(children).map_err(|_| RichActionError::Rewrite)?,
        );
        Ok(Self {
            scope: DocumentGuard::capture(document),
            parent: position.parent().clone(),
            expected: expected.clone(),
            replacement,
        })
    }

    pub(super) fn remove(
        document: &RichDocument,
        target: &BlockId,
        replacement: Option<RichBlockDraft>,
    ) -> Result<Self, RichActionError> {
        let path = document.block_path(target).ok_or(RichActionError::MissingTarget)?;
        let parent_path = path.parent().ok_or(RichActionError::FlowParent)?;
        let parent =
            RichFlowParent::at_path(document, &parent_path).ok_or(RichActionError::FlowParent)?;
        let index = usize::try_from(path.last_index().ok_or(RichActionError::Rewrite)?)
            .map_err(|_| RichActionError::Rewrite)?;
        let expected = node_at_parent(document, &parent)?;
        let element = expected.as_element().ok_or(RichActionError::Rewrite)?;
        let mut children = element.children().to_vec();
        children.remove(index);
        if let Some(replacement) = replacement {
            children.insert(index, replacement.into_node());
        }
        if children.is_empty() {
            return Err(RichActionError::FlowWouldBeEmpty);
        }
        let replacement = NodeRef::element(
            element.try_with_children(children).map_err(|_| RichActionError::Rewrite)?,
        );
        Ok(Self {
            scope: DocumentGuard::capture(document),
            parent,
            expected: expected.clone(),
            replacement,
        })
    }

    pub(super) fn inverse(&self) -> Self {
        Self {
            scope: self.scope.clone(),
            parent: self.parent.clone(),
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
        self.scope.check(context, document)?;
        let path = self.parent.path(document).ok_or(RichActionError::MissingTarget)?;
        if document.document().node_at(&path).map_err(|_| RichActionError::MissingTarget)?
            != &self.expected
        {
            return Err(RichActionError::StaleTarget);
        }
        let candidate = replace_node(context, document, &path, &self.replacement)?;
        if candidate.document().root() == document.document().root() {
            return Ok(None);
        }
        Ok(Some(RichEdit { before: document.clone(), document: candidate, inverse }))
    }
}
