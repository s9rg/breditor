//! Delete one rule; any sole-child replacement is explicit and schema-admitted.
use super::support::{checked, decode, dispatch};
use crate::BreditorError;
use breditor_core::rich_content::{
    BlockId, RichLocalOutcome, RichLocalSession, RichLocalSnapshot,
    actions::{DeleteHorizontalRule, RichAction},
};
use serde::Deserialize;
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Record {
    block: String,
    #[serde(deserialize_with = "super::support::nullable")]
    replacement: Option<super::drafts::FlowRecord>,
}
pub(super) fn execute(
    owner: &mut RichLocalSession,
    observation: &RichLocalSnapshot,
    input: &str,
) -> Result<RichLocalOutcome, BreditorError> {
    let record: Record = decode(input)?;
    let replacement = record.replacement.map(|value| value.draft(owner.context())).transpose()?;
    let action = checked(DeleteHorizontalRule::capture(
        owner.state().document(),
        &checked(BlockId::try_new(record.block))?,
        replacement,
    ))?;
    dispatch(owner, observation, RichAction::DeleteHorizontalRule(action))
}
