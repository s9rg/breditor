use breditor_core::action::{ActionInput, routing::IntentId, routing::IntentInvocation};
use wasm_bindgen::prelude::wasm_bindgen;

use crate::{
    BreditorEngine, BreditorError, BreditorIntentResult, BreditorObservation,
    command::{action_value_json_error, decode_action_value_json},
    error::{INTENT_REJECTS_TYPED_CODE, INVALID_INTENT_ID_CODE, UNKNOWN_INTENT_CODE},
};

#[wasm_bindgen]
impl BreditorEngine {
    /// Routes one declared typed semantic intent from strict bounded JSON.
    ///
    /// The caller cannot name an action-input contract. Its exact identity and
    /// version are derived from the compiled intent descriptor and forwarded
    /// unchanged through routing. Stale observation rejection precedes identity
    /// and JSON admission; the core repeats the complete guard while consuming
    /// the selected route. When `close_history_group_before` is true, the
    /// history close and routed command publish as one checkpointed candidate.
    #[must_use]
    #[wasm_bindgen(js_name = executeTypedIntentJson)]
    pub fn execute_typed_intent_json(
        &mut self,
        expected: &BreditorObservation,
        intent_id: &str,
        input_json: &str,
        close_history_group_before: bool,
    ) -> BreditorIntentResult {
        let generation = self.generation.clone();
        let checkpoint_format_version = self.inner.session_checkpoint_format_version();
        if let Err(error) = self.inner.check_observation(expected.inner()) {
            return BreditorIntentResult::from_error(
                generation,
                checkpoint_format_version,
                BreditorError::checkpointed_engine(&error),
            );
        }
        let Ok(intent_id) = IntentId::try_new(intent_id) else {
            return BreditorIntentResult::from_error(
                generation,
                checkpoint_format_version,
                BreditorError::new(INVALID_INTENT_ID_CODE, "the semantic intent ID is invalid"),
            );
        };
        let contract = match self
            .inner
            .compiled_profile_descriptor()
            .and_then(|descriptor| descriptor.intent(&intent_id))
        {
            Some(descriptor) => match descriptor.input_contract() {
                Some(contract) => contract.clone(),
                None => {
                    return BreditorIntentResult::from_error(
                        generation,
                        checkpoint_format_version,
                        BreditorError::new(
                            INTENT_REJECTS_TYPED_CODE,
                            "the semantic intent does not accept typed input",
                        ),
                    );
                }
            },
            None => {
                return BreditorIntentResult::from_error(
                    generation,
                    checkpoint_format_version,
                    BreditorError::new(UNKNOWN_INTENT_CODE, "the semantic intent is not declared"),
                );
            }
        };
        let value = match decode_action_value_json(input_json) {
            Ok(value) => value,
            Err(error) => {
                return BreditorIntentResult::from_error(
                    generation,
                    checkpoint_format_version,
                    action_value_json_error(error),
                );
            }
        };

        let invocation = IntentInvocation::new(intent_id, ActionInput::typed(contract, value));
        let outcome = if close_history_group_before {
            self.inner
                .execute_intent_after_closing_history_group(expected.inner(), &invocation)
                .map(|sequence| {
                    BreditorIntentResult::from_sequence(
                        generation.clone(),
                        checkpoint_format_version,
                        sequence,
                    )
                })
        } else {
            self.inner.execute_intent(expected.inner(), &invocation).map(|outcome| {
                BreditorIntentResult::from_outcome(
                    generation.clone(),
                    checkpoint_format_version,
                    outcome,
                )
            })
        };
        match outcome {
            Ok(result) => result,
            Err(error) => BreditorIntentResult::from_error(
                generation,
                checkpoint_format_version,
                BreditorError::typed_command(&error),
            ),
        }
    }
}

#[cfg(test)]
mod tests {
    use std::{error::Error, io};

