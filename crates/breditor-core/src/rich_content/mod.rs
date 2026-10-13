//! Opt-in semantic contracts for table geometry and immutable image bindings.
//!
//! These checked values do not widen the existing AST grammar, provide a new
//! document codec, or install browser behavior. They are independent of any
//! replication library. Their identities are durable content identities, not
//! semantic `EntityId`, snapshot-local paths, DOM keys or authentication claims.

mod identity;
mod image_binding;
mod table_geometry;

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
