use thiserror::Error;

/// A rejected structural-block scalar; diagnostics retain no caller payload.
#[derive(Clone, Copy, Debug, Eq, Error, PartialEq)]
#[non_exhaustive]
pub enum BlockValueError {
    /// Heading ranks must be in the inclusive range one through six.
    #[error("heading level must be between one and six")]
    HeadingLevelOutOfRange,
    /// The first ordered-list ordinal is outside the positive bounded domain.
    #[error("ordered-list start must be between one and 2147483647")]
    OrderedListStartOutOfRange,
}

impl BlockValueError {
    /// Returns a bounded, payload-free diagnostic identity.
    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::HeadingLevelOutOfRange => "block.heading_level_out_of_range",
            Self::OrderedListStartOutOfRange => "block.ordered_list_start_out_of_range",
        }
    }
}
