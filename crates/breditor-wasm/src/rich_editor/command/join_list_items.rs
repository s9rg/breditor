//! Join adjacent list items without moving later text before earlier media.
use super::support::{checked, decode, dispatch};

use crate::BreditorError;
use breditor_core::rich_content::{
    BlockId, RichLocalOutcome, RichLocalSession, RichLocalSnapshot,
    actions::{JoinListItems, RichAction},
};
use serde::Deserialize;
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Record {
    container: String,
    left: String,
    right: String,
    /// Multi-block merge: keep every right block (no text concatenation). Absent means the
    /// original text join, so existing command JSON is unchanged.
    #[serde(default)]
    blocks: bool,
}
pub(super) fn execute(
    owner: &mut RichLocalSession,
    observation: &RichLocalSnapshot,
    input: &str,
) -> Result<RichLocalOutcome, BreditorError> {
    let record: Record = decode(input)?;
    let capture =
        if record.blocks { JoinListItems::capture_blocks } else { JoinListItems::capture };
    let action = checked(capture(
        owner.state().document(),
        &checked(BlockId::try_new(record.container))?,
        &checked(BlockId::try_new(record.left))?,
        &checked(BlockId::try_new(record.right))?,
    ))?;
    dispatch(owner, observation, RichAction::JoinListItems(action))
}
