//! Explicit property-preserving engine factories for compiled profiles.

use breditor_core::{
    codec::{DocumentJsonCodecV2, SessionCheckpointJsonCodecV3},
    engine::EditorEngine,
    schema::DocumentLimits,
    session::EditorSession,
    state::{EditorState, LineageId},
};
use wasm_bindgen::prelude::wasm_bindgen;

use crate::{
    BreditorCompiledProfile, BreditorEngine, BreditorEngineResult, BreditorError,
    error::{
        INVALID_HISTORY_CAPACITY_CODE, INVALID_INITIAL_STATE_CODE, INVALID_LINEAGE_CODE,
        PROFILE_COMPILATION_CODE,
    },
    from_document_json::parse_history_capacity,
};

#[wasm_bindgen]
impl BreditorCompiledProfile {
    /// Creates a property-preserving Session V3 engine from Document V2 JSON.
    ///
    /// The document remains bound to this profile's exact schema fingerprint.
    /// Selection, pending formats, and history start empty. Every later
    /// mutation must be representable as a complete Session V3 checkpoint
    /// before it can become authoritative.
    #[must_use]
    #[wasm_bindgen(js_name = createEngineFromDocumentJsonV3)]
    pub fn create_engine_from_document_json_v3(
        &self,
        lineage: &str,
        document_json: &str,
        history_capacity: f64,
    ) -> BreditorEngineResult {
        let Ok(lineage) = LineageId::try_new(lineage) else {
            return BreditorEngineResult::from_error(BreditorError::new(
                INVALID_LINEAGE_CODE,
                "the editor lineage is invalid",
            ));
        };
        let Some(history_capacity) = parse_history_capacity(history_capacity) else {
            return BreditorEngineResult::from_error(BreditorError::new(
                INVALID_HISTORY_CAPACITY_CODE,
                "the history capacity is invalid",
            ));
        };
        let profile = self.inner.clone();
        let context = profile.editor_context(DocumentLimits::default());
        let codec = DocumentJsonCodecV2::new(profile.schema().clone())
            .with_limits(context.limits().clone());
        let document = match codec.decode(document_json) {
            Ok(document) => document,
            Err(error) => {
                return BreditorEngineResult::from_error(BreditorError::codec(
                    error.code(),
                    "the initial profile document was rejected",
                ));
            }
        };
        let Ok(state) = EditorState::try_new(&context, lineage, document, None, None) else {
            return BreditorEngineResult::from_error(BreditorError::new(
                INVALID_INITIAL_STATE_CODE,
                "the initial editor state was rejected",
            ));
        };
        self.finish_v3_engine(EditorSession::with_history_capacity(state, history_capacity))
    }

    /// Restores a property-preserving engine from strict Session V3 JSON.
    ///
    /// Restoration replay-proves current state and every retained history entry
    /// under this exact compiled schema. A failed decode consumes neither this
    /// profile nor any engine previously produced from it.
    #[must_use]
    #[wasm_bindgen(js_name = createEngineFromSessionCheckpointJsonV3)]
    pub fn create_engine_from_session_checkpoint_json_v3(
        &self,
        checkpoint_json: &str,
    ) -> BreditorEngineResult {
        let profile = self.inner.clone();
        let context = profile.editor_context(DocumentLimits::default());
        let session = match SessionCheckpointJsonCodecV3::new(context).decode(checkpoint_json) {
            Ok(session) => session,
            Err(error) => {
                return BreditorEngineResult::from_error(BreditorError::codec(
                    error.code(),
                    "the profile session checkpoint was rejected",
                ));
            }
        };
        self.finish_v3_engine(session)
    }

    fn finish_v3_engine(&self, session: EditorSession) -> BreditorEngineResult {
        let profile = self.inner.clone();
        let action_states = profile.action_state_cache();
        let Ok(engine) = EditorEngine::try_with_compiled_profile(session, profile) else {
            return BreditorEngineResult::from_error(BreditorError::new(
                PROFILE_COMPILATION_CODE,
                "the compiled profile engine is unavailable",
            ));
        };
        match BreditorEngine::try_new_v3(engine, action_states) {
            Ok(engine) => BreditorEngineResult::success(engine),
            Err(error) => BreditorEngineResult::from_error(error),
        }
    }
}

#[cfg(test)]
mod tests {
    use std::{error::Error, io};

    use breditor_core::{
        position::{Affinity, NodePath, Point},
        selection::{RangeSelection, Selection},
    };
    use serde_json::{Value, json};

