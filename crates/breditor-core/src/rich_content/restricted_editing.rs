//! Host restricted-editing policy: editable regions named by retained block ids.
//!
//! The policy lives outside the document grammar. It names editable regions by
//! the durable `block-id` of any non-root rich node; the region is that node's
//! complete subtree. Admission is a pure before/after comparison: a candidate
//! document is admitted only when it is identical to the source everywhere
//! outside the outermost editable regions and every such region root keeps its
//! identity at the same position. Each command family, mixed request, Undo and
//! Redo is therefore authorized by its complete effect, never by a command list.

use std::collections::BTreeMap;

use super::{
    BlockId, CellId, RichDocument, RichSelectionKind, RichTextPoint, ast_properties,
    rich_selection::text_length,
};
use crate::{
    document::{ElementNode, NodeRef},
    position::{Affinity, NodePath, TextOffset},
};

/// Upper bound of editable region ids in one host policy.
pub const RICH_RESTRICTED_MAX_REGIONS: usize = 4096;

/// Why a host restricted-editing policy was rejected.
#[derive(Clone, Copy, Debug, Eq, PartialEq, thiserror::Error)]
pub enum RichRestrictedPolicyError {
    /// The policy names more than [`RICH_RESTRICTED_MAX_REGIONS`] distinct ids.
    #[error("restricted editing policy names too many editable regions")]
    TooManyRegions,
}

/// Live host policy: only the named block subtrees are editable.
///
/// Ids absent from the current document are retained but inert. A nested id
/// inside another editable region adds nothing: the outermost region wins.
/// The policy is not a document property, history entry or permission grant.
#[derive(Clone, Debug, Default, Eq, PartialEq)]
pub struct RichRestrictedPolicy {
    editable: BTreeMap<String, BlockId>,
}

/// One current outermost editable region and its snapshot-local path.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct RichRestrictedRegion {
    /// Stable region root identity.
    pub block: BlockId,
    /// Path in the inspected snapshot only.
    pub path: NodePath,
}

fn block_id(element: &ElementNode) -> Option<&str> {
    ast_properties::string(element, "block-id").ok()
}

impl RichRestrictedPolicy {
    /// Admit a bounded set of editable region identities (duplicates collapse).
    ///
    /// # Errors
    /// Rejects more than [`RICH_RESTRICTED_MAX_REGIONS`] distinct identities.
    pub fn try_new(
        editable: impl IntoIterator<Item = BlockId>,
    ) -> Result<Self, RichRestrictedPolicyError> {
        let mut set = BTreeMap::new();
        for id in editable {
            set.insert(id.as_str().to_owned(), id);
            if set.len() > RICH_RESTRICTED_MAX_REGIONS {
                return Err(RichRestrictedPolicyError::TooManyRegions);
            }
        }
        Ok(Self { editable: set })
    }

    /// Declared editable identities in stable id order (not document order).
    #[must_use]
    pub fn editable(&self) -> impl ExactSizeIterator<Item = &BlockId> {
        self.editable.values()
    }

    fn names(&self, element: &ElementNode) -> Option<BlockId> {
        self.editable.get(block_id(element)?).cloned()
    }

    /// Whether `after` changes nothing outside the editable regions of `before`.
    ///
    /// Region roots must keep their identity and position; their own properties
    /// and complete content may change. Content outside, including order, kinds,
    /// properties and text, must be identical. This is the single admission rule
    /// shared by local commands, Undo/Redo and shared local authoring.
    #[must_use]
    pub fn admits(&self, before: &RichDocument, after: &RichDocument) -> bool {
        self.same_outside(before.document().root(), after.document().root())
    }

    fn same_outside(&self, before: &NodeRef, after: &NodeRef) -> bool {
        if before == after {
            return true;
        }
        let (Some(left), Some(right)) = (before.as_element(), after.as_element()) else {
            return false;
        };
        if let Some(id) = self.names(left) {
            return block_id(right) == Some(id.as_str());
        }
        left.kind() == right.kind()
            && left.entity_id() == right.entity_id()
            && left.properties() == right.properties()
            && left.children().len() == right.children().len()
            && left
                .children()
                .iter()
                .zip(right.children().iter())
                .all(|(left, right)| self.same_outside(left, right))
    }

    /// Current outermost editable regions in document order.
    #[must_use]
    pub fn regions(&self, document: &RichDocument) -> Vec<RichRestrictedRegion> {
        let mut regions = Vec::new();
        if self.editable.is_empty() {
            return regions;
        }
        let mut stack = vec![(document.document().root().clone(), Vec::<u32>::new())];
        while let Some((node, indices)) = stack.pop() {
            let Some(element) = node.as_element() else { continue };
            if !indices.is_empty()
                && let Some(block) = self.names(element)
                && let Ok(path) = NodePath::try_from_indices(indices.clone())
            {
                regions.push(RichRestrictedRegion { block, path });
                continue;
            }
            for (index, child) in element.children().iter().enumerate().rev() {
                let Ok(index) = u32::try_from(index) else { continue };
                let mut next = indices.clone();
                next.push(index);
                stack.push((child.clone(), next));
            }
        }
        regions
    }

