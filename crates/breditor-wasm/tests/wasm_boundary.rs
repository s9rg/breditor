//! Black-box native and Wasm smoke contracts for the narrow boundary.

use std::{error::Error, io};

use breditor_core::{
    codec::{DocumentJsonCodec, EditorStateJsonCodec, SessionCheckpointJsonCodec},
    position::{Affinity, NodePath, Point},
    selection::{RangeSelection, Selection},
    session::EditorSession,
    state::{EditorContext, EditorState, LineageId},
};
use breditor_wasm::{
    BreditorActionStateSnapshot, BreditorActionStatesResult, BreditorCommandResult,
    BreditorCompiledProfile, BreditorCompiledProfileDescriptor, BreditorEngine,
    BreditorEngineResult, BreditorObservation, BreditorProjection, BreditorProjectionResult,
    BreditorStringResult, breditor_version, breditor_wasm_abi_version,
};
#[cfg(target_arch = "wasm32")]
use breditor_wasm::{BreditorSelection, BreditorSelectionResult};
use serde_json::Value;
#[cfg(target_arch = "wasm32")]
use wasm_bindgen::prelude::{JsValue, wasm_bindgen};
#[cfg(target_arch = "wasm32")]
use wasm_bindgen_test::wasm_bindgen_test;

type TestResult<T = ()> = Result<T, Box<dyn Error>>;

const EMPTY_DOCUMENT_JSON: &str = r#"{
  "format":"breditor/document","formatVersion":1,
  "schema":{"name":"breditor/base","version":1},
  "root":{"kind":"element","type":"breditor/document","entityId":null,"properties":{},
    "children":[{"kind":"element","type":"breditor/paragraph","entityId":null,
      "properties":{},"children":[]}]}
}"#;

const TEXT_DOCUMENT_JSON: &str = r#"{
  "format":"breditor/document","formatVersion":1,
  "schema":{"name":"breditor/base","version":1},
  "root":{"kind":"element","type":"breditor/document","entityId":null,"properties":{},
    "children":[{"kind":"element","type":"breditor/paragraph","entityId":null,
      "properties":{},"children":[{"kind":"text","text":"a","formats":[]}]}]}
}"#;

const STRONG_TEXT_DOCUMENT_JSON: &str = r#"{
  "format":"breditor/document","formatVersion":1,
  "schema":{"name":"breditor/base","version":1},
  "root":{"kind":"element","type":"breditor/document","entityId":null,"properties":{},
    "children":[{"kind":"element","type":"breditor/paragraph","entityId":null,
      "properties":{},"children":[{"kind":"text","text":"a","formats":[
        {"type":"breditor/strong","properties":{}}
      ]}]}]}
}"#;

const PROFILE_BOOTSTRAP_JSON: &str = r#"{
  "format":"breditor/profile-bootstrap","formatVersion":1,
  "schema":{"name":"example/editor","version":1},
  "extensions":[{
    "id":{"name":"example/highlight-extension","version":1},
    "dependencies":[],"conflicts":[],
    "inlineFormats":[{"kind":"example/highlight","revision":7}],
    "inlineFormatToggles":[{
      "formatKind":"example/highlight",
      "actionId":"example/toggle-highlight",
      "intentId":"example/toggle-highlight-intent",
      "bindingId":"example/toggle-highlight-binding",
      "actionStateId":"example/highlight-control"
    }]
  }]
}"#;

const PROFILE_INTENT: &str = "example/toggle-highlight-intent";
const BASE_CLEAR_INLINE_FORMATTING_INTENT: &str = "breditor/clear-inline-formatting";
const BASE_FORMAT_STRONG_INTENT: &str = "breditor/format-strong";

const PROJECTION_DOCUMENT_JSON: &str = r#"{
  "format":"breditor/document","formatVersion":1,
  "schema":{"name":"breditor/base","version":1},
  "root":{"kind":"element","type":"breditor/document","entityId":null,"properties":{},
    "children":[
      {"kind":"element","type":"breditor/paragraph","entityId":null,
        "properties":{},"children":[]},
      {"kind":"element","type":"breditor/paragraph","entityId":null,
        "properties":{},"children":[{"kind":"text",
          "text":"<img src=x onerror=alert(1)>&\"\n💣",
          "formats":[{"type":"breditor/strong","properties":{}}]}]}
    ]}
}"#;

#[cfg(target_arch = "wasm32")]
const EMOJI_DOCUMENT_JSON: &str = r#"{
  "format":"breditor/document","formatVersion":1,
  "schema":{"name":"breditor/base","version":1},
  "root":{"kind":"element","type":"breditor/document","entityId":null,"properties":{},
    "children":[{"kind":"element","type":"breditor/paragraph","entityId":null,
      "properties":{},"children":[{"kind":"text","text":"a😀b","formats":[]}]}]}
}"#;

#[cfg(target_arch = "wasm32")]
#[wasm_bindgen(inline_js = r#"
export function breditorBoxedNumber(value) { return new Number(value); }
export function breditorNumberLike(value) { return { valueOf() { return value; } }; }
export function breditorBoxedString(value) { return new String(value); }
export function breditorStringLike(value) { return { toString() { return value; } }; }
"#)]
extern "C" {
    #[wasm_bindgen(js_name = breditorBoxedNumber)]
    fn boxed_number(value: f64) -> JsValue;
    #[wasm_bindgen(js_name = breditorNumberLike)]
    fn number_like(value: f64) -> JsValue;
    #[wasm_bindgen(js_name = breditorBoxedString)]
    fn boxed_string(value: &str) -> JsValue;
    #[wasm_bindgen(js_name = breditorStringLike)]
    fn string_like(value: &str) -> JsValue;
}

#[cfg_attr(target_arch = "wasm32", wasm_bindgen_test)]
#[cfg_attr(not(target_arch = "wasm32"), test)]
fn factory_observation_and_json_reads_are_structured() -> TestResult {
    assert_eq!(breditor_wasm_abi_version(), "5");
    assert_eq!(breditor_version(), env!("CARGO_PKG_VERSION"));
    let mut result = BreditorEngine::from_document_json("wasm-factory", EMPTY_DOCUMENT_JSON, 100.0);
    assert_eq!(result.status(), "engine");
    assert!(result.error().is_none());
    let engine = require_engine(&mut result)?;
    assert_eq!(result.status(), "taken");
    assert!(result.take_engine().is_none());

    let observation = engine.observation();
    assert_eq!(observation.snapshot_lineage(), "wasm-factory");
    assert_eq!(observation.snapshot_revision(), "0");
    assert_eq!(observation.history_capacity(), 100);
    assert_eq!(observation.undo_depth(), 0);
    assert_eq!(observation.redo_depth(), 0);
    assert!(!observation.can_undo());
    assert!(!observation.can_redo());

    let mut state = engine.state_json();
    assert_eq!(state.status(), "value");
    let state_json = state.take_value().ok_or_else(|| test_error("state JSON was absent"))?;
    assert_eq!(state.status(), "taken");
    assert!(state_json.contains("\"format\":\"breditor/editor-state\""));

    let mut document = engine.document_json(&observation);
    assert_eq!(document.status(), "value");
    assert!(document.error().is_none());
    let document_copy =
        document.value().ok_or_else(|| test_error("document JSON copy was absent"))?;
    let document_json =
        document.take_value().ok_or_else(|| test_error("document JSON was absent"))?;
    assert_eq!(document_json, document_copy);
    assert_eq!(document.status(), "taken");
    assert!(document.value().is_none());
    assert!(document.take_value().is_none());
    assert!(document.error().is_none());
    assert!(document_json.contains("\"format\":\"breditor/document\""));

    let mut checkpoint = engine.session_checkpoint_json();
    assert_eq!(checkpoint.status(), "value");
    let checkpoint_json =
        checkpoint.take_value().ok_or_else(|| test_error("checkpoint JSON was absent"))?;
    assert!(checkpoint_json.contains("\"format\":\"breditor/session-checkpoint\""));
    Ok(())
}

