//! Opt-in rich AST, local actions, table geometry and immutable image bindings.
//!
//! The separate sealed rich-content schema adds AST admission without widening
//! existing profiles, editing/history codecs or browser behavior. Values are
//! independent of any replication library. Their identities are durable content identities, not
//! semantic `EntityId`, snapshot-local paths, DOM keys or authentication claims.

pub mod actions;
pub(crate) mod ast_properties;
mod identity;
mod image_binding;
mod rich_document;
mod table_geometry;

pub use ast_properties::{RichColumn, RichTableView};
pub use rich_document::{RichDocument, RichDocumentError};

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
