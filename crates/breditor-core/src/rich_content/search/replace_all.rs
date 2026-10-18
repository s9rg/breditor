//! Capture all complete native matches as one bounded, source-proved replacement plan.
use super::{RichSearchError, RichSearchReplacePlan, RichSearchReplacement, RichSearchResults};

/// Plan all non-overlapping source matches; failure returns no truncated prefix.
/// # Errors
/// Rejects invalid capture templates even without hits, excessive aggregate expansion
/// or contradictions of the retained native source. This function never mutates an owner.
pub fn plan_rich_search_replace_all(
    results: &RichSearchResults,
    replacement: &RichSearchReplacement,
) -> Result<RichSearchReplacePlan, RichSearchError> {
    super::replacement_plan::build(results, 0..results.matches().len(), replacement)
}
