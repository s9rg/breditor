//! Additive pure source-character range proofs, not suggestion decisions or editing authority.
//! Original suggestion V1 whole-block witnesses and every stored journal remain unchanged.
mod budget;
mod capture_range;
mod packet;
mod read_range;
mod resolve_masked_selection;
mod resolve_range;
mod resolve_source_selection;
mod source;
#[cfg(test)]
mod tests;
mod types;
pub(in crate::rich_replica) use resolve_masked_selection::resolve_source_masked_selection;
pub(in crate::rich_replica) use resolve_range::NativeResolution;
pub(in crate::rich_replica) use resolve_source_selection::resolve_source_selection;
pub use types::*;
const MAX_SCALARS: usize = 65_536;
const MAX_SEGMENTS: usize = 4096;
const MAX_BYTES: usize = 1024 * 1024;
