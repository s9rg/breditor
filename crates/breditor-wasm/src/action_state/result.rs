use breditor_core::{action::ActionStateCacheUpdate, profile::CompiledProfileGeneration};
use wasm_bindgen::prelude::wasm_bindgen;

use crate::{BreditorError, BreditorProfileGeneration};

use super::BreditorActionStateSnapshot;

#[derive(Clone, Copy)]
enum SuccessfulActionStatesStatus {
    Full,
    Unchanged,
    Delta,
}

impl SuccessfulActionStatesStatus {
    const fn as_str(self) -> &'static str {
        match self {
            Self::Full => "full",
            Self::Unchanged => "unchanged",
            Self::Delta => "delta",
        }
    }
}

/// Structured result of one guarded action-state cache refresh.
///
/// `full`, `unchanged`, and `delta` each own one complete snapshot that may be
/// taken exactly once. `taken` preserves successful lifecycle state after that
/// transfer; `error` never contains a snapshot.
#[wasm_bindgen]
pub struct BreditorActionStatesResult {
    generation: CompiledProfileGeneration,
    snapshot: Option<BreditorActionStateSnapshot>,
    successful_status: Option<SuccessfulActionStatesStatus>,
    error: Option<BreditorError>,
}

impl BreditorActionStatesResult {
    pub(crate) fn from_update(
        generation: CompiledProfileGeneration,
        update: &ActionStateCacheUpdate,
    ) -> Self {
        let successful_status = if update.is_full() {
            SuccessfulActionStatesStatus::Full
        } else if update.is_unchanged() {
            SuccessfulActionStatesStatus::Unchanged
        } else {
            SuccessfulActionStatesStatus::Delta
        };
        Self {
            generation,
            snapshot: Some(BreditorActionStateSnapshot::from_update(update)),
            successful_status: Some(successful_status),
            error: None,
        }
    }

    pub(crate) const fn from_error(
        generation: CompiledProfileGeneration,
        error: BreditorError,
    ) -> Self {
        Self { generation, snapshot: None, successful_status: None, error: Some(error) }
    }
}

#[wasm_bindgen]
impl BreditorActionStatesResult {
    /// Checks the result's opaque process-local profile identity.
    #[must_use]
    #[wasm_bindgen(js_name = matchesProfileGeneration)]
    pub fn matches_profile_generation(&self, generation: &BreditorProfileGeneration) -> bool {
        self.generation == generation.inner
    }

    /// Returns `full`, `unchanged`, `delta`, `taken`, or `error`.
    #[must_use]
    #[wasm_bindgen(getter, unchecked_return_type = "BreditorActionStatesResultStatus")]
    pub fn status(&self) -> String {
        if self.snapshot.is_some() {
            self.successful_status.map_or("error", SuccessfulActionStatesStatus::as_str)
        } else if self.successful_status.is_some() {
            "taken"
        } else {
            "error"
        }
        .to_owned()
    }

    /// Removes and returns the complete successful snapshot exactly once.
    #[wasm_bindgen(js_name = takeSnapshot)]
    pub fn take_snapshot(&mut self) -> Option<BreditorActionStateSnapshot> {
        self.snapshot.take()
    }

    /// Returns the structured action-state read error, when present.
    #[must_use]
    #[wasm_bindgen(getter)]
    pub fn error(&self) -> Option<BreditorError> {
        self.error.clone()
    }
}
