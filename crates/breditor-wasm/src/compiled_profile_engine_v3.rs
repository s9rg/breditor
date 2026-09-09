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

    #[test]
    fn explicit_v3_factories_preserve_typed_commands_projection_history_and_restore() -> TestResult
    {
        let profile = profile()?;
        let descriptor = profile.descriptor();
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
        let committed = engine.execute_typed_intent_json(
            &before,
            "example/set-link-intent",
            r#"{"operation":"set","properties":[{"name":"example/href","value":"https://example.test/path"}]}"#,
            false,
        );
        assert_eq!(committed.status(), "committed");
        assert_eq!(json_version(&string(committed.commit_json())?)?, 3);
        assert_eq!(json_version(&string(engine.state_json())?)?, 3);

        let checkpoint = string(engine.session_checkpoint_json())?;
        assert_eq!(json_version(&checkpoint)?, 3);
        assert!(checkpoint.contains("https://example.test/path"));

        let after = engine.observation();
        assert_link_projection(&engine, &after)?;
        let undone = engine.undo(&after, false);
        assert_eq!(undone.status(), "committed");
        let redo_base =
            undone.observation().ok_or_else(|| io::Error::other("undo observation was absent"))?;
        let redone = engine.redo(&redo_base, false);
        assert_eq!(redone.status(), "committed");
        let redone_observation =
            redone.observation().ok_or_else(|| io::Error::other("redo observation was absent"))?;
        assert_link_projection(&engine, &redone_observation)?;

        let mut restored_result =
            profile.create_engine_from_session_checkpoint_json_v3(&checkpoint);
        assert_eq!(restored_result.status(), "engine");
        let restored = restored_result
            .take_engine()
            .ok_or_else(|| io::Error::other("restored V3 engine was absent"))?;
        assert_eq!(restored.inner.session_checkpoint_format_version(), 3);
        assert_eq!(string(restored.session_checkpoint_json())?, checkpoint);
        assert_link_projection(&restored, &restored.observation())?;
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

    fn select_all(engine: &mut BreditorEngine) -> TestResult {
        let path = NodePath::try_from_indices(vec![0, 0])?;
        let selection: Selection = RangeSelection::new(
            Point::Text { text_path: path.clone(), utf16_offset: 0, affinity: Affinity::Before },
            Point::Text { text_path: path, utf16_offset: 3, affinity: Affinity::After },
        )
        .into();
        let before = engine.observation();
        let event = engine.inner.set_selection(before.inner(), Some(selection))?;
        if event.is_none() {
            return Err(io::Error::other("selection did not change").into());
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
