//! Closed general rich-flow clipboard insertion with one native selective-history command.
use super::{
    ClipboardNamespace, Command, PendingFormatsUpdate, RichReplica, SelectionUpdate,
    SharedObservation,
    actions::{PasteGeneralFlowAtTextV1, ReplaceGeneralTextRangeV1},
    selection::{Selection, TextPoint},
};
use crate::{Error, anchor::Affinity};
use breditor_core::{
    codec::RichClipboardJsonCodec,
    document::TextFragment,
    rich_content::{actions::RichGeneralRangePlan, allocate_general_range_paragraphs},
};
use serde::Deserialize;
#[derive(Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct Record {
    selection: Selection,
    clipboard_json: String,
    prefix: String,
    right: String,
}
impl RichReplica {
    /// Paste native-admitted flow/grid at an explicit general text target and retain the actual before-UI.
    /// Allocations remain consumed on failure. Original paste and journal entries keep their meanings;
    /// the additive compound tag is rejected by older runtimes that lack its declared capability.
    /// # Errors
    /// Guard/mode/read-only checks precede decoding. Wrong kind/schema, unsupported insertion starts,
    /// historical IDs, malformed fields or resource failure reject the whole staged owner.
    pub fn paste_general_flow_clipboard_namespace_json_guarded(
        &mut self,
        observation: &SharedObservation,
        input: &str,
    ) -> Result<bool, Error> {
        super::general_range_input_json::authorize(self, observation)?;
        let r: Record = super::general_range_input_json::decode(input)?;
        let context = super::paragraphs::context(&self.codec);
        let clip = RichClipboardJsonCodec::new(context)
            .decode(&r.clipboard_json)
            .map_err(|_| Error::Contract("general flow clipboard admission"))?;
        let deletion = self.plan_clipboard_flow_deletion(&r.selection, &r.prefix)?;
        let nodes =
            self.fresh_clipboard_nodes(&clip, &mut ClipboardNamespace::try_new(&r.prefix)?)?;
        let point = TextPoint { block: r.right.clone(), offset: 0, affinity: Affinity::After };
        self.apply_with_state(
            vec![Command::PasteGeneralFlowAtTextV1(PasteGeneralFlowAtTextV1 {
                deletion,
                right: r.right,
                nodes,
            })],
            SelectionUpdate::Set(Some(Selection::TextRange {
                anchor: point.clone(),
                focus: point,
            })),
            PendingFormatsUpdate::Set(None),
        )
    }

    pub(super) fn plan_clipboard_flow_deletion(
        &self,
        selection: &Selection,
        prefix: &str,
    ) -> Result<ReplaceGeneralTextRangeV1, Error> {
        let text = TextFragment::empty();
        let plan =
            RichGeneralRangePlan::capture(&self.document, &selection.admit(&self.document)?, &text)
                .map_err(|_| Error::Contract("general flow replacement plan"))?;
        let empty = allocate_general_range_paragraphs(prefix, plan.empty_blocks().len())
            .map_err(|_| Error::Contract("general flow floor namespace"))?;
        Ok(ReplaceGeneralTextRangeV1 {
            range: super::general_range_plan::request(&self.codec, selection, &text)?,
            empty: empty.iter().map(|id| id.as_str().into()).collect(),
        })
    }
}
