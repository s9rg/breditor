//! Payload-free search failures; regex diagnostics never echo user content.

/// Why a complete native search or its snapshot-bound read was refused.
#[derive(Clone, Copy, Debug, Eq, PartialEq, thiserror::Error)]
pub enum RichSearchError {
    /// The query exceeds the fixed pre-compilation byte ceiling.
    #[error("rich search query exceeds its byte limit")]
    QueryLimit,
    /// Invalid syntax or an automaton exceeding the compilation policy.
    #[error("rich search pattern is invalid or exceeds compilation limits")]
    Pattern,
    /// The pattern declares more capture slots than the native result policy.
    #[error("rich search capture count exceeds its limit")]
    CaptureLimit,
    /// A complete search would exceed its aggregate text/domain budget.
    #[error("rich search document exceeds its traversal limits")]
    DocumentLimit,
    /// More matches exist than the result budget; no partial result is returned.
    #[error("rich search match count exceeds its limit")]
    MatchLimit,
    /// Repeated engine calls exceed the charged suffix-byte budget.
    #[error("rich search engine volume exceeds its limit")]
    WorkLimit,
    /// Replacement input, expansion parts or aggregate changed insertion bytes exceed policy.
    #[error("rich search replacement exceeds its resource limits")]
    ReplacementLimit,
    /// A capture template is malformed or names an undeclared group, even without matches.
    #[error("rich search replacement template or capture reference is invalid")]
    Template,
    /// The complete replacement tree fails the receiving schema or active document limits.
    #[error("rich search replacement fails document admission")]
    Admission,
    /// Document identity or schema binding differs from the retained source.
    #[error("rich search document or schema binding differs")]
    Binding,
    /// The current AST differs from the complete retained source snapshot.
    #[error("rich search results belong to a changed source snapshot")]
    StaleSource,
    /// A requested match or capture index is not in this complete result.
    #[error("rich search match or capture index is out of range")]
    Index,
    /// A contradiction of the admitted AST, table geometry or UTF-8 invariants.
    #[error("rich search source invariant failed")]
    Invariant,
}