    /// The outermost editable region containing (or equal to) this path.
    #[must_use]
    pub fn region_at(&self, document: &RichDocument, path: &NodePath) -> Option<BlockId> {
        let indices = path.to_vec();
        (1..=indices.len()).find_map(|length| {
            let prefix = NodePath::try_from_indices(indices[..length].to_vec()).ok()?;
            self.names(document.document().node_at(&prefix).ok()?.as_element()?)
        })
    }

    /// The outermost editable region containing a stable block, if any.
    #[must_use]
    pub fn region_of(&self, document: &RichDocument, block: &BlockId) -> Option<BlockId> {
        self.region_at(document, document.block_path(block)?)
    }

    fn region_of_cell(&self, document: &RichDocument, cell: &CellId) -> Option<BlockId> {
        self.region_at(document, document.cell_path(cell)?)
    }

    /// Whether a selection lies wholly inside one editable region.
    ///
    /// This drives action state and pending styles; it is an advisory read.
    /// Content admission still compares complete effects with [`Self::admits`].
    #[must_use]
    pub fn selection_is_editable(
        &self,
        document: &RichDocument,
        selection: Option<&RichSelectionKind>,
    ) -> bool {
        let region = match selection {
            None | Some(RichSelectionKind::Document) => return false,
            Some(RichSelectionKind::TextRange { anchor, focus }) => {
                let anchor = self.region_of(document, anchor.block());
                if anchor != self.region_of(document, focus.block()) {
                    return false;
                }
                anchor
            }
            Some(RichSelectionKind::Node(block)) => self.region_of(document, block),
            Some(RichSelectionKind::Grid { anchor, focus }) => {
                let anchor = self.region_of_cell(document, anchor);
                if anchor != self.region_of_cell(document, focus) {
                    return false;
                }
                anchor
            }
        };
        region.is_some()
    }

    fn reference_path(
        document: &RichDocument,
        selection: Option<&RichSelectionKind>,
    ) -> Option<NodePath> {
        match selection? {
            RichSelectionKind::Document => None,
            RichSelectionKind::TextRange { focus, .. } => {
                document.block_path(focus.block()).cloned()
            }
            RichSelectionKind::Node(block) => document.block_path(block).cloned(),
            RichSelectionKind::Grid { focus, .. } => document.cell_path(focus).cloned(),
        }
    }

    /// The next (or previous) editable region relative to a selection, without wrapping.
    #[must_use]
    pub fn adjacent_region(
        &self,
        document: &RichDocument,
        selection: Option<&RichSelectionKind>,
        forward: bool,
    ) -> Option<RichRestrictedRegion> {
        let regions = self.regions(document);
        let Some(reference) = Self::reference_path(document, selection) else {
            return if forward { regions.first().cloned() } else { regions.last().cloned() };
        };
        let reference = self
            .region_at(document, &reference)
            .and_then(|block| regions.iter().find(|region| region.block == block))
            .map_or_else(|| reference.to_vec(), |region| region.path.to_vec());
        if forward {
            regions.into_iter().find(|region| region.path.to_vec() > reference)
        } else {
            regions.into_iter().rev().find(|region| region.path.to_vec() < reference)
        }
    }

    /// A selection entering a region: a text root's whole text, else the first
    /// text caret inside it, else the region node itself.
    #[must_use]
    pub fn region_selection(
        document: &RichDocument,
        region: &RichRestrictedRegion,
    ) -> Option<RichSelectionKind> {
        let root = document.document().node_at(&region.path).ok()?;
        let mut stack = vec![root.clone()];
        while let Some(node) = stack.pop() {
            let Some(element) = node.as_element() else { continue };
            if is_text_block(element) {
                let block = BlockId::try_new(block_id(element)?).ok()?;
                let end = if block == region.block {
                    text_length(element).ok()?
                } else {
                    TextOffset::ZERO
                };
                let kind = RichSelectionKind::TextRange {
                    anchor: RichTextPoint::new(block.clone(), TextOffset::ZERO, Affinity::After),
                    focus: RichTextPoint::new(block, end, Affinity::After),
                };
                if super::RichSelection::try_new(document, kind.clone()).is_ok() {
                    return Some(kind);
                }
            }
            stack.extend(element.children().iter().rev().cloned());
        }
        let kind = RichSelectionKind::Node(region.block.clone());
        super::RichSelection::try_new(document, kind.clone()).is_ok().then_some(kind)
    }
}

fn is_text_block(element: &ElementNode) -> bool {
    matches!(
        element.kind().as_str(),
        "breditor/paragraph"
            | "breditor/heading"
            | "breditor/code-block"
            | "breditor/details-summary"
    )
}
