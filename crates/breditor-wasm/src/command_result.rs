use breditor_core::{
    action::{ActionActivation, ActionStateValue},
    codec::CommitJsonCodec,
    engine::{
        EditorActionOutcome, EditorDisabledAction, EditorEngineEvent, EditorEngineObservation,
    },
};
use wasm_bindgen::prelude::wasm_bindgen;

use crate::{
    BreditorError, BreditorObservation, BreditorStringResult,
    action_value_json::{action_value_json, state_value_status},
};

enum CommandResultValue {
    Committed(EditorEngineEvent),
    Disabled(EditorDisabledAction),
    Unchanged(EditorEngineObservation),
    Error(BreditorError),
}

/// Structured result of one guarded editor command.
///
/// `status` is exactly `committed`, `disabled`, `unchanged`, or `error`.
/// Every non-error result owns the exact observation to present with the next
/// queued command. A committed result retains its sealed core event until this
/// JavaScript object is freed.
#[wasm_bindgen]
pub struct BreditorCommandResult {
    value: CommandResultValue,
}

impl BreditorCommandResult {
    pub(crate) const fn committed(event: EditorEngineEvent) -> Self {
        Self { value: CommandResultValue::Committed(event) }
    }

    pub(crate) const fn from_disabled(disabled: EditorDisabledAction) -> Self {
        Self { value: CommandResultValue::Disabled(disabled) }
    }

    pub(crate) const fn unchanged(observation: EditorEngineObservation) -> Self {
        Self { value: CommandResultValue::Unchanged(observation) }
    }

    pub(crate) const fn from_error(error: BreditorError) -> Self {
        Self { value: CommandResultValue::Error(error) }
    }

    pub(crate) fn from_action_outcome(outcome: EditorActionOutcome) -> Self {
        match outcome {
            EditorActionOutcome::Committed(event) => Self::committed(event),
            EditorActionOutcome::Disabled(disabled) => Self::from_disabled(disabled),
        }
    }

    pub(crate) fn from_optional_event(
        event: Option<EditorEngineEvent>,
        unchanged: EditorEngineObservation,
    ) -> Self {
        event.map_or_else(|| Self::unchanged(unchanged), Self::committed)
    }

    fn disabled_value(&self) -> Option<&EditorDisabledAction> {
        match &self.value {
            CommandResultValue::Disabled(disabled) => Some(disabled),
            CommandResultValue::Committed(_)
            | CommandResultValue::Unchanged(_)
            | CommandResultValue::Error(_) => None,
        }
    }
}

#[wasm_bindgen]
impl BreditorCommandResult {
    /// Returns `committed`, `disabled`, `unchanged`, or `error`.
    #[must_use]
    #[wasm_bindgen(getter, unchecked_return_type = "BreditorCommandStatus")]
    pub fn status(&self) -> String {
        match self.value {
            CommandResultValue::Committed(_) => "committed",
            CommandResultValue::Disabled(_) => "disabled",
            CommandResultValue::Unchanged(_) => "unchanged",
            CommandResultValue::Error(_) => "error",
        }
        .to_owned()
    }

