//! Closed semantic target checks; actual sequential shape admission happens on the staged owner.
use super::{Command, RichReplica, target_kinds::TargetKinds};
use crate::Error;
use breditor_core::{codec::RichFormatsJsonCodec, rich_content::BlockId, state::EditorContext};
use serde_json::{Value, json};
fn contract(_: impl std::fmt::Display) -> Error {
    Error::Contract("shared target admission")
}

pub(super) fn validate(owner: &RichReplica, commands: &[Command]) -> Result<(), Error> {
    let formats = RichFormatsJsonCodec::new(EditorContext::new(
        owner.codec.schema().clone(),
        owner.codec.limits().clone(),
    ));
    let mut declared = TargetKinds::default();
    for command in commands {
        if super::planning::handles(command) {
            super::planning::validate(
                &owner.codec,
                &owner.doc,
                &owner.document,
                &owner.canonical,
                command,
            )?;
        } else if !super::list_targets::validate(command, &owner.document, &declared)? {
            let block = BlockId::try_new(primary(command)?).map_err(contract)?;
            let kind = declared.kind(&owner.document, &block)?;
            let expected = match command {
                Command::InsertText(_)
                | Command::ReplaceTextRange(_)
                | Command::DeleteText(_)
                | Command::SetFormat(_)
                | Command::SetHeading(_)
                | Command::SplitTextBlock(_)
                | Command::JoinTextBlocks(_) => {
                    matches!(kind.as_str(), "breditor/paragraph" | "breditor/heading")
                }
                Command::SetImageAlt(_) | Command::ReplaceImage(_) | Command::ResizeImage(_) => {
                    kind == "breditor/image"
                }
                Command::ResizeColumn(_) | Command::MoveColumn(_) | Command::DeleteColumn(_) => {
                    kind == "breditor/table"
                }
                Command::MoveBlock(_) | Command::DeleteBlock(_) => true,
                _ => return Err(Error::Contract("unhandled shared target kind")),
            };
            if !expected {
                return Err(Error::Contract("shared action target kind"));
            }
            secondary(owner, command, &declared, &formats)?;
        }
        declared.record(command)?;
    }
    Ok(())
}
fn primary(command: &Command) -> Result<&str, Error> {
    Ok(match command {
        Command::InsertText(value) => &value.block,
        Command::ReplaceTextRange(value) => &value.anchor.block,
        Command::SplitTextBlock(value) => &value.block,
        Command::JoinTextBlocks(value) => &value.left,
        Command::DeleteText(value) => &value.block,
        Command::SetFormat(value) => &value.block,
        Command::SetHeading(value) => &value.block,
        Command::SetImageAlt(value) => &value.block,
        Command::ReplaceImage(value) => &value.block,
        Command::ResizeImage(value) => &value.block,
        Command::ResizeColumn(value) => &value.block,
        Command::MoveBlock(value) => &value.block,
        Command::DeleteBlock(value) => &value.block,
        Command::MoveColumn(value) => &value.block,
        Command::DeleteColumn(value) => &value.block,
        _ => return Err(Error::Contract("unhandled shared primary target")),
    })
}
fn secondary(
    owner: &RichReplica,
    command: &Command,
    declared: &TargetKinds,
    formats: &RichFormatsJsonCodec,
) -> Result<(), Error> {
    match command {
        Command::JoinTextBlocks(value) => declared.require_text(&owner.document, &value.right)?,
        Command::ReplaceTextRange(value) => {
            declared.require_text(&owner.document, &value.focus.block)?;
        }
        Command::SetFormat(value) => {
            formats.decode(&json!([value.format]).to_string()).map_err(contract)?;
        }
        Command::MoveBlock(value) => {
            if let Some(parent) = &value.parent {
                declared.kind(&owner.document, &BlockId::try_new(parent).map_err(contract)?)?;
            }
        }
        Command::ResizeColumn(value) => {
            let raw: Value = serde_json::from_str(&owner.canonical)?;
            if !find_column(&raw["root"], &value.block, &value.column) {
                return Err(Error::Contract("visible shared column target"));
            }
        }
        _ => {}
    }
    Ok(())
}
fn find_column(node: &Value, block: &str, column: &str) -> bool {
    if node.pointer("/properties/breditor~1block-id").and_then(Value::as_str) == Some(block) {
        return node
            .pointer("/properties/breditor~1columns")
            .and_then(Value::as_array)
            .is_some_and(|columns| {
                columns.iter().any(|value| value.get("id").and_then(Value::as_str) == Some(column))
            });
    }
    node.get("children")
        .and_then(Value::as_array)
        .is_some_and(|children| children.iter().any(|child| find_column(child, block, column)))
}
