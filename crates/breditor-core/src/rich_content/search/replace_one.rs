//! Capture exactly one selected native search match; never rerun the query during execution.
use super::{RichSearchError, RichSearchReplacePlan, RichSearchReplacement, RichSearchResults};

/// Plan replacement of one complete result index without publishing an edit or selection.
/// # Errors
/// Rejects invalid indices, capture templates, expansion bounds or source contradictions.
pub fn plan_rich_search_replace_one(
    results: &RichSearchResults,
    index: usize,
    replacement: &RichSearchReplacement,
) -> Result<RichSearchReplacePlan, RichSearchError> {
    if index >= results.matches().len() {
        return Err(RichSearchError::Index);
    }
    super::replacement_plan::build(results, std::iter::once(index), replacement)
}
