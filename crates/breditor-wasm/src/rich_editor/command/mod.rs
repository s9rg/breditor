//! Closed rich commands with borrowed raw fields and exact per-kind field sets.
//!
//! Raw payloads are decoded directly from JSON, not from serde's internally
//! tagged content buffer. Present null fields remain distinct from missing ones.

mod bookmark;
mod change_inline_formats;
mod change_selection_case;
mod change_selection_formats;
mod change_selection_layout;
mod clear_table_cells;
mod clipboard_ids;
mod command_group;
mod data_dispatch;
mod delete_atom;
mod delete_horizontal_rule;
mod delete_image;
mod delete_selection;
mod delete_table;
mod delete_table_column;
mod delete_table_row;
mod delete_typing_range;
mod details;
mod drafts;
mod drop_text;
mod exit_code_block;
mod exit_task_item;
mod flow_direction;
mod indent_list_items;
mod indent_task_items;
mod input_plan;
mod insert_blocks;
mod insert_formatted_text;
mod insert_general_paragraph;
mod insert_hard_break;
mod insert_horizontal_rule;
mod insert_image;
mod insert_mention;
pub(super) mod insert_paragraph;
mod insert_paragraph_adjacent;
mod insert_plain_text;
mod insert_table;
mod insert_table_column;
mod insert_table_row;
mod insert_typing_text;
mod join_list_items;
mod join_task_items;
mod join_text_blocks;
mod list_numbering;
mod merge_table_cells;
mod move_block;
mod move_table_column;
mod move_table_row;
mod navigate_flow;
mod navigate_grid;
mod outdent_list_items;
mod outdent_task_items;
mod page_break;
mod paste_flow_at_text;
mod paste_flow_clipboard;
mod paste_general_flow_clipboard;
mod paste_general_inline_clipboard;
mod paste_grid_clipboard;
mod paste_inline_clipboard;
mod redo;
mod replace_atom_plain_text;
mod replace_atom_typing_text;
mod replace_blocks;
mod replace_general_range_plain_text;
mod replace_general_range_text;
mod replace_general_range_typing_text;
mod replace_image;
mod replace_text_range;
mod replace_trigger_then;
mod resize_image;
mod resize_table_column;
mod set_code_block;
mod set_code_language;
mod set_heading;
mod set_image_alt;
mod set_image_caption;
mod set_image_link;
mod set_inline_format;
mod set_list_kind;
mod set_pending_formats;
mod set_selection;
mod set_table_header;
mod set_task_checked;
mod set_text_language;
mod split_list_item;
mod split_list_item_block;
mod split_support;
mod split_table_cell;
mod split_task_item;
mod split_text_block;
mod support;
mod table_caption;
mod undo;
mod unwrap_blockquote;
mod unwrap_list;
mod unwrap_task_list;
mod wrap_blockquote;
mod wrap_list;
mod wrap_task_list;

use super::error;
use crate::BreditorError;
use breditor_core::rich_content::{RichLocalOutcome, RichLocalSession, RichLocalSnapshot};
use serde::{Deserialize, Deserializer};
use serde_json::value::RawValue;

