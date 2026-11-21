//! Run several allowlisted ordinary commands as ONE native history unit (agent tool contract).
//!
//! `{"kind":"commandGroup","data":{"commands":[<command>, ...]}}` with 1–64 commands. Every
//! inner command is decoded and field-checked by the ordinary closed command decoder and its
//! kind checked against the allowlist BEFORE anything runs; each then runs through its normal
//! implementation against the publication left by the previous ones. Only text-range, inline
//! format and block-identity flow commands are admitted: no selection, typing, clipboard,
//! history, nested group or trigger composite.
use super::{Command, CommandTag, support::decode};
use crate::{BreditorError, rich_editor::error};
use breditor_core::rich_content::{
    RICH_COMMAND_GROUP_MAX_STEPS, RichCommandGroupError, RichLocalOutcome, RichLocalSession,
    RichLocalSnapshot,
};
use serde::Deserialize;
use serde_json::value::RawValue;

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Record<'a> {
    #[serde(borrow)]
    commands: Vec<&'a RawValue>,
}

/// The bounded step allowlist.
const fn admitted(tag: CommandTag) -> bool {
    matches!(
        tag,
        CommandTag::ReplaceTextRange
            | CommandTag::ReplaceGeneralRangePlainText
            | CommandTag::SetInlineFormat
            | CommandTag::ChangeInlineFormats
            | CommandTag::SetHeading
            | CommandTag::InsertBlocks
            | CommandTag::ReplaceBlocks
            | CommandTag::MoveBlock
    )
}

pub(super) fn execute(
    owner: &mut RichLocalSession,
    observation: &RichLocalSnapshot,
    input: &str,
) -> Result<RichLocalOutcome, BreditorError> {
    let record: Record<'_> = decode(input)?;
    if record.commands.is_empty() || record.commands.len() > RICH_COMMAND_GROUP_MAX_STEPS {
        return Err(error::rejected("breditor_rich.command_group"));
    }
    for raw in &record.commands {
        let inner: Command<'_> = decode(raw.get())?;
        inner.validate_fields()?;
        if !admitted(inner.kind) {
            return Err(error::rejected("breditor_rich.command_group"));
        }
    }
    owner
        .apply_command_group(observation, record.commands.len(), |scratch, observed, index| {
            super::execute(scratch, observed, record.commands[index].get())
        })
        .map_err(|value| match value {
            RichCommandGroupError::Session(value) => error::session(&value),
            RichCommandGroupError::Step { error, .. } => error,
        })
}
