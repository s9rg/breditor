//! Strict V4 bookmark intents.
//!
//! `setBookmark {block, name}` sets, replaces or (`name: null`) clears one text block's
//! bookmark without touching links; `renameBookmark {from, to}` renames one bookmark and
//! retargets every internal link to it in the same history group.
use super::support::{checked, dispatch};
use crate::{BreditorError, rich_editor::error};
use breditor_core::{
    codec::{decode_rich_rename_bookmark_command, decode_rich_set_bookmark_command},
    rich_content::{
        RichLocalOutcome, RichLocalSession, RichLocalSnapshot,
        actions::{RichAction, SetBookmark},
    },
};

pub(super) fn set(
    owner: &mut RichLocalSession,
    observation: &RichLocalSnapshot,
    input: &str,
) -> Result<RichLocalOutcome, BreditorError> {
    let (block, name) = decode_rich_set_bookmark_command(owner.context(), input)
        .map_err(|_| error::rejected("breditor_rich.bookmark_intent"))?;
    let action = checked(SetBookmark::capture(owner.state().document(), &block, name.as_ref()))?;
    dispatch(owner, observation, RichAction::SetBookmark(action))
}

pub(super) fn rename(
    owner: &mut RichLocalSession,
    observation: &RichLocalSnapshot,
    input: &str,
) -> Result<RichLocalOutcome, BreditorError> {
    let (from, to) = decode_rich_rename_bookmark_command(owner.context(), input)
        .map_err(|_| error::rejected("breditor_rich.bookmark_intent"))?;
    let action = checked(SetBookmark::rename(owner.state().document(), &from, &to))?;
    dispatch(owner, observation, RichAction::SetBookmark(action))
}
