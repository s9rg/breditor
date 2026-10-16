//! Exact interval membership, without changing original text/grid meanings.
use super::{
    NodePath, RichCoverageExtent, RichDocument, RichSelection, RichSelectionError,
    RichSelectionKind, TextOffset,
};
use crate::rich_content::ResolvedRichSelection;
pub(super) enum Scope<'a> {
    Document,
    Text {
        start: &'a NodePath,
        end: &'a NodePath,
        lower: TextOffset,
        upper: TextOffset,
        backward: bool,
    },
    Subtrees(Vec<NodePath>),
}
impl<'a> Scope<'a> {
    pub(super) fn new(
        document: &'a RichDocument,
        selection: Option<&RichSelectionKind>,
    ) -> Result<Self, RichSelectionError> {
        Ok(match selection {
            None => Self::Document,
            Some(RichSelectionKind::TextRange { anchor, focus }) => {
                let a = document.block_path(anchor.block()).ok_or(RichSelectionError::Invariant)?;
                let f = document.block_path(focus.block()).ok_or(RichSelectionError::Invariant)?;
                let backward = (a, anchor.offset()) > (f, focus.offset());
                let (start, end, lower, upper) = if backward {
                    (f, a, focus.offset(), anchor.offset())
                } else {
                    (a, f, anchor.offset(), focus.offset())
                };
                Self::Text { start, end, lower, upper, backward }
            }
            Some(kind @ RichSelectionKind::Node(_)) => {
                let proof = RichSelection::try_new(document, kind.clone())?;
                let ResolvedRichSelection::Node { path, .. } = proof.resolve(document)? else {
                    return Err(RichSelectionError::Invariant);
                };
                Self::Subtrees(vec![path])
            }
            Some(kind @ RichSelectionKind::Grid { .. }) => {
                let proof = RichSelection::try_new(document, kind.clone())?;
                let ResolvedRichSelection::Grid(grid) = proof.resolve(document)? else {
                    return Err(RichSelectionError::Invariant);
                };
                let mut paths = grid
                    .cells()
                    .iter()
                    .map(|c| document.cell_path(c).cloned().ok_or(RichSelectionError::Invariant))
                    .collect::<Result<Vec<_>, _>>()?;
                paths.sort_unstable();
                paths.dedup();
                Self::Subtrees(paths)
            }
        })
    }
    pub(super) fn backward(&self) -> Option<bool> {
        if let Self::Text { backward, .. } = self { Some(*backward) } else { None }
    }
    pub(super) fn extent(&self, path: &NodePath) -> Option<RichCoverageExtent> {
        match self {
            Self::Document => Some(RichCoverageExtent::Whole),
            Self::Subtrees(roots) => {
                // Source-cell roots are disjoint and sorted. Inspect only the
                // predecessor/next root instead of scanning every cell per node.
                let at = roots.partition_point(|root| root <= path);
                if at
                    .checked_sub(1)
                    .is_some_and(|i| path.as_slice().starts_with(roots[i].as_slice()))
                {
                    Some(RichCoverageExtent::Whole)
                } else if roots.get(at).is_some_and(|p| p.as_slice().starts_with(path.as_slice())) {
                    Some(RichCoverageExtent::Partial)
                } else {
                    None
                }
            }
            Self::Text { start, end, .. } => {
                if start.as_slice().starts_with(path.as_slice())
                    || end.as_slice().starts_with(path.as_slice())
                {
                    Some(RichCoverageExtent::Partial)
                } else if path > *start && path < *end {
                    Some(RichCoverageExtent::Whole)
                } else {
                    None
                }
            }
        }
    }
    pub(super) fn interval(&self, path: &NodePath, length: TextOffset) -> (TextOffset, TextOffset) {
        if let Self::Text { start, end, lower, upper, .. } = self {
            (
                if path == *start { *lower } else { TextOffset::ZERO },
                if path == *end { *upper } else { length },
            )
        } else {
            (TextOffset::ZERO, length)
        }
    }
}
