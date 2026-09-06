use std::cmp::Ordering;

use crate::{
    document::Document,
    position::{Point, ResolvedPoint, compare_points},
    schema::CompiledSchema,
    selection::{RangeEndpoint, SelectionEndpointRule, SelectionError},
};

/// Spatial direction of a resolved range selection.
#[derive(Clone, Copy, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
pub enum RangeOrder {
    /// Anchor and focus occupy the same spatial boundary.
    Collapsed,
    /// Anchor precedes focus in document order.
    Forward,
    /// Focus precedes anchor in document order.
    Backward,
}

/// A directional pair of snapshot-local point candidates.
///
/// Construction preserves anchor, focus, and affinity exactly. Publication in
/// an editor state must first resolve this value against that state's document.
#[derive(Clone, Debug, Eq, Hash, PartialEq)]
pub struct RangeSelection {
    anchor: Point,
    focus: Point,
}

impl RangeSelection {
    /// Creates a snapshot-local range candidate without reordering its endpoints.
    #[must_use]
    pub const fn new(anchor: Point, focus: Point) -> Self {
        Self { anchor, focus }
    }

    /// Returns the fixed endpoint from which selection extension began.
    #[must_use]
    pub const fn anchor(&self) -> &Point {
        &self.anchor
    }

    /// Returns the actively extended endpoint.
    #[must_use]
    pub const fn focus(&self) -> &Point {
        &self.focus
    }

    /// Resolves both endpoints and checks the compiled schema's selection rules.
    ///
    /// # Errors
    ///
    /// Returns [`SelectionError`] when either point is structurally invalid,
    /// outside a base-schema text container, or cannot be ordered.
    pub fn resolve<'a>(
        &self,
        schema: &CompiledSchema,
        document: &'a Document,
    ) -> Result<ResolvedRangeSelection<'a>, SelectionError> {
        if let Some(mismatch) = document.schema_proof_mismatch(schema) {
            return Err(mismatch.into());
        }
        let anchor = resolve_endpoint(schema, document, &self.anchor, RangeEndpoint::Anchor)?;
        let focus = resolve_endpoint(schema, document, &self.focus, RangeEndpoint::Focus)?;
        let order = match compare_points(document, &self.anchor, &self.focus)? {
            Ordering::Less => RangeOrder::Forward,
            Ordering::Equal => RangeOrder::Collapsed,
            Ordering::Greater => RangeOrder::Backward,
        };
        Ok(ResolvedRangeSelection { anchor, focus, order })
    }
}

fn resolve_endpoint<'a>(
    schema: &CompiledSchema,
    document: &'a Document,
    point: &Point,
    endpoint: RangeEndpoint,
) -> Result<ResolvedPoint<'a>, SelectionError> {
    let resolved = point
        .resolve(document)
        .map_err(|source| SelectionError::InvalidPoint { endpoint, source })?;
    let rule = match (&resolved, point) {
        (ResolvedPoint::Text { .. }, Point::Text { text_path, .. }) => {
            let Some(parent_path) = text_path.parent() else {
                return Err(SelectionError::EndpointNotAllowed {
                    endpoint,
                    path: text_path.clone(),
                    rule: SelectionEndpointRule::OutsideTextContainer,
                });
            };
            let parent = document.node_at(&parent_path).map_err(|source| {
                SelectionError::InvalidPoint { endpoint, source: source.into() }
            })?;
            let Some(parent) = parent.as_element() else {
                return Err(SelectionError::EndpointNotAllowed {
                    endpoint,
                    path: text_path.clone(),
                    rule: SelectionEndpointRule::OutsideTextContainer,
                });
            };
            (!schema.is_text_container(parent.kind()))
                .then_some(SelectionEndpointRule::OutsideTextContainer)
        }
        (ResolvedPoint::Children { node, .. }, Point::Children { parent_path, .. }) => {
            if parent_path.is_root() {
                Some(SelectionEndpointRule::RootBoundary)
            } else {
                (!schema.is_text_container(node.kind()))
                    .then_some(SelectionEndpointRule::OutsideTextContainer)
            }
        }
        _ => Some(SelectionEndpointRule::OutsideTextContainer),
    };

    if let Some(rule) = rule {
        return Err(SelectionError::EndpointNotAllowed {
            endpoint,
            path: point.target_path().clone(),
            rule,
        });
    }
    Ok(resolved)
}

