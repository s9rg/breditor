//! Closed failures which publish no partial content, selection or history.

/// Failure of one queued local rich dispatch or exact replay.
#[derive(Debug, thiserror::Error)]
pub enum RichLocalSessionError {
    /// Pending typing formats/plain typing require one collapsed text caret.
    #[error("rich typing state requires one collapsed text caret")]
    TypingCaret,
    /// Pending formats exceed an independent active format/property resource ceiling.
    #[error("rich pending formats exceed active resource limits")]
    TypingLimit,
    /// A format fails the same compiled property/admission contract as document text.
    #[error(transparent)]
    Validation(#[from] crate::schema::ValidationReport),
    /// The observation belongs to an earlier publication or another live owner.
    #[error("rich local publication observation is stale or foreign")]
    StaleSnapshot,
    /// The current document or replay result differs from its exact history boundary.
    #[error("rich local history boundary or replay result differs")]
    HistoryMismatch,
    /// Complete rich schema/document admission failed.
    #[error(transparent)]
    Document(#[from] crate::rich_content::RichDocumentError),
    /// An action group failed before publication.
    #[error(transparent)]
    Action(#[from] crate::rich_content::actions::RichActionError),
    /// Selection validation or mapping failed before publication.
    #[error(transparent)]
    Selection(#[from] crate::rich_content::RichSelectionError),
    /// The exact monotonic revision has no representable successor.
    #[error(transparent)]
    Revision(#[from] crate::state::RevisionError),
}