    use breditor_core::{
        action::{ActionId, ActionStateId, routing::BindingId},
        codec::DocumentJsonCodecV2,
        extension::{
            ExtensionId, ExtensionLimits, ExtensionManifest, ExtensionSet, ExtensionVersion,
            InlineFormatPropertyContractV1, InlineFormatPropertySpecV1, InlineFormatPropertyTypeV1,
            InlineFormatSetSpecV1, InlineFormatSpecV1, PropertyPresenceV1,
        },
        identity::QualifiedName,
        position::{Affinity, NodePath, Point},
        profile::CompiledEditorProfile,
        schema::{DocumentLimits, PersistedTypeRevision, SchemaId, SchemaVersion},
        selection::{RangeSelection, Selection},
        session::{EditorSession, HistoryCapacity},
        state::{EditorState, LineageId},
    };
    use serde_json::json;

    use super::*;

    type TestResult<T = ()> = Result<T, Box<dyn Error>>;

    const ACTION: &str = "example/set-link";
    const INTENT: &str = "example/set-link-intent";

    #[test]
    fn intent_contract_is_derived_and_routed_with_strict_json() -> TestResult {
        let mut engine = engine()?;
        let observation = engine.observation();
        let checkpoint = checkpoint_json(&engine)?;
        let valid_input = r#"{
          "operation":"set",
          "properties":[{"name":"example/href","value":"https://example.test"}]
        }"#;
        let duplicate = engine.execute_typed_intent_json(
            &observation,
            INTENT,
            r#"{"operation":"remove","operation":"set"}"#,
            true,
        );
        assert_error(&duplicate, crate::error::INVALID_ACTION_VALUE_JSON_CODE, "operation")?;

        let invalid =
            engine.execute_typed_intent_json(&observation, INTENT, r#"{"operation":"set"}"#, true);
        assert_error(&invalid, crate::error::TYPED_INPUT_REJECTED_CODE, "operation")?;
        assert_eq!(checkpoint_json(&engine)?, checkpoint);

        let no_contract = engine.execute_typed_intent_json(
            &observation,
            "breditor/format-strong",
            "private malformed JSON",
            false,
        );
        assert_error(&no_contract, INTENT_REJECTS_TYPED_CODE, "private")?;

        let unknown = engine.execute_typed_intent_json(
            &observation,
            "example/missing-intent",
            "private malformed JSON",
            false,
        );
        assert_error(&unknown, UNKNOWN_INTENT_CODE, "private")?;

        let committed = engine.execute_typed_intent_json(&observation, INTENT, valid_input, true);
        assert_eq!(committed.status(), "committed");
        assert!(!committed.history_group_closed_before());
        assert_eq!(committed.intent_id().as_deref(), Some(INTENT));
        assert_eq!(committed.action_id().as_deref(), Some(ACTION));
        assert!(committed.error().is_none());
        Ok(())
    }

    #[test]
    fn stale_intent_observation_precedes_identity_and_json_admission() -> TestResult {
        let mut engine = engine()?;
        let stale = engine.observation();
        advance_selection(&mut engine, &stale)?;
        let checkpoint = checkpoint_json(&engine)?;

        let result = engine.execute_typed_intent_json(
            &stale,
            "not an intent identity",
            "private malformed JSON",
            true,
        );
        assert_error(&result, "editor_engine.stale_snapshot", "private")?;
        assert_eq!(checkpoint_json(&engine)?, checkpoint);
        Ok(())
    }

