use crate::{document::FormatSet, selection::Selection};

/// How a transaction determines its result selection.
#[derive(Clone, Debug, Default, Eq, PartialEq)]
pub enum SelectionUpdate {
    /// Relocate the current selection through content operations.
    #[default]
    Relocate,
    /// Publish an explicit selection in result-document coordinates.
    Set(Option<Selection>),
}

/// How a transaction determines its result typing-format override.
#[derive(Clone, Debug, Default, Eq, PartialEq)]
pub enum PendingFormatsUpdate {
    /// Preserve the current explicit override.
    #[default]
    Preserve,
    /// Publish an explicit override; `None` restores context-derived formatting.
    Set(Option<FormatSet>),
}
