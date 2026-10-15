//! Frozen-observation reads of the original core formatting-state contract.
use super::{BreditorRichObservation, error};
use crate::BreditorError;
use breditor_core::{
    codec::encode_rich_inline_format_state, identity::QualifiedName,
    rich_content::inspect_inline_format,
};

pub(super) fn encode(
    observation: &BreditorRichObservation,
    kind: &str,
) -> Result<String, BreditorError> {
    let kind =
        QualifiedName::try_new(kind).map_err(|_| error::rejected("breditor_rich.inline_state"))?;
    let state = observation.inner.state();
    let value = inspect_inline_format(
        &observation.context,
        state.document(),
        state.selection(),
        state.pending_formats(),
        &kind,
    )
    .map_err(|_| error::rejected("breditor_rich.inline_state"))?;
    encode_rich_inline_format_state(&observation.context, &kind, &value)
        .map_err(|_| error::rejected("breditor_rich.inline_state"))
}
