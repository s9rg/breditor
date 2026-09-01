use crate::{
    document::{Children, LocalInvariantError, NodeRef, PropertyMap},
    identity::{EntityId, QualifiedName},
};

/// An immutable semantic element.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ElementNode {
    kind: QualifiedName,
    entity_id: Option<EntityId>,
    properties: PropertyMap,
    children: Children,
}

impl ElementNode {
    /// Returns the qualified element kind.
    #[must_use]
    pub fn kind(&self) -> &QualifiedName {
        &self.kind
    }

    /// Returns the optional persisted semantic identity.
    #[must_use]
    pub fn entity_id(&self) -> Option<&EntityId> {
        self.entity_id.as_ref()
    }

    /// Returns the immutable element properties.
    #[must_use]
    pub fn properties(&self) -> &PropertyMap {
        &self.properties
    }

    /// Returns the immutable child sequence.
    #[must_use]
    pub fn children(&self) -> &Children {
        &self.children
    }

    pub(crate) fn try_new(
        kind: QualifiedName,
        entity_id: Option<EntityId>,
        properties: PropertyMap,
        children: Vec<NodeRef>,
    ) -> Result<Self, LocalInvariantError> {
        Ok(Self { kind, entity_id, properties, children: Children::try_from_nodes(children)? })
    }

    pub(crate) fn try_with_children(
        &self,
        children: Vec<NodeRef>,
    ) -> Result<Self, LocalInvariantError> {
        Self::try_new(self.kind.clone(), self.entity_id.clone(), self.properties.clone(), children)
    }
}
