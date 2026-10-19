//! Read-only accepted-document counts and heading outline, not mutation authority.
mod counts;
mod error;
mod inspect;
mod outline;
mod placeholder_empty;
mod result;

pub use counts::RichWritingCounts;
pub use error::RichWritingError;
pub use inspect::inspect_rich_writing_tools;
pub use outline::RichHeadingOutlineEntry;
pub use placeholder_empty::is_rich_placeholder_empty;
pub use result::RichWritingTools;

/// Aggregate accepted UTF-8 body limit, shared with native Find's reading policy.
pub const RICH_WRITING_MAX_TEXT_BYTES: usize = super::RICH_SEARCH_MAX_TEXT_BYTES;
/// Complete paragraph/heading/code domain ceiling of the shared native read policy.
pub const RICH_WRITING_MAX_TEXT_BLOCKS: usize = super::search::MAX_DOMAINS;
/// Visited/queued node limit of the same native presentation-order traversal.
pub const RICH_WRITING_MAX_VISITED_NODES: usize = super::RICH_SEARCH_MAX_VISITED_NODES;
/// Outline labels retain complete extended graphemes within this UTF-8 budget.
pub const RICH_WRITING_OUTLINE_LABEL_BYTES: usize = 1024;