#[derive(Clone, Copy, Deserialize)]
#[serde(rename_all = "camelCase")]
enum CommandTag {
    PasteGeneralInlineClipboard,
    PasteGeneralFlowClipboard,
    InsertGeneralParagraph,
    ReplaceGeneralRangeText,
    ReplaceGeneralRangePlainText,
    ReplaceGeneralRangeTypingText,
    ChangeSelectionLayout,
    ChangeSelectionFormats,
    DeleteAtom,
    ReplaceAtomPlainText,
    ReplaceAtomTypingText,
    NavigateFlow,
    InsertParagraphAdjacent,
    InsertTypingText,
    DeleteTypingRange,
    IndentTaskItems,
    OutdentTaskItems,
    ExitTaskItem,
    SplitTaskItem,
    JoinTaskItems,
    SetCodeBlock,
    SetCodeLanguage,
    ExitCodeBlock,
    SetTaskChecked,
    WrapBlockquote,
    UnwrapBlockquote,
    WrapTaskList,
    UnwrapTaskList,
    InsertHorizontalRule,
    DeleteHorizontalRule,
    SetSelection,
    InsertPlainText,
    InsertHardBreak,
    InsertParagraph,
    PasteFlowAtText,
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
    MoveBlock,
    DropText,
    MoveTableRow,
    MoveTableColumn,
    ResizeTableColumn,
    SplitTableCell,
    ReplaceImage,
    ReplaceTextRange,
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
    SetListNumbering,
    SetTextLanguage,
    SetImageLink,
    WrapDetails,
    UnwrapDetails,
    SetDetailsOpen,
    EnterDetailsBody,
    InsertMention,
    AddTableCaption,
    RemoveTableCaption,
    InsertPageBreak,
    DeletePageBreak,
    SetBookmark,
    RenameBookmark,
    OutdentListItems,
    JoinTextBlocks,
    JoinListItems,
    ReplaceBlocks,
    IndentListItems,
    InsertFormattedText,
    SetInlineFormat,
    ChangeInlineFormats,
    SplitTextBlock,
    SplitListItem,
    InsertTableColumn,
    MergeTableCells,
    ClearTableCells,
    NavigateGrid,
    ReplaceTriggerThen,
    ChangeSelectionCase,
    CommandGroup,
    SplitListItemBlock,
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
            CommandTag::DeleteSelection
            | CommandTag::Undo
            | CommandTag::Redo
            | CommandTag::InsertHardBreak => 0,
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
    owner.validate_observation(observation).map_err(|value| error::session(&value))?;
    if input.len() > 1024 * 1024 {
        return Err(error::rejected("breditor_rich.command_limit"));
    }
    let command: Command<'_> = serde_json::from_str(input).map_err(|_| invalid())?;
    command.validate_fields()?;
    if owner.is_read_only()
        && !matches!(
            command.kind,
            CommandTag::SetSelection | CommandTag::NavigateGrid | CommandTag::NavigateFlow
        )
    {
        return Err(error::rejected("breditor_rich.read_only"));
    }
    match command.kind {
        CommandTag::InsertGeneralParagraph => insert_general_paragraph::execute(
            owner,
            observation,
            command.data.ok_or(invalid())?.get(),
        ),
        CommandTag::PasteGeneralFlowClipboard => paste_general_flow_clipboard::execute(
            owner,
            observation,
            command.data.ok_or(invalid())?.get(),
        ),
        CommandTag::PasteGeneralInlineClipboard => paste_general_inline_clipboard::execute(
            owner,
            observation,
            command.data.ok_or(invalid())?.get(),
        ),
        CommandTag::ReplaceGeneralRangeText => replace_general_range_text::execute(
            owner,
            observation,
            command.data.ok_or(invalid())?.get(),
        ),
        CommandTag::ReplaceGeneralRangePlainText => replace_general_range_plain_text::execute(
            owner,
            observation,
            command.data.ok_or(invalid())?.get(),
        ),
        CommandTag::ReplaceGeneralRangeTypingText => replace_general_range_typing_text::execute(
            owner,
            observation,
            command.data.ok_or(invalid())?.get(),
        ),
        CommandTag::ChangeSelectionLayout => change_selection_layout::execute(
            owner,
            observation,
            command.data.ok_or(invalid())?.get(),
        ),
        CommandTag::ChangeSelectionFormats => change_selection_formats::execute(
            owner,
            observation,
            command.data.ok_or(invalid())?.get(),
        ),
        CommandTag::DeleteAtom => {
            delete_atom::execute(owner, observation, command.data.ok_or(invalid())?.get())
        }
        CommandTag::ReplaceAtomPlainText => replace_atom_plain_text::execute(
            owner,
            observation,
            command.data.ok_or(invalid())?.get(),
        ),
        CommandTag::ReplaceAtomTypingText => replace_atom_typing_text::execute(
            owner,
            observation,
            command.data.ok_or(invalid())?.get(),
        ),
        CommandTag::SetSelection => {
            set_selection::execute(owner, observation, value(command.selection)?)
        }
        CommandTag::InsertPlainText => {
            insert_plain_text::execute(owner, observation, &value::<String>(command.text)?)
        }
        CommandTag::InsertHardBreak => insert_hard_break::execute(owner, observation),
        CommandTag::DeleteSelection => delete_selection::execute(owner, observation),
        CommandTag::Undo => undo::execute(owner, observation),
        CommandTag::Redo => redo::execute(owner, observation),
        CommandTag::SetHeading => set_heading::execute(
            owner,
            observation,
            &value::<String>(command.block)?,
            value(command.level)?,
        ),
        CommandTag::ReplaceTriggerThen => {
            replace_trigger_then::execute(owner, observation, command.data.ok_or(invalid())?.get())
        }
        CommandTag::CommandGroup => {
            command_group::execute(owner, observation, command.data.ok_or(invalid())?.get())
        }
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
