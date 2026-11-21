//! Closed target checks of the shared V4 structure commands (sections, page breaks and
//! table captions). Final shape admission is the frozen core action on the staged owner.
use super::{Command, paragraphs::id, protocol::Protocol, target_kinds::TargetKinds};
use crate::Error;
use breditor_core::rich_content::RichDocument;

/// `Ok(false)` for every other command.
pub(super) fn validate(
    protocol: Protocol,
    command: &Command,
    document: &RichDocument,
    declared: &TargetKinds,
) -> Result<bool, Error> {
    let kind = |block: &str| declared.kind(document, &id(block)?);
    let require = |block: &str, expected: &str| -> Result<(), Error> {
        if kind(block)? == expected {
            Ok(())
        } else {
            Err(Error::Contract("shared V4 structure target kind"))
        }
    };
    let v4 = || {
        if protocol.v4() {
            Ok(())
        } else {
            Err(Error::Contract("shared V4 structure command requires model 14"))
        }
    };
    match command {
        Command::WrapDetails(value) => {
            v4()?;
            kind(&value.first)?;
            kind(&value.last)?;
        }
        Command::UnwrapDetails(value) => {
            v4()?;
            require(&value.wrapper, "breditor/details")?;
        }
        Command::InsertPageBreak(value) => {
            v4()?;
            if let Some(before) = &value.before {
                kind(before)?;
            }
        }
        Command::DeletePageBreak(value) => {
            v4()?;
            require(&value.block, "breditor/page-break")?;
        }
        Command::AddTableCaption(value) => {
            v4()?;
            require(&value.block, "breditor/table")?;
        }
        Command::RemoveTableCaption(value) => {
            v4()?;
            require(&value.block, "breditor/table")?;
        }
        _ => return Ok(false),
    }
    Ok(true)
}