    fn engine() -> TestResult<BreditorEngine> {
        let profile = typed_profile()?;
        let context = profile.editor_context(DocumentLimits::default());
        let source = json!({
            "format": "breditor/document",
            "formatVersion": 2,
            "schema": {
                "name": profile.schema().id().name().as_str(),
                "version": profile.schema().id().version().get(),
            },
            "schemaFingerprint": profile.schema().fingerprint().to_string(),
            "root": {
                "kind": "element",
                "type": "breditor/document",
                "entityId": null,
                "properties": {},
                "children": [{
                    "kind": "element",
                    "type": "breditor/paragraph",
                    "entityId": null,
                    "properties": {},
                    "children": [{"kind": "text", "text": "abc", "formats": []}],
                }],
            },
        })
        .to_string();
        let document = DocumentJsonCodecV2::new(profile.schema().clone()).decode(&source)?;
        let state = EditorState::try_new(
            &context,
            LineageId::try_new("typed-intent-json")?,
            document,
            Some(selected_text()?),
            None,
        )?;
        let session = EditorSession::with_history_capacity(state, HistoryCapacity::DISABLED);
        let action_states = profile.action_state_cache();
        let core =
            breditor_core::engine::EditorEngine::try_with_compiled_profile(session, profile)?;
        BreditorEngine::try_new_v3(core, action_states).map_err(Into::into)
    }

    fn typed_profile() -> TestResult<CompiledEditorProfile> {
        let format = qualified("example/link")?;
        let property = qualified("example/href")?;
        let manifest = ExtensionManifest::try_new_with_inline_formats_property_contracts_and_sets(
            ExtensionId::new(qualified("example/link-extension")?, ExtensionVersion::one()),
            Vec::new(),
            Vec::new(),
            vec![InlineFormatSpecV1::new(format.clone(), PersistedTypeRevision::one())],
            vec![InlineFormatPropertyContractV1::try_new(
                format.clone(),
                vec![InlineFormatPropertySpecV1::new(
                    property,
                    PropertyPresenceV1::Required,
                    InlineFormatPropertyTypeV1::try_string(1, 2_048)?,
                )],
            )?],
            vec![InlineFormatSetSpecV1::new(
                format,
                ActionId::try_new(ACTION)?,
                IntentId::try_new(INTENT)?,
                BindingId::try_new("example/set-link-binding")?,
                ActionStateId::try_new("example/link-presence")?,
            )],
        )?;
        let extensions = ExtensionSet::try_new(vec![manifest], ExtensionLimits::default())?;
        CompiledEditorProfile::try_compile_base_text_profile(
            SchemaId::new(qualified("example/typed-json-profile")?, SchemaVersion::try_new(1)?),
            extensions,
        )
        .map_err(Into::into)
    }

    fn qualified(value: &str) -> TestResult<QualifiedName> {
        QualifiedName::try_new(value).map_err(Into::into)
    }

    fn selected_text() -> TestResult<Selection> {
        let anchor = Point::Text {
            text_path: NodePath::try_from_indices(vec![0, 0])?,
            utf16_offset: 0,
            affinity: Affinity::Before,
        };
        let focus = Point::Text {
            text_path: NodePath::try_from_indices(vec![0, 0])?,
            utf16_offset: 3,
            affinity: Affinity::After,
        };
        Ok(RangeSelection::new(anchor, focus).into())
    }

    fn advance_selection(
        engine: &mut BreditorEngine,
        expected: &BreditorObservation,
    ) -> TestResult {
        let point = Point::Text {
            text_path: NodePath::try_from_indices(vec![0, 0])?,
            utf16_offset: 1,
            affinity: Affinity::After,
        };
        let selection: Selection = RangeSelection::new(point.clone(), point).into();
        let event = engine.inner.set_selection(expected.inner(), Some(selection))?;
        if event.is_none() {
            return Err(io::Error::other("selection did not advance the engine").into());
        }
        Ok(())
    }

    fn checkpoint_json(engine: &BreditorEngine) -> TestResult<String> {
        engine
            .session_checkpoint_json()
            .take_value()
            .ok_or_else(|| io::Error::other("checkpoint JSON was absent").into())
    }

    fn assert_error(result: &BreditorIntentResult, code: &str, private: &str) -> TestResult {
        assert_eq!(result.status(), "error");
        assert!(result.observation().is_none());
        let error = result.error().ok_or_else(|| io::Error::other("intent error was absent"))?;
        assert_eq!(error.code(), code);
        assert!(!error.message().contains(private));
        Ok(())
    }
}
