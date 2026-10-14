//! Guarded local rich-AST actions, separate from replication-owned undo.
//!
//! Each action has one named file. Applying it produces a completely admitted
//! immutable document and an exact inverse, or publishes nothing. These are
//! research primitives: legacy `Operation`/session codecs cannot encode them,
//! and sending a root AST replacement to collaborators is never permitted.

mod apply_batch;
mod boundary_patch;
mod branch_patch;
mod clear_table_cells;
mod delete_image;
mod delete_table;
mod delete_table_column;
mod delete_table_row;
mod delete_text;
mod flow_patch;
pub(crate) mod flow_siblings;
mod guard;
mod indent_list_items;
mod insert_blocks;
mod insert_image;
mod insert_table;
mod insert_table_column;
mod insert_table_row;
mod insert_text;
mod join_list_items;
mod join_text_blocks;
mod list_boundary_patch;
mod list_helpers;
mod list_parts;
pub(crate) mod local_replay;
mod merge_table_cells;
mod move_axis;
mod move_table_column;
mod move_table_row;
mod node_patch;
mod outdent_list_items;
mod paste_table_cells;
mod replace_blocks;
mod replace_image;
mod replace_text;
pub(crate) mod replace_text_range;
mod resize_image;
mod resize_table_column;
pub(crate) mod rewrite_properties;
mod set_heading;
mod set_image_alt;
mod set_image_caption;
mod set_inline_format;
mod set_list_kind;
mod set_table_header;
mod split_list_item;
mod split_table_cell;
mod split_text_block;
mod table_body_rewrite;
mod table_merges;
mod table_patch;
pub(crate) mod text_patch;
mod text_range_list;
mod unwrap_list;
mod wrap_list;

pub use apply_batch::{RichBatchEdit, apply_batch};
pub use clear_table_cells::ClearTableCells;
pub use delete_image::DeleteImage;
pub use delete_table::DeleteTable;
pub use delete_table_column::DeleteTableColumn;
pub use delete_table_row::DeleteTableRow;
pub use delete_text::DeleteText;
pub use indent_list_items::IndentListItems;
pub use insert_blocks::InsertBlocks;
pub use insert_image::InsertImage;
pub use insert_table::InsertTable;
pub use insert_table_column::InsertTableColumn;
pub use insert_table_row::InsertTableRow;
pub use insert_text::InsertText;
pub use join_list_items::JoinListItems;
pub use join_text_blocks::JoinTextBlocks;
pub use merge_table_cells::MergeTableCells;
pub use move_table_column::MoveTableColumn;
pub use move_table_row::MoveTableRow;
pub use outdent_list_items::OutdentListItems;
pub use paste_table_cells::PasteTableCells;
pub use replace_blocks::ReplaceBlocks;
pub use replace_image::ReplaceImage;
pub use replace_text::ReplaceText;
pub use replace_text_range::ReplaceTextRange;
pub use resize_image::ResizeImage;
pub use resize_table_column::ResizeColumn;
pub use set_heading::SetHeading;
pub use set_image_alt::SetImageAlt;
pub use set_image_caption::SetImageCaption;
pub use set_inline_format::{RichFormatChange, SetInlineFormat};
pub use set_list_kind::SetListKind;
pub use set_table_header::SetTableHeader;
pub use split_list_item::SplitListItem;
pub use split_table_cell::SplitTableCell;
pub use split_text_block::SplitTextBlock;
pub use unwrap_list::UnwrapList;
pub use wrap_list::WrapList;

use super::{RichDocument, RichDocumentError};
use crate::{schema::ValidationReport, state::EditorContext};

