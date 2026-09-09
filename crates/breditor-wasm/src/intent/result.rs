use breditor_core::{
    action::{
        ActionActivation, ActionStateValue,
        routing::{IntentExecutionOutcome, IntentFallThrough},
    },
    codec::{CommitJsonCodecV2, CommitJsonCodecV3},
    engine::{EditorHistorySequenceOutcome, EditorIntentOutcome},
    profile::CompiledProfileGeneration,
};
use wasm_bindgen::prelude::wasm_bindgen;

use crate::{
    BreditorError, BreditorObservation, BreditorProfileGeneration, BreditorProjectionUpdate,
    BreditorStringResult,
    action_value_json::{action_value_json, state_value_status},
};

enum IntentResultValue {
    Outcome(Box<EditorIntentOutcome>),
    Error(BreditorError),
}

/// Owned route provenance and successor observation from one semantic intent.
#[wasm_bindgen]
pub struct BreditorIntentResult {
    generation: CompiledProfileGeneration,
    checkpoint_format_version: u32,
    history_group_closed_before: bool,
    value: IntentResultValue,
}

impl BreditorIntentResult {
    pub(crate) fn from_outcome(
        generation: CompiledProfileGeneration,
        checkpoint_format_version: u32,
        outcome: EditorIntentOutcome,
    ) -> Self {
        Self {
            generation,
            checkpoint_format_version,
            history_group_closed_before: false,
            value: IntentResultValue::Outcome(Box::new(outcome)),
        }
    }

    pub(crate) fn from_sequence(
        generation: CompiledProfileGeneration,
        checkpoint_format_version: u32,
        sequence: EditorHistorySequenceOutcome<EditorIntentOutcome>,
    ) -> Self {
        let (boundary, outcome) = sequence.into_parts();
        let mut result = Self::from_outcome(generation, checkpoint_format_version, outcome);
        result.history_group_closed_before = boundary.is_some();
        result
    }

    pub(crate) const fn from_error(
        generation: CompiledProfileGeneration,
        checkpoint_format_version: u32,
        error: BreditorError,
    ) -> Self {
        Self {
            generation,
            checkpoint_format_version,
            history_group_closed_before: false,
            value: IntentResultValue::Error(error),
        }
    }

    fn outcome(&self) -> Option<&EditorIntentOutcome> {
        match &self.value {
            IntentResultValue::Outcome(outcome) => Some(outcome.as_ref()),
            IntentResultValue::Error(_) => None,
        }
    }

    fn execution(&self) -> Option<&IntentExecutionOutcome> {
        self.outcome().map(EditorIntentOutcome::execution)
    }

    fn fallthrough(&self, index: u32) -> Option<&IntentFallThrough> {
        self.execution()?.fallthroughs().get(index as usize)
    }
}

#[wasm_bindgen]
impl BreditorIntentResult {
    /// Reports whether this intent atomically closed an open history group first.
    #[must_use]
    #[wasm_bindgen(getter, js_name = historyGroupClosedBefore)]
    pub fn history_group_closed_before(&self) -> bool {
        self.history_group_closed_before
    }

    /// Returns `committed`, `blocked`, `unhandled`, or `error`.
    #[must_use]
    #[wasm_bindgen(getter, unchecked_return_type = "BreditorIntentResultStatus")]
    pub fn status(&self) -> String {
        match self.execution() {
            Some(IntentExecutionOutcome::Committed { .. }) => "committed",
            Some(IntentExecutionOutcome::Blocked { .. }) => "blocked",
            Some(IntentExecutionOutcome::Unhandled { .. }) => "unhandled",
            None => "error",
        }
        .to_owned()
    }

    /// Checks this result's opaque process-local profile identity.
    #[must_use]
    #[wasm_bindgen(js_name = matchesProfileGeneration)]
    pub fn matches_profile_generation(&self, generation: &BreditorProfileGeneration) -> bool {
        self.generation == generation.inner
    }

    /// Returns an independently disposable successor observation for every non-error result.
    #[must_use]
    pub fn observation(&self) -> Option<BreditorObservation> {
        self.outcome().map(EditorIntentOutcome::observation).cloned().map(BreditorObservation::new)
    }