#[cfg_attr(target_arch = "wasm32", wasm_bindgen_test)]
#[cfg_attr(not(target_arch = "wasm32"), test)]
#[allow(clippy::too_many_lines)]
fn compiled_profiles_are_owned_complete_correlated_and_v2_only() -> TestResult {
    let mut profile_result = BreditorCompiledProfile::from_bootstrap_json(PROFILE_BOOTSTRAP_JSON);
    assert_eq!(profile_result.status(), "profile");
    assert!(profile_result.error().is_none());
    let profile =
        profile_result.take_profile().ok_or_else(|| test_error("compiled profile was absent"))?;
    assert_eq!(profile_result.status(), "taken");
    assert!(profile_result.take_profile().is_none());

    let generation = profile.generation();
    let generation_copy = profile.generation();
    assert!(generation.matches(&generation_copy));
    assert!(profile.matches_profile_generation(&generation));

    let descriptor = profile.descriptor();
    assert!(descriptor.matches_profile_generation(&generation));
    assert_eq!(descriptor.schema_name(), "example/editor");
    assert_eq!(descriptor.schema_version(), 1);
    assert!(descriptor.schema_fingerprint().starts_with("sha256:"));
    assert_eq!(descriptor.schema_fingerprint().len(), 71);
    assert_eq!(descriptor.format_count(), 2);
    assert_eq!(descriptor.format_kind(0).as_deref(), Some("breditor/strong"));
    assert_eq!(descriptor.format_revision(0), Some(1));
    assert_eq!(descriptor.format_kind(1).as_deref(), Some("example/highlight"));
    assert_eq!(descriptor.format_revision(1), Some(7));
    assert_eq!(descriptor.format_kind(2), None);
    assert_eq!(descriptor.format_revision(2), None);
    assert_eq!(descriptor.inline_format_set_count(), 0);
    assert_eq!(descriptor.inline_format_set_format_kind(0), None);
    assert_eq!(descriptor.inline_format_set_intent_id(0), None);
    assert_eq!(descriptor.inline_format_set_action_state_id(0), None);

    assert_eq!(descriptor.intent_count(), 3);
    assert_eq!(descriptor.intent_id(0).as_deref(), Some(BASE_CLEAR_INLINE_FORMATTING_INTENT),);
    assert_eq!(descriptor.intent_input_kind(0).as_deref(), Some("none"));
    assert_eq!(descriptor.intent_input_contract_name(0), None);
    assert_eq!(descriptor.intent_input_contract_version(0), None);
    assert_eq!(descriptor.intent_activation_contract(0).as_deref(), Some("stateless"));
    assert_eq!(descriptor.intent_value_contract_name(0), None);
    assert_eq!(descriptor.intent_value_contract_version(0), None);
    assert_eq!(descriptor.intent_id(1).as_deref(), Some(BASE_FORMAT_STRONG_INTENT));
    assert_eq!(descriptor.intent_input_kind(1).as_deref(), Some("none"));
    assert_eq!(descriptor.intent_input_contract_name(1), None);
    assert_eq!(descriptor.intent_input_contract_version(1), None);
    assert_eq!(descriptor.intent_activation_contract(1).as_deref(), Some("tracked"));
    assert_eq!(descriptor.intent_value_contract_name(1), None);
    assert_eq!(descriptor.intent_value_contract_version(1), None);
    assert_eq!(descriptor.intent_id(2).as_deref(), Some(PROFILE_INTENT));
    assert_eq!(descriptor.intent_input_kind(2).as_deref(), Some("none"));
    assert_eq!(descriptor.intent_input_contract_name(2), None);
    assert_eq!(descriptor.intent_input_contract_version(2), None);
    assert_eq!(descriptor.intent_activation_contract(2).as_deref(), Some("tracked"));
    assert_eq!(descriptor.intent_value_contract_name(2), None);
    assert_eq!(descriptor.intent_value_contract_version(2), None);
    assert_eq!(descriptor.intent_id(3), None);

    assert_eq!(descriptor.action_state_count(), 5);
    assert_eq!(descriptor.action_state_id(0).as_deref(), Some("breditor/control-bold"));
    assert_eq!(descriptor.action_state_source_kind(0).as_deref(), Some("routed"));
    assert_eq!(descriptor.action_state_source_action_id(0), None);
    assert_eq!(
        descriptor.action_state_source_intent_id(0).as_deref(),
        Some(BASE_FORMAT_STRONG_INTENT),
    );
    assert_eq!(descriptor.action_state_history_direction(0), None);
    assert_eq!(descriptor.action_state_activation_contract(0).as_deref(), Some("tracked"));
    assert_eq!(
        descriptor.action_state_id(1).as_deref(),
        Some("breditor/control-clear-inline-formatting"),
    );
    assert_eq!(descriptor.action_state_source_kind(1).as_deref(), Some("routed"));
    assert_eq!(descriptor.action_state_source_action_id(1), None);
    assert_eq!(
        descriptor.action_state_source_intent_id(1).as_deref(),
        Some(BASE_CLEAR_INLINE_FORMATTING_INTENT),
    );
    assert_eq!(descriptor.action_state_history_direction(1), None);
    assert_eq!(descriptor.action_state_activation_contract(1).as_deref(), Some("stateless"));
    assert_eq!(descriptor.action_state_id(4).as_deref(), Some("example/highlight-control"));
    assert_eq!(descriptor.action_state_source_kind(4).as_deref(), Some("routed"));
    assert_eq!(descriptor.action_state_source_action_id(4), None);
    assert_eq!(descriptor.action_state_source_intent_id(4).as_deref(), Some(PROFILE_INTENT));
    assert_eq!(descriptor.action_state_history_direction(4), None);
    assert_eq!(descriptor.action_state_activation_contract(4).as_deref(), Some("tracked"));
    assert_eq!(descriptor.action_state_value_contract_name(4), None);
    assert_eq!(descriptor.action_state_value_contract_version(4), None);
    assert_eq!(descriptor.action_state_source_kind(5), None);

    let v2_document = profile_document_v2(&descriptor, "abc");
    let mut rejected =
        profile.create_engine_from_document_json("profile-v2-reject", TEXT_DOCUMENT_JSON, 100.0);
    assert_eq!(rejected.status(), "error");
    assert!(rejected.take_engine().is_none());
    assert!(rejected.error().is_some());

    let mut engine_result =
        profile.create_engine_from_document_json("profile-v2", &v2_document, 100.0);
    let mut engine = require_engine(&mut engine_result)?;
    assert!(engine.matches_profile_generation(&generation));
    assert!(engine.profile_generation().matches(&generation));
    assert!(engine.profile_descriptor().matches_profile_generation(&generation));

    let observation = engine.observation();
    assert!(observation.matches_profile_generation(&generation));
    let state: Value = serde_json::from_str(&require_string(engine.state_json())?)?;
    assert_eq!(state["formatVersion"], 2);
    assert_eq!(state["schemaFingerprint"], descriptor.schema_fingerprint());
    let document: Value =
        serde_json::from_str(&require_string(engine.document_json(&observation))?)?;
    assert_eq!(document["formatVersion"], 2);
    assert_eq!(document["schemaFingerprint"], descriptor.schema_fingerprint());
    let checkpoint = require_string(engine.session_checkpoint_json())?;
    let checkpoint_record: Value = serde_json::from_str(&checkpoint)?;
    assert_eq!(checkpoint_record["formatVersion"], 2);
    assert_eq!(checkpoint_record["schemaFingerprint"], descriptor.schema_fingerprint());

    let mut projection_result = engine.projection(&observation);
    assert!(projection_result.matches_profile_generation(&generation));
    let projection = require_projection(&mut projection_result)?;
    assert!(projection.matches_profile_generation(&generation));
    assert_eq!(projection.schema_fingerprint(), descriptor.schema_fingerprint());

    let mut selection_result = engine.selection(&observation);
    assert!(selection_result.matches_profile_generation(&generation));
    let selection = selection_result
        .take_selection()
        .ok_or_else(|| test_error("profile selection was absent"))?;
    assert!(selection.matches_profile_generation(&generation));
    assert_eq!(selection.kind(), "none");

    let mut states_result = engine.action_states(&observation);
    assert!(states_result.matches_profile_generation(&generation));
    let states = require_action_state_snapshot(&mut states_result)?;
    assert!(states.matches_profile_generation(&generation));
    assert_eq!(states.entry_count(), 5);
    assert_eq!(states.entry_id(4).as_deref(), Some("example/highlight-control"));

    let unchanged = engine.clear_selection(&observation);
    assert_eq!(unchanged.status(), "unchanged");
    assert!(unchanged.matches_profile_generation(&generation));

    let blocked = engine.execute_no_input_intent(&observation, PROFILE_INTENT, false);
    assert_eq!(blocked.status(), "blocked");
    assert!(blocked.matches_profile_generation(&generation));
    assert_eq!(blocked.intent_id().as_deref(), Some(PROFILE_INTENT));
    assert_eq!(blocked.binding_id().as_deref(), Some("example/toggle-highlight-binding"));
    assert_eq!(blocked.action_id().as_deref(), Some("example/toggle-highlight"));
    assert_eq!(blocked.binding_priority(), Some(0));
    assert_eq!(blocked.blocked_reason_code().as_deref(), Some("breditor/no-selection"));
    assert_eq!(blocked.blocked_reason_detail_json().status(), "absent");
    assert_eq!(blocked.blocked_activation().as_deref(), Some("inactive"));
    assert_eq!(blocked.blocked_value_status().as_deref(), Some("unsupported"));
    assert_eq!(blocked.blocked_value_contract_name(), None);
    assert_eq!(blocked.blocked_value_contract_version(), None);
    assert_eq!(blocked.blocked_value_json().status(), "absent");
    assert_eq!(blocked.fallthrough_count(), 0);
    assert_eq!(blocked.fallthrough_binding_id(0), None);
    assert_eq!(blocked.commit_json().status(), "absent");
    assert!(blocked.projection_update().is_none());
    assert!(blocked.error().is_none());
    let blocked_observation = blocked
        .observation()
        .ok_or_else(|| test_error("blocked intent omitted its observation"))?;
    assert_eq!(blocked_observation.snapshot_revision(), observation.snapshot_revision());
    assert!(blocked_observation.matches_profile_generation(&generation));

    let invalid = engine.execute_no_input_intent(&observation, "", false);
    assert_eq!(invalid.status(), "error");
    assert!(invalid.matches_profile_generation(&generation));
    assert_eq!(
        invalid.error().map(|error| error.code()).as_deref(),
        Some("breditor_wasm.invalid_intent_id")
    );
    let unknown = engine.execute_no_input_intent(&observation, "example/unknown", false);
    assert_eq!(unknown.status(), "error");
    assert_eq!(
        unknown.error().map(|error| error.code()).as_deref(),
        Some("editor_engine.intent_routing")
    );

    let mut restored_result = profile.create_engine_from_session_checkpoint_json(&checkpoint);
    let restored = require_engine(&mut restored_result)?;
    assert!(restored.matches_profile_generation(&generation));
    let mut cross_engine = restored.document_json(&observation);
    assert_string_error(&mut cross_engine, "editor_engine.stale_engine", "abc")?;

    let mut independent_result =
        BreditorCompiledProfile::from_bootstrap_json(PROFILE_BOOTSTRAP_JSON);
    let independent = independent_result
        .take_profile()
        .ok_or_else(|| test_error("independent profile was absent"))?;
    let independent_generation = independent.generation();
    assert!(!independent_generation.matches(&generation));
    assert!(!profile.matches_profile_generation(&independent_generation));
    let mut independent_engine_result =
        independent.create_engine_from_session_checkpoint_json(&checkpoint);
    let independent_engine = require_engine(&mut independent_engine_result)?;
    let mut foreign_generation = independent_engine.document_json(&observation);
    assert_string_error(
        &mut foreign_generation,
        "editor_engine.profile_generation_mismatch",
        "abc",
    )?;
    Ok(())
}

