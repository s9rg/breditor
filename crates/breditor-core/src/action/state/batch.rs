use std::fmt;

use crate::{
    action::{ActionFault, ActionValue, DisabledReason, routing::IntentFallThrough},
    session::SessionHistoryStatus,
    state::{EditorState, SnapshotId},
};

use super::{
    ActionStateActionFault, ActionStateDeriveError, ActionStateEntry, ActionStateFault,
    ActionStateId, ActionStateOutcome, ActionStateResourceError, ActionStateRouteFault,
    limits::{
        MAX_ACTION_STATE_BATCH_FALLTHROUGHS, MAX_ACTION_STATE_BATCH_TEXT_BYTES,
        MAX_ACTION_STATE_BATCH_VALUE_COUNT, MAX_ACTION_STATE_ENTRY_TEXT_BYTES,
        MAX_ACTION_STATE_ENTRY_VALUE_COUNT,
    },
};

/// Fixed-width measurements of dynamic payload retained by one exact-base batch.
#[derive(Clone, Copy, Debug, Default, Eq, PartialEq)]
pub struct ActionStateBatchSummary {
    entry_count: u32,
    resolved_count: u32,
    unhandled_count: u32,
    fault_count: u32,
    value_count: u32,
    text_bytes: u64,
    fallthrough_count: u32,
}

impl ActionStateBatchSummary {
    /// Returns the number of catalog entries in the batch.
    #[must_use]
    pub const fn entry_count(self) -> u32 {
        self.entry_count
    }

    /// Returns the number of resolved outcomes.
    #[must_use]
    pub const fn resolved_count(self) -> u32 {
        self.resolved_count
    }

    /// Returns the number of unhandled routed outcomes.
    #[must_use]
    pub const fn unhandled_count(self) -> u32 {
        self.unhandled_count
    }

    /// Returns the number of entry-local faults.
    #[must_use]
    pub const fn fault_count(self) -> u32 {
        self.fault_count
    }

    /// Returns retained scalar and container values without pointer deduplication.
    #[must_use]
    pub const fn value_count(self) -> u32 {
        self.value_count
    }

    /// Returns retained dynamic UTF-8 bytes without pointer deduplication.
    #[must_use]
    pub const fn text_bytes(self) -> u64 {
        self.text_bytes
    }

    /// Returns retained route fallthrough records.
    #[must_use]
    pub const fn fallthrough_count(self) -> u32 {
        self.fallthrough_count
    }
}

/// Immutable canonical observation of one editor state and history instant.
///
/// The batch owns the complete exact [`EditorState`], not only a snapshot ID,
/// because IDs are not proof against caller-created unequal state reuse. It is
/// a read model only: cached preparations are deliberately dropped, and a later
/// click must prepare again against the then-current session. The batch itself
/// owns no mutable cache, delta stream, subscription lifecycle, labels, icons,
/// or layout; [`super::ActionStateCache`] may share a complete batch as one
/// immutable local observation.
#[derive(Clone, Eq, PartialEq)]
pub struct ActionStateBatch {
    base: Box<EditorState>,
    history: SessionHistoryStatus,
    entries: Box<[ActionStateEntry]>,
    summary: ActionStateBatchSummary,
}

impl ActionStateBatch {
    /// Returns the complete exact editor state against which every entry ran.
    #[must_use]
    pub const fn base_state(&self) -> &EditorState {
        &self.base
    }

    /// Returns the exact editor snapshot against which every entry ran.
    #[must_use]
    pub const fn base_snapshot(&self) -> &SnapshotId {
        self.base.snapshot()
    }

    /// Returns the exact session-history observation paired with the base state.
    #[must_use]
    pub const fn history_status(&self) -> &SessionHistoryStatus {
        &self.history
    }

    /// Returns entries in canonical lexical [`ActionStateId`] order.
    #[must_use]
    pub const fn entries(&self) -> &[ActionStateEntry] {
        &self.entries
    }