/// Closed local action set; not a replicated operation or public wire record.
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum RichAction {
    /// Atomically replace an admitted same-block or sibling-flow text range.
    ReplaceTextRange(ReplaceTextRange),
    /// Replace a matching rich cell rectangle and translated non-destructive merge intent.
    PasteTableCells(PasteTableCells),
    /// Clear selected base bodies with explicit empty-block IDs, retaining geometry and headers.
    ClearTableCells(ClearTableCells),
    /// Insert an explicitly identified rich flow fragment in stable sibling space.
    InsertBlocks(InsertBlocks),
    /// Replace/remove an ordered rich flow range without flattening media or structure.
    ReplaceBlocks(ReplaceBlocks),
    /// Indent a contiguous range of rich list items without changing their bodies.
    IndentListItems(IndentListItems),
    /// Promote nested items or unlist a top-level item range, preserving order and ordinals.
    OutdentListItems(OutdentListItems),
    /// Split an item's leading text, moving its tail into one explicitly identified new item.
    SplitListItem(SplitListItem),
    /// Join adjacent items without placing later text before earlier rich content.
    JoinListItems(JoinListItems),
    /// Wrap a rich flow range without flattening media or nested bodies.
    WrapList(WrapList),
    /// Remove one list layer, retaining every item's full rich body.
    UnwrapList(UnwrapList),
    /// Change one stable list's bullet/numbered style or start.
    SetListKind(SetListKind),
    /// Split one rich text block with an explicit fresh right-block identity.
    SplitTextBlock(SplitTextBlock),
    /// Join two adjacent rich text blocks, retaining the left identity.
    JoinTextBlocks(JoinTextBlocks),
    /// Convert a text block to a paragraph or ranked heading, preserving its identity.
    SetHeading(SetHeading),
    /// Insert canonical text at a stable rich text position.
    InsertText(InsertText),
    /// Delete a checked same-block text range without removing its block.
    DeleteText(DeleteText),
    /// Replace one rich text range as an atomic undo unit.
    ReplaceText(ReplaceText),
    /// Change one semantic format across a rich text range.
    SetInlineFormat(SetInlineFormat),
    /// Replace an image's immutable asset and guard generation as one paired value.
    ReplaceImage(ReplaceImage),
    /// Add, remove or replace the whole optional paragraph caption.
    SetImageCaption(SetImageCaption),
    /// Insert a whole explicitly drafted table in stable flow space.
    InsertTable(InsertTable),
    /// Remove a whole table with exact retained restoration data.
    DeleteTable(DeleteTable),
    /// Insert an asset-bound image and optional caption atomically.
    InsertImage(InsertImage),
    /// Remove an image flow node, without deleting shared asset bytes.
    DeleteImage(DeleteImage),
    /// Move one stable row and every owned body together.
    MoveTableRow(MoveTableRow),
    /// Move one stable column, its width and its per-row bodies together.
    MoveTableColumn(MoveTableColumn),
    /// Merge a complete grid without flattening base bodies.
    MergeTableCells(MergeTableCells),
    /// Retract observed merges covering one presentation cell.
    SplitTableCell(SplitTableCell),
    /// Set explicit header intent for selected base cells.
    SetTableHeader(SetTableHeader),
    /// Insert one drafted stable row with its explicit cell bodies.
    InsertTableRow(InsertTableRow),
    /// Delete one row while retaining its exact subtree in the local inverse.
    DeleteTableRow(DeleteTableRow),
    /// Insert one stable column and its explicit per-row bodies.
    InsertTableColumn(InsertTableColumn),
    /// Delete one column while retaining exact local restoration data.
    DeleteTableColumn(DeleteTableColumn),
    /// Atomically change or clear both image display dimensions.
    ResizeImage(ResizeImage),
    /// Atomically change the image description and explicit decorative intent.
    SetImageAlt(SetImageAlt),
    /// Change one stable table-column display width.
    ResizeColumn(ResizeColumn),
}