#[cfg_attr(target_arch = "wasm32", wasm_bindgen_test)]
#[cfg_attr(not(target_arch = "wasm32"), test)]
fn profile_intents_publish_v2_with_owned_provenance_and_successor_state() -> TestResult {
    let mut profile_result = BreditorCompiledProfile::from_bootstrap_json(PROFILE_BOOTSTRAP_JSON);
    let profile =
        profile_result.take_profile().ok_or_else(|| test_error("compiled profile was absent"))?;
    let generation = profile.generation();
    let descriptor = profile.descriptor();
    let checkpoint = profile_checkpoint_v2(&descriptor, "profile-intent-commit", "abc")?;
    let mut engine_result = profile.create_engine_from_session_checkpoint_json(&checkpoint);
    let mut engine = require_engine(&mut engine_result)?;
    let initial = engine.observation();

    let intent = engine.execute_no_input_intent(&initial, PROFILE_INTENT, false);
    assert_eq!(intent.status(), "committed");
    assert!(intent.matches_profile_generation(&generation));
    assert_eq!(intent.intent_id().as_deref(), Some(PROFILE_INTENT));
    assert_eq!(intent.binding_id().as_deref(), Some("example/toggle-highlight-binding"));
    assert_eq!(intent.action_id().as_deref(), Some("example/toggle-highlight"));
    assert_eq!(intent.binding_priority(), Some(0));
    assert_eq!(intent.blocked_reason_code(), None);
    assert_eq!(intent.blocked_activation(), None);
    assert_eq!(intent.fallthrough_count(), 0);
    assert!(intent.error().is_none());

    let commit_json = require_string(intent.commit_json())?;
    let commit: Value = serde_json::from_str(&commit_json)?;
    assert_eq!(commit["formatVersion"], 2);
    assert_eq!(commit["schemaFingerprint"], descriptor.schema_fingerprint());

    let mut update = intent
        .projection_update()
        .ok_or_else(|| test_error("committed intent omitted projection update"))?;
    assert!(update.matches_profile_generation(&generation));
    assert_eq!(update.base_revision(), "0");
    assert_eq!(update.result_revision(), "1");
    let final_projection = update
        .take_projection()
        .ok_or_else(|| test_error("intent projection update omitted projection"))?;
    assert!(final_projection.matches_profile_generation(&generation));

    let successor = intent
        .observation()
        .ok_or_else(|| test_error("committed intent omitted successor observation"))?;
    assert!(successor.matches_profile_generation(&generation));
    assert_eq!(successor.snapshot_revision(), "1");
    let document: Value = serde_json::from_str(&require_string(engine.document_json(&successor))?)?;
    assert_eq!(document["formatVersion"], 2);
    assert_eq!(
        document["root"]["children"][0]["children"][0]["formats"][0]["type"],
        "example/highlight"
    );

    let mut states_result = engine.action_states(&successor);
    let states = require_action_state_snapshot(&mut states_result)?;
    assert!(states.matches_profile_generation(&generation));
    assert_eq!(states.entry_id(4).as_deref(), Some("example/highlight-control"));
    assert_eq!(states.entry_status(4).as_deref(), Some("enabled"));
    assert_eq!(states.entry_activation(4).as_deref(), Some("active"));

    let checkpoint_after = require_string(engine.session_checkpoint_json())?;
    assert_eq!(serde_json::from_str::<Value>(&checkpoint_after)?["formatVersion"], 2);
    let mut restored_result = profile.create_engine_from_session_checkpoint_json(&checkpoint_after);
    let restored = require_engine(&mut restored_result)?;
    let restored_observation = restored.observation();
    assert!(restored_observation.matches_profile_generation(&generation));
    assert_eq!(restored_observation.snapshot_revision(), "1");
    Ok(())
}

#[cfg_attr(target_arch = "wasm32", wasm_bindgen_test)]
#[cfg_attr(not(target_arch = "wasm32"), test)]
fn semantic_projection_is_deterministic_non_json_and_lifecycle_guarded() -> TestResult {
    const HOSTILE_TEXT: &str = "<img src=x onerror=alert(1)>&\"\n💣";
    let mut result =
        BreditorEngine::from_document_json("wasm-projection", PROJECTION_DOCUMENT_JSON, 100.0);
    let engine = require_engine(&mut result)?;
    let observation = engine.observation();
    let mut projected = engine.projection(&observation);

    assert_eq!(projected.status(), "projection");
    assert!(projected.error().is_none());
    let projection = require_projection(&mut projected)?;
    assert_eq!(projected.status(), "taken");
    assert!(projected.take_projection().is_none());

    assert_eq!(projection.schema_name(), "breditor/base");
    assert_eq!(projection.schema_version(), 1);
    assert_eq!(projection.snapshot_lineage(), "wasm-projection");
    assert_eq!(projection.snapshot_revision(), "0");
    assert_eq!(projection.root_index(), 0);
    assert_eq!(projection.node_count(), 4);

    assert_eq!(projection.node_kind(0).as_deref(), Some("element"));
    assert_eq!(projection.element_type(0).as_deref(), Some("breditor/document"));
    assert_eq!(projection.child_count(0), Some(2));
    assert_eq!(projection.child_at(0, 0), Some(1));
    assert_eq!(projection.child_at(0, 1), Some(2));
    assert_eq!(projection.element_type(1).as_deref(), Some("breditor/paragraph"));
    assert_eq!(projection.child_count(1), Some(0));
    assert_eq!(projection.element_type(2).as_deref(), Some("breditor/paragraph"));
    assert_eq!(projection.child_at(2, 0), Some(3));
    assert_eq!(projection.node_kind(3).as_deref(), Some("text"));
    assert_eq!(projection.text(3).as_deref(), Some(HOSTILE_TEXT));
    assert_eq!(projection.format_count(3), Some(1));
    assert_eq!(projection.format_type(3, 0).as_deref(), Some("breditor/strong"));
    assert_eq!(projection.child_count(3), None);
    assert_eq!(projection.element_type(3), None);
    assert_eq!(projection.node_kind(99), None);
    assert_eq!(projection.text(99), None);
    Ok(())
}

#[cfg_attr(target_arch = "wasm32", wasm_bindgen_test)]
#[cfg_attr(not(target_arch = "wasm32"), test)]
fn action_states_are_complete_non_json_canonical_and_lifecycle_guarded() -> TestResult {
    let checkpoint = selected_checkpoint("wasm-action-states")?;
    let mut result = BreditorEngine::from_session_checkpoint_json(&checkpoint);
    let mut engine = require_engine(&mut result)?;
    let initial = engine.observation();

    let mut full = engine.action_states(&initial);
    assert_eq!(full.status(), "full");
    assert!(full.error().is_none());
    let snapshot = require_action_state_snapshot(&mut full)?;
    assert_eq!(full.status(), "taken");
    assert!(full.take_snapshot().is_none());

    assert_eq!(snapshot.snapshot_lineage(), "wasm-action-states");
    assert_eq!(snapshot.snapshot_revision(), "0");
    assert_eq!(snapshot.entry_count(), 4);
    assert_eq!(snapshot.entry_id(0).as_deref(), Some("breditor/control-bold"));
    assert_eq!(snapshot.entry_id(1).as_deref(), Some("breditor/control-clear-inline-formatting"),);
    assert_eq!(snapshot.entry_id(2).as_deref(), Some("breditor/control-redo"));
    assert_eq!(snapshot.entry_id(3).as_deref(), Some("breditor/control-undo"));
    assert_eq!(snapshot.entry_id(4), None);

    assert_eq!(snapshot.entry_status(0).as_deref(), Some("enabled"));
    assert_eq!(snapshot.entry_activation(0).as_deref(), Some("inactive"));
    assert_eq!(snapshot.entry_reason_code(0), None);
    assert_eq!(snapshot.entry_value_status(0).as_deref(), Some("unsupported"));
    assert_eq!(snapshot.entry_value_contract_name(0), None);
    assert_eq!(snapshot.entry_value_contract_version(0), None);
    assert_eq!(snapshot.entry_uniform_value_json(0).status(), "absent");

    assert_eq!(snapshot.entry_status(1).as_deref(), Some("blocked"));
    assert_eq!(snapshot.entry_activation(1).as_deref(), Some("stateless"));
    assert_eq!(snapshot.entry_value_status(1).as_deref(), Some("unsupported"));
    for index in [2, 3] {
        assert_eq!(snapshot.entry_status(index).as_deref(), Some("disabled"));
        assert_eq!(snapshot.entry_activation(index).as_deref(), Some("stateless"));
        assert_eq!(snapshot.entry_value_status(index).as_deref(), Some("unsupported"));
    }
    assert_eq!(snapshot.entry_reason_code(1).as_deref(), Some("breditor/inline-format-unchanged"),);
    assert_eq!(snapshot.entry_reason_code(2).as_deref(), Some("breditor/nothing-to-redo"));
    assert_eq!(snapshot.entry_reason_code(3).as_deref(), Some("breditor/nothing-to-undo"));
    assert_eq!(snapshot.entry_status(4), None);
    assert_eq!(snapshot.entry_activation(4), None);
    assert_eq!(snapshot.entry_value_status(4), None);
    assert_eq!(snapshot.entry_uniform_value_json(4).status(), "absent");

    assert_eq!(snapshot.changed_count(), snapshot.entry_count());
    for index in 0..snapshot.entry_count() {
        assert_eq!(snapshot.changed_id(index), snapshot.entry_id(index));
    }
    assert_eq!(snapshot.changed_id(4), None);

    let mut unchanged = engine.action_states(&initial);
    assert_eq!(unchanged.status(), "unchanged");
    let unchanged_snapshot = require_action_state_snapshot(&mut unchanged)?;
    assert_eq!(unchanged_snapshot.entry_count(), 4);
    assert_eq!(unchanged_snapshot.changed_count(), 0);
    assert_eq!(unchanged_snapshot.changed_id(0), None);
    Ok(())
}

#[cfg_attr(target_arch = "wasm32", wasm_bindgen_test)]
#[cfg_attr(not(target_arch = "wasm32"), test)]
fn action_state_refresh_is_guarded_and_deltas_follow_state_and_history() -> TestResult {
    let checkpoint = selected_checkpoint("wasm-action-state-delta")?;
    let mut result = BreditorEngine::from_session_checkpoint_json(&checkpoint);
    let mut engine = require_engine(&mut result)?;
    let initial = engine.observation();
    let mut baseline = engine.action_states(&initial);
    let baseline_snapshot = require_action_state_snapshot(&mut baseline)?;
    assert_eq!(baseline_snapshot.entry_activation(0).as_deref(), Some("inactive"));

    let toggled = engine.execute_no_input_action(&initial, "breditor/toggle-strong", false);
    assert_eq!(toggled.status(), "committed");
    let after_toggle = require_observation(&toggled)?;

    let mut stale = engine.action_states(&initial);
    assert_eq!(stale.status(), "error");
    assert!(stale.take_snapshot().is_none());
    let stale_error = stale.error().ok_or_else(|| test_error("stale state read omitted error"))?;
    assert_eq!(stale_error.code(), "editor_engine.stale_snapshot");

    let mut delta = engine.action_states(&after_toggle);
    assert_eq!(delta.status(), "delta");
    let delta_snapshot = require_action_state_snapshot(&mut delta)?;
    assert_eq!(delta_snapshot.snapshot_revision(), "1");
    assert_eq!(delta_snapshot.entry_activation(0).as_deref(), Some("active"));
    assert_eq!(delta_snapshot.entry_status(2).as_deref(), Some("disabled"));
    assert_eq!(
        changed_ids(&delta_snapshot),
        ["breditor/control-bold".to_owned(), "breditor/control-clear-inline-formatting".to_owned(),]
    );

    let inserted = engine.execute_string_action(&after_toggle, "breditor/insert-text", "x", false);
    assert_eq!(inserted.status(), "committed");
    let after_insert = require_observation(&inserted)?;
    let mut history_delta = engine.action_states(&after_insert);
    assert_eq!(history_delta.status(), "delta");
    let history_snapshot = require_action_state_snapshot(&mut history_delta)?;
    assert_eq!(history_snapshot.entry_status(3).as_deref(), Some("enabled"));
    assert_eq!(changed_ids(&history_snapshot), ["breditor/control-undo".to_owned()]);

    let undone = engine.undo(&after_insert, false);
    assert_eq!(undone.status(), "committed");
    let after_undo = require_observation(&undone)?;
    let mut replay_delta = engine.action_states(&after_undo);
    assert_eq!(replay_delta.status(), "delta");
    let replay_snapshot = require_action_state_snapshot(&mut replay_delta)?;
    assert_eq!(replay_snapshot.entry_activation(0).as_deref(), Some("active"));
    assert_eq!(replay_snapshot.entry_status(2).as_deref(), Some("enabled"));
    assert_eq!(replay_snapshot.entry_status(3).as_deref(), Some("disabled"));
    assert_eq!(
        changed_ids(&replay_snapshot),
        ["breditor/control-redo".to_owned(), "breditor/control-undo".to_owned(),]
    );
    Ok(())
}

