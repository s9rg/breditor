//! Sequential list target admission, separate from the core's staged shape/ordinal capture.
use super::{Command, paragraphs::id, target_kinds::TargetKinds};
use crate::Error;
use breditor_core::rich_content::RichDocument;

pub(super) fn validate(
    command: &Command,
    document: &RichDocument,
    declared: &TargetKinds,
) -> Result<bool, Error> {
    let require = |block: &str, list: bool| -> Result<(), Error> {
        let kind = declared.kind(document, &id(block)?)?;
        if if list {
            matches!(kind.as_str(), "breditor/bullet-list" | "breditor/ordered-list")
        } else {
            kind == "breditor/list-item"
        } {
            Ok(())
        } else {
            Err(Error::Contract("shared list target kind"))
        }
    };
    let task = |block: &str, list: bool| -> Result<(), Error> {
        let expected = if list { "breditor/task-list" } else { "breditor/task-item" };
        if declared.kind(document, &id(block)?)? == expected {
            Ok(())
        } else {
            Err(Error::Contract("shared task target kind"))
        }
    };
    match command {
        Command::InsertHorizontalRule(value) => {
            if let Some(parent) = &value.parent {
                declared.kind(document, &id(parent)?)?;
            }
            if let Some(before) = &value.before {
                declared.kind(document, &id(before)?)?;
            }
        }
        Command::DeleteHorizontalRule(value) => {
            if declared.kind(document, &id(&value.block)?)? != "breditor/horizontal-rule" {
                return Err(Error::Contract("shared rule target kind"));
            }
        }
        Command::WrapBlockquote(value) => {
            declared.kind(document, &id(&value.first)?)?;
            declared.kind(document, &id(&value.last)?)?;
        }
        Command::UnwrapBlockquote(value) => {
            if declared.kind(document, &id(&value.wrapper)?)? != "breditor/blockquote" {
                return Err(Error::Contract("shared quote target kind"));
            }
        }
        Command::WrapTaskList(value) => {
            declared.require_text(document, &value.first)?;
            declared.kind(document, &id(&value.last)?)?;
        }
        Command::UnwrapTaskList(value) => task(&value.container, true)?,
        Command::IndentTaskItems(value) => {
            task(&value.container, true)?;
            task(&value.first, false)?;
            task(&value.last, false)?;
        }
        Command::OutdentTaskItems(value) => {
            task(&value.container, true)?;
            task(&value.first, false)?;
            task(&value.last, false)?;
        }
        Command::ExitTaskItem(value) => {
            task(&value.container, true)?;
            task(&value.item, false)?;
        }
        Command::SplitTaskItem(value) => declared.require_text(document, &value.block)?,
        Command::JoinTaskItems(value) => {
            task(&value.container, true)?;
            task(&value.left, false)?;
            task(&value.right, false)?;
        }
        Command::WrapList(value) => {
            declared.require_text(document, &value.first)?;
            declared.kind(document, &id(&value.last)?)?;
        }
        Command::UnwrapList(value) => require(&value.container, true)?,
        Command::SetListKind(value) => require(&value.container, true)?,
        Command::IndentListItems(value) => {
            require(&value.container, true)?;
            require(&value.first, false)?;
            require(&value.last, false)?;
        }
        Command::OutdentListItems(value) => {
            require(&value.container, true)?;
            require(&value.first, false)?;
            require(&value.last, false)?;
        }
        Command::SplitListItem(value) => declared.require_text(document, &value.block)?,
        Command::JoinListItems(value) => {
            require(&value.container, true)?;
            require(&value.left, false)?;
            require(&value.right, false)?;
        }
        _ => return Ok(false),
    }
    Ok(true)
}
