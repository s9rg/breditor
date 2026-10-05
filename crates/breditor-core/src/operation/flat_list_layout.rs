//! Explicit root layout, independent of the text replacement payload.
use super::{FlatListTextReplaceError, block_kind};
use crate::{
    block::ListKind,
    document::{ElementNode, NodeRef, PropertyInteger, PropertyMap, PropertyValue},
    identity::QualifiedName,
};

#[cfg(test)]
#[path = "flat_list_layout_reuse_tests.rs"]
mod reuse_tests;

/// One root in the result of an experimental flat-list structural replacement.
///
/// Shapes consume the resulting text blocks in order exactly once. A bare root
/// consumes one block; a list consumes its positive item count. No indexes,
/// duplicate block references, nested items or implicit numbering are accepted.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
#[non_exhaustive]
pub enum FlatListRootShape {
    /// One paragraph or heading directly under the document root.
    TextBlock,
    /// A flat container with one paragraph/heading per item.
    List {
        /// Bullet markers or an explicit checked ordered start.
        kind: ListKind,
        /// Positive number of consecutive result blocks owned by this list.
        items: u32,
    },
}

pub(super) fn build(
    layout: &[FlatListRootShape],
    blocks: &[NodeRef],
    source_roots: &[NodeRef],
) -> Result<Vec<NodeRef>, FlatListTextReplaceError> {
    if layout.is_empty() {
        return Err(FlatListTextReplaceError::InvalidLayout);
    }
    let mut cursor = 0_usize;
    let mut roots = Vec::new();
    for (root_index, shape) in layout.iter().enumerate() {
        let count = match shape {
            FlatListRootShape::TextBlock => 1,
            FlatListRootShape::List { items, .. } => {
                usize::try_from(*items).map_err(|_| FlatListTextReplaceError::InvalidLayout)?
            }
        };
        if count == 0 {
            return Err(FlatListTextReplaceError::InvalidLayout);
        }
        let end = cursor.checked_add(count).ok_or(FlatListTextReplaceError::InvalidLayout)?;
        let chunk = blocks.get(cursor..end).ok_or(FlatListTextReplaceError::InvalidLayout)?;
        match shape {
            FlatListRootShape::TextBlock => roots.push(chunk[0].clone()),
            FlatListRootShape::List { kind, .. } => {
                roots.push(list(*kind, chunk, source_roots.get(root_index))?);
            }
        }
        cursor = end;
    }
    if cursor != blocks.len() {
        return Err(FlatListTextReplaceError::InvalidLayout);
    }
    Ok(roots)
}
fn list(
    kind: ListKind,
    blocks: &[NodeRef],
    source: Option<&NodeRef>,
) -> Result<NodeRef, FlatListTextReplaceError> {
    let (name, properties) = match kind {
        ListKind::Bullet => ("breditor/bullet-list", PropertyMap::default()),
        ListKind::Ordered(start) => {
            let last = u32::try_from(blocks.len() - 1)
                .map_err(|_| FlatListTextReplaceError::InvalidLayout)?;
            start.ordinal_at(last).ok_or(FlatListTextReplaceError::OrdinalOverflow)?;
            (
                "breditor/ordered-list",
                PropertyMap::try_from_sorted(vec![(
                    QualifiedName::from_known_static("breditor/start"),
                    PropertyValue::from_integer(
                        PropertyInteger::try_new(i64::from(start.get()))
                            .map_err(|_| FlatListTextReplaceError::InvalidLayout)?,
                    ),
                )])
                .map_err(|_| FlatListTextReplaceError::InvalidLayout)?,
            )
        }
    };
    let source = source.and_then(NodeRef::as_element).filter(|node| {
        matches!(node.kind().as_str(), "breditor/bullet-list" | "breditor/ordered-list")
    });
    let children = blocks
        .iter()
        .enumerate()
        .map(|(index, block)| list_item(block, source.and_then(|node| node.children().get(index))))
        .collect::<Result<Vec<_>, _>>()?;
    element(name, properties, children)
}

/// Reuse only an item semantically identical to the canonical wrapper we would
/// construct. A same-position source is merely a candidate: split/join layouts
/// may move blocks, and unvalidated input may carry forbidden metadata. Shape,
/// identity, properties and the complete block must all match. Pointer identity
/// never changes admission; result/source validation and inverse checks remain
/// the caller's responsibility. There is no cache beyond this derivation.
fn list_item(
    block: &NodeRef,
    source: Option<&NodeRef>,
) -> Result<NodeRef, FlatListTextReplaceError> {
    if let Some(source) = source
        && source.as_element().is_some_and(|item| {
            item.kind().as_str() == "breditor/list-item"
                && item.entity_id().is_none()
                && item.properties().is_empty()
                && item.children().len() == 1
                && item.children().get(0) == Some(block)
        })
    {
        return Ok(source.clone());
    }
    element("breditor/list-item", PropertyMap::default(), vec![block.clone()])
}
fn element(
    name: &'static str,
    properties: PropertyMap,
    children: Vec<NodeRef>,
) -> Result<NodeRef, FlatListTextReplaceError> {
    ElementNode::try_new(QualifiedName::from_known_static(name), None, properties, children)
        .map(NodeRef::element)
        .map_err(|_| FlatListTextReplaceError::InvalidLayout)
}
pub(super) fn capture(
    roots: &[NodeRef],
) -> Result<Vec<FlatListRootShape>, FlatListTextReplaceError> {
    roots
        .iter()
        .map(|node| {
            if block_kind(node).is_ok() {
                return Ok(FlatListRootShape::TextBlock);
            }
            let root = node.as_element().ok_or(FlatListTextReplaceError::InvalidTarget)?;
            let kind = match root.kind().as_str() {
                "breditor/bullet-list" => ListKind::Bullet,
                "breditor/ordered-list" => {
                    let value = root
                        .properties()
                        .get(&QualifiedName::from_known_static("breditor/start"))
                        .and_then(PropertyValue::as_integer)
                        .and_then(|value| u32::try_from(value.get()).ok())
                        .and_then(|value| crate::block::OrderedListStart::try_new(value).ok())
                        .ok_or(FlatListTextReplaceError::InvalidTarget)?;
                    ListKind::Ordered(value)
                }
                _ => return Err(FlatListTextReplaceError::InvalidTarget),
            };
            Ok(FlatListRootShape::List {
                kind,
                items: u32::try_from(root.children().len())
                    .map_err(|_| FlatListTextReplaceError::InvalidTarget)?,
            })
        })
        .collect()
}