#[cfg_attr(target_arch = "wasm32", wasm_bindgen_test)]
#[cfg_attr(not(target_arch = "wasm32"), test)]
fn projection_reads_reject_stale_observations_without_disclosing_content() -> TestResult {
    let checkpoint = selected_checkpoint("wasm-projection-stale")?;
    let mut result = BreditorEngine::from_session_checkpoint_json(&checkpoint);
    let mut engine = require_engine(&mut result)?;
    let stale_observation = engine.observation();
    let committed =
        engine.execute_string_action(&stale_observation, "breditor/insert-text", "private", false);
    assert_eq!(committed.status(), "committed");

    let stale = engine.projection(&stale_observation);
    assert_eq!(stale.status(), "error");
    assert!(stale.error().is_some_and(|error| {
        error.code() == "editor_engine.stale_snapshot" && !error.message().contains("private")
    }));
    let mut stale = stale;
    assert!(stale.take_projection().is_none());
    assert_eq!(engine.observation().snapshot_revision(), "1");
    Ok(())
}

#[cfg_attr(target_arch = "wasm32", wasm_bindgen_test)]
#[cfg_attr(not(target_arch = "wasm32"), test)]
fn document_json_is_lossless_canonical_and_tracks_content_replay_not_selection() -> TestResult {
    const UNICODE_INSERTION: &str = " é🦀中文";
    const HOSTILE_RICH_TEXT: &str = "<img src=x onerror=alert(1)>&\"\n💣";

    let mut rich_result = BreditorEngine::from_document_json(
        "wasm-document-json-rich",
        PROJECTION_DOCUMENT_JSON,
        0.0,
    );
    let rich_engine = require_engine(&mut rich_result)?;
    let rich_observation = rich_engine.observation();
    let rich_document = require_string(rich_engine.document_json(&rich_observation))?;
    assert_document_json_is_canonical(&rich_document)?;
    let rich_record: Value = serde_json::from_str(&rich_document)?;
    let rich_run = &rich_record["root"]["children"][1]["children"][0];
    assert_eq!(rich_run["text"], HOSTILE_RICH_TEXT);
    assert_eq!(rich_run["formats"][0]["type"], "breditor/strong");

    let checkpoint = selected_checkpoint("wasm-document-json")?;
    let mut result = BreditorEngine::from_session_checkpoint_json(&checkpoint);
    let mut engine = require_engine(&mut result)?;
    let initial = engine.observation();

    let initial_document = require_string(engine.document_json(&initial))?;
    assert_document_json_is_canonical(&initial_document)?;
    let initial_record: Value = serde_json::from_str(&initial_document)?;
    assert_eq!(initial_record["format"], "breditor/document");
    assert_eq!(initial_record["formatVersion"], 1);
    assert!(initial_record.get("snapshot").is_none());
    assert!(initial_record.get("selection").is_none());
    assert!(initial_record.get("pendingFormats").is_none());
    assert!(initial_record.get("historyCapacity").is_none());

    let inserted =
        engine.execute_string_action(&initial, "breditor/insert-text", UNICODE_INSERTION, false);
    assert_eq!(inserted.status(), "committed");
    let after_insert = require_observation(&inserted)?;
    let inserted_document = require_string(engine.document_json(&after_insert))?;
    assert_document_json_is_canonical(&inserted_document)?;
    assert_eq!(
        serde_json::from_str::<Value>(&inserted_document)?["root"]["children"][0]["children"][0]["text"],
        format!("a{UNICODE_INSERTION}")
    );

    let cleared = engine.clear_selection(&after_insert);
    assert_eq!(cleared.status(), "committed");
    assert_eq!(cleared.event_kind().as_deref(), Some("selection"));
    let after_selection_only = require_observation(&cleared)?;
    assert_ne!(after_selection_only.snapshot_revision(), after_insert.snapshot_revision());
    assert_eq!(
        require_string(engine.document_json(&after_selection_only))?,
        inserted_document,
        "selection-only publication must not change exported content"
    );

    let undone = engine.undo(&after_selection_only, false);
    assert_eq!(undone.status(), "committed");
    let after_undo = require_observation(&undone)?;
    assert_eq!(require_string(engine.document_json(&after_undo))?, initial_document);

    let redone = engine.redo(&after_undo, false);
    assert_eq!(redone.status(), "committed");
    let after_redo = require_observation(&redone)?;
    assert_eq!(require_string(engine.document_json(&after_redo))?, inserted_document);

    let checkpoint_after_redo = require_string(engine.session_checkpoint_json())?;
    let mut restored_result = BreditorEngine::from_session_checkpoint_json(&checkpoint_after_redo);
    let restored = require_engine(&mut restored_result)?;
    let restored_observation = restored.observation();
    assert_eq!(
        require_string(restored.document_json(&restored_observation))?,
        inserted_document,
        "checkpoint restoration must preserve the authoritative document value"
    );
    Ok(())
}

#[cfg_attr(target_arch = "wasm32", wasm_bindgen_test)]
#[cfg_attr(not(target_arch = "wasm32"), test)]
fn document_json_rejects_stale_history_and_foreign_observations_without_content_leakage()
-> TestResult {
    const PRIVATE_TEXT: &str = "private-document-egress-payload";
    let checkpoint = selected_checkpoint("wasm-document-json-guard")?;
    let mut result = BreditorEngine::from_session_checkpoint_json(&checkpoint);
    let mut engine = require_engine(&mut result)?;
    let stale_snapshot = engine.observation();

    let inserted =
        engine.execute_string_action(&stale_snapshot, "breditor/insert-text", PRIVATE_TEXT, false);
    let before_history_change = require_observation(&inserted)?;

    let mut stale_result = engine.document_json(&stale_snapshot);
    assert_string_error(&mut stale_result, "editor_engine.stale_snapshot", PRIVATE_TEXT)?;

    let closed = engine.close_history_group(&before_history_change);
    assert_eq!(closed.status(), "committed");
    let current = require_observation(&closed)?;
    assert_eq!(current.snapshot_revision(), before_history_change.snapshot_revision());
    let mut stale_history = engine.document_json(&before_history_change);
    assert_string_error(&mut stale_history, "editor_engine.stale_history", PRIVATE_TEXT)?;

    let mut other_result =
        BreditorEngine::from_document_json("wasm-document-json-other", EMPTY_DOCUMENT_JSON, 0.0);
    let other = require_engine(&mut other_result)?;
    let foreign = other.observation();
    let mut foreign_result = engine.document_json(&foreign);
    assert_string_error(
        &mut foreign_result,
        "editor_engine.profile_generation_mismatch",
        PRIVATE_TEXT,
    )?;

    let current_document = require_string(engine.document_json(&current))?;
    assert!(current_document.contains(PRIVATE_TEXT));
    Ok(())
}

#[cfg_attr(target_arch = "wasm32", wasm_bindgen_test)]
#[cfg_attr(not(target_arch = "wasm32"), test)]
fn commit_projection_updates_classify_text_and_structural_changes() -> TestResult {
    let checkpoint = selected_checkpoint("wasm-projection-updates")?;
    let mut result = BreditorEngine::from_session_checkpoint_json(&checkpoint);
    let mut engine = require_engine(&mut result)?;
    let initial = engine.observation();

    let inserted = engine.execute_string_action(&initial, "breditor/insert-text", "b", false);
    let mut text_update = inserted
        .projection_update()
        .ok_or_else(|| test_error("text commit omitted its projection update"))?;
    assert_eq!(text_update.base_lineage(), "wasm-projection-updates");
    assert_eq!(text_update.base_revision(), "0");
    assert_eq!(text_update.result_lineage(), "wasm-projection-updates");
    assert_eq!(text_update.result_revision(), "1");
    assert_eq!(text_update.impact(), "textContainers");
    assert_eq!(text_update.affected_paragraph_count(), 1);
    assert_eq!(text_update.affected_paragraph_index(0), Some(0));
    assert_eq!(text_update.affected_paragraph_index(1), None);
    assert_eq!(text_update.old_child_start(), None);
    let text_projection = text_update
        .take_projection()
        .ok_or_else(|| test_error("text update omitted its final projection"))?;
    assert!(text_update.take_projection().is_none());
    assert_eq!(text_projection.text(2).as_deref(), Some("ab"));

    let before_close = require_observation(&inserted)?;
    let closed = engine.close_history_group(&before_close);
    assert_eq!(closed.status(), "committed");
    assert!(closed.projection_update().is_none());

    let before_toggle = require_observation(&closed)?;
    let pending_format =
        engine.execute_no_input_action(&before_toggle, "breditor/toggle-strong", false);
    assert_eq!(pending_format.status(), "committed");
    let mut none_update = pending_format
        .projection_update()
        .ok_or_else(|| test_error("state-only commit omitted its projection update"))?;
    assert_eq!(none_update.impact(), "none");
    assert_eq!(none_update.affected_paragraph_count(), 0);
    assert_eq!(none_update.old_child_start(), None);
    assert_eq!(none_update.result_revision(), "2");
    assert!(none_update.take_projection().is_some());

    let structural_checkpoint = selected_checkpoint("wasm-projection-structural")?;
    let mut structural_result =
        BreditorEngine::from_session_checkpoint_json(&structural_checkpoint);
    let mut structural_engine = require_engine(&mut structural_result)?;
    let structural_observation = structural_engine.observation();
    let structural = structural_engine.execute_string_action(
        &structural_observation,
        "breditor/insert-plain-text",
        "first\nsecond",
        false,
    );
    let mut root_update = structural
        .projection_update()
        .ok_or_else(|| test_error("structural commit omitted its projection update"))?;
    assert_eq!(root_update.impact(), "rootSplice");
    assert_eq!(root_update.affected_paragraph_count(), 0);
    assert_eq!(root_update.old_child_start(), Some(0));
    assert_eq!(root_update.old_child_end(), Some(1));
    assert_eq!(root_update.new_child_start(), Some(0));
    assert_eq!(root_update.new_child_end(), Some(2));
    let root_projection = root_update
        .take_projection()
        .ok_or_else(|| test_error("root update omitted its final projection"))?;
    assert_eq!(root_projection.child_count(0), Some(2));
    Ok(())
}

