//! Payload-free shortcut failures; already retained user input is not retried or discarded.

/// Failure to prepare an exact native input-rule transformation.
#[derive(Debug, thiserror::Error)]
pub enum RichInputRuleError {
    /// The supplied selection is stale, invalid or not admitted by its source.
    #[error("input rule selection or source is invalid")]
    Selection,
    /// The bounded run/window source could not be read completely.
    #[error("input rule source exceeds its inspection limit")]
    SourceLimit,
    /// A requested fresh namespace is invalid, too long or already used visibly.
    #[error("input rule requires fresh bounded content identities")]
    Identity,
    /// The complete source tree or its document/schema binding changed.
    #[error("input rule plan belongs to a different source")]
    StaleSource,
    /// Complete receiving admission, action bounds or exact preview failed.
    #[error(transparent)]
    Action(#[from] crate::rich_content::actions::RichActionError),
}
