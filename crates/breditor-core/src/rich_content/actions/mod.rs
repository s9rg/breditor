//! Guarded local rich-AST actions, separate from replication-owned undo.
//!
//! Each action has one named file. Applying it produces a completely admitted
//! immutable document and an exact inverse, or publishes nothing. These are
//! research primitives: legacy `Operation`/session codecs cannot encode them,
//! and sending a root AST replacement to collaborators is never permitted.

mod apply_batch;
mod guard;
mod resize_image;
mod resize_table_column;
mod rewrite_properties;
mod set_image_alt;

pub use apply_batch::{RichBatchEdit, apply_batch};
pub use resize_image::ResizeImage;
pub use resize_table_column::ResizeColumn;
pub use set_image_alt::SetImageAlt;

use super::{RichDocument, RichDocumentError};
use crate::{schema::ValidationReport, state::EditorContext};

/// Closed local action set; not a replicated operation or public wire record.
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum RichAction {
    /// Atomically change or clear both image display dimensions.
    ResizeImage(ResizeImage),
    /// Atomically change the image description and explicit decorative intent.
    SetImageAlt(SetImageAlt),
    /// Change one stable table-column display width.
    ResizeColumn(ResizeColumn),
}

impl RichAction {
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
            Self::ResizeImage(action) => action.apply(context, document),
            Self::SetImageAlt(action) => action.apply(context, document),
            Self::ResizeColumn(action) => action.apply(context, document),
        }
    }
}

/// One completely admitted local edit and its guarded exact inverse.
#[derive(Clone, Debug)]
pub struct RichEdit {
    document: RichDocument,
    inverse: RichAction,
}

impl RichEdit {
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
