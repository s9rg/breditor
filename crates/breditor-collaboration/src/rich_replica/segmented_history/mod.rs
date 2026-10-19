//! Explicit segmented native history; old journal codecs and causal transport meanings stay separate.
mod archive;
mod binding;
mod checkpoint_segmented_history;
mod continuity;
mod enable_segmented_history;
mod encoding;
#[cfg(test)]
mod fork_contract_tests;
mod info;
mod restore_segmented_history;
mod seal_history_segment;
mod segment;
mod state;
#[cfg(test)]
mod tests;
#[cfg(test)]
mod workflow_tests;

pub use info::SegmentedHistoryInfo;
pub(super) use state::SegmentedHistory;