    /// Finds one entry by observable identity.
    #[must_use]
    pub fn entry(&self, id: &ActionStateId) -> Option<&ActionStateEntry> {
        self.entries
            .binary_search_by(|entry| entry.descriptor().id().cmp(id))
            .ok()
            .map(|index| &self.entries[index])
    }

    /// Returns fixed-width retained dynamic-payload measurements.
    #[must_use]
    pub const fn summary(&self) -> ActionStateBatchSummary {
        self.summary
    }
}

pub(crate) struct ActionStateBatchBuilder {
    base: EditorState,
    history: SessionHistoryStatus,
    entries: Vec<ActionStateEntry>,
    retained: DynamicSummary,
    summary: ActionStateBatchSummary,
}

impl ActionStateBatchBuilder {
    pub(crate) fn new(base: EditorState, history: SessionHistoryStatus, capacity: usize) -> Self {
        Self {
            base,
            history,
            entries: Vec::with_capacity(capacity),
            retained: DynamicSummary::default(),
            summary: ActionStateBatchSummary::default(),
        }
    }

    pub(crate) fn push(&mut self, entry: ActionStateEntry) -> Result<(), ActionStateDeriveError> {
        let entry = normalize_entry(entry);
        let dynamic = measure_entry(&entry);
        let retained = self.retained.saturating_add(dynamic);
        if retained.value_count > MAX_ACTION_STATE_BATCH_VALUE_COUNT {
            return Err(ActionStateDeriveError::value_count(retained.value_count));
        }
        if retained.text_bytes > MAX_ACTION_STATE_BATCH_TEXT_BYTES {
            return Err(ActionStateDeriveError::text_bytes(retained.text_bytes));
        }
        if retained.fallthrough_count > MAX_ACTION_STATE_BATCH_FALLTHROUGHS {
            return Err(ActionStateDeriveError::fallthroughs(retained.fallthrough_count));
        }

        match entry.outcome() {
            ActionStateOutcome::Resolved(_) => {
                self.summary.resolved_count = self.summary.resolved_count.saturating_add(1);
            }
            ActionStateOutcome::Unhandled(_) => {
                self.summary.unhandled_count = self.summary.unhandled_count.saturating_add(1);
            }
            ActionStateOutcome::Fault(_) => {
                self.summary.fault_count = self.summary.fault_count.saturating_add(1);
            }
        }
        self.retained = retained;
        self.entries.push(entry);
        Ok(())
    }

    pub(crate) fn finish(mut self) -> ActionStateBatch {
        self.summary.entry_count = usize_to_u32(self.entries.len());
        self.summary.value_count = self.retained.value_count;
        self.summary.text_bytes = self.retained.text_bytes;
        self.summary.fallthrough_count = self.retained.fallthrough_count;
        ActionStateBatch {
            base: Box::new(self.base),
            history: self.history,
            entries: self.entries.into_boxed_slice(),
            summary: self.summary,
        }
    }
}

/// Applies the entry-local resource contract before an outcome can be retained
/// for duplicate-source reuse or complete-batch accounting.
pub(crate) fn normalize_entry(mut entry: ActionStateEntry) -> ActionStateEntry {
    let dynamic = measure_entry(&entry);
    if dynamic.value_count > MAX_ACTION_STATE_ENTRY_VALUE_COUNT {
        entry.replace_with_fault(ActionStateFault::Resource(
            ActionStateResourceError::value_count(dynamic.value_count),
        ));
    } else if dynamic.text_bytes > MAX_ACTION_STATE_ENTRY_TEXT_BYTES {
        entry.replace_with_fault(ActionStateFault::Resource(ActionStateResourceError::text_bytes(
            dynamic.text_bytes,
        )));
    }
    entry
}

impl fmt::Debug for ActionStateBatch {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        let entry_ids =
            self.entries.iter().map(|entry| entry.descriptor().id()).collect::<Vec<_>>();
        formatter
            .debug_struct("ActionStateBatch")
            .field("base_snapshot", self.base_snapshot())
            .field("history", &self.history)
            .field("entry_ids", &entry_ids)
            .field("summary", &self.summary)
            .finish_non_exhaustive()
    }
}