    /// Returns the sealed engine-event kind for a committed command.
    #[must_use]
    #[wasm_bindgen(
        getter,
        js_name = eventKind,
        unchecked_return_type = "BreditorEngineEventKind | undefined"
    )]
    pub fn event_kind(&self) -> Option<String> {
        match &self.value {
            CommandResultValue::Committed(event) => Some(event.kind().as_str().to_owned()),
            CommandResultValue::Disabled(_)
            | CommandResultValue::Unchanged(_)
            | CommandResultValue::Error(_) => None,
        }
    }

    /// Returns the exact successor observation for every non-error outcome.
    #[must_use]
    pub fn observation(&self) -> Option<BreditorObservation> {
        match &self.value {
            CommandResultValue::Committed(event) => {
                Some(BreditorObservation::new(event.observation().clone()))
            }
            CommandResultValue::Disabled(disabled) => {
                Some(BreditorObservation::new(disabled.observation().clone()))
            }
            CommandResultValue::Unchanged(observation) => {
                Some(BreditorObservation::new(observation.clone()))
            }
            CommandResultValue::Error(_) => None,
        }
    }

    /// Returns the structured command error, when present.
    #[must_use]
    #[wasm_bindgen(getter)]
    pub fn error(&self) -> Option<BreditorError> {
        match &self.value {
            CommandResultValue::Error(error) => Some(error.clone()),
            CommandResultValue::Committed(_)
            | CommandResultValue::Disabled(_)
            | CommandResultValue::Unchanged(_) => None,
        }
    }

    /// Separately encodes the retained commit, if this outcome has one.
    ///
    /// Encoding is intentionally not part of command publication. `absent`
    /// means the outcome is disabled/unchanged or its effective event is a
    /// history-only control. `error` means publication succeeded but Commit V1
    /// could not be represented within the active codec budget.
    #[must_use]
    #[wasm_bindgen(js_name = commitJson)]
    pub fn commit_json(&self) -> BreditorStringResult {
        let CommandResultValue::Committed(event) = &self.value else {
            return BreditorStringResult::absent();
        };
        let Some(commit) = event.commit() else {
            return BreditorStringResult::absent();
        };
        match CommitJsonCodec::new(commit.after().context().clone()).encode(commit) {
            Ok(json) => BreditorStringResult::from_value(json),
            Err(error) => BreditorStringResult::from_error(BreditorError::codec(
                error.code(),
                "the published commit could not be encoded",
            )),
        }
    }

    /// Returns the action identity for a disabled action outcome.
    #[must_use]
    #[wasm_bindgen(getter, js_name = disabledActionId)]
    pub fn disabled_action_id(&self) -> Option<String> {
        self.disabled_value().map(|disabled| disabled.action().as_str().to_owned())
    }

    /// Returns the stable reason code for a disabled action outcome.
    #[must_use]
    #[wasm_bindgen(getter, js_name = disabledReasonCode)]
    pub fn disabled_reason_code(&self) -> Option<String> {
        self.disabled_value().map(|disabled| disabled.reason().code().as_str().to_owned())
    }

    /// Separately encodes optional disabled-reason detail as JSON.
    #[must_use]
    #[wasm_bindgen(js_name = disabledReasonDetailJson)]
    pub fn disabled_reason_detail_json(&self) -> BreditorStringResult {
        self.disabled_value()
            .and_then(|disabled| disabled.reason().detail())
            .map_or_else(BreditorStringResult::absent, action_value_json)
    }

    /// Returns the disabled outcome's activation: `stateless`, `inactive`,
    /// `active`, or `mixed`.
    #[must_use]
    #[wasm_bindgen(getter, js_name = activation, unchecked_return_type = "BreditorActionActivation | undefined")]
    pub fn activation(&self) -> Option<String> {
        self.disabled_value().map(|disabled| {
            match disabled.indicator().activation() {
                ActionActivation::Stateless => "stateless",
                ActionActivation::Inactive => "inactive",
                ActionActivation::Active => "active",
                ActionActivation::Mixed => "mixed",
            }
            .to_owned()
        })
    }

    /// Returns the disabled indicator value state: `unsupported`, `unset`,
    /// `uniform`, or `mixed`.
    #[must_use]
    #[wasm_bindgen(
        getter,
        js_name = indicatorValueStatus,
        unchecked_return_type = "BreditorActionStateValueStatus | undefined"
    )]
    pub fn indicator_value_status(&self) -> Option<String> {
        self.disabled_value()
            .map(|disabled| state_value_status(disabled.indicator().value()).to_owned())
    }

    /// Returns the disabled indicator value-contract name, when supported.
    #[must_use]
    #[wasm_bindgen(getter, js_name = indicatorValueContractName)]
    pub fn indicator_value_contract_name(&self) -> Option<String> {
        self.disabled_value()
            .and_then(|disabled| disabled.indicator().value().contract())
            .map(|contract| contract.name().as_str().to_owned())
    }

    /// Returns the disabled indicator value-contract version, when supported.
    #[must_use]
    #[wasm_bindgen(getter, js_name = indicatorValueContractVersion)]
    pub fn indicator_value_contract_version(&self) -> Option<u32> {
        self.disabled_value()
            .and_then(|disabled| disabled.indicator().value().contract())
            .map(|contract| contract.version().get())
    }

    /// Separately encodes a uniform disabled indicator value as JSON.
    #[must_use]
    #[wasm_bindgen(js_name = indicatorValueJson)]
    pub fn indicator_value_json(&self) -> BreditorStringResult {
        self.disabled_value()
            .and_then(|disabled| match disabled.indicator().value() {
                ActionStateValue::Uniform { value, .. } => Some(value),
                ActionStateValue::Unsupported
                | ActionStateValue::Unset { .. }
                | ActionStateValue::Mixed { .. } => None,
            })
            .map_or_else(BreditorStringResult::absent, action_value_json)
    }
}