    /// Returns the routed semantic intent identity.
    #[must_use]
    #[wasm_bindgen(getter, js_name = intentId)]
    pub fn intent_id(&self) -> Option<String> {
        self.execution().map(|outcome| outcome.intent_id().as_str().to_owned())
    }

    /// Returns the selected or blocking binding identity.
    #[must_use]
    #[wasm_bindgen(getter, js_name = bindingId)]
    pub fn binding_id(&self) -> Option<String> {
        self.execution()
            .and_then(IntentExecutionOutcome::binding)
            .map(|binding| binding.id().as_str().to_owned())
    }

    /// Returns the selected or blocking concrete action identity.
    #[must_use]
    #[wasm_bindgen(getter, js_name = actionId)]
    pub fn action_id(&self) -> Option<String> {
        self.execution()
            .and_then(IntentExecutionOutcome::binding)
            .map(|binding| binding.action_id().as_str().to_owned())
    }

    /// Returns the selected or blocking binding priority.
    #[must_use]
    #[wasm_bindgen(getter, js_name = bindingPriority)]
    pub fn binding_priority(&self) -> Option<i32> {
        self.execution()
            .and_then(IntentExecutionOutcome::binding)
            .map(|binding| binding.priority().get())
    }

    /// Returns the stable blocking reason code.
    #[must_use]
    #[wasm_bindgen(getter, js_name = blockedReasonCode)]
    pub fn blocked_reason_code(&self) -> Option<String> {
        self.execution()
            .and_then(IntentExecutionOutcome::blocked_reason)
            .map(|reason| reason.code().as_str().to_owned())
    }

    /// Separately encodes optional blocking reason detail as bounded JSON.
    #[must_use]
    #[wasm_bindgen(js_name = blockedReasonDetailJson)]
    pub fn blocked_reason_detail_json(&self) -> BreditorStringResult {
        self.execution()
            .and_then(IntentExecutionOutcome::blocked_reason)
            .and_then(|reason| reason.detail())
            .map_or_else(BreditorStringResult::absent, action_value_json)
    }

