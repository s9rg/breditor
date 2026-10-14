//! Reorder a stable column and every corresponding base-cell body together.
use super::support::{checked, decode, dispatch};

use crate::BreditorError;
use breditor_core::rich_content::{
    RichLocalOutcome, RichLocalSession, RichLocalSnapshot,
    actions::{MoveTableColumn, RichAction},
};
use serde::Deserialize;
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Record {
    table: String,
    column: String,
    #[serde(deserialize_with = "super::support::nullable")]
    before: Option<String>,
}
pub(super) fn execute(
    owner: &mut RichLocalSession,
    observation: &RichLocalSnapshot,
    input: &str,
) -> Result<RichLocalOutcome, BreditorError> {
    let record: Record = decode(input)?;
    let action = checked(MoveTableColumn::capture(
        owner.state().document(),
        &checked(breditor_core::rich_content::TableId::try_new(record.table))?,
        &checked(breditor_core::rich_content::ColumnId::try_new(record.column))?,
        record
            .before
            .map(breditor_core::rich_content::ColumnId::try_new)
            .map(checked)
            .transpose()?
            .as_ref(),
    ))?;
    dispatch(owner, observation, RichAction::MoveTableColumn(action))
}
