//! Selected rich clipboard insertion is one source-preserving shared action and one UI recipe.
use super::{
    Command, PendingFormatsUpdate, RichReplica, SelectionUpdate, SharedObservation,
    actions::PasteFlowAtText,
    selection::{Selection, TextPoint},
};
use crate::{Error, anchor::Affinity};
use breditor_core::{codec::RichClipboardJsonCodec, rich_content::RichClipboardIdAllocator};
impl RichReplica {
    /// Replace selected text with whole fresh rich flow, leaving the caret in its retained suffix.
    /// # Errors
    /// Stale/foreign guards reject before decoding/allocation. Unsupported ranges/captions and
    /// failed admission preserve every published field; allocated host IDs remain consumed.
    pub fn paste_flow_at_text_guarded(
        &mut self,
        observation: &SharedObservation,
        input: &str,
        right: &str,
        allocator: &mut dyn RichClipboardIdAllocator,
    ) -> Result<bool, Error> {
        self.check(observation)?;
        let Some(Selection::TextRange { anchor, focus }) = self.selection()? else {
            return Err(Error::Contract("flow paste text selection"));
        };
        let fragment = RichClipboardJsonCodec::new(super::paragraphs::context(&self.codec))
            .decode(input)
            .map_err(|_| Error::Contract("shared clipboard decoding"))?;
        let nodes = self.fresh_clipboard_nodes(&fragment, allocator)?;
        let next = TextPoint { block: right.into(), offset: 0, affinity: Affinity::After };
        self.apply_with_state(
            vec![Command::PasteFlowAtText(PasteFlowAtText {
                anchor,
                focus,
                right: right.into(),
                nodes,
            })],
            SelectionUpdate::Set(Some(Selection::TextRange { anchor: next.clone(), focus: next })),
            PendingFormatsUpdate::Set(None),
        )
    }
}