#[cfg(target_arch = "wasm32")]
#[wasm_bindgen_test]
#[allow(clippy::too_many_lines)]
fn semantic_selection_round_trips_direction_affinity_empty_and_strong_points() -> TestResult {
    const HOSTILE_TEXT: &str = "<img src=x onerror=alert(1)>&\"\n💣";
    let text_end = u32::try_from(HOSTILE_TEXT.encode_utf16().count())?;
    let mut result = BreditorEngine::from_document_json(
        "wasm-selection-round-trip",
        PROJECTION_DOCUMENT_JSON,
        100.0,
    );
    let mut engine = require_engine(&mut result)?;
    let initial = engine.observation();

    let mut initial_read = engine.selection(&initial);
    assert_eq!(initial_read.status(), "selection");
    assert!(initial_read.error().is_none());
    let initial_selection = require_selection(&mut initial_read)?;
    assert_eq!(initial_read.status(), "taken");
    assert!(initial_read.take_selection().is_none());
    assert_eq!(initial_selection.snapshot_lineage(), "wasm-selection-round-trip");
    assert_eq!(initial_selection.snapshot_revision(), "0");
    assert_eq!(initial_selection.kind(), "none");
    assert_eq!(initial_selection.anchor_point_kind(), None);
    assert_eq!(initial_selection.anchor_node_index(), None);
    assert_eq!(initial_selection.anchor_offset(), None);
    assert_eq!(initial_selection.anchor_affinity(), None);
    assert_eq!(initial_selection.focus_point_kind(), None);
    assert_eq!(initial_selection.focus_node_index(), None);
    assert_eq!(initial_selection.focus_offset(), None);
    assert_eq!(initial_selection.focus_affinity(), None);
    assert_eq!(initial_selection.range_order(), None);

    let forward = set_range_selection(
        &mut engine,
        &initial,
        "children",
        1.0,
        0.0,
        "after",
        "text",
        3.0,
        f64::from(text_end),
        "before",
    );
    assert_eq!(forward.status(), "committed");
    assert_eq!(forward.event_kind().as_deref(), Some("selection"));
    let mut forward_update = forward
        .projection_update()
        .ok_or_else(|| test_error("selection commit omitted its projection update"))?;
    assert_eq!(forward_update.impact(), "none");
    assert_eq!(forward_update.base_revision(), "0");
    assert_eq!(forward_update.result_revision(), "1");
    assert!(forward_update.take_projection().is_some());
    let after_forward = require_observation(&forward)?;

    let mut forward_read = engine.selection(&after_forward);
    let forward_selection = require_selection(&mut forward_read)?;
    assert_eq!(forward_selection.snapshot_revision(), "1");
    assert_eq!(forward_selection.kind(), "range");
    assert_eq!(forward_selection.anchor_point_kind().as_deref(), Some("children"));
    assert_eq!(forward_selection.anchor_node_index(), Some(1));
    assert_eq!(forward_selection.anchor_offset(), Some(0));
    assert_eq!(forward_selection.anchor_affinity().as_deref(), Some("after"));
    assert_eq!(forward_selection.focus_point_kind().as_deref(), Some("text"));
    assert_eq!(forward_selection.focus_node_index(), Some(3));
    assert_eq!(forward_selection.focus_offset(), Some(text_end));
    assert_eq!(forward_selection.focus_affinity().as_deref(), Some("before"));
    assert_eq!(forward_selection.range_order().as_deref(), Some("forward"));

    let echo = set_range_selection(
        &mut engine,
        &after_forward,
        "children",
        1.0,
        0.0,
        "after",
        "text",
        3.0,
        f64::from(text_end),
        "before",
    );
    assert_eq!(echo.status(), "unchanged");
    assert!(echo.projection_update().is_none());
    let after_echo = require_observation(&echo)?;
    assert_eq!(after_echo.snapshot_revision(), "1");

    let backward = set_range_selection(
        &mut engine,
        &after_echo,
        "text",
        3.0,
        f64::from(text_end),
        "before",
        "children",
        1.0,
        0.0,
        "after",
    );
    assert_eq!(backward.status(), "committed");
    let after_backward = require_observation(&backward)?;
    let mut backward_read = engine.selection(&after_backward);
    let backward_selection = require_selection(&mut backward_read)?;
    assert_eq!(backward_selection.anchor_point_kind().as_deref(), Some("text"));
    assert_eq!(backward_selection.anchor_node_index(), Some(3));
    assert_eq!(backward_selection.focus_point_kind().as_deref(), Some("children"));
    assert_eq!(backward_selection.focus_node_index(), Some(1));
    assert_eq!(backward_selection.range_order().as_deref(), Some("backward"));

    let cleared = engine.clear_selection(&after_backward);
    assert_eq!(cleared.status(), "committed");
    assert_eq!(cleared.event_kind().as_deref(), Some("selection"));
    let after_clear = require_observation(&cleared)?;
    assert_eq!(after_clear.snapshot_revision(), "3");
    let mut cleared_read = engine.selection(&after_clear);
    assert_eq!(require_selection(&mut cleared_read)?.kind(), "none");

    let clear_echo = engine.clear_selection(&after_clear);
    assert_eq!(clear_echo.status(), "unchanged");
    assert_eq!(require_observation(&clear_echo)?.snapshot_revision(), "3");
    assert!(clear_echo.projection_update().is_none());
    Ok(())
}

#[cfg(target_arch = "wasm32")]
#[wasm_bindgen_test]
#[allow(clippy::too_many_lines)]
fn selection_scalar_admission_is_exact_redacted_and_stale_first() -> TestResult {
    const PRIVATE: &str = "private-selection-coordinate";
    let mut result = BreditorEngine::from_document_json(
        "wasm-selection-admission",
        PROJECTION_DOCUMENT_JSON,
        100.0,
    );
    let mut engine = require_engine(&mut result)?;
    let initial = engine.observation();
    let checkpoint_before = require_string(engine.session_checkpoint_json())?;

    let invalid_kind = set_range_selection(
        &mut engine,
        &initial,
        PRIVATE,
        1.0,
        0.0,
        "after",
        "children",
        1.0,
        0.0,
        "after",
    );
    assert_command_error(&invalid_kind, "breditor_wasm.invalid_selection_point_kind", PRIVATE)?;

    for invalid in [-1.0, 0.5, f64::NAN, f64::INFINITY, f64::NEG_INFINITY, 4_294_967_296.0] {
        let rejected = set_range_selection(
            &mut engine,
            &initial,
            "children",
            invalid,
            0.0,
            "after",
            "children",
            1.0,
            0.0,
            "after",
        );
        assert_command_error(&rejected, "breditor_wasm.invalid_selection_coordinate", PRIVATE)?;
    }

    let invalid_affinity = set_range_selection(
        &mut engine,
        &initial,
        "children",
        1.0,
        0.0,
        PRIVATE,
        "children",
        1.0,
        0.0,
        "after",
    );
    assert_command_error(&invalid_affinity, "breditor_wasm.invalid_selection_affinity", PRIVATE)?;

    for (kind, node_index) in [("text", 1.0), ("children", 99.0)] {
        let rejected = set_range_selection(
            &mut engine,
            &initial,
            kind,
            node_index,
            0.0,
            "after",
            "children",
            1.0,
            0.0,
            "after",
        );
        assert_command_error(&rejected, "breditor_wasm.invalid_selection_node", PRIVATE)?;
    }

    assert_eq!(engine.observation().snapshot_revision(), "0");
    assert_eq!(require_string(engine.session_checkpoint_json())?, checkpoint_before);

    let valid = set_range_selection(
        &mut engine,
        &initial,
        "children",
        1.0,
        -0.0,
        "after",
        "children",
        1.0,
        0.0,
        "before",
    );
    assert_eq!(valid.status(), "committed");
    let after_valid = require_observation(&valid)?;

    let stale_before_scalar_admission = set_range_selection(
        &mut engine,
        &initial,
        PRIVATE,
        f64::NAN,
        f64::INFINITY,
        PRIVATE,
        PRIVATE,
        -1.0,
        0.5,
        PRIVATE,
    );
    assert_command_error(&stale_before_scalar_admission, "editor_engine.stale_snapshot", PRIVATE)?;

    let mut stale_read = engine.selection(&initial);
    assert_eq!(stale_read.status(), "error");
    assert!(stale_read.take_selection().is_none());
    let stale_error =
        stale_read.error().ok_or_else(|| test_error("stale selection read omitted its error"))?;
    assert_eq!(stale_error.code(), "editor_engine.stale_snapshot");
    assert!(!stale_error.message().contains(PRIVATE));
    assert_eq!(after_valid.snapshot_revision(), "1");
    Ok(())
}

#[cfg(target_arch = "wasm32")]
#[wasm_bindgen_test]
fn selection_semantics_reject_root_surrogate_and_bounds_atomically() -> TestResult {
    let mut result =
        BreditorEngine::from_document_json("wasm-selection-utf16", EMOJI_DOCUMENT_JSON, 100.0);
    let mut engine = require_engine(&mut result)?;
    let initial = engine.observation();
    let checkpoint_before = require_string(engine.session_checkpoint_json())?;

    for (kind, node_index, offset) in
        [("text", 2.0, 2.0), ("text", 2.0, 5.0), ("children", 0.0, 0.0)]
    {
        let rejected = set_range_selection(
            &mut engine,
            &initial,
            kind,
            node_index,
            offset,
            "after",
            kind,
            node_index,
            offset,
            "after",
        );
        assert_command_error(&rejected, "editor_engine.selection_update", "a😀b")?;
        assert_eq!(engine.observation().snapshot_revision(), "0");
        assert_eq!(require_string(engine.session_checkpoint_json())?, checkpoint_before);
    }

    let valid = set_range_selection(
        &mut engine,
        &initial,
        "text",
        2.0,
        3.0,
        "after",
        "text",
        2.0,
        3.0,
        "before",
    );
    assert_eq!(valid.status(), "committed");
    let after_valid = require_observation(&valid)?;
    let mut selected = engine.selection(&after_valid);
    let selection = require_selection(&mut selected)?;
    assert_eq!(selection.anchor_offset(), Some(3));
    assert_eq!(selection.focus_offset(), Some(3));
    assert_eq!(selection.anchor_affinity().as_deref(), Some("after"));
    assert_eq!(selection.focus_affinity().as_deref(), Some("before"));
    assert_eq!(selection.range_order().as_deref(), Some("collapsed"));
    Ok(())
}