    /// Returns the blocked activation indicator.
    #[must_use]
    #[wasm_bindgen(
        getter,
        js_name = blockedActivation,
        unchecked_return_type = "BreditorActionActivation | undefined"
    )]
    pub fn blocked_activation(&self) -> Option<String> {
        self.execution()
            .and_then(IntentExecutionOutcome::blocked_indicator)
            .map(|indicator| activation(indicator.activation()).to_owned())
    }

    /// Returns the blocked indicator's value-state category.
    #[must_use]
    #[wasm_bindgen(
        getter,
        js_name = blockedValueStatus,
        unchecked_return_type = "BreditorActionStateValueStatus | undefined"
    )]
    pub fn blocked_value_status(&self) -> Option<String> {
        self.execution()
            .and_then(IntentExecutionOutcome::blocked_indicator)
            .map(|indicator| state_value_status(indicator.value()).to_owned())
    }

    /// Returns the blocked indicator's optional value-contract name.
    #[must_use]
    #[wasm_bindgen(getter, js_name = blockedValueContractName)]
    pub fn blocked_value_contract_name(&self) -> Option<String> {
        self.execution()
            .and_then(IntentExecutionOutcome::blocked_indicator)
            .and_then(|indicator| indicator.value().contract())
            .map(|contract| contract.name().as_str().to_owned())
    }

    /// Returns the blocked indicator's optional value-contract version.
    #[must_use]
    #[wasm_bindgen(getter, js_name = blockedValueContractVersion)]
    pub fn blocked_value_contract_version(&self) -> Option<u32> {
        self.execution()
            .and_then(IntentExecutionOutcome::blocked_indicator)
            .and_then(|indicator| indicator.value().contract())
            .map(|contract| contract.version().get())
    }

    /// Separately encodes a uniform blocked indicator value as bounded JSON.
    #[must_use]
    #[wasm_bindgen(js_name = blockedValueJson)]
    pub fn blocked_value_json(&self) -> BreditorStringResult {
        self.execution()
            .and_then(IntentExecutionOutcome::blocked_indicator)
            .and_then(|indicator| match indicator.value() {
                ActionStateValue::Uniform { value, .. } => Some(value),
                ActionStateValue::Unsupported
                | ActionStateValue::Unset { .. }
                | ActionStateValue::Mixed { .. } => None,
            })
            .map_or_else(BreditorStringResult::absent, action_value_json)
    }

    /// Returns the complete bounded disabled-fallthrough count.
    #[must_use]
    #[wasm_bindgen(getter, js_name = fallthroughCount)]
    pub fn fallthrough_count(&self) -> u32 {
        self.execution()
            .map_or(0, |outcome| u32::try_from(outcome.fallthroughs().len()).unwrap_or(u32::MAX))
    }

    /// Returns one fallthrough binding identity.
    #[must_use]
    #[wasm_bindgen(js_name = fallthroughBindingId)]
    pub fn fallthrough_binding_id(&self, index: u32) -> Option<String> {
        self.fallthrough(index).map(|item| item.binding_id().as_str().to_owned())
    }

    /// Returns one fallthrough action identity.
    #[must_use]
    #[wasm_bindgen(js_name = fallthroughActionId)]
    pub fn fallthrough_action_id(&self, index: u32) -> Option<String> {
        self.fallthrough(index).map(|item| item.action_id().as_str().to_owned())
    }

    /// Returns one fallthrough binding priority.
    #[must_use]
    #[wasm_bindgen(js_name = fallthroughPriority)]
    pub fn fallthrough_priority(&self, index: u32) -> Option<i32> {
        self.fallthrough(index).map(|item| item.priority().get())
    }

    /// Returns one fallthrough disabled-reason code.
    #[must_use]
    #[wasm_bindgen(js_name = fallthroughReasonCode)]
    pub fn fallthrough_reason_code(&self, index: u32) -> Option<String> {
        self.fallthrough(index).map(|item| item.reason().code().as_str().to_owned())
    }

    /// Separately encodes one fallthrough reason detail as bounded JSON.
    #[must_use]
    #[wasm_bindgen(js_name = fallthroughReasonDetailJson)]
    pub fn fallthrough_reason_detail_json(&self, index: u32) -> BreditorStringResult {
        self.fallthrough(index)
            .and_then(|item| item.reason().detail())
            .map_or_else(BreditorStringResult::absent, action_value_json)
    }

    /// Separately encodes the published commit as V2 for legacy/property-free
    /// engines or V3 for a property-preserving engine.
    #[must_use]
    #[wasm_bindgen(js_name = commitJson)]
    pub fn commit_json(&self) -> BreditorStringResult {
        let Some(commit) = self.execution().and_then(IntentExecutionOutcome::commit) else {
            return BreditorStringResult::absent();
        };
        match self.checkpoint_format_version {
            1 | 2 => {
                match CommitJsonCodecV2::new(commit.after().context().clone()).encode(commit) {
                    Ok(json) => BreditorStringResult::from_value(json),
                    Err(error) => BreditorStringResult::from_error(BreditorError::codec(
                        error.code(),
                        "the published intent commit could not be encoded",
                    )),
                }
            }
            3 => match CommitJsonCodecV3::new(commit.after().context().clone()).encode(commit) {
                Ok(json) => BreditorStringResult::from_value(json),
                Err(error) => BreditorStringResult::from_error(BreditorError::codec(
                    error.code(),
                    "the published intent commit could not be encoded",
                )),
            },
            _ => BreditorStringResult::from_error(BreditorError::new(
                crate::error::UNSUPPORTED_CHECKPOINT_FORMAT_CODE,
                "the engine checkpoint format is unsupported",
            )),
        }
    }

    /// Returns a generation-correlated renderer update for a committed intent.
    #[must_use]
    #[wasm_bindgen(js_name = projectionUpdate)]
    pub fn projection_update(&self) -> Option<BreditorProjectionUpdate> {
        self.execution()
            .and_then(IntentExecutionOutcome::commit)
            .map(|commit| BreditorProjectionUpdate::from_commit(self.generation.clone(), commit))
    }

    /// Returns an independently owned structured command error, when present.
    #[must_use]
    #[wasm_bindgen(getter)]
    pub fn error(&self) -> Option<BreditorError> {
        match &self.value {
            IntentResultValue::Error(error) => Some(error.clone()),
            IntentResultValue::Outcome(_) => None,
        }
    }
}

const fn activation(value: ActionActivation) -> &'static str {
    match value {
        ActionActivation::Stateless => "stateless",
        ActionActivation::Inactive => "inactive",
        ActionActivation::Active => "active",
        ActionActivation::Mixed => "mixed",
    }
}