impl RichAction {
    fn inverse_position_map(
        &self,
    ) -> Result<Option<super::rich_text_mapping::RichPositionMap>, super::RichSelectionError> {
        use super::rich_text_mapping::RichPositionMap;
        let map = match self {
            Self::ReplaceTextRange(action) => Some(action.map.clone()),
            Self::InsertText(action) => Some(RichPositionMap::Text(action.patch.map.clone())),
            Self::DeleteText(action) => Some(RichPositionMap::Text(action.patch.map.clone())),
            Self::ReplaceText(action) => Some(RichPositionMap::Text(action.patch.map.clone())),
            Self::SplitTextBlock(action) => {
                Some(RichPositionMap::Boundary(action.patch.map.clone()))
            }
            Self::JoinTextBlocks(action) => {
                Some(RichPositionMap::Boundary(action.patch.map.clone()))
            }
            Self::SplitListItem(action) => action.patch.map.clone().map(RichPositionMap::Boundary),
            Self::JoinListItems(action) => action.patch.map.clone().map(RichPositionMap::Boundary),
            _ => None,
        };
        map.map(|map| map.inverse()).transpose()
    }
    /// Apply a captured guarded action to an immutable rich snapshot.
    ///
    /// # Errors
    /// Rejects a different document/schema, a missing or stale target, or active
    /// host limits. A true no-op returns `None` only after guard/policy admission.
    pub fn apply(
        &self,
        context: &EditorContext,
        document: &RichDocument,
    ) -> Result<Option<RichEdit>, RichActionError> {
        match self {
            Self::ReplaceTextRange(action) => action.apply(context, document),
            Self::PasteTableCells(action) => action.apply(context, document),
            Self::ClearTableCells(action) => action.apply(context, document),
            Self::InsertBlocks(action) => action.apply(context, document),
            Self::ReplaceBlocks(action) => action.apply(context, document),
            Self::IndentListItems(action) => action.apply(context, document),
            Self::OutdentListItems(action) => action.apply(context, document),
            Self::SplitListItem(action) => action.apply(context, document),
            Self::JoinListItems(action) => action.apply(context, document),
            Self::WrapList(action) => action.apply(context, document),
            Self::UnwrapList(action) => action.apply(context, document),
            Self::SetListKind(action) => action.apply(context, document),
            Self::SplitTextBlock(action) => action.apply(context, document),
            Self::JoinTextBlocks(action) => action.apply(context, document),
            Self::SetHeading(action) => action.apply(context, document),
            Self::InsertText(action) => action.apply(context, document),
            Self::DeleteText(action) => action.apply(context, document),
            Self::ReplaceText(action) => action.apply(context, document),
            Self::SetInlineFormat(action) => action.apply(context, document),
            Self::ReplaceImage(action) => action.apply(context, document),
            Self::SetImageCaption(action) => action.apply(context, document),
            Self::InsertTable(action) => action.apply(context, document),
            Self::DeleteTable(action) => action.apply(context, document),
            Self::InsertImage(action) => action.apply(context, document),
            Self::DeleteImage(action) => action.apply(context, document),
            Self::MoveTableRow(action) => action.apply(context, document),
            Self::MoveTableColumn(action) => action.apply(context, document),
            Self::MergeTableCells(action) => action.apply(context, document),
            Self::SplitTableCell(action) => action.apply(context, document),
            Self::SetTableHeader(action) => action.apply(context, document),
            Self::InsertTableRow(action) => action.apply(context, document),
            Self::DeleteTableRow(action) => action.apply(context, document),
            Self::InsertTableColumn(action) => action.apply(context, document),
            Self::DeleteTableColumn(action) => action.apply(context, document),
            Self::ResizeImage(action) => action.apply(context, document),
            Self::SetImageAlt(action) => action.apply(context, document),
            Self::ResizeColumn(action) => action.apply(context, document),
        }
    }
}

/// One completely admitted local edit and its guarded exact inverse.
#[derive(Clone, Debug)]
pub struct RichEdit {
    before: RichDocument,
    document: RichDocument,
    inverse: RichAction,
}

impl RichEdit {
    /// Map a snapshot-proved selection through this exact local edit.
    ///
    /// # Errors
    /// Rejects a stale source selection, binding mismatch or unsupported text mutation.
    pub fn map_selection(
        &self,
        selection: &super::RichSelection,
    ) -> Result<super::RichSelectionMapping, super::RichSelectionError> {
        let maps = self.inverse.inverse_position_map()?.into_iter().collect::<Vec<_>>();
        super::rich_selection_mapping::rebase_with_text_maps(
            &self.before,
            &self.document,
            selection,
            &maps,
        )
    }
    /// Candidate snapshot; the caller's old snapshot remains untouched.
    #[must_use]
    pub const fn document(&self) -> &RichDocument {
        &self.document
    }
    /// Exact guarded inverse for a future local history coordinator.
    #[must_use]
    pub const fn inverse(&self) -> &RichAction {
        &self.inverse
    }
    /// Transfer both immutable result and inverse to the local coordinator.
    #[must_use]
    pub fn into_parts(self) -> (RichDocument, RichAction) {
        (self.document, self.inverse)
    }
}

