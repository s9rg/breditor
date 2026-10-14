//! Paste freshly re-keyed rich flow (or a copied grid as a whole table) at a stable flow position.
use super::{
    clipboard_ids::Allocation,
    drafts::PositionRecord,
    support::{checked, decode, dispatch},
};
use crate::BreditorError;
use breditor_core::{
    codec::RichClipboardJsonCodec,
    rich_content::{
        RichLocalOutcome, RichLocalSession, RichLocalSnapshot,
        actions::{InsertBlocks, RichAction},
    },
};
use serde::Deserialize;
#[derive(Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct Record {
    clipboard_json: String,
    position: PositionRecord,
    allocation: Allocation,
}
pub(super) fn execute(
    owner: &mut RichLocalSession,
    observation: &RichLocalSnapshot,
    input: &str,
) -> Result<RichLocalOutcome, BreditorError> {
    let record: Record = decode(input)?;
    let fragment = checked(
        RichClipboardJsonCodec::new(owner.context().clone()).decode(&record.clipboard_json),
    )?;
    let drafts =
        checked(fragment.flow_drafts(owner.context(), &mut record.allocation.allocator()?))?;
    let action = checked(InsertBlocks::capture(
        owner.state().document(),
        &record.position.position()?,
        drafts,
    ))?;
    dispatch(owner, observation, RichAction::InsertBlocks(action))
}