#[derive(Clone, Copy, Default)]
pub(crate) struct DynamicSummary {
    value_count: u32,
    text_bytes: u64,
    fallthrough_count: u32,
}

impl DynamicSummary {
    pub(crate) const fn saturating_add(self, other: Self) -> Self {
        Self {
            value_count: self.value_count.saturating_add(other.value_count),
            text_bytes: self.text_bytes.saturating_add(other.text_bytes),
            fallthrough_count: self.fallthrough_count.saturating_add(other.fallthrough_count),
        }
    }

    pub(crate) const fn value_count(self) -> u32 {
        self.value_count
    }

    pub(crate) const fn text_bytes(self) -> u64 {
        self.text_bytes
    }
}

fn measure_entry(entry: &ActionStateEntry) -> DynamicSummary {
    match entry.outcome() {
        ActionStateOutcome::Resolved(resolved) => {
            let indicator = resolved
                .indicator()
                .value()
                .uniform_value()
                .map_or_else(DynamicSummary::default, measure_value);
            let availability = resolved
                .availability()
                .reason()
                .and_then(DisabledReason::detail)
                .map_or_else(DynamicSummary::default, measure_value);
            let route = measure_fallthroughs(resolved.provenance().fallthroughs());
            indicator.saturating_add(availability).saturating_add(route)
        }
        ActionStateOutcome::Unhandled(unhandled) => measure_fallthroughs(unhandled.fallthroughs()),
        ActionStateOutcome::Fault(fault) => measure_fault(fault),
    }
}

fn measure_fallthroughs(fallthroughs: &[IntentFallThrough]) -> DynamicSummary {
    let mut summary = DynamicSummary {
        fallthrough_count: usize_to_u32(fallthroughs.len()),
        ..DynamicSummary::default()
    };
    for fallthrough in fallthroughs {
        if let Some(detail) = fallthrough.reason().detail() {
            summary = summary.saturating_add(measure_value(detail));
        }
    }
    summary
}

fn measure_fault(fault: &ActionStateFault) -> DynamicSummary {
    match fault {
        ActionStateFault::Direct { source, .. } => measure_action_state_action_fault(source),
        ActionStateFault::Routed { source, .. } => match source {
            ActionStateRouteFault::Action { source, .. } => {
                measure_action_state_action_fault(source)
            }
            ActionStateRouteFault::UnknownIntent | ActionStateRouteFault::InvalidInput(_) => {
                DynamicSummary::default()
            }
        },
        ActionStateFault::History { .. }
        | ActionStateFault::Invariant { .. }
        | ActionStateFault::Resource(_) => DynamicSummary::default(),
    }
}

fn measure_action_state_action_fault(fault: &ActionStateActionFault) -> DynamicSummary {
    match fault {
        ActionStateActionFault::Handler(source) => measure_action_fault(source),
        ActionStateActionFault::UnknownAction
        | ActionStateActionFault::InvalidInput(_)
        | ActionStateActionFault::InvalidState(_)
        | ActionStateActionFault::InvalidPlan(_) => DynamicSummary::default(),
    }
}

fn measure_action_fault(fault: &ActionFault) -> DynamicSummary {
    fault.detail().map_or_else(DynamicSummary::default, measure_value)
}

pub(crate) fn measure_value(value: &ActionValue) -> DynamicSummary {
    let summary = value.summary();
    DynamicSummary {
        value_count: summary.value_count(),
        text_bytes: summary.text_bytes(),
        fallthrough_count: 0,
    }
}

pub(crate) fn measure_input(input: &crate::action::ActionInput) -> DynamicSummary {
    match input {
        crate::action::ActionInput::None => DynamicSummary::default(),
        crate::action::ActionInput::Typed { value, .. } => measure_value(value),
    }
}

pub(crate) fn usize_to_u32(value: usize) -> u32 {
    u32::try_from(value).unwrap_or(u32::MAX)
}
