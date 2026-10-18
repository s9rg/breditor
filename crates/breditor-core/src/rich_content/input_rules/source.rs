//! Read one bounded native caret prefix across formatting runs, without flattening a document.
use super::{RICH_INPUT_RULE_MAX_RUNS, RICH_INPUT_RULE_WINDOW_UTF16, RichInputRuleError};
use crate::{
    document::ElementNode,
    position::TextOffset,
    rich_content::{RichDocument, RichTextPoint},
};

pub(super) struct Source<'a> {
    pub node: &'a ElementNode,
    pub prefix: String,
    pub start: u64,
    pub caret: u64,
    pub length: u64,
}
impl<'a> Source<'a> {
    pub(super) fn read(
        document: &'a RichDocument,
        point: &RichTextPoint,
    ) -> Result<Self, RichInputRuleError> {
        let node = document
            .block_path(point.block())
            .and_then(|p| document.document().node_at(p).ok())
            .and_then(crate::document::NodeRef::as_element)
            .ok_or(RichInputRuleError::Selection)?;
        if node.children().len() > RICH_INPUT_RULE_MAX_RUNS {
            return Err(RichInputRuleError::SourceLimit);
        }
        let length = node.children().iter().try_fold(0u64, |sum, n| {
            sum.checked_add(u64::from(
                n.as_text().ok_or(RichInputRuleError::Selection)?.utf16_len(),
            ))
            .ok_or(RichInputRuleError::SourceLimit)
        })?;
        let caret = point.offset().get();
        if caret > length {
            return Err(RichInputRuleError::Selection);
        }
        let window_start = caret.saturating_sub(RICH_INPUT_RULE_WINDOW_UTF16);
        let mut end = length;
        let mut pieces = vec![];
        for child in node.children().iter().rev() {
            let text = child.as_text().ok_or(RichInputRuleError::Selection)?;
            let start = end - u64::from(text.utf16_len());
            let a = window_start.max(start);
            let b = caret.min(end);
            if a < b {
                let mut a = u32::try_from(a - start).map_err(|_| RichInputRuleError::Selection)?;
                let b = u32::try_from(b - start).map_err(|_| RichInputRuleError::Selection)?;
                // Only the window floor may bisect a scalar. The admitted caret never may.
                if text.byte_offset_at_utf16(a).is_err() {
                    a += 1;
                }
                if let Some(slice) =
                    text.slice_utf16(a, b).map_err(|_| RichInputRuleError::Selection)?
                {
                    pieces.push(slice.text().to_owned());
                }
            }
            end = start;
            if end <= window_start {
                break;
            }
        }
        let prefix: String = pieces.into_iter().rev().collect();
        let start = caret
            - u64::try_from(prefix.encode_utf16().count())
                .map_err(|_| RichInputRuleError::Selection)?;
        Ok(Self { node, prefix, start, caret, length })
    }
    pub(super) fn offset(&self, byte: usize) -> Result<TextOffset, RichInputRuleError> {
        let prefix = self.prefix.get(..byte).ok_or(RichInputRuleError::Selection)?;
        TextOffset::try_new(self.start + prefix.encode_utf16().count() as u64)
            .map_err(|_| RichInputRuleError::Selection)
    }
    pub(super) fn inside_inert_inline(&self, start: u64, end: u64) -> bool {
        let mut cursor = 0;
        self.node.children().iter().any(|node| {
            let Some(text) = node.as_text() else {
                return true;
            };
            let next = cursor + u64::from(text.utf16_len());
            let inert = cursor < end
                && next > start
                && text.formats().iter().any(|f| {
                    matches!(f.kind().as_str(), "breditor-inline/code" | "breditor-inline/link")
                });
            cursor = next;
            inert
        })
    }
}
