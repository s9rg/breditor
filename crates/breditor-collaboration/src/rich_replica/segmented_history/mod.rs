//! Explicit segmented native history; old journal codecs and causal transport meanings stay separate.
mod archive;
mod binding;
mod checkpoint_segmented_history;
mod continuity;
mod enable_read_only_segmented_history;
mod enable_segmented_history;
mod encoding;
#[cfg(test)]
mod encoding_tests;
#[cfg(test)]
mod fork_contract_tests;
mod info;
#[cfg(test)]
mod observer_sealing_tests;
#[cfg(test)]
mod prepared_candidate_tests;
#[cfg(test)]
mod read_only_archive_tests;
mod restore_segmented_history;
mod seal_history_segment;
mod seal_observer_history_segment;
mod seal_read_only_history_segment;
mod segment;
mod state;
#[cfg(test)]
mod suggestion_admission_tests;
#[cfg(test)]
mod tests;
#[cfg(test)]
mod workflow_tests;

pub use info::SegmentedHistoryInfo;
pub(super) use state::SegmentedHistory;
