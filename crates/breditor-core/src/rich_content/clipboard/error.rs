//! Bounded semantic clipboard failures without partial document publication.

/// Clipboard admission/capture/allocation failure; host asset resolution is separate.
#[derive(Debug, thiserror::Error)]
pub enum RichClipboardError {
    /// Declared kind and canonical semantic fragment disagree.
    #[error("rich clipboard payload has the wrong shape or retains nonsemantic history")]
    Kind,
    /// The range crosses containers not yet covered by the rich range planner.
    #[error("rich clipboard text range requires one flow parent or sibling leading list items")]
    UnsupportedRange,
    /// A host allocator failed or supplied invalid/reused source/new identities.
    #[error("rich clipboard requires fresh checked content identities")]
    Allocation,
    /// A contradicted private invariant cannot be safely repaired.
    #[error("rich clipboard invariant failed")]
    Invariant,
    /// Stable selection admission/capture failed.
    #[error(transparent)]
    Selection(#[from] super::super::RichSelectionError),
    /// Source reads or flow capture failed.
    #[error(transparent)]
    Action(#[from] super::super::actions::RichActionError),
    /// Full rich schema/document/resource policy failed.
    #[error(transparent)]
    Document(#[from] super::super::RichDocumentError),
    /// Complete semantic AST validation failed.
    #[error(transparent)]
    Validation(#[from] crate::schema::ValidationReport),
    /// Checked draft construction failed.
    #[error(transparent)]
    Draft(#[from] super::super::RichDraftError),
    /// Geometry cannot represent the copied current presentation.
    #[error(transparent)]
    Geometry(#[from] super::super::TableGeometryError),
}
