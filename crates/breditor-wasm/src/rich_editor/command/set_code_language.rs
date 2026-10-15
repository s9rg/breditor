//! Set or explicitly remove one bounded inert code language.
use super::support::{checked, decode, dispatch};
use crate::BreditorError;
use breditor_core::rich_content::{
    BlockId, RichLocalOutcome, RichLocalSession, RichLocalSnapshot,
    actions::{RichAction, SetCodeLanguage},
};
use serde::Deserialize;
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Record {
    block: String,
    #[serde(deserialize_with = "super::support::nullable")]
    language: Option<String>,
}
pub(super) fn execute(
    owner: &mut RichLocalSession,
    observation: &RichLocalSnapshot,
    input: &str,
) -> Result<RichLocalOutcome, BreditorError> {
    let record: Record = decode(input)?;
    let language = record
        .language
        .map(breditor_core::rich_content::CodeLanguage::try_new)
        .map(checked)
        .transpose()?;
    let action = checked(SetCodeLanguage::capture(
        owner.state().document(),
        &checked(BlockId::try_new(record.block))?,
        language.as_ref(),
    ))?;
    dispatch(owner, observation, RichAction::SetCodeLanguage(action))
}
