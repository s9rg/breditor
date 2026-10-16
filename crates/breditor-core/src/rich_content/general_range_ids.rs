//! Deterministic floor identities in a host-reserved, never-reused authored namespace.
use super::{BlockId, actions::RichActionError};
/// Allocate only the paragraph count requested by a native general-range plan.
///
/// The host must reserve a fresh prefix for every authored request, including
/// failed/undone requests and discarded history. This validates spelling and
/// generated identities, not durability or authority. Actions still prove freshness.
/// # Errors
/// Rejects invalid/over90-byte prefixes or generated invalid identities.
pub fn allocate_general_range_paragraphs(
    prefix: &str,
    count: usize,
) -> Result<Vec<BlockId>, RichActionError> {
    BlockId::try_new(prefix).map_err(|_| RichActionError::RangeFloorIds)?;
    if prefix.len() > 90 {
        return Err(RichActionError::RangeFloorIds);
    }
    (0..count)
        .map(|i| {
            BlockId::try_new(format!("{prefix}:range:{i}"))
                .map_err(|_| RichActionError::RangeFloorIds)
        })
        .collect()
}
