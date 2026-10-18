//! Static payload-redacting failures for the optional search boundary.
use crate::rich_content::RichSearchError;

/// Search intentions and metadata use a separate bounded read/intent contract.
#[derive(Clone, Copy, Debug, Eq, PartialEq, thiserror::Error)]
pub enum RichSearchCodecError {
    /// Oversized JSON is rejected before parsing or retaining its strings.
    #[error("rich search input exceeds its encoded byte limit")]
    InputLimit,
    /// Unknown/duplicate fields, wrong types or noncanonical decimal coordinates.
    #[error("rich search input is invalid")]
    Input,
    /// The complete read cannot be encoded within the independent metadata limit.
    #[error("rich search result metadata exceeds its byte limit")]
    ReadLimit,
    /// Serialization contradicted an admitted native value.
    #[error("rich search metadata encoding failed")]
    Encoding,
    /// Native syntax/resource/source failures contain no query or document payload.
    #[error(transparent)]
    Search(#[from] RichSearchError),
}
