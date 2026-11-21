//! Closed failures which publish no partial content, selection or history.

/// Failure of one queued local rich dispatch or exact replay.
#[derive(Debug, thiserror::Error)]
pub enum RichLocalSessionError {
    /// Explicit native Markdown shortcut planning or complete admission failed.
    #[error(transparent)]
    InputRule(#[from] crate::rich_content::RichInputRuleError),
    /// Native case-change planning or final admission failed.
    #[error(transparent)]
    CaseChange(#[from] crate::rich_content::RichCaseChangeError),
    /// Native source-bound search/replacement planning or final admission failed.
    #[error(transparent)]
    Search(#[from] crate::rich_content::RichSearchError),
    /// An already captured clipboard fragment fails receiving kind/schema/policy admission.
    #[error(transparent)]
    Clipboard(#[from] crate::rich_content::RichClipboardError),
    /// A replacement paragraph must have an identity absent from the source tree.
    #[error("atom replacement requires a fresh paragraph identity")]
    AtomIdentityReuse,
    /// Timestamped user input requires explicit native history grouping admission.
    #[error("natural typing history is not enabled for this owner")]
    TypingHistoryDisabled,
    /// A directional deletion must touch the actual caret in one stable text block.
    #[error("typing deletion target does not match its direction and current caret")]
    TypingDeleteTarget,
    /// A trigger composite needs one nonempty same-block prose trigger range and
    /// exactly one content-changing follow-up step.
    #[error("trigger removal composite target or follow-up step is not admitted")]
    TriggerStep,
    /// The live host policy forbids content, history or pending-format mutation.
    #[error("rich editor is read-only")]
    ReadOnly,
    /// Code typing never retains semantic inline formatting overrides.
    #[error("code blocks require plain pending typing formats")]
    CodeFormats,
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
