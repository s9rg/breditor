//! Remove one typed trigger range, then run one allowlisted command, as ONE native history unit.
//!
//! `{"kind":"replaceTriggerThen","data":{"selection":<same-block text range>,"command":<command>}}`.
//! The inner command is decoded by the ordinary closed command decoder and runs on the
//! post-removal publication; only the slash catalog's structural/format commands, which
//! address blocks by identity rather than text offsets, are admitted.
use super::{Command, CommandTag, support::decode};
use crate::{
    BreditorError,
    rich_editor::{error, selection::SelectionRecord},
};
use breditor_core::rich_content::{
    RichLocalOutcome, RichLocalSession, RichLocalSnapshot, RichTriggerStepError,
};
use serde::Deserialize;
use serde_json::value::RawValue;

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Record<'a> {
    selection: SelectionRecord,
    #[serde(borrow)]
    command: &'a RawValue,
}

/// The bounded follow-up allowlist: block-identity structural and block-format commands.
const fn admitted(tag: CommandTag) -> bool {
    matches!(
        tag,
        CommandTag::SetHeading
            | CommandTag::SetCodeBlock
            | CommandTag::WrapList
            | CommandTag::SetListKind
            | CommandTag::WrapTaskList
            | CommandTag::WrapBlockquote
            | CommandTag::WrapDetails
            | CommandTag::InsertHorizontalRule
            | CommandTag::InsertTable
            | CommandTag::InsertBlocks
            | CommandTag::InsertPageBreak
    )
}

pub(super) fn execute(
    owner: &mut RichLocalSession,
    observation: &RichLocalSnapshot,
    input: &str,
) -> Result<RichLocalOutcome, BreditorError> {
    let record: Record<'_> = decode(input)?;
    let inner: Command<'_> = decode(record.command.get())?;
    inner.validate_fields()?;
    if !admitted(inner.kind) {
        return Err(error::rejected("breditor_rich.trigger_command"));
    }
    let trigger = record.selection.into_kind()?;
    owner
        .replace_trigger_then(observation, &trigger, |scratch, removed| {
            super::execute(scratch, removed, record.command.get())
        })
        .map_err(|value| match value {
            RichTriggerStepError::Session(value) => error::session(&value),
            RichTriggerStepError::Step(value) => value,
        })
}
