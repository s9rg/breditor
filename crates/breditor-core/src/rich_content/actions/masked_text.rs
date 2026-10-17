//! Current-coordinate masks are bounded intents, not durable character identity or permissions.
use super::{RichActionError, replace_text_range::ordered, text_patch};
use crate::{
    document::{NodeRef, TextFragment},
    position::TextOffset,
    rich_content::{
        BlockId, RichCoveredText, RichDocument, RichSelection, RichSelectionCoverage,
        RichSelectionKind, RichTextPoint, rich_text_mapping::RichTextMap,
    },
};
use std::collections::BTreeMap;

/// One nonempty scalar-aligned current span to remove, excluding intervening retained text.
/// Replication callers must derive these spans from native character proofs at the observed source.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct RichMaskedTextSpan {
    block: BlockId,
    start: TextOffset,
    end: TextOffset,
}
impl RichMaskedTextSpan {
    /// Construct an ordered nonempty span. Full source/selection/scalar admission is done by capture.
    /// # Errors
    /// Rejects empty or reversed spans.
    pub fn try_new(
        block: BlockId,
        start: TextOffset,
        end: TextOffset,
    ) -> Result<Self, RichActionError> {
        if start >= end {
            return Err(RichActionError::TextRange);
        }
        Ok(Self { block, start, end })
    }
    /// Current logical text owner, not a DOM or durable cursor identity.
    #[must_use]
    pub const fn block(&self) -> &BlockId {
        &self.block
    }
    /// Scalar-aligned inclusive start.
    #[must_use]
    pub const fn start(&self) -> TextOffset {
        self.start
    }
    /// Scalar-aligned exclusive end.
    #[must_use]
    pub const fn end(&self) -> TextOffset {
        self.end
    }
}
pub(super) fn is_text(kind: &str) -> bool {
    matches!(kind, "breditor/paragraph" | "breditor/heading" | "breditor/code-block")
}
pub(super) fn slice(
    text: &TextFragment,
    start: TextOffset,
    end: TextOffset,
) -> Result<TextFragment, RichActionError> {
    let length =
        TextOffset::try_new(end.get().checked_sub(start.get()).ok_or(RichActionError::TextRange)?)
            .map_err(|_| RichActionError::TextRange)?;
    text.split_at(start)
        .and_then(|(_, tail)| tail.split_at(length))
        .map(|(selected, _)| selected)
        .map_err(|_| RichActionError::TextRange)
}
pub(super) struct TextMask {
    spans: BTreeMap<BlockId, Vec<RichMaskedTextSpan>>,
    pub(super) start: RichTextPoint,
    pub(super) end: RichTextPoint,
}
impl TextMask {
    pub(super) fn capture(
        document: &RichDocument,
        selection: &RichSelection,
        spans: &[RichMaskedTextSpan],
    ) -> Result<Self, RichActionError> {
        let RichSelectionKind::TextRange { anchor, focus } = selection.kind() else {
            return Err(RichActionError::SelectionKind);
        };
        if spans.len() > 4096 {
            return Err(RichActionError::TooManyActions);
        }
        let coverage = RichSelectionCoverage::capture(document, selection)?;
        let (start, end) = ordered(document, anchor, focus)?;
        let mut mask = Self { spans: BTreeMap::new(), start: start.clone(), end: end.clone() };
        let mut previous = None;
        let mut scalars = 0_usize;
        for span in spans {
            let path =
                document.block_path(&span.block).ok_or(RichActionError::MissingTarget)?.to_vec();
            if previous
                .as_ref()
                .is_some_and(|(old_path, old_end)| (&path, span.start) < (old_path, *old_end))
            {
                return Err(RichActionError::TextRange);
            }
            if !coverage.text().iter().any(|covered| {
                covered.block() == &span.block
                    && covered.start() <= span.start
                    && span.end <= covered.end()
            }) {
                return Err(RichActionError::TextRange);
            }
            let text = text_patch::fragment(text_patch::block_node(document, &span.block)?)?;
            let removed = slice(&text, span.start, span.end)?;
            scalars = scalars
                .checked_add(removed.iter().map(|run| run.text().chars().count()).sum())
                .filter(|count| *count <= 65536)
                .ok_or(RichActionError::TooManyActions)?;
            previous = Some((path, span.end));
            mask.spans.entry(span.block.clone()).or_default().push(span.clone());
        }
        Ok(mask)
    }
    pub(super) fn full_text(&self, id: &BlockId, node: &NodeRef) -> bool {
        let Ok(text) = text_patch::fragment(node) else { return false };
        self.spans.get(id).map_or(0, |spans| {
            spans.iter().map(|span| span.end.get() - span.start.get()).sum::<u64>()
        }) == text.utf16_len().get()
    }
    pub(super) fn require_whole(&self, node: &NodeRef) -> Result<(), RichActionError> {
        let mut pending = vec![node];
        while let Some(node) = pending.pop() {
            let element = node.as_element().ok_or(RichActionError::Rewrite)?;
            if is_text(element.kind().as_str()) {
                let id = BlockId::try_new(
                    crate::rich_content::ast_properties::string(element, "block-id")
                        .map_err(|_| RichActionError::Rewrite)?,
                )
                .map_err(|_| RichActionError::Rewrite)?;
                if !self.full_text(&id, node) {
                    return Err(RichActionError::MaskedStructure);
                }
            } else {
                pending.extend(element.children());
            }
        }
        Ok(())
    }
    pub(super) fn retained(
        &self,
        document: &RichDocument,
        span: &RichCoveredText,
    ) -> Result<TextFragment, RichActionError> {
        let text = text_patch::fragment(text_patch::block_node(document, span.block())?)?;
        let mut kept = TextFragment::empty();
        let mut at = span.start();
        for deleted in self.spans.get(span.block()).into_iter().flatten() {
            kept = kept
                .try_concat(&slice(&text, at, deleted.start)?)
                .map_err(|_| RichActionError::TextPrimitive)?;
            at = deleted.end;
        }
        kept.try_concat(&slice(&text, at, span.end())?).map_err(|_| RichActionError::TextPrimitive)
    }
    pub(super) fn rebuild(
        &self,
        node: &NodeRef,
        id: &BlockId,
        inserted: &TextFragment,
    ) -> Result<(NodeRef, Vec<RichTextMap>), RichActionError> {
        let mut text = text_patch::fragment(node)?;
        let mut before = node.clone();
        let mut maps = vec![];
        for span in self.spans.get(id).into_iter().flatten().rev() {
            let prefix = text.split_at(span.start).map_err(|_| RichActionError::TextRange)?.0;
            let suffix = text.split_at(span.end).map_err(|_| RichActionError::TextRange)?.1;
            text = prefix.try_concat(&suffix).map_err(|_| RichActionError::TextPrimitive)?;
            let after = text_patch::text_node(node, &text)?;
            maps.push(RichTextMap {
                block: id.clone(),
                start: span.start,
                end: span.end,
                inserted: TextOffset::ZERO,
                before,
                after: after.clone(),
            });
            before = after;
        }
        if id == self.start.block() && !inserted.is_empty() {
            let at = self.start.offset();
            let (prefix, suffix) = text.split_at(at).map_err(|_| RichActionError::TextRange)?;
            text = prefix
                .try_concat(inserted)
                .and_then(|text| text.try_concat(&suffix))
                .map_err(|_| RichActionError::TextPrimitive)?;
            let after = text_patch::text_node(node, &text)?;
            maps.push(RichTextMap {
                block: id.clone(),
                start: at,
                end: at,
                inserted: inserted.utf16_len(),
                before,
                after: after.clone(),
            });
            before = after;
        }
        Ok((before, maps))
    }
}