#[cfg(target_arch = "wasm32")]
#[wasm_bindgen_test]
fn selection_jsvalue_admission_rejects_coercible_non_primitives_atomically() -> TestResult {
    const PRIVATE: &str = "private-coercible-selection-value";
    let mut result = BreditorEngine::from_document_json(
        "wasm-selection-js-values",
        PROJECTION_DOCUMENT_JSON,
        100.0,
    );
    let mut engine = require_engine(&mut result)?;
    let initial = engine.observation();
    let checkpoint_before = require_string(engine.session_checkpoint_json())?;

    for value in
        [JsValue::NULL, JsValue::FALSE, JsValue::from_str("1"), boxed_number(1.0), number_like(1.0)]
    {
        let rejected = set_anchor_fields(
            &mut engine,
            &initial,
            &JsValue::from_str("children"),
            &value,
            &JsValue::from_f64(0.0),
            &JsValue::from_str("after"),
        );
        assert_command_error(&rejected, "breditor_wasm.invalid_selection_coordinate", PRIVATE)?;
        assert_eq!(require_string(engine.session_checkpoint_json())?, checkpoint_before);
    }

    for value in [boxed_string("children"), string_like("children")] {
        let rejected = set_anchor_fields(
            &mut engine,
            &initial,
            &value,
            &JsValue::from_f64(1.0),
            &JsValue::from_f64(0.0),
            &JsValue::from_str("after"),
        );
        assert_command_error(&rejected, "breditor_wasm.invalid_selection_point_kind", PRIVATE)?;
        assert_eq!(require_string(engine.session_checkpoint_json())?, checkpoint_before);
    }

    for value in [boxed_string("after"), string_like("after")] {
        let rejected = set_anchor_fields(
            &mut engine,
            &initial,
            &JsValue::from_str("children"),
            &JsValue::from_f64(1.0),
            &JsValue::from_f64(0.0),
            &value,
        );
        assert_command_error(&rejected, "breditor_wasm.invalid_selection_affinity", PRIVATE)?;
        assert_eq!(require_string(engine.session_checkpoint_json())?, checkpoint_before);
    }

    assert_eq!(engine.observation().snapshot_revision(), "0");
    let valid = set_range_selection(
        &mut engine,
        &initial,
        "children",
        1.0,
        0.0,
        "after",
        "children",
        1.0,
        0.0,
        "after",
    );
    assert_eq!(valid.status(), "committed");
    Ok(())
}

#[cfg_attr(target_arch = "wasm32", wasm_bindgen_test)]
#[cfg_attr(not(target_arch = "wasm32"), test)]
fn factory_failures_are_stable_and_redacted() -> TestResult {
    const PRIVATE_INPUT: &str = "private-invalid-document-payload";
    let invalid_lineage =
        BreditorEngine::from_document_json("/invalid", EMPTY_DOCUMENT_JSON, 100.0);
    assert_engine_error(&invalid_lineage, "breditor_wasm.invalid_lineage", PRIVATE_INPUT)?;

    for capacity in
        [1.5, -1.0, f64::NAN, f64::INFINITY, f64::NEG_INFINITY, 101.0, 10_000.0, 4_294_967_296.0]
    {
        let invalid = BreditorEngine::from_document_json("capacity", EMPTY_DOCUMENT_JSON, capacity);
        assert_engine_error(&invalid, "breditor_wasm.invalid_history_capacity", PRIVATE_INPUT)?;
    }

    let invalid_document = BreditorEngine::from_document_json("invalid-doc", PRIVATE_INPUT, 100.0);
    assert_engine_error(&invalid_document, "codec.invalid_json", PRIVATE_INPUT)?;

    for (capacity, expected) in [(-0.0, 0), (0.0, 0), (100.0, 100)] {
        let mut valid =
            BreditorEngine::from_document_json("capacity-valid", EMPTY_DOCUMENT_JSON, capacity);
        assert_eq!(valid.status(), "engine");
        let engine = require_engine(&mut valid)?;
        assert_eq!(engine.observation().history_capacity(), expected);
        assert_eq!(valid.status(), "taken");
    }
    Ok(())
}

#[cfg_attr(target_arch = "wasm32", wasm_bindgen_test)]
#[cfg_attr(not(target_arch = "wasm32"), test)]
fn disabled_and_unchanged_outcomes_carry_current_observations() -> TestResult {
    let mut result = BreditorEngine::from_document_json("wasm-noops", EMPTY_DOCUMENT_JSON, 100.0);
    let mut engine = require_engine(&mut result)?;
    let initial = engine.observation();

    let disabled = engine.execute_no_input_action(&initial, "breditor/toggle-strong", false);
    assert_eq!(disabled.status(), "disabled");
    assert_eq!(disabled.disabled_action_id().as_deref(), Some("breditor/toggle-strong"));
    assert_eq!(disabled.disabled_reason_code().as_deref(), Some("breditor/no-selection"));
    assert_eq!(disabled.activation().as_deref(), Some("inactive"));
    assert_eq!(disabled.indicator_value_status().as_deref(), Some("unsupported"));
    assert!(disabled.error().is_none());
    assert_eq!(disabled.event_kind(), None);
    assert_eq!(disabled.commit_json().status(), "absent");
    assert!(disabled.projection_update().is_none());
    let after_disabled = require_observation(&disabled)?;
    assert_eq!(after_disabled.snapshot_revision(), "0");

    let undo = engine.undo(&after_disabled, false);
    assert_eq!(undo.status(), "unchanged");
    assert_eq!(undo.event_kind(), None);
    assert!(undo.error().is_none());
    assert!(undo.disabled_action_id().is_none());
    assert_eq!(undo.commit_json().status(), "absent");
    assert!(undo.projection_update().is_none());
    let after_undo = require_observation(&undo)?;
    let clear = engine.clear_history(&after_undo);
    assert_eq!(clear.status(), "unchanged");
    assert!(clear.observation().is_some());
    Ok(())
}

#[cfg_attr(target_arch = "wasm32", wasm_bindgen_test)]
#[cfg_attr(not(target_arch = "wasm32"), test)]
fn clear_inline_formatting_intent_commits_and_replays_through_the_generic_boundary() -> TestResult {
    let checkpoint = strong_range_checkpoint("wasm-clear-inline-formatting")?;
    let mut result = BreditorEngine::from_session_checkpoint_json(&checkpoint);
    let mut engine = require_engine(&mut result)?;
    let initial = engine.observation();

    let mut before_states = engine.action_states(&initial);
    let before_states = require_action_state_snapshot(&mut before_states)?;
    assert_eq!(before_states.entry_status(1).as_deref(), Some("enabled"));
    assert_eq!(before_states.entry_activation(1).as_deref(), Some("stateless"));

    let cleared =
        engine.execute_no_input_intent(&initial, BASE_CLEAR_INLINE_FORMATTING_INTENT, true);
    assert_eq!(cleared.status(), "committed");
    assert_eq!(cleared.intent_id().as_deref(), Some(BASE_CLEAR_INLINE_FORMATTING_INTENT));
    assert_eq!(cleared.action_id().as_deref(), Some("breditor/clear-inline-formats"));
    assert_eq!(cleared.binding_id().as_deref(), Some("breditor/clear-inline-formatting-binding"));
    let commit: Value = serde_json::from_str(
        &cleared
            .commit_json()
            .value()
            .ok_or_else(|| test_error("clear intent omitted its commit JSON"))?,
    )?;
    assert_eq!(commit["forwardOperations"][0]["kind"], "textSplice");
    assert_eq!(commit["metadata"]["action"], "breditor/clear-inline-formats");
    let after_clear = cleared
        .observation()
        .ok_or_else(|| test_error("clear intent omitted its successor observation"))?;
    assert_eq!(after_clear.undo_depth(), 1);
    let document: Value =
        serde_json::from_str(&require_string(engine.document_json(&after_clear))?)?;
    assert_eq!(document["root"]["children"][0]["children"][0]["formats"], serde_json::json!([]));

    let checkpoint_after_clear = require_string(engine.session_checkpoint_json())?;
    let mut restored_result = BreditorEngine::from_session_checkpoint_json(&checkpoint_after_clear);
    let mut restored = require_engine(&mut restored_result)?;
    assert_eq!(require_string(restored.session_checkpoint_json())?, checkpoint_after_clear,);
    let restored_clear = restored.observation();
    assert_eq!(restored_clear.undo_depth(), 1);
    let restored_document: Value =
        serde_json::from_str(&require_string(restored.document_json(&restored_clear))?)?;
    assert_eq!(
        restored_document["root"]["children"][0]["children"][0]["formats"],
        serde_json::json!([]),
    );
    let restored_undo = restored.undo(&restored_clear, true);
    assert_eq!(restored_undo.status(), "committed");
    let restored_after_undo = require_observation(&restored_undo)?;
    let restored_document: Value =
        serde_json::from_str(&require_string(restored.document_json(&restored_after_undo))?)?;
    assert_eq!(
        restored_document["root"]["children"][0]["children"][0]["formats"][0]["type"],
        "breditor/strong",
    );
    let restored_redo = restored.redo(&restored_after_undo, true);
    assert_eq!(restored_redo.status(), "committed");
    let restored_after_redo = require_observation(&restored_redo)?;
    let restored_document: Value =
        serde_json::from_str(&require_string(restored.document_json(&restored_after_redo))?)?;
    assert_eq!(
        restored_document["root"]["children"][0]["children"][0]["formats"],
        serde_json::json!([]),
    );

    let mut after_states = engine.action_states(&after_clear);
    let after_states = require_action_state_snapshot(&mut after_states)?;
    assert_eq!(after_states.entry_status(1).as_deref(), Some("blocked"));
    assert_eq!(
        after_states.entry_reason_code(1).as_deref(),
        Some("breditor/inline-format-unchanged"),
    );

    let undone = engine.undo(&after_clear, true);
    assert_eq!(undone.status(), "committed");
    let after_undo = require_observation(&undone)?;
    let document: Value =
        serde_json::from_str(&require_string(engine.document_json(&after_undo))?)?;
    assert_eq!(
        document["root"]["children"][0]["children"][0]["formats"][0]["type"],
        "breditor/strong",
    );

    let redone = engine.redo(&after_undo, true);
    assert_eq!(redone.status(), "committed");
    let after_redo = require_observation(&redone)?;
    let document: Value =
        serde_json::from_str(&require_string(engine.document_json(&after_redo))?)?;
    assert_eq!(document["root"]["children"][0]["children"][0]["formats"], serde_json::json!([]));
    Ok(())
}

