use thiserror::Error;

use crate::action::{ActionId, ActionInputError, routing::IntentId};

use super::{
    ActionStateId,
    limits::{
        MAX_ACTION_STATE_BATCH_FALLTHROUGHS, MAX_ACTION_STATE_BATCH_TEXT_BYTES,
        MAX_ACTION_STATE_BATCH_VALUE_COUNT, MAX_ACTION_STATE_ENTRIES,
        MAX_ACTION_STATE_ENTRY_TEXT_BYTES, MAX_ACTION_STATE_ENTRY_VALUE_COUNT,
        MAX_ACTION_STATE_INPUT_TEXT_BYTES, MAX_ACTION_STATE_INPUT_VALUE_COUNT,
    },
};

/// Why an immutable observable action-state catalog could not be built.
#[derive(Clone, Debug, Eq, Error, PartialEq)]
pub enum ActionStateCatalogError {
    /// The catalog exceeds its fixed entry-count bound.
    #[error("action-state catalog has {actual} entries; the limit is {maximum}")]
    TooManyEntries {
        /// Rejected fixed-width entry count.
        actual: u32,
        /// Fixed maximum entry count.
        maximum: u32,
    },
    /// Two registrations claimed one observable identity.
    #[error("action-state entry {id} is registered more than once")]
    DuplicateId {
        /// Conflicting observable identity.
        id: ActionStateId,
    },
    /// A routed source was supplied without a frozen intent router.
    #[error("action-state entry {id} requires an intent router for {intent}")]
    RouterRequired {
        /// Invalid observable entry.
        id: ActionStateId,
        /// Routed semantic intent.
        intent: IntentId,
    },
    /// A direct source referred to an action absent from the frozen registry.
    #[error("action-state entry {id} refers to unregistered action {action}")]
    UnknownAction {
        /// Invalid observable entry.
        id: ActionStateId,
        /// Missing action identity.
        action: ActionId,
    },
    /// A routed source referred to an intent absent from the frozen router.
    #[error("action-state entry {id} refers to undeclared intent {intent}")]
    UnknownIntent {
        /// Invalid observable entry.
        id: ActionStateId,
        /// Missing semantic intent.
        intent: IntentId,
    },
    /// A direct invocation's envelope differed from its action descriptor.
    #[error("action-state entry {id} action {action} rejected its fixed input: {source}")]
    InvalidActionInput {
        /// Invalid observable entry.
        id: ActionStateId,
        /// Target action.
        action: ActionId,
        /// Exact envelope mismatch.
        source: ActionInputError,
    },
    /// A routed invocation's envelope differed from its intent declaration.
    #[error("action-state entry {id} intent {intent} rejected its fixed input: {source}")]
    InvalidIntentInput {
        /// Invalid observable entry.
        id: ActionStateId,
        /// Target semantic intent.
        intent: IntentId,
        /// Exact envelope mismatch.
        source: ActionInputError,
    },
    /// Fixed invocation inputs exceed the catalog-wide value-count budget.
    #[error("action-state catalog inputs contain {actual} values; the limit is {maximum}")]
    InputValueCount {
        /// Complete rejected aggregate value count across every fixed invocation.
        actual: u32,
        /// Fixed maximum aggregate count.
        maximum: u32,
    },
    /// Fixed invocation inputs exceed the catalog-wide UTF-8 byte budget.
    #[error("action-state catalog inputs use {actual} UTF-8 bytes; the limit is {maximum}")]
    InputTextBytes {
        /// Complete rejected aggregate byte count across every fixed invocation.
        actual: u64,
        /// Fixed maximum aggregate byte count.
        maximum: u64,
    },
}

impl ActionStateCatalogError {
    pub(crate) const fn too_many_entries(actual: u32) -> Self {
        Self::TooManyEntries { actual, maximum: MAX_ACTION_STATE_ENTRIES }
    }

    pub(crate) const fn input_value_count(actual: u32) -> Self {
        Self::InputValueCount { actual, maximum: MAX_ACTION_STATE_INPUT_VALUE_COUNT }
    }

    pub(crate) const fn input_text_bytes(actual: u64) -> Self {
        Self::InputTextBytes { actual, maximum: MAX_ACTION_STATE_INPUT_TEXT_BYTES }
    }
}

/// Which per-entry dynamic resource bound was crossed.
#[derive(Clone, Debug, Eq, Error, PartialEq)]
pub enum ActionStateResourceError {
    /// Dynamic values exceeded the per-entry budget.
    #[error("derived action-state entry contains {actual} values; the limit is {maximum}")]
    ValueCount {
        /// Rejected dynamic value count.
        actual: u32,
        /// Fixed maximum dynamic count per entry.
        maximum: u32,
    },
    /// Dynamic UTF-8 content exceeded the per-entry budget.
    #[error("derived action-state entry uses {actual} UTF-8 bytes; the limit is {maximum}")]
    TextBytes {
        /// Rejected dynamic UTF-8 byte count.
        actual: u64,
        /// Fixed maximum dynamic byte count per entry.
        maximum: u64,
    },
}

impl ActionStateResourceError {
    pub(crate) const fn value_count(actual: u32) -> Self {
        Self::ValueCount { actual, maximum: MAX_ACTION_STATE_ENTRY_VALUE_COUNT }
    }

    pub(crate) const fn text_bytes(actual: u64) -> Self {
        Self::TextBytes { actual, maximum: MAX_ACTION_STATE_ENTRY_TEXT_BYTES }
    }
}

/// Why a complete exact-source action-state batch could not be retained.
///
/// Individual action, routing, and history failures stay inside their entry.
/// This error is reserved for catalog-wide dynamic resource exhaustion, for
/// which no partial batch is returned.
#[derive(Clone, Debug, Eq, Error, PartialEq)]
pub enum ActionStateDeriveError {
    /// Retained dynamic values exceed the batch-wide budget.
    #[error("derived action-state batch contains {actual} values; the limit is {maximum}")]
    ValueCount {
        /// Rejected aggregate dynamic value count.
        actual: u32,
        /// Fixed maximum aggregate count.
        maximum: u32,
    },
    /// Retained dynamic UTF-8 content exceeds the batch-wide budget.
    #[error("derived action-state batch uses {actual} UTF-8 bytes; the limit is {maximum}")]
    TextBytes {
        /// Rejected aggregate dynamic UTF-8 byte count.
        actual: u64,
        /// Fixed maximum aggregate byte count.
        maximum: u64,
    },
    /// Retained route traces exceed the batch-wide fallthrough bound.
    #[error("derived action-state batch has {actual} fallthroughs; the limit is {maximum}")]
    Fallthroughs {
        /// Rejected aggregate fallthrough count.
        actual: u32,
        /// Fixed maximum aggregate count.
        maximum: u32,
    },
}

impl ActionStateDeriveError {
    pub(crate) const fn value_count(actual: u32) -> Self {
        Self::ValueCount { actual, maximum: MAX_ACTION_STATE_BATCH_VALUE_COUNT }
    }

    pub(crate) const fn text_bytes(actual: u64) -> Self {
        Self::TextBytes { actual, maximum: MAX_ACTION_STATE_BATCH_TEXT_BYTES }
    }

    pub(crate) const fn fallthroughs(actual: u32) -> Self {
        Self::Fallthroughs { actual, maximum: MAX_ACTION_STATE_BATCH_FALLTHROUGHS }
    }
}
