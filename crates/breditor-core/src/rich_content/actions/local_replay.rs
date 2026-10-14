//! Exact local durable branch replay, never a shared replication operation.

use super::{RichActionError, rewrite_properties::replace_node};
use crate::{
    document::NodeRef,
    position::NodePath,
    rich_content::{BlockId, RichDocument},
    state::EditorContext,
};

pub(crate) fn apply(
    context: &EditorContext,
    document: &RichDocument,
    target: Option<&BlockId>,
    expected: &NodeRef,
    replacement: &NodeRef,
) -> Result<RichDocument, RichActionError> {
    let root_path = NodePath::root();
    let path = match target {
        Some(id) => document.block_path(id).ok_or(RichActionError::MissingTarget)?,
        None => &root_path,
    };
    if document.document().node_at(path).map_err(|_| RichActionError::MissingTarget)? != expected {
        return Err(RichActionError::StaleTarget);
    }
    let result = replace_node(context, document, path, replacement)?;
    if result.id() != document.id() {
        return Err(RichActionError::StaleTarget);
    }
    Ok(result)
}
