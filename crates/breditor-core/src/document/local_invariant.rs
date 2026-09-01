use thiserror::Error;

/// A local node/value invariant that failed before schema validation.
#[derive(Clone, Debug, Eq, Error, PartialEq)]
pub(crate) enum LocalInvariantError {
    #[error("text leaves cannot be empty")]
    EmptyText,
    #[error("text UTF-16 length does not fit the point protocol")]
    TextTooLong,
    #[error("format {index} duplicates the preceding format kind")]
    DuplicateFormat { index: usize },
    #[error("format {index} is not in ascending kind order")]
    NonCanonicalFormatOrder { index: usize },
    #[error("text children {left_index} and {right_index} have equal formats")]
    AdjacentEqualText { left_index: usize, right_index: usize },
    #[error("nested property-object key `{key}` violates the ASCII key grammar")]
    InvalidPropertyObjectKey { key: String },
}
