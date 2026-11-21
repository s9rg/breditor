//! Closed semantic target checks; actual sequential shape admission happens on the staged owner.
use super::{Command, RichReplica, target_kinds::TargetKinds};
use crate::Error;
use breditor_core::{codec::RichFormatsJsonCodec, rich_content::BlockId, state::EditorContext};
use serde_json::{Value, json};
/// Read-only command context shared by live staged edits and disposable proposal forks.
pub(super) struct Context<'a> {
    pub codec: &'a breditor_core::codec::DocumentJsonCodecV2,
    pub doc: &'a loro::LoroDoc,
    pub document: &'a breditor_core::rich_content::RichDocument,
    pub canonical: &'a str,
    pub protocol: super::protocol::Protocol,
    pub general: bool,
    pub document_scope: bool,
}
impl Context<'_> {
    const fn document_selection_enabled(&self) -> bool {
        self.document_scope
    }
    const fn document_selected(&self) -> bool {
        self.document_scope
    }
    const fn general_ranges_enabled(&self) -> bool {
        self.general
    }
}
fn contract(_: impl std::fmt::Display) -> Error {
    Error::Contract("shared target admission")
}

pub(super) fn validate(owner: &RichReplica, commands: &[Command]) -> Result<(), Error> {
    validate_context(
        &Context {
            codec: &owner.codec,
            doc: &owner.doc,
            document: &owner.document,
            canonical: &owner.canonical,
            protocol: owner.protocol,
            general: owner.general_ranges_enabled(),
            document_scope: owner.document_selection_enabled() && owner.document_selected(),
        },
        commands,
    )
}
#[allow(clippy::too_many_lines)] // One arm per command kind keeps target validation auditable.
pub(super) fn validate_context(owner: &Context<'_>, commands: &[Command]) -> Result<(), Error> {
    let formats = RichFormatsJsonCodec::new(EditorContext::new(
        owner.codec.schema().clone(),
        owner.codec.limits().clone(),
    ));
    let mut declared = TargetKinds::default();
    for command in commands {
        if matches!(
            command,
            Command::ReplaceDocumentPlainTextV1(_)
                | Command::PasteDocumentClipboardV1(_)
                | Command::ChangeDocumentFormatsV1(_)
                | Command::ChangeDocumentLayoutV1(_)
        ) && (!owner.document_selection_enabled()
            || !owner.document_selected()
            || commands.len() != 1)
        {
            return Err(Error::Contract(
                "document replacement requires explicit scope/family and sole command",
            ));
        }
        if matches!(
            command,
            Command::PasteGeneralFlowAtTextV1(_)
                | Command::InsertGeneralParagraphV1(_)
                | Command::ReplaceMaskedGeneralTextRangeV1(_)
        ) && (!owner.general_ranges_enabled() || commands.len() != 1)
        {
            return Err(Error::Contract(
                "general compound requires its explicit history family and sole command",
            ));
        }
        if matches!(command, Command::SetBlockLayout(_) | Command::ChangeDocumentLayoutV1(_))
            && !owner.protocol.layout()
        {
            return Err(Error::Contract("shared layout requires model 13 or 14"));
        }
        if super::v4_block_fields::handles(command) {
            super::v4_block_fields::validate(owner.protocol, owner.document, &declared, command)?;
            declared.record(command)?;
            continue;
        }
        if command.requires_structural_v2() && !owner.protocol.structural() {
            return Err(Error::Contract("shared structural V2 command requires model 12"));
        }
        if super::planning::handles(command) {
            super::planning::validate(
                owner.codec,
                owner.doc,
                owner.document,
                owner.canonical,
                command,
            )?;
        } else if super::structure_v4_targets::validate(
            owner.protocol,
            command,
            owner.document,
            &declared,
        )? {
        } else if !super::list_targets::validate(command, owner.document, &declared)? {
            let block = BlockId::try_new(primary(command)?).map_err(contract)?;
            let kind = declared.kind(owner.document, &block)?;
            let expected = match command {
                Command::SetBlockLayout(_) => owner.protocol.layout_owner(&kind),
                Command::InsertText(_) | Command::DeleteText(_) | Command::SetHeading(_) => {
                    owner.protocol.text(&kind)
                }
                Command::SetCodeBlock(_) => {
                    owner.protocol.structural() && owner.protocol.text(&kind)
                }
                Command::SetCodeLanguage(_) => {
                    owner.protocol.structural() && kind == "breditor/code-block"
                }
                Command::SetTaskChecked(_) => {
                    owner.protocol.structural() && kind == "breditor/task-item"
                }
                Command::ReplaceTextRange(value) => {
                    matches!(kind.as_str(), "breditor/paragraph" | "breditor/heading")
                        || (owner.protocol.structural()
                            && kind == "breditor/code-block"
                            && value.anchor.block == value.focus.block)
                }
                Command::SetFormat(_) | Command::SplitTextBlock(_) | Command::JoinTextBlocks(_) => {
                    matches!(kind.as_str(), "breditor/paragraph" | "breditor/heading")
                }
                Command::SetImageAlt(_)
                | Command::SetImageCaption(_)
                | Command::ReplaceImage(_)
                | Command::ResizeImage(_)
                | Command::SetImageLink(_) => kind == "breditor/image",
                Command::ResizeColumn(_) | Command::MoveColumn(_) | Command::DeleteColumn(_) => {
                    kind == "breditor/table"
                }
                Command::MoveBlock(_) | Command::DeleteBlock(_) => true,
                Command::InsertMention(value) => {
                    value.anchor.block == value.focus.block
                        && matches!(
                            kind.as_str(),
                            "breditor/paragraph" | "breditor/heading" | "breditor/details-summary"
                        )
                }
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
        Command::SetBlockLayout(value) => &value.block,
        Command::SetCodeBlock(value) => &value.block,
        Command::SetCodeLanguage(value) => &value.block,
        Command::SetTaskChecked(value) => &value.block,
        Command::InsertText(value) => &value.block,
        Command::ReplaceTextRange(value) => &value.anchor.block,
        Command::SplitTextBlock(value) => &value.block,
        Command::JoinTextBlocks(value) => &value.left,
        Command::DeleteText(value) => &value.block,
        Command::SetFormat(value) => &value.block,
        Command::SetHeading(value) => &value.block,
        Command::SetImageAlt(value) => &value.block,
        Command::SetImageCaption(value) => &value.block,
        Command::ReplaceImage(value) => &value.block,
        Command::ResizeImage(value) => &value.block,
        Command::ResizeColumn(value) => &value.block,
        Command::MoveBlock(value) => &value.block,
        Command::DeleteBlock(value) => &value.block,
        Command::MoveColumn(value) => &value.block,
        Command::DeleteColumn(value) => &value.block,
        Command::InsertMention(value) => &value.anchor.block,
        Command::SetImageLink(value) => &value.block,
        _ => return Err(Error::Contract("unhandled shared primary target")),
    })
}
fn secondary(
    owner: &Context<'_>,
    command: &Command,
    declared: &TargetKinds,
    formats: &RichFormatsJsonCodec,
) -> Result<(), Error> {
    match command {
        Command::SetBlockLayout(value) => {
            breditor_core::codec::decode_rich_block_layout_patch(
                &super::paragraphs::context(owner.codec),
                &value.patch_json,
            )
            .map_err(contract)?;
        }
        Command::SetImageCaption(value) => value.validate_draft(owner.doc, owner.codec)?,
        Command::JoinTextBlocks(value) => declared.require_text(owner.document, &value.right)?,
        Command::ReplaceTextRange(value) => {
            let code = owner.protocol.structural()
                && value.anchor.block == value.focus.block
                && declared.kind(
                    owner.document,
                    &BlockId::try_new(&value.focus.block).map_err(contract)?,
                )? == "breditor/code-block";
            if !code {
                declared.require_text(owner.document, &value.focus.block)?;
            }
        }
        Command::SetFormat(value) => {
            formats.decode(&json!([value.format]).to_string()).map_err(contract)?;
        }
        Command::MoveBlock(value) => {
            if let Some(parent) = &value.parent {
                declared.kind(owner.document, &BlockId::try_new(parent).map_err(contract)?)?;
            }
        }
        Command::ResizeColumn(value) => {
            let raw: Value = serde_json::from_str(owner.canonical)?;
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