#[cfg(test)]
mod tests {
    use std::{error::Error, io};

    use breditor_core::{
        codec::DocumentJsonCodec,
        engine::EditorEngine,
        position::{Affinity, NodePath, Point},
        schema::DocumentLimits,
        selection::{RangeSelection, Selection},
        session::EditorSession,
        state::{EditorContext, EditorState, LineageId},
    };

    use crate::BreditorEngine;

    const DOCUMENT_JSON: &str = r#"{
      "format":"breditor/document","formatVersion":1,
      "schema":{"name":"breditor/base","version":1},
      "root":{"kind":"element","type":"breditor/document","entityId":null,"properties":{},
        "children":[{"kind":"element","type":"breditor/paragraph","entityId":null,
          "properties":{},"children":[{"kind":"text","text":"private-before","formats":[]}]}]}
    }"#;

    #[test]
    fn published_command_remains_committed_when_later_commit_encoding_fails()
    -> Result<(), Box<dyn Error>> {
        let mut baseline = engine_with_max_json_bytes(None)?;
        let baseline_observation = baseline.observation();
        let baseline_command = baseline.execute_string_action(
            &baseline_observation,
            "breditor/insert-text",
            "private-after",
        );
        let mut baseline_json = baseline_command.commit_json();
        let baseline_json = baseline_json
            .take_value()
            .ok_or_else(|| io::Error::other("baseline commit did not encode"))?;
        let tight_limit = baseline_json
            .len()
            .checked_sub(1)
            .ok_or_else(|| io::Error::other("baseline commit was unexpectedly empty"))?;

        let mut engine = engine_with_max_json_bytes(Some(tight_limit))?;
        let initial = engine.observation();
        let command =
            engine.execute_string_action(&initial, "breditor/insert-text", "private-after");
        assert_eq!(command.status(), "committed");
        assert_eq!(command.event_kind().as_deref(), Some("action"));
        let successor = command
            .observation()
            .ok_or_else(|| io::Error::other("committed command omitted its observation"))?;
        assert_eq!(successor.snapshot_revision(), "1");

        let encoded = command.commit_json();
        assert_eq!(encoded.status(), "error");
        let error =
            encoded.error().ok_or_else(|| io::Error::other("codec failure omitted its error"))?;
        assert_eq!(error.code(), "codec.output_too_large");
        assert_eq!(error.message(), "the published commit could not be encoded");
        assert!(!error.message().contains("private-before"));
        assert!(!error.message().contains("private-after"));
        assert_eq!(command.status(), "committed");

        let stale_retry =
            engine.execute_string_action(&initial, "breditor/insert-text", "private-after");
        assert_eq!(stale_retry.status(), "error");
        assert_eq!(
            stale_retry.error().map(|error| error.code()),
            Some("editor_engine.stale_snapshot".to_owned())
        );
        let undo = engine.undo(&successor);
        assert_eq!(undo.status(), "committed");
        assert_eq!(undo.event_kind().as_deref(), Some("undo"));
        Ok(())
    }

    fn engine_with_max_json_bytes(
        maximum: Option<usize>,
    ) -> Result<BreditorEngine, Box<dyn Error>> {
        let defaults = EditorContext::default();
        let document = DocumentJsonCodec::new(defaults.schema().clone())
            .with_limits(defaults.limits().clone())
            .decode(DOCUMENT_JSON)?;
        let limits = maximum.map_or_else(DocumentLimits::default, |maximum| {
            DocumentLimits::default().with_max_json_bytes(maximum)
        });
        let context = EditorContext::new(defaults.schema().clone(), limits);
        let point = Point::Text {
            text_path: NodePath::try_from_indices(vec![0, 0])?,
            utf16_offset: 14,
            affinity: Affinity::After,
        };
        let selection: Selection = RangeSelection::new(point.clone(), point).into();
        let state = EditorState::try_new(
            &context,
            LineageId::try_new("wasm-post-publication")?,
            document,
            Some(selection),
            None,
        )?;
        let session = EditorSession::new(state);
        Ok(BreditorEngine::new(EditorEngine::try_with_base_actions(session)?))
    }
}
