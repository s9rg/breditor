//! Strict bounded candidate-V4 list numbering intent on one explicit ordered list.
use super::support::{checked, dispatch};
use crate::{BreditorError, rich_editor::error};
use breditor_core::{
    codec::decode_rich_list_numbering_command,
    rich_content::{
        RichLocalOutcome, RichLocalSession, RichLocalSnapshot,
        actions::{RichAction, SetListNumbering},
    },
};
pub(super) fn execute(
    owner: &mut RichLocalSession,
    observation: &RichLocalSnapshot,
    input: &str,
) -> Result<RichLocalOutcome, BreditorError> {
    let (list, patch) = decode_rich_list_numbering_command(owner.context(), input)
        .map_err(|_| error::rejected("breditor_rich.list_numbering_intent"))?;
    let action = checked(SetListNumbering::capture(owner.state().document(), &list, &patch))?;
    dispatch(owner, observation, RichAction::SetListNumbering(action))
}
