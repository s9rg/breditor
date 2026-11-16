//! Explicit native comment retention; no document, transport or permission upgrade.
mod checkpoint_budget;
mod continue_history;
mod enable_observer_segmented_history;
mod enable_read_only_segmented_history;
mod enable_segmented_history;
mod encode_segment;
mod history;
mod prepare_archive_enable;
mod prepare_archive_seal;
mod record;
mod recovery_origin;
mod restore_replay;
mod restore_segmented;
mod retained_branch;
mod seal_history_generation;
mod seal_observer_history_generation;
mod seal_read_only_history_generation;
mod segmented_checkpoint;

pub(super) use history::ReviewGenerations;
pub(super) use recovery_origin::check_generation_origin;
pub(super) use retained_branch::check_retained_branch_generations;

#[cfg(test)]
mod tests;

#[cfg(test)]
mod integrity_tests;

#[cfg(test)]
mod continued_tests;

#[cfg(test)]
mod checkpoint_budget_tests;
