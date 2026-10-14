//! Observed semantic clipboard transfer, read separately from external clipboard and Cut.
use super::{BreditorRichObservation, error};
use crate::BreditorError;
use breditor_core::{
    codec::RichClipboardJsonCodec,
    rich_content::{RichClipboardFragment, RichClipboardKind},
};
pub(super) fn encode(
    observation: &BreditorRichObservation,
) -> Result<Option<String>, BreditorError> {
    let state = observation.inner.state();
    let Some(selection) = state.selection() else {
        return Ok(None);
    };
    let fragment =
        RichClipboardFragment::copy_selection(&observation.context, state.document(), selection)
            .map_err(|_| error::rejected("breditor_rich.clipboard_read"))?;
    let Some(fragment) = fragment else {
        return Ok(None);
    };
    let structured = RichClipboardJsonCodec::new(observation.context.clone())
        .encode(&fragment)
        .map_err(|_| error::rejected("breditor_rich.clipboard_read"))?;
    let text =
        fragment.plain_text().map_err(|_| error::rejected("breditor_rich.clipboard_read"))?;
    Ok(Some(serde_json::json!({"format":"breditor/rich-clipboard-transfer","formatVersion":1,"kind":match fragment.kind(){RichClipboardKind::Text=>"text",RichClipboardKind::Flow=>"flow",RichClipboardKind::Grid=>"grid"},"structuredJson":structured,"plainText":text}).to_string()))
}
