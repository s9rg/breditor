//! Native paragraph Enter over general coverage, retaining partial owners and choosing list semantics.
use super::{
    RichAction, RichActionError, RichGeneralRangePlan, SplitListItem, SplitTaskItem, SplitTextBlock,
};
use crate::{
    document::TextFragment,
    position::{Affinity, TextOffset},
    rich_content::{
        BlockId, RichDocument, RichSelection, RichTextPoint, allocate_general_range_paragraphs,
    },
    state::EditorContext,
};

/// Structural choice proved from the retained source after general deletion, never supplied by a host.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum RichGeneralParagraphKind {
    /// A new paragraph in the same flow owner.
    Paragraph,
    /// A new ordinary list item receives the retained head suffix and trailing flow.
    ListItem,
    /// A new unchecked task receives the suffix and trailing flow; the left completion is retained.
    TaskItem,
}
/// One immutable two-phase native Enter plan. Code/caption Enter uses the separate general LF path.
#[derive(Clone, Debug)]
pub struct RichGeneralParagraphPlan {
    actions: Vec<RichAction>,
    replaced: RichDocument,
    document: RichDocument,
    point: RichTextPoint,
    right: BlockId,
    item: Option<BlockId>,
    empty: Vec<BlockId>,
    kind: RichGeneralParagraphKind,
}
impl RichGeneralParagraphPlan {
    /// Trim general selection coverage, then split the retained prose start with native item policy.
    /// All new IDs derive from one bounded, permanently host-reserved prefix. Actual owner UI is
    /// not changed by planning. The complete action group must publish under the original guard.
    /// # Errors
    /// Rejects invalid/foreign ranges, caption/code starts, source-ID reuse, invalid grammar or limits.
    pub fn capture(
        context: &EditorContext,
        document: &RichDocument,
        selection: &RichSelection,
        prefix: &str,
    ) -> Result<Self, RichActionError> {
        let range = RichGeneralRangePlan::capture(document, selection, &TextFragment::empty())?;
        let empty = allocate_general_range_paragraphs(prefix, range.empty_blocks().len())?;
        let point = range.insertion_end()?;
        let delete = range.action(&empty)?;
        let replaced = delete
            .apply(context, document)?
            .map_or_else(|| document.clone(), |e| e.document().clone());
        let path = replaced.block_path(point.block()).ok_or(RichActionError::MissingTarget)?;
        let parent = path
            .parent()
            .and_then(|p| replaced.document().node_at(&p).ok())
            .and_then(crate::document::NodeRef::as_element)
            .ok_or(RichActionError::FlowParent)?;
        let kind = match (parent.kind().as_str(), path.last_index()) {
            ("breditor/list-item", Some(0)) => RichGeneralParagraphKind::ListItem,
            ("breditor/task-item", Some(0)) => RichGeneralParagraphKind::TaskItem,
            _ => RichGeneralParagraphKind::Paragraph,
        };
        let right = BlockId::try_new(format!("{prefix}:paragraph"))
            .map_err(|_| RichActionError::RangeFloorIds)?;
        let item = (kind != RichGeneralParagraphKind::Paragraph)
            .then(|| BlockId::try_new(format!("{prefix}:item")))
            .transpose()
            .map_err(|_| RichActionError::RangeFloorIds)?;
        for id in std::iter::once(&right).chain(item.iter()) {
            if document.block_path(id).is_some() {
                return Err(RichActionError::RangeFloorIds);
            }
        }
        let split = match kind {
            RichGeneralParagraphKind::Paragraph => RichAction::SplitTextBlock(
                SplitTextBlock::capture(&replaced, &point, &right, None)?,
            ),
            RichGeneralParagraphKind::ListItem => {
                RichAction::SplitListItem(SplitListItem::capture(
                    &replaced,
                    &point,
                    item.as_ref().ok_or(RichActionError::ListShape)?,
                    &right,
                    None,
                )?)
            }
            RichGeneralParagraphKind::TaskItem => {
                RichAction::SplitTaskItem(SplitTaskItem::capture(
                    &replaced,
                    &point,
                    item.as_ref().ok_or(RichActionError::ListShape)?,
                    &right,
                    None,
                )?)
            }
        };
        let after =
            split.apply(context, &replaced)?.ok_or(RichActionError::Rewrite)?.document().clone();
        Ok(Self {
            actions: vec![delete, split],
            replaced,
            document: after,
            point,
            right,
            item,
            empty,
            kind,
        })
    }
    /// Exact captured actions in dependent order for one owner dispatch.
    #[must_use]
    pub fn actions(&self) -> &[RichAction] {
        &self.actions
    }
    /// Fully admitted result after both phases.
    #[must_use]
    pub const fn document(&self) -> &RichDocument {
        &self.document
    }
    /// Admitted deletion boundary before the structural split; needed for causal lowering.
    #[must_use]
    pub const fn replacement_document(&self) -> &RichDocument {
        &self.replaced
    }
    /// Retained native split source, including its exact offset.
    #[must_use]
    pub const fn split_point(&self) -> &RichTextPoint {
        &self.point
    }
    /// Native selected paragraph/item semantics.
    #[must_use]
    pub const fn kind(&self) -> RichGeneralParagraphKind {
        self.kind
    }
    /// Fresh suffix paragraph identity.
    #[must_use]
    pub const fn right(&self) -> &BlockId {
        &self.right
    }
    /// Fresh item only when the retained split starts at an ordinary/task head.
    #[must_use]
    pub const fn item(&self) -> Option<&BlockId> {
        self.item.as_ref()
    }
    /// Exactly the native-required fresh replacement floors.
    #[must_use]
    pub fn empty_blocks(&self) -> &[BlockId] {
        &self.empty
    }
    /// Final collapsed caret in the fresh suffix paragraph.
    #[must_use]
    pub fn insertion_end(&self) -> RichTextPoint {
        RichTextPoint::new(self.right.clone(), TextOffset::ZERO, Affinity::After)
    }
}
