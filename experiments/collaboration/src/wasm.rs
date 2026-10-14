//! Matching Rust implementation for browser feasibility checks, not JS CRDT state.

use crate::{
    Error,
    actions::Command,
    anchor::{Affinity, TextAnchor},
    session::Session,
};
use wasm_bindgen::prelude::*;

fn js_error(error: impl std::fmt::Display) -> JsValue {
    JsValue::from_str(&error.to_string())
}

fn checked_offset(value: &JsValue) -> Result<u32, JsValue> {
    let number = value.as_f64().ok_or_else(|| js_error(Error::Offset))?;
    if !number.is_finite() || number.fract() != 0.0 || number < 0.0 || number > f64::from(u32::MAX)
    {
        return Err(js_error(Error::Offset));
    }
    // Parse after the exact numeric checks; no wasm-bindgen u32 coercion, casts,
    // silent wraparound, string/boolean/null conversion or saturation.
    number.to_string().parse::<u32>().map_err(|_| js_error(Error::Offset))
}

/// Run closed fixture admission through the same rich geometry used by Rust.
#[wasm_bindgen]
pub fn resolve_geometry(input: &str) -> Result<String, JsValue> {
    crate::rich_fixture::resolve_geometry(input).map_err(js_error)
}

/// Classify an upload binding without authoring content or resurrecting nodes.
#[wasm_bindgen]
pub fn classify_upload(input: &str) -> Result<String, JsValue> {
    crate::rich_fixture::classify_upload(input).map_err(js_error)
}

/// Exact binding of the research rich AST fixture schema.
#[wasm_bindgen]
pub fn rich_ast_binding() -> Result<String, JsValue> {
    crate::rich_ast_fixture::binding().map_err(js_error)
}

/// Run bounded rich AST admission and typed identity/geometry reads in Rust.
#[wasm_bindgen]
pub fn admit_rich_ast(input: &str) -> Result<String, JsValue> {
    crate::rich_ast_fixture::admit(input).map_err(js_error)
}

/// Execute the real Rust local action group and its exact inverse/redo fixture.
#[wasm_bindgen]
pub fn exercise_rich_actions(input: &str) -> Result<String, JsValue> {
    crate::rich_ast_fixture::exercise_actions(input).map_err(js_error)
}

/// Run real table axis actions, selection mapping and exact undo/redo in Rust.
#[wasm_bindgen]
pub fn exercise_table_axes(input: &str) -> Result<String, JsValue> {
    crate::table_axis_fixture::exercise(input).map_err(js_error)
}

/// Run whole table/image, move, merge/split, header and caption actions in Rust.
#[wasm_bindgen]
pub fn exercise_rich_features(input: &str) -> Result<String, JsValue> {
    crate::feature_action_fixture::exercise(input).map_err(js_error)
}

/// Run mixed rich typing/formatting/structure and saved-selection history in Rust.
#[wasm_bindgen]
pub fn exercise_rich_local_session(input: &str) -> Result<String, JsValue> {
    crate::rich_local_fixture::exercise(input).map_err(js_error)
}

/// Run rich paragraph/list/media history and pending caret formatting in Rust.
#[wasm_bindgen]
pub fn exercise_rich_flow(input: &str) -> Result<String, JsValue> {
    crate::rich_flow_fixture::exercise(input).map_err(js_error)
}

/// Replay-admit a native rich checkpoint and verify future undo/redo at every cursor.
#[wasm_bindgen]
pub fn exercise_rich_restore(input: &str) -> Result<String, JsValue> {
    crate::rich_recovery_fixture::exercise(input).map_err(js_error)
}

/// Run rich multicell paste/clear and source-preserving merge geometry in Rust.
#[wasm_bindgen]
pub fn exercise_rich_paste(input: &str) -> Result<String, JsValue> {
    crate::rich_paste_fixture::exercise(input).map_err(js_error)
}

/// Resolve a bounded research selection fixture against its admitted rich AST.
#[wasm_bindgen]
pub fn resolve_rich_selection(input: &str, selection: &str) -> Result<String, JsValue> {
    crate::table_axis_fixture::resolve_selection(input, selection).map_err(js_error)
}

#[wasm_bindgen]
pub struct ProbeSession {
    inner: Session,
}

#[wasm_bindgen]
impl ProbeSession {
    #[wasm_bindgen(constructor)]
    pub fn new(document: String, writer: String) -> Result<ProbeSession, JsValue> {
        Ok(Self { inner: Session::new(document, writer).map_err(js_error)? })
    }

    pub fn restore(checkpoint: &str) -> Result<ProbeSession, JsValue> {
        Ok(Self { inner: Session::restore(checkpoint).map_err(js_error)? })
    }

    pub fn apply(&mut self, commands: &str) -> Result<(), JsValue> {
        if commands.len() > 1024 * 1024 {
            return Err(js_error(Error::Limit("command JSON bytes")));
        }
        let commands: Vec<Command> = serde_json::from_str(commands).map_err(js_error)?;
        self.inner.apply(commands).map_err(js_error)
    }

    pub fn receive(&mut self, bytes: &[u8]) -> Result<(), JsValue> {
        self.inner.receive(bytes.to_vec()).map_err(js_error)
    }

    pub fn undo(&mut self) -> Result<bool, JsValue> {
        self.inner.undo().map_err(js_error)
    }
    pub fn redo(&mut self) -> Result<bool, JsValue> {
        self.inner.redo().map_err(js_error)
    }
    pub fn updates(&self) -> Result<Vec<u8>, JsValue> {
        self.inner.updates().map_err(js_error)
    }
    pub fn checkpoint(&self) -> Result<String, JsValue> {
        self.inner.checkpoint().map_err(js_error)
    }
    pub fn view(&self) -> String {
        self.inner.view().to_string()
    }
    pub fn version(&self) -> String {
        self.inner.version().to_string()
    }
    pub fn body(&self) -> String {
        self.inner.body()
    }
    pub fn undo_count(&self) -> u32 {
        u32::try_from(self.inner.undo_count()).unwrap_or(u32::MAX)
    }
    pub fn redo_count(&self) -> u32 {
        u32::try_from(self.inner.redo_count()).unwrap_or(u32::MAX)
    }

    pub fn set_selection(&mut self, anchor: &JsValue, focus: &JsValue) -> Result<(), JsValue> {
        self.inner
            .set_body_selection(checked_offset(anchor)?, checked_offset(focus)?)
            .map_err(js_error)
    }

    pub fn selection(&self) -> Result<String, JsValue> {
        serde_json::to_string(&self.inner.selection_offsets().map_err(js_error)?).map_err(js_error)
    }

    pub fn anchor(&self, offset: &JsValue, before: &JsValue) -> Result<String, JsValue> {
        let offset = checked_offset(offset)?;
        let before =
            before.as_bool().ok_or_else(|| js_error(Error::Contract("anchor affinity boolean")))?;
        let anchor = self
            .inner
            .body_anchor(offset, if before { Affinity::Before } else { Affinity::After })
            .map_err(js_error)?;
        serde_json::to_string(&anchor).map_err(js_error)
    }

    pub fn resolve_anchor(&self, serialized: &str) -> Result<u32, JsValue> {
        if serialized.len() > 4096 {
            return Err(js_error(Error::Limit("anchor JSON bytes")));
        }
        let anchor: TextAnchor = serde_json::from_str(serialized).map_err(js_error)?;
        self.inner.resolve_body_anchor(&anchor).map_err(js_error)
    }
}
