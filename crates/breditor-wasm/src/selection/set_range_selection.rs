use breditor_core::selection::RangeSelection;
use wasm_bindgen::prelude::{JsValue, wasm_bindgen};

use crate::{BreditorCommandResult, BreditorEngine, BreditorError, BreditorObservation};

use super::scalar_input::point_from_js_scalars;

#[wasm_bindgen]
impl BreditorEngine {
    /// Publishes one directional range selection from exact scalar coordinates.
    ///
    /// The complete observation is checked before untrusted scalar admission and
    /// checked again by the checkpoint-constrained authoritative mutation. Node
    /// indexes address the current document's deterministic preorder projection.
    /// Raw [`JsValue`] inputs are intentional: generated TypeScript still exposes
    /// closed string literals and numbers, while Rust rejects JavaScript wrapper
    /// objects and other values that `f64` or `&str` glue would coerce first.
    #[allow(clippy::too_many_arguments)]
    #[wasm_bindgen(js_name = setRangeSelection)]
    pub fn set_range_selection(
        &mut self,
        expected: &BreditorObservation,
        #[wasm_bindgen(unchecked_param_type = "BreditorSelectionPointKind")] anchor_kind: &JsValue,
        #[wasm_bindgen(unchecked_param_type = "number")] anchor_node_index: &JsValue,
        #[wasm_bindgen(unchecked_param_type = "number")] anchor_offset: &JsValue,
        #[wasm_bindgen(unchecked_param_type = "BreditorSelectionAffinity")]
        anchor_affinity: &JsValue,
        #[wasm_bindgen(unchecked_param_type = "BreditorSelectionPointKind")] focus_kind: &JsValue,
        #[wasm_bindgen(unchecked_param_type = "number")] focus_node_index: &JsValue,
        #[wasm_bindgen(unchecked_param_type = "number")] focus_offset: &JsValue,
        #[wasm_bindgen(unchecked_param_type = "BreditorSelectionAffinity")]
        focus_affinity: &JsValue,
    ) -> BreditorCommandResult {
        set_range_selection_with_admission(self, expected, |document| {
            let anchor = point_from_js_scalars(
                document,
                anchor_kind,
                anchor_node_index,
                anchor_offset,
                anchor_affinity,
            )?;
            let focus = point_from_js_scalars(
                document,
                focus_kind,
                focus_node_index,
                focus_offset,
                focus_affinity,
            )?;
            Ok(RangeSelection::new(anchor, focus))
        })
    }
}

fn set_range_selection_with_admission(
    engine: &mut BreditorEngine,
    expected: &BreditorObservation,
    admit: impl FnOnce(&breditor_core::document::Document) -> Result<RangeSelection, BreditorError>,
) -> BreditorCommandResult {
    if let Err(error) = engine.inner.check_observation(expected.inner()) {
        return BreditorCommandResult::from_error(BreditorError::checkpointed_engine(&error));
    }
    let selection = match admit(engine.inner.state().document()) {
        Ok(selection) => selection,
        Err(error) => return BreditorCommandResult::from_error(error),
    };
    publish_range_selection(engine, expected, selection)
}

fn publish_range_selection(
    engine: &mut BreditorEngine,
    expected: &BreditorObservation,
    selection: RangeSelection,
) -> BreditorCommandResult {
    match engine.inner.set_selection(expected.inner(), Some(selection.into())) {
        Ok(event) => BreditorCommandResult::from_optional_event(event, engine.inner.observation()),
        Err(error) => BreditorCommandResult::from_error(BreditorError::checkpointed_engine(&error)),
    }
}

#[cfg(test)]
mod tests {
    use std::{cell::Cell, error::Error, io};

    use breditor_core::selection::RangeSelection;

    use crate::{BreditorEngine, BreditorError};

    use super::set_range_selection_with_admission;
    use crate::selection::scalar_input::point_from_scalars;

    type TestResult = Result<(), Box<dyn Error>>;

    const EMOJI_DOCUMENT_JSON: &str = r#"{
      "format":"breditor/document","formatVersion":1,
      "schema":{"name":"breditor/base","version":1},
      "root":{"kind":"element","type":"breditor/document","entityId":null,"properties":{},
        "children":[{"kind":"element","type":"breditor/paragraph","entityId":null,
          "properties":{},"children":[{"kind":"text","text":"a😀b","formats":[]}]}]}
    }"#;

    #[test]
    fn native_selection_pipeline_is_guarded_exact_and_atomic() -> TestResult {
        let mut factory =
            BreditorEngine::from_document_json("native-selection", EMOJI_DOCUMENT_JSON, 100.0);
        let mut engine = factory
            .take_engine()
            .ok_or_else(|| io::Error::other("selection fixture engine was absent"))?;
        let initial = engine.observation();
        let checkpoint_before = checkpoint_json(&engine)?;

        let invalid = set_range_selection_with_admission(&mut engine, &initial, |document| {
            let point = point_from_scalars(document, "text", 2.0, 2.0, "after")?;
            Ok(RangeSelection::new(point.clone(), point))
        });
        assert_eq!(invalid.status(), "error");
        assert!(
            invalid.error().is_some_and(|error| error.code() == "editor_engine.selection_update")
        );
        assert_eq!(checkpoint_json(&engine)?, checkpoint_before);

        let valid = set_range_selection_with_admission(&mut engine, &initial, |document| {
            let anchor = point_from_scalars(document, "text", 2.0, 3.0, "after")?;
            let focus = point_from_scalars(document, "text", 2.0, 3.0, "before")?;
            Ok(RangeSelection::new(anchor, focus))
        });
        assert_eq!(valid.status(), "committed");
        let current = valid
            .observation()
            .ok_or_else(|| io::Error::other("selection commit observation was absent"))?;
        let checkpoint_after_commit = checkpoint_json(&engine)?;

        let echo = set_range_selection_with_admission(&mut engine, &current, |document| {
            let anchor = point_from_scalars(document, "text", 2.0, 3.0, "after")?;
            let focus = point_from_scalars(document, "text", 2.0, 3.0, "before")?;
            Ok(RangeSelection::new(anchor, focus))
        });
        assert_eq!(echo.status(), "unchanged");
        assert_eq!(checkpoint_json(&engine)?, checkpoint_after_commit);

        let admission_called = Cell::new(false);
        let stale = set_range_selection_with_admission(&mut engine, &initial, |_| {
            admission_called.set(true);
            Err(BreditorError::new("private.invalid", "private invalid payload"))
        });
        assert!(!admission_called.get());
        assert_eq!(stale.status(), "error");
        assert!(stale.error().is_some_and(|error| error.code() == "editor_engine.stale_snapshot"));
        assert_eq!(checkpoint_json(&engine)?, checkpoint_after_commit);
        Ok(())
    }

    fn checkpoint_json(engine: &BreditorEngine) -> Result<String, io::Error> {
        engine
            .session_checkpoint_json()
            .take_value()
            .ok_or_else(|| io::Error::other("checkpoint JSON was absent"))
    }
}