#[cfg_attr(target_arch = "wasm32", wasm_bindgen_test)]
#[cfg_attr(not(target_arch = "wasm32"), test)]
fn string_action_commit_replay_and_stale_guards_are_preserved() -> TestResult {
    const PRIVATE_INPUT: &str = "private-wasm-action";
    let checkpoint = selected_checkpoint("wasm-action")?;
    let mut result = BreditorEngine::from_session_checkpoint_json(&checkpoint);
    let mut engine = require_engine(&mut result)?;
    let initial = engine.observation();

    let committed =
        engine.execute_string_action(&initial, "breditor/insert-text", PRIVATE_INPUT, false);
    assert_eq!(committed.status(), "committed");
    assert_eq!(committed.event_kind().as_deref(), Some("action"));
    assert!(committed.error().is_none());
    assert!(committed.disabled_action_id().is_none());
    let commit = committed.commit_json();
    assert_eq!(commit.status(), "value");
    assert!(commit.value().is_some_and(|json| json.contains("\"format\":\"breditor/commit\"")));
    let after_insert = require_observation(&committed)?;
    assert_eq!(after_insert.snapshot_revision(), "1");
    assert_eq!(after_insert.undo_depth(), 1);

    let stale = engine.execute_no_input_action(&initial, "not even an action ID", false);
    assert_command_error(&stale, "editor_engine.stale_snapshot", PRIVATE_INPUT)?;

    let undo = engine.undo(&after_insert, false);
    assert_eq!(undo.status(), "committed");
    assert_eq!(undo.event_kind().as_deref(), Some("undo"));
    let mut undo_update = undo
        .projection_update()
        .ok_or_else(|| test_error("undo omitted its inverse projection update"))?;
    assert_eq!(undo_update.impact(), "textContainers");
    assert_eq!(undo_update.affected_paragraph_index(0), Some(0));
    let undo_projection = undo_update
        .take_projection()
        .ok_or_else(|| test_error("undo update omitted its final projection"))?;
    assert_eq!(undo_projection.text(2).as_deref(), Some("a"));
    let after_undo = require_observation(&undo)?;
    assert_eq!(after_undo.snapshot_revision(), "2");
    assert_eq!(after_undo.redo_depth(), 1);

    let redo = engine.redo(&after_undo, false);
    assert_eq!(redo.status(), "committed");
    assert_eq!(redo.event_kind().as_deref(), Some("redo"));
    let mut redo_update = redo
        .projection_update()
        .ok_or_else(|| test_error("redo omitted its forward projection update"))?;
    assert_eq!(redo_update.impact(), "textContainers");
    let redo_projection = redo_update
        .take_projection()
        .ok_or_else(|| test_error("redo update omitted its final projection"))?;
    assert_eq!(redo_projection.text(2).as_deref(), Some("aprivate-wasm-action"));
    assert_eq!(redo.observation().map(|value| value.snapshot_revision()).as_deref(), Some("3"));
    Ok(())
}

#[cfg_attr(target_arch = "wasm32", wasm_bindgen_test)]
#[cfg_attr(not(target_arch = "wasm32"), test)]
fn action_shape_errors_are_adapter_owned_and_atomic() -> TestResult {
    let checkpoint = selected_checkpoint("wasm-shape")?;
    let mut result = BreditorEngine::from_session_checkpoint_json(&checkpoint);
    let mut engine = require_engine(&mut result)?;
    let observation = engine.observation();

    let missing = engine.execute_no_input_action(&observation, "test/missing", false);
    assert_command_error(&missing, "breditor_wasm.unknown_action", "missing")?;
    let malformed = engine.execute_no_input_action(&observation, "MALFORMED", false);
    assert_command_error(&malformed, "breditor_wasm.invalid_action_id", "MALFORMED")?;
    let needs_string = engine.execute_no_input_action(&observation, "breditor/insert-text", false);
    assert_command_error(
        &needs_string,
        "breditor_wasm.action_requires_string_input",
        "insert-text",
    )?;
    let rejects_string =
        engine.execute_string_action(&observation, "breditor/toggle-strong", "private", false);
    assert_command_error(&rejects_string, "breditor_wasm.action_rejects_string_input", "private")?;
    let too_large = "x".repeat(65_537);
    let limited =
        engine.execute_string_action(&observation, "breditor/insert-text", &too_large, false);
    assert_command_error(&limited, "breditor_wasm.string_input_limit", &too_large)?;
    assert_eq!(engine.observation().snapshot_revision(), "0");
    Ok(())
}

#[cfg_attr(target_arch = "wasm32", wasm_bindgen_test)]
#[cfg_attr(not(target_arch = "wasm32"), test)]
fn known_string_value_rejections_keep_precise_safe_codes_and_are_atomic() -> TestResult {
    let checkpoint = selected_checkpoint("wasm-value-errors")?;
    let mut result = BreditorEngine::from_session_checkpoint_json(&checkpoint);
    let mut engine = require_engine(&mut result)?;
    let observation = engine.observation();

    let empty = engine.execute_string_action(&observation, "breditor/insert-text", "", false);
    assert_command_error(&empty, "breditor/insert-text-input-empty", "private")?;

    let too_many_paragraphs = format!("private-paragraph\n{}", "\n".repeat(9_999));
    let paragraph_limit = engine.execute_string_action(
        &observation,
        "breditor/insert-plain-text",
        &too_many_paragraphs,
        false,
    );
    assert_command_error(
        &paragraph_limit,
        "breditor/insert-plain-text-paragraph-limit",
        "private-paragraph",
    )?;

    assert_eq!(engine.observation().snapshot_revision(), "0");
    let valid = engine.execute_string_action(&observation, "breditor/insert-text", "valid", false);
    assert_eq!(valid.status(), "committed");
    assert_eq!(require_observation(&valid)?.snapshot_revision(), "1");
    Ok(())
}

#[cfg_attr(target_arch = "wasm32", wasm_bindgen_test)]
#[cfg_attr(not(target_arch = "wasm32"), test)]
fn history_only_publication_rotates_the_hidden_guard_at_the_same_revision() -> TestResult {
    let checkpoint = selected_checkpoint("wasm-stale-history")?;
    let mut result = BreditorEngine::from_session_checkpoint_json(&checkpoint);
    let mut engine = require_engine(&mut result)?;
    let initial = engine.observation();

    let inserted = engine.execute_string_action(&initial, "breditor/insert-text", "b", false);
    let before_close = require_observation(&inserted)?;
    assert_eq!(before_close.snapshot_revision(), "1");
    assert_eq!(before_close.undo_depth(), 1);
    let mut state_before_close = engine.action_states(&before_close);
    assert_eq!(state_before_close.status(), "full");
    assert_eq!(require_action_state_snapshot(&mut state_before_close)?.entry_count(), 4);

    let closed = engine.close_history_group(&before_close);
    assert_eq!(closed.status(), "committed");
    assert_eq!(closed.event_kind().as_deref(), Some("closeHistoryGroup"));
    assert_eq!(closed.commit_json().status(), "absent");
    let after_close = require_observation(&closed)?;
    assert_eq!(after_close.snapshot_revision(), before_close.snapshot_revision());
    assert_eq!(after_close.undo_depth(), before_close.undo_depth());
    assert_eq!(after_close.redo_depth(), before_close.redo_depth());

    let mut stale_state = engine.action_states(&before_close);
    assert_eq!(stale_state.status(), "error");
    assert!(stale_state.take_snapshot().is_none());
    let stale_state_error =
        stale_state.error().ok_or_else(|| test_error("stale action state omitted its error"))?;
    assert_eq!(stale_state_error.code(), "editor_engine.stale_history");

    let mut state_after_close = engine.action_states(&after_close);
    assert_eq!(state_after_close.status(), "delta");
    let state_after_close = require_action_state_snapshot(&mut state_after_close)?;
    assert_eq!(state_after_close.snapshot_revision(), "1");
    assert_eq!(state_after_close.changed_count(), 0);

    let stale = engine.execute_no_input_action(&before_close, "not even an action ID", false);
    assert_command_error(&stale, "editor_engine.stale_history", "not even an action ID")?;
    let current = engine.observation();
    assert_eq!(current.snapshot_revision(), "1");
    assert_eq!(current.undo_depth(), 1);
    Ok(())
}

