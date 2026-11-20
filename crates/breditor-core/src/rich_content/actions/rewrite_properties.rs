//! One persistent branch rewrite followed by complete AST/policy admission.

use super::RichActionError;
use crate::rich_content::RichDocument;
use crate::{
    document::{Document, ElementNode, NodeRef, PropertyMap, PropertyValue},
    identity::QualifiedName,
    position::NodePath,
    state::EditorContext,
};
use std::collections::BTreeMap;

fn replace(
    node: &NodeRef,
    path: &[u32],
    replacement: &NodeRef,
) -> Result<NodeRef, RichActionError> {
    let element = node.as_element().ok_or(RichActionError::Rewrite)?;
    let Some((index, rest)) = path.split_first() else {
        return Ok(replacement.clone());
    };
    let mut children = element.children().to_vec();
    let child = children
        .get_mut(usize::try_from(*index).map_err(|_| RichActionError::Rewrite)?)
        .ok_or(RichActionError::Rewrite)?;
    *child = replace(child, rest, replacement)?;
    Ok(NodeRef::element(element.try_with_children(children).map_err(|_| RichActionError::Rewrite)?))
}

pub(super) fn rewrite(
    context: &EditorContext,
    document: &RichDocument,
    path: &NodePath,
    changes: impl IntoIterator<Item = (&'static str, Option<PropertyValue>)>,
) -> Result<RichDocument, RichActionError> {
    let node = document.document().node_at(path).ok().ok_or(RichActionError::Rewrite)?;
    let replacement = with_properties(node, changes)?;
    replace_node(context, document, path, &replacement)
}

pub(crate) fn with_properties(
    node: &NodeRef,
    changes: impl IntoIterator<Item = (&'static str, Option<PropertyValue>)>,
) -> Result<NodeRef, RichActionError> {
    let element = node.as_element().ok_or(RichActionError::Rewrite)?;
    let mut properties: BTreeMap<_, _> =
        element.properties().iter().map(|(name, value)| (name.clone(), value.clone())).collect();
    for (local, value) in changes {
        let name = QualifiedName::try_new(format!("breditor/{local}"))
            .map_err(|_| RichActionError::Rewrite)?;
        if let Some(value) = value {
            properties.insert(name, value);
        } else {
            properties.remove(&name);
        }
    }
    let properties = PropertyMap::try_from_sorted(properties.into_iter().collect())
        .map_err(|_| RichActionError::Rewrite)?;
    Ok(NodeRef::element(
        ElementNode::try_new(
            element.kind().clone(),
            element.entity_id().cloned(),
            properties,
            element.children().to_vec(),
        )
        .map_err(|_| RichActionError::Rewrite)?,
    ))
}

pub(super) fn replace_node(
    context: &EditorContext,
    document: &RichDocument,
    path: &NodePath,
    replacement: &NodeRef,
) -> Result<RichDocument, RichActionError> {
    let root = replace(document.document().root(), &path.to_vec(), replacement)?;
    let candidate = Document::try_new(context.schema(), root, context.limits())?;
    Ok(RichDocument::try_admit(context.schema(), candidate, context.limits())?)
}

pub(super) fn integer(value: u32) -> Result<PropertyValue, RichActionError> {
    Ok(PropertyValue::from_integer(
        crate::document::PropertyInteger::try_new(i64::from(value))
            .map_err(|_| RichActionError::Rewrite)?,
    ))
}

/// Kind changes and new split heads inherit only the explicit bounded layout fields.
pub(super) fn inherit_layout(
    source: &NodeRef,
    replacement: NodeRef,
) -> Result<NodeRef, RichActionError> {
    let source = source.as_element().ok_or(RichActionError::Rewrite)?;
    let changes = ["block-align", "block-direction", "block-indent", "line-height-percent"]
        .map(|name| (name, crate::rich_content::ast_properties::property(source, name).cloned()));
    if changes.iter().all(|(_, value)| value.is_none()) {
        return Ok(replacement);
    }
    with_properties(&replacement, changes)
}

/// Kind changes (paragraph, heading, code block) keep the block's V4 bookmark name.
/// Split heads never call this: a bookmark stays with the identity that kept it.
pub(super) fn inherit_bookmark(
    source: &NodeRef,
    replacement: NodeRef,
) -> Result<NodeRef, RichActionError> {
    let source = source.as_element().ok_or(RichActionError::Rewrite)?;
    let Some(name) = crate::rich_content::ast_properties::property(
        source,
        crate::rich_content::bookmark::BOOKMARK,
    ) else {
        return Ok(replacement);
    };
    with_properties(&replacement, [(crate::rich_content::bookmark::BOOKMARK, Some(name.clone()))])
}
