//! Closed rich commands with borrowed raw fields and exact per-kind field sets.
//!
//! Raw payloads are decoded directly from JSON, not from serde's internally
//! tagged content buffer. Present null fields remain distinct from missing ones.

mod clear_table_cells;
mod clipboard_ids;
mod data_dispatch;
mod delete_image;
mod delete_selection;
mod delete_table;
mod delete_table_column;
mod delete_table_row;
mod drafts;
mod indent_list_items;
mod insert_blocks;
mod insert_formatted_text;
mod insert_image;
mod insert_plain_text;
mod insert_table;
mod insert_table_column;
mod insert_table_row;
mod join_list_items;
mod join_text_blocks;
mod merge_table_cells;
mod move_table_column;
mod move_table_row;
mod navigate_grid;
mod outdent_list_items;
mod paste_flow_clipboard;
mod paste_grid_clipboard;
mod paste_inline_clipboard;
mod redo;
mod replace_blocks;
mod replace_image;
mod resize_image;
mod resize_table_column;
mod set_heading;
mod set_image_alt;
mod set_image_caption;
mod set_inline_format;
mod set_list_kind;
mod set_pending_formats;
mod set_selection;
mod set_table_header;
mod split_list_item;
mod split_support;
mod split_table_cell;
mod split_text_block;
mod support;
mod undo;
mod unwrap_list;
mod wrap_list;

use super::error;
use crate::BreditorError;
use breditor_core::rich_content::{RichLocalOutcome, RichLocalSession, RichLocalSnapshot};
use serde::{Deserialize, Deserializer};
use serde_json::value::RawValue;

#[derive(Clone, Copy, Deserialize)]
#[serde(rename_all = "camelCase")]
enum CommandTag {
    SetSelection,
    InsertPlainText,
    DeleteSelection,
    Undo,
    Redo,
    SetHeading,
    SetPendingFormats,
    InsertTable,
    InsertImage,
    DeleteTable,
    DeleteImage,
    InsertTableRow,
    DeleteTableRow,
    DeleteTableColumn,
    MoveTableRow,
    MoveTableColumn,
    ResizeTableColumn,
    SplitTableCell,
    ReplaceImage,
    SetImageAlt,
    ResizeImage,
    SetImageCaption,
    SetTableHeader,
    InsertBlocks,
    PasteInlineClipboard,
    PasteFlowClipboard,
    PasteGridClipboard,
    WrapList,
    UnwrapList,
    SetListKind,
    OutdentListItems,
    JoinTextBlocks,
    JoinListItems,
    ReplaceBlocks,
    IndentListItems,
    InsertFormattedText,
    SetInlineFormat,
    SplitTextBlock,
    SplitListItem,
    InsertTableColumn,
    MergeTableCells,
    ClearTableCells,
    NavigateGrid,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Command<'a> {
    kind: CommandTag,
    #[serde(default, borrow, deserialize_with = "present")]
    selection: Option<&'a RawValue>,
    #[serde(default, borrow, deserialize_with = "present")]
    text: Option<&'a RawValue>,
    #[serde(default, borrow, deserialize_with = "present")]
    block: Option<&'a RawValue>,
    #[serde(default, borrow, deserialize_with = "present")]
    level: Option<&'a RawValue>,
    #[serde(default, borrow, deserialize_with = "present")]
    formats: Option<&'a RawValue>,
    #[serde(default, borrow, deserialize_with = "present")]
    data: Option<&'a RawValue>,
}
fn present<'de, D: Deserializer<'de>>(decoder: D) -> Result<Option<&'de RawValue>, D::Error> {
    <&RawValue>::deserialize(decoder).map(Some)
}
fn value<T: serde::de::DeserializeOwned>(raw: Option<&RawValue>) -> Result<T, BreditorError> {
    serde_json::from_str(raw.ok_or(invalid())?.get()).map_err(|_| invalid())
}
const fn invalid() -> BreditorError {
    error::rejected("breditor_rich.command_json")
}
impl Command<'_> {
    fn validate_fields(&self) -> Result<(), BreditorError> {
        let fields = u8::from(self.selection.is_some())
            | (u8::from(self.text.is_some()) << 1)
            | (u8::from(self.block.is_some()) << 2)
            | (u8::from(self.level.is_some()) << 3)
            | (u8::from(self.formats.is_some()) << 4)
            | (u8::from(self.data.is_some()) << 5);
        let expected = match self.kind {
            CommandTag::SetSelection => 1,
            CommandTag::InsertPlainText => 2,
            CommandTag::SetHeading => 12,
            CommandTag::SetPendingFormats => 16,
            CommandTag::DeleteSelection | CommandTag::Undo | CommandTag::Redo => 0,
            _ => 32,
        };
        if fields != expected {
            return Err(invalid());
        }
        Ok(())
    }
}
pub(super) fn execute(
    owner: &mut RichLocalSession,
    observation: &RichLocalSnapshot,
    input: &str,
) -> Result<RichLocalOutcome, BreditorError> {
    if input.len() > 1024 * 1024 {
        return Err(error::rejected("breditor_rich.command_limit"));
    }
    let command: Command<'_> = serde_json::from_str(input).map_err(|_| invalid())?;
    command.validate_fields()?;
    match command.kind {
        CommandTag::SetSelection => {
            set_selection::execute(owner, observation, value(command.selection)?)
        }
        CommandTag::InsertPlainText => {
            insert_plain_text::execute(owner, observation, &value::<String>(command.text)?)
        }
        CommandTag::DeleteSelection => delete_selection::execute(owner, observation),
        CommandTag::Undo => undo::execute(owner, observation),
        CommandTag::Redo => redo::execute(owner, observation),
        CommandTag::SetHeading => set_heading::execute(
            owner,
            observation,
            &value::<String>(command.block)?,
            value(command.level)?,
        ),
        CommandTag::SetPendingFormats => set_pending_formats::execute(
            owner,
            observation,
            command.formats.ok_or(invalid())?.get(),
        ),
        tag => {
            data_dispatch::execute(tag, owner, observation, command.data.ok_or(invalid())?.get())
        }
    }
}
