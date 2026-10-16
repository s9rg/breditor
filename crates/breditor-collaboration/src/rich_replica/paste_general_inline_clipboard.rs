//! Schema-bound inline clipboard paste uses native general planning and exact selective history.
use super::{RichReplica, SharedObservation, selection::Selection};
use crate::Error;
use breditor_core::{
    codec::RichClipboardJsonCodec,
    rich_content::{BlockId, RichClipboardFragment, actions::RichGeneralRangePlan},
};
use serde::Deserialize;

#[derive(Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct Record {
    selection: Selection,
    clipboard_json: String,
    prefix: String,
}
impl RichReplica {
    /// Decode a closed clipboard request only after the exact guard, mode and write checks.
    /// The clipboard remains opaque to hosts; Rust proves its schema, kind and literal styles.
    /// # Errors
    /// Stale/read-only/disabled reject before parsing. Malformed content, wrong kinds,
    /// reused floors or final admission failures publish no partial history or UI.
    pub fn paste_general_inline_clipboard_namespace_json_guarded(
        &mut self,
        observation: &SharedObservation,
        input: &str,
    ) -> Result<bool, Error> {
        super::general_range_input_json::authorize(self, observation)?;
        let r: Record = super::general_range_input_json::decode(input)?;
        let context = super::paragraphs::context(&self.codec);
        let clipboard = RichClipboardJsonCodec::new(context.clone())
            .decode(&r.clipboard_json)
            .map_err(|_| Error::Contract("general inline clipboard admission"))?;
        let inserted = clipboard
            .text_fragment(&context)
            .map_err(|_| Error::Contract("general inline clipboard kind"))?;
        let plan = RichGeneralRangePlan::capture(
            &self.document,
            &r.selection.admit(&self.document)?,
            &inserted,
        )
        .map_err(|_| Error::Contract("general inline clipboard plan"))?;
        let empty = breditor_core::rich_content::allocate_general_range_paragraphs(
            &r.prefix,
            plan.empty_blocks().len(),
        )
        .map_err(|_| Error::Contract("general inline clipboard namespace"))?;
        self.paste_general_inline_clipboard_guarded(observation, &r.selection, &clipboard, &empty)
    }
    /// Paste an admitted inline fragment at a proved general target, preserving actual before-UI.
    /// # Errors
    /// Wrong guard/mode/policy/schema/kind, invalid IDs or resource failures reject atomically.
    pub fn paste_general_inline_clipboard_guarded(
        &mut self,
        observation: &SharedObservation,
        target: &Selection,
        clipboard: &RichClipboardFragment,
        empty: &[BlockId],
    ) -> Result<bool, Error> {
        super::general_range_input_json::authorize(self, observation)?;
        let inserted = clipboard
            .text_fragment(&super::paragraphs::context(&self.codec))
            .map_err(|_| Error::Contract("general inline clipboard kind/schema"))?;
        self.replace_general_range_text_guarded(observation, target, &inserted, empty)
    }
}
