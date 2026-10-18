//! Snapshot-bound native document search; no DOM, history publication or browser regex.
mod capture_replacements;
mod domains;
mod error;
mod matcher;
mod preview_with_selection;
mod query;
mod replace_all;
mod replace_one;
mod replacement;
mod replacement_plan;
mod replacement_preview;
mod replacement_selection;
mod replacement_template;
mod results;
mod scan;
mod semantic_replacement;

pub use error::RichSearchError;
pub use preview_with_selection::RichSearchPreview;
pub use query::{RichSearchMode, RichSearchQuery};
pub use replace_all::plan_rich_search_replace_all;
pub use replace_one::plan_rich_search_replace_one;
pub use replacement::{RichSearchReplacement, RichSearchReplacementMode};
pub use replacement_plan::{RichSearchReplacePlan, RichSearchTextEdit};
pub use results::{RichSearchDirection, RichSearchMatch, RichSearchResults};
pub use scan::find_rich_text;
pub use semantic_replacement::RichSearchTextReplacement;

/// Maximum UTF-8 query size before regex compilation or document traversal.
pub const RICH_SEARCH_MAX_PATTERN_BYTES: usize = 1024;
/// Maximum aggregate UTF-8 body text visited by one complete search.
pub const RICH_SEARCH_MAX_TEXT_BYTES: usize = 4 * 1024 * 1024;
/// Maximum complete result count; exceeding it returns an error, never a prefix.
pub const RICH_SEARCH_MAX_MATCHES: usize = 4096;
/// Maximum visited or queued AST nodes, including text runs and table row wrappers.
pub const RICH_SEARCH_MAX_VISITED_NODES: usize = 65_536;
/// Maximum summed candidate haystack suffix bytes submitted to the regex engine.
///
/// This limits repeated search volume, not elapsed time or automaton transitions.
/// Exact case-sensitive literal search uses linear substring iteration instead.
pub const RICH_SEARCH_MAX_ENGINE_BYTES: usize = 64 * 1024 * 1024;
/// Maximum UTF-8 literal/template request size, checked before retaining a copy.
pub const RICH_SEARCH_MAX_REPLACEMENT_BYTES: usize = 64 * 1024;
/// Maximum aggregate inserted UTF-8 bytes in the changed edits of one replacement plan.
pub const RICH_SEARCH_MAX_INSERTED_BYTES: usize = 1024 * 1024;
const MAX_REPLACEMENT_PARTS: usize = 1024;
const MAX_DOMAINS: usize = 8192;
const MAX_CAPTURE_GROUPS: usize = 65;
const MAX_NFA_BYTES: usize = 1024 * 1024;
const MAX_REGEX_CACHE_BYTES: usize = 256 * 1024;
