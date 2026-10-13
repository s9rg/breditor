//! Closed feasibility commands. Each mutation has its own documented module.
//!
//! These deliberately do not claim to be the rich-editor action API. They prove
//! journal ownership, atomic grouping and replication before the AST adapter.

mod delete_text;
mod insert_text;
mod resize_column;
mod set_image_alt;
mod set_image_asset;
mod set_strong;

use crate::{Error, register::Stamp};
use loro::{ContainerID, ContainerType, LoroDoc, LoroText};
use serde::{Deserialize, Serialize};

pub use delete_text::DeleteText;
pub use insert_text::InsertText;
pub use resize_column::ResizeColumn;
pub use set_image_alt::SetImageAlt;
pub use set_image_asset::SetImageAsset;
pub use set_strong::SetStrong;

/// The fixed text location or a canonically keyed cell in the replication probe.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case", deny_unknown_fields)]
pub enum TextTarget {
    /// The probe's root body text.
    Body,
    /// A mergeable cell body. Length-prefixed keys cannot alias via separators.
    Cell {
        /// Stable table identity, independent of display position.
        table: String,
        /// Stable row identity.
        row: String,
        /// Stable column identity.
        column: String,
    },
}

pub(crate) fn validate_id(id: &str) -> Result<(), Error> {
    breditor_core::rich_content::BlockId::try_new(id)
        .map(|_| ())
        .map_err(|_| Error::Contract("identity"))
}

impl TextTarget {
    fn cell_key(table: &str, row: &str, column: &str) -> Result<String, Error> {
        validate_id(table)?;
        validate_id(row)?;
        validate_id(column)?;
        Ok(format!("{}:{table}{}:{row}{}:{column}", table.len(), row.len(), column.len()))
    }

    pub(crate) fn existing_cell_text(doc: &LoroDoc, key: &str) -> Option<LoroText> {
        let cells = ContainerID::new_root("cells", ContainerType::Map);
        let cell = ContainerID::new_mergeable(&cells, key, ContainerType::Map);
        let body = ContainerID::new_mergeable(&cell, "body", ContainerType::Text);
        doc.try_get_text(body)
    }

    pub(crate) fn text(&self, doc: &LoroDoc) -> Result<LoroText, Error> {
        match self {
            Self::Body => Ok(doc.get_text("body")),
            Self::Cell { table, row, column } => {
                let key = Self::cell_key(table, row, column)?;
                Ok(doc
                    .get_map("cells")
                    .ensure_mergeable_map(&key)?
                    .ensure_mergeable_text("body")?)
            }
        }
    }
}

/// A single step of an explicit atomic logical action.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", content = "data", rename_all = "snake_case", deny_unknown_fields)]
pub enum Command {
    /// Insert scalar-aligned UTF-16 text.
    InsertText(InsertText),
    /// Delete scalar-aligned UTF-16 text.
    DeleteText(DeleteText),
    /// Change one bounded width register.
    ResizeColumn(ResizeColumn),
    /// Change image alt text, independently of its binary reference.
    SetImageAlt(SetImageAlt),
    /// Change an immutable image asset reference.
    SetImageAsset(SetImageAsset),
    /// Apply a writer-owned strong contribution instead of removing another writer's mark.
    SetStrong(SetStrong),
}

impl Command {
    pub(crate) fn prepare(&self, doc: &LoroDoc) -> Result<(), Error> {
        // Canonical mergeable-container activation is infrastructure, not the
        // user's content edit. Undoing its marker would hide a remote author's
        // surviving content. Session commits preparation outside user history.
        match self {
            Self::InsertText(action) => {
                action.target.text(doc)?;
            }
            Self::DeleteText(action) => {
                action.target.text(doc)?;
            }
            Self::SetStrong(action) => {
                action.target.text(doc)?;
            }
            Self::ResizeColumn(action) => {
                validate_id(&action.column)?;
                doc.get_map("columns")
                    .ensure_mergeable_map(&action.column)?
                    .ensure_mergeable_map("width")?;
            }
            Self::SetImageAlt(action) => {
                validate_id(&action.image)?;
                doc.get_map("images")
                    .ensure_mergeable_map(&action.image)?
                    .ensure_mergeable_map("alt")?;
            }
            Self::SetImageAsset(action) => {
                validate_id(&action.image)?;
                doc.get_map("images")
                    .ensure_mergeable_map(&action.image)?
                    .ensure_mergeable_map("asset")?;
            }
        }
        Ok(())
    }

    pub(crate) fn apply(&self, doc: &LoroDoc, stamp: Stamp) -> Result<(), Error> {
        match self {
            Self::InsertText(action) => action.apply(doc),
            Self::DeleteText(action) => action.apply(doc),
            Self::ResizeColumn(action) => action.apply(doc, stamp),
            Self::SetImageAlt(action) => action.apply(doc, stamp),
            Self::SetImageAsset(action) => action.apply(doc, stamp),
            Self::SetStrong(action) => action.apply(doc, stamp),
        }
    }
}
