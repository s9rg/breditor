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
    match command {
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
