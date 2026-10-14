//! Routing only; each rich action's parsing and implementation lives in its own file.
use super::CommandTag;
use crate::BreditorError;
use breditor_core::rich_content::{RichLocalOutcome, RichLocalSession, RichLocalSnapshot};
pub(super) fn execute(
    tag: CommandTag,
    owner: &mut RichLocalSession,
    observation: &RichLocalSnapshot,
    input: &str,
) -> Result<RichLocalOutcome, BreditorError> {
    match tag {
        CommandTag::PasteInlineClipboard => {
            super::paste_inline_clipboard::execute(owner, observation, input)
        }
        CommandTag::PasteFlowClipboard => {
            super::paste_flow_clipboard::execute(owner, observation, input)
        }
        CommandTag::PasteGridClipboard => {
            super::paste_grid_clipboard::execute(owner, observation, input)
        }
        CommandTag::InsertTable => super::insert_table::execute(owner, observation, input),
        CommandTag::InsertImage => super::insert_image::execute(owner, observation, input),
        CommandTag::DeleteTable => super::delete_table::execute(owner, observation, input),
        CommandTag::DeleteImage => super::delete_image::execute(owner, observation, input),
        CommandTag::InsertTableRow => super::insert_table_row::execute(owner, observation, input),
        CommandTag::DeleteTableRow => super::delete_table_row::execute(owner, observation, input),
        CommandTag::DeleteTableColumn => {
            super::delete_table_column::execute(owner, observation, input)
        }
        CommandTag::MoveTableRow => super::move_table_row::execute(owner, observation, input),
        CommandTag::MoveTableColumn => super::move_table_column::execute(owner, observation, input),
        CommandTag::ResizeTableColumn => {
            super::resize_table_column::execute(owner, observation, input)
        }
        CommandTag::SplitTableCell => super::split_table_cell::execute(owner, observation, input),
        CommandTag::ReplaceImage => super::replace_image::execute(owner, observation, input),
        CommandTag::SetImageAlt => super::set_image_alt::execute(owner, observation, input),
        CommandTag::ResizeImage => super::resize_image::execute(owner, observation, input),
        CommandTag::SetImageCaption => super::set_image_caption::execute(owner, observation, input),
        CommandTag::SetTableHeader => super::set_table_header::execute(owner, observation, input),
        CommandTag::InsertBlocks => super::insert_blocks::execute(owner, observation, input),
        CommandTag::InsertTableColumn => {
            super::insert_table_column::execute(owner, observation, input)
        }
        CommandTag::MergeTableCells => super::merge_table_cells::execute(owner, observation, input),
        CommandTag::ClearTableCells => super::clear_table_cells::execute(owner, observation, input),
        CommandTag::NavigateGrid => super::navigate_grid::execute(owner, observation, input),
        CommandTag::WrapList => super::wrap_list::execute(owner, observation, input),
        CommandTag::UnwrapList => super::unwrap_list::execute(owner, observation, input),
        CommandTag::SetListKind => super::set_list_kind::execute(owner, observation, input),
        CommandTag::OutdentListItems => {
            super::outdent_list_items::execute(owner, observation, input)
        }
        CommandTag::JoinTextBlocks => super::join_text_blocks::execute(owner, observation, input),
        CommandTag::JoinListItems => super::join_list_items::execute(owner, observation, input),
        CommandTag::ReplaceBlocks => super::replace_blocks::execute(owner, observation, input),
        CommandTag::IndentListItems => super::indent_list_items::execute(owner, observation, input),
        CommandTag::InsertFormattedText => {
            super::insert_formatted_text::execute(owner, observation, input)
        }
        CommandTag::SetInlineFormat => super::set_inline_format::execute(owner, observation, input),
        CommandTag::SplitTextBlock => super::split_text_block::execute(owner, observation, input),
        CommandTag::SplitListItem => super::split_list_item::execute(owner, observation, input),
        _ => Err(super::invalid()),
    }
}
