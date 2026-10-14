//! Opt-in rich AST, local actions, table geometry and immutable image bindings.
//!
//! The separate sealed rich-content schema adds AST admission without widening
//! existing profiles, editing/history codecs or browser behavior. Values are
//! independent of any replication library. Their identities are durable content identities, not
//! semantic `EntityId`, snapshot-local paths, DOM keys or authentication claims.

pub mod actions;
pub(crate) mod ast_properties;
mod drafts;
mod flow_position;
mod identity;
mod image_binding;
mod image_draft;
mod list_draft;
pub(crate) mod local_session;
mod rich_document;
mod rich_grid_selection;
mod rich_selection;
mod rich_selection_mapping;
mod rich_text_mapping;
mod table_draft;
mod table_geometry;
mod table_paste_draft;

pub use ast_properties::{RichColumn, RichTableView};
pub use drafts::{RichBlockDraft, RichDraftError, TableCellDraft, TableColumnDraft, TableRowDraft};
pub use flow_position::{RichFlowParent, RichFlowPosition};
pub use image_draft::ImageDraft;
pub use list_draft::{RichListDraft, RichListItemDraft, RichListKind};
pub use local_session::{
    RichLocalOutcome, RichLocalSession, RichLocalSessionError, RichLocalSnapshot, RichLocalState,
    RichPendingFormatsUpdate, RichSelectionUpdate,
};
pub use rich_document::{RichDocument, RichDocumentError};
pub use rich_grid_selection::ResolvedRichGrid;
pub use rich_selection::{
    ResolvedRichSelection, RichSelection, RichSelectionError, RichSelectionKind, RichTextPoint,
};
pub use rich_selection_mapping::{
    RichSelectionLoss, RichSelectionMapping, RichSelectionMappingOutcome, rebase_rich_selection,
};
pub use table_draft::TableDraft;
pub use table_paste_draft::{TableCellPasteDraft, TablePasteDraft, TablePasteMerge};

pub use identity::{
    AssetGeneration, AssetId, BlockId, CellId, ChangeId, ColumnId, DocumentId, ImageId, MergeId,
    ReplicaId, RichIdentityError, RowId, TableId,
};
pub use image_binding::{
    ImageAlt, ImageBinding, ImageBindingError, ImageSize, UploadCompletionMatch, UploadToken,
};
pub use table_geometry::{
    CausalStamp, CellBounds, MergeConflict, MergeConflictReason, MergeRegion, ResolvedCell,
    ResolvedTable, RichTableLimits, TableGeometryError, TableShape,
};