/// A range whose endpoints are valid in one borrowed document snapshot.
#[derive(Clone, Copy, Debug)]
pub struct ResolvedRangeSelection<'a> {
    anchor: ResolvedPoint<'a>,
    focus: ResolvedPoint<'a>,
    order: RangeOrder,
}

impl<'a> ResolvedRangeSelection<'a> {
    /// Returns the resolved anchor.
    #[must_use]
    pub const fn anchor(&self) -> ResolvedPoint<'a> {
        self.anchor
    }

    /// Returns the resolved focus.
    #[must_use]
    pub const fn focus(&self) -> ResolvedPoint<'a> {
        self.focus
    }

    /// Returns the range's spatial direction.
    #[must_use]
    pub const fn order(&self) -> RangeOrder {
        self.order
    }

    /// Returns whether anchor and focus occupy the same spatial boundary.
    #[must_use]
    pub const fn is_collapsed(&self) -> bool {
        matches!(self.order, RangeOrder::Collapsed)
    }

    /// Returns the earlier resolved endpoint.
    #[must_use]
    pub const fn start(&self) -> ResolvedPoint<'a> {
        match self.order {
            RangeOrder::Collapsed | RangeOrder::Forward => self.anchor,
            RangeOrder::Backward => self.focus,
        }
    }

    /// Returns the later resolved endpoint.
    #[must_use]
    pub const fn end(&self) -> ResolvedPoint<'a> {
        match self.order {
            RangeOrder::Collapsed | RangeOrder::Forward => self.focus,
            RangeOrder::Backward => self.anchor,
        }
    }
}

#[cfg(test)]
mod tests {
    use std::{error::Error, io};

    use crate::{
        document::{Document, DocumentProofMismatch, ElementNode, NodeRef, PropertyMap},
        identity::QualifiedName,
        position::{Affinity, NodePath, Point},
        schema::{CompiledSchema, DocumentLimits},
        selection::{RangeSelection, SelectionError},
    };

    fn empty_document(
        schema: &CompiledSchema,
        limits: &DocumentLimits,
    ) -> Result<Document, Box<dyn Error>> {
        let paragraph = ElementNode::try_new(
            QualifiedName::from_known_static("breditor/paragraph"),
            None,
            PropertyMap::default(),
            Vec::new(),
        )
        .map(NodeRef::element)?;
        let root = ElementNode::try_new(
            QualifiedName::from_known_static("breditor/document"),
            None,
            PropertyMap::default(),
            vec![paragraph],
        )
        .map(NodeRef::element)?;
        Document::try_new(schema, root, limits).map_err(Into::into)
    }

    fn caret() -> Result<RangeSelection, Box<dyn Error>> {
        let point = Point::Children {
            parent_path: NodePath::try_from_indices(vec![0])?,
            child_index: 0,
            affinity: Affinity::After,
        };
        Ok(RangeSelection::new(point.clone(), point))
    }

    #[test]
    fn public_resolution_requires_the_exact_compiled_proof() -> Result<(), Box<dyn Error>> {
        let document_schema = CompiledSchema::breditor_base();
        let active_schema = CompiledSchema::breditor_base();
        let document = empty_document(&document_schema, &DocumentLimits::default())?;

        let Err(error) = caret()?.resolve(&active_schema, &document) else {
            return Err(io::Error::other(
                "selection unexpectedly accepted an independent compiled proof",
            )
            .into());
        };
        assert_eq!(
            error,
            SelectionError::DocumentProofMismatch(DocumentProofMismatch::CompiledProof)
        );
        Ok(())
    }

    #[test]
    fn public_resolution_does_not_require_a_validation_policy_argument()
    -> Result<(), Box<dyn Error>> {
        let schema = CompiledSchema::breditor_base();
        let document = empty_document(&schema, &DocumentLimits::default().with_max_nodes(2))?;

        assert!(caret()?.resolve(&schema, &document)?.is_collapsed());
        Ok(())
    }
}