/// Payload-free failure of a captured local rich-content action.
#[derive(Debug, thiserror::Error)]
pub enum RichActionError {
    /// Pasted body dimensions or replacement-ID counts do not match the complete target grid.
    #[error("rich table paste dimensions must exactly match the target grid")]
    PasteShape,
    /// A selected first item has no preceding parent for indentation.
    #[error("rich list item has no preceding indentation target")]
    ListBoundary,
    /// The target is not a valid ordered list/item range or required list shape.
    #[error("rich list action target or item shape differs")]
    ListShape,
    /// Flow boundaries must be ordered direct siblings in the required adjacency.
    #[error("rich flow boundaries must be ordered direct siblings")]
    FlowRange,
    /// The target is not an admitted paragraph or heading text container.
    #[error("rich text action requires a paragraph or heading")]
    TextTarget,
    /// The range is reversed, outside the block or not scalar-aligned.
    #[error("rich text range must be ordered and scalar-aligned within its block")]
    TextRange,
    /// A canonical fragment/run invariant failed without exposing its text.
    #[error("rich text fragment invariant failed")]
    TextPrimitive,
    /// A typed image asset/generation replacement violates its semantic contract.
    #[error(transparent)]
    ImageBinding(#[from] super::ImageBindingError),
    /// The parent is absent or is not a rich flow container.
    #[error("rich flow parent is absent or has the wrong kind")]
    FlowParent,
    /// Deletion needs an explicit replacement to retain a nonempty flow container.
    #[error("rich flow deletion requires an explicit replacement for the sole child")]
    FlowWouldBeEmpty,
    /// The command requires a validated grid selection rather than text/node selection.
    #[error("rich action requires a grid selection")]
    SelectionKind,
    /// A new merge identity was already observed or retracted in this table.
    #[error("rich merge identity is already present or retracted")]
    MergeIdentityReuse,
    /// Selection admission or mapping failed before publication.
    #[error(transparent)]
    Selection(#[from] super::RichSelectionError),
    /// A checked geometry command failed before publication.
    #[error(transparent)]
    Geometry(#[from] super::TableGeometryError),
    /// New axes exceed one of the independent rich table ceilings.
    #[error("rich table axis/product ceiling exceeded")]
    TableLimit,
    /// A new axis attempts to reuse an existing stable identity.
    #[error("rich table axis identity is already present")]
    AxisIdentityReuse,
    /// Draft row/cell bindings do not exactly match the intended axes.
    #[error("rich table draft axes do not match the target")]
    AxisShape,
    /// A checked insertion draft failed before schema admission.
    #[error(transparent)]
    Draft(#[from] super::RichDraftError),
    /// The group exceeds the context's action-count ceiling.
    #[error("rich local action group exceeds the operation-count ceiling")]
    TooManyActions,
    /// The captured document or active durable schema binding differs.
    #[error("rich action document/schema binding differs")]
    Binding,
    /// A stable target no longer exists in this snapshot.
    #[error("rich action target is absent")]
    MissingTarget,
    /// The target's captured identity or semantic metadata has changed.
    #[error("rich action target changed since capture")]
    StaleTarget,
    /// A column width is outside the provisional display contract.
    #[error("column width must be 32–4096 logical pixels")]
    ColumnWidth,
    /// New or existing content violates the active host policy.
    #[error(transparent)]
    Validation(#[from] ValidationReport),
    /// A typed AST read/admission invariant failed.
    #[error(transparent)]
    Document(#[from] RichDocumentError),
    /// A private persistent-rewrite invariant failed without exposing values.
    #[error("rich action rewrite invariant failed")]
    Rewrite,
}
