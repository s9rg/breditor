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
    encode_with_policy(observation, false)
}
pub(super) fn encode_general(
    observation: &BreditorRichObservation,
) -> Result<Option<String>, BreditorError> {
    encode_with_policy(observation, true)
}
fn encode_with_policy(
    observation: &BreditorRichObservation,
    general: bool,
) -> Result<Option<String>, BreditorError> {
    let state = observation.inner.state();
    let Some(selection) = state.selection() else {
        return Ok(None);
    };
    let capture = if general {
        RichClipboardFragment::copy_general_selection
    } else {
        RichClipboardFragment::copy_selection
    };
    let fragment = capture(&observation.context, state.document(), selection)
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
