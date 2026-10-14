//! Rich list drafts with explicit identities, leading text and retained trailing flow.

use super::{BlockId, RichBlockDraft, RichDraftError, ast_properties, drafts::element};
use crate::{
    block::OrderedListStart,
    document::{NodeRef, PropertyInteger, PropertyValue},
};

/// Checked list presentation kind; numbered starts use the existing positive ordinal contract.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum RichListKind {
    /// Bulleted list, without numbered metadata.
    Bullet,
    /// Numbered list with an explicit checked starting ordinal.
    Ordered(OrderedListStart),
}

impl RichListKind {
    pub(crate) fn from_node(node: &NodeRef) -> Result<Self, RichDraftError> {
        let node = node.as_element().ok_or(RichDraftError::ListShape)?;
        match node.kind().as_str() {
            "breditor/bullet-list" => Ok(Self::Bullet),
            "breditor/ordered-list" => {
                let start = ast_properties::property(node, "start")
                    .and_then(PropertyValue::as_integer)
                    .ok_or(RichDraftError::ListShape)?
                    .get();
                Ok(Self::Ordered(
                    OrderedListStart::try_new(
                        u32::try_from(start).map_err(|_| RichDraftError::ListOrdinal)?,
                    )
                    .map_err(|_| RichDraftError::ListOrdinal)?,
                ))
            }
            _ => Err(RichDraftError::ListShape),
        }
    }
    pub(crate) fn shifted(self, offset: usize) -> Result<Self, RichDraftError> {
        match self {
            Self::Bullet => Ok(self),
            Self::Ordered(start) => Ok(Self::Ordered(
                OrderedListStart::try_new(
                    start
                        .ordinal_at(u32::try_from(offset).map_err(|_| RichDraftError::ListOrdinal)?)
                        .ok_or(RichDraftError::ListOrdinal)?,
                )
                .map_err(|_| RichDraftError::ListOrdinal)?,
            )),
        }
    }
    pub(crate) fn node(self, id: &BlockId, items: Vec<NodeRef>) -> Result<NodeRef, RichDraftError> {
        if items.is_empty() {
            return Err(RichDraftError::EmptyList);
        }
        let mut properties = vec![("block-id", PropertyValue::from_string(id.as_str()))];
        let local = match self {
            Self::Bullet => "bullet-list",
            Self::Ordered(start) => {
                if start
                    .ordinal_at(
                        u32::try_from(items.len() - 1).map_err(|_| RichDraftError::ListOrdinal)?,
                    )
                    .is_none()
                {
                    return Err(RichDraftError::ListOrdinal);
                }
                properties.push((
                    "start",
                    PropertyValue::from_integer(
                        PropertyInteger::try_new(i64::from(start.get()))
                            .map_err(|_| RichDraftError::Invariant)?,
                    ),
                ));
                "ordered-list"
            }
        };
        element(local, properties, items)
    }
}

/// One rich list item draft; the head is text and trailing flow may include images/lists.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct RichListItemDraft(NodeRef);

impl RichListItemDraft {
    /// Construct one explicitly identified item with a paragraph/heading head.
    ///
    /// # Errors
    /// Rejects a non-text head or internal local AST invariants. Full admission is deferred.
    pub fn try_new(
        id: &BlockId,
        head: RichBlockDraft,
        tail: Vec<RichBlockDraft>,
    ) -> Result<Self, RichDraftError> {
        if head.node().as_element().is_none_or(|node| {
            !matches!(node.kind().as_str(), "breditor/paragraph" | "breditor/heading")
        }) {
            return Err(RichDraftError::ListShape);
        }
        let mut children = vec![head.into_node()];
        children.extend(tail.into_iter().map(RichBlockDraft::into_node));
        Ok(Self(element(
            "list-item",
            vec![("block-id", PropertyValue::from_string(id.as_str()))],
            children,
        )?))
    }
}

/// Whole immutable rich-list insertion draft with explicit item/body identities.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct RichListDraft(NodeRef);

impl RichListDraft {
    /// Construct a nonempty list, checking every resulting numbered ordinal.
    ///
    /// # Errors
    /// Rejects empty lists, ordinal overflow or internal local invariants.
    pub fn try_new(
        id: &BlockId,
        kind: RichListKind,
        items: Vec<RichListItemDraft>,
    ) -> Result<Self, RichDraftError> {
        Ok(Self(kind.node(id, items.into_iter().map(|item| item.0).collect())?))
    }
}

impl From<RichListDraft> for RichBlockDraft {
    fn from(draft: RichListDraft) -> Self {
        Self::from_node(draft.0)
    }
}
