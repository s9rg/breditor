//! Explicit native comment retention; no document, transport or permission upgrade.
mod enable_observer_segmented_history;
mod enable_segmented_history;
mod encode_segment;
mod history;
mod record;
mod recovery_origin;
mod restore_segmented;
mod seal_history_generation;
mod seal_observer_history_generation;
mod segmented_checkpoint;

pub(super) use history::ReviewGenerations;
pub(super) use record::MAX_RETAINED_EVENTS;
pub(super) use recovery_origin::check_generation_origin;

#[cfg(test)]
mod tests;

#[cfg(test)]
mod integrity_tests;
