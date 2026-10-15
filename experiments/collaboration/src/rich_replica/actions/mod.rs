//! Shared semantic actions. Each mutation has its own named, documented source file.
mod delete_block;
mod delete_column;
mod delete_text;
mod insert_blocks;
mod insert_column;
mod insert_row;
mod insert_text;
mod join_text_blocks;
mod merge_cells;
mod move_block;
mod move_column;
mod replace_image;
mod replace_text_range;
mod resize_column;
mod resize_image;
mod set_format;
mod set_header;
mod set_heading;
mod set_image_alt;
mod split_cell;
mod split_text_block;

use crate::{Error, register::Stamp};
pub use delete_block::DeleteBlock;
pub use delete_column::DeleteColumn;
pub use delete_text::DeleteText;
pub use insert_blocks::InsertBlocks;
pub use insert_column::InsertColumn;
pub use insert_row::InsertRow;
pub use insert_text::InsertText;
pub use join_text_blocks::JoinTextBlocks;
use loro::LoroDoc;
pub use merge_cells::MergeCells;
pub use move_block::MoveBlock;
pub use move_column::MoveColumn;
pub use replace_image::ReplaceImage;
pub use replace_text_range::{RangeTextRun, ReplaceTextRange};
pub use resize_column::ResizeColumn;
pub use resize_image::ResizeImage;
use serde::{Deserialize, Serialize};
pub use set_format::SetFormat;
pub use set_header::SetHeader;
pub use set_heading::SetHeading;
pub use set_image_alt::SetImageAlt;
pub use split_cell::SplitCell;
pub use split_text_block::SplitTextBlock;

