use thiserror::Error;

/// Why an [`ExtensionVersion`](super::ExtensionVersion) could not be created.
#[derive(Clone, Copy, Debug, Eq, Error, PartialEq)]
#[non_exhaustive]
pub enum ExtensionVersionError {
    /// Version zero is permanently reserved.
    #[error("extension version zero is reserved")]
    Zero,
}
