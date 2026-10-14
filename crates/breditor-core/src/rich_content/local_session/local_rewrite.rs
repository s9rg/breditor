//! Smallest single guarded element branch for exact local restart history.
//!
//! A group changing several siblings may require a parent/root recipe. This is
//! local history only: it must never be translated into a shared JSON register.

use super::RichLocalSessionError;
use crate::{
    document::NodeRef,
    identity::QualifiedName,
    rich_content::{BlockId, RichDocument, actions::local_replay},
    state::EditorContext,
};

#[derive(Clone, Debug)]
pub(crate) struct LocalRewrite {
    pub(crate) target: Option<BlockId>,
    pub(crate) expected: NodeRef,
    pub(crate) replacement: NodeRef,
}

impl LocalRewrite {
    pub(super) fn between(before: &RichDocument, after: &RichDocument) -> Self {
        let (expected, replacement) = branch(before.document().root(), after.document().root());
        Self {
            target: block_id(expected),
            expected: expected.clone(),
            replacement: replacement.clone(),
        }
    }
    pub(super) fn inverse(&self) -> Self {
        Self {
            target: self.target.clone(),
            expected: self.replacement.clone(),
            replacement: self.expected.clone(),
        }
    }
    pub(super) fn apply(
        &self,
        context: &EditorContext,
        document: &RichDocument,
    ) -> Result<RichDocument, RichLocalSessionError> {
        // Target identity must survive the boundary. Insert/delete groups stop
        // at their retained parent, rather than targeting a disappearing child.
        if block_id(&self.expected) != self.target || block_id(&self.replacement) != self.target {
            return Err(RichLocalSessionError::HistoryMismatch);
        }
        let result = local_replay::apply(
            context,
            document,
            self.target.as_ref(),
            &self.expected,
            &self.replacement,
        )?;
        if result.document() == document.document() {
            return Err(RichLocalSessionError::HistoryMismatch);
        }
        Ok(result)
    }
}

fn block_id(node: &NodeRef) -> Option<BlockId> {
    let name = QualifiedName::try_new("breditor/block-id").ok()?;
    let value = node.as_element()?.properties().get(&name)?.as_string()?;
    BlockId::try_new(value).ok()
}

fn branch<'a>(before: &'a NodeRef, after: &'a NodeRef) -> (&'a NodeRef, &'a NodeRef) {
    let (Some(left), Some(right)) = (before.as_element(), after.as_element()) else {
        return (before, after);
    };
    if left.kind() != right.kind()
        || left.entity_id() != right.entity_id()
        || left.properties() != right.properties()
        || left.children().len() != right.children().len()
    {
        return (before, after);
    }
    let mut changed = left.children().iter().zip(right.children().iter()).filter(|(a, b)| a != b);
    let Some((child_before, child_after)) = changed.next() else { return (before, after) };
    if changed.next().is_some()
        || child_before.as_element().is_none()
        || child_after.as_element().is_none()
        || block_id(child_before) != block_id(child_after)
    {
        return (before, after);
    }
    branch(child_before, child_after)
}
