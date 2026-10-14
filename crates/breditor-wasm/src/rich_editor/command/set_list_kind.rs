//! Switch bullet/numbered style with an explicit checked starting ordinal.
use super::drafts::list_kind;
use super::support::{checked, decode, dispatch};
use crate::BreditorError;
use breditor_core::rich_content::{
    BlockId, RichLocalOutcome, RichLocalSession, RichLocalSnapshot,
    actions::{RichAction, SetListKind},
};
use serde::Deserialize;
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Record {
    list: String,
    #[serde(deserialize_with = "super::support::nullable")]
    start: Option<u32>,
}
pub(super) fn execute(
    owner: &mut RichLocalSession,
    observation: &RichLocalSnapshot,
    input: &str,
) -> Result<RichLocalOutcome, BreditorError> {
    let record: Record = decode(input)?;
    let action = checked(SetListKind::capture(
        owner.state().document(),
        &checked(BlockId::try_new(record.list))?,
        list_kind(record.start)?,
    ))?;
    dispatch(owner, observation, RichAction::SetListKind(action))
}
