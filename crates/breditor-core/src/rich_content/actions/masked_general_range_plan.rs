//! Expected-tree admission for original-character replacements, not a replicated AST operation.
use super::{
    ReplaceCoveredRange, ReplaceTextRange, RichActionError, RichGeneralRangeKind,
    RichGeneralRangePlan, RichMaskedTextSpan, RichRangeFloor, RichRangeReplacementPlan,
    masked_text::{TextMask, is_text},
};
use crate::{
    document::TextFragment,
    position::Affinity,
    rich_content::{
        BlockId, RichCoverageExtent, RichDocument, RichSelection, RichSelectionCoverage,
        RichTextPoint,
    },
    state::EditorContext,
};

#[derive(Clone, Debug)]
enum Plan {
    Joined(ReplaceTextRange),
    Covered(RichRangeReplacementPlan),
}
/// Pure final-tree witness for a masked replacement in one current, admitted document.
/// Native replication must delete only the supplied original spans and route retained flow roots.
/// It must never publish this tree by copying/reinserting retained peer characters.
#[derive(Clone, Debug)]
pub struct RichMaskedGeneralRangePlan {
    source: RichDocument,
    plan: Plan,
    spans: Vec<RichMaskedTextSpan>,
    roots: Vec<BlockId>,
    start: RichTextPoint,
    inserted: TextFragment,
}
impl RichMaskedGeneralRangePlan {
    /// Preserve unmasked text and its complete current formats inside a directional range.
    /// Joined flows retain order; protected boundaries keep their structure and recompute floors.
    /// Whole non-text atoms with retained text refuse instead of hoisting their contents.
    /// # Errors
    /// Rejects invalid, overlapping, reordered, non-scalar or out-of-selection masks, changed
    /// whole-atom text, unsupported native joins and existing source/resource limits.
    pub fn capture(
        document: &RichDocument,
        selection: &RichSelection,
        inserted: &TextFragment,
        spans: &[RichMaskedTextSpan],
    ) -> Result<Self, RichActionError> {
        let mask = TextMask::capture(document, selection, spans)?;
        let ordinary = RichGeneralRangePlan::capture(document, selection, inserted)?;
        let coverage = RichSelectionCoverage::capture(document, selection)?;
        let mut roots = vec![];
        let plan = match ordinary.kind() {
            RichGeneralRangeKind::Joined => {
                for covered in coverage.nodes() {
                    let node = super::text_patch::block_node(document, covered.block())?;
                    let kind = node.as_element().ok_or(RichActionError::Rewrite)?.kind().as_str();
                    if covered.extent() == RichCoverageExtent::Whole
                        && !is_text(kind)
                        && !matches!(kind, "breditor/table-row" | "breditor/table-cell")
                    {
                        mask.require_whole(node)?;
                    }
                }
                let mut peers = TextFragment::empty();
                for span in coverage.text() {
                    let kept = mask.retained(document, span)?;
                    if !kept.is_empty()
                        || span.block() == mask.start.block()
                        || span.block() == mask.end.block()
                    {
                        roots.push(span.block().clone());
                    }
                    peers = peers.try_concat(&kept).map_err(|_| RichActionError::TextPrimitive)?;
                }
                let combined =
                    inserted.try_concat(&peers).map_err(|_| RichActionError::TextPrimitive)?;
                Plan::Joined(ReplaceTextRange::capture(document, selection, &combined)?)
            }
            RichGeneralRangeKind::PreservedBoundaries => Plan::Covered(
                RichRangeReplacementPlan::capture_masked(document, selection, inserted, &mask)?,
            ),
        };
        Ok(Self {
            source: document.clone(),
            plan,
            spans: spans.to_vec(),
            roots,
            start: mask.start,
            inserted: inserted.clone(),
        })
    }
    /// Existing structural strategy, not a browser adjacency guess.
    #[must_use]
    pub const fn kind(&self) -> RichGeneralRangeKind {
        match self.plan {
            Plan::Joined(_) => RichGeneralRangeKind::Joined,
            Plan::Covered(_) => RichGeneralRangeKind::PreservedBoundaries,
        }
    }
    /// Exact current spans; a replication coordinator must separately prove original identity.
    #[must_use]
    pub fn text_spans(&self) -> &[RichMaskedTextSpan] {
        &self.spans
    }
    /// Ordered roots to route into the first root when joining; never copy their characters.
    #[must_use]
    pub fn joined_text_roots(&self) -> &[BlockId] {
        &self.roots
    }
    /// Removed protected subtree roots, or None for a joined-flow plan.
    /// Deletion spans must come from `text_spans`, never from a broadened selection.
    #[must_use]
    pub fn protected_deleted_blocks(&self) -> Option<&[BlockId]> {
        match &self.plan {
            Plan::Joined(_) => None,
            Plan::Covered(plan) => Some(plan.deleted_blocks()),
        }
    }
    /// Exact fresh paragraph requirements after retaining peer text, not the unmasked floor count.
    #[must_use]
    pub fn empty_blocks(&self) -> &[RichRangeFloor] {
        match &self.plan {
            Plan::Joined(_) => &[],
            Plan::Covered(plan) => plan.empty_blocks(),
        }
    }
    /// Logical insertion start. It does not advance past retained peer text.
    #[must_use]
    pub const fn insertion_start(&self) -> &RichTextPoint {
        &self.start
    }
    /// Caret after only new runs, not after retained peer characters.
    /// # Errors
    /// Rejects offset overflow.
    pub fn insertion_end(&self) -> Result<RichTextPoint, RichActionError> {
        Ok(RichTextPoint::new(
            self.start.block().clone(),
            self.start
                .offset()
                .checked_add(self.inserted.utf16_len().get())
                .map_err(|_| RichActionError::TextRange)?,
            Affinity::After,
        ))
    }
    /// Admit the complete expected result with exact fresh floors. This is a pure witness,
    /// not a publication, history operation, permission or instruction to replace a shared root.
    /// # Errors
    /// Existing schema/aggregate limits, invalid or reused floors and source invariants reject.
    pub fn expected_document(
        &self,
        context: &EditorContext,
        empty: &[BlockId],
    ) -> Result<RichDocument, RichActionError> {
        let edit = match &self.plan {
            Plan::Joined(action) => {
                if !empty.is_empty() {
                    return Err(RichActionError::RangeFloorIds);
                }
                action.apply(context, &self.source)?
            }
            Plan::Covered(plan) => {
                ReplaceCoveredRange::capture(plan, empty)?.apply(context, &self.source)?
            }
        };
        Ok(edit.map_or_else(|| self.source.clone(), |edit| edit.document().clone()))
    }
}
