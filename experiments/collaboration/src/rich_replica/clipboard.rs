//! Guarded semantic clipboard reads and paste planning through the original Rust clipboard codec.
use super::{
    Command, PendingFormatsUpdate, RichReplica, SelectionUpdate, SharedObservation,
    actions::{PasteBlocks, RangeTextRun, ReplaceTextRange},
    selection::{Selection, TextPoint},
};
use crate::{Error, anchor::Affinity};
use breditor_core::{
    codec::RichClipboardJsonCodec,
    rich_content::{RichClipboardFragment, RichClipboardIdAllocator, RichClipboardKind},
};
use serde::{Deserialize, Serialize};
use serde_json::Value;

/// Frozen clipboard data; the host writes system MIME types only after this read succeeds.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClipboardContent {
    /// Original bounded semantic clipboard envelope, not a causal update/history backup.
    pub rich_json: String,
    /// Exact Unicode fallback, with source-cell partition newlines.
    pub plain_text: String,
}
/// Explicit paste policy: no implicit crop, whole-node replacement or coordinate inference.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase", deny_unknown_fields)]
pub enum PasteTarget {
    /// Replace the current text range with the clipboard's complete inline formats.
    Text,
    /// Replace the current merge-closed grid, requiring exactly matching dimensions.
    Grid,
    /// Insert whole rich blocks at an explicit stable flow position.
    Flow {
        /// Existing cell/list-item, or document root.
        parent: Option<String>,
        /// Existing direct child, or append.
        before: Option<String>,
    },
}
impl RichReplica {
    /// Copy the exact selected semantic content without changing content, UI, redo or observation.
    /// # Errors
    /// Rejects stale/foreign guards before selection/clipboard admission; a caret copies nothing.
    pub fn copy_clipboard_guarded(
        &self,
        observation: &SharedObservation,
    ) -> Result<Option<ClipboardContent>, Error> {
        self.check(observation)?;
        let Some(selection) = self.selection()? else {
            return Ok(None);
        };
        let context = super::paragraphs::context(&self.codec);
        let Some(fragment) = RichClipboardFragment::copy_selection(
            &context,
            &self.document,
            &selection.admit(&self.document)?,
        )
        .map_err(|_| Error::Contract("shared clipboard capture"))?
        else {
            return Ok(None);
        };
        Ok(Some(ClipboardContent {
            rich_json: RichClipboardJsonCodec::new(context)
                .encode(&fragment)
                .map_err(|_| Error::Contract("shared clipboard encoding"))?,
            plain_text: fragment
                .plain_text()
                .map_err(|_| Error::Contract("shared clipboard plain text"))?,
        }))
    }
    /// Re-key admitted semantic content, then publish one exact writer-local history group.
    /// Allocations belong to the host and remain consumed on failure. Asset references do not change.
    /// # Errors
    /// Rejects a stale observation before decoding/allocation, wrong kind/shape, reused IDs or limits.
    pub fn paste_clipboard_guarded(
        &mut self,
        observation: &SharedObservation,
        input: &str,
        target: PasteTarget,
        allocator: &mut dyn RichClipboardIdAllocator,
    ) -> Result<bool, Error> {
        self.check(observation)?;
        let context = super::paragraphs::context(&self.codec);
        let fragment = RichClipboardJsonCodec::new(context.clone())
            .decode(input)
            .map_err(|_| Error::Contract("shared clipboard decoding"))?;
        match target {
            PasteTarget::Text => {
                fragment
                    .text_fragment(&context)
                    .map_err(|_| Error::Contract("shared inline clipboard kind"))?;
                let raw: Value = serde_json::from_str(
                    &self
                        .codec
                        .encode(fragment.document().document())
                        .map_err(|_| Error::Contract("clipboard text encoding"))?,
                )?;
                let runs = raw["root"]["children"][0]["children"]
                    .as_array()
                    .ok_or(Error::Contract("clipboard inline runs"))?
                    .iter()
                    .map(|run| {
                        Ok(RangeTextRun {
                            text: run["text"]
                                .as_str()
                                .ok_or(Error::Contract("clipboard text"))?
                                .into(),
                            formats: run["formats"]
                                .as_array()
                                .ok_or(Error::Contract("clipboard formats"))?
                                .clone(),
                        })
                    })
                    .collect::<Result<Vec<_>, Error>>()?;
                self.paste_inline(runs)
            }
            PasteTarget::Flow { parent, before } => {
                let nodes = self.fresh_clipboard_nodes(&fragment, allocator)?;
                self.apply_with_state(
                    vec![Command::PasteBlocks(PasteBlocks { parent, before, nodes })],
                    SelectionUpdate::Map,
                    PendingFormatsUpdate::Set(None),
                )
            }
            PasteTarget::Grid => {
                if fragment.kind() != RichClipboardKind::Grid {
                    return Err(Error::Contract("shared grid clipboard kind"));
                }
                let (anchor, focus) = super::clipboard_grid::targets(self)?;
                let nodes = self.fresh_clipboard_nodes(&fragment, allocator)?;
                let table = nodes.first().ok_or(Error::Contract("shared clipboard table"))?;
                self.apply_with_state(
                    vec![Command::PasteTableCells(super::clipboard_grid::draft(
                        table, anchor, focus,
                    )?)],
                    SelectionUpdate::Map,
                    PendingFormatsUpdate::Set(None),
                )
            }
        }
    }
    fn paste_inline(&mut self, runs: Vec<RangeTextRun>) -> Result<bool, Error> {
        let Some(Selection::TextRange { anchor, focus }) = self.selection()? else {
            return Err(Error::Contract("inline paste requires text selection"));
        };
        let (start, _) = super::range_plan::ordered(&self.document, &anchor, &focus)?;
        let length = runs.iter().try_fold(0_u32, |sum, run| {
            sum.checked_add(
                u32::try_from(run.text.encode_utf16().count()).map_err(|_| Error::Offset)?,
            )
            .ok_or(Error::Offset)
        })?;
        let next = TextPoint {
            block: start.block.clone(),
            offset: start.offset.checked_add(length).ok_or(Error::Offset)?,
            affinity: Affinity::After,
        };
        self.apply_with_state(
            vec![Command::ReplaceTextRange(ReplaceTextRange { anchor, focus, runs })],
            SelectionUpdate::Set(Some(Selection::TextRange { anchor: next.clone(), focus: next })),
            PendingFormatsUpdate::Set(None),
        )
    }
    pub(super) fn fresh_clipboard_nodes(
        &self,
        fragment: &RichClipboardFragment,
        allocator: &mut dyn RichClipboardIdAllocator,
    ) -> Result<Vec<Value>, Error> {
        let context = super::paragraphs::context(&self.codec);
        if fragment.kind() == RichClipboardKind::Text {
            return Err(Error::Contract("shared flow clipboard kind"));
        }
        let fresh = fragment
            .rekeyed(&context, allocator)
            .map_err(|_| Error::Contract("shared clipboard allocation"))?;
        let raw: Value = serde_json::from_str(
            &self
                .codec
                .encode(fresh.document().document())
                .map_err(|_| Error::Contract("shared fresh clipboard export"))?,
        )?;
        raw["root"]["children"]
            .as_array()
            .cloned()
            .ok_or(Error::Contract("shared fresh clipboard root"))
    }
}