    use super::*;

    type TestResult<T = ()> = Result<T, Box<dyn Error>>;

    const PROFILE_JSON: &str = r#"{
      "format":"breditor/profile-bootstrap","formatVersion":2,
      "schema":{"name":"example/link-editor","version":1},
      "extensions":[{
        "id":{"name":"example/link-extension","version":1},
        "dependencies":[],"conflicts":[],
        "inlineFormats":[{"kind":"example/link","revision":1}],
        "inlineFormatPropertyContracts":[{
          "formatKind":"example/link",
          "properties":[{
            "name":"example/href","presence":"required",
            "valueType":{"kind":"string","minimumUtf8Bytes":1,"maximumUtf8Bytes":2048}
          }]
        }],
        "inlineFormatToggles":[],
        "inlineFormatSets":[{
          "formatKind":"example/link","actionId":"example/set-link",
          "intentId":"example/set-link-intent","bindingId":"example/set-link-binding",
          "actionStateId":"example/link-presence"
        }]
      }]
    }"#;
    const LINK_STATE_VALUE_JSON: &str = r#"{"operation":"set","properties":[{"name":"example/href","value":"https://example.test/path"}]}"#;

    #[test]
    fn explicit_v3_factories_preserve_typed_commands_projection_history_and_restore() -> TestResult
    {
        let profile = profile()?;
        let descriptor = profile.descriptor();
        let set_state_index = assert_set_state_descriptor(&descriptor)?;
        let document = json!({
            "format": "breditor/document",
            "formatVersion": 2,
            "schema": {"name": descriptor.schema_name(), "version": descriptor.schema_version()},
            "schemaFingerprint": descriptor.schema_fingerprint(),
            "root": {
                "kind": "element", "type": "breditor/document",
                "entityId": null, "properties": {},
                "children": [{
                    "kind": "element", "type": "breditor/paragraph",
                    "entityId": null, "properties": {},
                    "children": [{"kind": "text", "text": "abc", "formats": []}]
                }]
            }
        })
        .to_string();
        let mut created =
            profile.create_engine_from_document_json_v3("wasm-v3-factory", &document, 10.0);
        assert_eq!(created.status(), "engine");
        let mut engine =
            created.take_engine().ok_or_else(|| io::Error::other("V3 engine was absent"))?;
        assert_eq!(engine.inner.session_checkpoint_format_version(), 3);

        select_all(&mut engine)?;
        let before = engine.observation();
        assert_unset_state(&mut engine, &before, set_state_index, "full")?;
        let committed = engine.execute_typed_intent_json(
            &before,
            "example/set-link-intent",
            LINK_STATE_VALUE_JSON,
            false,
        );
        assert_eq!(committed.status(), "committed");
        assert_eq!(json_version(&string(committed.commit_json())?)?, 3);
        assert_eq!(json_version(&string(engine.state_json())?)?, 3);

        let checkpoint = string(engine.session_checkpoint_json())?;
        assert_eq!(json_version(&checkpoint)?, 3);
        assert!(checkpoint.contains("https://example.test/path"));

        let after = engine.observation();
        assert_uniform_state(&mut engine, &after, set_state_index, "delta")?;
        assert_link_projection(&engine, &after)?;
        let undone = engine.undo(&after, false);
        assert_eq!(undone.status(), "committed");
        let redo_base =
            undone.observation().ok_or_else(|| io::Error::other("undo observation was absent"))?;
        assert_unset_state(&mut engine, &redo_base, set_state_index, "delta")?;
        let redone = engine.redo(&redo_base, false);
        assert_eq!(redone.status(), "committed");
        let redone_observation =
            redone.observation().ok_or_else(|| io::Error::other("redo observation was absent"))?;
        assert_uniform_state(&mut engine, &redone_observation, set_state_index, "delta")?;
        assert_link_projection(&engine, &redone_observation)?;

        let mut restored_result =
            profile.create_engine_from_session_checkpoint_json_v3(&checkpoint);
        assert_eq!(restored_result.status(), "engine");
        let mut restored = restored_result
            .take_engine()
            .ok_or_else(|| io::Error::other("restored V3 engine was absent"))?;
        assert_eq!(restored.inner.session_checkpoint_format_version(), 3);
        assert_eq!(string(restored.session_checkpoint_json())?, checkpoint);
        assert_link_projection(&restored, &restored.observation())?;
        assert_active_mixed_state(&mut restored, set_state_index)?;
        Ok(())
    }

    #[test]
    fn v3_restore_rejects_v2_without_fallback() -> TestResult {
        let profile = profile()?;
        let descriptor = profile.descriptor();
        let v2 = json!({
          "format":"breditor/session-checkpoint","formatVersion":2,
          "schema":{"name":descriptor.schema_name(),"version":descriptor.schema_version()},
          "schemaFingerprint":descriptor.schema_fingerprint(),
          "historyBase":{},"currentRevision":"0","historyCapacity":0,
          "cursor":0,"entries":[],"openMergeGroup":null
        })
        .to_string();
        let result = profile.create_engine_from_session_checkpoint_json_v3(&v2);
        assert_eq!(result.status(), "error");
        assert!(result.error().is_some());
        Ok(())
    }

    fn profile() -> TestResult<BreditorCompiledProfile> {
        let mut result = BreditorCompiledProfile::from_bootstrap_json_v2(PROFILE_JSON);
        assert_eq!(result.status(), "profile");
        result
            .take_profile()
            .ok_or_else(|| io::Error::other("compiled V2 profile was absent").into())
    }

    fn descriptor_index(
        count: u32,
        mut value_at: impl FnMut(u32) -> Option<String>,
        expected: &str,
    ) -> TestResult<u32> {
        (0..count)
            .find(|&index| value_at(index).as_deref() == Some(expected))
            .ok_or_else(|| io::Error::other(format!("descriptor omitted {expected}")).into())
    }

    fn assert_set_state_descriptor(
        descriptor: &crate::BreditorCompiledProfileDescriptor,
    ) -> TestResult<u32> {
        let intent = descriptor_index(
            descriptor.intent_count(),
            |index| descriptor.intent_id(index),
            "example/set-link-intent",
        )?;
        assert_eq!(
            descriptor.intent_value_contract_name(intent).as_deref(),
            Some("breditor/set-inline-format-input"),
        );
        assert_eq!(descriptor.intent_value_contract_version(intent), Some(1));
        let state = descriptor_index(
            descriptor.action_state_count(),
            |index| descriptor.action_state_id(index),
            "example/link-presence",
        )?;
        assert_eq!(
            descriptor.action_state_value_contract_name(state).as_deref(),
            Some("breditor/set-inline-format-input"),
        );
        assert_eq!(descriptor.action_state_value_contract_version(state), Some(1));
        Ok(state)
    }

    fn assert_unset_state(
        engine: &mut BreditorEngine,
        observation: &crate::BreditorObservation,
        index: u32,
        expected_read: &str,
    ) -> TestResult {
        let mut states = engine.action_states(observation);
        assert_eq!(states.status(), expected_read);
        let snapshot = states
            .take_snapshot()
            .ok_or_else(|| io::Error::other("unset action-state snapshot was absent"))?;
        assert_eq!(snapshot.entry_status(index).as_deref(), Some("blocked"));
        assert_eq!(
            snapshot.entry_reason_code(index).as_deref(),
            Some("breditor/inline-format-unchanged"),
        );
        assert_eq!(snapshot.entry_activation(index).as_deref(), Some("inactive"));
        assert_eq!(snapshot.entry_value_status(index).as_deref(), Some("unset"));
        assert_value_contract(&snapshot, index);
        assert_eq!(snapshot.entry_uniform_value_json(index).status(), "absent");
        Ok(())
    }

    fn assert_uniform_state(
        engine: &mut BreditorEngine,
        observation: &crate::BreditorObservation,
        index: u32,
        expected_read: &str,
    ) -> TestResult {
        let mut states = engine.action_states(observation);
        assert_eq!(states.status(), expected_read);
        let snapshot = states
            .take_snapshot()
            .ok_or_else(|| io::Error::other("uniform action-state snapshot was absent"))?;
        assert_eq!(snapshot.entry_status(index).as_deref(), Some("enabled"));
        assert_eq!(snapshot.entry_activation(index).as_deref(), Some("active"));
        assert_eq!(snapshot.entry_value_status(index).as_deref(), Some("uniform"));
        assert_value_contract(&snapshot, index);
        assert_eq!(string(snapshot.entry_uniform_value_json(index))?, LINK_STATE_VALUE_JSON);
        Ok(())
    }

    fn assert_value_contract(snapshot: &crate::BreditorActionStateSnapshot, index: u32) {
        assert_eq!(
            snapshot.entry_value_contract_name(index).as_deref(),
            Some("breditor/set-inline-format-input"),
        );
        assert_eq!(snapshot.entry_value_contract_version(index), Some(1));
    }

    fn assert_active_mixed_state(engine: &mut BreditorEngine, index: u32) -> TestResult {
        select_text_range(engine, 0, 1)?;
        let before = engine.observation();
        let set = engine.execute_typed_intent_json(
            &before,
            "example/set-link-intent",
            r#"{"operation":"set","properties":[{"name":"example/href","value":"https://different.example.test/"}]}"#,
            false,
        );
        assert_eq!(set.status(), "committed");
        select_split_text_all(engine)?;
        let observation = engine.observation();
        let mut states = engine.action_states(&observation);
        assert_eq!(states.status(), "full");
        let snapshot = states
            .take_snapshot()
            .ok_or_else(|| io::Error::other("mixed action-state snapshot was absent"))?;
        assert_eq!(snapshot.entry_status(index).as_deref(), Some("enabled"));
        assert_eq!(snapshot.entry_activation(index).as_deref(), Some("active"));
        assert_eq!(snapshot.entry_value_status(index).as_deref(), Some("mixed"));
        assert_value_contract(&snapshot, index);
        assert_eq!(snapshot.entry_uniform_value_json(index).status(), "absent");
        Ok(())
    }

    fn select_all(engine: &mut BreditorEngine) -> TestResult {
        select_text_range(engine, 0, 3)
    }

    fn select_text_range(
        engine: &mut BreditorEngine,
        start_utf16_offset: u32,
        end_utf16_offset: u32,
    ) -> TestResult {
        let path = NodePath::try_from_indices(vec![0, 0])?;
        let selection: Selection = RangeSelection::new(
            Point::Text {
                text_path: path.clone(),
                utf16_offset: start_utf16_offset,
                affinity: Affinity::Before,
            },
            Point::Text {
                text_path: path,
                utf16_offset: end_utf16_offset,
                affinity: Affinity::After,
            },
        )
        .into();
        let before = engine.observation();
        let event = engine.inner.set_selection(before.inner(), Some(selection))?;
        if event.is_none() {
            return Err(io::Error::other("selection did not change").into());
        }
        Ok(())
    }

    fn select_split_text_all(engine: &mut BreditorEngine) -> TestResult {
        let selection: Selection = RangeSelection::new(
            Point::Text {
                text_path: NodePath::try_from_indices(vec![0, 0])?,
                utf16_offset: 0,
                affinity: Affinity::Before,
            },
            Point::Text {
                text_path: NodePath::try_from_indices(vec![0, 1])?,
                utf16_offset: 2,
                affinity: Affinity::After,
            },
        )
        .into();
        let before = engine.observation();
        let event = engine.inner.set_selection(before.inner(), Some(selection))?;
        if event.is_none() {
            return Err(io::Error::other("split selection did not change").into());
        }
        Ok(())
    }

    fn assert_link_projection(
        engine: &BreditorEngine,
        expected: &crate::BreditorObservation,
    ) -> TestResult {
        let mut result = engine.projection(expected);
        let projection =
            result.take_projection().ok_or_else(|| io::Error::other("projection was absent"))?;
        assert_eq!(projection.format_count(2), Some(1));
        assert_eq!(projection.format_type(2, 0).as_deref(), Some("example/link"));
        assert_eq!(projection.format_property_count(2, 0), Some(1));
        assert_eq!(projection.format_property_name(2, 0, 0).as_deref(), Some("example/href"),);
        assert_eq!(projection.format_property_value_kind(2, 0, 0).as_deref(), Some("string"),);
        assert_eq!(
            projection.format_property_string(2, 0, 0).as_deref(),
            Some("https://example.test/path"),
        );
        assert_eq!(projection.format_property_boolean(2, 0, 0), None);
        assert_eq!(projection.format_property_integer(2, 0, 0), None);
        Ok(())
    }

    fn string(mut result: crate::BreditorStringResult) -> TestResult<String> {
        result.take_value().ok_or_else(|| io::Error::other("JSON value was absent").into())
    }

    fn json_version(value: &str) -> TestResult<u64> {
        let parsed: Value = serde_json::from_str(value)?;
        parsed["formatVersion"]
            .as_u64()
            .ok_or_else(|| io::Error::other("formatVersion was absent").into())
    }
}