/// One shared history group targets independent stable content identities.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", content = "data", rename_all = "snake_case", deny_unknown_fields)]
pub enum Command {
    /// Replace a rich selected range without recreating its retained suffix characters.
    ReplaceTextRange(ReplaceTextRange),
    /// Convert one text block's kind/rank without replacing text or another writer's intent.
    SetHeading(SetHeading),
    /// Split one admitted flow text block without recreating character identities.
    SplitTextBlock(SplitTextBlock),
    /// Join adjacent admitted text blocks, retaining both original source containers.
    JoinTextBlocks(JoinTextBlocks),
    /// Capture a merge-closed rectangle and own one non-destructive merge intent.
    MergeCells(MergeCells),
    /// Retract observed overlapping intents without redistributing cell text.
    SplitCell(SplitCell),
    /// Create fresh flow content and its independent descendants.
    InsertBlocks(InsertBlocks),
    /// Create a stable table row with canonical empty intersections.
    InsertRow(InsertRow),
    /// Create a stable table column with canonical empty intersections.
    InsertColumn(InsertColumn),
    /// Set each selected base cell's independently owned header flag.
    SetHeader(SetHeader),
    /// Insert scalar-aligned text into a stable block.
    InsertText(InsertText),
    /// Delete scalar-aligned text without replacing its container.
    DeleteText(DeleteText),
    /// Own one typed-format contribution; undo cannot erase another writer's format.
    SetFormat(SetFormat),
    /// Set the paired description/decorative semantic field.
    SetImageAlt(SetImageAlt),
    /// Replace the paired immutable asset/generation semantic field.
    ReplaceImage(ReplaceImage),
    /// Set or clear paired image dimensions.
    ResizeImage(ResizeImage),
    /// Set a stable table/column width contribution.
    ResizeColumn(ResizeColumn),
    /// Move an existing structural node with retained identity and descendants.
    MoveBlock(MoveBlock),
    /// Hide an existing structural node; descendant text remains causal state.
    DeleteBlock(DeleteBlock),
    /// Move a stable column without rebuilding cell bodies.
    MoveColumn(MoveColumn),
    /// Hide one column without deleting its underlying cell content.
    DeleteColumn(DeleteColumn),
}
impl Command {
    pub(super) fn prepare(&self, doc: &LoroDoc) -> Result<(), Error> {
        match self {
            Self::ReplaceTextRange(value) => value.prepare(doc)?,
            Self::SetHeading(value) => value.prepare(doc)?,
            Self::SplitTextBlock(value) => value.prepare(doc)?,
            Self::JoinTextBlocks(value) => value.prepare(doc)?,
            Self::MergeCells(value) => value.prepare(doc)?,
            Self::SplitCell(value) => value.prepare(doc)?,
            Self::InsertBlocks(value) => value.prepare(doc)?,
            Self::InsertRow(value) => value.prepare(doc)?,
            Self::InsertColumn(value) => value.prepare(doc)?,
            Self::SetHeader(value) => value.prepare(doc)?,
            Self::InsertText(value) => {
                super::text_flow::prepare_root(doc, &value.block)?;
            }
            Self::DeleteText(value) => {
                super::text_flow::prepare_root(doc, &value.block)?;
            }
            Self::SetFormat(value) => {
                super::text_flow::prepare_root(doc, &value.block)?;
            }
            Self::SetImageAlt(value) => {
                prepare_field(doc, &value.block, "image-alt")?;
            }
            Self::ReplaceImage(value) => {
                prepare_field(doc, &value.block, "image-asset")?;
            }
            Self::ResizeImage(value) => {
                prepare_field(doc, &value.block, "image-size")?;
            }
            Self::DeleteBlock(value) => {
                super::model::metadata(doc, &value.block)?.ensure_mergeable_map("deletions")?;
            }
            Self::DeleteColumn(value) => {
                doc.get_map("columns")
                    .ensure_mergeable_map(&value.block)?
                    .ensure_mergeable_map("deletions")?
                    .ensure_mergeable_map(&value.column)?;
            }
            Self::MoveBlock(value) => {
                if let Some(parent) = &value.parent
                    && super::model::optional_metadata(doc, parent).is_none()
                {
                    super::creation::activate_cell(doc, parent)?;
                }
                super::placement::prepare(doc, value.parent.as_deref())?;
                super::model::metadata(doc, &value.block)?.ensure_mergeable_map("placements")?;
            }
            Self::MoveColumn(value) => {
                doc.get_map("columns")
                    .ensure_mergeable_map(&value.block)?
                    .ensure_mergeable_map("placements")?
                    .ensure_mergeable_map(&value.column)?;
            }
            Self::ResizeColumn(value) => {
                doc.get_map("columns")
                    .ensure_mergeable_map(&value.block)?
                    .ensure_mergeable_map("widths")?
                    .ensure_mergeable_map(&value.column)?
                    .ensure_mergeable_map("width")?;
            }
        }
        Ok(())
    }
    pub(super) fn apply(
        &self,
        doc: &LoroDoc,
        codec: &breditor_core::codec::DocumentJsonCodecV2,
        document: &breditor_core::rich_content::RichDocument,
        stamp: Stamp,
        ordinal: usize,
    ) -> Result<(), Error> {
        match self {
            Self::ReplaceTextRange(value) => value.apply(doc, codec, document, stamp),
            Self::SetHeading(value) => value.apply(doc, codec, document, stamp),
            Self::SplitTextBlock(value) => value.apply(doc, codec, document, stamp, ordinal),
            Self::JoinTextBlocks(value) => value.apply(doc, codec, document),
            Self::MergeCells(value) => value.apply(doc, codec, document, stamp),
            Self::SplitCell(value) => value.apply(doc, codec, document, stamp),
            Self::InsertBlocks(value) => value.apply(doc, stamp, ordinal),
            Self::InsertRow(value) => value.apply(doc, stamp, ordinal),
            Self::InsertColumn(value) => value.apply(doc, stamp),
            Self::SetHeader(value) => value.apply(doc, stamp),
            Self::InsertText(value) => value.apply(doc, stamp),
            Self::DeleteText(value) => value.apply(doc),
            Self::SetFormat(value) => value.apply(doc, stamp, ordinal),
            Self::SetImageAlt(value) => value.apply(doc, stamp),
            Self::ReplaceImage(value) => value.apply(doc, stamp),
            Self::ResizeImage(value) => value.apply(doc, stamp),
            Self::ResizeColumn(value) => value.apply(doc, stamp),
            Self::MoveBlock(value) => value.apply(doc, stamp, ordinal),
            Self::DeleteBlock(value) => value.apply(doc, stamp),
            Self::MoveColumn(value) => value.apply(doc, stamp, ordinal),
            Self::DeleteColumn(value) => value.apply(doc, stamp),
        }
    }
}

fn prepare_field(doc: &LoroDoc, block: &str, field: &str) -> Result<(), Error> {
    super::model::metadata(doc, block)?
        .ensure_mergeable_map("effects")?
        .ensure_mergeable_map(field)?;
    Ok(())
}
