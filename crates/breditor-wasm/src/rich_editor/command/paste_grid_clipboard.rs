//! Paste a matching rich grid rectangle with fresh independent bodies and translated active merges.
use super::{
    clipboard_ids::Allocation,
    support::{checked, decode, dispatch},
};
use crate::BreditorError;
use breditor_core::{
    codec::RichClipboardJsonCodec,
    rich_content::{
        RichLocalOutcome, RichLocalSession, RichLocalSnapshot,
        actions::{PasteTableCells, RichAction},
    },
};
use serde::Deserialize;
#[derive(Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct Record {
    clipboard_json: String,
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
    let draft =
        checked(fragment.table_paste_draft(owner.context(), &mut record.allocation.allocator()?))?;
    let action = checked(PasteTableCells::capture(
        owner.state().document(),
        owner.state().selection().ok_or(super::invalid())?,
        draft,
    ))?;
    dispatch(owner, observation, RichAction::PasteTableCells(action))
}