#[cfg_attr(target_arch = "wasm32", wasm_bindgen_test)]
#[cfg_attr(not(target_arch = "wasm32"), test)]
fn plain_text_action_and_effective_history_clear_cross_the_boundary() -> TestResult {
    let checkpoint = selected_checkpoint("wasm-plain-text-clear")?;
    let mut result = BreditorEngine::from_session_checkpoint_json(&checkpoint);
    let mut engine = require_engine(&mut result)?;
    let initial = engine.observation();

    let inserted = engine.execute_string_action(
        &initial,
        "breditor/insert-plain-text",
        "first\nsecond",
        false,
    );
    assert_eq!(inserted.status(), "committed");
    assert_eq!(inserted.event_kind().as_deref(), Some("action"));
    let after_insert = require_observation(&inserted)?;
    assert_eq!(after_insert.snapshot_revision(), "1");
    assert_eq!(after_insert.undo_depth(), 1);
    let encoded_state = require_string(engine.state_json())?;
    assert!(encoded_state.contains(r#""text":"afirst""#));
    assert!(encoded_state.contains(r#""text":"second""#));

    let cleared = engine.clear_history(&after_insert);
    assert_eq!(cleared.status(), "committed");
    assert_eq!(cleared.event_kind().as_deref(), Some("clearHistory"));
    assert_eq!(cleared.commit_json().status(), "absent");
    let after_clear = require_observation(&cleared)?;
    assert_eq!(after_clear.snapshot_revision(), "1");
    assert_eq!(after_clear.undo_depth(), 0);
    assert_eq!(after_clear.redo_depth(), 0);

    let stale = engine.undo(&after_insert, false);
    assert_command_error(&stale, "editor_engine.stale_history", "first\nsecond")?;
    let unchanged = engine.undo(&after_clear, false);
    assert_eq!(unchanged.status(), "unchanged");
    Ok(())
}

#[cfg_attr(target_arch = "wasm32", wasm_bindgen_test)]
#[cfg_attr(not(target_arch = "wasm32"), test)]
fn full_width_revision_is_exposed_only_as_canonical_decimal_text() -> TestResult {
    let checkpoint = checkpoint_at_revision("wasm-max-revision", u64::MAX)?;
    let mut result = BreditorEngine::from_session_checkpoint_json(&checkpoint);
    let engine = require_engine(&mut result)?;

    let observation = engine.observation();
    assert_eq!(observation.snapshot_revision(), "18446744073709551615");
    let exported = require_string(engine.session_checkpoint_json())?;
    let record: Value = serde_json::from_str(&exported)?;
    assert_eq!(record["currentRevision"], "18446744073709551615");
    Ok(())
}

#[cfg_attr(target_arch = "wasm32", wasm_bindgen_test)]
#[cfg_attr(not(target_arch = "wasm32"), test)]
fn equivalent_replays_produce_byte_identical_commit_state_and_checkpoint_json() -> TestResult {
    let checkpoint = selected_checkpoint("wasm-deterministic")?;
    let first = deterministic_sequence(&checkpoint)?;
    let second = deterministic_sequence(&checkpoint)?;
    assert_eq!(first, second);
    Ok(())
}

#[cfg_attr(target_arch = "wasm32", wasm_bindgen_test)]
#[cfg_attr(not(target_arch = "wasm32"), test)]
fn checkpoint_restore_allocates_a_fresh_engine_identity() -> TestResult {
    let checkpoint = selected_checkpoint("wasm-restore")?;
    let mut first_result = BreditorEngine::from_session_checkpoint_json(&checkpoint);
    let mut first = require_engine(&mut first_result)?;
    let first_observation = first.observation();
    let mut encoded = first.session_checkpoint_json();
    let encoded = encoded.take_value().ok_or_else(|| test_error("checkpoint export failed"))?;
    let mut second_result = BreditorEngine::from_session_checkpoint_json(&encoded);
    let mut second = require_engine(&mut second_result)?;

    let cross_engine = second.undo(&first_observation, false);
    assert_command_error(
        &cross_engine,
        "editor_engine.profile_generation_mismatch",
        "wasm-restore",
    )?;
    assert_eq!(second.observation().snapshot_revision(), "0");

    let current = first.observation();
    let first_undo = first.undo(&current, false);
    assert_eq!(first_undo.status(), "unchanged");
    Ok(())
}

fn profile_document_v2(descriptor: &BreditorCompiledProfileDescriptor, text: &str) -> String {
    serde_json::json!({
        "format": "breditor/document",
        "formatVersion": 2,
        "schema": {
            "name": descriptor.schema_name(),
            "version": descriptor.schema_version(),
        },
        "schemaFingerprint": descriptor.schema_fingerprint(),
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
                "children": [{
                    "kind": "text",
                    "text": text,
                    "formats": [],
                }],
            }],
        },
    })
    .to_string()
}

fn profile_checkpoint_v2(
    descriptor: &BreditorCompiledProfileDescriptor,
    lineage: &str,
    text: &str,
) -> TestResult<String> {
    let document: Value = serde_json::from_str(&profile_document_v2(descriptor, text))?;
    Ok(serde_json::json!({
        "format": "breditor/session-checkpoint",
        "formatVersion": 2,
        "schema": {
            "name": descriptor.schema_name(),
            "version": descriptor.schema_version(),
        },
        "schemaFingerprint": descriptor.schema_fingerprint(),
        "historyBase": {
            "format": "breditor/editor-state",
            "formatVersion": 2,
            "schema": {
                "name": descriptor.schema_name(),
                "version": descriptor.schema_version(),
            },
            "schemaFingerprint": descriptor.schema_fingerprint(),
            "snapshot": {
                "lineage": lineage,
                "revision": "0",
            },
            "document": document,
            "selection": {
                "kind": "range",
                "anchor": {
                    "kind": "text",
                    "textPath": [0, 0],
                    "utf16Offset": 0,
                    "affinity": "before",
                },
                "focus": {
                    "kind": "text",
                    "textPath": [0, 0],
                    "utf16Offset": 3,
                    "affinity": "after",
                },
            },
            "pendingFormats": null,
        },
        "currentRevision": "0",
        "historyCapacity": 100,
        "cursor": 0,
        "entries": [],
        "openMergeGroup": null,
    })
    .to_string())
}

fn selected_checkpoint(lineage: &str) -> TestResult<String> {
    let context = EditorContext::default();
    let document = DocumentJsonCodec::new(context.schema().clone())
        .with_limits(context.limits().clone())
        .decode(TEXT_DOCUMENT_JSON)?;
    let point = Point::Text {
        text_path: NodePath::try_from_indices(vec![0, 0])?,
        utf16_offset: 1,
        affinity: Affinity::After,
    };
    let selection: Selection = RangeSelection::new(point.clone(), point).into();
    let state = EditorState::try_new(
        &context,
        LineageId::try_new(lineage)?,
        document,
        Some(selection),
        None,
    )?;
    Ok(SessionCheckpointJsonCodec::new(context).encode(&EditorSession::new(state))?)
}

fn strong_range_checkpoint(lineage: &str) -> TestResult<String> {
    let context = EditorContext::default();
    let document = DocumentJsonCodec::new(context.schema().clone())
        .with_limits(context.limits().clone())
        .decode(STRONG_TEXT_DOCUMENT_JSON)?;
    let anchor = Point::Text {
        text_path: NodePath::try_from_indices(vec![0, 0])?,
        utf16_offset: 0,
        affinity: Affinity::Before,
    };
    let focus = Point::Text {
        text_path: NodePath::try_from_indices(vec![0, 0])?,
        utf16_offset: 1,
        affinity: Affinity::After,
    };
    let selection: Selection = RangeSelection::new(anchor, focus).into();
    let state = EditorState::try_new(
        &context,
        LineageId::try_new(lineage)?,
        document,
        Some(selection),
        None,
    )?;
    Ok(SessionCheckpointJsonCodec::new(context).encode(&EditorSession::new(state))?)
}

fn checkpoint_at_revision(lineage: &str, revision: u64) -> TestResult<String> {
    let context = EditorContext::default();
    let document = DocumentJsonCodec::new(context.schema().clone())
        .with_limits(context.limits().clone())
        .decode(TEXT_DOCUMENT_JSON)?;
    let initial =
        EditorState::try_new(&context, LineageId::try_new(lineage)?, document, None, None)?;
    let state_codec = EditorStateJsonCodec::new(context.clone());
    let mut record: Value = serde_json::from_str(&state_codec.encode(&initial)?)?;
    record["snapshot"]["revision"] = Value::String(revision.to_string());
    let state = state_codec.decode(&serde_json::to_string(&record)?)?;
    Ok(SessionCheckpointJsonCodec::new(context).encode(&EditorSession::new(state))?)
}

fn deterministic_sequence(checkpoint: &str) -> TestResult<(String, String, String)> {
    let mut result = BreditorEngine::from_session_checkpoint_json(checkpoint);
    let mut engine = require_engine(&mut result)?;
    let observation = engine.observation();
    let command =
        engine.execute_string_action(&observation, "breditor/insert-text", "deterministic", false);
    assert_eq!(command.status(), "committed");
    assert_eq!(require_observation(&command)?.snapshot_revision(), "1");
    Ok((
        require_string(command.commit_json())?,
        require_string(engine.state_json())?,
        require_string(engine.session_checkpoint_json())?,
    ))
}

fn require_engine(result: &mut BreditorEngineResult) -> TestResult<BreditorEngine> {
    result.take_engine().ok_or_else(|| test_error("engine result had no engine").into())
}

fn require_observation(result: &BreditorCommandResult) -> TestResult<BreditorObservation> {
    result.observation().ok_or_else(|| test_error("command result had no observation").into())
}

fn require_projection(result: &mut BreditorProjectionResult) -> TestResult<BreditorProjection> {
    result.take_projection().ok_or_else(|| test_error("projection result had no projection").into())
}

fn require_action_state_snapshot(
    result: &mut BreditorActionStatesResult,
) -> TestResult<BreditorActionStateSnapshot> {
    result.take_snapshot().ok_or_else(|| test_error("action-state result had no snapshot").into())
}

fn changed_ids(snapshot: &BreditorActionStateSnapshot) -> Vec<String> {
    (0..snapshot.changed_count()).filter_map(|index| snapshot.changed_id(index)).collect()
}

#[cfg(target_arch = "wasm32")]
#[allow(clippy::too_many_arguments)]
fn set_range_selection(
    engine: &mut BreditorEngine,
    expected: &BreditorObservation,
    anchor_kind: &str,
    anchor_node_index: f64,
    anchor_offset: f64,
    anchor_affinity: &str,
    focus_kind: &str,
    focus_node_index: f64,
    focus_offset: f64,
    focus_affinity: &str,
) -> BreditorCommandResult {
    engine.set_range_selection(
        expected,
        &JsValue::from_str(anchor_kind),
        &JsValue::from_f64(anchor_node_index),
        &JsValue::from_f64(anchor_offset),
        &JsValue::from_str(anchor_affinity),
        &JsValue::from_str(focus_kind),
        &JsValue::from_f64(focus_node_index),
        &JsValue::from_f64(focus_offset),
        &JsValue::from_str(focus_affinity),
    )
}

#[cfg(target_arch = "wasm32")]
fn set_anchor_fields(
    engine: &mut BreditorEngine,
    expected: &BreditorObservation,
    anchor_kind: &JsValue,
    anchor_node_index: &JsValue,
    anchor_offset: &JsValue,
    anchor_affinity: &JsValue,
) -> BreditorCommandResult {
    engine.set_range_selection(
        expected,
        anchor_kind,
        anchor_node_index,
        anchor_offset,
        anchor_affinity,
        &JsValue::from_str("children"),
        &JsValue::from_f64(1.0),
        &JsValue::from_f64(0.0),
        &JsValue::from_str("after"),
    )
}

#[cfg(target_arch = "wasm32")]
fn require_selection(result: &mut BreditorSelectionResult) -> TestResult<BreditorSelection> {
    result.take_selection().ok_or_else(|| test_error("selection result had no selection").into())
}

fn require_string(mut result: BreditorStringResult) -> TestResult<String> {
    assert_eq!(result.status(), "value");
    let value = result.take_value().ok_or_else(|| test_error("string result had no value"))?;
    assert_eq!(result.status(), "taken");
    Ok(value)
}

fn assert_document_json_is_canonical(json: &str) -> TestResult {
    let context = EditorContext::default();
    let codec =
        DocumentJsonCodec::new(context.schema().clone()).with_limits(context.limits().clone());
    let document = codec.decode(json)?;
    assert_eq!(codec.encode(&document)?, json);
    Ok(())
}

fn assert_string_error(result: &mut BreditorStringResult, code: &str, private: &str) -> TestResult {
    assert_eq!(result.status(), "error");
    assert!(result.value().is_none());
    assert!(result.take_value().is_none());
    assert_eq!(result.status(), "error");
    let first = result.error().ok_or_else(|| test_error("string result had no error"))?;
    let second = result.error().ok_or_else(|| test_error("string result lost its error"))?;
    assert_eq!(first.code(), code);
    assert_eq!(second.code(), code);
    assert_eq!(first.message(), second.message());
    assert!(!first.message().contains(private));
    Ok(())
}

fn assert_engine_error(result: &BreditorEngineResult, code: &str, private: &str) -> TestResult {
    assert_eq!(result.status(), "error");
    let error = result.error().ok_or_else(|| test_error("engine result had no error"))?;
    assert_eq!(error.code(), code);
    assert!(!error.message().contains(private));
    Ok(())
}

fn assert_command_error(result: &BreditorCommandResult, code: &str, private: &str) -> TestResult {
    assert_eq!(result.status(), "error");
    assert!(result.observation().is_none());
    assert!(result.event_kind().is_none());
    assert!(result.disabled_action_id().is_none());
    assert_eq!(result.commit_json().status(), "absent");
    let error = result.error().ok_or_else(|| test_error("command result had no error"))?;
    assert_eq!(error.code(), code);
    assert!(!error.message().contains(private));
    Ok(())
}

fn test_error(message: impl Into<String>) -> io::Error {
    io::Error::other(message.into())
}
