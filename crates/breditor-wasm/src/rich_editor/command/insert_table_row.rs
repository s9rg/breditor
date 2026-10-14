//! Insert one complete explicitly identified row and its rich base-cell bodies.
use super::drafts::RowRecord;
use super::support::{checked, decode, dispatch};
use crate::BreditorError;
use breditor_core::rich_content::{
    RichLocalOutcome, RichLocalSession, RichLocalSnapshot,
    actions::{InsertTableRow, RichAction},
};
use serde::Deserialize;
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Record {
    table: String,
    #[serde(deserialize_with = "super::support::nullable")]
    before: Option<String>,
    row: RowRecord,
}
pub(super) fn execute(
    owner: &mut RichLocalSession,
    observation: &RichLocalSnapshot,
    input: &str,
) -> Result<RichLocalOutcome, BreditorError> {
    let record: Record = decode(input)?;
    let action = checked(InsertTableRow::capture(
        owner.state().document(),
        &checked(breditor_core::rich_content::TableId::try_new(record.table))?,
        record
            .before
            .map(breditor_core::rich_content::RowId::try_new)
            .map(checked)
            .transpose()?
            .as_ref(),
        record.row.draft(owner.context())?,
    ))?;
    dispatch(owner, observation, RichAction::InsertTableRow(action))
}
