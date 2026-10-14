//! Shared semantic actions. Each mutation has its own named, documented source file.
mod delete_block;
mod delete_column;
mod delete_text;
mod insert_text;
mod move_block;
mod move_column;
mod replace_image;
mod resize_column;
mod resize_image;
mod set_format;
mod set_image_alt;

use crate::{Error, register::Stamp};
pub use delete_block::DeleteBlock;
pub use delete_column::DeleteColumn;
pub use delete_text::DeleteText;
pub use insert_text::InsertText;
use loro::LoroDoc;
pub use move_block::MoveBlock;
pub use move_column::MoveColumn;
pub use replace_image::ReplaceImage;
pub use resize_column::ResizeColumn;
pub use resize_image::ResizeImage;
use serde::{Deserialize, Serialize};
pub use set_format::SetFormat;
pub use set_image_alt::SetImageAlt;

/// One shared history group targets independent stable content identities.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", content = "data", rename_all = "snake_case", deny_unknown_fields)]
pub enum Command {
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
            Self::InsertText(value) => {
                super::model::text(doc, &value.block)?;
            }
            Self::DeleteText(value) => {
                super::model::text(doc, &value.block)?;
            }
            Self::SetFormat(value) => {
                super::model::text(doc, &value.block)?;
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
                super::placement::prepare(doc, value.parent.as_deref())?;
                super::model::metadata(doc, &value.block)?.ensure_mergeable_map("placements")?;
            }
            Self::MoveColumn(value) => {
                doc.get_map("columns")
                    .ensure_mergeable_map(&value.block)?
                    .ensure_mergeable_map("placements")?
                    .ensure_mergeable_map(&value.column)?;
            }
            Self::ResizeColumn(_) => {}
        }
        Ok(())
    }
    pub(super) fn apply(&self, doc: &LoroDoc, stamp: Stamp, ordinal: usize) -> Result<(), Error> {
        match self {
            Self::InsertText(value) => value.apply(doc),
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
