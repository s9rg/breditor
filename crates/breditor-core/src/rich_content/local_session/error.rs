//! Closed failures which publish no partial content, selection or history.

/// Failure of one queued local rich dispatch or exact replay.
#[derive(Debug, thiserror::Error)]
pub enum RichLocalSessionError {
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
